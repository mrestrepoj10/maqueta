// Turns IDECA multipatch triangles into one glTF binary in Earth-fixed (ECEF) coordinates, which is
// what a 3D Tiles 1.1 tile with glTF content expects.
//
// Vertices are stored relative to the tile centre, with the centre on the node transform: glTF
// vertex data is float32, which only has ~0.5 m precision at Earth-radius magnitudes, while Cesium
// reads node transforms in double precision. Each building gets a feature ID (EXT_mesh_features)
// so it can be picked and highlighted in the viewer.
import { Document, NodeIO } from "@gltf-transform/core";
import type { Building } from "./fetch.js";
import { type Ecef, lonLatHeightToEcef } from "./geo.js";
import { type LotInfo, lotCode } from "./lotes.js";

export type Bounds = { min: Ecef; max: Ecef };

export async function buildGlb(
  buildings: Building[],
  lots: Map<string, LotInfo> = new Map(),
): Promise<{ glb: Uint8Array; bounds: Bounds }> {
  const positions: number[] = [];
  const normals: number[] = [];
  // Vertex colours: roofs white, walls a touch darker, so edges read even under flat lighting.
  const colors: number[] = [];
  const featureIds: number[] = [];
  const indices: number[] = [];
  const ROOF = [1, 1, 1];
  const WALL = [0.8, 0.8, 0.79];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // 3D Tiles applies a y-up to z-up rotation to glTF content, so ECEF (x, y, z) is stored as (x, z, -y).
  let featureId = 0;
  const push = (p: Ecef, n: Ecef, c: number[]) => {
    positions.push(p[0], p[2], -p[1]);
    normals.push(n[0], n[2], -n[1]);
    colors.push(c[0], c[1], c[2]);
    featureIds.push(featureId);
    for (let i = 0; i < 3; i++) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
    return positions.length / 3 - 1;
  };

  for (const [bi, b] of buildings.entries()) {
    featureId = bi;
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

  // Re-centre: positions relative to the bounds centre (in the y-up frame), centre on the node.
  const centre: Ecef = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const centreYUp = [centre[0], centre[2], -centre[1]];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= centreYUp[0];
    positions[i + 1] -= centreYUp[1];
    positions[i + 2] -= centreYUp[2];
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (
    type: "VEC3" | "SCALAR",
    arr: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>,
  ) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
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
    .setAttribute("_FEATURE_ID_0", acc("SCALAR", new Float32Array(featureIds)))
    .setIndices(acc("SCALAR", new Uint32Array(indices)))
    .setMaterial(material);
  const mesh = doc.createMesh("buildings").addPrimitive(prim);
  doc
    .createScene("scene")
    .addChild(
      doc
        .createNode("buildings")
        .setMesh(mesh)
        .setTranslation([centreYUp[0], centreYUp[1], centreYUp[2]]),
    );

  const glb = addMeshFeatures(
    await new NodeIO().writeBinary(doc),
    buildings.map((b) => {
      const lot = lots.get(lotCode(b.id));
      return {
        code: b.id,
        floors: b.floors,
        height: Math.round(b.height * 10) / 10,
        roofForm: b.roofForm,
        address: lot?.address ?? "",
        barrio: lot?.barrio ?? "",
        estrato: lot?.estrato ?? "",
        destino: lot?.destino ?? "",
        uso: lot?.uso ?? "",
        vetustez: lot?.vetustez ?? 0,
        ph: lot?.ph ?? "",
        predios: lot?.predios ?? 0,
        areaConstruida: lot?.areaConstruida ?? 0,
      };
    }),
  );
  return { glb, bounds: { min: min as Ecef, max: max as Ecef } };
}

/** Per-building attributes written into the GLB as an EXT_structural_metadata property table. */
export type FeatureProps = {
  code: string;
  floors: number;
  height: number;
  roofForm: string;
  address: string;
  barrio: string;
  estrato: string;
  destino: string;
  uso: string;
  vetustez: number;
  ph: string;
  predios: number;
  areaConstruida: number;
};

/**
 * Patches the GLB so each building is a pickable feature: EXT_mesh_features on the primitive,
 * pointing at _FEATURE_ID_0, plus an EXT_structural_metadata property table with the
 * attributes. Cesium only creates pickable features when a property table backs the feature ids.
 * The property table's columns are appended to the binary chunk as new buffer views.
 */
export function addMeshFeatures(glb: Uint8Array, props: FeatureProps[]): Uint8Array {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const binLength = view.getUint32(20 + jsonLength, true);
  const bin = glb.subarray(binStart, binStart + binLength);

  // Columns: strings as UTF-8 + UINT32 offsets, numbers as typed arrays.
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const bufferViews: { byteOffset: number; byteLength: number }[] = [];
  let cursor = bin.length;
  const addView = (data: Uint8Array) => {
    const pad = (8 - (cursor % 8)) % 8;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      cursor += pad;
    }
    bufferViews.push({ byteOffset: cursor, byteLength: data.length });
    chunks.push(data);
    cursor += data.length;
    return json.bufferViews.length + bufferViews.length - 1;
  };
  const u8 = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const stringColumn = (get: (p: FeatureProps) => string) => {
    const parts = props.map((p) => enc.encode(get(p)));
    const offsets = new Uint32Array(props.length + 1);
    for (let i = 0; i < parts.length; i++) offsets[i + 1] = offsets[i] + parts[i].length;
    const bytes = new Uint8Array(offsets[props.length]);
    parts.forEach((c, i) => bytes.set(c, offsets[i]));
    return { values: addView(bytes), stringOffsets: addView(u8(offsets)) };
  };
  const int32Column = (get: (p: FeatureProps) => number) => ({
    values: addView(u8(new Int32Array(props.map((p) => Math.round(get(p) || 0))))),
  });
  const float32Column = (get: (p: FeatureProps) => number) => ({
    values: addView(u8(new Float32Array(props.map((p) => get(p) || 0)))),
  });
  const columns = {
    code: stringColumn((p) => p.code),
    floors: int32Column((p) => p.floors),
    height: float32Column((p) => p.height),
    roofForm: stringColumn((p) => p.roofForm),
    address: stringColumn((p) => p.address),
    barrio: stringColumn((p) => p.barrio),
    estrato: stringColumn((p) => p.estrato),
    destino: stringColumn((p) => p.destino),
    uso: stringColumn((p) => p.uso),
    vetustez: int32Column((p) => p.vetustez),
    ph: stringColumn((p) => p.ph),
    predios: int32Column((p) => p.predios),
    areaConstruida: float32Column((p) => p.areaConstruida),
  };
  const tail = (8 - (cursor % 8)) % 8;
  if (tail) chunks.push(new Uint8Array(tail));

  json.bufferViews.push(...bufferViews.map((v) => ({ buffer: 0, ...v })));
  json.extensionsUsed = [
    ...new Set([...(json.extensionsUsed ?? []), "EXT_mesh_features", "EXT_structural_metadata"]),
  ];
  json.extensions = {
    ...(json.extensions ?? {}),
    EXT_structural_metadata: {
      schema: {
        id: "maqueta",
        classes: {
          building: {
            properties: {
              code: { type: "STRING", description: "Catastro building code" },
              floors: { type: "SCALAR", componentType: "INT32" },
              height: { type: "SCALAR", componentType: "FLOAT32", description: "metres, LiDAR" },
              roofForm: { type: "STRING" },
              address: { type: "STRING", description: "Dirección oficial" },
              barrio: { type: "STRING" },
              estrato: { type: "STRING" },
              destino: { type: "STRING", description: "Destino económico" },
              uso: { type: "STRING", description: "Uso principal por área" },
              vetustez: { type: "SCALAR", componentType: "INT32", description: "Año" },
              ph: { type: "STRING", description: "PH / NPH" },
              predios: { type: "SCALAR", componentType: "INT32" },
              areaConstruida: { type: "SCALAR", componentType: "FLOAT32", description: "m²" },
            },
          },
        },
      },
      propertyTables: [
        {
          name: "buildings",
          class: "building",
          count: props.length,
          properties: columns,
        },
      ],
    },
  };
  const prim = json.meshes[0].primitives[0];
  prim.extensions = {
    ...(prim.extensions ?? {}),
    EXT_mesh_features: {
      featureIds: [{ featureCount: props.length, attribute: 0, propertyTable: 0 }],
    },
  };

  const newBin = concat([bin, ...chunks]);
  json.buffers[0].byteLength = newBin.length;
  let jsonBytes: Uint8Array = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) jsonBytes = concat([jsonBytes, new Uint8Array(jpad).fill(0x20)]);

  const out = new Uint8Array(12 + 8 + jsonBytes.length + 8 + newBin.length);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, 0x46546c67, true);
  ov.setUint32(4, 2, true);
  ov.setUint32(8, out.length, true);
  ov.setUint32(12, jsonBytes.length, true);
  ov.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  ov.setUint32(20 + jsonBytes.length, newBin.length, true);
  ov.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  out.set(newBin, 28 + jsonBytes.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
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
