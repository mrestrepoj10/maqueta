// Samples Cesium World Terrain (ellipsoidal heights) at each building so the extrusion sits on the
// same terrain the viewer renders. Needs CESIUM_ION_TOKEN (or NEXT_PUBLIC_CESIUM_ION_TOKEN) in env.
import { Cartographic, createWorldTerrainAsync, Ion, sampleTerrainMostDetailed } from "cesium";
import type { Building } from "./fetch.js";

export async function sampleGroundHeights(buildings: Building[]): Promise<number[]> {
  const token = process.env.CESIUM_ION_TOKEN ?? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  if (!token) throw new Error("CESIUM_ION_TOKEN is not set");
  Ion.defaultAccessToken = token;
  const terrain = await createWorldTerrainAsync();
  const points = buildings.map((b) => {
    const [lon, lat] = centroid(b.ring);
    return Cartographic.fromDegrees(lon, lat);
  });
  const out: number[] = [];
  const BATCH = 500;
  for (let i = 0; i < points.length; i += BATCH) {
    const chunk = points.slice(i, i + BATCH);
    const sampled = await sampleTerrainMostDetailed(terrain, chunk);
    for (const c of sampled) out.push(c.height);
  }
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
