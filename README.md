# Swiss Tax Map

Interactive map visualizing income and wealth tax across all ~2,100 Swiss municipalities. Enter your tax profile, see every Gemeinde colored by total tax burden, compare municipalities, and rank them.

Uses the ESTV (Swiss Federal Tax Administration) public API — no API key required.

## Quick Start

```sh
python3 server.py
# open http://localhost:8000
```

## Docker

```sh
docker build -t swiss-tax-map .
docker run -p 8000:8000 -v tax-cache:/app/data swiss-tax-map
```

The `-v tax-cache:/app/data` volume persists the SQLite cache between runs.

## Features

- Interactive Leaflet map with all municipality boundaries, canton borders, and lakes
- Green-to-red color gradient based on relative tax burden
- Basic or detailed calculation mode (custom deductions: pillar 3a, commuting, health insurance, etc.)
- Single or married with partner income
- Income tax and wealth tax shown separately
- Canton filter to calculate a subset quickly
- 200 concurrent API requests — full Switzerland in ~90 seconds, instant on re-run (SQLite cache)
- Sortable ranking table with canton/name filter
- Click municipality for detail breakdown, compare multiple
- Form state persisted in localStorage

## How It Works

1. `data/municipalities.json` maps BFS municipality numbers to ESTV TaxLocationIDs (built by `scripts/build-data.py`)
2. `data/ch-municipalities.topojson` provides municipality boundaries (from swiss-maps, 2025 vintage)
3. `server.py` serves static files and proxies ESTV API calls through a SQLite cache
4. Browser fires 200 concurrent calculations, results stream into the map and ranking table

## Data Preparation

Only needed if you want to rebuild `municipalities.json`:

```sh
python3 scripts/build-data.py
```

Calls the ESTV search API to map ~2,100 BFS numbers to TaxLocationIDs. Takes about 5 seconds.

## Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- Leaflet + topojson-client (CDN)
- Python 3 stdlib HTTP server + SQLite for caching proxy
- ESTV public API (unauthenticated)

## API Reference

See [ESTV_API.md](ESTV_API.md) for full API documentation.
