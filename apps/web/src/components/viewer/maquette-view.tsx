"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Site } from "@/lib/site";

const CesiumViewer = dynamic(() => import("./cesium-viewer").then((m) => m.CesiumViewer), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#f3f2ee]" />,
});

/**
 * PublicTwin-style layout: a paper-white model, a brand card top-left, and a stacked control
 * column on the right with pill buttons and a yellow accent.
 */
export function MaquetteView({ site }: { site: Site }) {
  const [active, setActive] = useState<string[]>([site.proposals[0].id]);
  const [hour, setHour] = useState(10);

  const toggle = (id: string) =>
    setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#f3f2ee] text-neutral-900">
      <CesiumViewer site={site} activeProposals={active} hour={hour} variant="maquette" />

      {/* Brand card */}
      <div className="absolute left-4 top-4 w-56 rounded-2xl border border-black/10 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="flex items-end gap-2">
          <span className="inline-block size-6 rounded-md bg-[#ffe14d]" aria-hidden />
          <div className="leading-none">
            <p className="text-xl font-bold tracking-tight">maqueta</p>
            <p className="text-[11px] text-neutral-500">Maqueta digital</p>
          </div>
        </div>
      </div>

      {/* Control column */}
      <div className="absolute right-4 top-4 flex max-h-[calc(100dvh-2rem)] w-72 flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
        <Panel>
          <Pill tone="yellow" className="w-full justify-center font-semibold">
            {site.name}
          </Pill>
          {site.description && (
            <p className="mt-3 text-[12px] leading-snug text-neutral-600">{site.description}</p>
          )}
        </Panel>

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
          />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[8, 12, 16].map((h) => (
              <Pill key={h} tone={hour === h ? "yellow" : "grey"} onClick={() => setHour(h)}>
                {h}:00
              </Pill>
            ))}
          </div>
        </Panel>

        <Panel title="participación">
          <div className="flex flex-col gap-1.5">
            <Pill tone="grey" disabled>
              dejar un comentario
            </Pill>
            <Pill tone="grey" disabled>
              votar por una opción
            </Pill>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">Próximamente.</p>
        </Panel>
      </div>

      {site.context.buildings?.attribution && (
        <p className="absolute bottom-2 left-4 text-[10px] text-neutral-500">
          {site.context.buildings.attribution} · Basemap © Esri
        </p>
      )}
    </div>
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
      className={`flex h-7 items-center rounded-full px-3 text-[12px] transition-colors disabled:cursor-default disabled:opacity-60 ${bg} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
