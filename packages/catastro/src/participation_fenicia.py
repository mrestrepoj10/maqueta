"""Simulated participation for the Fenicia demo: survey answers and pinned comments from five
personas grounded in the plan's real tensions (replacement housing, closed shops during works,
the hotel tower's shadow, the central plaza, the San Francisco river). Every record has
simulated=true; the app labels them "aportes simulados". Deterministic (fixed seed).

  .venv/bin/python -I src/participation_fenicia.py > ../../apps/web/sites/fenicia.responses.json
"""
import json, os, random, sys
from datetime import datetime, timedelta
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform

random.seed(72)
SITE = os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "web", "sites", "fenicia.json")
plots = {p["id"]: p for p in json.load(open(SITE))["proposals"]}
to_m = Transformer.from_crs("EPSG:4326", "EPSG:6247", always_xy=True).transform
to_ll = Transformer.from_crs("EPSG:6247", "EPSG:4326", always_xy=True).transform
areas = {pid: transform(to_m, shape({"type": "Polygon", "coordinates": [p["footprint"] + [p["footprint"][0]]]})) for pid, p in plots.items()}

PLOT_WEIGHTS = {"uau2": 0.34, "uau1": 0.26, "uau5": 0.2, "uau3": 0.2}
ACTORS = {"propietario": 0.27, "arrendatario": 0.24, "comerciante": 0.17, "estudiante": 0.22, "visitante": 0.1}
WORKSHOPS = {"si": 0.22, "horario": 0.41, "nosabia": 0.24, "otra": 0.13}

# Preferences per actor: weights over options, picked without replacement.
PRIMER_PISO = {
    "propietario": {"vecinal": 5, "mercado": 3, "cafes": 1, "salud": 4, "jardin": 3},
    "arrendatario": {"vecinal": 4, "mercado": 4, "cafes": 1, "salud": 3, "jardin": 4},
    "comerciante": {"vecinal": 8, "mercado": 5, "cafes": 3, "salud": 1, "jardin": 1},
    "estudiante": {"vecinal": 2, "mercado": 2, "cafes": 7, "salud": 1, "jardin": 1},
    "visitante": {"vecinal": 2, "mercado": 3, "cafes": 5, "salud": 1, "jardin": 1},
}
PLAZA = {
    "propietario": {"verde": 6, "juegos": 4, "campesino": 3, "gimnasio": 2, "cultura": 1, "rio": 3},
    "arrendatario": {"verde": 5, "juegos": 5, "campesino": 3, "gimnasio": 2, "cultura": 2, "rio": 2},
    "comerciante": {"verde": 3, "juegos": 2, "campesino": 6, "gimnasio": 1, "cultura": 2, "rio": 1},
    "estudiante": {"verde": 5, "juegos": 1, "campesino": 2, "gimnasio": 4, "cultura": 6, "rio": 5},
    "visitante": {"verde": 4, "juegos": 2, "campesino": 3, "gimnasio": 2, "cultura": 4, "rio": 4},
}
LENGUAJE = {
    "propietario": {"ladrillo": 7, "moderno": 2, "verde": 4, "colorido": 1, "industrial": 1},
    "arrendatario": {"ladrillo": 5, "moderno": 3, "verde": 4, "colorido": 2, "industrial": 1},
    "comerciante": {"ladrillo": 5, "moderno": 4, "verde": 2, "colorido": 2, "industrial": 1},
    "estudiante": {"ladrillo": 2, "moderno": 4, "verde": 6, "colorido": 3, "industrial": 3},
    "visitante": {"ladrillo": 4, "moderno": 3, "verde": 4, "colorido": 3, "industrial": 2},
}
REEMPLAZO = {
    "propietario": {"si": 3, "parcial": 5, "no": 3, "na": 0},
    "arrendatario": {"si": 1, "parcial": 3, "no": 6, "na": 1},
    "comerciante": {"si": 2, "parcial": 5, "no": 3, "na": 1},
    "estudiante": {"si": 0, "parcial": 0, "no": 0, "na": 1},
    "visitante": {"si": 0, "parcial": 0, "no": 0, "na": 1},
}
SOMBRA = {"propietario": 4.2, "arrendatario": 3.9, "comerciante": 3.1, "estudiante": 2.6, "visitante": 2.8}

