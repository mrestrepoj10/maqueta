export type Building = {
  id: string;
  /** Outer ring, [lon, lat]. Holes are ignored for now. */
  ring: [number, number][];
  floors: number;
  /** Metres. Catastro's CONALTURA is unpopulated in practice, so this is floors * 3. */
  height: number;
  /** Ground height above the ellipsoid, filled in by terrain sampling. */
  groundHeight?: number;
};

const LAYER =
  "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/construccion/MapServer/0/query";

const PAGE = 1000;
/** Metres per storey used to extrude footprints. */
export const FLOOR_HEIGHT = 3;

export async function fetchBuildings(
  bbox: [number, number, number, number],
  fetchImpl: typeof fetch = fetch,
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
      resultRecordCount: String(PAGE),
    });
    const res = await fetchImpl(`${LAYER}?${params}`);
    if (!res.ok) throw new Error(`catastro ${res.status}: ${await res.text()}`);
    const fc = (await res.json()) as {
      features: {
        properties: Record<string, unknown>;
        geometry: { type: string; coordinates: number[][][] | number[][][][] };
      }[];
      exceededTransferLimit?: boolean;
    };
    for (const f of fc.features) out.push(...toBuildings(f));
    if (!fc.exceededTransferLimit || fc.features.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export function toBuildings(f: {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}): Building[] {
  const p = f.properties;
  const floors = Math.max(num(p.CONNPISOS) ?? 1, 1);
  const height = floors * FLOOR_HEIGHT;
  const id = String(p.CONCODIGO ?? "");
  const polys =
    f.geometry.type === "MultiPolygon"
      ? (f.geometry.coordinates as number[][][][])
      : [f.geometry.coordinates as number[][][]];
  return polys
    .map((poly, i) => {
      const ring = poly[0].map(([x, y]) => [x, y] as [number, number]);
      if (ring.length > 1) {
        const [fx, fy] = ring[0];
        const [lx, ly] = ring[ring.length - 1];
        if (fx === lx && fy === ly) ring.pop();
      }
      return { id: polys.length > 1 ? `${id}#${i}` : id, ring, floors, height };
    })
    .filter((b) => b.ring.length >= 3);
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
