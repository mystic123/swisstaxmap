/**
 * UI components: detail panel, comparison, ranking table.
 */
const UI = (() => {
  let muniData = {};
  let allResults = {};
  let comparison = []; // [{bfs, result}]
  let rankingSortKey = "total";
  let rankingSortAsc = true;
  let cantonFilter = "";
  let searchFilter = "";

  function init(municipalitiesData) {
    muniData = municipalitiesData;
    setupRankingSort();
    setupFilters();
  }

  function fmt(n) {
    if (n == null) return "-";
    return Math.round(n).toLocaleString("de-CH");
  }

  function fmtPct(n) {
    if (n == null) return "-";
    return n.toFixed(1) + "%";
  }

  // --- Detail Panel ---

  function showDetail(bfs, result) {
    const panel = document.getElementById("detail-panel");
    const content = document.getElementById("detail-content");
    const info = muniData[bfs];

    if (!info || !result) {
      panel.style.display = "none";
      return;
    }

    const incomeTax = (result.IncomeTaxCanton || 0) + (result.IncomeTaxCity || 0) +
                      (result.IncomeTaxFed || 0) + (result.IncomeTaxChurch || 0);
    const wealthTax = (result.FortuneTaxCanton || 0) + (result.FortuneTaxCity || 0) +
                      (result.FortuneTaxChurch || 0);

    content.innerHTML = `
      <div class="detail-municipality">${info.name}</div>
      <div class="detail-canton">${info.canton} &middot; PLZ ${info.plz}</div>
      <div style="margin-top: 8px">
        <div class="detail-row total">
          <span>Total tax</span><span>CHF ${fmt(result.TotalTax)}</span>
        </div>
        <div class="detail-row"><span>Canton income</span><span>${fmt(result.IncomeTaxCanton)}</span></div>
        <div class="detail-row"><span>Municipal income</span><span>${fmt(result.IncomeTaxCity)}</span></div>
        <div class="detail-row"><span>Federal income</span><span>${fmt(result.IncomeTaxFed)}</span></div>
        ${result.IncomeTaxChurch ? `<div class="detail-row"><span>Church</span><span>${fmt(result.IncomeTaxChurch)}</span></div>` : ""}
        ${result.PersonalTax ? `<div class="detail-row"><span>Personal tax</span><span>${fmt(result.PersonalTax)}</span></div>` : ""}
        ${wealthTax > 0 ? `
          <div class="detail-row" style="margin-top:4px"><span>Canton wealth</span><span>${fmt(result.FortuneTaxCanton)}</span></div>
          <div class="detail-row"><span>Municipal wealth</span><span>${fmt(result.FortuneTaxCity)}</span></div>
          ${result.FortuneTaxChurch ? `<div class="detail-row"><span>Church wealth</span><span>${fmt(result.FortuneTaxChurch)}</span></div>` : ""}
        ` : ""}
        <div class="detail-row" style="margin-top:4px">
          <span>Marginal income</span><span>${fmtPct(result.MarginalTaxRate)}</span>
        </div>
        ${result.MarginalTaxRateVM ? `<div class="detail-row"><span>Marginal wealth</span><span>${fmtPct(result.MarginalTaxRateVM)}</span></div>` : ""}
        <div class="detail-row">
          <span>Effective rate</span><span>${fmtPct(result.TotalTax / ((parseInt(document.getElementById("income").value) || 0) + (parseInt(document.getElementById("income2").value) || 0) || 1) * 100)}</span>
        </div>
      </div>
    `;
    panel.style.display = "block";
    panel.dataset.bfs = bfs;
  }

  // --- Comparison ---

  function addToComparison(bfs, result) {
    if (!result) return;
    // Remove if already in comparison
    comparison = comparison.filter((c) => c.bfs !== bfs);
    comparison.push({ bfs, result });
    // Keep max 5
    if (comparison.length > 5) comparison.shift();
    renderComparison();
  }

  function renderComparison() {
    const panel = document.getElementById("comparison-panel");
    const content = document.getElementById("comparison-content");

    if (comparison.length < 2) {
      panel.style.display = comparison.length === 1 ? "block" : "none";
      if (comparison.length === 1) {
        const c = comparison[0];
        const info = muniData[c.bfs];
        content.innerHTML = `<div style="font-size:12px;color:#888">Click another municipality then "+ Compare" to compare</div>
          <div class="comparison-row"><span>${info ? info.name : c.bfs}</span><span>CHF ${fmt(c.result.TotalTax)}</span></div>`;
      }
      return;
    }

    panel.style.display = "block";
    const cheapest = Math.min(...comparison.map((c) => c.result.TotalTax));

    let html = `<div class="comparison-row header"><span>Municipality</span><span>Total Tax</span><span>vs. cheapest</span></div>`;
    for (const c of comparison) {
      const info = muniData[c.bfs];
      const diff = c.result.TotalTax - cheapest;
      const cls = diff > 0 ? "savings negative" : "savings";
      html += `<div class="comparison-row">
        <span>${info ? info.name : c.bfs}</span>
        <span>CHF ${fmt(c.result.TotalTax)}</span>
        <span class="${cls}">${diff > 0 ? "+" : ""}${fmt(diff)}</span>
      </div>`;
    }
    content.innerHTML = html;
  }

  function clearComparison() {
    comparison = [];
    document.getElementById("comparison-panel").style.display = "none";
  }

  // --- Ranking Table ---

  function updateRanking(results) {
    allResults = results;
    renderRanking();
  }

  function renderRanking() {
    const body = document.getElementById("ranking-body");
    const countEl = document.getElementById("ranking-count");

    // Build sortable list
    const totalInc = (parseInt(document.getElementById("income").value) || 0) +
                     (parseInt(document.getElementById("income2").value) || 0) || 1;
    // Use NETTO_VM from budget panel if detailed mode is on, else the form wealth field
    const budgetVmInput = document.querySelector('#deductions-fields input[data-ident="NETTO_VM"]');
    const totalWlt = (budgetVmInput ? parseInt(budgetVmInput.value) : null) ||
                     parseInt(document.getElementById("wealth").value) || 1;

    let rows = [];
    for (const bfs in allResults) {
      const r = allResults[bfs];
      if (!r || r.TotalTax == null) continue;
      const info = muniData[bfs] || {};
      const incomeTax = (r.IncomeTaxCanton || 0) + (r.IncomeTaxCity || 0) +
                        (r.IncomeTaxFed || 0) + (r.IncomeTaxChurch || 0) + (r.PersonalTax || 0);
      const wealthTax = (r.FortuneTaxCanton || 0) + (r.FortuneTaxCity || 0) +
                        (r.FortuneTaxChurch || 0);
      rows.push({
        bfs,
        name: info.name || bfs,
        canton: info.canton || "?",
        total: r.TotalTax,
        income: incomeTax,
        wealth: wealthTax,
        effRate: r.TotalTax / totalInc * 100,
        effIncome: incomeTax / totalInc * 100,
        effWealth: totalWlt > 0 ? wealthTax / totalWlt * 100 : 0,
        marginal: r.MarginalTaxRate || 0,
      });
    }

    // Filter
    if (cantonFilter) {
      rows = rows.filter((r) => r.canton === cantonFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

    // Sort
    rows.sort((a, b) => {
      let va = a[rankingSortKey];
      let vb = b[rankingSortKey];
      if (typeof va === "string") {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }
      if (va < vb) return rankingSortAsc ? -1 : 1;
      if (va > vb) return rankingSortAsc ? 1 : -1;
      return 0;
    });

    countEl.textContent = `(${rows.length})`;

    // Render (cap at 500 for performance)
    const display = rows.slice(0, 500);

    body.innerHTML = display
      .map(
        (r, i) => `<tr data-bfs="${r.bfs}">
        <td>${i + 1}</td>
        <td>${r.name}</td>
        <td>${r.canton}</td>
        <td>CHF ${fmt(r.total)}</td>
        <td>${fmt(r.income)}</td>
        <td>${fmt(r.wealth)}</td>
        <td>${r.effRate.toFixed(1)}%</td>
        <td>${r.effIncome.toFixed(1)}%</td>
        <td>${r.effWealth.toFixed(2)}%</td>
        <td>${r.marginal.toFixed(1)}%</td>
      </tr>`
      )
      .join("");

    // Click handler for rows
    body.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        const bfs = tr.dataset.bfs;
        TaxMap.highlightMunicipality(bfs);
      });
    });
  }

  function setupRankingSort() {
    document.querySelectorAll("#ranking-table th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (rankingSortKey === key) {
          rankingSortAsc = !rankingSortAsc;
        } else {
          rankingSortKey = key;
          rankingSortAsc = key === "name" || key === "canton";
        }
        // Update header classes
        document.querySelectorAll("#ranking-table th").forEach((h) => {
          h.classList.remove("sorted-asc", "sorted-desc");
        });
        th.classList.add(rankingSortAsc ? "sorted-asc" : "sorted-desc");
        renderRanking();
      });
    });
  }

  function setupFilters() {
    document.getElementById("canton-filter").addEventListener("change", (e) => {
      cantonFilter = e.target.value;
      renderRanking();
    });
    document.getElementById("ranking-search").addEventListener("input", (e) => {
      searchFilter = e.target.value;
      renderRanking();
    });
  }

  function populateCantonFilter(muniData) {
    const cantons = new Set();
    for (const bfs in muniData) cantons.add(muniData[bfs].canton);
    const sorted = [...cantons].sort();
    const select = document.getElementById("canton-filter");
    for (const c of sorted) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    }
  }

  return {
    init,
    showDetail,
    addToComparison,
    clearComparison,
    updateRanking,
    renderRanking,
    populateCantonFilter,
  };
})();
