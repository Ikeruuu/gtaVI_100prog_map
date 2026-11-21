// Detecta las siluetas de los edificios en la imagen del mapa y las guarda en data/buildings.json.
//   npm run buildings -- ruta/al/mapa.jpg
//
// En el póster oficial los edificios son manchas azuladas sobre el gris de las manzanas. Pasos:
//   1. marcar los píxeles «color edificio» y quitar las líneas de 1 px;
//   2. agrupar los que se tocan y se parecen de tono (para separar edificios pegados);
//   3. descartar lo que no es edificio (cuadrícula del póster, manchas sobre el mar, garabatos);
//   4. cuadrar cada mancha: un edificio es un rectángulo girado, o una forma de ángulos rectos con ese giro.
//      Las manchas pequeñas, cuyo giro propio no es fiable, toman el de los edificios grandes de al lado.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('Uso: npm run buildings -- <imagen>'); process.exit(1); }

const MIN_AREA = 5;        // px: por debajo es ruido
const MAX_AREA = 60000;    // px: por encima no es un edificio
const TONE = 14;           // diferencia máxima de tono entre píxeles vecinos del mismo edificio
const RECT_FIT = 0.7;      // si la mancha llena al menos esta parte de su rectángulo, es un rectángulo…
const RECT_FIT_BIG = 0.85; // …pero a un edificio grande (≥ BIG px) se le exige más, o el rectángulo pisa calles y vecinos
const BIG = 150;
const MAX_CORNERS = 10;    // una forma de ángulos rectos con más esquinas que esto es en realidad una curva o un borde en diagonal
const EPS = 1.0;           // tolerancia (px) al simplificar el contorno de las formas libres
const SMALL = 40;          // px: por debajo, el giro propio de la mancha no es fiable
const NEIGHBOUR = 160;     // px: radio en el que se busca el giro de un edificio grande cercano
const SCALE = 10;          // las coordenadas se guardan en décimas de píxel

const { data, info } = await sharp(src, { limitInputPixels: false }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
console.log(`Imagen ${W}×${H}`);
const isWater = (i) => data[i * C] < 112 && data[i * C + 2] > 150 && data[i * C + 1] > 130;

/* ---------- 1) Máscara de «color edificio» ---------- */
// Azul claramente por encima del rojo, ni tan oscuro como el agua o los escudos de carretera, ni tan claro como las calles.
const mask = new Uint8Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += C) {
  const r = data[p], g = data[p + 1], b = data[p + 2];
  if (r >= 112 && r <= 192 && b - r >= 24 && b - r <= 80 && b >= 160 && b <= 222 && g >= r - 4 && g <= b + 6) mask[i] = 1;
}
// Quitar líneas de 1 px (bordes suavizados de calles y rótulos dan el mismo tono): un píxel se queda solo
// si forma parte de algún bloque de 2×2 entero de color edificio.
{
  const full = new Uint8Array(W * H);
  for (let y = 0; y < H - 1; y++) for (let x = 0, i = y * W; x < W - 1; x++, i++) full[i] = mask[i] & mask[i + 1] & mask[i + W] & mask[i + W + 1];
  for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) {
    if (!mask[i]) continue;
    mask[i] = full[i] | (x > 0 ? full[i - 1] : 0) | (y > 0 ? full[i - W] : 0) | (x > 0 && y > 0 ? full[i - W - 1] : 0);
  }
}

/* ---------- 2) Componentes conexas (4 vecinos) con límite de salto de tono ---------- */
const label = new Int32Array(W * H);
const stack = new Int32Array(W * H);
const comps = [];   // { id, area, x0, y0, x1, y1, sx, sy }
for (let start = 0, next = 0; start < W * H; start++) {
  if (!mask[start] || label[start]) continue;
  const id = ++next;
  let sp = 0, area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
  stack[sp++] = start; label[start] = id;
  while (sp) {
    const i = stack[--sp], x = i % W, y = (i / W) | 0, p = i * C;
    area++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    const tryN = (j) => {
      if (!mask[j] || label[j]) return;
      const q = j * C;
      if (Math.abs(data[p] - data[q]) > TONE || Math.abs(data[p + 2] - data[q + 2]) > TONE) return;
      label[j] = id; stack[sp++] = j;
    };
    if (x > 0) tryN(i - 1);
    if (x < W - 1) tryN(i + 1);
    if (y > 0) tryN(i - W);
    if (y < H - 1) tryN(i + W);
  }
  comps.push({ id, area, x0, y0, x1, y1, sx: start % W, sy: (start / W) | 0 });
}
console.log(`${comps.length} manchas de color edificio`);

