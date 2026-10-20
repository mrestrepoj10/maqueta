"""Simulated participation for the Chapinero and Calle 72 demos, same format as
participation_fenicia.py. Personas, preferences and comments are grounded in each site's real
context; every record has simulated=true and the app labels them "aportes simulados".

  .venv/bin/python -I src/participation_sim.py chapinero > ../../apps/web/sites/chapinero.responses.json
  .venv/bin/python -I src/participation_sim.py calle-72  > ../../apps/web/sites/calle-72.responses.json
"""
import json, os, random, sys
from datetime import datetime, timedelta
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union

SLUG = sys.argv[1]
random.seed({"chapinero": 7, "calle-72": 72}[SLUG])
SITES = os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "web", "sites")
site = json.load(open(os.path.join(SITES, f"{SLUG}.json")))
to_m = Transformer.from_crs("EPSG:4326", "EPSG:6247", always_xy=True).transform
to_ll = Transformer.from_crs("EPSG:6247", "EPSG:4326", always_xy=True).transform
areas = {
    p["id"]: transform(to_m, shape({"type": "Polygon", "coordinates": [p["footprint"] + [p["footprint"][0]]]}))
    for p in site["proposals"]
}


def pick(w):
    keys = [k for k in w if w[k] > 0]
    return random.choices(keys, weights=[w[k] for k in keys])[0]


def pick_many(w, k):
    pool = {o: v for o, v in w.items() if v > 0}
    out = []
    for _ in range(min(k, len(pool))):
        o = pick(pool)
        out.append(o)
        pool.pop(o)
    return out


def point_near(area, inner=2, outer=22):
    zone = area.buffer(outer).difference(area.buffer(inner))
    w, s, e, n = zone.bounds
    while True:
        p = Point(random.uniform(w, e), random.uniform(s, n))
        if zone.contains(p):
            lon, lat = to_ll(p.x, p.y)
            return [round(lon, 7), round(lat, 7)]


def when(start, spike, days=27):
    if random.random() < 0.45:
        d = spike + timedelta(hours=random.uniform(0, 96))
    else:
        d = start + timedelta(hours=random.uniform(0, days * 24))
    if random.random() < 0.6:
        d = d.replace(hour=random.choice([19, 20, 21, 22]))
    return d.isoformat()


def clamp(v, lo=1, hi=5):
    return max(lo, min(hi, round(v)))


