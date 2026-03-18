# feat: Climate data overlays (precipitation, sunshine, temperature)

## Overview

Add per-municipality climate data as map overlay modes alongside the existing tax coloring. User can toggle between tax views and climate views. Climate data is pre-computed at build time by aggregating MeteoSwiss 2km grid normals (1991-2020) to municipality polygons, then served as static JSON.

## Problem Statement

When evaluating where to live in Switzerland, tax burden is only one factor. Climate (sunshine hours, precipitation) varies dramatically — Ticino gets 2000+ sunshine hours/year while parts of Jura get under 1400. Currently there's no way to visualize this alongside tax data.

## Proposed Solution

**Option B from research: grid → municipality aggregation** (not WMS overlay)

Why not WMS: WMS gives a raster image that can't be clicked/hovered per municipality, can't populate the ranking table, and can't participate in a future "livability score." Pre-aggregation gives full control.

### Data Pipeline (build-time)

```
MeteoSwiss NetCDF (2km grid, EPSG:2056)
    ↓
scripts/build-climate.py (rasterstats zonal_stats)
    ↓
data/climate.json  →  { "261": {"precip": 1136, "sunshine": 1566, "temp": 9.4}, ... }
```

### Frontend Changes

```
"Color by" selector gains new options:  Total | Income | Wealth | Sunshine | Precip | Temp
    ↓
map.js getMetric() pulls from climateData[bfs] instead of results[bfs]
    ↓
Different color schemes per mode (blue for precip, yellow for sunshine, red-blue for temp)
    ↓
Tooltip shows climate values when in climate mode
    ↓
Ranking table shows climate column when in climate mode
```

## Implementation Phases

### Phase 1: Data Pipeline (`scripts/build-climate.py`)

**New file: `scripts/build-climate.py`**

```python
# Inputs:
#   - MeteoSwiss NetCDF files (precipitation, sunshine, temperature normals 1991-2020)
#   - Municipality polygons from swiss-maps package (already in data/)
#
# Output:
#   - data/climate.json keyed by BFS number
#
# Dependencies: xarray, rioxarray, netCDF4, geopandas, rasterstats

import xarray as xr
import geopandas as gpd
from rasterstats import zonal_stats
import json

# 1. Load municipality polygons from swiss-maps shapefile
gdf = gpd.read_file("/tmp/package/2025/municipalities.shp").to_crs(epsg=2056)

# 2. For each climate variable:
for var_name, nc_file, field_name in [
    ("RnormY9120", "precipitation_normals.nc", "precip"),
    ("SISnormY9120", "sunshine_normals.nc", "sunshine"),
    ("TnormY9120", "temperature_normals.nc", "temp"),
]:
    ds = xr.open_dataset(nc_file)
    raster = ds[var_name]
    raster = raster.rio.set_spatial_dims(x_dim="chx", y_dim="chy")
    raster = raster.rio.write_crs("EPSG:2056")
    raster.rio.to_raster(f"/tmp/{field_name}.tif")

    stats = zonal_stats(
        gdf.geometry,
        f"/tmp/{field_name}.tif",
        stats=["mean"],
        nodata=raster.rio.nodata,
        all_touched=True,  # important for small municipalities
    )
    gdf[field_name] = [s["mean"] for s in stats]

# 3. Output as {BFS: {precip, sunshine, temp}}
climate = {}
for _, row in gdf.iterrows():
    bfs = str(int(row["id"]))
    climate[bfs] = {
        "precip": round(row["precip"]) if row["precip"] else None,      # mm/year
        "sunshine": round(row["sunshine"]) if row["sunshine"] else None, # hours/year
        "temp": round(row["temp"], 1) if row["temp"] else None,         # °C
    }

with open("data/climate.json", "w") as f:
    json.dump(climate, f, separators=(",", ":"))
```

**Data acquisition steps (manual, one-time):**

1. Find exact NetCDF download URLs from STAC API: `https://data.geo.admin.ch/collections`
2. Search for collections matching `klimanormwerte` or use MeteoSwiss download tool: `https://github.com/MeteoSwiss/opendata-download`
3. Download annual normals for precipitation (`RnormY9120`), sunshine/solar radiation (`SISnormY9120`), and temperature (`TnormY9120`)
4. Inspect NetCDF variable names with `xr.open_dataset(path)` — dimension names may be `chx`/`chy` or `E`/`N`

**Python dependencies:**
```
pip install xarray rioxarray netCDF4 geopandas rasterstats
```

**Expected output:** `data/climate.json` — ~60KB, 2,100 entries, 3 fields each.

