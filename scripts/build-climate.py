#!/usr/bin/env python3
"""
Aggregate MeteoSwiss 2km climate grid normals (1991-2020) to municipality polygons.

Downloads GeoTIFFs from data.geo.admin.ch, uses swiss-maps shapefiles for municipality
boundaries, and outputs data/climate.json keyed by BFS number.

Usage: python3 scripts/build-climate.py

Requires: xarray, rioxarray, netCDF4, geopandas, rasterstats
"""

import json
import sys
import tempfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import rioxarray
import xarray as xr
from rasterstats import zonal_stats

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = PROJECT_ROOT / "data" / "climate.json"

# MeteoSwiss NetCDF URLs (yearly normals 1991-2020, EPSG:2056)
DATASETS = {
    "precip": {
        "url": "https://data.geo.admin.ch/ch.meteoschweiz.klimanormwerte-niederschlag_aktuelle_periode/klimanormwerte-niederschlag_aktuelle_periode/klimanormwerte-niederschlag_aktuelle_periode_yearly_2056.nc",
        "var": "RnormY9120",
        "unit": "mm/yr",
        "monthly": False,
    },
    "sunshine": {
        "url": "https://data.geo.admin.ch/ch.meteoschweiz.klimanormwerte-sonnenscheindauer_aktuelle_periode/klimanormwerte-sonnenscheindauer_aktuelle_periode/klimanormwerte-sonnenscheindauer_aktuelle_periode_monthly_2056.nc",
        "var": "SnormM9120",
        "unit": "%",
        "monthly": True,  # 12 months, need annual mean
    },
    "temp": {
        "url": "https://data.geo.admin.ch/ch.meteoschweiz.klimanormwerte-temperatur_aktuelle_periode/klimanormwerte-temperatur_aktuelle_periode/klimanormwerte-temperatur_aktuelle_periode_yearly_2056.nc",
        "var": "TnormY9120",
        "unit": "°C",
        "monthly": False,
    },
}


def download_nc(url, dest):
    """Download NetCDF file if not already cached."""
    if dest.exists():
        print(f"  Using cached {dest.name}")
        return
    import urllib.request
    print(f"  Downloading {dest.name}...")
    urllib.request.urlretrieve(url, str(dest))


def nc_to_tif(nc_path, var_name, monthly, tif_path):
    """Convert NetCDF variable to GeoTIFF for rasterstats."""
    ds = xr.open_dataset(str(nc_path), decode_times=False)
    da = ds[var_name]

    if monthly:
        da = da.mean(dim="time")
    else:
        da = da.isel(time=0)

    # Flip N axis so it goes north-to-south (required for GeoTIFF top-down convention)
    da = da.sortby("N", ascending=False)

    # Set spatial dims and CRS
    da = da.rio.set_spatial_dims(x_dim="E", y_dim="N")
    da = da.rio.write_crs("EPSG:2056")
    da.rio.to_raster(str(tif_path))
    ds.close()
    return da


def load_municipality_polygons():
    """Load municipality polygons from swiss-maps package."""
    shp_path = Path("/tmp/package/2025/municipalities.shp")
    if not shp_path.exists():
        # Download swiss-maps if not already available
        import tarfile
        import urllib.request
        print("  Downloading swiss-maps package...")
        tgz_path = "/tmp/swiss-maps.tgz"
        urllib.request.urlretrieve(
            "https://registry.npmjs.org/swiss-maps/-/swiss-maps-4.7.0.tgz", tgz_path
        )
        with tarfile.open(tgz_path) as tar:
            tar.extractall("/tmp")

    gdf = gpd.read_file(str(shp_path))
    # The DBF has columns: id (BFS number), name (empty), KTNR (canton number)
    gdf = gdf.to_crs(epsg=2056)
    return gdf


def main():
    cache_dir = Path("/tmp/climate-data")
    cache_dir.mkdir(exist_ok=True)

    print("Loading municipality polygons...")
    gdf = load_municipality_polygons()
    print(f"  {len(gdf)} municipalities")

    climate = {}

    for field_name, cfg in DATASETS.items():
        print(f"\nProcessing {field_name} ({cfg['var']})...")

        nc_path = cache_dir / f"{field_name}.nc"
        tif_path = cache_dir / f"{field_name}_processed.tif"

        download_nc(cfg["url"], nc_path)
        da = nc_to_tif(nc_path, cfg["var"], cfg["monthly"], tif_path)

        print(f"  Running zonal statistics...")
        stats = zonal_stats(
            gdf.geometry,
            str(tif_path),
            stats=["mean"],
            nodata=da.rio.nodata if da.rio.nodata is not None else -9999,
            all_touched=True,
        )

        for i, row in gdf.iterrows():
            bfs = str(int(row["id"]))
            if bfs not in climate:
                climate[bfs] = {}

            mean_val = stats[i]["mean"]
            if mean_val is not None and not np.isnan(mean_val):
                if field_name == "temp":
                    climate[bfs][field_name] = round(float(mean_val), 1)
                elif field_name == "sunshine":
                    # Value is % of possible sunshine; convert to approx hours/year
                    # Swiss max possible sunshine ~4400 hours/year
                    climate[bfs][field_name] = round(float(mean_val) / 100 * 4400)
                else:
                    climate[bfs][field_name] = round(float(mean_val))

        covered = sum(1 for bfs in climate if field_name in climate[bfs])
        print(f"  {covered} municipalities with data")

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(climate, f, separators=(",", ":"))

    print(f"\nWrote {len(climate)} municipalities to {OUTPUT_PATH}")
    print(f"  File size: {OUTPUT_PATH.stat().st_size:,} bytes")

    # Quick sanity check
    sample_bfs = "261"  # Zürich
    if sample_bfs in climate:
        print(f"  Zürich (BFS {sample_bfs}): {climate[sample_bfs]}")


if __name__ == "__main__":
    main()
