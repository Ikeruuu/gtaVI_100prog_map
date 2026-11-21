// Núcleo del detector de siluetas de edificios, común al póster y a las teselas.
//   1. marcar los píxeles «color edificio» y quitar las líneas de 1 px;
//   2. agrupar los que se tocan (y, si se pide, se parecen de tono);
//   3. descartar lo que no es edificio;
//   4. cuadrar cada mancha: rectángulo girado si lo llena lo bastante (las pequeñas toman el giro del edificio
//      grande más cercano); si no, forma de ángulos rectos; si tampoco, su contorno alisado.

const DEFAULTS = {
  tone: 255,          // diferencia máxima de tono entre píxeles vecinos del mismo edificio (255 = sin límite)
  minArea: 5,         // px: por debajo es ruido
  maxArea: 60000,     // px: por encima no es un edificio
  rectFit: 0.7,       // si la mancha llena al menos esta parte de su rectángulo, es un rectángulo…
  rectFitBig: 0.85,   // …pero a un edificio grande (≥ big px) se le exige más
  big: 150,
  small: 40,          // px: por debajo, el giro propio de la mancha no es fiable
  neighbour: 160,     // px: radio en el que se busca el giro de un edificio grande cercano
  maxCorners: 10,     // más esquinas que esto en una forma de ángulos rectos = en realidad es curva o diagonal
  eps: 1.0,           // tolerancia (px) al simplificar el contorno de las formas libres
  gridLines: false,   // descartar la cuadrícula impresa del póster
  isWater: null,      // (r, g, b) => bool; si se da, se descartan las manchas rodeadas de agua
  splitThin: 0,       // px: a las manchas enormes o desgarbadas se les quitan las partes más finas que 2× esto
                      // (vías de tren, pasarelas) y se aprovechan los edificios que quedaban unidos por ellas
};

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
/** Caja de unos puntos en el sistema girado `ang`. */
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

/** Simplificación Douglas-Peucker de un polígono cerrado. */
function simplify(pts, eps) {
  if (pts.length <= 4) return pts;
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) { const dd = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (dd > best) { best = dd; far = i; } }
  const out = [pts[0]];
  const dp = (a, b) => {
    const st = [[a, b]], keep = [];
    while (st.length) {
      const [s, e] = st.pop();
      let idx = -1, max = eps;
      const [ax, ay] = pts[s], [bx, by] = pts[e % pts.length], len = Math.hypot(bx - ax, by - ay) || 1;
      for (let i = s + 1; i < e; i++) {
        const dist = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
        if (dist > max) { max = dist; idx = i; }
      }
      if (idx >= 0) { keep.push(idx); st.push([s, idx], [idx, e]); }
    }
    keep.sort((p, q) => p - q).forEach((i) => out.push(pts[i]));
  };
  dp(0, far); out.push(pts[far]); dp(far, pts.length);
  return out;
}

/**
 * img = { data, W, H, C } (píxeles RGB en bruto). opts.isBuilding(r, g, b) decide el «color edificio».
 * Devuelve [{ pts: [[x, y], …], x0, y0, x1, y1, area, kind: 'rect' | 'ortho' | 'free' }] y un resumen de descartes.
 */
