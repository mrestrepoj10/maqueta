"use client";

import "./cesium-base-url";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Cartesian3,
  Cartographic,
  Cesium3DTileFeature,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Math as CesiumMath,
  CesiumTerrainProvider,
  ClassificationType,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  ColorGeometryInstanceAttribute,
  CornerType,
  CorridorGeometry,
  createGooglePhotorealistic3DTileset,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  GroundPrimitive,
  HeightReference,
  ImageryLayer,
  Ion,
  JulianDate,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ShadowMode,
  sampleTerrainMostDetailed,
  Terrain,
  type TerrainProvider,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";
import { useEffect, useRef } from "react";
import { type BuildingInfo, readBuildingInfo } from "@/lib/buildings";
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
  /** Called when the viewer clicks an existing building, or empty space (null). */
  onSelectBuilding?: (info: BuildingInfo | null) => void;
  /** Which context layers are visible. Missing keys are visible. */
  layers?: Partial<Record<LayerId, boolean>>;
};

export type LayerId = "trees" | "parks" | "lots" | "boundary";

/** Pale-yellow massing, as in a physical maquette. */
const MAQUETTE_PROPOSAL = "#f5e38a";

type Handles = {
  viewer: Viewer;
  /** Resolves with the terrain provider once world terrain is ready. */
  terrain: Promise<TerrainProvider>;
  /** Existing-city tileset, once loaded. */
  context: Cesium3DTileset | null;
  pickHandler?: ScreenSpaceEventHandler;
  /** Loaded context layers, keyed by id, for toggling. */
  layers: Partial<Record<LayerId, { show: boolean }>>;
};

