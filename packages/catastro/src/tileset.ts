import type { Bounds } from "./glb.js";

type Box = number[];

function box({ min, max }: Bounds): Box {
  const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const h = [0, 1, 2].map((i) => (max[i] - min[i]) / 2);
  return [c[0], c[1], c[2], h[0], 0, 0, 0, h[1], 0, 0, 0, h[2]];
}

/** A single-tile 3D Tiles 1.1 tileset whose content is a glTF binary in ECEF. */
export function tilesetJson(bounds: Bounds, uri: string) {
  return {
    asset: { version: "1.1" },
    geometricError: 500,
    root: {
      boundingVolume: { box: box(bounds) },
      geometricError: 0,
      refine: "ADD",
      content: { uri },
    },
  };
}

/**
 * A flat grid of tiles under an empty root. Every child is loaded once it is in view; the root's
 * large geometric error makes Cesium refine into the children at any useful distance.
 */
export function gridTilesetJson(tiles: { bounds: Bounds; uri: string }[]) {
  const min = [Infinity, Infinity, Infinity] as [number, number, number];
  const max = [-Infinity, -Infinity, -Infinity] as [number, number, number];
  for (const t of tiles) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], t.bounds.min[i]);
      max[i] = Math.max(max[i], t.bounds.max[i]);
    }
  }
  return {
    asset: { version: "1.1" },
    geometricError: 2000,
    root: {
      boundingVolume: { box: box({ min, max }) },
      geometricError: 1000,
      refine: "ADD",
      children: tiles.map((t) => ({
        boundingVolume: { box: box(t.bounds) },
        geometricError: 0,
        content: { uri: t.uri },
      })),
    },
  };
}
