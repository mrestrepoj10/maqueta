"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Site } from "@/lib/site";

const CesiumViewer = dynamic(() => import("./cesium-viewer").then((m) => m.CesiumViewer), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-neutral-900" />,
});

export function SiteView({ site }: { site: Site }) {
  const [active, setActive] = useState<string[]>([site.proposals[0].id]);
  const [hour, setHour] = useState(10);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <CesiumViewer site={site} activeProposals={active} hour={hour} />

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

      {site.context.buildings?.attribution && (
        <p className="absolute bottom-2 left-4 text-[10px] text-white/70 drop-shadow">
          {site.context.buildings.attribution}
        </p>
      )}
    </div>
  );
}
