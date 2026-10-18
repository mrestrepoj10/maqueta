// Builds a 3D Tiles tileset of IDECA's LiDAR building models for a bounding box.
//
//   pnpm --filter @maqueta/catastro build -- --bbox=-74.060,4.651,-74.049,4.660 --terrain 6048414 --out ../../apps/web/public/tilesets/chapinero
//
// Source: "Volumetría 2025" multipatch feature layer, IDECA / UAECD, Datos Abiertos Bogotá.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fetchBuildings } from "./fetch.js";
import { buildGlb } from "./glb.js";
import { fetchLots, lotCode } from "./lotes.js";
import { sampleHeightOffsets } from "./terrain.js";
import { tilesetJson } from "./tileset.js";

const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    out: { type: "string" },
    terrain: { type: "string" },
  },
});

if (!values.bbox || !values.out) {
  console.error("usage: --bbox=west,south,east,north --out <dir> [--terrain <ion asset id>]");
  process.exit(1);
}

const bbox = values.bbox.split(",").map(Number) as [number, number, number, number];

const buildings = await fetchBuildings(bbox);
const tris = buildings.reduce((n, b) => n + b.triangles.length / 3, 0);
console.log(`fetched ${buildings.length} buildings, ${tris} triangles`);

const offsets = await sampleHeightOffsets(
  buildings,
  values.terrain ? Number(values.terrain) : undefined,
);
buildings.forEach((b, i) => {
  b.heightOffset = offsets[i];
});
const sorted = [...offsets].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(
  `height offset (ellipsoid − orthometric): median ${median.toFixed(1)} m, range ${sorted[0].toFixed(1)}–${sorted[sorted.length - 1].toFixed(1)} m`,
);

const lots = await fetchLots(buildings.map((b) => lotCode(b.id)));
const withAddress = [...lots.values()].filter((l) => l.address).length;
console.log(`lot data for ${withAddress}/${lots.size} lots`);

const { glb, bounds } = await buildGlb(buildings, lots);
mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, "buildings.glb"), glb);
writeFileSync(
  join(values.out, "tileset.json"),
  JSON.stringify(tilesetJson(bounds, "buildings.glb"), null, 2),
);
console.log(`wrote ${values.out} (${(glb.byteLength / 1e6).toFixed(1)} MB)`);
