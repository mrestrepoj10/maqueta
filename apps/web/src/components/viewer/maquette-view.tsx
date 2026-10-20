"use client";

import { BarChart3 } from "lucide-react";
import dynamic from "next/dynamic";
import { Fragment, useMemo, useState } from "react";
import { type BuildingInfo, infoRows } from "@/lib/buildings";
import {
  type Answer,
  comments as commentsOf,
  type Participation,
  questionsFor,
  type Response,
} from "@/lib/participation";
import type { Proposal, Site } from "@/lib/site";
import type { LayerId } from "./cesium-viewer";
import { type Duration, questionsForDuration, ResultsPanel, SurveyPanel } from "./participation";

const CesiumViewer = dynamic(() => import("./cesium-viewer").then((m) => m.CesiumViewer), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#f3f2ee]" />,
});

const STAGES = ["propuesta", "formulación", "adoptado", "construcción"] as const;
type Stage = (typeof STAGES)[number];

const LAYER_LABELS: [LayerId, string][] = [
  ["boundary", "límite"],
  ["metro", "metro"],
  ["trees", "árboles"],
  ["parks", "parques"],
  ["water", "agua"],
  ["lots", "lotes"],
];

/**
 * PublicTwin-style layout: a paper-white model, a brand card top-left, and a stacked control
 * column on the right with pill buttons and a yellow accent. Options sites compare alternatives
 * for one lot; masterplan sites list plots with a stage filter and a plot card.
 */
