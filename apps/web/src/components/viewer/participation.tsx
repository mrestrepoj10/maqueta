"use client";

import {
  Apple,
  Baby,
  BrickWall,
  Building2,
  CalendarX,
  Carrot,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CircleX,
  Coffee,
  Download,
  Drama,
  Dumbbell,
  Factory,
  Footprints,
  HeartPulse,
  House,
  KeyRound,
  Leaf,
  Lightbulb,
  type LucideIcon,
  MapPin,
  Palette,
  Pencil,
  Store,
  Sun,
  ToyBrick,
  Trees,
  TriangleAlert,
  Users,
  Waves,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  type Answer,
  comments as allComments,
  type Comment,
  type Question,
  type Response,
  type Survey,
  tally,
  toCsv,
} from "@/lib/participation";
import type { Proposal } from "@/lib/site";

const ICONS: Record<string, LucideIcon> = {
  Apple,
  Baby,
  BrickWall,
  Building2,
  CalendarX,
  Carrot,
  CircleCheck,
  CircleHelp,
  CircleX,
  Coffee,
  Drama,
  Dumbbell,
  Factory,
  Footprints,
  HeartPulse,
  House,
  KeyRound,
  Leaf,
  Lightbulb,
  MapPin,
  Palette,
  Pencil,
  Store,
  Sun,
  ToyBrick,
  Trees,
  TriangleAlert,
  Users,
  Waves,
};
const Icon = ({ name, className }: { name?: string; className?: string }) => {
  const C = (name && ICONS[name]) || CircleHelp;
  return <C className={className} strokeWidth={1.75} aria-hidden />;
};

const LETTERS = "ABCDEFGH";
const ACTORS: Record<string, string> = {
  propietario: "propietario",
  arrendatario: "arrendatario",
  comerciante: "comerciante",
  estudiante: "estudiante",
  visitante: "visitante",
};

export type Duration = "2" | "5" | "10";

/** Which questions fit a time budget: 2 min = profile and the first decisions, 5 = every
 * choice, 10+ = everything including open questions. */
export function questionsForDuration(qs: Question[], d: Duration): Question[] {
  if (d === "10") return qs;
  const choices = qs.filter((q) => q.type !== "text");
  if (d === "5") return choices;
  const s1 = choices.filter((q) => q.section === "s1");
  const s2 = choices.filter((q) => q.section !== "s1").slice(0, 2);
  return [...s1, ...s2];
}

