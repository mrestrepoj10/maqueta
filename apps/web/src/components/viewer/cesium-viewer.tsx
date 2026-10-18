"use client";

import "./cesium-base-url";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Cartesian3,
  Cartographic,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Math as CesiumMath,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  createGooglePhotorealistic3DTileset,
  HeightReference,
  Ion,
  JulianDate,
  PolygonHierarchy,
  ShadowMode,
  sampleTerrainMostDetailed,
  Terrain,
  type TerrainProvider,
  Viewer,
} from "cesium";
import { useEffect, useRef } from "react";
import type { Proposal, Site } from "@/lib/site";

Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

export type ViewerProps = {
  site: Site;
  /** Proposal ids currently shown. Empty array shows the site as it is today. */
  activeProposals: string[];
  /** Hours since midnight, local solar time, for the sun position. */
  hour: number;
};

type Handles = {
  viewer: Viewer;
  /** Resolves with the terrain provider once world terrain is ready. */
  terrain: Promise<TerrainProvider>;
  /** Existing-city tileset, once loaded. */
  context: Cesium3DTileset | null;
};

export function CesiumViewer({ site, activeProposals, hour }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<Handles | null>(null);
  const activeRef = useRef(activeProposals);
  activeRef.current = activeProposals;

  // Create the viewer once per site.
  useEffect(() => {
    if (!containerRef.current || handlesRef.current) return;

    const terrain = Terrain.fromWorldTerrain();
    const terrainReady = new Promise<TerrainProvider>((resolve) => {
      terrain.readyEvent.addEventListener((provider) => resolve(provider));
    });

    const viewer = new Viewer(containerRef.current, {
      terrain,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: false,
      shadows: true,
    });
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.shadowMap.softShadows = true;
    viewer.scene.renderError.addEventListener((_scene, error) => {
      console.error("cesium render error", error);
    });

    const handles: Handles = { viewer, terrain: terrainReady, context: null };
    handlesRef.current = handles;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __maqueta?: unknown }).__maqueta = {
        viewer,
        clippingSupported: ClippingPolygonCollection.isSupported(viewer.scene),
      };
    }

    const { position, heading, pitch } = site.home;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(position[0], position[1], position[2]),
      orientation: {
        heading: CesiumMath.toRadians(heading),
        pitch: CesiumMath.toRadians(pitch),
      },
    });

    let cancelled = false;
    (async () => {
      if (site.context.google3d) {
        try {
          const google = await createGooglePhotorealistic3DTileset();
          if (!cancelled) {
            viewer.scene.primitives.add(google);
            viewer.scene.globe.show = false;
          }
        } catch (err) {
          console.warn("Google 3D Tiles unavailable, falling back", err);
        }
      }
      const catastro = site.context.catastro;
      if (!catastro) return;
      const tileset =
        typeof catastro.tileset === "number"
          ? await Cesium3DTileset.fromIonAssetId(catastro.tileset)
          : await Cesium3DTileset.fromUrl(catastro.tileset);
      if (cancelled) return;
      tileset.style = new Cesium3DTileStyle({ color: "color('#e7e5e4')" });
      // Cast shadows onto the ground and proposals, but skip receiving them: the flat
      // Catastro roofs show shadow acne at low sun angles.
      tileset.shadows = ShadowMode.CAST_ONLY;
      viewer.scene.primitives.add(tileset);
      handles.context = tileset;
      applyClipping(tileset, site.proposals, activeRef.current);
      viewer.scene.requestRender();
    })();

    return () => {
      cancelled = true;
      viewer.destroy();
      handlesRef.current = null;
    };
  }, [site]);

  // Sync proposals: extrude the active ones and cut their footprints out of the existing city.
  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles) return;
    const { viewer } = handles;
    const active = site.proposals.filter((p) => activeProposals.includes(p.id));
    if (handles.context) applyClipping(handles.context, site.proposals, activeProposals);

    let cancelled = false;
    (async () => {
      const provider = await handles.terrain;
      const centroids = active.map((p) => Cartographic.fromDegrees(...centroid(p.footprint)));
      const sampled = centroids.length ? await sampleTerrainMostDetailed(provider, centroids) : [];
      if (cancelled || viewer.isDestroyed()) return;
      viewer.entities.removeAll();
      active.forEach((p, i) => {
        const base = p.baseElevation ?? sampled[i]?.height ?? site.baseElevation;
        viewer.entities.add({
          id: `proposal:${p.id}`,
          name: p.name,
          polygon: {
            hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(p.footprint.flat())),
            height: base,
            extrudedHeight: base + p.height,
            heightReference: HeightReference.NONE,
            material: Color.fromCssColorString(p.color ?? "#2563eb").withAlpha(0.9),
            outline: true,
            outlineColor: Color.WHITE.withAlpha(0.6),
            shadows: ShadowMode.ENABLED,
          },
        });
      });
      viewer.scene.requestRender();
    })().catch((err) => console.error("proposal sync failed", err));

    return () => {
      cancelled = true;
    };
  }, [site, activeProposals]);

  // Sun position from the hour slider. Bogotá is UTC-5; the date is the March equinox.
  useEffect(() => {
    const viewer = handlesRef.current?.viewer;
    if (!viewer) return;
    viewer.clock.currentTime = JulianDate.fromDate(new Date(Date.UTC(2026, 2, 21, hour + 5)));
    viewer.clock.shouldAnimate = false;
    viewer.scene.requestRender();
  }, [hour]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

/** Remove existing buildings inside the active proposals' footprints. */
function applyClipping(tileset: Cesium3DTileset, proposals: Proposal[], activeIds: string[]) {
  const polygons = proposals
    .filter((p) => activeIds.includes(p.id))
    .map(
      (p) => new ClippingPolygon({ positions: Cartesian3.fromDegreesArray(p.footprint.flat()) }),
    );
  tileset.clippingPolygons = new ClippingPolygonCollection({ polygons });
}

function centroid(ring: [number, number][]): [number, number] {
  const n = ring.length;
  return [ring.reduce((a, [x]) => a + x, 0) / n, ring.reduce((a, [, y]) => a + y, 0) / n];
}
