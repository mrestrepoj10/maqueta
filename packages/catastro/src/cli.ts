// Builds a 3D Tiles tileset of Catastro Bogotá buildings for a bounding box.
//
//   pnpm --filter @maqueta/catastro build -- --bbox=-74.058,4.652,-74.050,4.659 --out ../../apps/web/public/tilesets/chapinero
//
// Source: UAECD "Construcción" layer (CC BY 4.0), ArcGIS REST, EPSG:4686 (MAGNA-SIRGAS, treated as WGS84).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fetchBuildings } from "./fetch.js";
import { buildGlb } from "./glb.js";
import { sampleGroundHeights } from "./terrain.js";
import { tilesetJson } from "./tileset.js";

const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    out: { type: "string" },
    "base-elevation": { type: "string", default: "2600" },
  },
});

if (!values.bbox || !values.out) {
  console.error("usage: --bbox west,south,east,north --out <dir> [--base-elevation 2600]");
  process.exit(1);
}

const bbox = values.bbox.split(",").map(Number) as [number, number, number, number];
const baseElevation = Number(values["base-elevation"]);

const buildings = await fetchBuildings(bbox);
console.log(`fetched ${buildings.length} buildings`);
const ground = await sampleGroundHeights(buildings);
buildings.forEach((b, i) => {
  b.ground = ground[i];
});
const lo = Math.min(...ground.map((g) => g.min));
const hi = Math.max(...ground.map((g) => g.max));
const vertices = buildings.reduce((n, b) => n + b.ring.length, 0);
console.log(`sampled terrain at ${vertices} vertices: ${lo.toFixed(0)}–${hi.toFixed(0)} m`);

const { glb, bounds } = await buildGlb(buildings, { baseElevation });
mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, "buildings.glb"), glb);
writeFileSync(
  join(values.out, "tileset.json"),
  JSON.stringify(tilesetJson(bounds, "buildings.glb"), null, 2),
);
console.log(`wrote ${values.out} (${(glb.byteLength / 1e6).toFixed(1)} MB)`);
