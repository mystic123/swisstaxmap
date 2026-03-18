/**
 * ESTV API client.
 * All calls go through the local caching proxy if available,
 * falling back to the ESTV API directly.
 */
const TaxAPI = (() => {
  const ESTV_BASE =
    "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/";
  const PROXY_BASE = "/api/";

  // Disable proxy on static hosts (GitHub Pages, file://, etc.)
  let useProxy = location.hostname === "localhost" || location.hostname === "127.0.0.1";

  async function post(endpoint, payload) {
    if (useProxy) {
      try {
        const resp = await fetch(PROXY_BASE + endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (resp.ok) return resp.json();
        // Proxy returned error (e.g. 404 on static host) — disable permanently
        useProxy = false;
      } catch {
        useProxy = false;
      }
    }

    const resp = await fetch(ESTV_BASE + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`API ${endpoint}: ${resp.status}`);
    return resp.json();
  }

  function buildPayload(params) {
    return {
      SimKey: null,
      TaxYear: params.taxYear || 2025,
      TaxLocationID: params.taxLocationId,
      Relationship: params.relationship || 1,
      Confession1: params.confession || 5,
      Children: params.children || [],
      Age1: params.age || 35,
      RevenueType1: params.revenueType || 1,
      Revenue1: params.income || 0,
      Fortune: params.wealth || 0,
      Confession2: params.confession2 || 0,
      Age2: params.age2 || 0,
      RevenueType2: params.revenueType2 || 0,
      Revenue2: params.income2 || 0,
      Budget: params.budget || [],
    };
  }

  async function searchLocation(query, taxYear = 2025) {
    const data = await post("API_searchLocation", {
      Search: query,
      Language: 4,
      TaxYear: taxYear,
    });
    return data.response || [];
  }

  async function calculateTax(params) {
    const data = await post("API_calculateDetailedTaxes", buildPayload(params));
    return data.response;
  }

  /** Fetch default budget/deduction items for a taxpayer profile */
  async function getTaxBudget(params) {
    const data = await post("API_calculateTaxBudget", buildPayload(params));
    return data.response || [];
  }

  return { searchLocation, calculateTax, getTaxBudget };
})();
