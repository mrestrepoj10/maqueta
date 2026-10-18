// CesiumJS reads this global to locate its Workers, Assets and Widgets at runtime.
// It must be set before any `cesium` import is evaluated; import this module first.
declare global {
  // biome-ignore lint/style/noVar: Cesium reads a global var.
  var CESIUM_BASE_URL: string | undefined;
}
if (typeof globalThis !== "undefined" && !globalThis.CESIUM_BASE_URL) {
  globalThis.CESIUM_BASE_URL = "/cesium/";
}

export {};