if SLUG == "chapinero":
    N = 248
    PLOTS = {"a": 0.34, "b": 0.36, "c": 0.3}  # option the person was looking at when answering
    ACTORS = {"vecino": 0.3, "comerciante": 0.16, "oficina": 0.22, "estudiante": 0.17, "peaton": 0.15}
    FREQ = {
        "vecino": {"diario": 7, "semanal": 2, "ocasional": 1},
        "comerciante": {"diario": 9, "semanal": 1, "ocasional": 0},
        "oficina": {"diario": 6, "semanal": 3, "ocasional": 1},
        "estudiante": {"diario": 4, "semanal": 4, "ocasional": 2},
        "peaton": {"diario": 3, "semanal": 4, "ocasional": 3},
    }
    OPCION = {
        "vecino": {"a": 4, "b": 1, "c": 3, "ninguna": 2},
        "comerciante": {"a": 2, "b": 3, "c": 4, "ninguna": 1},
        "oficina": {"a": 2, "b": 5, "c": 3, "ninguna": 0},
        "estudiante": {"a": 3, "b": 3, "c": 4, "ninguna": 0},
        "peaton": {"a": 4, "b": 2, "c": 3, "ninguna": 1},
    }
    SOMBRA = {"vecino": 4.0, "comerciante": 2.6, "oficina": 2.2, "estudiante": 2.8, "peaton": 3.1}
    PRIMER = {
        "vecino": {"cafes": 3, "vecinal": 5, "cultura": 3, "salud": 3, "bicis": 1},
        "comerciante": {"cafes": 5, "vecinal": 6, "cultura": 1, "salud": 1, "bicis": 1},
        "oficina": {"cafes": 7, "vecinal": 3, "cultura": 2, "salud": 2, "bicis": 3},
        "estudiante": {"cafes": 6, "vecinal": 2, "cultura": 6, "salud": 1, "bicis": 4},
        "peaton": {"cafes": 3, "vecinal": 3, "cultura": 2, "salud": 1, "bicis": 6},
    }
    ESPACIO = {
        "vecino": {"plazoleta": 4, "andenes": 3, "arboles": 6, "paradero": 1, "accesible": 3},
        "comerciante": {"plazoleta": 5, "andenes": 5, "arboles": 2, "paradero": 2, "accesible": 1},
        "oficina": {"plazoleta": 5, "andenes": 4, "arboles": 3, "paradero": 4, "accesible": 1},
        "estudiante": {"plazoleta": 6, "andenes": 3, "arboles": 4, "paradero": 3, "accesible": 2},
        "peaton": {"plazoleta": 2, "andenes": 6, "arboles": 3, "paradero": 5, "accesible": 4},
    }
    LENGUAJE = {
        "vecino": {"ladrillo": 8, "moderno": 1, "verde": 4, "vidrio": 0, "industrial": 1},
        "comerciante": {"ladrillo": 4, "moderno": 4, "verde": 2, "vidrio": 2, "industrial": 1},
        "oficina": {"ladrillo": 3, "moderno": 5, "verde": 3, "vidrio": 4, "industrial": 1},
        "estudiante": {"ladrillo": 2, "moderno": 3, "verde": 6, "vidrio": 2, "industrial": 3},
        "peaton": {"ladrillo": 4, "moderno": 2, "verde": 5, "vidrio": 1, "industrial": 1},
    }
    lot = unary_union(list(areas.values()))
    COMMENTS = [
        ("b", "preocupaciones", "vecino", "Una torre de 18 pisos frente a Quinta Camacho le quita el sol de la mañana a las casas de la calle 72."),
        ("b", "preocupaciones", "vecino", "Más apartamentos sin parqueaderos nuevos: la calle 71 ya está llena de carros en doble fila."),
        ("a", "preocupaciones", "comerciante", "Si cierran la esquina dos años de obra, los locales de la 72 perdemos los clientes del hotel."),
        ("c", "preocupaciones", "peaton", "El andén de la Séptima frente al lote es angosto y se inunda; no se puede caminar con coche de bebé."),
        ("b", "preocupaciones", "estudiante", "Que no sea otra fachada de vidrio cerrada hacia la calle; de noche esta esquina es oscura."),
        ("a", "preocupaciones", "vecino", "Dos años de ruido de obra en una cuadra de vivienda. ¿Qué horarios va a tener?"),
        ("c", "ideas", "estudiante", "Una plazoleta en la esquina con sombra de árboles, para esperar el bus sin estar en el andén."),
        ("a", "ideas", "vecino", "Ladrillo y alturas que dialoguen con Quinta Camacho; la opción A se siente parte del barrio."),
        ("b", "ideas", "oficina", "Si la torre libera el resto del lote, que ese espacio sea un jardín público abierto a la Séptima."),
        ("c", "ideas", "comerciante", "Locales pequeños en el primer piso, a la escala de la calle 72, no una gran superficie."),
        ("c", "ideas", "peaton", "Biciparqueadero público sobre la Séptima: hoy no hay dónde dejar la bici en toda la cuadra."),
        ("a", "ideas", "estudiante", "Un espacio cultural en el primer piso: galería o sala de ensayo para la zona."),
        ("b", "ideas", "peaton", "Ampliar el andén retrocediendo el primer piso, con un paradero cubierto."),
    ]
    START, SPIKE = datetime(2026, 9, 28, 7), datetime(2026, 10, 9, 18)

    def answers_for(actor, plot):
        return {
            "relacion": actor,
            "frecuencia": pick(FREQ[actor]),
            "opcion": pick(OPCION[actor]),
            "sombra": clamp(random.gauss(SOMBRA[actor] + (0.6 if plot == "b" else 0), 0.9)),
            "primerpiso": pick_many(PRIMER[actor], random.choice([1, 2, 3, 3])),
            "espacio": pick_many(ESPACIO[actor], random.choice([1, 2, 2])),
            "lenguaje": pick_many(LENGUAJE[actor], random.choice([1, 2])),
        }

    def pin_for(plot):
        return point_near(lot, 2, 26)

