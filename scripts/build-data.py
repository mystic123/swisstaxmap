#!/usr/bin/env python3
"""
Build municipalities.json: BFS-Nr → {name, canton, plz, taxLocationId}

Reads BFS IDs from the TopoJSON, fetches TaxLocationIDs from ESTV API
by searching 2-digit postcode prefixes, then fills gaps with name searches.

Usage: python3 scripts/build-data.py
"""

import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOPO_PATH = PROJECT_ROOT / "data" / "ch-municipalities.topojson"
OUTPUT_PATH = PROJECT_ROOT / "data" / "municipalities.json"

API_BASE = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/"
TAX_YEAR = 2025


def api_search(query, language=4):
    url = API_BASE + "API_searchLocation"
    payload = json.dumps({"Search": query, "Language": language, "TaxYear": TAX_YEAR}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    resp = json.loads(urllib.request.urlopen(req, timeout=15).read())
    return resp.get("response", [])


def load_topo_bfs_ids():
    with open(TOPO_PATH) as f:
        topo = json.load(f)
    geoms = topo["objects"]["municipalities"]["geometries"]
    return {g["id"] for g in geoms}


def search_by_postcode_prefixes():
    """Search ESTV API with 2-digit postcode prefixes to build BFS→location mapping."""
    results = {}

    def fetch_prefix(prefix):
        return api_search(str(prefix))

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_prefix, p): p for p in range(10, 100)}
        for fut in as_completed(futures):
            prefix = futures[fut]
            try:
                for r in fut.result():
                    bfs = r["BfsID"]
                    if bfs not in results:
                        results[bfs] = {
                            "name": r["City"],
                            "canton": r["Canton"],
                            "plz": r["ZipCode"],
                            "taxLocationId": r["TaxLocationID"],
                        }
            except Exception as e:
                print(f"  Error for prefix {prefix}: {e}", file=sys.stderr)

    return results


def search_missing_by_name(missing_bfs):
    """Try to find missing municipalities by searching common name prefixes."""
    found = {}

    search_terms = list("abcdefghijklmnopqrstuvwxyz") + [
        "St.", "Ober", "Unter", "Nieder", "Hoch", "Alt", "Neu",
        "Mont", "Val", "Riv", "Cor", "Pre", "Bel", "Cas",
    ]

    for term in search_terms:
        if not missing_bfs - set(found.keys()):
            break
        try:
            for r in api_search(term, language=1):
                bfs = r["BfsID"]
                if bfs in missing_bfs and bfs not in found:
                    found[bfs] = {
                        "name": r["City"],
                        "canton": r["Canton"],
                        "plz": r["ZipCode"],
                        "taxLocationId": r["TaxLocationID"],
                    }
        except Exception as e:
            print(f"  Error searching '{term}': {e}", file=sys.stderr)

    return found


def main():
    print("Loading TopoJSON BFS IDs...")
    topo_bfs = load_topo_bfs_ids()
    print(f"  {len(topo_bfs)} municipalities in TopoJSON")

    print("Searching by postcode prefixes (10-99)...")
    results = search_by_postcode_prefixes()
    print(f"  Found {len(results)} unique municipalities")

    missing = topo_bfs - set(results.keys())
    if missing:
        print(f"  {len(missing)} missing, trying name-based search...")
        extra = search_missing_by_name(missing)
        results.update(extra)
        print(f"  Found {len(extra)} more, total: {len(results)}")

    still_missing = topo_bfs - set(results.keys())
    if still_missing:
        print(f"  WARNING: {len(still_missing)} municipalities still without TaxLocationID")
        print(f"    Examples: {sorted(still_missing)[:10]}...")

    coverage = len(set(results.keys()) & topo_bfs)
    print(f"  Coverage: {coverage}/{len(topo_bfs)} ({coverage/len(topo_bfs)*100:.1f}%)")

    # Write output keyed by BFS number (as string)
    output = {str(bfs): data for bfs, data in sorted(results.items()) if bfs in topo_bfs}
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nWrote {len(output)} municipalities to {OUTPUT_PATH}")
    print(f"  File size: {OUTPUT_PATH.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
