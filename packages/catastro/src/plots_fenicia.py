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
    m = 0.01  # degrees; large margins distort in the local Bogotá grid
    clip = box(w - m, lat_min if lat_min is not None else s - m, e + m, lat_max if lat_max is not None else n + m)
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


def axis(block):
    """Unit vector along the block's long axis (pointing west, towards Carrera 3), centre, half length."""
    rect = block.minimum_rotated_rectangle
    pts = list(rect.exterior.coords)[:4]
    edges = [(pts[i], pts[(i + 1) % 4]) for i in range(4)]
    a, b = max(edges, key=lambda e: math.dist(*e))
    half = math.dist(a, b) / 2
    ux, uy = (b[0] - a[0]) / (2 * half), (b[1] - a[1]) / (2 * half)
    if ux > 0:  # point west
        ux, uy = -ux, -uy
    return ux, uy, rect.centroid, half


def split(block, cuts):
    """Pieces of the block between successive cuts t in [0, 1] along the long axis, t=0 at the
    western end. Returns one piece per interval."""
    ux, uy, c, half = axis(block)
    vx, vy = -uy, ux
    out = []
    for t0, t1 in zip(cuts[:-1], cuts[1:]):
        d0, d1 = (t0 - 0.5) * 2 * half, (t1 - 0.5) * 2 * half
        w = 10 * half
        strip = Polygon([
            (c.x - ux * d0 + vx * w, c.y - uy * d0 + vy * w),
            (c.x - ux * d1 + vx * w, c.y - uy * d1 + vy * w),
            (c.x - ux * d1 - vx * w, c.y - uy * d1 - vy * w),
            (c.x - ux * d0 - vx * w, c.y - uy * d0 - vy * w),
        ])
        out.append(block.intersection(strip))
    return out


def phased(piece, floors, phase, setback=2.0, depth=12.0):
    """A perimeter-block volume on a phase piece, clipping the existing city by the whole piece."""
    v = perimeter(piece, floors, setback, depth)
    v["phase"] = phase
    v["clip"] = ring(piece)
    return v


uau1 = unary_union([lat_cut(blocks["013"], lat_max=4.6058), blocks["012"]])
uau5 = blocks["002"]
uau5_e3 = blocks["038"]
uau2 = blocks["004"]
uau3 = blocks["026"]

plots = []

# Unit 1: two stages. Stage 1 on the former Blindex plant (north), stage 2 the smaller south end.
u1_e1, u1_e2 = split(uau1, [0, 0.68, 1])
plots.append({
    "id": "uau1", "name": "UAU 1 · Vivienda y comercio vecinal",
    "summary": "Edificio de comercio vecinal y vivienda con patios interiores, en dos etapas.",
    "stage": "adoptado", "uses": "comercio vecinal, vivienda de reemplazo y venta, VIP", "floors": 12,
    "footprint": ring(uau1), "height": round(12 * FLOOR, 1),
    "phases": [
        {"n": 1, "label": "Etapa 1 · reemplazo", "summary": "Sobre el predio de la antigua planta Blindex: unidades de reemplazo para residentes y comercio vecinal."},
        {"n": 2, "label": "Etapa 2 · venta y VIP", "summary": "Sobre viviendas y parqueaderos actuales: vivienda para venta y 20 VIP con acceso propio por la carrera 1."},
    ],
    "volumes": [phased(u1_e1, 12, 1), phased(u1_e2, 12, 2, depth=9)],
})

