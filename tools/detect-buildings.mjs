// Detecta las siluetas de los edificios en la imagen del mapa y las guarda en data/buildings.json.
//   npm run buildings -- ruta/al/mapa.jpg
// En el póster oficial los edificios son manchas azuladas sobre el gris de las manzanas. Se marcan los
// píxeles «color edificio», se agrupan los que se tocan (y se parecen de tono, para separar edificios
// pegados) y se traza el contorno de cada grupo como polígono.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('Uso: npm run buildings -- <imagen>'); process.exit(1); }

const MIN_AREA = 5;        // px: por debajo es ruido
const MAX_AREA = 60000;    // px: por encima no es un edificio (un fallo de color en mar o cielo)
const TONE = 14;           // diferencia máxima de tono entre píxeles vecinos del mismo edificio
const EPS = 0.75;          // tolerancia (px) al simplificar el contorno

const { data, info } = await sharp(src, { limitInputPixels: false }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
console.log(`Imagen ${W}×${H}`);

// 1) Máscara de «color edificio»: azul claramente por encima del rojo, ni tan oscuro como el agua
//    o los escudos de carretera, ni tan claro como las calles.
const mask = new Uint8Array(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += C) {
  const r = data[p], g = data[p + 1], b = data[p + 2];
  if (r >= 112 && r <= 192 && b - r >= 24 && b - r <= 80 && b >= 160 && b <= 222 && g >= r - 4 && g <= b + 6) mask[i] = 1;
}

// 1b) Quitar líneas de 1 px (bordes suavizados de calles, rótulos y cuadrícula, que dan el mismo tono):
//     un píxel se queda solo si forma parte de algún bloque de 2×2 entero de color edificio.
{
  const full = new Uint8Array(W * H);   // full[i] = el bloque 2×2 con esquina superior izquierda en i está completo
  for (let y = 0; y < H - 1; y++) for (let x = 0, i = y * W; x < W - 1; x++, i++) full[i] = mask[i] & mask[i + 1] & mask[i + W] & mask[i + W + 1];
  for (let y = 0; y < H; y++) for (let x = 0, i = y * W; x < W; x++, i++) {
    if (!mask[i]) continue;
    mask[i] = full[i] | (x > 0 ? full[i - 1] : 0) | (y > 0 ? full[i - W] : 0) | (x > 0 && y > 0 ? full[i - W - 1] : 0);
  }
}

// 2) Componentes conexas (4 vecinos) con límite de salto de tono.
const label = new Int32Array(W * H);
const stack = new Int32Array(W * H);
const comps = [];   // { id, area, x0, y0, x1, y1, sx, sy }
let next = 0;
for (let start = 0; start < W * H; start++) {
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

// 3) Contorno exterior de cada componente (recorrido por las aristas de los píxeles, región a la derecha).
const inside = (x, y, id) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === id;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
function trace(c) {
  // Se parte de la esquina superior izquierda del primer píxel (el más alto y, en esa fila, el más a la
  // izquierda), hacia la derecha. Esa esquina solo toca ese píxel, así que el contorno pasa por ella una vez.
  const id = c.id, pts = [[c.sx, c.sy]];
  let x = c.sx, y = c.sy, d = 0, guard = 0;
  while (++guard < 4e6) {
    let frx, fry, flx, fly;                   // píxeles delante-derecha y delante-izquierda del vértice
    if (d === 0) { frx = x; fry = y; flx = x; fly = y - 1; }
    else if (d === 1) { frx = x - 1; fry = y; flx = x; fly = y; }
    else if (d === 2) { frx = x - 1; fry = y - 1; flx = x - 1; fly = y; }
    else { frx = x; fry = y - 1; flx = x - 1; fly = y - 1; }
    let nd = d;
    if (!inside(frx, fry, id)) nd = (d + 1) % 4;            // girar a la derecha
    else if (inside(flx, fly, id)) nd = (d + 3) % 4;        // girar a la izquierda
    if (nd !== d) { if (guard > 1) pts.push([x, y]); d = nd; }
    x += DX[d]; y += DY[d];
    if (x === c.sx && y === c.sy) break;
  }
  return pts;
}

// Simplificación Douglas-Peucker para polígono cerrado.
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
let small = 0, big = 0;
for (const c of comps) {
  if (c.area < MIN_AREA) { small++; continue; }
  if (c.area > MAX_AREA) { big++; continue; }
  const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
  if (c.area / (w * h) < 0.18 || c.area / Math.max(w, h) < 1.6) continue;   // líneas finas y garabatos, no edificios
  if (Math.min(w, h) <= 2 && Math.max(w, h) >= 6) continue;                 // trozos de la cuadrícula del póster sobre el mar
  const pts = simplify(trace(c));
  if (pts.length < 3) continue;
  const flat = [pts[0][0], pts[0][1]];                      // primer punto absoluto, el resto en deltas
  for (let i = 1; i < pts.length; i++) flat.push(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  polys.push(flat);
}
console.log(`${polys.length} edificios (${small} descartados por pequeños, ${big} por enormes)`);

const out = {
  _doc: 'Siluetas de edificios detectadas en la imagen del mapa (tools/detect-buildings.mjs). Coordenadas en píxeles de la imagen completa; cada polígono es [x0, y0, dx1, dy1, dx2, dy2, …]. Generado: no editar a mano.',
  width: W, height: H, count: polys.length, polys,
};
await writeFile('data/buildings.json', JSON.stringify(out));
console.log('data/buildings.json escrito');
