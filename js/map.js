/**
 * Leaflet map: municipality boundaries, canton borders, lakes.
 * Colors municipalities by tax burden (total, income, or wealth).
 */
const TaxMap = (() => {
  let map;
  let municipalityLayer;
  let cantonLayer;
  let lakesLayer;
  let municipalities = {};
  let muniData = {};
  let results = {};
  let selectedBfs = null;
  let taxMin = Infinity;
  let taxMax = -Infinity;
  let colorMode = "total";
  let onSelectCallback = null;

  // Batched style updates via requestAnimationFrame
  let pendingUpdates = new Set();
  let rafScheduled = false;

  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function getColor(value) {
    if (value == null) return "#d0d0d0";
    const t = taxMax > taxMin ? (value - taxMin) / (taxMax - taxMin) : 0.5;
    const clamped = Math.max(0, Math.min(1, t));
    const h = lerp(120, 0, clamped);
    const s = lerp(50, 80, clamped);
    const l = lerp(85, 35, clamped);
    return `hsl(${h},${s}%,${l}%)`;
  }

  function getMetric(r) {
    if (!r) return null;
    if (colorMode === "income") return TaxUtils.sumIncomeTax(r);
    if (colorMode === "wealth") return TaxUtils.sumWealthTax(r);
    return r.TotalTax;
  }

  function init(topoData, muniDataIn, onSelect) {
    onSelectCallback = onSelect;
    muniData = muniDataIn;

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
          const info = muniData[bfs];
          const name = info ? TaxUtils.esc(info.name) : `BFS ${bfs}`;
          const canton = info ? TaxUtils.esc(info.canton) : "?";
          const r = results[bfs];
          let html = `<span class="tt-name">${name}</span> ${canton}`;
          if (r && r.TotalTax != null) {
            const inc = TaxUtils.sumIncomeTax(r);
            const wlt = TaxUtils.sumWealthTax(r);
            html += `<br><span class="tt-tax">Total: ${TaxUtils.fmtCHF(r.TotalTax)}</span>`;
            html += `<br>Income: ${TaxUtils.fmtCHF(inc)} · Wealth: ${TaxUtils.fmtCHF(wlt)}`;
            html += `<br>Marginal: ${(r.MarginalTaxRate || 0).toFixed(1)}%`;
            if (r.MarginalTaxRateVM) html += ` · Wealth: ${r.MarginalTaxRateVM.toFixed(2)}%`;
          } else {
            html += `<br><span class="tt-tax">not calculated</span>`;
          }
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

  function resetStyle(bfs) {
    const layer = municipalities[bfs];
    if (!layer) return;
    const isSelected = bfs === selectedBfs;
    const metric = getMetric(results[bfs]);
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

  /** Incrementally update — batches via rAF to avoid jank */
  function updateSingle(bfs, result) {
    results[bfs] = result;
    const m = getMetric(result);
    if (m != null) {
      if (m < taxMin) taxMin = m;
      if (m > taxMax) taxMax = m;
    }
    pendingUpdates.add(bfs);
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushPendingUpdates);
    }
  }

  function flushPendingUpdates() {
    rafScheduled = false;
    for (const bfs of pendingUpdates) {
      resetStyle(bfs);
    }
    pendingUpdates.clear();
  }

  function recolorAll() {
    recomputeMinMax();
    for (const bfs in municipalities) resetStyle(bfs);
    updateLegend();
  }

  function recomputeMinMax() {
    taxMin = Infinity;
    taxMax = -Infinity;
    for (const bfs in results) {
      const m = getMetric(results[bfs]);
      if (m != null) {
        taxMin = Math.min(taxMin, m);
        taxMax = Math.max(taxMax, m);
      }
    }
  }

  function setColorMode(mode) {
    colorMode = mode;
    recolorAll();
  }

  function updateLegend() {
    const legend = document.getElementById("legend");
    if (taxMin === Infinity) {
      legend.classList.remove("visible");
      return;
    }
    legend.classList.add("visible");

    const labels = { total: "Total Tax", income: "Income Tax", wealth: "Wealth Tax" };
    const minFmt = TaxUtils.fmtCHF(taxMin);
    const maxFmt = TaxUtils.fmtCHF(taxMax);

    const stops = [];
    for (let i = 0; i <= 10; i++) {
      stops.push(getColor(taxMin + (i / 10) * (taxMax - taxMin)));
    }

    legend.innerHTML = `
      <span>${minFmt}</span>
      <div class="gradient-bar" style="background: linear-gradient(to right, ${stops.join(", ")})"></div>
      <span>${maxFmt}</span>
      <span class="legend-label">${labels[colorMode]}</span>
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
