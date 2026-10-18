import type { Bounds } from "./glb.js";

/** A single-tile 3D Tiles 1.1 tileset whose content is a glTF binary in ECEF. */
export function tilesetJson(bounds: Bounds, uri: string) {
  const { min, max } = bounds;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const hx = (max[0] - min[0]) / 2;
  const hy = (max[1] - min[1]) / 2;
  const hz = (max[2] - min[2]) / 2;
  return {
    asset: { version: "1.1" },
    geometricError: 500,
    root: {
      boundingVolume: { box: [cx, cy, cz, hx, 0, 0, 0, hy, 0, 0, 0, hz] },
      geometricError: 0,
      refine: "ADD",
      content: { uri },
    },
  };
}
