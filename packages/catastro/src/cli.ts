// Builds a 3D Tiles tileset of IDECA's LiDAR building models for a bounding box.
//
//   pnpm --filter @maqueta/catastro build -- --bbox=-74.060,4.651,-74.049,4.660 --terrain 6048414 --out ../../apps/web/public/tilesets/chapinero
//
// Source: "Volumetría 2025" multipatch feature layer, IDECA / UAECD, Datos Abiertos Bogotá.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { makeClip, readRings } from "./clip.js";
import { fetchBuildings } from "./fetch.js";
import { fetchFootprints } from "./footprints.js";
import { buildGlb } from "./glb.js";
import { fetchLots, lotCode } from "./lotes.js";
import { sampleHeightOffsets } from "./terrain.js";
import { gridTilesetJson } from "./tileset.js";

const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    out: { type: "string" },
    terrain: { type: "string" },
    /** GeoJSON polygon(s): keep only buildings inside or within --buffer metres. */
    clip: { type: "string" },
    buffer: { type: "string", default: "0" },
    /** Grid cell size in degrees for splitting into tiles. */
    cell: { type: "string", default: "0.005" },
  },
});

if (!values.bbox || !values.out) {
  console.error("usage: --bbox=west,south,east,north --out <dir> [--terrain <ion asset id>]");
  process.exit(1);
}

const bbox = values.bbox.split(",").map(Number) as [number, number, number, number];

const rings = values.clip ? readRings(values.clip) : null;
const keep = rings ? makeClip(rings, Number(values.buffer)) : () => true;
// Fallback footprints are only kept inside the area itself: they are many and small.
const keepInside = rings ? makeClip(rings, 0) : () => true;
const centroidOf = (b: { triangles: [number, number, number][] }) => {
  const n = b.triangles.length || 1;
  return [
    b.triangles.reduce((s, p) => s + p[0], 0) / n,
    b.triangles.reduce((s, p) => s + p[1], 0) / n,
  ] as [number, number];
};
const lidar = (await fetchBuildings(bbox)).filter((b) => keep(...centroidOf(b)));
// IDECA's LiDAR models stop around lon -74.0775 (Chapinero, Teusaquillo, Barrios Unidos).
// West of what LiDAR returned, fall back to extruded Catastro footprints.
const lidarWest = lidar.reduce((m, b) => Math.min(m, centroidOf(b)[0]), Infinity);
const fallbackEdge = lidarWest + 0.0005;
const footprints =
  bbox[0] < fallbackEdge - 0.001
    ? await fetchFootprints(
        [bbox[0], bbox[1], fallbackEdge, bbox[3]],
        (lon, lat) => lon < fallbackEdge - 0.0005 && keepInside(lon, lat),
      )
    : [];
const buildings = [...lidar, ...footprints];
const tris = buildings.reduce((n, b) => n + b.triangles.length / 3, 0);
console.log(
  `fetched ${lidar.length} LiDAR + ${footprints.length} footprint buildings, ${tris} triangles`,
);

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

// Split into a grid of tiles so the browser only loads what is in view.
const cell = Number(values.cell);
const groups = new Map<string, typeof buildings>();
for (const b of buildings) {
  const [lon, lat] = centroidOf(b);
  const key = `${Math.floor(lon / cell)}_${Math.floor(lat / cell)}`;
  const g = groups.get(key) ?? [];
  g.push(b);
  groups.set(key, g);
}
mkdirSync(values.out, { recursive: true });
const tiles: { bounds: Awaited<ReturnType<typeof buildGlb>>["bounds"]; uri: string }[] = [];
let bytes = 0;
for (const [key, group] of groups) {
  const { glb, bounds } = await buildGlb(group, lots);
  const uri = groups.size === 1 ? "buildings.glb" : `buildings_${key}.glb`;
  writeFileSync(join(values.out, uri), glb);
  tiles.push({ bounds, uri });
  bytes += glb.byteLength;
}
writeFileSync(join(values.out, "tileset.json"), JSON.stringify(gridTilesetJson(tiles), null, 2));
console.log(`wrote ${tiles.length} tiles to ${values.out} (${(bytes / 1e6).toFixed(1)} MB)`);
