export type Ecef = [number, number, number];

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

/** WGS84 geodetic to Earth-centred Earth-fixed metres. */
export function lonLatHeightToEcef(lonDeg: number, latDeg: number, h: number): Ecef {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
  return [
    (n + h) * cosLat * Math.cos(lon),
    (n + h) * cosLat * Math.sin(lon),
    (n * (1 - E2) + h) * sinLat,
  ];
}