### Phase 2: Frontend — Load Climate Data

**`js/main.js` changes:**

```javascript
// In the data loading section (line ~11):
const [topoResp, muniResp, climateResp] = await Promise.all([
  fetch("data/ch-municipalities.topojson"),
  fetch("data/municipalities.json"),
  fetch("data/climate.json"),
]);
// ...
const climateData = await climateResp.json();

// Pass to TaxMap.init:
TaxMap.init(topoData, muniData, climateData, onMunicipalitySelect);
```

### Phase 3: Frontend — Map Coloring Modes

**`js/map.js` changes:**

```javascript
// New module-level variable:
let climateData = {};

// Update init() signature:
function init(topoData, muniDataIn, climateDataIn, onSelect) {
  climateData = climateDataIn;
  // ... rest unchanged
}

// Extend getMetric():
function getMetric(r, bfs) {  // <-- add bfs parameter
  if (!r && !climateData[bfs]) return null;
  switch (colorMode) {
    case "income":  return TaxUtils.sumIncomeTax(r);
    case "wealth":  return TaxUtils.sumWealthTax(r);
    case "precip":  return climateData[bfs]?.precip;
    case "sunshine": return climateData[bfs]?.sunshine;
    case "temp":    return climateData[bfs]?.temp;
    default:        return r?.TotalTax;
  }
}

// Mode-aware color scheme:
const COLOR_SCHEMES = {
  total:    { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 }, // green→red (low tax=green)
  income:   { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 },
  wealth:   { hMin: 120, hMax: 0,   sMin: 50, sMax: 80, lMin: 85, lMax: 35 },
  precip:   { hMin: 210, hMax: 210, sMin: 10, sMax: 80, lMin: 97, lMax: 40 }, // white→blue (more=bluer)
  sunshine: { hMin: 50,  hMax: 50,  sMin: 5,  sMax: 90, lMin: 85, lMax: 50 }, // gray→yellow (more=yellower)
  temp:     { hMin: 240, hMax: 0,   sMin: 60, sMax: 80, lMin: 70, lMax: 45 }, // blue→red (hotter=redder)
};

function getColor(value) {
  if (value == null) return "#d0d0d0";
  const t = taxMax > taxMin ? (value - taxMin) / (taxMax - taxMin) : 0.5;
  const clamped = Math.max(0, Math.min(1, t));
  const scheme = COLOR_SCHEMES[colorMode] || COLOR_SCHEMES.total;
  const h = lerp(scheme.hMin, scheme.hMax, clamped);
  const s = lerp(scheme.sMin, scheme.sMax, clamped);
  const l = lerp(scheme.lMin, scheme.lMax, clamped);
  return `hsl(${h},${s}%,${l}%)`;
}

// Update legend labels and units:
const LEGEND_CONFIG = {
  total:    { label: "Total Tax",    unit: "CHF" },
  income:   { label: "Income Tax",   unit: "CHF" },
  wealth:   { label: "Wealth Tax",   unit: "CHF" },
  precip:   { label: "Precipitation", unit: "mm/yr" },
  sunshine: { label: "Sunshine",     unit: "h/yr" },
  temp:     { label: "Temperature",  unit: "°C" },
};

// In updateLegend():
const cfg = LEGEND_CONFIG[colorMode] || LEGEND_CONFIG.total;
const fmtVal = cfg.unit === "CHF"
  ? (v) => TaxUtils.fmtCHF(v)
  : cfg.unit === "°C"
    ? (v) => v.toFixed(1) + "°C"
    : (v) => Math.round(v).toLocaleString("de-CH") + " " + cfg.unit;
```

**Key change:** `getMetric` now takes `bfs` as a second argument so it can look up climate data independently of tax results. All callers (`resetStyle`, `updateSingle`, `recomputeMinMax`, tooltip) need to pass `bfs`.

**Climate overlays work WITHOUT running a tax calculation.** As soon as the page loads and climate.json is fetched, the user can switch to precipitation/sunshine/temp mode and see the map colored immediately.

### Phase 4: Frontend — UI Controls

**`index.html` — replace radio buttons with grouped select:**

```html
<div id="map-controls">
  <label>Color by:</label>
  <select id="color-mode-select">
    <optgroup label="Tax">
      <option value="total" selected>Total Tax</option>
      <option value="income">Income Tax</option>
      <option value="wealth">Wealth Tax</option>
    </optgroup>
    <optgroup label="Climate (1991-2020)">
      <option value="sunshine">Sunshine (h/yr)</option>
      <option value="precip">Precipitation (mm/yr)</option>
      <option value="temp">Temperature (°C)</option>
    </optgroup>
  </select>
</div>
```

