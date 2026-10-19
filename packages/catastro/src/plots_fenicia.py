"""Unit massing for the Triángulo de Fenicia site, reconstructed from the 2015 "Esquemas básicos de
implantación arquitectónica para las UAU 1, 2, 3 y 5" (Imagine Consultores for Progresa Fenicia,
Universidad de los Andes) on real Catastro city blocks. Approximate; not the final project.

  .venv/bin/python -I src/plots_fenicia.py > data/fenicia-plots.json
"""
import json, math, os, sys
from pyproj import Transformer
from shapely import affinity
from shapely.geometry import Polygon, box, shape
from shapely.ops import transform, unary_union

D = os.path.join(os.path.dirname(__file__), "..", "data")
to_m = Transformer.from_crs("EPSG:4326", "EPSG:6247", always_xy=True).transform
to_ll = Transformer.from_crs("EPSG:6247", "EPSG:4326", always_xy=True).transform
FLOOR = 3.2

blocks = {
    f["properties"]["MANCODIGO"][-3:]: transform(to_m, shape(f["geometry"]))
    for f in json.load(open(os.path.join(D, "fenicia-manzanas.geojson")))["features"]
}


def ring(poly):
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area)
    return [[round(x, 7), round(y, 7)] for x, y in list(transform(to_ll, poly).exterior.coords)[:-1]]


def lat_cut(geom, lat_max=None, lat_min=None):
    """Clip a metric geometry by latitude limits (WGS84)."""
    w, s, e, n = transform(to_ll, geom).bounds
    clip = box(w - 1, lat_min if lat_min is not None else s - 1, e + 1, lat_max if lat_max is not None else n + 1)
    return geom.intersection(transform(to_m, clip))


def perimeter(block, floors, setback=2.0, depth=12.0):
    outer = block.buffer(-setback, join_style=2)
    court = outer.buffer(-depth, join_style=2)
    v = {"footprint": ring(outer), "height": round(floors * FLOOR, 1)}
    if not court.is_empty and court.area > 120:
        v["holes"] = [ring(court)]
    return v


def towers_on_axis(block, positions, size):
    """Square towers centred along the block's long axis, aligned with it."""
    rect = block.minimum_rotated_rectangle
    pts = list(rect.exterior.coords)[:4]
    edges = [(pts[i], pts[(i + 1) % 4]) for i in range(4)]
    a, b = max(edges, key=lambda e: math.dist(*e))
    angle = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    c = rect.centroid
    half = math.dist(a, b) / 2
    ux, uy = (b[0] - a[0]) / (2 * half), (b[1] - a[1]) / (2 * half)
    # Put t=0 at the western end (towards Carrera 3).
    if a[0] > b[0]:
        ux, uy = -ux, -uy
    out = []
    for t in positions:
        cx, cy = c.x + ux * (t - 0.5) * 2 * half, c.y + uy * (t - 0.5) * 2 * half
        sq = Polygon([(-size / 2, -size / 2), (size / 2, -size / 2), (size / 2, size / 2), (-size / 2, size / 2)])
        sq = affinity.translate(affinity.rotate(sq, angle, origin=(0, 0)), cx, cy)
        out.append(sq.intersection(block.buffer(-6, join_style=2)))
    return out


uau1 = unary_union([lat_cut(blocks["013"], lat_max=4.6058), blocks["012"]])
uau5 = blocks["002"]
uau5_e3 = blocks["038"]
uau2 = blocks["004"]
uau3 = blocks["026"]

plots = []

# Unit 1: neighbourhood commerce and housing around courtyards, two stages, plus 20 VIP homes.
plots.append({
    "id": "uau1", "name": "UAU 1 · Vivienda y comercio vecinal",
    "summary": "Edificio de comercio vecinal y vivienda con patios interiores. Etapa 1 en el predio de la antigua planta Blindex, para unidades de reemplazo; etapa 2 para venta, con 20 viviendas VIP con acceso propio por la carrera 1.",
    "stage": "adoptado", "uses": "comercio vecinal, vivienda de reemplazo y venta, VIP", "floors": 12,
    "footprint": ring(uau1), "height": round(12 * FLOOR, 1),
    "volumes": [perimeter(uau1, 12)],
})

# Unit 5: same typology, three stages; VIP up to 10 floors without lifts thanks to the slope.
plots.append({
    "id": "uau5", "name": "UAU 5 · Vivienda con patio",
    "summary": "Vivienda y comercio vecinal con un patio interior, en tres etapas. La etapa 3 suma VIP conectadas por puentes con la UAU 1: aprovechando la pendiente, hasta 10 pisos sin ascensor.",
    "stage": "adoptado", "uses": "comercio vecinal, vivienda, VIP", "floors": 10,
    "footprint": ring(uau5), "height": round(10 * FLOOR, 1),
    "volumes": [perimeter(uau5, 10), {"footprint": ring(uau5_e3.buffer(-2, join_style=2)), "height": round(10 * FLOOR, 1)}],
})

# Unit 2: metropolitan mixed use. 6-floor platform, 40-floor hotel towards Carrera 3, two housing towers.
platform = uau2.buffer(-3, join_style=2)
hotel, res1, res2 = towers_on_axis(uau2, [0.14, 0.5, 0.82], 28)
plots.append({
    "id": "uau2", "name": "UAU 2 · Hotel y torres de vivienda",
    "summary": "Complejo de usos mixtos de escala metropolitana: plataforma de seis pisos con comercio y oficinas, hotel de 40 pisos hacia la carrera 3 y dos torres de vivienda (una de reemplazo, otra de venta), con plazoleta longitudinal.",
    "stage": "adoptado", "uses": "hotel, oficinas, comercio metropolitano y vecinal, vivienda", "floors": 40,
    "footprint": ring(uau2), "height": round(40 * FLOOR, 1),
    "volumes": [
        {"footprint": ring(platform), "height": round(6 * FLOOR, 1)},
        {"footprint": ring(hotel), "height": round(40 * FLOOR, 1)},
        {"footprint": ring(res1), "height": round(26 * FLOOR, 1)},
        {"footprint": ring(res2), "height": round(26 * FLOOR, 1)},
    ],
})

# Unit 3: Universidad de los Andes, at least 19,125 m2 of metropolitan facilities, parking, a central plaza.
plots.append({
    "id": "uau3", "name": "UAU 3 · Universidad de los Andes",
    "summary": "Edificio dotacional de escala metropolitana (al menos 19.125 m²) para la Universidad de los Andes, con parqueaderos propios, comercio vecinal en los accesos y una plaza central.",
    "stage": "adoptado", "uses": "dotacional universitario, parqueaderos, comercio vecinal", "floors": 7,
    "footprint": ring(uau3), "height": round(7 * FLOOR, 1),
    "volumes": [perimeter(uau3, 7, setback=4, depth=16)],
})

json.dump(plots, sys.stdout, ensure_ascii=False, indent=2)
