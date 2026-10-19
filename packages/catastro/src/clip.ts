// Clip-to-area helpers: keep features whose point lies inside a polygon or within a buffer of it.
import { readFileSync } from "node:fs";

export type Ring = [number, number][];

/** Outer rings of every (multi)polygon in a GeoJSON file. */
export function readRings(path: string): Ring[] {
  const fc = JSON.parse(readFileSync(path, "utf8")) as {
    features: { geometry: { type: string; coordinates: unknown } }[];
  };
  const rings: Ring[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const polys =
      g.type === "MultiPolygon"
        ? (g.coordinates as number[][][][])
        : [g.coordinates as number[][][]];
    for (const p of polys) rings.push(p[0].map(([x, y]) => [x, y] as [number, number]));
  }
  return rings;
}

/** True when (lon, lat) is inside any ring or within `buffer` metres of its edge. */
export function makeClip(rings: Ring[], buffer = 0): (lon: number, lat: number) => boolean {
  const kx = 111320 * Math.cos((rings[0]?.[0]?.[1] ?? 0) * (Math.PI / 180));
  const ky = 110574;
  return (lon, lat) => {
    for (const ring of rings) {
      if (inside(ring, lon, lat)) return true;
      if (buffer > 0 && distanceToRing(ring, lon, lat, kx, ky) <= buffer) return true;
    }
    return false;
  };
}

export function inside(ring: Ring, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function distanceToRing(ring: Ring, lon: number, lat: number, kx: number, ky: number): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const px = (lon - ax) * kx;
    const py = (lat - ay) * ky;
    const dx = (bx - ax) * kx;
    const dy = (by - ay) * ky;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best;
}
