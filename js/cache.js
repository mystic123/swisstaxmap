/**
 * Client-side localStorage cache for form state + calculation results.
 * Server-side SQLite caching is handled by server.py.
 */
const Cache = (() => {
  const FORM_KEY = "tax_form_state";
  const RESULT_PREFIX = "tax_r_";
  const MAX_CACHE_BYTES = 4 * 1024 * 1024; // 4 MB limit (leave room in 5 MB localStorage)

  function formHash(formData) {
    const str = JSON.stringify(formData, Object.keys(formData).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
  }

  function resultKey(fHash, bfsNr) {
    return RESULT_PREFIX + fHash + "_" + bfsNr;
  }

  function getCached(fHash, bfsNr) {
    try {
      const raw = localStorage.getItem(resultKey(fHash, bfsNr));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCached(fHash, bfsNr, result) {
    try {
      const compact = {
        t: result.TotalTax,
        ic: result.IncomeTaxCanton,
        im: result.IncomeTaxCity,
        if: result.IncomeTaxFed,
        ch: result.IncomeTaxChurch,
        pt: result.PersonalTax,
        fc: result.FortuneTaxCanton,
        fm: result.FortuneTaxCity,
        fch: result.FortuneTaxChurch,
        mr: result.MarginalTaxRate,
        ti: result.TaxableIncomeCanton,
        tf: result.TaxableFortuneCanton,
      };
      localStorage.setItem(resultKey(fHash, bfsNr), JSON.stringify(compact));
    } catch {
      evictOldest();
      try {
        const compact = {
          t: result.TotalTax,
          ic: result.IncomeTaxCanton,
          im: result.IncomeTaxCity,
          if: result.IncomeTaxFed,
          ch: result.IncomeTaxChurch,
          pt: result.PersonalTax,
          fc: result.FortuneTaxCanton,
          fm: result.FortuneTaxCity,
          fch: result.FortuneTaxChurch,
          mr: result.MarginalTaxRate,
          ti: result.TaxableIncomeCanton,
          tf: result.TaxableFortuneCanton,
        };
        localStorage.setItem(resultKey(fHash, bfsNr), JSON.stringify(compact));
      } catch {
        // Give up
      }
    }
  }

  function evictOldest() {
    // Remove oldest tax result entries
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RESULT_PREFIX)) keys.push(k);
    }
    // Remove first quarter of entries
    const toRemove = keys.slice(0, Math.max(1, Math.floor(keys.length / 4)));
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  function saveFormState(formData) {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(formData));
    } catch {
      // Ignore
    }
  }

  function loadFormState() {
    try {
      const raw = localStorage.getItem(FORM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Expand a compact cached result back to full field names */
  function expandResult(compact) {
    if (!compact || compact.TotalTax !== undefined) return compact; // Already expanded
    return {
      TotalTax: compact.t,
      IncomeTaxCanton: compact.ic,
      IncomeTaxCity: compact.im,
      IncomeTaxFed: compact.if,
      IncomeTaxChurch: compact.ch,
      PersonalTax: compact.pt,
      FortuneTaxCanton: compact.fc,
      FortuneTaxCity: compact.fm,
      FortuneTaxChurch: compact.fch,
      MarginalTaxRate: compact.mr,
      TaxableIncomeCanton: compact.ti,
      TaxableFortuneCanton: compact.tf,
    };
  }

  return { formHash, getCached, setCached, saveFormState, loadFormState, expandResult };
})();
