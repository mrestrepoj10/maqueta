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
