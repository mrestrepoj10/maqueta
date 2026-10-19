// Bakes ground overlays for a site into static GeoJSON (the Catastro server sends no CORS
// headers, so the browser cannot query it directly):
//   parks.geojson     Sistema Distrital de Parques (IDRD), polygons in the bbox
//   lots.geojson      Catastro lot outlines in the bbox
//   boundary.geojson  The project outline: a given GeoJSON (--boundary) or the block (manzana)
//                     containing --lot
//   water.geojson     Water bodies and canals (Catastro reference map)
//   metro.geojson     Metro Line 1 and Line 2 stations and alignments
// With --clip, features are kept only when their centroid is inside the polygon or within
// --buffer metres of it.
//
//   pnpm exec tsx src/overlays.ts --bbox=-74.060,4.651,-74.049,4.660 --lot 008306022019 --out ../../apps/web/public/tilesets/chapinero-overlays
//   pnpm exec tsx src/overlays.ts --bbox=… --boundary data/ae24-calle72.geojson --clip data/ae24-calle72.geojson --buffer 150 --metro --out …
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { makeClip, readRings } from "./clip.js";

const B = "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services";

const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    lot: { type: "string" },
    boundary: { type: "string" },
    clip: { type: "string" },
    buffer: { type: "string", default: "0" },
    metro: { type: "boolean", default: false },
    out: { type: "string" },
  },
});
if (!values.bbox || !values.out || !(values.lot || values.boundary)) {
  console.error(
    "usage: --bbox=w,s,e,n (--lot <code> | --boundary <geojson>) [--clip <geojson> --buffer m] [--metro] --out <dir>",
  );
  process.exit(1);
}
const keep = values.clip ? makeClip(readRings(values.clip), Number(values.buffer)) : () => true;

type Fc = { type: string; features: { geometry: { type: string; coordinates: unknown } | null }[] };
function clipFc(fc: Fc): Fc {
  return {
    ...fc,
    features: fc.features.filter((f) => {
      const c = centroid(f.geometry);
      return c ? keep(c[0], c[1]) : false;
    }),
  };
}
function centroid(g: { type: string; coordinates: unknown } | null): [number, number] | null {
  if (!g) return null;
  const pts: number[][] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x) && typeof x[0] === "number") pts.push(x as number[]);
    else if (Array.isArray(x)) for (const y of x) walk(y);
  };
  walk(g.coordinates);
  if (pts.length === 0) return null;
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

async function geojson(
  layer: string,
  where: string,
  outFields: string,
  bbox?: string,
  maxAllowableOffset?: number,
) {
  const features: unknown[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      f: "geojson",
      where,
      outFields,
      outSR: "4326",
      geometryPrecision: "6",
      resultOffset: String(offset),
      resultRecordCount: "1000",
    });
    if (maxAllowableOffset) params.set("maxAllowableOffset", String(maxAllowableOffset));
    if (bbox) {
      params.set("geometry", bbox);
      params.set("geometryType", "esriGeometryEnvelope");
      params.set("inSR", "4326");
      params.set("spatialRel", "esriSpatialRelIntersects");
    }
    const res = await fetch(`${B}/${layer}/query?${params}`);
    const page = (await res.json()) as {
      features: unknown[];
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
      error?: { message: string };
    };
    if (page.error) throw new Error(`${layer}: ${page.error.message}`);
    features.push(...page.features);
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (!more || page.features.length === 0) break;
    offset += page.features.length;
  }
  return { type: "FeatureCollection", features };
}

mkdirSync(values.out, { recursive: true });
const parks = clipFc(
  (await geojson(
    "recreaciondeporte/parquesyescenarios/MapServer/1",
    "1=1",
    "*",
    values.bbox,
  )) as Fc,
);
writeFileSync(join(values.out, "parks.geojson"), JSON.stringify(parks));
// Lot lines are only drawn inside the area itself (no buffer) to keep the file small.
const keepInside = values.clip ? makeClip(readRings(values.clip), 0) : () => true;
const lotsAll = (await geojson(
  "catastro/lote/MapServer/0",
  "1=1",
  "",
  values.bbox,
  0.000004,
)) as Fc;
const lots = {
  ...lotsAll,
  features: lotsAll.features
    .filter((f) => {
      const c = centroid(f.geometry);
      return c ? keepInside(c[0], c[1]) : false;
    })
    .map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })),
};
writeFileSync(join(values.out, "lots.geojson"), JSON.stringify(lots));
// Canals are long and thin, so their centroid often falls outside the clip: keep the whole bbox.
const water = (await geojson(
  "Mapa_Referencia/mapa_base_4686/MapServer/12",
  "1=1",
  "",
  values.bbox,
)) as Fc;
writeFileSync(join(values.out, "water.geojson"), JSON.stringify(water));
const boundary = values.boundary
  ? (JSON.parse(readFileSync(values.boundary, "utf8")) as Fc)
  : ((await geojson(
      "catastro/manzana/MapServer/0",
      `MANCODIGO='${(values.lot ?? "").slice(0, 9)}'`,
      "MANCODIGO",
    )) as Fc);
writeFileSync(join(values.out, "boundary.geojson"), JSON.stringify(boundary));
let metroCount = 0;
if (values.metro) {
  // Layers: 0 L1 stations, 1 L1 alignment, 4 L2 stations, 5 L2 alignment.
  const layers: [number, string, string][] = [
    [0, "L1", "station"],
    [1, "L1", "alignment"],
    [4, "L2", "station"],
    [5, "L2", "alignment"],
  ];
  const features: unknown[] = [];
  for (const [id, line, kind] of layers) {
    const fc = (await geojson(
      `movilidad/metrobogota/MapServer/${id}`,
      "1=1",
      "*",
      values.bbox,
    )) as {
      features: { properties?: Record<string, unknown> }[];
    };
    for (const f of fc.features)
      features.push({ ...f, properties: { ...f.properties, line, kind } });
  }
  metroCount = features.length;
  writeFileSync(
    join(values.out, "metro.geojson"),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
}
console.log(
  `parks ${parks.features.length}, lots ${lots.features.length}, water ${water.features.length}, boundary ${boundary.features.length}, metro ${metroCount} -> ${values.out}`,
);
