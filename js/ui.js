/**
 * UI components: detail panel, comparison, ranking table.
 */
const UI = (() => {
  let muniData = {};
  let allResults = {};
  let comparison = [];
  let rankingSortKey = "total";
  let rankingSortAsc = true;
  let cantonFilter = "";
  let searchFilter = "";
  let searchTimeout;

  function init(municipalitiesData) {
    muniData = municipalitiesData;
    setupRankingSort();
    setupFilters();
    setupRankingClickDelegation();
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

    const incomeTax = TaxUtils.sumIncomeTax(result);
    const wealthTax = TaxUtils.sumWealthTax(result);
    const totalInc = (parseInt(document.getElementById("income").value) || 0) +
                     (parseInt(document.getElementById("income2").value) || 0) || 1;

    content.innerHTML = `
      <div class="detail-municipality">${TaxUtils.esc(info.name)}</div>
      <div class="detail-canton">${TaxUtils.esc(info.canton)} &middot; PLZ ${TaxUtils.esc(info.plz)}</div>
      <div style="margin-top: 8px">
        <div class="detail-row total">
          <span>Total tax</span><span>${TaxUtils.fmtCHF(result.TotalTax)}</span>
        </div>
        <div class="detail-row"><span>Canton income</span><span>${TaxUtils.fmt(result.IncomeTaxCanton)}</span></div>
        <div class="detail-row"><span>Municipal income</span><span>${TaxUtils.fmt(result.IncomeTaxCity)}</span></div>
        <div class="detail-row"><span>Federal income</span><span>${TaxUtils.fmt(result.IncomeTaxFed)}</span></div>
        ${result.IncomeTaxChurch ? `<div class="detail-row"><span>Church</span><span>${TaxUtils.fmt(result.IncomeTaxChurch)}</span></div>` : ""}
        ${result.PersonalTax ? `<div class="detail-row"><span>Personal tax</span><span>${TaxUtils.fmt(result.PersonalTax)}</span></div>` : ""}
        ${wealthTax > 0 ? `
          <div class="detail-row" style="margin-top:4px"><span>Canton wealth</span><span>${TaxUtils.fmt(result.FortuneTaxCanton)}</span></div>
          <div class="detail-row"><span>Municipal wealth</span><span>${TaxUtils.fmt(result.FortuneTaxCity)}</span></div>
          ${result.FortuneTaxChurch ? `<div class="detail-row"><span>Church wealth</span><span>${TaxUtils.fmt(result.FortuneTaxChurch)}</span></div>` : ""}
        ` : ""}
        <div class="detail-row" style="margin-top:4px">
          <span>Marginal income</span><span>${TaxUtils.fmtPct(result.MarginalTaxRate)}</span>
        </div>
        ${result.MarginalTaxRateVM ? `<div class="detail-row"><span>Marginal wealth</span><span>${TaxUtils.fmtPct(result.MarginalTaxRateVM)}</span></div>` : ""}
        <div class="detail-row">
          <span>Effective rate</span><span>${TaxUtils.fmtPct(result.TotalTax / totalInc * 100)}</span>
        </div>
      </div>
    `;
    panel.style.display = "block";
    panel.dataset.bfs = bfs;
  }

  // --- Comparison ---

  function addToComparison(bfs, result) {
    if (!result) return;
    comparison = comparison.filter((c) => c.bfs !== bfs);
    comparison.push({ bfs, result });
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
          <div class="comparison-row"><span>${TaxUtils.esc(info ? info.name : c.bfs)}</span><span>${TaxUtils.fmtCHF(c.result.TotalTax)}</span></div>`;
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
        <span>${TaxUtils.esc(info ? info.name : c.bfs)}</span>
        <span>${TaxUtils.fmtCHF(c.result.TotalTax)}</span>
        <span class="${cls}">${diff > 0 ? "+" : ""}${TaxUtils.fmt(diff)}</span>
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

    const totalInc = (parseInt(document.getElementById("income").value) || 0) +
                     (parseInt(document.getElementById("income2").value) || 0) || 1;
    const budgetVmInput = document.querySelector('#deductions-fields input[data-ident="NETTO_VM"]');
    const totalWlt = (budgetVmInput ? parseInt(budgetVmInput.value) : null) ||
                     parseInt(document.getElementById("wealth").value) || 1;

    let rows = [];
    for (const bfs in allResults) {
      const r = allResults[bfs];
      if (!r || r.TotalTax == null) continue;
      const info = muniData[bfs] || {};
      const incomeTax = TaxUtils.sumIncomeTax(r);
      const wealthTax = TaxUtils.sumWealthTax(r);
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

    if (cantonFilter) {
      rows = rows.filter((r) => r.canton === cantonFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }

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

    const display = rows.slice(0, 500);

    body.innerHTML = display
      .map(
        (r, i) => `<tr data-bfs="${r.bfs}">
        <td>${i + 1}</td>
        <td>${TaxUtils.esc(r.name)}</td>
        <td>${TaxUtils.esc(r.canton)}</td>
        <td>CHF ${TaxUtils.fmt(r.total)}</td>
        <td>${TaxUtils.fmt(r.income)}</td>
        <td>${TaxUtils.fmt(r.wealth)}</td>
        <td>${r.effRate.toFixed(1)}%</td>
        <td>${r.effIncome.toFixed(1)}%</td>
        <td>${r.effWealth.toFixed(2)}%</td>
        <td>${r.marginal.toFixed(1)}%</td>
      </tr>`
      )
      .join("");
  }

  /** Event delegation for ranking row clicks — set up once */
  function setupRankingClickDelegation() {
    document.getElementById("ranking-body").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-bfs]");
      if (tr) TaxMap.highlightMunicipality(tr.dataset.bfs);
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
    // Debounced search
    document.getElementById("ranking-search").addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchFilter = e.target.value;
        renderRanking();
      }, 200);
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
