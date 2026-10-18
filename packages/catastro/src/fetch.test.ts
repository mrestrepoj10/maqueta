import { describe, expect, it } from "vitest";
import { toBuildings } from "./fetch.js";
import { signedArea } from "./glb.js";

const feature = (props: Record<string, unknown>, closed = true) => ({
  properties: props,
  geometry: {
    type: "Polygon",
    coordinates: [
      closed
        ? [
            [-74.05, 4.65],
            [-74.05, 4.651],
            [-74.049, 4.651],
            [-74.05, 4.65],
          ]
        : [
            [-74.05, 4.65],
            [-74.05, 4.651],
            [-74.049, 4.651],
          ],
    ],
  },
});

describe("toBuildings", () => {
  it("extrudes floors * 3", () => {
    const [b] = toBuildings(feature({ CONCODIGO: "x", CONNPISOS: 4 }));
    expect(b.height).toBe(12);
    expect(b.floors).toBe(4);
  });
  it("treats missing or zero floors as one", () => {
    const [b] = toBuildings(feature({ CONCODIGO: "x", CONNPISOS: 0 }));
    expect(b.height).toBe(3);
  });
  it("drops the closing vertex", () => {
    const [b] = toBuildings(feature({ CONCODIGO: "x" }));
    expect(b.ring).toHaveLength(3);
  });
  it("keeps an unclosed ring as is", () => {
    const [b] = toBuildings(feature({ CONCODIGO: "x" }, false));
    expect(b.ring).toHaveLength(3);
  });
});

describe("signedArea", () => {
  it("is positive for counter-clockwise rings", () => {
    expect(
      signedArea([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toBeGreaterThan(0);
  });
});
