/* global L */
// Espacio de coordenadas único e independiente de la resolución de la imagen:
// el mapa mide siempre UNITS de ancho; el alto sale de la proporción. Origen arriba-izquierda.
export const UNITS = 10000;

export function makeSpace(pxWidth, pxHeight) {
  const Z = Math.max(0, Math.ceil(Math.log2(Math.max(pxWidth, pxHeight) / 256))); // zoom nativo
  const k = pxWidth / UNITS;            // píxeles por unidad a zoom nativo
  const W = UNITS, H = pxHeight / k;
  const toLL = (x, y) => L.CRS.Simple.pointToLatLng(L.point(x * k, y * k), Z);
  const fromLL = (ll) => { const p = L.CRS.Simple.latLngToPoint(ll, Z); return [p.x / k, p.y / k]; };
  const bounds = L.latLngBounds(toLL(0, H), toLL(W, 0));
  /** unidades de mapa por píxel de pantalla al zoom dado */
  const unitsPerPx = (zoom) => 1 / (k * Math.pow(2, zoom - Z));
  return { Z, k, W, H, toLL, fromLL, bounds, unitsPerPx };
}