/** PublicTwin-style survey: one question per screen in a yellow panel docked on the right. */
export function SurveyPanel({
  survey,
  questions,
  plot,
  picking,
  pickedPoint,
  onStartPick,
  onSubmit,
  onClose,
  onShowResults,
  hour,
  onHour,
}: {
  hour?: number;
  onHour?: (h: number) => void;
  survey: Survey;
  questions: Question[];
  plot: Proposal;
  picking: string | null;
  pickedPoint: Record<string, [number, number]>;
  onStartPick: (questionId: string) => void;
  onSubmit: (answers: Record<string, Answer>) => void;
  onClose: () => void;
  onShowResults: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [done, setDone] = useState(false);
  const q = questions[step];
  const sectionIndex = q ? survey.sections.findIndex((s) => s.id === q.section) : -1;
  const section = sectionIndex >= 0 ? survey.sections[sectionIndex] : undefined;
  const value = q ? answers[q.id] : undefined;

  const valid = (() => {
    if (!q) return false;
    if (q.type === "text") return true; // optional
    if (q.type === "multi") {
      const n = Array.isArray(value) ? value.length : 0;
      return n >= (q.min ?? 1) && n <= (q.max ?? 99);
    }
    return value !== undefined;
  })();

  const next = () => {
    if (step < questions.length - 1) setStep(step + 1);
    else {
      const withPins: Record<string, Answer> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === "string" && questions.find((x) => x.id === k)?.type === "text") {
          if (!v.trim()) continue;
          withPins[k] = { text: v.trim(), position: pickedPoint[k] };
        } else withPins[k] = v;
      }
      onSubmit(withPins);
      setDone(true);
    }
  };

  const toggle = (id: string) => {
    if (!q) return;
    if (q.type === "multi") {
      const cur = Array.isArray(value) ? value : [];
      const has = cur.includes(id);
      const max = q.max ?? 99;
      const nextVal = has ? cur.filter((x) => x !== id) : cur.length < max ? [...cur, id] : cur;
      setAnswers({ ...answers, [q.id]: nextVal });
    } else setAnswers({ ...answers, [q.id]: id });
  };

  return (
    <aside
      className="absolute bottom-4 right-4 top-4 z-20 flex w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-black/15 bg-[#ffd84a] text-neutral-900 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
      aria-label="Encuesta de participación"
    >
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 text-[13px] font-semibold">
        <span>
          {done ? "✓" : `${sectionIndex + 1} →`} {done ? "Gracias" : section?.title}
          <span className="ml-2 font-normal text-neutral-700">· {plot.name}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar encuesta"
          className="rounded-full p-1 hover:bg-black/10"
        >
          <X className="size-4" />
        </button>
      </header>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <CircleCheck className="size-14" strokeWidth={1.5} />
          <p className="text-lg font-semibold">Tu aporte quedó en el modelo.</p>
          <p className="text-[13px] text-neutral-800">
            El equipo del proyecto lo ve junto con los demás, contado por lote y por tema. Los
            comentarios marcados aparecen como puntos sobre el modelo.
          </p>
          <button
            type="button"
            onClick={onShowResults}
            className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Ver resultados
          </button>
        </div>
      ) : q ? (
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Icon name={q.icon} className="size-12" />
            <p className="text-[15px] font-semibold leading-snug">
              <span className="mr-2 text-[12px] text-neutral-700">{step + 1}.</span>
              {q.prompt}
            </p>
            {q.help && <p className="-mt-2 text-[12px] text-neutral-800">{q.help}</p>}

            {(q.type === "single" || q.type === "multi") && (
              <div
                className={`grid gap-2 ${q.options && q.options.length > 4 ? "grid-cols-3" : "grid-cols-2"}`}
              >
                {q.options?.map((o, i) => {
                  const on = Array.isArray(value) ? value.includes(o.id) : value === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.id)}
                      aria-pressed={on}
                      className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-[11.5px] leading-tight transition-colors ${
                        on
                          ? "border-neutral-900 bg-white shadow-[inset_0_0_0_2px_#1f1d18]"
                          : "border-black/20 bg-[#ffe680] hover:bg-[#fff0a8]"
                      }`}
                    >
                      <Icon name={o.icon} className="size-6" />
                      <span>
                        <span className="mr-1 inline-grid size-4 place-items-center rounded-sm border border-black/30 text-[9px] font-bold">
                          {LETTERS[i]}
                        </span>
                        {o.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "scale" && (
              <div>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from(
                    { length: (q.max ?? 5) - (q.min ?? 1) + 1 },
                    (_, i) => (q.min ?? 1) + i,
                  ).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: v })}
                      aria-pressed={value === v}
                      className={`h-11 rounded-lg border text-[15px] font-semibold ${
                        value === v
                          ? "border-neutral-900 bg-white shadow-[inset_0_0_0_2px_#1f1d18]"
                          : "border-black/20 bg-[#ffe680]"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-neutral-700">
                  <span>{q.minLabel}</span>
                  <span>{q.maxLabel}</span>
                </div>
                {q.icon === "Sun" && onHour && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                    <Sun className="size-4" />
                    <span className="mr-1">ver la sombra a las</span>
                    {[8, 12, 16].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => onHour(h)}
                        aria-pressed={hour === h}
                        className={`rounded-full px-2.5 py-1 ${hour === h ? "bg-neutral-900 text-white" : "bg-[#ffe680]"}`}
                      >
                        {h}:00
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {q.type === "text" && (
              <div className="flex flex-col gap-2">
                <textarea
                  id={`q-${q.id}`}
                  rows={4}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Escribe aquí (opcional)"
                  className="w-full resize-none border-b-2 border-neutral-900 bg-transparent text-[17px] leading-snug outline-none placeholder:text-neutral-700/60"
                />
                {q.pin && (
                  <button
                    type="button"
                    onClick={() => onStartPick(q.id)}
                    className={`flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-[12px] ${
                      picking === q.id
                        ? "border-neutral-900 bg-white"
                        : "border-black/25 bg-[#ffe680]"
                    }`}
                  >
                    <MapPin className="size-4" />
                    {pickedPoint[q.id]
                      ? "Punto marcado en el modelo ✓"
                      : picking === q.id
                        ? "Haz clic en el modelo…"
                        : "Marcar un punto en el modelo"}
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={next}
                disabled={!valid}
                className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
              >
                {step === questions.length - 1 ? "Enviar" : "OK"}
              </button>
              <span className="text-[11px] text-neutral-700">
                {step + 1} de {questions.length}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              aria-label="Pregunta anterior"
              className="rounded-md bg-neutral-900 p-1.5 text-white"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => valid && next()}
              aria-label="Pregunta siguiente"
              className="rounded-md bg-neutral-900 p-1.5 text-white"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

/** Results like PublicTwin's left panel: one bar chart per question, then the comments. */
export function ResultsPanel({
  survey,
  responses,
  plot,
  simulated,
  onClose,
  selectedComment,
  onSelectComment,
}: {
  survey: Survey;
  responses: Response[];
  plot: Proposal | null;
  simulated: boolean;
  onClose: () => void;
  selectedComment: string | null;
  onSelectComment: (id: string) => void;
}) {
  const [actor, setActor] = useState<string>("todos");
  const scoped = useMemo(
    () =>
      responses.filter(
        (r) => (!plot || r.plot === plot.id) && (actor === "todos" || r.answers.relacion === actor),
      ),
    [responses, plot, actor],
  );
  const cs = useMemo(() => allComments(survey, scoped), [survey, scoped]);
  const choiceQs = survey.questions.filter(
    (q) => q.type !== "text" && (!q.plots || !plot || q.plots.includes(plot.id)),
  );

  const exportCsv = () => {
    const blob = new Blob([toCsv(survey, scoped)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aportes-${plot?.id ?? "plan"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">
          <span className="text-[#c9ad00]">• </span>resultados
          <span className="text-[#c9ad00]"> •</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar resultados"
          className="rounded-full p-1 hover:bg-neutral-100"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[12px] text-neutral-600">
        <span className="font-semibold text-neutral-900 tabular-nums">{scoped.length}</span> aportes
        {plot ? ` en ${plot.name}` : " en todo el plan"}
        {simulated && (
          <span className="ml-1 rounded-full bg-[#fff3a8] px-1.5 text-[10px] text-[#7a6600]">
            simulados
          </span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {["todos", ...Object.keys(ACTORS)].map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setActor(a)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${actor === a ? "bg-[#ffe14d]" : "bg-neutral-100 text-neutral-600"}`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {choiceQs.map((q) => {
          const { rows, answered } = tally(q, scoped);
          const top = Math.max(...rows.map((r) => r.share), 0.0001);
          return (
            <div key={q.id}>
              <p className="text-[11.5px] font-semibold leading-snug text-neutral-800">
                {q.prompt}
              </p>
              <p className="text-[10px] text-neutral-500">{answered} respuestas</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.4rem] items-center gap-2 text-[11px]"
                  >
                    <span className="truncate text-neutral-700" title={r.label}>
                      {r.label}
                    </span>
                    <span className="h-3 rounded-sm bg-neutral-100">
                      <span
                        className={`block h-3 rounded-sm ${r.share === top ? "bg-[#f2c800]" : "bg-[#ffe680]"}`}
                        style={{ width: `${(r.share / top) * 100}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-neutral-700">
                      {Math.round(r.share * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <div>
          <p className="text-[11.5px] font-semibold text-neutral-800">
            Comentarios en el modelo ({cs.length})
          </p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {cs.map((c: Comment) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectComment(c.id)}
                  className={`w-full rounded-xl px-2.5 py-1.5 text-left text-[11px] leading-snug ${
                    selectedComment === c.id
                      ? "bg-[#ffe14d]"
                      : c.kind === "preocupaciones"
                        ? "bg-[#fde7d2]"
                        : "bg-[#fff6c2]"
                  }`}
                >
                  <span className="flex items-center gap-1 font-semibold">
                    {c.kind === "preocupaciones" ? (
                      <TriangleAlert className="size-3" />
                    ) : (
                      <Lightbulb className="size-3" />
                    )}
                    {c.actor ?? "anónimo"}
                  </span>
                  {c.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <button
        type="button"
        onClick={exportCsv}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-200/80 py-1.5 text-[12px] hover:bg-neutral-300/80"
      >
        <Download className="size-3.5" /> exportar CSV
      </button>
    </section>
  );
}
