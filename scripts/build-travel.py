#!/usr/bin/env python3
"""
Build travel time data: municipality → {ov_zurich, car_zurich, ov_nearest, car_nearest, nearest_centre}.

Uses ARE "Reisezeit zu 6 grossen Zentren" GeoPackage data.
Traffic zones are mapped to municipalities via spatial join.

Usage: python3 scripts/build-travel.py
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "data" / "travel.json"

CENTRES = {
    26101201: "Zürich",
    35101052: "Bern",
    270101060: "Basel",
    519201018: "Lugano",
    558601044: "Lausanne",
    662101061: "Genève",
}

ZURICH_ZONE = 26101201


def download_if_needed(url, dest):
    if dest.exists():
        print(f"  Using cached {dest.name}")
        return
    import urllib.request
    print(f"  Downloading {dest.name}...")
    urllib.request.urlretrieve(url, str(dest))


def main():
    cache_dir = Path("/tmp/travel-data")
    cache_dir.mkdir(exist_ok=True)

    # Download ARE data
    print("Downloading ARE travel time data...")
    oev_path = cache_dir / "reisezeit-oev.gpkg"
    download_if_needed(
        "https://data.geo.admin.ch/ch.are.reisezeit-oev/reisezeit-oev/reisezeit-oev_2056.gpkg",
        oev_path,
    )

    # Load data
    print("Loading travel time zones...")
    gdf = gpd.read_file(str(oev_path), layer="Reisezeit_Erreichbarkeit")
    print(f"  {len(gdf)} traffic zones")

    # Load municipality polygons
    print("Loading municipality polygons...")
    shp_path = Path("/tmp/package/2025/municipalities.shp")
    if not shp_path.exists():
        import tarfile
        import urllib.request
        print("  Downloading swiss-maps package...")
        tgz_path = "/tmp/swiss-maps.tgz"
        urllib.request.urlretrieve(
            "https://registry.npmjs.org/swiss-maps/-/swiss-maps-4.7.0.tgz", tgz_path
        )
        with tarfile.open(tgz_path) as tar:
            tar.extractall("/tmp")

    munis = gpd.read_file(str(shp_path)).to_crs(epsg=2056)
    print(f"  {len(munis)} municipalities")

    # Spatial join: zone centroids → municipality polygons
    print("Mapping zones to municipalities...")
    zone_centroids = gdf.copy()
    zone_centroids["geometry"] = gdf.geometry.centroid
    joined = gpd.sjoin(zone_centroids, munis, how="left", predicate="within")

    # Build per-municipality travel data
    print("Aggregating travel times...")
    travel = {}

    for bfs_id, group in joined.groupby("id"):
        bfs = str(int(bfs_id))

        # Zürich-specific (where Zürich is nearest centre)
        zh_rows = group[group["OeV_No_Z"] == ZURICH_ZONE]
        ov_zh = int(zh_rows["OeV_Reisezeit_Z"].min()) if len(zh_rows) > 0 else None
        car_zh = int(zh_rows["Strasse_Reisezeit_Z"].min()) if len(zh_rows) > 0 else None

        # Nearest centre (any of the 6)
        ov_nearest = int(group["OeV_Reisezeit_Z"].min())
        car_nearest = int(group["Strasse_Reisezeit_Z"].min())

        # Which centre is nearest (by ÖV)
        nearest_row = group.loc[group["OeV_Reisezeit_Z"].idxmin()]
        nearest_centre_id = int(nearest_row["OeV_No_Z"])
        nearest_centre = CENTRES.get(nearest_centre_id, "?")

        entry = {
            "ov": ov_nearest,       # ÖV to nearest major centre
            "car": car_nearest,     # Car to nearest major centre
            "centre": nearest_centre,  # Which centre
        }
        if ov_zh is not None:
            entry["ovZh"] = ov_zh   # ÖV to Zürich (if Zürich is nearest)
        if car_zh is not None:
            entry["carZh"] = car_zh  # Car to Zürich (if Zürich is nearest)

        travel[bfs] = entry

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(travel, f, separators=(",", ":"))

    zh_count = sum(1 for v in travel.values() if "ovZh" in v)
    print(f"\nWrote {len(travel)} municipalities to {OUTPUT_PATH}")
    print(f"  File size: {OUTPUT_PATH.stat().st_size:,} bytes")
    print(f"  With Zürich-specific data: {zh_count}")
    print(f"  With nearest-centre data: {len(travel)}")

    # Sanity check
    for bfs, name in [("261", "Zürich"), ("351", "Bern"), ("5586", "Zug")]:
        if bfs in travel:
            t = travel[bfs]
            zh = f"ÖV {t.get('ovZh', '-')} / Car {t.get('carZh', '-')} min to ZH"
            nearest = f"ÖV {t['ov']} / Car {t['car']} min to {t['centre']}"
            print(f"  {name}: {zh} | {nearest}")


if __name__ == "__main__":
    main()
