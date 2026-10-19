// Fallback for areas outside IDECA's LiDAR coverage: Catastro "Construcción" footprints extruded
// by floor count (CONNPISOS × 3 m), turned into the same triangle soup the LiDAR path produces.
// Heights are relative (base at 0) and baseElevation is 0, so terrain sampling seats them.
import earcut from "earcut";
import type { Building } from "./fetch.js";

const LAYER =
  "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/construccion/MapServer/0/query";
const FLOOR = 3;

export async function fetchFootprints(
  bbox: [number, number, number, number],
  keep: (lon: number, lat: number) => boolean,
): Promise<Building[]> {
  const out: Building[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      f: "geojson",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "CONCODIGO,CONNPISOS",
      resultOffset: String(offset),
      resultRecordCount: "1000",
    });
    const res = await fetch(`${LAYER}?${params}`);
    const page = (await res.json()) as {
      features: {
        properties: Record<string, unknown>;
        geometry: { type: string; coordinates: number[][][] | number[][][][] } | null;
      }[];
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
    };
    for (const f of page.features) {
      if (!f.geometry) continue;
      const polys =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][])
          : [f.geometry.coordinates as number[][][]];
      const floors = Math.max(Number(f.properties.CONNPISOS) || 1, 1);
      const height = floors * FLOOR;
      for (const poly of polys) {
        const ring = poly[0].map(([x, y]) => [x, y] as [number, number]);
        if (ring.length > 1) {
          const [a, b] = [ring[0], ring[ring.length - 1]];
          if (a[0] === b[0] && a[1] === b[1]) ring.pop();
        }
        if (ring.length < 3 || areaM2(ring) < 25) continue;
        const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
        const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        if (!keep(cx, cy)) continue;
        out.push({
          id: String(f.properties.CONCODIGO ?? ""),
          floors,
          height,
          baseElevation: 0,
          roofForm: "Flat",
          triangles: extrude(ring, height),
        });
      }
    }
    const more = page.exceededTransferLimit ?? page.properties?.exceededTransferLimit;
    if (!more || page.features.length === 0) break;
    offset += page.features.length;
  }
  return out;
}

/** Roof triangles plus two triangles per wall, as [lon, lat, z]. */
export function extrude(ring: [number, number][], height: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const tri = earcut(ring.flat());
  for (let i = 0; i < tri.length; i += 3) {
    for (const k of [tri[i], tri[i + 1], tri[i + 2]]) out.push([ring[k][0], ring[k][1], height]);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push([a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], height]);
    out.push([a[0], a[1], 0], [b[0], b[1], height], [a[0], a[1], height]);
  }
  return out;
}

/** Planar area in square metres (equirectangular approximation). */
function areaM2(ring: [number, number][]): number {
  const kx = 111320 * Math.cos((ring[0][1] * Math.PI) / 180);
  const ky = 110574;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * kx * (y1 * ky) - x1 * kx * (y0 * ky);
  }
  return Math.abs(a) / 2;
}
