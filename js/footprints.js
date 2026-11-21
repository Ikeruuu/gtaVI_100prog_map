// Siluetas de edificios (data/buildings.json), en unidades de mapa, con un índice espacial para saber
// qué edificio hay bajo un punto. Una marca de edificio guarda solo un punto (x, y): su silueta se busca
// aquí cada vez, así que regenerar las siluetas no rompe lo que el usuario ya tiene marcado.
import { UNITS } from './geo.js';

const CELL = 100;   // tamaño de celda del índice, en unidades

export class Footprints {
  constructor(data) {
    const k = UNITS / data.width / (data.scale || 1);   // las coordenadas vienen en píxeles × scale
    this.count = data.polys.length;
    this.polys = new Array(this.count);    // Float32Array [x0, y0, x1, y1, …]
    this.boxes = new Float32Array(this.count * 4);
    this.cells = new Map();
    data.polys.forEach((flat, i) => {
      const p = new Float32Array(flat.length);
      let x = 0, y = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let j = 0; j < flat.length; j += 2) {
        x += flat[j]; y += flat[j + 1];
        const ux = (p[j] = x * k), uy = (p[j + 1] = y * k);
        if (ux < x0) x0 = ux; if (ux > x1) x1 = ux; if (uy < y0) y0 = uy; if (uy > y1) y1 = uy;
      }
      this.polys[i] = p;
      this.boxes.set([x0, y0, x1, y1], i * 4);
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
          const key = cy * 4096 + cx;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(i);
        }
      }
    });
  }

  box(i) { return this.boxes.subarray(i * 4, i * 4 + 4); }

  contains(i, x, y) {
    const b = this.boxes, o = i * 4;
    if (x < b[o] || x > b[o + 2] || y < b[o + 1] || y > b[o + 3]) return false;
    const p = this.polys[i];
    let inside = false;
    for (let j = 0, n = p.length, q = n - 2; j < n; q = j, j += 2) {
      if ((p[j + 1] > y) !== (p[q + 1] > y) && x < ((p[q] - p[j]) * (y - p[j + 1])) / (p[q + 1] - p[j + 1]) + p[j]) inside = !inside;
    }
    return inside;
  }

  /** distancia del punto al borde del polígono */
  edgeDistance(i, x, y) {
    const p = this.polys[i];
    let best = Infinity;
    for (let j = 0, n = p.length, q = n - 2; j < n; q = j, j += 2) {
      const ax = p[q], ay = p[q + 1], dx = p[j] - ax, dy = p[j + 1] - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Índice del edificio en (x, y); si no hay ninguno justo debajo, el más cercano a menos de `tol`. -1 si nada.
   * Si el punto cae en varios (un edificio dentro del patio de otro), gana el más pequeño.
   */
  find(x, y, tol = 0) {
    let hit = -1, hitArea = Infinity, near = -1, nearD = tol;
    const seen = new Set(), b = this.boxes;
    for (let cy = Math.floor((y - tol) / CELL); cy <= Math.floor((y + tol) / CELL); cy++) {
      for (let cx = Math.floor((x - tol) / CELL); cx <= Math.floor((x + tol) / CELL); cx++) {
        const list = this.cells.get(cy * 4096 + cx);
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          if (this.contains(i, x, y)) {
            const area = (b[i * 4 + 2] - b[i * 4]) * (b[i * 4 + 3] - b[i * 4 + 1]);
            if (area < hitArea) { hitArea = area; hit = i; }
          } else if (hit < 0 && tol > 0) { const d = this.edgeDistance(i, x, y); if (d < nearD) { nearD = d; near = i; } }
        }
      }
    }
    return hit >= 0 ? hit : near;
  }

  /**
   * Punto que identifica al edificio i: uno para el que find() devuelve i (y no un edificio anidado en él).
   * Se prueba primero el punto tocado y luego el centro de cada tramo interior a varias alturas.
   */
  anchor(i, x, y) {
    if (x !== undefined && this.find(x, y) === i) return [x, y];
    const [x0, y0, x1, y1] = this.box(i), p = this.polys[i];
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.05, 0.95]) {
      const sy = y0 + (y1 - y0) * t, xs = [];
      for (let j = 0, n = p.length, q = n - 2; j < n; q = j, j += 2) {
        if ((p[j + 1] > sy) !== (p[q + 1] > sy)) xs.push(((p[q] - p[j]) * (sy - p[j + 1])) / (p[q + 1] - p[j + 1]) + p[j]);
      }
      xs.sort((a, c) => a - c);
      const spans = [];
      for (let j = 0; j + 1 < xs.length; j += 2) spans.push([xs[j + 1] - xs[j], (xs[j] + xs[j + 1]) / 2]);
      spans.sort((a, c) => c[0] - a[0]);
      for (const [, mx] of spans) for (const f of [0, 0.25, -0.25]) { const px = mx + f * (x1 - x0) * 0.2; if (this.find(px, sy) === i) return [px, sy]; }
    }
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  }
}
