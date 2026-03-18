/**
 * Bootstrap: load data, init map, wire events.
 */
(async function main() {
  let muniData = {};
  let topoData = null;
  let currentResults = {};

  // --- Load data ---
  let climateData = {};
  let travelData = {};
  try {
    const [topoResp, muniResp, climateResp, travelResp] = await Promise.all([
      fetch("data/ch-municipalities.topojson"),
      fetch("data/municipalities.json"),
      fetch("data/climate.json"),
      fetch("data/travel.json"),
    ]);
    topoData = await topoResp.json();
    muniData = await muniResp.json();
    climateData = await climateResp.json();
    travelData = await travelResp.json();
  } catch (err) {
    const errDiv = document.createElement("div");
    errDiv.style.cssText = "padding:40px;color:#d63031";
    errDiv.textContent = `Failed to load map data: ${err.message}`;
    document.getElementById("map").appendChild(errDiv);
    return;
  }

  // --- Init components ---
  TaxMap.init(topoData, muniData, climateData, travelData, onMunicipalitySelect);
  UI.init(muniData);
  UI.populateCantonFilter(muniData);
  populateCalcCantonFilter(muniData);

  // --- Partner fields toggle ---
  const statusSelect = document.getElementById("status");
  statusSelect.addEventListener("change", togglePartnerFields);
  togglePartnerFields();

  // --- Restore form state (after statusSelect is defined) ---
  const savedForm = Cache.loadFormState();
  if (savedForm) restoreFormState(savedForm);

  // --- Form submit ---
  document.getElementById("tax-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await runCalculation();
  });

  // --- Compare button ---
  document.getElementById("compare-btn").addEventListener("click", () => {
    const bfs = document.getElementById("detail-panel").dataset.bfs;
    if (bfs && currentResults[bfs]) {
      UI.addToComparison(bfs, currentResults[bfs]);
    }
  });

  // --- Clear comparison ---
  document.getElementById("clear-comparison-btn").addEventListener("click", () => {
    UI.clearComparison();
  });

  // --- Cancel button ---
  document.getElementById("cancel-btn").addEventListener("click", () => {
    Calculator.cancel();
  });

  // --- Cache reset (clears all API-derived data, keeps form inputs) ---
  document.getElementById("reset-cache-btn").addEventListener("click", async () => {
    if (!confirm("Clear all cached API results (server + browser)?")) return;
    // Clear browser localStorage result cache (but keep form state + budget values + toggle)
    Cache.clearResults();
    // Clear server SQLite cache
    try { await fetch("/api/clear-cache", { method: "POST" }); } catch {}
    alert("Cache cleared. Next calculation will re-fetch from ESTV API.");
  });

  // --- Map color mode ---
  document.getElementById("color-mode-select").addEventListener("change", (e) => {
    TaxMap.setColorMode(e.target.value);
  });

  // --- Detailed calculation toggle ---
  let budgetItems = null;
  const detailedToggle = document.getElementById("detailed-toggle");
  detailedToggle.addEventListener("change", async () => {
    const panel = document.getElementById("deductions-panel");
    if (detailedToggle.checked) {
      panel.style.display = "block";
      await loadBudgetItems();
    } else {
      panel.style.display = "none";
      budgetItems = null;
    }
    try { localStorage.setItem("tax_detailed_on", detailedToggle.checked ? "1" : ""); } catch {}
  });

  // Restore detailed toggle state
  if (localStorage.getItem("tax_detailed_on") === "1") {
    detailedToggle.checked = true;
    document.getElementById("deductions-panel").style.display = "block";
    loadBudgetItems();
  }

  // --- Functions ---

  function togglePartnerFields() {
    const hasPartner = ["2", "3"].includes(statusSelect.value);
    document.querySelectorAll(".partner-fields").forEach((el) => {
      el.style.display = hasPartner ? "flex" : "none";
    });
  }

  function onMunicipalitySelect(bfs, result) {
    UI.showDetail(bfs, result);
  }

  async function runCalculation() {
    const formData = Calculator.getFormData();
    formData.budget = getBudgetFromForm();
    Cache.saveFormState(formData);
    if (detailedToggle.checked) saveBudgetValues();

    const btn = document.getElementById("calculate-btn");
    const progressContainer = document.getElementById("progress-container");
    const progressFill = document.getElementById("progress-fill");
    const progressText = document.getElementById("progress-text");

    btn.disabled = true;
    progressContainer.style.display = "flex";
    progressFill.style.width = "0%";
    currentResults = {};

    const startTime = Date.now();

    const results = await Calculator.calculateAll(
      formData,
      muniData,
      (done, total, bfs, result) => {
        const pct = ((done / total) * 100).toFixed(1);
        progressFill.style.width = pct + "%";
        progressText.textContent = `${done} / ${total}`;

        // Update map incrementally
        if (result) {
          currentResults[bfs] = result;
          TaxMap.updateSingle(bfs, result);
        }

        // Update ranking periodically (every 100 results)
        if (done % 100 === 0 || done === total) {
          UI.updateRanking(currentResults);
        }
      }
    );

    // Final update
    currentResults = {};
    for (const bfs in results) {
      if (results[bfs]) currentResults[bfs] = results[bfs];
    }

    TaxMap.recolorAll();
    UI.updateRanking(currentResults);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    progressText.textContent = `Done in ${elapsed}s`;
    btn.disabled = false;
  }

  function populateCalcCantonFilter(muniData) {
    const cantons = new Set();
    for (const bfs in muniData) cantons.add(muniData[bfs].canton);
    const sorted = [...cantons].sort();

    const menu = document.getElementById("canton-dropdown-menu");
    const toggle = document.getElementById("canton-dropdown-toggle");

    // "All" checkbox
    const allLabel = document.createElement("label");
    allLabel.className = "select-all";
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = true;
    allCb.dataset.canton = "__all__";
    allLabel.append(allCb, " All cantons");
    menu.appendChild(allLabel);

    // Individual canton checkboxes
    for (const c of sorted) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.canton = c;
      label.append(cb, ` ${c}`);
      menu.appendChild(label);
    }

    // Toggle dropdown open/close
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!document.getElementById("canton-dropdown").contains(e.target)) {
        menu.classList.remove("open");
      }
    });

    // "All" checkbox logic
    allCb.addEventListener("change", () => {
      menu.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.dataset.canton !== "__all__") cb.checked = false;
      });
      allCb.checked = true;
      updateToggleLabel();
    });

    // Individual canton checkbox logic
    menu.querySelectorAll('input[data-canton]:not([data-canton="__all__"])').forEach((cb) => {
      cb.addEventListener("change", () => {
        const anyChecked = [...menu.querySelectorAll('input[data-canton]:not([data-canton="__all__"])')].some((c) => c.checked);
        allCb.checked = !anyChecked;
        updateToggleLabel();
      });
    });

    function updateToggleLabel() {
      if (allCb.checked) {
        toggle.textContent = "All cantons";
        return;
      }
      const selected = [...menu.querySelectorAll('input[data-canton]:not([data-canton="__all__"]):checked')]
        .map((cb) => cb.dataset.canton);
      toggle.textContent = selected.length ? selected.join(", ") : "All cantons";
      if (selected.length === 0) allCb.checked = true;
    }
  }

  const TOOLTIPS = {
    BRUTTOLOHN_P1: "Gross salary (taxpayer 1). Auto-filled from income field.",
    BRUTTOLOHN_P2: "Gross salary (taxpayer 2). Auto-filled from partner income.",
    BEITRAG_AIO_P1: "OASI/DI/APG contributions (AHV/IV/EO). Auto-calculated at 5.3% of gross.",
    BEITRAG_AIO_P2: "OASI/DI/APG contributions (AHV/IV/EO) for partner. Auto-calculated at 5.3%.",
    BEITRAG_ALV_P1: "Unemployment insurance (ALV). Auto-calculated at 1.1% of gross, max CHF 148'200.",
    BEITRAG_ALV_P2: "Unemployment insurance (ALV) for partner. Auto-calculated at 1.1%.",
    BEITRAG_NBU_P1: "Non-occupational accident insurance (NBU). Auto-calculated ~0.4% of gross.",
    BEITRAG_NBU_P2: "Non-occupational accident insurance (NBU) for partner.",
    BEITRAG_BVG_P1: "Pension fund (BVG/2nd pillar). Auto-calculated based on age and income.",
    BEITRAG_BVG_P2: "Pension fund (BVG/2nd pillar) for partner.",
    NETTOLOHN_P1: "Net salary after social insurance deductions. Computed automatically.",
    NETTOLOHN_P2: "Net salary for partner after social insurance deductions.",
    NEBENERWERB_P1: "Net income from secondary employment (side job, freelance).",
    NEBENERWERB_P2: "Net secondary employment income for partner.",
    MIETERTRAG: "Imputed rental value if you own and live in your home, plus any rental income from property you own (excluding ancillary costs). Enter 0 if renting.",
    UEBRIGESEK: "Other taxable income not entered elsewhere (e.g. alimony received, lottery winnings).",
    VMERTRAEGE: "Investment income: savings interest, dividends, bond coupons. Only realized gains, not unrealized.",
    BETEILIGUNG: "Subset of investment income from qualified participations (≥10% ownership or market value ≥CHF 1M). Subject to partial taxation (50-70% depending on canton).",
    KKPRAEMIEN: "Total annual insurance premiums for ALL family members: basic health (KVG), supplementary/private (VVG), accident, life insurance, plus interest on savings capital. The cantonal deduction cap is applied automatically. Default assumes CHF 380/month per adult + CHF 100/month per child under 18.",
    IPVEXTRA: "Individual premium reduction (IPV/IPE) — government subsidy for health insurance. Enter the amount if you receive it; reduces the insurance deduction.",
    PRAEMIEN3A: "Total pillar 3a contributions by BOTH taxpayers combined. 2025 max: CHF 7'056 per employed person (CHF 14'112 for a couple both employed). Deducted from taxable income.",
    VERPFLEGUNG_P1: "Meal costs at workplace (no subsidized canteen). Typically CHF 15/day for days physically in office. Only for employed income types.",
    VERPFLEGUNG_P2: "Meal costs for partner at workplace. CHF 15/day for office days without subsidized canteen.",
    FAHRKOSTEN_P1: "Commuting costs between residence and workplace. Enter actual public transport cost or car allowance (CHF 0.70/km, capped). Federal cap: CHF 3'000; cantonal varies.",
    FAHRKOSTEN_P2: "Partner's commuting costs. Same rules as taxpayer 1.",
    BERUFSKOSTEN_P1: "Other professional expenses (work tools, professional literature, home office). Enter actual amount or leave 0 for system flat-rate deduction (3% of net salary, min CHF 2'000, max CHF 4'000).",
    BERUFSKOSTEN_P2: "Partner's other professional expenses. Same rules.",
    BERUFSAUSLAGEN_NE_P1: "Professional expenses for secondary occupation. Flat-rate or actual.",
    BERUFSAUSLAGEN_NE_P2: "Partner's professional expenses for secondary occupation.",
    MIETAUSGABEN: "Annual rent expenses. ONLY relevant for cantons VD and ZG — ignored elsewhere. Default: 25% of income. Enter 0 if you have no rent or own your home.",
    SCHULDZINSEN: "Interest on debts (mortgage, loans, building rights). Max deductible = investment income + CHF 50'000. Reduces taxable income significantly if you have a mortgage.",
    IMMOUNTERHALT: "Property maintenance costs. Flat-rate (typically 10-20% of rental value) or actual costs. Assumes building >10 years old (VD: >20 years). Only if you own property.",
    UEBRIGEABZUEGE: "Other deductions: alimony/child support paid, unreimbursed medical costs exceeding threshold, charitable donations (up to 20% of net income), disability-related costs.",
    NETTO_VM: "Net wealth: total assets (bank accounts, securities, property, vehicles, art, crypto) minus total debts (mortgage, loans). Taxed annually by canton and municipality.",
  };

  async function loadBudgetItems() {
    const loading = document.getElementById("deductions-loading");
    const fieldsContainer = document.getElementById("deductions-fields");
    loading.style.display = "block";
    fieldsContainer.innerHTML = "";
    const savedBudget = loadSavedBudget();

    try {
      // Use Zürich as reference municipality for default deduction values
      const formData = Calculator.getFormData();
      const refLocationId = 800100000; // Zürich 8001
      budgetItems = await TaxAPI.getTaxBudget({
        ...formData,
        taxLocationId: refLocationId,
      });

      // Group by Main: 1=Income, 2=Deductions, 3=Wealth
      const groups = { 1: [], 2: [], 3: [] };
      for (const item of budgetItems) {
        const g = groups[item.Main] || [];
        g.push(item);
        groups[item.Main] = g;
      }

      const groupNames = { 1: "Income", 2: "Deductions", 3: "Wealth" };

      for (const [main, items] of Object.entries(groups)) {
        if (items.length === 0) continue;
        const groupDiv = document.createElement("div");
        groupDiv.className = "deduction-group";

        const title = document.createElement("div");
        title.className = "deduction-group-title";
        title.textContent = groupNames[main];
        groupDiv.appendChild(title);

        for (const item of items) {
          const row = document.createElement("div");
          row.className = "deduction-row" + (item.Show ? "" : " readonly");

          const tooltip = TOOLTIPS[item.Ident] || "";
          const labelText = item.Name.EN || item.Name.DE || item.Ident;

          const label = document.createElement("label");
          if (tooltip) {
            const span = document.createElement("span");
            span.className = "info-icon";
            span.textContent = "i";
            label.append(document.createTextNode(labelText + " "), span);
            tippy(span, {
              content: tooltip,
              placement: "right",
              maxWidth: 280,
              interactive: false,
              appendTo: document.body,
            });
          } else {
            label.textContent = labelText;
          }

          const input = document.createElement("input");
          input.type = "number";
          input.dataset.ident = item.Ident;
          input.readOnly = !item.Show;
          if (!item.Show) input.tabIndex = -1;

          // Restore saved value or use API default
          const saved = savedBudget[item.Ident];
          input.value = saved != null ? saved : item.Value;

          // Auto-save on change
          if (item.Show) {
            input.addEventListener("change", saveBudgetValues);
          }

          row.append(label, input);
          groupDiv.appendChild(row);
        }

        fieldsContainer.appendChild(groupDiv);
      }
    } catch (err) {
      const errDiv = document.createElement("div");
      errDiv.style.cssText = "color:#d63031;font-size:12px";
      errDiv.textContent = `Failed to load deductions: ${err.message}`;
      fieldsContainer.appendChild(errDiv);
    }
    loading.style.display = "none";
  }

  function saveBudgetValues() {
    const inputs = document.querySelectorAll("#deductions-fields input[data-ident]");
    const values = {};
    inputs.forEach((input) => {
      if (!input.readOnly) {
        values[input.dataset.ident] = parseInt(input.value, 10) || 0;
      }
    });
    try { localStorage.setItem("tax_budget_values", JSON.stringify(values)); } catch {}
  }

  function loadSavedBudget() {
    try {
      const raw = localStorage.getItem("tax_budget_values");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function getBudgetFromForm() {
    if (!detailedToggle.checked || !budgetItems) return [];
    const inputs = document.querySelectorAll("#deductions-fields input[data-ident]");
    return Array.from(inputs).map((input) => ({
      Ident: input.dataset.ident,
      Value: parseInt(input.value, 10) || 0,
    }));
  }

  function restoreFormState(state) {
    const fields = {
      "tax-year": "taxYear",
      income: "income",
      "income-type": "revenueType",
      age: "age",
      status: "relationship",
      religion: "confession",
      wealth: "wealth",
      income2: "income2",
      age2: "age2",
    };
    for (const [elId, key] of Object.entries(fields)) {
      const el = document.getElementById(elId);
      if (el && state[key] != null) el.value = state[key];
    }
    if (state.children && state.children.length) {
      document.getElementById("children").value = state.children.join(", ");
    }
    togglePartnerFields();
  }
})();
