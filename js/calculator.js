/**
 * Batch calculator with concurrency control and progress reporting.
 * Pushes the ESTV API with high concurrency (50 parallel requests).
 */
const Calculator = (() => {
  const CONCURRENCY = 200;
  let cancelRequested = false;

  function getFormData() {
    const childrenStr = document.getElementById("children").value.trim();
    const children = childrenStr
      ? childrenStr.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : [];

    const relationship = parseInt(document.getElementById("status").value, 10);
    const hasPartner = relationship === 2 || relationship === 3;

    // Get selected cantons from checkbox dropdown
    const menu = document.getElementById("canton-dropdown-menu");
    const allChecked = menu.querySelector('input[data-canton="__all__"]');
    const selectedCantons = [];
    if (!allChecked || !allChecked.checked) {
      menu.querySelectorAll('input[data-canton]:not([data-canton="__all__"]):checked').forEach((cb) => {
        selectedCantons.push(cb.dataset.canton);
      });
    }

    return {
      taxYear: parseInt(document.getElementById("tax-year").value, 10),
      income: parseInt(document.getElementById("income").value, 10) || 0,
      revenueType: parseInt(document.getElementById("income-type").value, 10),
      age: parseInt(document.getElementById("age").value, 10) || 35,
      relationship,
      confession: parseInt(document.getElementById("religion").value, 10),
      children,
      wealth: parseInt(document.getElementById("wealth").value, 10) || 0,
      income2: hasPartner ? parseInt(document.getElementById("income2").value, 10) || 0 : 0,
      age2: hasPartner ? parseInt(document.getElementById("age2").value, 10) || 0 : 0,
      revenueType2: hasPartner ? parseInt(document.getElementById("income-type").value, 10) : 0,
      confession2: hasPartner ? parseInt(document.getElementById("religion").value, 10) : 0,
      cantons: selectedCantons, // empty = all
    };
  }

  /**
   * Filter municipalities by selected cantons.
   */
  function filterByCantons(municipalities, cantons) {
    if (!cantons || cantons.length === 0) return municipalities;
    const filtered = {};
    for (const bfs in municipalities) {
      if (cantons.includes(municipalities[bfs].canton)) {
        filtered[bfs] = municipalities[bfs];
      }
    }
    return filtered;
  }

  /**
   * Calculate tax for municipalities (optionally filtered by canton).
   * @param {Object} formData - Form parameters (includes .cantons)
   * @param {Object} municipalities - BFS → {name, canton, plz, taxLocationId}
   * @param {Function} onProgress - callback(done, total, bfsNr, result)
   * @returns {Promise<Object>} bfsNr → result
   */
  async function calculateAll(formData, municipalities, onProgress) {
    cancelRequested = false;

    // Filter by canton if selected
    const filtered = filterByCantons(municipalities, formData.cantons);
    const fHash = Cache.formHash(formData);
    const bfsNumbers = Object.keys(filtered);
    const total = bfsNumbers.length;
    const results = {};
    let done = 0;

    // Check cache first
    const uncached = [];
    for (const bfs of bfsNumbers) {
      const cached = Cache.getCached(fHash, bfs);
      if (cached) {
        results[bfs] = Cache.expandResult(cached);
        done++;
        onProgress(done, total, bfs, results[bfs]);
      } else {
        uncached.push(bfs);
      }
    }

    if (uncached.length === 0) return results;

    // Process uncached with high concurrency
    const queue = [...uncached];
    const workers = [];

    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push(runWorker());
    }

    async function runWorker() {
      while (queue.length > 0 && !cancelRequested) {
        const bfs = queue.shift();
        if (!bfs) break;
        const muni = filtered[bfs];
        try {
          const result = await TaxAPI.calculateTax({
            ...formData,
            taxLocationId: muni.taxLocationId,
          });
          results[bfs] = result;
          Cache.setCached(fHash, bfs, result);
        } catch (err) {
          console.warn(`Calc failed for ${bfs} (${muni.name}):`, err.message);
          results[bfs] = null;
        }
        done++;
        onProgress(done, total, bfs, results[bfs]);
      }
    }

    await Promise.all(workers);
    return results;
  }

  function cancel() {
    cancelRequested = true;
  }

  return { getFormData, calculateAll, cancel };
})();
