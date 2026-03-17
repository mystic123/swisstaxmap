/**
 * Shared tax calculation helpers and formatting utilities.
 * Loaded before all other JS modules.
 */
const TaxUtils = (() => {
  /** Sum all income tax components from an API result */
  function sumIncomeTax(r) {
    if (!r) return 0;
    return (r.IncomeTaxCanton || 0) + (r.IncomeTaxCity || 0) +
           (r.IncomeTaxFed || 0) + (r.IncomeTaxChurch || 0) + (r.PersonalTax || 0);
  }

  /** Sum all wealth tax components from an API result */
  function sumWealthTax(r) {
    if (!r) return 0;
    return (r.FortuneTaxCanton || 0) + (r.FortuneTaxCity || 0) + (r.FortuneTaxChurch || 0);
  }

  /** Format number with de-CH locale (e.g. 12'345) */
  function fmt(n) {
    if (n == null) return "-";
    return Math.round(n).toLocaleString("de-CH");
  }

  /** Format as CHF amount */
  function fmtCHF(n) {
    return n != null ? `CHF ${fmt(n)}` : "-";
  }

  /** Format as percentage */
  function fmtPct(n) {
    if (n == null) return "-";
    return n.toFixed(1) + "%";
  }

  /** HTML-escape a string to prevent XSS */
  function esc(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  return { sumIncomeTax, sumWealthTax, fmt, fmtCHF, fmtPct, esc };
})();
