// Turns IDECA multipatch triangles into one glTF binary in Earth-fixed (ECEF) coordinates, which is
// what a 3D Tiles 1.1 tile with glTF content expects.
import { Document, NodeIO } from "@gltf-transform/core";
import earcut from "earcut";
import type { Building } from "./fetch.js";
import { type Ecef, lonLatHeightToEcef } from "./geo.js";

export type Bounds = { min: Ecef; max: Ecef };

export async function buildGlb(
  buildings: Building[],
): Promise<{ glb: Uint8Array; bounds: Bounds }> {
  const positions: number[] = [];
  const normals: number[] = [];
  // Vertex colours: roofs white, walls a touch darker, so edges read even under flat lighting.
  const colors: number[] = [];
  const indices: number[] = [];
  const ROOF = [1, 1, 1];
  const WALL = [0.8, 0.8, 0.79];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // 3D Tiles applies a y-up to z-up rotation to glTF content, so ECEF (x, y, z) is stored as (x, z, -y).
  const push = (p: Ecef, n: Ecef, c: number[]) => {
    positions.push(p[0], p[2], -p[1]);
    normals.push(n[0], n[2], -n[1]);
    colors.push(c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
    return positions.length / 3 - 1;
  };

  for (const b of buildings) {
    const dz = b.heightOffset ?? 0;
    const t = b.triangles;
    for (let i = 0; i + 2 < t.length; i += 3) {
      const a = lonLatHeightToEcef(t[i][0], t[i][1], t[i][2] + dz);
      const c1 = lonLatHeightToEcef(t[i + 1][0], t[i + 1][1], t[i + 1][2] + dz);
      const c2 = lonLatHeightToEcef(t[i + 2][0], t[i + 2][1], t[i + 2][2] + dz);
      let n = normalize(cross(sub(c1, a), sub(c2, a)));
      if (!Number.isFinite(n[0])) continue;
      // Face outward: a triangle whose normal points toward the Earth's centre is flipped.
      // Walls are judged against the vector from the building to the triangle; roofs against up.
      const up = normalize(a);
      const facingUp = dot(n, up);
      const color = Math.abs(facingUp) > 0.5 ? ROOF : WALL;
      const i0 = a;
      let i1 = c1;
      let i2 = c2;
      if (facingUp < -0.5) {
        n = [-n[0], -n[1], -n[2]];
        [i1, i2] = [c2, c1];
      }
      const base = push(i0, n, color);
      push(i1, n, color);
      push(i2, n, color);
      indices.push(base, base + 1, base + 2);
    }
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (type: "VEC3" | "SCALAR", arr: Float32Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const material = doc
    .createMaterial("ideca")
    .setBaseColorFactor([0.84, 0.83, 0.82, 1])
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(positions)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(normals)))
    .setAttribute("COLOR_0", acc("VEC3", new Float32Array(colors)))
    .setIndices(acc("SCALAR", new Uint32Array(indices)))
    .setMaterial(material);
  const mesh = doc.createMesh("buildings").addPrimitive(prim);
  doc.createScene("scene").addChild(doc.createNode("buildings").setMesh(mesh));

  const glb = await new NodeIO().writeBinary(doc);
  return { glb, bounds: { min: min as Ecef, max: max as Ecef } };
}

function sub(a: Ecef, b: Ecef): Ecef {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Ecef, b: Ecef): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Ecef, b: Ecef): Ecef {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Ecef): Ecef {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