/* ---------- 3) Descartes ---------- */
// La cuadrícula del póster son líneas claras de lado a lado; sobre el mar dan justo el color de un edificio.
// Se localizan como filas (y columnas) con muchísimos píxeles más claros que los de 3 px más allá.
function gridLines(horizontal) {
  const n = horizontal ? H : W, m = horizontal ? W : H, score = new Float64Array(n);
  const lum = (x, y) => { const p = (y * W + x) * C; return data[p] + data[p + 1] + data[p + 2]; };
  for (let a = 4; a < n - 4; a++) {
    let s = 0;
    for (let b = 0; b < m; b += 2) {
      const here = horizontal ? lum(b, a) : lum(a, b);
      const side = Math.max(horizontal ? lum(b, a - 3) : lum(a - 3, b), horizontal ? lum(b, a + 3) : lum(a + 3, b));
      if (here - side > 20) s++;
    }
    score[a] = s / (m / 2);
  }
  const lines = [];
  for (let a = 0; a < n; a++) if (score[a] > 0.45) lines.push(a);
  return lines;
}
const rowLines = new Set(gridLines(true)), colLines = new Set(gridLines(false));
console.log(`Cuadrícula del póster: ${rowLines.size} filas y ${colLines.size} columnas de píxeles`);
const onLine = (set, a0, a1) => { for (let a = a0 - 1; a <= a1 + 1; a++) if (set.has(a)) return true; return false; };

function waterAround(c) {   // fracción de agua en un anillo de 3 px alrededor de la caja
  let water = 0, n = 0;
  for (let y = c.y0 - 3; y <= c.y1 + 3; y++) {
    for (let x = c.x0 - 3; x <= c.x1 + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) continue;
      n++; if (isWater(y * W + x)) water++;
    }
  }
  return n ? water / n : 0;
}

const kept = [];
const dropped = { pequeño: 0, enorme: 0, garabato: 0, cuadrícula: 0, mar: 0 };
for (const c of comps) {
  const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
  if (c.area < MIN_AREA) { dropped.pequeño++; continue; }
  if (c.area > MAX_AREA) { dropped.enorme++; continue; }
  if (c.area / (w * h) < 0.18 || c.area / Math.max(w, h) < 1.6) { dropped.garabato++; continue; }
  if ((h <= 4 && onLine(rowLines, c.y0, c.y1)) || (w <= 4 && onLine(colLines, c.x0, c.x1))) { dropped.cuadrícula++; continue; }
  const water = waterAround(c);
  if (water > 0.9 || (Math.min(w, h) <= 3 && water > 0.5)) { dropped.mar++; continue; }
  kept.push(c);
}
console.log(`${kept.length} manchas válidas · descartes:`, dropped);

/* ---------- 4) Cuadrar las formas ---------- */
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
/** Contorno exterior (por las aristas de las celdas, región a la derecha) desde la primera celda en orden de lectura. */
function trace(inside, sx, sy) {
  const pts = [[sx, sy]];
  let x = sx, y = sy, d = 0, guard = 0;
  while (++guard < 4e6) {
    let frx, fry, flx, fly;                   // celdas delante-derecha y delante-izquierda del vértice
    if (d === 0) { frx = x; fry = y; flx = x; fly = y - 1; }
    else if (d === 1) { frx = x - 1; fry = y; flx = x; fly = y; }
    else if (d === 2) { frx = x - 1; fry = y - 1; flx = x - 1; fly = y; }
    else { frx = x; fry = y - 1; flx = x - 1; fly = y - 1; }
    let nd = d;
    if (!inside(frx, fry)) nd = (d + 1) % 4;
    else if (inside(flx, fly)) nd = (d + 3) % 4;
    if (nd !== d) { if (guard > 1) pts.push([x, y]); d = nd; }
    x += DX[d]; y += DY[d];
    if (x === sx && y === sy) break;
  }
  return pts;
}

