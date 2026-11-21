// Detecta las siluetas de los edificios sobre las teselas del mapa de MapGenie y escribe data/buildings.json.
//
//   node tools/detect-buildings-tiles.mjs <carpeta> [--debug ty,tx]
//
// <carpeta> contiene las teselas de UN nivel de zoom, bajadas antes con curl, con nombre `ty_tx.jpg`, donde
// (tx, ty) es la posición de la tesela dentro del cuadrado del mapa (0…127 en el zoom 15 de MapGenie, que es
// el que se usa: ver ZOOM). Las teselas no se guardan en el repo; solo las siluetas que salen de ellas.
// Se procesa por trozos con solape, y cada edificio se queda en el trozo donde cae su centro.
import sharp from 'sharp';
import { readdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectShapes, encode } from './lib/detect-core.mjs';

const args = process.argv.slice(2), dir = args[0];
if (!dir) { console.error('Uso: node tools/detect-buildings-tiles.mjs <carpeta de teselas> [--debug ty,tx]'); process.exit(1); }
const debug = args.includes('--debug') ? args[args.indexOf('--debug') + 1].split(',').map(Number) : null;

const map = JSON.parse(await readFile('data/map.json', 'utf8'));
const T = 256, ZOOM = 15;                          // zoom de MapGenie de las teselas de la carpeta
const FULL = map.zoomOffset + Math.log2(map.width / T);   // zoom en el que 1 px = 1 px de data/map.json
const UP = 2 ** (FULL - ZOOM);                     // factor para pasar los píxeles detectados a los de data/map.json
const CORE = 8, HALO = 2;                          // trozo de 8×8 teselas con 2 de solape por lado
const SCALE = 5;                                   // las coordenadas se guardan en quintos de píxel

// En este mapa los edificios son azul claro (tejado) y azul algo más oscuro (fachadas) sobre suelo gris; el agua
// es mucho más oscura en rojo, las calles y aceras son casi grises, y la arena y el césped no son azules.
const isBuilding = (r, g, b) => b - r >= 20 && b - r <= 72 && r >= 104 && r <= 206 && g >= r - 2 && g <= b + 4 && b >= 160;
const isWater = (r, g, b) => r < 104 && b > 140 && g > 120;
const OPTS = { isBuilding, isWater, minArea: 12, maxArea: 400000, small: 90, big: 400, neighbour: 260, eps: 1.2, splitThin: 5 };

const names = (await readdir(dir)).filter((n) => /^\d+_\d+\.jpg$/.test(n));
const tys = names.map((n) => +n.split('_')[0]), txs = names.map((n) => +n.split('_')[1].replace('.jpg', ''));
const ty0 = Math.min(...tys), ty1 = Math.max(...tys), tx0 = Math.min(...txs), tx1 = Math.max(...txs);
console.log(`${names.length} teselas: columnas ${tx0}–${tx1}, filas ${ty0}–${ty1}`);

/** Mosaico RGB de las teselas [cx, cx+n) × [cy, cy+n); las que falten quedan en color de mar. */
async function mosaic(cx, cy, n) {
  const comp = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const f = join(dir, `${cy + y}_${cx + x}.jpg`);
    if (existsSync(f)) comp.push({ input: f, left: x * T, top: y * T });
  }
  const png = await sharp({ create: { width: n * T, height: n * T, channels: 3, background: '#2f90b0' } }).composite(comp).png({ compressionLevel: 1 }).toBuffer();
  const data = await sharp(png).removeAlpha().raw().toBuffer();
  return { data, W: n * T, H: n * T, C: 3, png };
}

const polys = [], totals = { rect: 0, ortho: 0, free: 0 };
const chunks = [];
if (debug) chunks.push([debug[1], debug[0]]);
else for (let cy = ty0; cy <= ty1; cy += CORE) for (let cx = tx0; cx <= tx1; cx += CORE) chunks.push([cx, cy]);

for (const [cx, cy] of chunks) {
  const n = CORE + 2 * HALO, ox = cx - HALO, oy = cy - HALO;
  const img = await mosaic(ox, oy, n);
  const { shapes, stats } = detectShapes(img, OPTS);
  const lo = HALO * T, hi = (HALO + CORE) * T;
  const mine = shapes.filter((s) => { const mx = (s.x0 + s.x1 + 1) / 2, my = (s.y0 + s.y1 + 1) / 2; return mx >= lo && mx < hi && my >= lo && my < hi; });
  for (const s of mine) {
    totals[s.kind]++;
    polys.push(encode(s.pts.map(([x, y]) => [(x + ox * T) * UP, (y + oy * T) * UP]), SCALE));
  }
  if (debug) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n * T}" height="${n * T}">` + shapes.map((s) => `<polygon points="${s.pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="rgba(255,30,150,.30)" stroke="#ff1090" stroke-width="1"/>`).join('') + '</svg>';
    const drawn = await sharp(img.png).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 1 }).toBuffer();
    await sharp(drawn).extract({ left: lo, top: lo, width: CORE * T, height: CORE * T }).png().toFile('debug-buildings.png');
    console.log(`trozo ${cx},${cy}: ${mine.length} edificios`, stats, '-> debug-buildings.png');
    process.exit(0);
  }
  process.stdout.write(`\rtrozo ${cx},${cy}: ${polys.length} edificios…   `);
}
console.log(`\n${polys.length} edificios: ${totals.rect} rectángulos, ${totals.ortho} formas de ángulos rectos y ${totals.free} de contorno libre`);

await writeFile('data/buildings.json', JSON.stringify({
  _doc: 'Siluetas de edificios detectadas sobre las teselas de MapGenie (tools/detect-buildings-tiles.mjs). Coordenadas en píxeles de data/map.json multiplicados por `scale`; cada polígono es [x0, y0, dx1, dy1, dx2, dy2, …]. Generado: no editar a mano.',
  width: map.width, height: map.height, scale: SCALE, count: polys.length, polys,
}));
console.log('data/buildings.json escrito');