export function MaquetteView({
  site,
  participation = null,
}: {
  site: Site;
  participation?: Participation | null;
}) {
  const masterplan = site.kind === "masterplan";
  const [active, setActive] = useState<string[]>(
    masterplan ? site.proposals.map((p) => p.id) : [site.proposals[0].id],
  );
  const [stage, setStage] = useState<Stage | null>(null);
  const [hour, setHour] = useState(10);
  const [selected, setSelected] = useState<BuildingInfo | null>(null);
  const [plotId, setPlotId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; at: number } | null>(null);
  // Build-out timeline: highest phase across plots; starts at the complete build-out.
  const maxPhase = useMemo(
    () => Math.max(0, ...site.proposals.flatMap((p) => (p.volumes ?? []).map((v) => v.phase ?? 0))),
    [site],
  );
  const [phase, setPhase] = useState<number>(maxPhase);
  const stages = STAGES.filter((s) => site.proposals.some((p) => p.stage === s));
  const available = useMemo(() => {
    const ids = new Set<LayerId>(["boundary"]);
    const c = site.context;
    if (c.trees) ids.add("trees");
    if (c.overlays?.parks) ids.add("parks");
    if (c.overlays?.lots) ids.add("lots");
    if (c.overlays?.water) ids.add("water");
    if (c.overlays?.metro) ids.add("metro");
    return ids;
  }, [site]);
  const [layers, setLayers] = useState<Partial<Record<LayerId, boolean>>>({});
  // Participation: survey on the right, results on the left, comments as pins.
  const [mode, setMode] = useState<"explore" | "survey" | "results">("explore");
  const [duration, setDuration] = useState<Duration>("10");
  const [mine, setMine] = useState<Response[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, [number, number]>>({});
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const responses = useMemo(
    () => [...(participation?.responses ?? []), ...mine],
    [participation, mine],
  );
  const pins = useMemo(() => {
    if (!participation) return [];
    const showAll = mode === "results";
    return commentsOf(participation.survey, responses)
      .filter((c) => c.position && (showAll || !c.simulated))
      .filter((c) => mode !== "results" || !plotId || c.plot === plotId)
      .map((c) => ({ id: c.id, position: c.position as [number, number], kind: c.kind }));
  }, [participation, responses, mode, plotId]);
  const startSurvey = (id: string, d: Duration) => {
    setPlotId(id);
    setDuration(d);
    setPicked({});
    setPicking(null);
    setMode("survey");
  };
  const submit = (answers: Record<string, Answer>) => {
    if (!plotId) return;
    setMine((m) => [
      ...m,
      {
        id: `me-${Date.now()}`,
        plot: plotId,
        answers,
        simulated: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const plot = plotId ? site.proposals.find((p) => p.id === plotId) : undefined;
  // Memoised so the viewer only redraws plots when the selection really changes.
  const shownKey = masterplan
    ? site.proposals
        .filter((p) => !stage || p.stage === stage)
        .map((p) => p.id)
        .join(",")
    : active.join(",");
  const shown = useMemo(() => (shownKey ? shownKey.split(",") : []), [shownKey]);

  const toggle = (id: string) =>
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const openPlot = (id: string) => {
    setSelected(null);
    setPlotId(id);
    setFocus({ id, at: Date.now() });
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#f3f2ee] text-neutral-900">
      <CesiumViewer
        site={site}
        activeProposals={shown}
        hour={hour}
        variant="maquette"
        onSelectBuilding={(b) => {
          setSelected(b);
          if (b) setPlotId(null);
        }}
        onSelectPlot={(id) => {
          setSelected(null);
          setPlotId(id);
        }}
        selectedPlot={masterplan ? plotId : null}
        focusPlot={focus}
        layers={layers}
        phase={maxPhase > 0 ? phase : null}
        pins={pins}
        selectedPin={selectedComment}
        onSelectPin={(id) => {
          setSelectedComment(id);
          setMode("results");
        }}
        pickPoint={picking !== null}
        onPickPoint={(p) => {
          if (picking) setPicked((x) => ({ ...x, [picking]: p }));
          setPicking(null);
        }}
      />

      {/* Brand card */}
      <div className="absolute left-4 top-4 w-64 rounded-2xl border border-black/10 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="flex items-end gap-2">
          <span className="inline-block size-6 rounded-md bg-[#ffe14d]" aria-hidden />
          <div className="leading-none">
            <p className="text-xl font-bold tracking-tight">maqueta</p>
            <p className="text-[11px] text-neutral-500">Maqueta digital</p>
          </div>
        </div>
        {participation && (
          <button
            type="button"
            onClick={() => setMode(mode === "results" ? "explore" : "results")}
            aria-pressed={mode === "results"}
            title="Resultados de la participación"
            className={`mt-3 flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
              mode === "results" ? "bg-neutral-900 text-white" : "bg-[#ffe14d]"
            }`}
          >
            <BarChart3 className="size-4" /> resultados
          </button>
        )}
        {participation?.simulated && (
          <p className="mt-2 text-[10px] font-semibold text-[#7a6600]">
            aportes simulados para la demostración
          </p>
        )}
        {masterplan && (
          <p className="mt-3 text-[11px] leading-snug text-neutral-500">
            <span className="font-semibold text-neutral-700">{site.name}</span>
            {plot ? ` › ${plot.name}` : ""}
          </p>
        )}
      </div>

      {/* Left card: a plot, or an existing building */}
      {(plot || selected || (mode === "results" && participation)) && (
        <div className="absolute left-4 top-44 max-h-[calc(100dvh-12rem)] w-72 overflow-y-auto rounded-2xl [scrollbar-width:none]">
          {mode === "results" && participation ? (
            <ResultsPanel
              survey={participation.survey}
              responses={responses}
              plot={plot ?? null}
              simulated={participation.simulated}
              onClose={() => setMode("explore")}
              selectedComment={selectedComment}
              onSelectComment={setSelectedComment}
              scopeToPlot={masterplan}
            />
          ) : plot ? (
            <PlotCard
              plot={plot}
              phase={maxPhase > 0 ? phase : null}
              onClose={() => setPlotId(null)}
              participation={participation !== null}
              onParticipate={(d) => startSurvey(plot.id, d)}
              onResults={() => setMode("results")}
              responses={responses.filter((r) => r.plot === plot.id).length}
            />
          ) : selected ? (
            <BuildingCard building={selected} onClose={() => setSelected(null)} />
          ) : null}
        </div>
      )}

      {mode === "survey" && participation && plot && (
        <SurveyPanel
          key={`${plot.id}-${duration}`}
          survey={participation.survey}
          questions={questionsForDuration(questionsFor(participation.survey, plot.id), duration)}
          plot={plot}
          picking={picking}
          pickedPoint={picked}
          onStartPick={(q) => setPicking(q)}
          onSubmit={submit}
          onClose={() => {
            setMode("explore");
            setPicking(null);
          }}
          onShowResults={() => setMode("results")}
          hour={hour}
          onHour={setHour}
          onPreviewOption={(id) => {
            if (masterplan) return;
            if (site.proposals.some((p) => p.id === id)) setActive([id]);
            else if (id === "ninguna") setActive([]);
          }}
        />
      )}

      {/* Control column */}
      <div className="absolute right-4 top-4 flex max-h-[calc(100dvh-2rem)] w-72 flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <Panel>
          <Pill tone="yellow" className="w-full justify-center font-semibold">
            {site.name}
          </Pill>
          {site.description && (
            <p className="mt-3 text-[12px] leading-snug text-neutral-600">{site.description}</p>
          )}
          {site.facts && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
              {site.facts.map(([k, v]) => (
                <Fragment key={k}>
                  <dt className="text-neutral-500">{k}</dt>
                  <dd className="text-neutral-800">{v}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          {(site.promoter || site.reference) && (
            <p className="mt-2 text-[10px] text-neutral-400">
              {[site.promoter, site.reference].filter(Boolean).join(" · ")}
            </p>
          )}
        </Panel>

        {masterplan ? (
          <>
            {maxPhase > 0 && (
              <Panel title="etapas de construcción">
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: maxPhase + 1 }, (_, n) => (
                    <Pill
                      key={n}
                      tone={phase === n ? "yellow" : "grey"}
                      className="justify-center whitespace-nowrap px-1.5 text-[11px]"
                      onClick={() => setPhase(n)}
                    >
                      {n === 0 ? "hoy" : `etapa ${n}`}
                    </Pill>
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxPhase}
                  step={1}
                  value={phase}
                  onChange={(e) => setPhase(Number(e.target.value))}
                  className="mt-2 w-full accent-[#e3c400]"
                  aria-label="Etapa de construcción"
                />
                <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                  {phase === 0
                    ? "La ciudad hoy, antes de la renovación."
                    : phase === maxPhase
                      ? "Plan completo."
                      : `Construido hasta la etapa ${phase}. La primera etapa de cada unidad aloja a quienes ya viven y trabajan allí.`}
                </p>
              </Panel>
            )}
            {stages.length > 1 && (
              <Panel title="estado">
                <div className="grid grid-cols-2 gap-1.5">
                  <Pill
                    tone={stage === null ? "yellow" : "grey"}
                    className="justify-center"
                    onClick={() => setStage(null)}
                  >
                    todas
                  </Pill>
                  {stages.map((s) => (
                    <Pill
                      key={s}
                      tone={stage === s ? "yellow" : "grey"}
                      className="justify-center"
                      onClick={() => setStage(stage === s ? null : s)}
                    >
                      {s}
                    </Pill>
                  ))}
                </div>
              </Panel>
            )}
            <Panel title="lotes">
              <div className="flex flex-col gap-1.5">
                {site.proposals
                  .filter((p) => !stage || p.stage === stage)
                  .map((p) => (
                    <Pill
                      key={p.id}
                      tone={plotId === p.id ? "yellow" : "grey"}
                      onClick={() => openPlot(p.id)}
                      title={p.summary}
                    >
                      <span className="truncate">{p.name}</span>
                    </Pill>
                  ))}
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="opciones">
            <div className="flex flex-col gap-1.5">
              <Pill tone={active.length === 0 ? "yellow" : "grey"} onClick={() => setActive([])}>
                Hoy
              </Pill>
              {site.proposals.map((p) => (
                <Pill
                  key={p.id}
                  tone={active.includes(p.id) ? "yellow" : "grey"}
                  onClick={() => toggle(p.id)}
                  title={p.summary}
                >
                  {p.name}
                </Pill>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="sol">
          <div className="flex items-center justify-between text-[12px] text-neutral-600">
            <span>hora</span>
            <span className="font-mono text-neutral-900">{String(hour).padStart(2, "0")}:00</span>
          </div>
          <input
            type="range"
            min={6}
            max={18}
            step={1}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="mt-1 w-full accent-[#e3c400]"
            aria-label="Hora del día"
          />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[8, 12, 16].map((h) => (
              <Pill key={h} tone={hour === h ? "yellow" : "grey"} onClick={() => setHour(h)}>
                {h}:00
              </Pill>
            ))}
          </div>
        </Panel>

        <Panel title="capas">
          <div className="grid grid-cols-2 gap-1.5">
            {LAYER_LABELS.filter(([id]) => available.has(id)).map(([id, label]) => {
              const on = layers[id] ?? true;
              return (
                <Pill
                  key={id}
                  tone={on ? "yellow" : "grey"}
                  onClick={() => setLayers((l) => ({ ...l, [id]: !on }))}
                  className="justify-center"
                >
                  {label}
                </Pill>
              );
            })}
          </div>
        </Panel>

        {participation ? (
          <Panel title="participación">
            <p className="text-[12px] leading-snug text-neutral-600">
              <span className="font-semibold tabular-nums text-neutral-900">
                {responses.length}
              </span>{" "}
              aportes.{" "}
              {masterplan
                ? "Elige un lote para participar o mira los resultados."
                : "Compara las opciones y cuéntanos qué piensas."}
            </p>
            {!masterplan && (
              <>
                <p className="mt-2 text-[11px] text-neutral-600">¿Cuánto tiempo tienes?</p>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {(["2", "5", "10"] as Duration[]).map((d) => (
                    <Pill
                      key={d}
                      tone="yellow"
                      className="justify-center"
                      onClick={() => startSurvey(active[0] ?? site.proposals[0].id, d)}
                    >
                      {d === "10" ? "10 min+" : `${d} min`}
                    </Pill>
                  ))}
                </div>
              </>
            )}
            <Pill
              tone="yellow"
              className="mt-2 w-full justify-center"
              onClick={() => setMode("results")}
            >
              ver resultados
            </Pill>
          </Panel>
        ) : (
          <Panel title="participación">
            <div className="flex flex-col gap-1.5">
              <Pill tone="grey" disabled>
                dejar un comentario
              </Pill>
              <Pill tone="grey" disabled>
                {masterplan ? "priorizar un lote" : "votar por una opción"}
              </Pill>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">Próximamente.</p>
          </Panel>
        )}
      </div>

      <p className="absolute bottom-2 left-4 max-w-[60%] text-[10px] text-neutral-500">
        {[site.context.buildings?.attribution, site.context.trees?.attribution, "Basemap © Esri"]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function PlotCard({
  plot,
  phase,
  onClose,
  participation = false,
  onParticipate,
  onResults,
  responses = 0,
}: {
  plot: Proposal;
  phase: number | null;
  onClose: () => void;
  participation?: boolean;
  onParticipate?: (d: Duration) => void;
  onResults?: () => void;
  responses?: number;
}) {
  const rows: [string, string | undefined][] = [
    ["barrio", plot.barrio],
    ["etapa", plot.stage],
    ["viviendas", plot.homes?.toLocaleString("es-CO")],
    ["VIS / VIP", plot.visShare !== undefined ? `${Math.round(plot.visShare * 100)} %` : undefined],
    ["usos", plot.uses],
    ["pisos", plot.floors?.toString()],
    ["manzana", plot.manzana],
  ];
  return (
    <Panel>
      <Pill tone="yellow" className="w-full justify-center font-semibold">
        <span className="truncate">{plot.name}</span>
      </Pill>
      <div
        className="mt-3 flex aspect-[4/3] items-center justify-center rounded-xl bg-[#fbf3c4] text-[11px] text-[#9c8a1c]"
        aria-label="Imagen del proyecto, próximamente"
      >
        render · próximamente
      </div>
      {plot.summary && (
        <p className="mt-3 text-[12px] leading-snug text-neutral-700">{plot.summary}</p>
      )}
      <h3 className="mt-3 text-center text-[12px] font-semibold text-neutral-700">
        <span className="text-[#c9ad00]">• </span>información
        <span className="text-[#c9ad00]"> •</span>
      </h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-neutral-500">{k}</dt>
              <dd className="text-neutral-800">{v}</dd>
            </Fragment>
          ))}
      </dl>
      {plot.phases && plot.phases.length > 0 && (
        <>
          <h3 className="mt-3 text-center text-[12px] font-semibold text-neutral-700">
            <span className="text-[#c9ad00]">• </span>etapas
            <span className="text-[#c9ad00]"> •</span>
          </h3>
          <ol className="mt-1 flex flex-col gap-1.5">
            {plot.phases.map((ph) => {
              const built = phase === null || ph.n <= phase;
              return (
                <li
                  key={ph.n}
                  className={`rounded-xl px-2.5 py-1.5 text-[11px] leading-snug ${
                    built ? "bg-[#fff3a8] text-neutral-800" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  <span className="font-semibold">{ph.label}</span>
                  {ph.summary && <span className="block">{ph.summary}</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <h3 className="mt-3 text-center text-[12px] font-semibold text-neutral-700">
        <span className="text-[#c9ad00]">• </span>participación
        <span className="text-[#c9ad00]"> •</span>
      </h3>
      <p className="text-[11px] text-neutral-600">
        módulo de participación: {participation ? "abierto" : "próximamente"}
        {participation && ` · ${responses} aportes`}
      </p>
      {participation && (
        <>
          <p className="mt-1.5 text-[11px] text-neutral-600">¿Cuánto tiempo tienes?</p>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(["2", "5", "10"] as Duration[]).map((d) => (
              <Pill
                key={d}
                tone="yellow"
                className="justify-center"
                onClick={() => onParticipate?.(d)}
              >
                {d === "10" ? "10 min+" : `${d} min`}
              </Pill>
            ))}
          </div>
          <Pill tone="grey" className="mt-1.5 w-full justify-center" onClick={onResults}>
            ver aportes de este lote
          </Pill>
        </>
      )}
      <p className="mt-2 text-[10px] text-neutral-400">
        Simulación independiente con datos públicos; no es el diseño oficial.
      </p>
      <Pill tone="grey" className="mt-3 w-full justify-center" onClick={onClose}>
        cerrar
      </Pill>
    </Panel>
  );
}

function BuildingCard({ building, onClose }: { building: BuildingInfo; onClose: () => void }) {
  return (
    <Panel>
      <Pill tone="yellow" className="w-full justify-center font-semibold">
        {building.address ?? "Edificio existente"}
      </Pill>
      <div
        className="mt-3 flex aspect-[4/3] items-center justify-center rounded-xl bg-neutral-100 text-[11px] text-neutral-400"
        aria-label="Foto del edificio, próximamente"
      >
        foto · próximamente
      </div>
      <h3 className="mt-3 text-center text-[12px] font-semibold text-neutral-700">
        <span className="text-[#c9ad00]">• </span>información
        <span className="text-[#c9ad00]"> •</span>
      </h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {infoRows(building, "es").map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-neutral-500">{k}</dt>
            <dd className="text-neutral-800">{v}</dd>
          </Fragment>
        ))}
        <dt className="text-neutral-500">código</dt>
        <dd className="truncate font-mono text-[10px] text-neutral-600" title={building.id}>
          {building.id}
        </dd>
      </dl>
      <p className="mt-2 text-[10px] text-neutral-400">IDECA · Catastro Bogotá</p>
      <Pill tone="grey" className="mt-3 w-full justify-center" onClick={onClose}>
        cerrar
      </Pill>
    </Panel>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      {title && (
        <h2 className="mb-2 text-center text-[12px] font-semibold text-neutral-700">
          <span className="text-[#c9ad00]">• </span>
          {title}
          <span className="text-[#c9ad00]"> •</span>
        </h2>
      )}
      {children}
    </section>
  );
}

function Pill({
  tone,
  className = "",
  children,
  ...rest
}: {
  tone: "yellow" | "grey";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const bg =
    tone === "yellow"
      ? "bg-[#ffe14d] text-neutral-900 hover:bg-[#f7d83a]"
      : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300/80";
  return (
    <button
      type="button"
      className={`flex h-7 min-w-0 items-center rounded-full px-3 text-[12px] transition-colors disabled:cursor-default disabled:opacity-60 ${bg} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
