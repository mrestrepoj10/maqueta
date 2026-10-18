import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeMultipatch, mercatorToLonLat, toBuilding } from "./fetch.js";

/** Builds a binaryPatches buffer with one part of the given type. */
function patches(type: number, pts: [number, number, number][]): string {
  const n = pts.length;
  const raw = Buffer.alloc(44 + 4 + 4 + 16 * n + 16 + 8 * n);
  raw.writeUInt32LE(0x88000036, 0);
  raw.writeInt32LE(1, 36);
  raw.writeInt32LE(n, 40);
  raw.writeInt32LE(0, 44);
  raw.writeInt32LE(type, 48);
  let off = 52;
  for (const [x, y] of pts) {
    raw.writeDoubleLE(x, off);
    raw.writeDoubleLE(y, off + 8);
    off += 16;
  }
  off += 16;
  for (const [, , z] of pts) {
    raw.writeDoubleLE(z, off);
    off += 8;
  }
  const z = deflateSync(raw);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x88800036, 0);
  head.writeInt32LE(raw.length, 4);
  head.writeInt32LE(z.length, 8);
  return Buffer.concat([head, z]).toString("base64");
}

describe("decodeMultipatch", () => {
  it("reads a triangle list", () => {
    const t = decodeMultipatch(
      Buffer.from(
        patches(6, [
          [0, 0, 1],
          [10, 0, 1],
          [0, 10, 1],
        ]),
        "base64",
      ),
    );
    expect(t).toHaveLength(3);
    expect(t[1][0]).toBeCloseTo(mercatorToLonLat(10, 0)[0]);
    expect(t[0][2]).toBe(1);
  });
  it("fans a ring of four points into two triangles", () => {
    const t = decodeMultipatch(
      Buffer.from(
        patches(2, [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ]),
        "base64",
      ),
    );
    expect(t).toHaveLength(6);
  });
});

describe("toBuilding", () => {
  it("reads attributes", () => {
    const b = toBuilding({
      attributes: {
        ConCodigo: "x",
        ConNPisos: 3,
        BLDGHEIGHT: 9.5,
        BASEELEV: 2586,
        ROOFFORM: "Flat",
      },
      geometry: {
        binaryPatches: patches(6, [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ]),
      },
    });
    expect(b?.height).toBe(9.5);
    expect(b?.triangles).toHaveLength(3);
  });
  it("returns null without geometry", () => {
    expect(toBuilding({ attributes: {} })).toBeNull();
  });
});

describe("mercatorToLonLat", () => {
  it("maps the origin to 0,0", () => {
    expect(mercatorToLonLat(0, 0)).toEqual([0, 0]);
  });
});

describe("addMeshFeatures", () => {
  it("adds a property table and keeps the GLB well formed", async () => {
    const { addMeshFeatures } = await import("./glb.js");
    const json = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ byteLength: 8 }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }],
        meshes: [{ primitives: [{ attributes: {} }] }],
      }),
    );
    const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
    padded.set(json);
    const glb = new Uint8Array(28 + padded.length + 8);
    const v = new DataView(glb.buffer);
    v.setUint32(0, 0x46546c67, true);
    v.setUint32(4, 2, true);
    v.setUint32(8, glb.length, true);
    v.setUint32(12, padded.length, true);
    v.setUint32(16, 0x4e4f534a, true);
    glb.set(padded, 20);
    v.setUint32(20 + padded.length, 8, true);
    v.setUint32(24 + padded.length, 0x004e4942, true);
    const base = {
      address: "KR 7 72 41",
      barrio: "Porciuncula",
      estrato: "Estrato 4",
      destino: "Comercio",
      uso: "Hoteles",
      vetustez: 2008,
      ph: "NPH",
      predios: 1,
      areaConstruida: 21754.9,
    };
    const out = addMeshFeatures(glb, [
      { code: "a", floors: 2, height: 6.5, roofForm: "Flat", ...base },
      { code: "bb", floors: 10, height: 30, roofForm: "Gable", ...base },
    ]);
    const ov = new DataView(out.buffer);
    const len = ov.getUint32(12, true);
    const parsed = JSON.parse(new TextDecoder().decode(out.subarray(20, 20 + len)));
    expect(parsed.extensionsUsed).toContain("EXT_structural_metadata");
    expect(parsed.extensions.EXT_structural_metadata.propertyTables[0].count).toBe(2);
    expect(
      parsed.meshes[0].primitives[0].extensions.EXT_mesh_features.featureIds[0].propertyTable,
    ).toBe(0);
    expect(parsed.bufferViews).toHaveLength(1 + 2 * 8 + 5);
    expect(ov.getUint32(8, true)).toBe(out.length);
    expect(ov.getUint32(20 + len, true)).toBe(parsed.buffers[0].byteLength);
  });
});