function hull(points) {   // envolvente convexa (cadena monótona)
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const norm90 = (a) => { const q = Math.PI / 2; return ((a % q) + q) % q; };              // un giro de edificio vale módulo 90°
const diff90 = (a, b) => { const d = Math.abs(norm90(a) - norm90(b)); return Math.min(d, Math.PI / 2 - d); };

/** Caja de unos puntos en el sistema girado `ang`: { area, u0, v0, u1, v1 }. */
function boxAt(points, ang) {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const [x, y] of points) {
    const u = x * cs + y * sn, v = -x * sn + y * cs;
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  return { ang, u0, v0, u1, v1, area: (u1 - u0) * (v1 - v0) };
}
const unrot = (u, v, ang) => [u * Math.cos(ang) - v * Math.sin(ang), u * Math.sin(ang) + v * Math.cos(ang)];

// Primera pasada: envolvente y rectángulo mínimo de cada mancha.
for (const c of kept) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === c.id;
  c.hull = hull(trace(inside, c.sx, c.sy));
  let best = boxAt(c.hull, 0);
  for (let i = 0; i < c.hull.length; i++) {
    const a = c.hull[i], b = c.hull[(i + 1) % c.hull.length];
    const box = boxAt(c.hull, norm90(Math.atan2(b[1] - a[1], b[0] - a[0])));
    if (box.area < best.area - 1e-9) best = box;
  }
  c.min = best;
  c.fit = c.area / best.area;
  c.reliable = c.area >= SMALL && c.fit >= 0.55;
}

// Índice de giros fiables para prestárselos a las manchas pequeñas.
const CELL = NEIGHBOUR, cells = new Map();
for (const c of kept) {
  if (!c.reliable) continue;
  const key = ((c.y0 / CELL) | 0) * 4096 + ((c.x0 / CELL) | 0);
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(c);
}
function neighbourAngle(c) {
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  let best = null, bestD = NEIGHBOUR * NEIGHBOUR;
  for (let gy = ((cy / CELL) | 0) - 1; gy <= ((cy / CELL) | 0) + 1; gy++) {
    for (let gx = ((cx / CELL) | 0) - 1; gx <= ((cx / CELL) | 0) + 1; gx++) {
      for (const o of cells.get(gy * 4096 + gx) || []) {
        const d = ((o.x0 + o.x1) / 2 - cx) ** 2 + ((o.y0 + o.y1) / 2 - cy) ** 2;
        if (d < bestD) { bestD = d; best = o; }
      }
    }
  }
  return best ? best.min.ang : null;
}

