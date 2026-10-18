// Extrudes building footprints into one glTF binary positioned in Earth-fixed (ECEF) coordinates,
// which is what a 3D Tiles 1.1 tile with glTF content expects.
import { Document, NodeIO } from "@gltf-transform/core";
import earcut from "earcut";
import type { Building } from "./fetch.js";
import { type Ecef, lonLatHeightToEcef } from "./geo.js";

export type Bounds = { min: Ecef; max: Ecef };

export async function buildGlb(
  buildings: Building[],
  opts: { baseElevation: number },
): Promise<{ glb: Uint8Array; bounds: Bounds }> {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // 3D Tiles applies a y-up to z-up rotation to glTF content, so ECEF (x, y, z) is stored as (x, z, -y).
  const push = (p: Ecef, n: Ecef) => {
    positions.push(p[0], p[2], -p[1]);
    normals.push(n[0], n[2], -n[1]);
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
    return positions.length / 3 - 1;
  };

  for (const b of buildings) {
    const base = b.groundHeight ?? opts.baseElevation;
    const top = base + b.height;
    const ring = b.ring;
    const n = ring.length;

    // Roof: triangulate in lon/lat (fine at building scale), lift to `top`.
    const flat = ring.flat();
    const tri = earcut(flat);
    const up = upVector(ring[0]);
    const roofStart = positions.length / 3;
    for (const [lon, lat] of ring) push(lonLatHeightToEcef(lon, lat, top), up);
    // earcut returns CCW for CCW input; Catastro rings are usually CW, so flip to face up.
    const ccw = signedArea(ring) > 0;
    for (let i = 0; i < tri.length; i += 3) {
      const [a, b2, c] = ccw ? [tri[i], tri[i + 1], tri[i + 2]] : [tri[i], tri[i + 2], tri[i + 1]];
      indices.push(roofStart + a, roofStart + b2, roofStart + c);
    }

    // Walls: one quad per edge with its own flat normal.
    for (let i = 0; i < n; i++) {
      const p0 = ring[i];
      const p1 = ring[(i + 1) % n];
      const b0 = lonLatHeightToEcef(p0[0], p0[1], base);
      const b1 = lonLatHeightToEcef(p1[0], p1[1], base);
      const t0 = lonLatHeightToEcef(p0[0], p0[1], top);
      const t1 = lonLatHeightToEcef(p1[0], p1[1], top);
      let nrm = normalize(cross(sub(b1, b0), sub(t0, b0)));
      // Face outward: for a CW ring the cross product already points out; flip for CCW.
      if (ccw) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      const i0 = push(b0, nrm);
      const i1 = push(b1, nrm);
      const i2 = push(t1, nrm);
      const i3 = push(t0, nrm);
      if (ccw) indices.push(i0, i2, i1, i0, i3, i2);
      else indices.push(i0, i1, i2, i0, i2, i3);
    }
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const nor = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(normals))
    .setBuffer(buffer);
  const idx = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint32Array(indices))
    .setBuffer(buffer);
  const material = doc
    .createMaterial("catastro")
    .setBaseColorFactor([0.84, 0.83, 0.82, 1])
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", pos)
    .setAttribute("NORMAL", nor)
    .setIndices(idx)
    .setMaterial(material);
  const mesh = doc.createMesh("buildings").addPrimitive(prim);
  const node = doc.createNode("buildings").setMesh(mesh);
  doc.createScene("scene").addChild(node);

  const glb = await new NodeIO().writeBinary(doc);
  return { glb, bounds: { min: min as Ecef, max: max as Ecef } };
}

function upVector([lon, lat]: [number, number]): Ecef {
  const a = lonLatHeightToEcef(lon, lat, 0);
  const b = lonLatHeightToEcef(lon, lat, 1);
  return normalize(sub(b, a));
}
function sub(a: Ecef, b: Ecef): Ecef {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Ecef, b: Ecef): Ecef {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Ecef): Ecef {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function signedArea(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