COMMENTS = {
    "uau2": {
        "preocupaciones": [
            ("propietario", "La torre de 40 pisos le quita el sol de la tarde a la calle 20 y a las casas de enfrente."),
            ("arrendatario", "Con el hotel van a subir los arriendos y los que vivimos en arriendo no tenemos dónde ir."),
            ("comerciante", "Si cierran la carrera 1 durante la obra, mi tienda no aguanta dos años sin clientes."),
            ("propietario", "¿Dónde van a parquear los huéspedes del hotel? Ya no hay cupos en el barrio."),
            ("visitante", "Ojalá la plataforma no sea un muro cerrado hacia la calle; que tenga vida en el primer piso."),
        ],
        "ideas": [
            ("comerciante", "Que la plataforma tenga locales pequeños para los comerciantes que ya están aquí, a precio justo."),
            ("estudiante", "La plazoleta sobre la carrera 1 puede ser un lugar para quedarse, con sombra de árboles y bancas."),
            ("propietario", "Que la torre de reemplazo se construya primero y nos muestren el apartamento antes de firmar."),
        ],
    },
    "uau1": {
        "preocupaciones": [
            ("propietario", "Llevo 40 años en Las Aguas. Necesito saber en qué piso y con qué área queda mi apartamento de reemplazo."),
            ("arrendatario", "El reemplazo es para propietarios. ¿Qué pasa con los que arrendamos aquí hace años?"),
            ("propietario", "Los patios interiores deben tener luz; en el barrio siempre hemos tenido ventanas a la calle."),
        ],
        "ideas": [
            ("arrendatario", "Que parte de la etapa 2 sea vivienda en arriendo a precio regulado para quienes ya vivimos aquí."),
            ("comerciante", "Locales en el primer piso hacia la carrera 2 para los negocios que hoy están en la manzana."),
        ],
    },
    "uau5": {
        "preocupaciones": [
            ("propietario", "Las VIP de 10 pisos sin ascensor no sirven para personas mayores."),
            ("arrendatario", "Los tres edificios de la etapa 2 tienen familias; ¿a dónde van mientras construyen?"),
        ],
        "ideas": [
            ("propietario", "Los puentes entre la UAU 1 y la UAU 5 pueden ser jardines comunitarios."),
            ("estudiante", "Aprovechar la pendiente para terrazas verdes que se vean desde la Circunvalar."),
        ],
    },
    "uau3": {
        "preocupaciones": [
            ("propietario", "La universidad crece y el barrio se vuelve solo para estudiantes."),
            ("comerciante", "Si la universidad pone sus propios cafés, nuestros negocios pierden a sus clientes."),
        ],
        "ideas": [
            ("estudiante", "La plaza central debería estar abierta a todo el barrio, no solo a la universidad."),
            ("visitante", "Recuperar el río San Francisco con un sendero entre la plaza y la avenida Jiménez."),
            ("estudiante", "Un escenario cultural en la plaza para conciertos y ferias del barrio."),
        ],
    },
}


def pick(weights):
    keys = list(weights)
    return random.choices(keys, weights=[weights[k] for k in keys])[0]


def pick_many(weights, k):
    pool = {o: w for o, w in weights.items() if w > 0}
    out = []
    for _ in range(min(k, len(pool))):
        o = pick(pool)
        out.append(o)
        pool.pop(o)
    return out


def point_near(pid):
    area = areas[pid]
    zone = area.buffer(18).difference(area.buffer(2))  # streets and edges around the plot
    w, s, e, n = zone.bounds
    while True:
        p = Point(random.uniform(w, e), random.uniform(s, n))
        if zone.contains(p):
            lon, lat = to_ll(p.x, p.y)
            return [round(lon, 7), round(lat, 7)]


def when():
    # Four weeks, with a spike in the days after the 6 October socialización.
    start = datetime(2026, 9, 22, 7)
    if random.random() < 0.45:
        d = datetime(2026, 10, 6, 18) + timedelta(hours=random.uniform(0, 96))
    else:
        d = start + timedelta(hours=random.uniform(0, 27 * 24))
    # People answer after work: push most answers into the evening.
    if random.random() < 0.6:
        d = d.replace(hour=random.choice([19, 20, 21, 22]))
    return d.isoformat()


responses = []
n = 312
for i in range(n):
    plot = pick(PLOT_WEIGHTS)
    actor = pick(ACTORS)
    answers = {
        "relacion": actor,
        "talleres": pick(WORKSHOPS),
        "primerpiso": pick_many(PRIMER_PISO[actor], random.choice([1, 2, 3, 3])),
        "plaza": pick_many(PLAZA[actor], random.choice([1, 2, 3, 3])),
        "lenguaje": pick_many(LENGUAJE[actor], random.choice([1, 2])),
    }
    if plot in ("uau1", "uau5"):
        answers["reemplazo"] = pick(REEMPLAZO[actor])
    if plot == "uau2":
        answers["sombra"] = max(1, min(5, round(random.gauss(SOMBRA[actor], 0.9))))
    responses.append({"id": f"sim-{i:03d}", "plot": plot, "answers": answers, "simulated": True, "createdAt": when()})

# Attach the written comments to responses from the matching plot and actor, with a pin.
for pid, kinds in COMMENTS.items():
    for kind, items in kinds.items():
        for actor, text in items:
            candidates = [r for r in responses if r["plot"] == pid and r["answers"]["relacion"] == actor and kind not in r["answers"]]
            r = random.choice(candidates) if candidates else random.choice([r for r in responses if r["plot"] == pid])
            r["answers"][kind] = {"text": text, "position": point_near(pid)}

responses.sort(key=lambda r: r["createdAt"])
json.dump({"simulated": True, "note": "Respuestas simuladas para la demostración; no son datos reales.", "responses": responses}, sys.stdout, ensure_ascii=False, indent=1)
