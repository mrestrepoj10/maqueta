/** Metadata of a picked building, read from the tileset's EXT_structural_metadata table. */
export type BuildingInfo = {
  /** Catastro building code (ConCodigo). */
  id: string;
  featureId?: number;
  floors?: number;
  /** Metres, LiDAR. */
  height?: number;
  roofForm?: string;
  address?: string;
  barrio?: string;
  estrato?: string;
  /** Destino económico. */
  destino?: string;
  /** Main use by area. */
  uso?: string;
  /** Year of construction. */
  vetustez?: number;
  /** "PH" or "NPH". */
  ph?: string;
  predios?: number;
  /** Built area, m². */
  areaConstruida?: number;
};

const FIELDS: (keyof BuildingInfo)[] = [
  "floors",
  "height",
  "roofForm",
  "address",
  "barrio",
  "estrato",
  "destino",
  "uso",
  "vetustez",
  "ph",
  "predios",
  "areaConstruida",
];

/** Reads every known property off a picked Cesium3DTileFeature, dropping empty values. */
export function readBuildingInfo(
  featureId: number,
  getProperty: (name: string) => unknown,
): BuildingInfo {
  const info: BuildingInfo = { id: String(getProperty("code") ?? featureId), featureId };
  for (const f of FIELDS) {
    const v = getProperty(f);
    if (v === undefined || v === null || v === "" || v === 0) continue;
    (info as Record<string, unknown>)[f] = v;
  }
  return info;
}

const LABELS = {
  es: {
    barrio: "barrio",
    floors: "pisos",
    height: "altura",
    roofForm: "cubierta",
    uso: "uso",
    destino: "destino",
    estrato: "estrato",
    ph: "régimen",
    vetustez: "año",
    predios: "predios",
    areaConstruida: "construido",
  },
  en: {
    barrio: "Barrio",
    floors: "Floors",
    height: "Height",
    roofForm: "Roof",
    uso: "Use",
    destino: "Destino",
    estrato: "Estrato",
    ph: "Regime",
    vetustez: "Built",
    predios: "Predios",
    areaConstruida: "Built area",
  },
} as const;

/** Label/value rows for an info card, skipping fields the building doesn't have. */
export function infoRows(b: BuildingInfo, lang: "es" | "en"): [string, string][] {
  const L = LABELS[lang];
  const locale = lang === "es" ? "es-CO" : "en";
  const rows: [string, string | number | undefined][] = [
    [L.barrio, b.barrio],
    [L.floors, b.floors],
    [L.height, b.height !== undefined ? `${b.height.toFixed(1)} m` : undefined],
    [L.roofForm, b.roofForm],
    [L.uso, b.uso],
    [L.destino, b.destino],
    [L.estrato, b.estrato?.replace(/^Estrato /, "")],
    [L.ph, b.ph],
    [L.vetustez, b.vetustez],
    [L.predios, b.predios],
    [
      L.areaConstruida,
      b.areaConstruida ? `${Math.round(b.areaConstruida).toLocaleString(locale)} m²` : undefined,
    ],
  ];
  return rows
    .filter((r): r is [string, string | number] => r[1] !== undefined)
    .map(([k, v]) => [k, String(v)]);
}