**`js/main.js` — update event wiring:**

```javascript
document.getElementById("color-mode-select").addEventListener("change", (e) => {
  TaxMap.setColorMode(e.target.value);
});
```

### Phase 5: Tooltip + Ranking Table

**Tooltip (`js/map.js`):**

When in climate mode, show climate values instead of tax breakdown:

```javascript
// In mouseover handler:
if (["precip", "sunshine", "temp"].includes(colorMode)) {
  const c = climateData[bfs];
  if (c) {
    html += `<br><span class="tt-tax">Precip: ${c.precip || "-"} mm/yr</span>`;
    html += `<br>Sunshine: ${c.sunshine || "-"} h/yr`;
    html += `<br>Temp: ${c.temp || "-"}°C`;
  }
} else {
  // existing tax tooltip
}
```

**Ranking table (`js/ui.js`):**

Add optional climate columns. When `colorMode` is a climate mode, show that column sorted by default. Approach: `UI.setDisplayMode(mode)` that controls which columns render.

### Phase 6: Deployment

1. Add `data/climate.json` to `Dockerfile` COPY
2. Add `scripts/build-climate.py` to the repo
3. Document the data pipeline in README
4. Deploy to NAS

## Files Changed

| File | Change |
|------|--------|
| `scripts/build-climate.py` | **NEW** — build-time aggregation pipeline |
| `data/climate.json` | **NEW** — per-municipality climate normals |
| `js/map.js` | Add climate modes to `getMetric`, color schemes, legend config |
| `js/ui.js` | Climate columns in ranking, mode-aware tooltip |
| `js/main.js` | Load climate.json, wire select dropdown |
| `index.html` | Replace radio buttons with grouped select |
| `css/styles.css` | Style updates for select |
| `Dockerfile` | Add COPY for climate.json |
| `README.md` | Document climate data pipeline |

## Acceptance Criteria

- [ ] `data/climate.json` contains precipitation, sunshine, and temperature for 2,000+ municipalities
- [ ] Map can show 6 color modes: total tax, income tax, wealth tax, precipitation, sunshine, temperature
- [ ] Climate overlays work without running a tax calculation
- [ ] Each mode has an appropriate color scheme (not always green-to-red)
- [ ] Legend shows correct units (CHF, mm/yr, h/yr, °C)
- [ ] Tooltip shows climate values when in climate mode
- [ ] Ranking table shows climate data when in climate mode
- [ ] Color mode selector is a grouped dropdown (Tax / Climate sections)

## Dependencies & Risks

- **MeteoSwiss data availability**: NetCDF files need to be downloaded manually. Exact STAC collection IDs need to be discovered via `https://data.geo.admin.ch/collections`
- **Small municipality coverage**: Some municipalities smaller than 2km grid cells. Mitigated by `all_touched=True` in rasterstats
- **20 missing municipalities**: The TopoJSON has 2,124 entries but municipalities.json only 2,104. Climate data may have its own gaps
- **Python dependencies for build script**: xarray, rioxarray, geopandas, rasterstats are heavy. Only needed at build time, not in Docker

## Design Principle

**Tax and climate are strictly separate.** No combined scores, no mixing of data domains. The color mode selector has two distinct groups — the user is always looking at either tax data OR climate data, never both blended together.

## Future Extensions

- Monthly climate data (12 maps per variable)
- Commute time overlay (using SBB API)
- Property price overlay (using Wüest Partner or similar data)
- Air quality / noise level overlays (BAFU data)

## References

- MeteoSwiss Climate Normals docs: https://opendatadocs.meteoswiss.ch/c-climate-data/c6-climate-normals
- MeteoSwiss download tool: https://github.com/MeteoSwiss/opendata-download
- STAC API: https://data.geo.admin.ch/collections
- WMS endpoint: https://wms.geo.admin.ch/
- Precipitation layer: `ch.meteoschweiz.klimanormwerte-niederschlag_aktuelle_periode`
- Sunshine layer: `ch.meteoschweiz.klimanormwerte-sonnenscheindauer_aktuelle_periode`
- Temperature layer: `ch.meteoschweiz.klimanormwerte-temperatur_aktuelle_periode`
- rasterstats docs: https://pythonhosted.org/rasterstats/manual.html
- swissBOUNDARIES3D: https://www.swisstopo.admin.ch/en/landscape-model-swissboundaries3d
