"""Illustrative masterplan plots for the Calle 72 demo (not RenoBo's design).

Picks the city block (manzana) nearest to each anchor inside the AE24 polygon and derives massing
from the block outline: perimeter blocks with a courtyard, or a podium with a tower. Distances are
computed in Bogotá's local grid (EPSG:6247, metres).

  .venv/bin/python -I src/plots_calle72.py > data/calle72-plots.json
"""
import json, os, sys, urllib.parse, urllib.request
from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform

D = os.path.join(os.path.dirname(__file__), "..", "data")
to_m = Transformer.from_crs("EPSG:4326", "EPSG:6247", always_xy=True).transform
to_ll = Transformer.from_crs("EPSG:6247", "EPSG:4326", always_xy=True).transform
PREDIO = "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/lote/MapServer/3/query"

# id, name, anchor (lon, lat), kind, floors, podium floors, stage, homes, VIS share, uses, summary
PLOTS = [
    ("p1", "Intercambiador Calle 72", (-74.0632, 4.6612), "tower", 26, 5, "formulación", 420, 0.3,
     "vivienda, oficinas, comercio", "Torre de usos mixtos sobre plataforma comercial, conectada a las estaciones L1 E16 y L2 E1."),
    ("p2", "Estación NQS", (-74.0745, 4.6688), "block", 12, 0, "formulación", 380, 0.6,
     "vivienda VIS/VIP, comercio en primer piso", "Manzana perimetral junto a la estación 2 de la Línea 2, con patio interior abierto."),
    ("p3", "Borde Canal Salitre", (-74.0776, 4.6655), "block", 9, 0, "propuesta", 260, 0.7,
     "vivienda VIP, equipamiento", "Vivienda de escala media frente al corredor ecológico del canal."),
    ("p4", "San Felipe", (-74.0680, 4.6662), "block", 5, 0, "propuesta", 90, 0.2,
     "vivienda, talleres, galerías", "Baja altura para conservar la escala del distrito de arte de San Felipe."),
    ("p5", "Alcázares", (-74.0712, 4.6612), "block", 14, 0, "adoptado", 450, 0.5,
     "vivienda VIS, comercio", "Manzana de renovación sobre la calle 72 con fachada comercial continua."),
    ("p6", "Doce de Octubre", (-74.0822, 4.6722), "block", 10, 0, "propuesta", 300, 0.8,
     "vivienda VIS/VIP, jardín infantil", "Vivienda social con equipamiento de primera infancia en el borde occidental."),
]
FLOOR = 3.2


def barrio(manzana: str) -> str:
    q = urllib.parse.urlencode({"f": "json", "where": f"BARMANPRE LIKE '{manzana}%'",
                                "outFields": "PRENBARRIO", "returnGeometry": "false",
                                "resultRecordCount": 1})
    try:
        r = json.load(urllib.request.urlopen(f"{PREDIO}?{q}", timeout=60))
        name = r["features"][0]["attributes"]["PRENBARRIO"]
        return name.strip().title()
    except Exception:  # noqa: BLE001
        return ""


def ring(poly):
    """Largest exterior ring of a (multi)polygon as [[lon, lat]...] without the closing vertex."""
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area)
    coords = list(transform(to_ll, poly).exterior.coords)[:-1]
    return [[round(x, 7), round(y, 7)] for x, y in coords], poly


def main():
    blocks = json.load(open(os.path.join(D, "calle72-manzanas.geojson")))["features"]
    used = set()
    out = []
    for pid, name, anchor, kind, floors, podium, stage, homes, vis, uses, summary in PLOTS:
        a = transform(to_m, Point(anchor))
        best = None
        for f in blocks:
            code = f["properties"]["MANCODIGO"]
            if code in used:
                continue
            g = transform(to_m, shape(f["geometry"]))
            if not (2500 < g.area < 16000):
                continue
            d = g.centroid.distance(a)
            if best is None or d < best[0]:
                best = (d, code, g)
        _, code, block = best
        used.add(code)
        lot, _ = ring(block)
        outer = block.buffer(-3, join_style=2)
        volumes = []
        if kind == "block":
            court = outer.buffer(-14, join_style=2)
            o, _ = ring(outer)
            v = {"footprint": o, "height": round(floors * FLOOR, 1)}
            if not court.is_empty and court.area > 150:
                c, _ = ring(court)
                v["holes"] = [c]
            volumes.append(v)
        else:
            o, _ = ring(outer)
            volumes.append({"footprint": o, "height": round(podium * FLOOR, 1)})
            # Tower: a square of ~28 m centred in the podium, kept inside it.
            c = outer.centroid
            tower = Point(c.x, c.y).buffer(14, cap_style=3).intersection(outer.buffer(-4, join_style=2))
            t, _ = ring(tower)
            volumes.append({"footprint": t, "height": round(floors * FLOOR, 1)})
        out.append({
            "id": pid,
            "name": name,
            "summary": summary,
            "barrio": barrio(code),
            "manzana": code,
            "stage": stage,
            "homes": homes,
            "visShare": vis,
            "uses": uses,
            "floors": floors,
            "footprint": lot,
            "height": round(floors * FLOOR, 1),
            "volumes": volumes,
        })
        print(pid, name, code, out[-1]["barrio"], file=sys.stderr)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