# Unit 5: stage 1 on low-density lots, stage 2 on three existing PH buildings, stage 3 VIP to the east.
u5_e2, u5_e1 = split(uau5, [0, 0.55, 1])
plots.append({
    "id": "uau5", "name": "UAU 5 · Vivienda con patio",
    "summary": "Vivienda y comercio vecinal con un patio interior, en tres etapas.",
    "stage": "adoptado", "uses": "comercio vecinal, vivienda, VIP", "floors": 10,
    "footprint": ring(unary_union([uau5, uau5_e3])), "height": round(10 * FLOOR, 1),
    "phases": [
        {"n": 1, "label": "Etapa 1 · reemplazo", "summary": "Sobre parqueaderos y construcciones de baja densidad."},
        {"n": 2, "label": "Etapa 2", "summary": "Sobre tres edificios de vivienda en propiedad horizontal, una vez reubicados sus residentes."},
        {"n": 3, "label": "Etapa 3 · VIP", "summary": "VIP conectadas por puentes con la UAU 1: aprovechando la pendiente, hasta 10 pisos sin ascensor."},
    ],
    "volumes": [
        phased(u5_e1, 10, 1, depth=9),
        phased(u5_e2, 10, 2, depth=9),
        {"footprint": ring(uau5_e3.buffer(-2, join_style=2)), "height": round(10 * FLOOR, 1), "phase": 3, "clip": ring(uau5_e3)},
    ],
})

# Unit 2: stage 1 east (Sagrada Familia car park, Filarmónica lot) with the replacement tower,
# stage 2 the far east end (Multifamiliares Calle 20) with the sale tower, stage 3 the west with the hotel.
u2_e3, u2_e1, u2_e2 = split(uau2, [0, 0.38, 0.72, 1])
hotel, res1, res2 = towers_on_axis(uau2, [0.14, 0.5, 0.84], 28)


def platform(piece, phase):
    return {"footprint": ring(piece.buffer(-3, join_style=2)), "height": round(6 * FLOOR, 1), "phase": phase, "clip": ring(piece)}


plots.append({
    "id": "uau2", "name": "UAU 2 · Hotel y torres de vivienda",
    "summary": "Complejo de usos mixtos de escala metropolitana: plataforma de seis pisos con comercio y oficinas, dos torres de vivienda y un hotel de 40 pisos hacia la carrera 3, con plazoleta longitudinal.",
    "stage": "adoptado", "uses": "hotel, oficinas, comercio metropolitano y vecinal, vivienda", "floors": 40,
    "footprint": ring(uau2), "height": round(40 * FLOOR, 1),
    "phases": [
        {"n": 1, "label": "Etapa 1 · torre de reemplazo", "summary": "Sobre el parqueadero de la Sagrada Familia y el predio de la Orquesta Filarmónica: plataforma y torre de vivienda de reemplazo."},
        {"n": 2, "label": "Etapa 2 · torre de venta", "summary": "Sobre el conjunto Multifamiliares Calle 20: plataforma y torre de vivienda para venta."},
        {"n": 3, "label": "Etapa 3 · hotel", "summary": "Resto de la manzana 4: plataforma y hotel de 40 pisos hacia la carrera 3."},
    ],
    "volumes": [
        platform(u2_e1, 1),
        {"footprint": ring(res1), "height": round(26 * FLOOR, 1), "phase": 1},
        platform(u2_e2, 2),
        {"footprint": ring(res2), "height": round(26 * FLOOR, 1), "phase": 2},
        platform(u2_e3, 3),
        {"footprint": ring(hotel), "height": round(40 * FLOOR, 1), "phase": 3},
    ],
})

# Unit 3: two stages (south first, then north), per the 2015 stage map.
u3_e1 = lat_cut(uau3, lat_max=4.6039)
u3_e2 = lat_cut(uau3, lat_min=4.6039)
plots.append({
    "id": "uau3", "name": "UAU 3 · Universidad de los Andes",
    "summary": "Edificio dotacional de escala metropolitana (al menos 19.125 m²) para la Universidad de los Andes, con parqueaderos propios, comercio vecinal en los accesos y una plaza central.",
    "stage": "adoptado", "uses": "dotacional universitario, parqueaderos, comercio vecinal", "floors": 7,
    "footprint": ring(uau3), "height": round(7 * FLOOR, 1),
    "phases": [
        {"n": 1, "label": "Etapa 1", "summary": "Primera fase del edificio universitario, al sur, con parqueaderos."},
        {"n": 2, "label": "Etapa 2", "summary": "Segunda fase al norte, cerrando la plaza central."},
    ],
    "volumes": [phased(u3_e1, 7, 1, setback=4, depth=14), phased(u3_e2, 7, 2, setback=4, depth=14)],
})

json.dump(plots, sys.stdout, ensure_ascii=False, indent=2)
