// Builds a 3D Tiles tileset of street trees from the Jardín Botánico census cut by
// trees_extract.py: one low-poly crown and trunk per tree, seated on the site terrain, scaled by
// the census height. Vertices are centred like the buildings tileset to avoid float32 jitter.
//
//   pnpm exec tsx src/trees.ts --in data/chapinero-trees.json --terrain 6048414 --out ../../apps/web/public/tilesets/chapinero-trees
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";
import {
  Cartographic,
  CesiumTerrainProvider,
  createWorldTerrainAsync,
  Ion,
  sampleTerrainMostDetailed,
} from "cesium";
import { type Ecef, lonLatHeightToEcef } from "./geo.js";
import { tilesetJson } from "./tileset.js";

type Tree = { lon: number; lat: number; height: number | null; species: string };

const CROWN = [0.62, 0.76, 0.58, 1]; // sage, as in a card model
const TRUNK = [0.55, 0.53, 0.5, 1];

/** Unit icosahedron, 12 vertices / 20 faces. */
const T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, T, 0],
  [1, T, 0],
  [-1, -T, 0],
  [1, -T, 0],
  [0, -1, T],
  [0, 1, T],
  [0, -1, -T],
  [0, 1, -T],
  [T, 0, -1],
  [T, 0, 1],
  [-T, 0, -1],
  [-T, 0, 1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
});
const ICO_F = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

const { values } = parseArgs({
  options: { in: { type: "string" }, out: { type: "string" }, terrain: { type: "string" } },
});
if (!values.in || !values.out) {
  console.error("usage: --in trees.json --out <dir> [--terrain <ion asset id>]");
  process.exit(1);
}

const trees = JSON.parse(readFileSync(values.in, "utf8")) as Tree[];
const token = process.env.CESIUM_ION_TOKEN ?? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
if (!token) throw new Error("CESIUM_ION_TOKEN is not set");
Ion.defaultAccessToken = token;
const terrain = values.terrain
  ? await CesiumTerrainProvider.fromIonAssetId(Number(values.terrain))
  : await createWorldTerrainAsync();
const ground: number[] = [];
for (let i = 0; i < trees.length; i += 1000) {
  const s = await sampleTerrainMostDetailed(
    terrain,
    trees.slice(i, i + 1000).map((t) => Cartographic.fromDegrees(t.lon, t.lat)),
  );
  for (const c of s) ground.push(c.height);
}

// Two non-indexed triangle soups, one per material: crowns and trunks.
type Soup = { positions: number[]; normals: number[] };
const crowns: Soup = { positions: [], normals: [] };
const trunks: Soup = { positions: [], normals: [] };
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
// ECEF (x, y, z) stored as glTF (x, z, -y): 3D Tiles rotates glTF y-up to z-up.
const tri = (soup: Soup, n: Ecef, ...ps: Ecef[]) => {
  for (const p of ps) {
    soup.positions.push(p[0], p[2], -p[1]);
    soup.normals.push(n[0], n[2], -n[1]);
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
};

for (const [i, t] of trees.entries()) {
  const h = Math.min(Math.max(t.height ?? 4, 2), 25);
  const base = lonLatHeightToEcef(t.lon, t.lat, ground[i]);
  const [e, nrt, u] = enu(t.lon, t.lat);
  const at = (de: number, dn: number, du: number): Ecef => [
    base[0] + e[0] * de + nrt[0] * dn + u[0] * du,
    base[1] + e[1] * de + nrt[1] * dn + u[1] * du,
    base[2] + e[2] * de + nrt[2] * dn + u[2] * du,
  ];
  const dir = (de: number, dn: number, du: number): Ecef => [
    e[0] * de + nrt[0] * dn + u[0] * du,
    e[1] * de + nrt[1] * dn + u[1] * du,
    e[2] * de + nrt[2] * dn + u[2] * du,
  ];
  // Trunk: square prism up to the crown.
  const r = Math.max(0.12, h * 0.025);
  const trunkTop = h * 0.45;
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * Math.PI * 2;
    const a1 = ((k + 1) / 4) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const n = dir(Math.cos(am), Math.sin(am), 0);
    const b0 = at(r * Math.cos(a0), r * Math.sin(a0), -0.3);
    const b1 = at(r * Math.cos(a1), r * Math.sin(a1), -0.3);
    const t1 = at(r * Math.cos(a1), r * Math.sin(a1), trunkTop);
    const t0 = at(r * Math.cos(a0), r * Math.sin(a0), trunkTop);
    tri(trunks, n, b0, b1, t1);
    tri(trunks, n, b0, t1, t0);
  }
  // Crown: a slightly squashed icosahedron, flat-shaded.
  const cr = Math.min(Math.max(h * 0.3, 1), 5);
  const cz = h - cr * 0.9;
  for (const [a, b, c] of ICO_F) {
    const pa = ICO_V[a];
    const pb = ICO_V[b];
    const pc = ICO_V[c];
    const nx = (pa[0] + pb[0] + pc[0]) / 3;
    const ny = (pa[1] + pb[1] + pc[1]) / 3;
    const nz = (pa[2] + pb[2] + pc[2]) / 3;
    const l = Math.hypot(nx, ny, nz);
    const n = dir(nx / l, ny / l, nz / l);
    const v = (p: number[]) => at(p[0] * cr, p[1] * cr, cz + p[2] * cr * 0.85);
    tri(crowns, n, v(pa), v(pb), v(pc));
  }
}

const centre: Ecef = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
const cYUp = [centre[0], centre[2], -centre[1]];
for (const soup of [crowns, trunks]) {
  for (let i = 0; i < soup.positions.length; i += 3) {
    soup.positions[i] -= cYUp[0];
    soup.positions[i + 1] -= cYUp[1];
    soup.positions[i + 2] -= cYUp[2];
  }
}

const doc = new Document();
const buffer = doc.createBuffer();
const mesh = doc.createMesh("trees");
for (const [soup, color, name] of [
  [crowns, CROWN, "crown"],
  [trunks, TRUNK, "trunk"],
] as const) {
  const acc = (arr: number[]) =>
    doc.createAccessor().setType("VEC3").setArray(new Float32Array(arr)).setBuffer(buffer);
  mesh.addPrimitive(
    doc
      .createPrimitive()
      .setAttribute("POSITION", acc(soup.positions))
      .setAttribute("NORMAL", acc(soup.normals))
      .setMaterial(
        doc
          .createMaterial(name)
          .setBaseColorFactor([...color] as [number, number, number, number])
          .setRoughnessFactor(1)
          .setMetallicFactor(0),
      ),
  );
}
doc
  .createScene("scene")
  .addChild(doc.createNode("trees").setMesh(mesh).setTranslation([cYUp[0], cYUp[1], cYUp[2]]));
doc.createExtension(KHRMeshQuantization).setRequired(true);
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 8 }));
const glb = await new NodeIO().registerExtensions([KHRMeshQuantization]).writeBinary(doc);
mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, "trees.glb"), glb);
writeFileSync(
  join(values.out, "tileset.json"),
  JSON.stringify(tilesetJson({ min: min as Ecef, max: max as Ecef }, "trees.glb"), null, 2),
);
const tris = (crowns.positions.length + trunks.positions.length) / 9;
console.log(
  `${trees.length} trees, ${tris} triangles -> ${values.out} (${(glb.byteLength / 1e6).toFixed(1)} MB)`,
);

function enu(lonDeg: number, latDeg: number): [Ecef, Ecef, Ecef] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const e: Ecef = [-Math.sin(lon), Math.cos(lon), 0];
  const n: Ecef = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const u: Ecef = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  return [e, n, u];
}
