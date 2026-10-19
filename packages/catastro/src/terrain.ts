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
  // LiDAR models carry their own ground (baseElevation): one sample at the centroid converts
  // orthometric to ellipsoidal. Extruded footprints start at 0, so sample every base vertex and
  // seat them on the lowest point: on slopes nothing floats, the uphill side sinks into the ground.
  const points: Cartographic[] = [];
  const owner: number[] = [];
  buildings.forEach((b, i) => {
    if (b.baseElevation !== 0) {
      const [lon, lat] = centroid(b);
      points.push(Cartographic.fromDegrees(lon, lat));
      owner.push(i);
      return;
    }
    const seen = new Set<string>();
    for (const [lon, lat, z] of b.triangles) {
      if (z !== 0) continue;
      const k = `${lon},${lat}`;
      if (seen.has(k)) continue;
      seen.add(k);
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
  const ground = buildings.map(() => Infinity);
  heights.forEach((h, k) => {
    ground[owner[k]] = Math.min(ground[owner[k]], h);
  });
  return buildings.map((b, i) => ground[i] - b.baseElevation);
}

/** Centroid of all vertices. */
export function centroid(b: Building): [number, number] {
  const n = b.triangles.length || 1;
  return [
    b.triangles.reduce((s, p) => s + p[0], 0) / n,
    b.triangles.reduce((s, p) => s + p[1], 0) / n,
  ];
}
