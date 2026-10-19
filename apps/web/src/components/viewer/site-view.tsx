"use client";

import dynamic from "next/dynamic";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type BuildingInfo, infoRows } from "@/lib/buildings";
import type { Site } from "@/lib/site";

const CesiumViewer = dynamic(() => import("./cesium-viewer").then((m) => m.CesiumViewer), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-neutral-900" />,
});

export function SiteView({ site }: { site: Site }) {
  const [active, setActive] = useState<string[]>(
    site.kind === "masterplan" ? site.proposals.map((p) => p.id) : [site.proposals[0].id],
  );
  const [plotId, setPlotId] = useState<string | null>(null);
  const plot = plotId ? site.proposals.find((p) => p.id === plotId) : undefined;
  const [hour, setHour] = useState(10);
  const [selected, setSelected] = useState<BuildingInfo | null>(null);
  const [layers, setLayers] = useState<string[]>(["boundary", "trees", "parks", "lots"]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <CesiumViewer
        site={site}
        activeProposals={active}
        hour={hour}
        onSelectBuilding={(b) => {
          setSelected(b);
          if (b) setPlotId(null);
        }}
        onSelectPlot={(id) => {
          setSelected(null);
          setPlotId(id);
        }}
        layers={{
          boundary: layers.includes("boundary"),
          trees: layers.includes("trees"),
          parks: layers.includes("parks"),
          lots: layers.includes("lots"),
        }}
      />

      <Card className="absolute left-4 top-4 w-80 bg-background/90 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{site.name}</CardTitle>
            <Badge variant="secondary">{site.city}</Badge>
          </div>
          {site.description && <p className="text-xs text-muted-foreground">{site.description}</p>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Options
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant={active.length === 0 ? "default" : "outline"}
                onClick={() => setActive([])}
              >
                Today
              </Button>
              <ToggleGroup
                multiple
                value={active}
                onValueChange={(v) => setActive(v as string[])}
                variant="outline"
                size="sm"
              >
                {site.proposals.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id} aria-label={p.name}>
                    <span
                      className="mr-1 inline-block size-2 rounded-full"
                      style={{ background: p.color }}
                    />
                    {p.id.toUpperCase()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {active.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {site.proposals
                  .filter((p) => active.includes(p.id))
                  .map((p) => (
                    <li key={p.id}>
                      <span className="font-medium text-foreground">{p.name}</span>
                      {p.summary ? ` · ${p.summary}` : ""}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <Separator />
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Layers
            </p>
            <ToggleGroup
              multiple
              value={layers}
              onValueChange={(v) => setLayers(v as string[])}
              variant="outline"
              size="sm"
              className="flex-wrap"
            >
              <ToggleGroupItem value="boundary">Boundary</ToggleGroupItem>
              <ToggleGroupItem value="trees">Trees</ToggleGroupItem>
              <ToggleGroupItem value="parks">Parks</ToggleGroupItem>
              <ToggleGroupItem value="lots">Lots</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Separator />
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sun
              </p>
              <span className="font-mono text-xs">{String(hour).padStart(2, "0")}:00</span>
            </div>
            <input
              type="range"
              min={6}
              max={18}
              step={1}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="w-full accent-foreground"
            />
            <div className="flex gap-1">
              {[8, 12, 16].map((h) => (
                <Button key={h} size="sm" variant="outline" onClick={() => setHour(h)}>
                  {h}:00
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {plot && (
        <Card className="absolute bottom-16 left-4 w-72 bg-background/90 backdrop-blur">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">{plot.name}</CardTitle>
            {plot.summary && <p className="text-xs text-muted-foreground">{plot.summary}</p>}
          </CardHeader>
          <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {(
              [
                ["Barrio", plot.barrio],
                ["Stage", plot.stage],
                ["Homes", plot.homes?.toLocaleString("en")],
                [
                  "Social housing",
                  plot.visShare !== undefined ? `${Math.round(plot.visShare * 100)}%` : undefined,
                ],
                ["Uses", plot.uses],
                ["Floors", plot.floors?.toString()],
              ] as [string, string | undefined][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <Fragment key={k}>
                  <span className="text-muted-foreground">{k}</span>
                  <span>{v}</span>
                </Fragment>
              ))}
          </CardContent>
        </Card>
      )}

      {selected && !plot && (
        <Card className="absolute bottom-16 left-4 w-72 bg-background/90 backdrop-blur">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">{selected.address ?? "Existing building"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {infoRows(selected, "en").map(([k, v]) => (
              <Fragment key={k}>
                <span className="text-muted-foreground">{k}</span>
                <span>{v}</span>
              </Fragment>
            ))}
            <span className="text-muted-foreground">Code</span>
            <span className="truncate font-mono text-[10px]" title={selected.id}>
              {selected.id}
            </span>
          </CardContent>
        </Card>
      )}

      {site.context.buildings?.attribution && (
        <p className="absolute bottom-2 left-4 text-[10px] text-white/70 drop-shadow">
          {site.context.buildings.attribution}
          {site.context.trees?.attribution ? ` · ${site.context.trees.attribution}` : ""}
        </p>
      )}
    </div>
  );
}
