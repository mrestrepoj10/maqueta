// Samples Cesium World Terrain (ellipsoidal heights) at each building so the extrusion sits on the
// same terrain the viewer renders. Needs CESIUM_ION_TOKEN (or NEXT_PUBLIC_CESIUM_ION_TOKEN) in env.
import { Cartographic, createWorldTerrainAsync, Ion, sampleTerrainMostDetailed } from "cesium";
import type { Building } from "./fetch.js";

/**
 * Samples terrain at every footprint vertex. Returns, per building, the lowest and highest ground
 * height under its outline, so walls can extend to the downhill side on slopes.
 */
export async function sampleGroundHeights(
  buildings: Building[],
): Promise<{ min: number; max: number }[]> {
  const token = process.env.CESIUM_ION_TOKEN ?? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  if (!token) throw new Error("CESIUM_ION_TOKEN is not set");
  Ion.defaultAccessToken = token;
  const terrain = await createWorldTerrainAsync();
  const points: Cartographic[] = [];
  const owner: number[] = [];
  buildings.forEach((b, i) => {
    for (const [lon, lat] of b.ring) {
      points.push(Cartographic.fromDegrees(lon, lat));
      owner.push(i);
    }
  });
  const heights: number[] = [];
  const BATCH = 1000;
  for (let i = 0; i < points.length; i += BATCH) {
    const sampled = await sampleTerrainMostDetailed(terrain, points.slice(i, i + BATCH));
    for (const c of sampled) heights.push(c.height);
  }
  const out = buildings.map(() => ({ min: Infinity, max: -Infinity }));
  heights.forEach((h, i) => {
    const o = out[owner[i]];
    if (h < o.min) o.min = h;
    if (h > o.max) o.max = h;
  });
  return out;
}

export function centroid(ring: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  return [x / ring.length, y / ring.length];
}
