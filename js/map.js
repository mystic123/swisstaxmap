/**
 * Leaflet map: municipality boundaries, canton borders, lakes.
 * Colors municipalities by tax burden or climate data.
 */
const TaxMap = (() => {
  let map;
  let municipalityLayer;
  let cantonLayer;
  let lakesLayer;
  let municipalities = {};
  let muniData = {};
  let climateData = {};
  let results = {};
  let selectedBfs = null;
  let dataMin = Infinity;
  let dataMax = -Infinity;
  let colorMode = "total";
  let onSelectCallback = null;

  // Batched style updates via requestAnimationFrame
  let pendingUpdates = new Set();
  let rafScheduled = false;

  // Color schemes per mode
  const COLOR_SCHEMES = {
    // Tax: green (low) → red (high)
    total:    { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 },
    income:   { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 },
    wealth:   { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 },
    // Climate
    precip:   { hMin: 210, hMax: 210, sMin: 10, sMax: 80, lMin: 97, lMax: 40 }, // white → blue
    sunshine: { hMin: 50,  hMax: 50,  sMin: 5,  sMax: 90, lMin: 85, lMax: 50 }, // gray → yellow
    temp:     { hMin: 240, hMax: 0,   sMin: 60, sMax: 80, lMin: 70, lMax: 45 }, // blue → red
  };

  const LEGEND_CONFIG = {
    total:    { label: "Total Tax",     fmt: (v) => TaxUtils.fmtCHF(v) },
    income:   { label: "Income Tax",    fmt: (v) => TaxUtils.fmtCHF(v) },
    wealth:   { label: "Wealth Tax",    fmt: (v) => TaxUtils.fmtCHF(v) },
    precip:   { label: "Precipitation", fmt: (v) => Math.round(v).toLocaleString("de-CH") + " mm/yr" },
    sunshine: { label: "Sunshine",      fmt: (v) => Math.round(v).toLocaleString("de-CH") + " h/yr" },
    temp:     { label: "Temperature",   fmt: (v) => v.toFixed(1) + " °C" },
  };

  const CLIMATE_MODES = new Set(["precip", "sunshine", "temp"]);

  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function getColor(value) {
    if (value == null) return "#d0d0d0";
    const t = dataMax > dataMin ? (value - dataMin) / (dataMax - dataMin) : 0.5;
    const clamped = Math.max(0, Math.min(1, t));
    const scheme = COLOR_SCHEMES[colorMode] || COLOR_SCHEMES.total;
    const h = lerp(scheme.hMin, scheme.hMax, clamped);
    const s = lerp(scheme.sMin, scheme.sMax, clamped);
    const l = lerp(scheme.lMin, scheme.lMax, clamped);
    return `hsl(${h},${s}%,${l}%)`;
  }

  function getMetric(bfs) {
    if (CLIMATE_MODES.has(colorMode)) {
      const c = climateData[bfs];
      return c ? c[colorMode] : null;
    }
    const r = results[bfs];
    if (!r) return null;
    if (colorMode === "income") return TaxUtils.sumIncomeTax(r);
    if (colorMode === "wealth") return TaxUtils.sumWealthTax(r);
    return r.TotalTax;
  }

  function init(topoData, muniDataIn, climateDataIn, onSelect) {
    onSelectCallback = onSelect;
    muniData = muniDataIn;
    climateData = climateDataIn;

    map = L.map("map", {
      zoomSnap: 0.5,
      minZoom: 7,
      maxZoom: 14,
      zoomControl: true,
      attributionControl: false,
    }).setView([46.8, 8.22], 8);

    const muniGeo = topojson.feature(topoData, topoData.objects.municipalities);
    municipalityLayer = L.geoJSON(muniGeo, {
      style: () => ({
        fillColor: "#d0d0d0",
        weight: 0.3,
        color: "#999",
        fillOpacity: 0.85,
      }),
      onEachFeature: (feature, layer) => {
        const bfs = String(feature.id);
        municipalities[bfs] = layer;

        layer.on("mouseover", function (e) {
          const html = buildTooltip(bfs);
          this.bindTooltip(html, { className: "tax-tooltip", sticky: true }).openTooltip(e.latlng);
          this.setStyle({ weight: 2, color: "#333" });
          this.bringToFront();
        });

        layer.on("mouseout", function () {
          this.closeTooltip();
          this.unbindTooltip();
          resetStyle(bfs);
        });

        layer.on("click", function () {
          selectMunicipality(bfs);
        });
      },
    }).addTo(map);

    if (topoData.objects.cantons) {
      const cantonGeo = topojson.feature(topoData, topoData.objects.cantons);
      cantonLayer = L.geoJSON(cantonGeo, {
        style: { fill: false, weight: 1.5, color: "#555", opacity: 0.6 },
        interactive: false,
      }).addTo(map);
    }

    if (topoData.objects.lakes) {
      const lakesGeo = topojson.feature(topoData, topoData.objects.lakes);
      lakesLayer = L.geoJSON(lakesGeo, {
        style: { fillColor: "#b3d9ff", fillOpacity: 0.7, weight: 0.5, color: "#88a4cc" },
        interactive: false,
      }).addTo(map);
    }

    map.fitBounds(municipalityLayer.getBounds(), { padding: [10, 10] });
  }

  function buildTooltip(bfs) {
    const info = muniData[bfs];
    const name = info ? TaxUtils.esc(info.name) : `BFS ${bfs}`;
    const canton = info ? TaxUtils.esc(info.canton) : "?";
    let html = `<span class="tt-name">${name}</span> ${canton}`;

    // Always show climate if available
    const c = climateData[bfs];
    if (c) {
      html += `<br><span class="tt-climate">${c.sunshine || "-"} h sun · ${c.precip || "-"} mm rain · ${c.temp || "-"}°C</span>`;
    }

    // Show tax if calculated
    const r = results[bfs];
    if (r && r.TotalTax != null) {
      const inc = TaxUtils.sumIncomeTax(r);
      const wlt = TaxUtils.sumWealthTax(r);
      html += `<br><span class="tt-tax">Tax: ${TaxUtils.fmtCHF(r.TotalTax)}</span>`;
      html += `<br>Income: ${TaxUtils.fmtCHF(inc)} · Wealth: ${TaxUtils.fmtCHF(wlt)}`;
    }

    return html;
  }

  function resetStyle(bfs) {
    const layer = municipalities[bfs];
    if (!layer) return;
    const isSelected = bfs === selectedBfs;
    const metric = getMetric(bfs);
    layer.setStyle({
      weight: isSelected ? 2.5 : 0.3,
      color: isSelected ? "#1a1a2e" : "#999",
      fillColor: metric != null ? getColor(metric) : "#d0d0d0",
      fillOpacity: 0.85,
    });
  }

  function selectMunicipality(bfs) {
    const prevBfs = selectedBfs;
    selectedBfs = bfs;
    if (prevBfs) resetStyle(prevBfs);
    resetStyle(bfs);
    if (municipalities[bfs]) municipalities[bfs].bringToFront();
    if (onSelectCallback) onSelectCallback(bfs, results[bfs]);
  }

  function updateSingle(bfs, result) {
    results[bfs] = result;
    // Only schedule repaint if we're in a tax mode
    if (!CLIMATE_MODES.has(colorMode)) {
      const m = getMetric(bfs);
      if (m != null) {
        if (m < dataMin) dataMin = m;
        if (m > dataMax) dataMax = m;
      }
      pendingUpdates.add(bfs);
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushPendingUpdates);
      }
    }
  }

  function flushPendingUpdates() {
    rafScheduled = false;
    for (const bfs of pendingUpdates) resetStyle(bfs);
    pendingUpdates.clear();
  }

  function recolorAll() {
    recomputeMinMax();
    for (const bfs in municipalities) resetStyle(bfs);
    updateLegend();
  }

  function recomputeMinMax() {
    dataMin = Infinity;
    dataMax = -Infinity;
    for (const bfs in municipalities) {
      const m = getMetric(bfs);
      if (m != null) {
        dataMin = Math.min(dataMin, m);
        dataMax = Math.max(dataMax, m);
      }
    }
  }

  function setColorMode(mode) {
    colorMode = mode;
    recolorAll();
  }

  function updateLegend() {
    const legend = document.getElementById("legend");
    if (dataMin === Infinity) {
      legend.classList.remove("visible");
      return;
    }
    legend.classList.add("visible");

    const cfg = LEGEND_CONFIG[colorMode] || LEGEND_CONFIG.total;
    const stops = [];
    for (let i = 0; i <= 10; i++) {
      stops.push(getColor(dataMin + (i / 10) * (dataMax - dataMin)));
    }

    legend.innerHTML = `
      <span>${cfg.fmt(dataMin)}</span>
      <div class="gradient-bar" style="background: linear-gradient(to right, ${stops.join(", ")})"></div>
      <span>${cfg.fmt(dataMax)}</span>
      <span class="legend-label">${cfg.label}</span>
    `;
  }

  function highlightMunicipality(bfs) {
    const layer = municipalities[bfs];
    if (!layer) return;
    map.fitBounds(layer.getBounds(), { maxZoom: 11, padding: [50, 50] });
    selectMunicipality(bfs);
  }

  return { init, updateSingle, recolorAll, setColorMode, selectMunicipality, highlightMunicipality };
})();
