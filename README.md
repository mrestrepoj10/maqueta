# maqueta

Public consultation sites for infrastructure projects. Real city context, design options side by side, in the browser.

A *maqueta* is the physical model shown at every public hearing. This is the digital one: a page per project where residents compare options against the city as it is today, run a sun study, and (soon) leave comments and vote.

## Status

First milestone: a Bogotá demo with IDECA's LiDAR 3D building models on the city's own terrain, three illustrative massing options on a lot in Chapinero, and a sun slider.

## Stack

- Next.js 16 (App Router, cache components), React 19, Tailwind 4, shadcn, Geist
- CesiumJS 1.146 with Cesium ion (terrain + imagery), Google Photorealistic 3D Tiles behind a per-site flag
- pnpm workspace, Biome, Vitest

## Layout

```
apps/web            Next.js app. One route per site: /[site]
  sites/*.json      Site definition: camera, context sources, proposals
  public/tilesets   Generated 3D Tiles (committed for the demo)
packages/catastro   IDECA / Catastro Bogotá → 3D Tiles pipeline (buildings and terrain)
```

## Run

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # add NEXT_PUBLIC_CESIUM_ION_TOKEN and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
pnpm --filter @maqueta/web dev
```

## Sites

- **Actuación Estratégica Calle 72** (`/calle-72`, `/calle-72/maquette`): a masterplan simulation of AE24 in Barrios Unidos (Decreto 242 de 2026, led by RenoBo). The plan boundary and Metro Line 1 and Line 2 stations are official open data. The six plots and their massing are illustrative, built on real city blocks near the Metro, the Canal Salitre and Alcázares. Buildings are IDECA LiDAR east of about lon -74.0775 and extruded Catastro footprints west of it.
- **Chapinero** (`/chapinero`, `/chapinero/maquette`): three options for one lot on the Séptima.

## Routes

- `/chapinero` – satellite imagery, coloured options (default theme)
- `/chapinero/maquette` – paper-model theme inspired by PublicTwin: white buildings, pale-yellow options, pill controls. Temporary alternative while we pick one.

## Terrain

Cesium World Terrain has building-shaped mounds in Bogotá (it is derived from surface data), so each site can point `context.terrain` at a Cesium ion terrain asset built from the city's own DTM. For Chapinero the pipeline is:

```bash
cd packages/catastro
python3 -m venv .venv && .venv/bin/pip install numpy scipy rasterio boto3
set -a; . ../../apps/web/.env.local; set +a
.venv/bin/python src/dtm_sample.py --bbox=-74.062,4.649,-74.047,4.662 --step 8 --out data/chapinero-dtm.tif   # samples the Catastro 0.5 m DTM via ArcGIS identify
.venv/bin/python src/ion_upload.py data/chapinero-dtm.tif --name "Bogotá Chapinero DTM (IDECA)"                # ion asset merged onto World Terrain
```

Put the printed asset id in `sites/chapinero.json` as `context.terrain` and pass it to the tiler with `--terrain`.

## Context layers

| Layer | Source | Script |
|---|---|---|
| Trees (5,847 in the demo bbox, low-poly crowns sized by census height) | Censo del arbolado urbano, Jardín Botánico de Bogotá, shapefile on Datos Abiertos (the REST service is capped at 100 records) | `src/trees_extract.py`, then `src/trees.ts` |
| Parks | IDRD Sistema Distrital de Parques, `recreaciondeporte/parquesyescenarios` | `src/overlays.ts` |
| Lot lines | Catastro `catastro/lote` | `src/overlays.ts` |
| Project boundary (yellow band) | Catastro `catastro/manzana`, the block containing the site lot | `src/overlays.ts` |

```bash
cd packages/catastro
.venv/bin/pip install pyshp
.venv/bin/python -I src/trees_extract.py --bbox=-74.060,4.651,-74.049,4.660 --out data/chapinero-trees.json
pnpm exec tsx src/trees.ts --in data/chapinero-trees.json --terrain 6048414 --out ../../apps/web/public/tilesets/chapinero-trees
pnpm exec tsx src/overlays.ts --bbox=-74.060,4.651,-74.049,4.660 --lot 008306022019 --out ../../apps/web/public/tilesets/chapinero-overlays
```

## Build the Calle 72 site

```bash
cd packages/catastro
set -a; . ../../apps/web/.env.local; set +a
# Plan boundary from Datos Abiertos (actuacionestrategica.json, Bogotá grid EPSG:6247) reprojected to data/ae24-calle72.geojson
.venv/bin/python -I src/dtm_sample.py --bbox=-74.0875,4.6565,-74.0600,4.6800 --step 10 --workers 48 --out data/calle72-dtm.tif
.venv/bin/python -I src/ion_upload.py data/calle72-dtm.tif --name "Bogotá Calle 72 DTM (IDECA)"
pnpm exec tsx src/cli.ts --bbox=-74.0875,4.6565,-74.0600,4.6800 --clip data/ae24-calle72.geojson --buffer 150 --terrain <asset id> --out ../../apps/web/public/tilesets/calle72
.venv/bin/python -I src/trees_extract.py --bbox=-74.0875,4.6565,-74.0600,4.6800 --clip data/ae24-calle72.geojson --buffer 150 --out data/calle72-trees.json
pnpm exec tsx src/trees.ts --in data/calle72-trees.json --terrain <asset id> --out ../../apps/web/public/tilesets/calle72-trees
pnpm exec tsx src/overlays.ts --bbox=-74.0875,4.6565,-74.0600,4.6800 --boundary data/ae24-calle72.geojson --clip data/ae24-calle72.geojson --buffer 150 --metro --out ../../apps/web/public/tilesets/calle72-overlays
.venv/bin/python -I src/plots_calle72.py > data/calle72-plots.json
```

Large areas are split into a grid of tiles (`--cell`, degrees). Meshes are quantized (`KHR_mesh_quantization`).

## Regenerate the Chapinero context

Pulls IDECA's "Volumetría 2025" LiDAR building models and writes them as one centred glTF (float32 vertices relative to the tile centre, so there is no jitter at Earth-radius magnitudes) with a feature id per building and an `EXT_structural_metadata` table, so buildings can be clicked in the viewer. Besides the LiDAR fields (floors, height, roof form) the table carries the Catastro lot record joined through the `catastro/lote` service's Predio, Uso and Estrato tables: official address, barrio, destino económico, main use, estrato, PH/NPH, year built, number of predios and built area, decoded with the service's own code domains.

It pulls (an ArcGIS multipatch layer: the query is made with `multipatchOption=stripMaterials` and the zlib-compressed shape buffer is decoded into triangles), samples the site terrain at each building to convert orthometric heights to the ellipsoid, and writes a single-tile 3D Tiles 1.1 tileset.

```bash
set -a; . apps/web/.env.local; set +a
pnpm --filter @maqueta/catastro build -- --bbox=-74.060,4.651,-74.049,4.660 --terrain 6048414 --out ../../apps/web/public/tilesets/chapinero
```

## Data

- Buildings: "Volumetría 2025", IDECA / UAECD LiDAR 3D models with measured heights and roof forms, public feature service in IDECA's ArcGIS Online org (`services1.arcgis.com/J5ltM0ovtzXUbp7B/…/Volumetría_2025/FeatureServer/16`). The matching scene services are Web Mercator, which CesiumJS's I3S loader does not accept, hence the conversion. The older approach (Catastro "Construcción" footprints × 3 m per floor) is gone.
- Terrain: Catastro Bogotá / EAAB urban DTM (Datos Abiertos Bogotá, CC BY-NC-SA 4.0) for Chapinero, Cesium World Terrain elsewhere. Imagery: Cesium ion (default theme), Esri World Light Gray (maquette theme).

## License

MIT

## Screenshots

| Option A on the lot | Option B at 16:00 |
|---|---|
| ![](docs/option-a.png) | ![](docs/option-b-16h.png) |

Live: https://maqueta-ecru.vercel.app/chapinero
