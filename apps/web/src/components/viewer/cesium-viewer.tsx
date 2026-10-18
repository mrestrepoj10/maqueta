"use client";

import "./cesium-base-url";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Cartesian3,
  Cartographic,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Math as CesiumMath,
  CesiumTerrainProvider,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  createGooglePhotorealistic3DTileset,
  HeightReference,
  ImageryLayer,
  Ion,
  JulianDate,
  PolygonHierarchy,
  ShadowMode,
  sampleTerrainMostDetailed,
  Terrain,
  type TerrainProvider,
  UrlTemplateImageryProvider,
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
  /** "default": satellite imagery and coloured options. "maquette": white paper-model look. */
  variant?: "default" | "maquette";
};

/** Pale-yellow massing, as in a physical maquette. */
const MAQUETTE_PROPOSAL = "#f2dd6e";

type Handles = {
  viewer: Viewer;
  /** Resolves with the terrain provider once world terrain is ready. */
  terrain: Promise<TerrainProvider>;
  /** Existing-city tileset, once loaded. */
  context: Cesium3DTileset | null;
};

export function CesiumViewer({ site, activeProposals, hour, variant = "default" }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<Handles | null>(null);
  const activeRef = useRef(activeProposals);
  activeRef.current = activeProposals;

  // Create the viewer once per site.
  useEffect(() => {
    if (!containerRef.current || handlesRef.current) return;

    // Per-site terrain (a Cesium ion asset built from the city's own DTM) or World Terrain.
    const terrain =
      site.context.terrain !== undefined
        ? new Terrain(CesiumTerrainProvider.fromIonAssetId(site.context.terrain))
        : Terrain.fromWorldTerrain();
    const terrainReady = new Promise<TerrainProvider>((resolve) => {
      terrain.readyEvent.addEventListener((provider) => resolve(provider));
    });

    const maquette = variant === "maquette";
    const viewer = new Viewer(containerRef.current, {
      terrain,
      ...(maquette
        ? {
            baseLayer: new ImageryLayer(
              new UrlTemplateImageryProvider({
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
                credit: "Basemap © Esri, HERE, Garmin, OpenStreetMap contributors",
                maximumLevel: 16,
              }),
            ),
          }
        : {}),
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
    if (maquette) {
      // Paper-model look: white sky, no atmosphere or fog, soft shadows.
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
      if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
      if (viewer.scene.sun) viewer.scene.sun.show = false;
      viewer.scene.fog.enabled = false;
      viewer.scene.backgroundColor = Color.fromCssColorString("#f3f2ee");
      viewer.scene.globe.baseColor = Color.fromCssColorString("#f3f2ee");
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.highDynamicRange = false;
      viewer.shadowMap.darkness = 0.6;
      viewer.scene.light.intensity = 1.6;
      const base = viewer.imageryLayers.get(0);
      if (base) {
        base.brightness = 1.04;
        base.saturation = 0.5;
      }
    }
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
      tileset.style = new Cesium3DTileStyle({
        color: maquette ? "color('#ffffff')" : "color('#e7e5e4')",
      });
      // Cast shadows onto the ground and proposals, but skip receiving them: the flat
      // Catastro roofs show shadow acne at low sun angles.
      tileset.shadows = ShadowMode.CAST_ONLY;
      if (maquette) {
        // Uniform ambient light (only the L00 spherical-harmonic term) so walls facing away from
        // the sun read as light grey instead of black, like a card model under studio light.
        const ambient = 0.62;
        tileset.imageBasedLighting.sphericalHarmonicCoefficients = [
          new Cartesian3(ambient, ambient, ambient),
          ...Array.from({ length: 8 }, () => Cartesian3.ZERO),
        ];
      }
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
  }, [site, variant]);

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
      // Sample every footprint vertex: walls start at the lowest ground point, the roof sits
      // `height` above the highest, so the massing neither floats nor sinks on a slope.
      const points = active.flatMap((p) =>
        p.footprint.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat)),
      );
      const sampled = points.length ? await sampleTerrainMostDetailed(provider, points) : [];
      if (cancelled || viewer.isDestroyed()) return;
      viewer.entities.removeAll();
      let cursor = 0;
      for (const p of active) {
        const hs = sampled.slice(cursor, cursor + p.footprint.length).map((c) => c.height);
        cursor += p.footprint.length;
        const lo = p.baseElevation ?? (hs.length ? Math.min(...hs) : site.baseElevation);
        const hi = p.baseElevation ?? (hs.length ? Math.max(...hs) : site.baseElevation);
        viewer.entities.add({
          id: `proposal:${p.id}`,
          name: p.name,
          polygon: {
            hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(p.footprint.flat())),
            height: lo - 0.5,
            extrudedHeight: hi + p.height,
            heightReference: HeightReference.NONE,
            material: Color.fromCssColorString(
              variant === "maquette" ? MAQUETTE_PROPOSAL : (p.color ?? "#2563eb"),
            ).withAlpha(variant === "maquette" ? 1 : 0.9),
            outline: true,
            outlineColor:
              variant === "maquette"
                ? Color.fromCssColorString("#8a7a1f")
                : Color.WHITE.withAlpha(0.6),
            // Entity roofs show shadow acne under the paper lighting, so only cast there.
            shadows: variant === "maquette" ? ShadowMode.CAST_ONLY : ShadowMode.ENABLED,
          },
        });
      }
      viewer.scene.requestRender();
    })().catch((err) => console.error("proposal sync failed", err));

    return () => {
      cancelled = true;
    };
  }, [site, activeProposals, variant]);

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
