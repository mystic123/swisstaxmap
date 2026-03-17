/**
 * Leaflet map: municipality boundaries, canton borders, lakes.
 * Colors municipalities green-to-red by tax burden.
 */
const TaxMap = (() => {
  let map;
  let municipalityLayer;
  let cantonLayer;
  let lakesLayer;
  let municipalities = {}; // BFS → Leaflet layer
  let results = {}; // BFS → tax result
  let selectedBfs = null;
  let taxMin = Infinity;
  let taxMax = -Infinity;
  let onSelectCallback = null;

  // Color scale: green → yellow → red
  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function getColor(totalTax) {
    if (totalTax == null) return "#d0d0d0"; // gray = no data

    const t = taxMax > taxMin ? (totalTax - taxMin) / (taxMax - taxMin) : 0.5;
    const clamped = Math.max(0, Math.min(1, t));

    // Light green (low tax) → deep red (high tax)
    // t=0: hsl(120, 50%, 85%) — pale green
    // t=1: hsl(0, 80%, 35%)  — deep red
    const h = lerp(120, 0, clamped);
    const s = lerp(50, 80, clamped);
    const l = lerp(85, 35, clamped);
    return `hsl(${h},${s}%,${l}%)`;
  }

  function init(topoData, muniData, onSelect) {
    onSelectCallback = onSelect;

    map = L.map("map", {
      zoomSnap: 0.5,
      minZoom: 7,
      maxZoom: 14,
      zoomControl: true,
      attributionControl: false,
    }).setView([46.8, 8.22], 8);

    // Municipality polygons
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
        const info = muniData[bfs];
        const name = info ? info.name : `BFS ${bfs}`;
        const canton = info ? info.canton : "?";

        layer.on("mouseover", function (e) {
          const taxText =
            results[bfs] != null
              ? `CHF ${results[bfs].TotalTax.toLocaleString("de-CH")}`
              : "not calculated";
          this.bindTooltip(
            `<span class="tt-name">${name}</span> ${canton}<br><span class="tt-tax">${taxText}</span>`,
            { className: "tax-tooltip", sticky: true }
          ).openTooltip(e.latlng);
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

    // Canton borders (thicker, no fill)
    if (topoData.objects.cantons) {
      const cantonGeo = topojson.feature(topoData, topoData.objects.cantons);
      cantonLayer = L.geoJSON(cantonGeo, {
        style: { fill: false, weight: 1.5, color: "#555", opacity: 0.6 },
        interactive: false,
      }).addTo(map);
    }

    // Lakes
    if (topoData.objects.lakes) {
      const lakesGeo = topojson.feature(topoData, topoData.objects.lakes);
      lakesLayer = L.geoJSON(lakesGeo, {
        style: {
          fillColor: "#b3d9ff",
          fillOpacity: 0.7,
          weight: 0.5,
          color: "#88a4cc",
        },
        interactive: false,
      }).addTo(map);
    }

    // Fit bounds to Switzerland
    map.fitBounds(municipalityLayer.getBounds(), { padding: [10, 10] });
  }

  function resetStyle(bfs) {
    const layer = municipalities[bfs];
    if (!layer) return;
    const isSelected = bfs === selectedBfs;
    layer.setStyle({
      weight: isSelected ? 2.5 : 0.3,
      color: isSelected ? "#1a1a2e" : "#999",
      fillColor: results[bfs] != null ? getColor(results[bfs].TotalTax) : "#d0d0d0",
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

  function updateResults(newResults) {
    results = newResults;

    // Compute min/max for color scale
    taxMin = Infinity;
    taxMax = -Infinity;
    for (const bfs in results) {
      if (results[bfs] && results[bfs].TotalTax != null) {
        taxMin = Math.min(taxMin, results[bfs].TotalTax);
        taxMax = Math.max(taxMax, results[bfs].TotalTax);
      }
    }

    // Update all municipality colors
    for (const bfs in municipalities) {
      resetStyle(bfs);
    }

    updateLegend();
  }

  /** Incrementally update a single municipality's result and recolor */
  function updateSingle(bfs, result) {
    results[bfs] = result;
    if (result && result.TotalTax != null) {
      if (result.TotalTax < taxMin) taxMin = result.TotalTax;
      if (result.TotalTax > taxMax) taxMax = result.TotalTax;
    }
    resetStyle(bfs);
  }

  /** Recompute min/max and recolor everything — call after batch is done */
  function recolorAll() {
    taxMin = Infinity;
    taxMax = -Infinity;
    for (const bfs in results) {
      if (results[bfs] && results[bfs].TotalTax != null) {
        taxMin = Math.min(taxMin, results[bfs].TotalTax);
        taxMax = Math.max(taxMax, results[bfs].TotalTax);
      }
    }
    for (const bfs in municipalities) {
      resetStyle(bfs);
    }
    updateLegend();
  }

  function updateLegend() {
    const legend = document.getElementById("legend");
    if (taxMin === Infinity) {
      legend.classList.remove("visible");
      return;
    }
    legend.classList.add("visible");

    const minFmt = `CHF ${Math.round(taxMin).toLocaleString("de-CH")}`;
    const maxFmt = `CHF ${Math.round(taxMax).toLocaleString("de-CH")}`;

    // Build gradient bar
    const stops = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const val = taxMin + t * (taxMax - taxMin);
      stops.push(getColor(val));
    }

    legend.innerHTML = `
      <span>${minFmt}</span>
      <div class="gradient-bar" style="background: linear-gradient(to right, ${stops.join(", ")})"></div>
      <span>${maxFmt}</span>
    `;
  }

  function highlightMunicipality(bfs) {
    const layer = municipalities[bfs];
    if (!layer) return;
    map.fitBounds(layer.getBounds(), { maxZoom: 11, padding: [50, 50] });
    selectMunicipality(bfs);
  }

  return { init, updateResults, updateSingle, recolorAll, selectMunicipality, highlightMunicipality };
})();
