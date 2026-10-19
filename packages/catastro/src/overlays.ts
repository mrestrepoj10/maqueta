// Bakes ground overlays for a site into static GeoJSON (the Catastro server sends no CORS
// headers, so the browser cannot query it directly):
//   parks.geojson     Sistema Distrital de Parques (IDRD), polygons in the bbox
//   lots.geojson      Catastro lot outlines in the bbox
//   boundary.geojson  The block (manzana) containing the given lot, for the project outline
//
//   pnpm exec tsx src/overlays.ts --bbox=-74.060,4.651,-74.049,4.660 --lot 008306022019 --out ../../apps/web/public/tilesets/chapinero-overlays
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const B = "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services";

const { values } = parseArgs({
  options: { bbox: { type: "string" }, lot: { type: "string" }, out: { type: "string" } },
});
if (!values.bbox || !values.out || !values.lot) {
  console.error("usage: --bbox=w,s,e,n --lot <12-char lot code> --out <dir>");
  process.exit(1);
}

async function geojson(layer: string, where: string, outFields: string, bbox?: string) {
  const features: unknown[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      f: "geojson",
      where,
      outFields,
      outSR: "4326",
      geometryPrecision: "7",
      resultOffset: String(offset),
      resultRecordCount: "1000",
    });
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
const parks = await geojson(
  "recreaciondeporte/parquesyescenarios/MapServer/1",
  "1=1",
  "*",
  values.bbox,
);
writeFileSync(join(values.out, "parks.geojson"), JSON.stringify(parks));
const lots = await geojson("catastro/lote/MapServer/0", "1=1", "LOTCODIGO", values.bbox);
writeFileSync(join(values.out, "lots.geojson"), JSON.stringify(lots));
const manzana = values.lot.slice(0, 9);
const boundary = await geojson(
  "catastro/manzana/MapServer/0",
  `MANCODIGO='${manzana}'`,
  "MANCODIGO",
);
writeFileSync(join(values.out, "boundary.geojson"), JSON.stringify(boundary));
console.log(
  `parks ${parks.features.length}, lots ${lots.features.length}, boundary ${boundary.features.length} (manzana ${manzana}) -> ${values.out}`,
);
