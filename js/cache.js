/**
 * Client-side localStorage cache for form state + calculation results.
 * Server-side SQLite caching is handled by server.py.
 */
const Cache = (() => {
  const FORM_KEY = "tax_form_state";
  const RESULT_PREFIX = "tax_r_";

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

  function compactResult(result) {
    return {
      t: result.TotalTax,
      ic: result.IncomeTaxCanton,
      im: result.IncomeTaxCity,
      ifd: result.IncomeTaxFed,
      ch: result.IncomeTaxChurch,
      pt: result.PersonalTax,
      fc: result.FortuneTaxCanton,
      fm: result.FortuneTaxCity,
      fch: result.FortuneTaxChurch,
      mr: result.MarginalTaxRate,
      mv: result.MarginalTaxRateVM,
      ti: result.TaxableIncomeCanton,
      tf: result.TaxableFortuneCanton,
    };
  }

  function setCached(fHash, bfsNr, result) {
    const str = JSON.stringify(compactResult(result));
    try {
      localStorage.setItem(resultKey(fHash, bfsNr), str);
    } catch {
      evictOldest();
      try {
        localStorage.setItem(resultKey(fHash, bfsNr), str);
      } catch {
        console.warn("localStorage full, could not cache result for", bfsNr);
      }
    }
  }

  function evictOldest() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RESULT_PREFIX)) keys.push(k);
    }
    const toRemove = keys.slice(0, Math.max(1, Math.floor(keys.length / 4)));
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  function saveFormState(formData) {
    try {
      localStorage.setItem(FORM_KEY, JSON.stringify(formData));
    } catch {
      console.warn("Could not save form state to localStorage");
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

  function expandResult(compact) {
    if (!compact || compact.TotalTax !== undefined) return compact;
    return {
      TotalTax: compact.t,
      IncomeTaxCanton: compact.ic,
      IncomeTaxCity: compact.im,
      IncomeTaxFed: compact.ifd || compact.if, // backwards compat with old "if" key
      IncomeTaxChurch: compact.ch,
      PersonalTax: compact.pt,
      FortuneTaxCanton: compact.fc,
      FortuneTaxCity: compact.fm,
      FortuneTaxChurch: compact.fch,
      MarginalTaxRate: compact.mr,
      MarginalTaxRateVM: compact.mv,
      TaxableIncomeCanton: compact.ti,
      TaxableFortuneCanton: compact.tf,
    };
  }

  /** Clear all tax-related localStorage entries */
  function clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(RESULT_PREFIX) || k.startsWith("tax_"))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  }

  return { formHash, getCached, setCached, saveFormState, loadFormState, expandResult, clearAll };
})();
