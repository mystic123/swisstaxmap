# Swiss Tax Calculator

## Quick Start

```sh
python3 server.py          # http://localhost:8000
# or
docker build -t swiss-tax-calculator . && docker run -p 8000:8000 -v tax-cache:/app/data swiss-tax-calculator
```

## Architecture

Static vanilla JS frontend + Python caching proxy. No build step, no framework.

- `server.py` — threaded HTTP server, proxies ESTV API calls through SQLite cache (`data/tax-cache.sqlite`)
- `index.html` + `css/styles.css` — single page, Leaflet map, left panel with form
- `js/api.js` — ESTV API client (tries local proxy first, falls back to direct)
- `js/calculator.js` — batch calculator, 200 concurrent requests, canton filtering
- `js/map.js` — Leaflet map with TopoJSON boundaries, color modes (total/income/wealth)
- `js/cache.js` — localStorage cache for calculation results + form state
- `js/ui.js` — detail panel, comparison, ranking table
- `js/main.js` — bootstrap, event wiring, detailed deductions panel, budget persistence
- `data/municipalities.json` — BFS→{name, canton, plz, taxLocationId} for 2,104 municipalities
- `data/ch-municipalities.topojson` — Swiss municipality boundaries (2025 vintage, WGS84)
- `scripts/build-data.py` — one-time script to rebuild municipalities.json from ESTV API

## ESTV API

All tax calculations use the unauthenticated ESTV API. See `ESTV_API.md` for full docs.

- Base: `https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/`
- `API_searchLocation` — find municipality by name/postcode
- `API_calculateDetailedTaxes` — calculate tax (basic with `Budget: []`, or detailed with budget items)
- `API_calculateTaxBudget` — get default deduction items for a taxpayer profile

## Deployment

Deployed on home NAS at `tax.home` via Docker + Traefik reverse proxy.

```sh
# Deploy
rsync -avz --exclude='.git' --exclude='.claude' --exclude='*.sqlite*' . root@192.168.0.249:/home/docker/swiss-tax-calculator/
ssh root@192.168.0.249 "cd /home/docker/swiss-tax-calculator && docker build -q -t swiss-tax-calculator . && docker stop swiss-tax-calculator && docker rm swiss-tax-calculator && docker run -d --name swiss-tax-calculator --restart unless-stopped -p 8070:8000 -v /home/docker/swiss-tax-calculator/data:/app/data swiss-tax-calculator"
```

## Key Design Decisions

- No npm/build — all CDN (Leaflet, topojson-client). Keeps it simple.
- Server-side SQLite cache — avoids hammering ESTV API on repeated calculations
- Client-side localStorage — persists form state, deduction values, and compact results
- 200 concurrent fetch() calls — ESTV API handles it fine, ~90s for all 2,104 municipalities
- Budget values auto-saved to localStorage on field change, restored when panel loads