export function CesiumViewer({
  site,
  activeProposals,
  hour,
  variant = "default",
  onSelectBuilding,
  layers,
}: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<Handles | null>(null);
  const activeRef = useRef(activeProposals);
  activeRef.current = activeProposals;
  const onSelectRef = useRef(onSelectBuilding);
  onSelectRef.current = onSelectBuilding;
  const layersRef = useRef(layers);
  layersRef.current = layers;

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
    viewer.shadowMap.size = 4096;
    viewer.shadowMap.maximumDistance = 3000;
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

    const handles: Handles = { viewer, terrain: terrainReady, context: null, layers: {} };
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
    loadContextLayers(viewer, site, maquette, handles, () => cancelled, layersRef).catch((err) =>
      console.error("context layers failed", err),
    );
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
      const buildings = site.context.buildings;
      if (!buildings) return;
      const tileset =
        typeof buildings.tileset === "number"
          ? await Cesium3DTileset.fromIonAssetId(buildings.tileset)
          : await Cesium3DTileset.fromUrl(buildings.tileset);
      if (cancelled) return;
      tileset.style = new Cesium3DTileStyle({
        color: maquette ? "color('#ffffff')" : "color('#e7e5e4')",
      });
      // Cast shadows onto the ground and proposals, but skip receiving them: flat roofs show
      // shadow acne at low sun angles.
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

      // Click to select a building: highlight it and report its metadata properties.
      const highlight = Color.fromCssColorString(maquette ? "#ffb547" : "#60a5fa");
      let selected: Cesium3DTileFeature | null = null;
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handles.pickHandler = handler;
      handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(e.position);
        if (selected && !selected.tileset.isDestroyed()) {
          selected.color = Color.WHITE;
        }
        selected = null;
        if (picked instanceof Cesium3DTileFeature && picked.tileset === tileset) {
          selected = picked;
          picked.color = highlight;
          onSelectRef.current?.(
            readBuildingInfo(picked.featureId, (name) => picked.getProperty(name)),
          );
        } else {
          onSelectRef.current?.(null);
        }
        viewer.scene.requestRender();
      }, ScreenSpaceEventType.LEFT_CLICK);
    })();

    return () => {
      cancelled = true;
      handles.pickHandler?.destroy();
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
        const fill = Color.fromCssColorString(
          variant === "maquette" ? MAQUETTE_PROPOSAL : (p.color ?? "#2563eb"),
        );
        const edge = variant === "maquette" ? Color.fromCssColorString("#9c8a1c") : Color.WHITE;
        const ring = [...p.footprint, p.footprint[0]].flat();
        viewer.entities.add({
          id: `proposal:${p.id}`,
          name: p.name,
          polygon: {
            hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(p.footprint.flat())),
            height: lo - 0.5,
            extrudedHeight: hi + p.height,
            heightReference: HeightReference.NONE,
            material: fill.withAlpha(variant === "maquette" ? 1 : 0.92),
            outline: true,
            outlineColor: edge.withAlpha(0.9),
            // Receiving shadows on the flat roof produces acne at most sun angles; cast only.
            shadows: ShadowMode.CAST_ONLY,
          },
        });
        // Roof edge, drawn as a line so it reads at any zoom.
        viewer.entities.add({
          id: `proposal-edge:${p.id}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights(
              ring.flatMap((v, i) => (i % 2 === 1 ? [v, hi + p.height] : [v])),
            ),
            width: 1.5,
            material: edge.withAlpha(0.9),
          },
        });
        // Lot boundary just above the ground, dashed, as a physical model would mark the plot.
        // Not clamped: clamped lines also drape onto neighbouring 3D Tiles walls.
        const ringHeights = [...hs, hs[0]].map((h) => (h ?? lo) + 0.4);
        viewer.entities.add({
          id: `proposal-lot:${p.id}`,
          polyline: {
            positions: Cartesian3.fromDegreesArrayHeights(
              ring.flatMap((v, i) => (i % 2 === 1 ? [v, ringHeights[(i - 1) / 2]] : [v])),
            ),
            width: 4,
            material: new PolylineDashMaterialProperty({
              color: variant === "maquette" ? Color.fromCssColorString("#e3c400") : fill,
              dashLength: 12,
            }),
          },
        });
      }
      viewer.scene.requestRender();
    })().catch((err) => console.error("proposal sync failed", err));

    return () => {
      cancelled = true;
    };
  }, [site, activeProposals, variant]);

  // Context layer visibility.
  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles) return;
    for (const [id, layer] of Object.entries(handles.layers)) {
      if (layer) layer.show = layers?.[id as LayerId] ?? true;
    }
    handles.viewer.scene.requestRender();
  }, [layers]);

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

/**
 * Trees (3D Tiles), parks and lot lines (ground overlays) and the project boundary band. Each
 * layer registers in `handles.layers` as soon as it loads, with the current visibility applied.
 */
async function loadContextLayers(
  viewer: Viewer,
  site: Site,
  maquette: boolean,
  handles: Handles,
  isCancelled: () => boolean,
  layersRef: { current: Partial<Record<LayerId, boolean>> | undefined },
) {
  const register = (id: LayerId, layer: { show: boolean }) => {
    layer.show = layersRef.current?.[id] ?? true;
    handles.layers[id] = layer;
    viewer.scene.requestRender();
  };
  const tasks: Promise<void>[] = [];
  const trees = site.context.trees;
  if (trees) {
    tasks.push(
      (async () => {
        const tileset = await Cesium3DTileset.fromUrl(trees.tileset);
        if (isCancelled() || viewer.isDestroyed()) return;
        tileset.shadows = ShadowMode.CAST_ONLY;
        if (maquette) {
          // Same soft studio light as the buildings, so crowns read sage instead of dark green.
          const ambient = 0.7;
          tileset.imageBasedLighting.sphericalHarmonicCoefficients = [
            new Cartesian3(ambient, ambient, ambient),
            ...Array.from({ length: 8 }, () => Cartesian3.ZERO),
          ];
        }
        viewer.scene.primitives.add(tileset);
        register("trees", tileset);
      })(),
    );
  }
  const overlays = site.context.overlays ?? {};
  const fetchJson = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return (await res.json()) as GeoJsonFc;
  };
  if (overlays.parks) {
    const url = overlays.parks;
    tasks.push(
      (async () => {
        const fc = await fetchJson(url);
        if (isCancelled() || viewer.isDestroyed()) return;
        const color = Color.fromCssColorString(maquette ? "#d3e6c9" : "#7fbf6a").withAlpha(
          maquette ? 1 : 0.45,
        );
        const instances = outerRings(fc).map(
          (ring) =>
            new GeometryInstance({
              geometry: new PolygonGeometry({
                polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flat())),
              }),
              attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
            }),
        );
        if (instances.length === 0) return;
        const prim = new GroundPrimitive({
          geometryInstances: instances,
          classificationType: ClassificationType.TERRAIN,
          appearance: new PerInstanceColorAppearance({ flat: true, translucent: !maquette }),
        });
        viewer.scene.primitives.add(prim);
        register("parks", prim);
      })(),
    );
  }
  if (overlays.lots) {
    const url = overlays.lots;
    tasks.push(
      (async () => {
        const fc = await fetchJson(url);
        if (isCancelled() || viewer.isDestroyed()) return;
        const color = Color.fromCssColorString(maquette ? "#b9b4a6" : "#ffffff").withAlpha(
          maquette ? 0.9 : 0.5,
        );
        const instances = outerRings(fc).map(
          (ring) =>
            new GeometryInstance({
              geometry: new GroundPolylineGeometry({
                positions: Cartesian3.fromDegreesArray([...ring, ring[0]].flat()),
                width: 1.5,
              }),
              attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
            }),
        );
        if (instances.length === 0) return;
        const prim = new GroundPolylinePrimitive({
          geometryInstances: instances,
          classificationType: ClassificationType.TERRAIN,
          appearance: new PolylineColorAppearance(),
        });
        viewer.scene.primitives.add(prim);
        register("lots", prim);
      })(),
    );
  }
  if (overlays.boundary) {
    const url = overlays.boundary;
    tasks.push(
      (async () => {
        const fc = await fetchJson(url);
        if (isCancelled() || viewer.isDestroyed()) return;
        // PublicTwin-style project outline: a wide, flat yellow band on the ground.
        const instances = outerRings(fc).map(
          (ring) =>
            new GeometryInstance({
              geometry: new CorridorGeometry({
                positions: Cartesian3.fromDegreesArray([...ring, ring[0]].flat()),
                width: 6,
                cornerType: CornerType.MITERED,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(
                  Color.fromCssColorString("#ffd60a"),
                ),
              },
            }),
        );
        if (instances.length === 0) return;
        const prim = new GroundPrimitive({
          geometryInstances: instances,
          classificationType: ClassificationType.TERRAIN,
          appearance: new PerInstanceColorAppearance({ flat: true, translucent: false }),
        });
        viewer.scene.primitives.add(prim);
        register("boundary", prim);
      })(),
    );
  }
  await Promise.all(tasks);
}

type GeoJsonFc = {
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } | null }[];
};

/** Outer rings of every (multi)polygon, closing vertex removed. */
function outerRings(fc: GeoJsonFc): [number, number][][] {
  const rings: [number, number][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys =
      g.type === "MultiPolygon"
        ? (g.coordinates as number[][][][])
        : [g.coordinates as number[][][]];
    for (const poly of polys) {
      const ring = poly[0].map(([x, y]) => [x, y] as [number, number]);
      const [a, b] = [ring[0], ring[ring.length - 1]];
      if (ring.length > 1 && a[0] === b[0] && a[1] === b[1]) ring.pop();
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
}