else:  # calle-72
    N = 386
    PLOTS = {"p1": 0.26, "p2": 0.18, "p3": 0.2, "p4": 0.14, "p5": 0.12, "p6": 0.1}
    ACTORS = {"propietario": 0.28, "arrendatario": 0.26, "comerciante": 0.22, "organizacion": 0.12, "visitante": 0.12}
    WORKSHOPS = {"si": 0.18, "horario": 0.39, "nosabia": 0.31, "otra": 0.12}
    PRIORIDAD = {
        "propietario": {"permanecer": 7, "vis": 2, "comercio": 3, "verde": 4, "movilidad": 3, "seguridad": 5},
        "arrendatario": {"permanecer": 8, "vis": 6, "comercio": 2, "verde": 3, "movilidad": 3, "seguridad": 3},
        "comerciante": {"permanecer": 3, "vis": 1, "comercio": 9, "verde": 1, "movilidad": 4, "seguridad": 5},
        "organizacion": {"permanecer": 6, "vis": 5, "comercio": 3, "verde": 6, "movilidad": 2, "seguridad": 2},
        "visitante": {"permanecer": 2, "vis": 2, "comercio": 3, "verde": 5, "movilidad": 7, "seguridad": 3},
    }
    ALTURA = {"propietario": 2.6, "arrendatario": 2.8, "comerciante": 3.2, "organizacion": 2.3, "visitante": 3.8}
    PRIMER = {
        "propietario": {"talleres": 3, "mercado": 5, "cuidado": 4, "jardin": 4, "cultura": 2},
        "arrendatario": {"talleres": 3, "mercado": 4, "cuidado": 5, "jardin": 5, "cultura": 2},
        "comerciante": {"talleres": 9, "mercado": 5, "cuidado": 1, "jardin": 1, "cultura": 1},
        "organizacion": {"talleres": 4, "mercado": 3, "cuidado": 6, "jardin": 4, "cultura": 5},
        "visitante": {"talleres": 3, "mercado": 4, "cuidado": 2, "jardin": 2, "cultura": 5},
    }
    CANAL = {
        "propietario": {"sendero": 4, "humedal": 3, "juegos": 4, "luz": 6, "ferias": 2},
        "arrendatario": {"sendero": 4, "humedal": 3, "juegos": 5, "luz": 5, "ferias": 3},
        "comerciante": {"sendero": 3, "humedal": 1, "juegos": 2, "luz": 5, "ferias": 7},
        "organizacion": {"sendero": 5, "humedal": 8, "juegos": 3, "luz": 3, "ferias": 2},
        "visitante": {"sendero": 7, "humedal": 4, "juegos": 2, "luz": 3, "ferias": 3},
    }
    COMMENTS = [
        ("p1", "preocupaciones", "propietario", "Una torre de 26 pisos junto a casas de dos pisos en San Felipe: ¿quién compra mi casa y a qué precio?"),
        ("p1", "preocupaciones", "comerciante", "Las obras del Metro ya cerraron la Caracas un año; otra obra encima y los negocios de la 72 cerramos."),
        ("p1", "ideas", "visitante", "Que el intercambiador tenga una plaza cubierta conectada a las dos estaciones, sin cruzar la Caracas."),
        ("p2", "preocupaciones", "arrendatario", "Llevo 15 años arrendando en el Doce de Octubre. Si suben los arriendos con la estación, ¿a dónde me voy?"),
        ("p2", "ideas", "organizacion", "Que la vivienda VIP de esta manzana sea primero para los arrendatarios del barrio."),
        ("p3", "ideas", "organizacion", "El Canal Salitre puede ser un corredor ecológico real: humedal, aves y un sendero continuo a lo largo del canal."),
        ("p3", "preocupaciones", "propietario", "El canal de noche es oscuro e inseguro; antes de construir hay que iluminarlo."),
        ("p3", "ideas", "comerciante", "Ferias de fin de semana en el borde del canal para los talleres de muebles del Doce de Octubre."),
        ("p4", "preocupaciones", "comerciante", "Los talleres y galerías de San Felipe y Alcázares son el corazón productivo; no los saquen con la renovación."),
        ("p4", "ideas", "propietario", "Baja altura aquí está bien; que los edificios altos queden sobre la calle 72 y la Caracas."),
        ("p5", "preocupaciones", "arrendatario", "Comercio continuo en la 72 está bien, pero que no sea solo para cadenas grandes."),
        ("p5", "ideas", "organizacion", "Una Manzana del Cuidado en el primer piso, con jardín infantil y lavandería comunitaria."),
        ("p6", "preocupaciones", "propietario", "Más densidad sin más colegios ni centros de salud; ya hoy no alcanzan."),
        ("p6", "ideas", "arrendatario", "El jardín infantil propuesto es justo lo que falta en San Fernando."),
    ]
    START, SPIKE = datetime(2026, 9, 21, 7), datetime(2026, 10, 17, 15)

    def answers_for(actor, plot):
        a = {
            "relacion": actor,
            "talleres": pick(WORKSHOPS),
            "prioridad": pick_many(PRIORIDAD[actor], random.choice([1, 2, 2])),
            "altura": clamp(random.gauss(ALTURA[actor] - (0.6 if plot == "p1" else 0) + (0.5 if plot == "p4" else 0), 1.0)),
            "primerpiso": pick_many(PRIMER[actor], random.choice([1, 2, 3, 3])),
        }
        if plot in ("p2", "p3"):
            a["canal"] = pick_many(CANAL[actor], random.choice([1, 2, 2]))
        return a

    def pin_for(plot):
        return point_near(areas[plot], 2, 30)


responses = []
for i in range(N):
    plot = pick(PLOTS)
    actor = pick(ACTORS)
    responses.append({
        "id": f"sim-{i:03d}",
        "plot": plot,
        "answers": answers_for(actor, plot),
        "simulated": True,
        "createdAt": when(START, SPIKE),
    })

for plot, kind, actor, text in COMMENTS:
    cands = [r for r in responses if r["plot"] == plot and r["answers"]["relacion"] == actor and kind not in r["answers"]]
    r = random.choice(cands) if cands else random.choice([r for r in responses if r["plot"] == plot])
    r["answers"][kind] = {"text": text, "position": pin_for(plot)}

responses.sort(key=lambda r: r["createdAt"])
json.dump(
    {"simulated": True, "note": "Respuestas simuladas para la demostración; no son datos reales.", "responses": responses},
    sys.stdout,
    ensure_ascii=False,
    indent=1,
)
