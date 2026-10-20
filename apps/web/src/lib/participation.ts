import { z } from "zod";

const Option = z.object({ id: z.string(), label: z.string(), icon: z.string().optional() });

export const Question = z.object({
  id: z.string(),
  section: z.string(),
  type: z.enum(["single", "multi", "scale", "text"]),
  prompt: z.string(),
  help: z.string().optional(),
  icon: z.string().optional(),
  options: z.array(Option).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  /** Only asked for these plots. */
  plots: z.array(z.string()).optional(),
  /** Text answers can be pinned to a point on the model. */
  pin: z.boolean().optional(),
});
export type Question = z.infer<typeof Question>;

export const Survey = z.object({
  sections: z.array(z.object({ id: z.string(), title: z.string() })),
  questions: z.array(Question),
});
export type Survey = z.infer<typeof Survey>;

const TextAnswer = z.object({
  text: z.string(),
  position: z.tuple([z.number(), z.number()]).optional(),
});
export type TextAnswer = z.infer<typeof TextAnswer>;

export const Answer = z.union([z.string(), z.array(z.string()), z.number(), TextAnswer]);
export type Answer = z.infer<typeof Answer>;

export const Response = z.object({
  id: z.string(),
  plot: z.string(),
  answers: z.record(z.string(), Answer),
  simulated: z.boolean(),
  createdAt: z.string(),
});
export type Response = z.infer<typeof Response>;

export type Participation = { survey: Survey; responses: Response[]; simulated: boolean };

export async function loadParticipation(slug: string): Promise<Participation | null> {
  try {
    const [s, r] = await Promise.all([
      import(`../../sites/${slug}.survey.json`),
      import(`../../sites/${slug}.responses.json`),
    ]);
    const data = r.default as { simulated?: boolean; responses: unknown[] };
    return {
      survey: Survey.parse(s.default),
      responses: z.array(Response).parse(data.responses),
      simulated: Boolean(data.simulated),
    };
  } catch {
    return null;
  }
}

export function questionsFor(survey: Survey, plot: string | null): Question[] {
  return survey.questions.filter((q) => !q.plots || (plot !== null && q.plots.includes(plot)));
}

export type Tally = { id: string; label: string; count: number; share: number }[];

/** Counts per option for a choice question; share is of respondents who answered it. */
export function tally(q: Question, responses: Response[]): { rows: Tally; answered: number } {
  const counts = new Map<string, number>();
  let answered = 0;
  for (const r of responses) {
    const a = r.answers[q.id];
    if (a === undefined) continue;
    answered++;
    const ids =
      q.type === "scale" ? [String(a)] : Array.isArray(a) ? a : typeof a === "string" ? [a] : [];
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const options =
    q.type === "scale"
      ? Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => {
          const v = String((q.min ?? 1) + i);
          return { id: v, label: v };
        })
      : (q.options ?? []);
  return {
    answered,
    rows: options.map((o) => {
      const count = counts.get(o.id) ?? 0;
      return { id: o.id, label: o.label, count, share: answered ? count / answered : 0 };
    }),
  };
}

export type Comment = {
  id: string;
  plot: string;
  kind: "ideas" | "preocupaciones" | string;
  text: string;
  actor?: string;
  position?: [number, number];
  simulated: boolean;
  createdAt: string;
};

export function comments(survey: Survey, responses: Response[]): Comment[] {
  const textQs = survey.questions.filter((q) => q.type === "text");
  const out: Comment[] = [];
  for (const r of responses) {
    for (const q of textQs) {
      const a = r.answers[q.id];
      if (!a || typeof a !== "object" || Array.isArray(a)) continue;
      out.push({
        id: `${r.id}:${q.id}`,
        plot: r.plot,
        kind: q.id,
        text: a.text,
        actor: typeof r.answers.relacion === "string" ? r.answers.relacion : undefined,
        position: a.position,
        simulated: r.simulated,
        createdAt: r.createdAt,
      });
    }
  }
  return out;
}

/** One row per response, one column per question, for a spreadsheet. */
export function toCsv(survey: Survey, responses: Response[]): string {
  const qs = survey.questions;
  const head = ["id", "lote", "fecha", "simulado", ...qs.map((q) => q.id)];
  const cell = (v: unknown) => {
    const s =
      v === undefined
        ? ""
        : Array.isArray(v)
          ? v.join("|")
          : typeof v === "object" && v !== null
            ? String((v as TextAnswer).text)
            : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = responses.map((r) =>
    [r.id, r.plot, r.createdAt, r.simulated, ...qs.map((q) => r.answers[q.id])].map(cell).join(","),
  );
  return [head.join(","), ...rows].join("\n");
}
