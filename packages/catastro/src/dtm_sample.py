"""Sample the Catastro Bogotá urban DTM (0.5 m, EAAB/UAECD) on a regular grid and write a GeoTIFF.

The MapServer exposes no raster download, but `identify` returns the pixel value at a point, so we
sample a grid in parallel. Heights are orthometric (metres above sea level).

  .venv/bin/python src/dtm_sample.py --bbox=-74.062,4.649,-74.047,4.662 --step 8 --out data/chapinero-dtm.tif
"""
import argparse, json, math, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import rasterio
from rasterio.transform import from_origin

URL = "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/topografia/modelodigitalterrenobogotaurbano/MapServer/identify"

def sample(lon, lat, tries=4):
    q = urllib.parse.urlencode({
        "f": "json", "geometry": json.dumps({"x": lon, "y": lat}), "geometryType": "esriGeometryPoint",
        "sr": 4326, "layers": "all", "tolerance": 1, "mapExtent": f"{lon-0.001},{lat-0.001},{lon+0.001},{lat+0.001}",
        "imageDisplay": "400,400,96", "returnGeometry": "false"})
    for t in range(tries):
        try:
            with urllib.request.urlopen(f"{URL}?{q}", timeout=60) as r:
                d = json.load(r)
            res = d.get("results") or []
            if not res:
                return float("nan")
            return float(res[0]["attributes"]["Stretch.Pixel Value"])
        except Exception as e:  # noqa: BLE001
            if t == tries - 1:
                print("fail", lon, lat, e, file=sys.stderr)
                return float("nan")
            time.sleep(0.5 * (t + 1))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--step", type=float, default=8, help="metres")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=32)
    a = ap.parse_args()
    w, s, e, n = map(float, a.bbox.split(","))
    lat0 = (s + n) / 2
    dlat = a.step / 110574
    dlon = a.step / (111320 * math.cos(math.radians(lat0)))
    cols = int(math.ceil((e - w) / dlon)); rows = int(math.ceil((n - s) / dlat))
    print(f"{cols}x{rows} = {cols*rows} samples at {a.step} m", flush=True)
    pts = [(w + (i + 0.5) * dlon, n - (j + 0.5) * dlat) for j in range(rows) for i in range(cols)]
    t0 = time.time(); vals = []
    with ThreadPoolExecutor(a.workers) as ex:
        for k, v in enumerate(ex.map(lambda p: sample(*p), pts)):
            vals.append(v)
            if k % 5000 == 0:
                print(f"{k}/{len(pts)} {time.time()-t0:.0f}s", flush=True)
    grid = np.array(vals, dtype=np.float32).reshape(rows, cols)
    nan = np.isnan(grid)
    if nan.any():
        # Fill holes from the nearest valid sample.
        from scipy import ndimage
        idx = ndimage.distance_transform_edt(nan, return_distances=False, return_indices=True)
        grid = grid[tuple(idx)]
    print(f"range {np.nanmin(grid):.1f}–{np.nanmax(grid):.1f} m, {int(nan.sum())} holes filled", flush=True)
    with rasterio.open(a.out, "w", driver="GTiff", height=rows, width=cols, count=1, dtype="float32",
                       crs="EPSG:4326", transform=from_origin(w, n, dlon, dlat), compress="deflate") as dst:
        dst.write(grid, 1)
    print("wrote", a.out, flush=True)

if __name__ == "__main__":
    main()
