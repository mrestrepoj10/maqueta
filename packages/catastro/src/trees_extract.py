"""Cut the Jardín Botánico tree census (1.47 M trees, CC BY) to a bounding box.

The census REST service is capped at 100 records and its WFS ignores bbox filters, so we read
the published shapefile. The zip is downloaded once into data/.

  .venv/bin/python src/trees_extract.py --bbox=-74.060,4.651,-74.049,4.660 --out data/chapinero-trees.json
"""
import argparse, glob, json, os, urllib.request, zipfile
import shapefile

URL = ("https://datosabiertos.bogota.gov.co/dataset/18721a34-0b1c-4399-bf2c-5f03fe5ef21a/resource/"
       "5a965d93-c623-40df-87e0-747cb51a1f5d/download/arboladourbano.zip")
DATA = os.path.join(os.path.dirname(__file__), "..", "data")

def shp_path():
    os.makedirs(DATA, exist_ok=True)
    found = glob.glob(os.path.join(DATA, "arbolado", "*.shp"))
    if found:
        return found[0]
    z = os.path.join(DATA, "arboladourbano.zip")
    if not os.path.exists(z):
        print("downloading census (~60 MB)…", flush=True)
        urllib.request.urlretrieve(URL, z)
    with zipfile.ZipFile(z) as f:
        f.extractall(os.path.join(DATA, "arbolado"))
    return glob.glob(os.path.join(DATA, "arbolado", "*.shp"))[0]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    w, s, e, n = map(float, a.bbox.split(","))
    r = shapefile.Reader(shp_path())
    names = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        if not sr.shape.points:
            continue
        x, y = sr.shape.points[0]
        if not (w <= x <= e and s <= y <= n):
            continue
        rec = dict(zip(names, sr.record))
        h = rec.get("Altura_Tot")
        out.append({
            "lon": round(x, 7), "lat": round(y, 7),
            "height": round(float(h), 1) if h else None,
            "species": (rec.get("Nombre_Esp") or "").strip(),
        })
    with open(a.out, "w") as f:
        json.dump(out, f)
    print(f"{len(out)} trees -> {a.out}")

if __name__ == "__main__":
    main()
