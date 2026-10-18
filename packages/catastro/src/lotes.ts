// Catastro "Lote" service: per-lot socio-economic data in three related tables (Predio, Uso,
// Estrato). A building code (ConCodigo, 25 chars) starts with its 12-char lot code, which is the
// join key. Coded values are decoded with the tables' own domains.

export type LotInfo = {
  lot: string;
  address?: string;
  barrio?: string;
  estrato?: string;
  /** Destino económico, decoded. */
  destino?: string;
  /** Main use by area, decoded. */
  uso?: string;
  /** Year of construction (vetustez). */
  vetustez?: number;
  /** "PH" (propiedad horizontal) or "NPH". */
  ph?: string;
  /** Number of predios in the lot. */
  predios?: number;
  /** Built area, m². */
  areaConstruida?: number;
  /** Land area, m². */
  areaTerreno?: number;
};

const SERVICE =
  "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/catastro/lote/MapServer";
const BATCH = 100;

type Domain = Map<string, string>;

async function domain(table: number, field: string, fetchImpl: typeof fetch): Promise<Domain> {
  const res = await fetchImpl(`${SERVICE}/${table}?f=json`);
  const meta = (await res.json()) as {
    fields: {
      name: string;
      domain?: { codedValues?: { code: string | number; name: string }[] };
    }[];
  };
  const f = meta.fields.find((x) => x.name === field);
  return new Map((f?.domain?.codedValues ?? []).map((c) => [String(c.code), c.name]));
}

async function query(
  table: number,
  where: string,
  outFields: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ f: "json", where, outFields, returnGeometry: "false" });
  const res = await fetchImpl(`${SERVICE}/${table}/query?${params}`);
  if (!res.ok) throw new Error(`lote ${table}: ${res.status}`);
  const page = (await res.json()) as {
    error?: { message: string };
    features: { attributes: Record<string, unknown> }[];
  };
  if (page.error) throw new Error(`lote ${table}: ${page.error.message}`);
  return page.features.map((f) => f.attributes);
}

export function lotCode(buildingCode: string): string {
  return buildingCode.slice(0, 12);
}

export async function fetchLots(
  lotCodes: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, LotInfo>> {
  const [dDestino, dUso, dEstrato] = await Promise.all([
    domain(3, "PRECDESTIN", fetchImpl),
    domain(2, "USOTUSO", fetchImpl),
    domain(1, "ESOESTRATO", fetchImpl),
  ]);
  const out = new Map<string, LotInfo>();
  const lots = [...new Set(lotCodes)].filter((l) => l.length === 12);
  for (let i = 0; i < lots.length; i += BATCH) {
    const chunk = lots.slice(i, i + BATCH);
    const list = chunk.map((l) => `'${l}'`).join(",");
    const [predios, usos, estratos] = await Promise.all([
      query(
        3,
        `BARMANPRE IN (${list})`,
        "BARMANPRE,PREDIRECC,PRENBARRIO,PRECDESTIN,PREVETUSTZ,PREUSOPH,PREACONST,PREATERRE,PRECHIP",
        fetchImpl,
      ),
      query(2, `USOCLOTE IN (${list})`, "USOCLOTE,USOTUSO,USOAREA", fetchImpl),
      query(1, `ESOCLOTE IN (${list})`, "ESOCLOTE,ESOESTRATO", fetchImpl),
    ]);
    for (const lot of chunk) out.set(lot, { lot });
    // Predio rows: one per predio (and sometimes per use); count distinct CHIPs and sum their
    // built area once each.
    const chips = new Map<string, Map<string, number>>();
    for (const r of predios) {
      const lot = String(r.BARMANPRE);
      const info = out.get(lot);
      if (!info) continue;
      const m = chips.get(lot) ?? new Map<string, number>();
      m.set(String(r.PRECHIP), num(r.PREACONST) ?? 0);
      chips.set(lot, m);
      info.address ??= str(r.PREDIRECC);
      info.barrio ??= title(str(r.PRENBARRIO));
      info.destino ??= dDestino.get(String(r.PRECDESTIN)) ?? str(r.PRECDESTIN);
      info.vetustez ??= num(r.PREVETUSTZ);
      info.ph ??= r.PREUSOPH === "S" ? "PH" : r.PREUSOPH === "N" ? "NPH" : undefined;
      info.areaTerreno ??= num(r.PREATERRE);
    }
    for (const [lot, m] of chips) {
      const info = out.get(lot);
      if (!info) continue;
      info.predios = m.size;
      info.areaConstruida = [...m.values()].reduce((a, b) => a + b, 0);
    }
    // Uso rows: pick the largest area per lot.
    const best = new Map<string, { area: number; name: string }>();
    for (const r of usos) {
      const lot = String(r.USOCLOTE);
      const area = num(r.USOAREA) ?? 0;
      const cur = best.get(lot);
      if (!cur || area > cur.area) {
        best.set(lot, { area, name: dUso.get(String(r.USOTUSO)) ?? String(r.USOTUSO) });
      }
    }
    for (const [lot, b] of best) {
      const info = out.get(lot);
      if (info) info.uso = b.name;
    }
    for (const r of estratos) {
      const info = out.get(String(r.ESOCLOTE));
      if (info && info.estrato === undefined) {
        info.estrato = dEstrato.get(String(r.ESOESTRATO)) ?? String(r.ESOESTRATO);
      }
    }
  }
  return out;
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
/** "PORCIUNCULA" → "Porciuncula". */
function title(s?: string): string | undefined {
  return s?.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