export function detectShapes(img, options) {
  const o = { ...DEFAULTS, ...options }, { data, W, H, C } = img;

  // 1) Máscara, sin líneas de 1 px: un píxel se queda solo si forma parte de algún bloque de 2×2 entero.
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += C) if (o.isBuilding(data[p], data[p + 1], data[p + 2])) mask[i] = 1;
  {
    const full = new Uint8Array(W * H);
    for (let y = 0; y < H - 1; y++) for (let x = 0, i = y * W; x < W - 1; x++, i++) full[i] = mask[i] & mask[i + 1] & mask[i + W] & mask[i + W + 1];
    for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) {
      if (!mask[i]) continue;
      mask[i] = full[i] | (x > 0 ? full[i - 1] : 0) | (y > 0 ? full[i - W] : 0) | (x > 0 && y > 0 ? full[i - W - 1] : 0);
    }
  }

  // 2) Componentes conexas (4 vecinos).
  const label = new Int32Array(W * H), stack = new Int32Array(W * H), comps = [];
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
        if (o.tone < 255) { const q = j * C; if (Math.abs(data[p] - data[q]) > o.tone || Math.abs(data[p + 2] - data[q + 2]) > o.tone) return; }
        label[j] = id; stack[sp++] = j;
      };
      if (x > 0) tryN(i - 1);
      if (x < W - 1) tryN(i + 1);
      if (y > 0) tryN(i - W);
      if (y < H - 1) tryN(i + W);
    }
    comps.push({ id, area, x0, y0, x1, y1, sx: start % W, sy: (start / W) | 0 });
  }

  // 3) Descartes.
  let rowLines = new Set(), colLines = new Set();
  if (o.gridLines) {
    // La cuadrícula del póster son líneas claras de lado a lado: filas (y columnas) con muchísimos píxeles
    // más claros que los de 3 px más allá.
    const lum = (x, y) => { const p = (y * W + x) * C; return data[p] + data[p + 1] + data[p + 2]; };
    const find = (horizontal) => {
      const n = horizontal ? H : W, m = horizontal ? W : H, lines = new Set();
      for (let a = 4; a < n - 4; a++) {
        let s = 0;
        for (let b = 0; b < m; b += 2) {
          const here = horizontal ? lum(b, a) : lum(a, b);
          const side = Math.max(horizontal ? lum(b, a - 3) : lum(a - 3, b), horizontal ? lum(b, a + 3) : lum(a + 3, b));
          if (here - side > 20) s++;
        }
        if (s / (m / 2) > 0.45) lines.add(a);
      }
      return lines;
    };
    rowLines = find(true); colLines = find(false);
  }
  const onLine = (set, a0, a1) => { for (let a = a0 - 1; a <= a1 + 1; a++) if (set.has(a)) return true; return false; };
  const waterAround = (c) => {   // fracción de agua en un anillo de 3 px alrededor de la caja
    let water = 0, n = 0;
    for (let y = c.y0 - 3; y <= c.y1 + 3; y++) for (let x = c.x0 - 3; x <= c.x1 + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) continue;
      const p = (y * W + x) * C;
      n++; if (o.isWater(data[p], data[p + 1], data[p + 2])) water++;
    }
    return n ? water / n : 0;
  };
  /** Parte una mancha por sus zonas finas: erosiona R px, etiqueta lo que queda y lo vuelve a engordar dentro de la mancha. */
  let nextId = comps.length + 1;
  const split = (c) => {
    const R = o.splitThin, w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, at = (x, y) => (y + c.y0) * W + x + c.x0;
    let m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (label[at(x, y)] === c.id) m[y * w + x] = 1;
    const orig = m;
    for (let k = 0; k < R; k++) {
      const n = new Uint8Array(w * h);
      for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) n[i] = m[i] & m[i - 1] & m[i + 1] & m[i - w] & m[i + w];
      m = n;
    }
    const lab = new Int32Array(w * h), parts = [];
    let frontier = [];
    for (let s0 = 0; s0 < w * h; s0++) {
      if (!m[s0] || lab[s0]) continue;
      const id = nextId++, st = [s0]; lab[s0] = id; parts.push(id);
      while (st.length) { const i = st.pop(); frontier.push(i); for (const j of [i - 1, i + 1, i - w, i + w]) if (m[j] && !lab[j]) { lab[j] = id; st.push(j); } }
    }
    for (let k = 0; k <= R && frontier.length; k++) {   // engordar de vuelta, sin salirse de la mancha original
      const next = [];
      for (const i of frontier) {
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && orig[j] && !lab[j]) { lab[j] = lab[i]; next.push(j); }
      }
      frontier = next;
    }
    const out = new Map(parts.map((id) => [id, { id, area: 0, x0: W, y0: H, x1: 0, y1: 0, sx: -1, sy: -1, split: true }]));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!orig[y * w + x]) continue;
      const id = lab[y * w + x], gx = x + c.x0, gy = y + c.y0;
      label[gy * W + gx] = id;                       // 0 = parte fina, descartada
      if (!id) continue;
      const p = out.get(id);
      if (p.sx < 0) { p.sx = gx; p.sy = gy; }        // primera celda en orden de lectura
      p.area++;
      if (gx < p.x0) p.x0 = gx; if (gx > p.x1) p.x1 = gx; if (gy < p.y0) p.y0 = gy; if (gy > p.y1) p.y1 = gy;
    }
    return [...out.values()];
  };

  const kept = [], dropped = { pequeño: 0, enorme: 0, garabato: 0, cuadrícula: 0, mar: 0, partidas: 0 };
  const queue = [...comps];
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (c.area < o.minArea) { dropped.pequeño++; continue; }
    const huge = c.area > o.maxArea, scribble = c.area / (w * h) < 0.18 || c.area / Math.max(w, h) < 1.6;
    if ((huge || scribble) && o.splitThin && !c.split && c.area >= 40 * o.splitThin * o.splitThin) { dropped.partidas++; queue.push(...split(c)); continue; }
    if (c.split && c.area < 20 * o.splitThin * o.splitThin) { dropped.garabato++; continue; }   // migajas de una mancha partida
    if (huge) { dropped.enorme++; continue; }
    if (scribble) { dropped.garabato++; continue; }
    if (o.gridLines && ((h <= 4 && onLine(rowLines, c.y0, c.y1)) || (w <= 4 && onLine(colLines, c.x0, c.x1)))) { dropped.cuadrícula++; continue; }
    if (o.isWater) { const water = waterAround(c); if (water > 0.9 || (Math.min(w, h) <= 3 && water > 0.5)) { dropped.mar++; continue; } }
    kept.push(c);
  }

  // 4) Cuadrar las formas. Primera pasada: envolvente y rectángulo mínimo.
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
    c.reliable = c.area >= o.small && c.area / best.area >= 0.55;
    // Un trozo largo y estrecho salido de partir una mancha es un tramo de vía, no un edificio.
    const a = best.u1 - best.u0, b = best.v1 - best.v0;
    c.drop = c.split && Math.max(a, b) / Math.max(1, Math.min(a, b)) > 6;
  }
  for (let i = kept.length - 1; i >= 0; i--) if (kept[i].drop) { kept.splice(i, 1); dropped.garabato++; }
  // Índice de giros fiables para prestárselos a las manchas pequeñas.
  const CELL = o.neighbour, cells = new Map();
  for (const c of kept) {
    if (!c.reliable) continue;
    const key = ((c.y0 / CELL) | 0) * 65536 + ((c.x0 / CELL) | 0);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(c);
  }
  const neighbourAngle = (c) => {
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    let best = null, bestD = o.neighbour * o.neighbour;
    for (let gy = ((cy / CELL) | 0) - 1; gy <= ((cy / CELL) | 0) + 1; gy++) for (let gx = ((cx / CELL) | 0) - 1; gx <= ((cx / CELL) | 0) + 1; gx++) {
      for (const n of cells.get(gy * 65536 + gx) || []) {
        const d = ((n.x0 + n.x1) / 2 - cx) ** 2 + ((n.y0 + n.y1) / 2 - cy) ** 2;
        if (d < bestD) { bestD = d; best = n; }
      }
    }
    return best ? best.min.ang : null;
  };
  /** Forma de ángulos rectos, girada `ang`: se vuelve a rasterizar la mancha en el sistema girado y se traza. */
  const rectilinear = (c, ang) => {
    const cs = Math.cos(ang), sn = Math.sin(ang), uv = [];
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      if (label[y * W + x] !== c.id) continue;
      const u = (x + 0.5) * cs + (y + 0.5) * sn, v = -(x + 0.5) * sn + (y + 0.5) * cs;
      uv.push(u, v);
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const ou = Math.floor(u0) - 1, ov = Math.floor(v0) - 1, gw = Math.ceil(u1) - ou + 2, gh = Math.ceil(v1) - ov + 2;
    let g = new Uint8Array(gw * gh);
    for (let i = 0; i < uv.length; i += 2) g[(Math.floor(uv[i + 1]) - ov) * gw + Math.floor(uv[i]) - ou] = 1;
    for (let pass = 0; pass < 2; pass++) {   // mayoría 3×3: alisa huecos y picos de una celda sin perder los ángulos rectos
      const n = new Uint8Array(gw * gh);
      for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[(y + dy) * gw + x + dx];
        n[y * gw + x] = s >= 5 ? 1 : 0;
      }
      g = n;
    }
    const lab = new Int32Array(gw * gh);
    let bestStart = -1, bestArea = 0, id = 0;
    for (let s = 0; s < gw * gh; s++) {
      if (!g[s] || lab[s]) continue;
      id++; let area = 0; const st = [s]; lab[s] = id;
      while (st.length) { const i = st.pop(); area++; for (const j of [i - 1, i + 1, i - gw, i + gw]) if (g[j] && !lab[j]) { lab[j] = id; st.push(j); } }
      if (area > bestArea) { bestArea = area; bestStart = s; }
    }
    if (bestArea < c.area * 0.6) return null;
    const want = lab[bestStart];
    const pts = trace((x, y) => x >= 0 && y >= 0 && x < gw && y < gh && lab[y * gw + x] === want, bestStart % gw, (bestStart / gw) | 0);
    return pts.map(([x, y]) => unrot(x + ou, y + ov, ang));
  };

  const shapes = [];
  const stats = { rect: 0, ortho: 0, free: 0, prestado: 0 };
  for (const c of kept) {
    let box = c.min;
    if (!c.reliable) {   // giro prestado del edificio grande más cercano (o ninguno), si no hincha mucho el rectángulo
      const na = neighbourAngle(c), cand = boxAt(c.hull, na === null ? 0 : na);
      if (cand.area <= c.min.area * 1.35) { box = cand; if (na !== null && diff90(na, c.min.ang) > 0.02) stats.prestado++; }
    }
    let pts = null, kind = 'rect';
    if (c.area >= o.small && c.area / box.area < (c.area >= o.big ? o.rectFitBig : o.rectFit)) {
      pts = rectilinear(c, box.ang); kind = 'ortho';
      if (!pts || pts.length > o.maxCorners) {
        const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === c.id;
        pts = simplify(trace(inside, c.sx, c.sy), o.eps); kind = 'free';
      }
    }
    if (!pts) pts = [[box.u0, box.v0], [box.u1, box.v0], [box.u1, box.v1], [box.u0, box.v1]].map(([u, v]) => unrot(u, v, box.ang));
    stats[kind]++;
    shapes.push({ pts, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, area: c.area, kind });
  }
  return { shapes, dropped, stats, gridLines: rowLines.size + colLines.size };
}

/** [[x, y], …] (px) -> [x0, y0, dx1, dy1, …] en enteros, multiplicando por `scale`. */
export function encode(pts, scale) {
  const q = pts.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
  const flat = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) flat.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
  return flat;
}
