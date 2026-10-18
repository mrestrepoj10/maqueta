// IDECA "Volumetría 2025": LiDAR-derived 3D building models for Bogotá, an ArcGIS multipatch
// feature layer. With `multipatchOption=stripMaterials` the query returns the true mesh as a
// zlib-compressed Esri shape buffer (`binaryPatches`) in Web Mercator with orthometric Z.
import { inflateSync } from "node:zlib";

export type Building = {
  id: string;
  floors: number;
  /** Metres, from LiDAR. */
  height: number;
  /** Orthometric ground elevation at the building, from the dataset. */
  baseElevation: number;
  roofForm: string;
  /** Triangle soup: [lon, lat, z] per vertex, three vertices per triangle. */
  triangles: [number, number, number][];
  /** Ellipsoidal minus orthometric height at this building, filled in by terrain sampling. */
  heightOffset?: number;
};

export const LAYER =
  "https://services1.arcgis.com/J5ltM0ovtzXUbp7B/ArcGIS/rest/services/Volumetr%C3%ADa_2025/FeatureServer/16/query";

const PAGE = 250;

export async function fetchBuildings(
  bbox: [number, number, number, number],
  fetchImpl: typeof fetch = fetch,
): Promise<Building[]> {
  const out: Building[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      f: "json",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "ConCodigo,ConNPisos,BLDGHEIGHT,BASEELEV,ROOFFORM",
      returnZ: "true",
      multipatchOption: "stripMaterials",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    });
    const res = await fetchImpl(`${LAYER}?${params}`);
    if (!res.ok) throw new Error(`ideca ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as {
      error?: { message: string };
      features: { attributes: Record<string, unknown>; geometry?: { binaryPatches?: string } }[];
      exceededTransferLimit?: boolean;
    };
    if (page.error) throw new Error(`ideca: ${page.error.message}`);
    for (const f of page.features) {
      const b = toBuilding(f);
      if (b) out.push(b);
    }
    if (!page.exceededTransferLimit || page.features.length === 0) break;
    offset += page.features.length;
  }
  return out;
}

export function toBuilding(f: {
  attributes: Record<string, unknown>;
  geometry?: { binaryPatches?: string };
}): Building | null {
  if (!f.geometry?.binaryPatches) return null;
  const triangles = decodeMultipatch(Buffer.from(f.geometry.binaryPatches, "base64"));
  if (triangles.length === 0) return null;
  const p = f.attributes;
  return {
    id: String(p.ConCodigo ?? ""),
    floors: num(p.ConNPisos) ?? 0,
    height: num(p.BLDGHEIGHT) ?? 0,
    baseElevation: num(p.BASEELEV) ?? 0,
    roofForm: String(p.ROOFFORM ?? ""),
    triangles,
  };
}

// Esri multipatch part types.
const TRIANGLE_STRIP = 0;
const TRIANGLE_FAN = 1;
const TRIANGLES = 6;

/**
 * Decodes `binaryPatches`: int32 shape type, int32 uncompressed length, int32 compressed length,
 * then a zlib stream holding a shapefile-style multipatch (bbox, parts, part types, XY, Z range, Z).
 * Rings (part types 2–5) are returned as fans, which is exact for convex faces and good enough for
 * roof outlines in this dataset.
 */
export function decodeMultipatch(buf: Buffer): [number, number, number][] {
  const compressedLength = buf.readInt32LE(8);
  const raw = inflateSync(buf.subarray(12, 12 + compressedLength));
  const numParts = raw.readInt32LE(36);
  const numPoints = raw.readInt32LE(40);
  let off = 44;
  const parts: number[] = [];
  for (let i = 0; i < numParts; i++, off += 4) parts.push(raw.readInt32LE(off));
  const types: number[] = [];
  for (let i = 0; i < numParts; i++, off += 4) types.push(raw.readInt32LE(off));
  const xy: number[] = [];
  for (let i = 0; i < numPoints * 2; i++, off += 8) xy.push(raw.readDoubleLE(off));
  off += 16; // z range
  const z: number[] = [];
  for (let i = 0; i < numPoints; i++, off += 8) z.push(raw.readDoubleLE(off));

  const vertex = (i: number): [number, number, number] => {
    const [lon, lat] = mercatorToLonLat(xy[2 * i], xy[2 * i + 1]);
    return [lon, lat, z[i]];
  };
  const out: [number, number, number][] = [];
  for (let p = 0; p < numParts; p++) {
    const start = parts[p];
    const end = p + 1 < numParts ? parts[p + 1] : numPoints;
    const n = end - start;
    if (n < 3) continue;
    if (types[p] === TRIANGLES) {
      for (let i = start; i + 2 < end; i += 3) out.push(vertex(i), vertex(i + 1), vertex(i + 2));
    } else if (types[p] === TRIANGLE_STRIP) {
      for (let i = start; i + 2 < end; i++) {
        const flip = (i - start) % 2 === 1;
        out.push(vertex(i), vertex(flip ? i + 2 : i + 1), vertex(flip ? i + 1 : i + 2));
      }
    } else {
      // Fan, and rings treated as fans.
      void TRIANGLE_FAN;
      for (let i = start + 1; i + 1 < end; i++) out.push(vertex(start), vertex(i), vertex(i + 1));
    }
  }
  return out;
}

const R = 6378137;
export function mercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
