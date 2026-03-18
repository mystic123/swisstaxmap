# feat: Travel time to Zürich HB overlay (public transport + car)

## Overview

Add per-municipality travel time to Zürich HB as a map overlay, for both public transport (ÖV) and car (MIV). Data is pre-computed by the Swiss government — no API calls needed.

## Data Source

**ARE "Reisezeit zu 6 grossen Zentren"** — published by the Swiss Federal Office for Spatial Development (ARE). Pre-computed travel times from ~7,978 traffic zones to 6 major Swiss centres including **Zürich**.

| Dataset | URL | Mode |
|---|---|---|
| Public transport | https://opendata.swiss/de/dataset/reisezeit-zu-zentren-mit-dem-ov | ÖV |
| Car | https://opendata.swiss/de/dataset/reisezeit-zu-zentren-mit-dem-miv | MIV |

- **Format:** CSV or shapefile, free, open data
- **Coverage:** All ~7,978 traffic zones in Switzerland
- **Mapping needed:** Traffic zone → municipality (each municipality = 1-4 zones, take minimum travel time)

**Backup option:** If the ARE data is hard to map, use **OSRM** (car, self-hosted, one query for all 2,100 municipalities) + **search.ch API** (public transport, 1,000 free queries/day).

## Design Principle

Tax, climate, and travel time are strictly separate overlay groups. No combined scores.

## Implementation

### Phase 1: Data Pipeline (`scripts/build-travel.py`)

```
ARE CSV (traffic zones, travel time to Zürich)
    ↓
Map zone → BFS municipality number
    ↓
Take minimum travel time per municipality (both ÖV and MIV)
    ↓
data/travel.json → { "261": {"ov": 0, "miv": 0}, "351": {"ov": 56, "miv": 62}, ... }
```

Key steps:
1. Download ARE datasets from opendata.swiss
2. Parse the CSV/shapefile — identify columns for zone ID, Zürich travel time
3. Get zone-to-municipality mapping (ARE publishes this, or derive from spatial join with municipality polygons)
4. For each municipality, take the **minimum** travel time across its zones (represents fastest reachable point)
5. Output `data/travel.json` keyed by BFS number

### Phase 2: Frontend

**New color modes in the dropdown:**

```html
<optgroup label="Travel to Zürich HB">
  <option value="ov">Public Transport (min)</option>
  <option value="miv">Car (min)</option>
</optgroup>
```

**Color scheme:**
- Green (close, short travel time) → red (far, long travel time)
- Same scheme as tax (intuitive: green = good)

**`js/map.js` changes:**
- Add `ov` and `miv` to `CLIMATE_MODES` → rename to `OVERLAY_MODES`
- `getMetric(bfs)` checks `travelData[bfs]` for these modes
- Legend shows minutes: "12 min → 185 min"
- Tooltip shows both ÖV and MIV travel times

**`js/main.js` changes:**
- Load `data/travel.json` alongside other data files
- Pass to `TaxMap.init()`

### Phase 3: Ranking table

When in travel time mode, show travel time column sorted ascending (shortest first). Show both ÖV and MIV columns.

## Files Changed

| File | Change |
|---|---|
| `scripts/build-travel.py` | **NEW** — download + process ARE data |
| `data/travel.json` | **NEW** — per-municipality travel times |
| `js/map.js` | Add ov/miv color modes, legend, tooltip |
| `js/main.js` | Load travel.json, add to dropdown |
| `index.html` | Add Travel optgroup to select |
| `Dockerfile` | Add COPY for travel.json |

## Acceptance Criteria

- [ ] `data/travel.json` has ÖV and MIV travel time for 2,000+ municipalities
- [ ] Map shows 2 new color modes: "Public Transport" and "Car"
- [ ] Zürich area is green (0-15 min), remote areas are red (150+ min)
- [ ] Legend shows time in minutes
- [ ] Tooltip shows both travel times
- [ ] Works without tax calculation (static overlay like climate)

## Risks

- **Zone-to-municipality mapping** — the ARE dataset uses traffic zones, not BFS numbers. Need to find or build the mapping. ARE may publish a concordance table, or we can do a spatial join.
- **Data format** — need to inspect the actual download to understand the column structure
- **Data freshness** — ARE dataset may be from 2023 or earlier. Travel times change slowly so this is acceptable.

## Future Extensions

- Selectable destination (not just Zürich — Bern, Basel, Geneva, Lausanne, Lugano are also in the ARE dataset)
- Isochrone rings on the map
- Combined tax + travel time filtering ("show me municipalities under 45 min from Zürich with tax under 60k")

## References

- ARE accessibility page: https://www.are.admin.ch/are/de/home/raumentwicklung-und-raumplanung/grundlagen-und-daten/raumbeobachtung/verkehr-energie/erreichbarkeit.html
- ÖV travel times: https://opendata.swiss/de/dataset/reisezeit-zu-zentren-mit-dem-ov
- MIV travel times: https://opendata.swiss/de/dataset/reisezeit-zu-zentren-mit-dem-miv
- NPVM 2023 full matrix (backup): https://zenodo.org/records/15755932
- OSRM (car routing backup): https://project-osrm.org/
- search.ch API (ÖV backup): https://timetable.search.ch/api/help.en.html
