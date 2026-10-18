// Copies the CesiumJS static runtime (Workers, Assets, ThirdParty, Widgets) into public/cesium
// before dev/build so the app never depends on a CDN.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cesiumPkg = dirname(require.resolve("cesium/package.json"));
const src = join(cesiumPkg, "Build", "Cesium");
const dest = join(process.cwd(), "public", "cesium");

if (!existsSync(src)) {
  console.error(`Cesium build not found at ${src}`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const dir of ["Workers", "Assets", "ThirdParty", "Widgets"]) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("cesium runtime -> public/cesium");