/** Forma de ángulos rectos, girada `ang`, que sigue la mancha: se vuelve a rasterizar en el sistema girado y se traza. */
function rectilinear(c, ang) {
  const cs = Math.cos(ang), sn = Math.sin(ang), cellsUV = [];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
    if (label[y * W + x] !== c.id) continue;
    const u = (x + 0.5) * cs + (y + 0.5) * sn, v = -(x + 0.5) * sn + (y + 0.5) * cs;
    cellsUV.push(u, v);
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  const ou = Math.floor(u0) - 1, ov = Math.floor(v0) - 1, gw = Math.ceil(u1) - ou + 2, gh = Math.ceil(v1) - ov + 2;
  let g = new Uint8Array(gw * gh);
  for (let i = 0; i < cellsUV.length; i += 2) g[(Math.floor(cellsUV[i + 1]) - ov) * gw + Math.floor(cellsUV[i]) - ou] = 1;
  // Al girar quedan huecos y picos de una celda: dos pasadas de mayoría 3×3 los alisan sin perder los ángulos rectos.
  for (let pass = 0; pass < 2; pass++) {
    const n = new Uint8Array(gw * gh);
    for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * gw + x + dx];
      n[y * gw + x] = s >= 5 ? 1 : 0;
    }
    g = n;
  }
  // Mayor región conexa.
  const lab = new Int32Array(gw * gh);
  let bestStart = -1, bestArea = 0, id = 0;
  for (let s = 0; s < gw * gh; s++) {
    if (!g[s] || lab[s]) continue;
    id++; let area = 0; const st = [s]; lab[s] = id;
    while (st.length) {
      const i = st.pop(); area++;
      for (const j of [i - 1, i + 1, i - gw, i + gw]) if (g[j] && !lab[j]) { lab[j] = id; st.push(j); }
    }
    if (area > bestArea) { bestArea = area; bestStart = s; }
  }
  if (bestArea < c.area * 0.6) return null;
  const want = lab[bestStart];
  const pts = trace((x, y) => x >= 0 && y >= 0 && x < gw && y < gh && lab[y * gw + x] === want, bestStart % gw, (bestStart / gw) | 0);
  return pts.map(([x, y]) => unrot(x + ou, y + ov, ang));
}

/** Simplificación Douglas-Peucker de un polígono cerrado. */
function simplify(pts) {
  if (pts.length <= 4) return pts;
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) { const dd = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (dd > best) { best = dd; far = i; } }
  const dp = (a, b, out) => {
    let idx = -1, max = EPS;
    const [ax, ay] = pts[a], [bx, by] = pts[b % pts.length], len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const dist = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
      if (dist > max) { max = dist; idx = i; }
    }
    if (idx < 0) return;
    dp(a, idx, out); out.push(pts[idx]); dp(idx, b, out);
  };
  const out = [pts[0]];
  dp(0, far, out); out.push(pts[far]); dp(far, pts.length, out);
  return out;
}

const polys = [];
let rects = 0, shapes = 0, free = 0, borrowed = 0;
for (const c of kept) {
  let box = c.min;
  if (!c.reliable) {
    // Giro prestado del edificio grande más cercano; si no hay, sin giro. Solo si no hincha mucho el rectángulo.
    const na = neighbourAngle(c);
    const cand = na === null ? boxAt(c.hull, 0) : boxAt(c.hull, na);
    if (cand.area <= c.min.area * 1.35) { box = cand; if (na !== null && diff90(na, c.min.ang) > 0.02) borrowed++; }
  }
  let pts = null;
  if (c.area >= SMALL && c.area / box.area < (c.area >= BIG ? RECT_FIT_BIG : RECT_FIT)) {
    pts = rectilinear(c, box.ang);
    if (pts && pts.length <= MAX_CORNERS) shapes++;
    else {   // ni rectángulo ni ángulos rectos limpios (curvas, diagonales): se deja su contorno, alisado
      const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === c.id;
      pts = simplify(trace(inside, c.sx, c.sy)); free++;
    }
  }
  if (!pts) { rects++; pts = [[box.u0, box.v0], [box.u1, box.v0], [box.u1, box.v1], [box.u0, box.v1]].map(([u, v]) => unrot(u, v, box.ang)); }
  const q = pts.map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);
  const flat = [q[0][0], q[0][1]];                          // primer punto absoluto, el resto en deltas
  for (let i = 1; i < q.length; i++) flat.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  polys.push(flat);
}
console.log(`${polys.length} edificios: ${rects} rectángulos (${borrowed} con el giro de un vecino), ${shapes} formas de ángulos rectos y ${free} de contorno libre`);

const out = {
  _doc: 'Siluetas de edificios detectadas en la imagen del mapa (tools/detect-buildings.mjs). Coordenadas en píxeles de la imagen completa multiplicados por `scale`; cada polígono es [x0, y0, dx1, dy1, dx2, dy2, …]. Generado: no editar a mano.',
  width: W, height: H, scale: SCALE, count: polys.length, polys,
};
await writeFile('data/buildings.json', JSON.stringify(out));
console.log('data/buildings.json escrito');
