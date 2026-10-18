// IDECA heights are orthometric; Cesium terrain is ellipsoidal. Sample the terrain the viewer
// will render at each building and derive the per-building offset, so every model sits exactly
// on that terrain. Needs CESIUM_ION_TOKEN (or NEXT_PUBLIC_CESIUM_ION_TOKEN) in env.
import {
  Cartographic,
  CesiumTerrainProvider,
  createWorldTerrainAsync,
  Ion,
  sampleTerrainMostDetailed,
} from "cesium";
import type { Building } from "./fetch.js";

export async function sampleHeightOffsets(
  buildings: Building[],
  terrainAssetId?: number,
): Promise<number[]> {
  const token = process.env.CESIUM_ION_TOKEN ?? process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  if (!token) throw new Error("CESIUM_ION_TOKEN is not set");
  Ion.defaultAccessToken = token;
  const terrain = terrainAssetId
    ? await CesiumTerrainProvider.fromIonAssetId(terrainAssetId)
    : await createWorldTerrainAsync();
  const points = buildings.map((b) => {
    const [lon, lat] = centroid(b);
    return Cartographic.fromDegrees(lon, lat);
  });
  const heights: number[] = [];
  const BATCH = 1000;
  for (let i = 0; i < points.length; i += BATCH) {
    const sampled = await sampleTerrainMostDetailed(terrain, points.slice(i, i + BATCH));
    for (const c of sampled) heights.push(c.height);
  }
  return buildings.map((b, i) => heights[i] - b.baseElevation);
}

/** Centroid of all vertices. */
export function centroid(b: Building): [number, number] {
  const n = b.triangles.length || 1;
  return [
    b.triangles.reduce((s, p) => s + p[0], 0) / n,
    b.triangles.reduce((s, p) => s + p[1], 0) / n,
  ];
}
