// Trocea una imagen grande del mapa en teselas para Leaflet y actualiza data/map.json.
//   npm run tiles -- ruta/al/mapa.png ["Texto de atribución"]
// Salida: tiles/{z}/{x}/{y}.webp  (z=0 es el mapa entero en una tesela de 256 px).
import sharp from 'sharp';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const [src, attribution = ''] = process.argv.slice(2);
if (!src) { console.error('Uso: npm run tiles -- <imagen> ["atribución"]'); process.exit(1); }

const T = 256, OUT = 'tiles';
const opts = { limitInputPixels: false };
const { width, height } = await sharp(src, opts).metadata();
const Z = Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / T)));
console.log(`Imagen ${width}×${height} px -> zoom 0..${Z}`);

await rm(OUT, { recursive: true, force: true });
let total = 0;
for (let z = Z; z >= 0; z--) {
  const scale = 2 ** (z - Z);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  // Una pasada de redimensionado por nivel, a memoria en bruto, y de ahí se recortan las teselas.
  const { data, info } = await sharp(src, opts).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const level = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels }, limitInputPixels: false });
  for (let x = 0; x * T < w; x++) {
    await mkdir(join(OUT, String(z), String(x)), { recursive: true });
    for (let y = 0; y * T < h; y++) {
      const tw = Math.min(T, w - x * T), th = Math.min(T, h - y * T);
      await level().extract({ left: x * T, top: y * T, width: tw, height: th })
        .extend({ right: T - tw, bottom: T - th, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 }).toFile(join(OUT, String(z), String(x), `${y}.webp`));
      total++;
    }
  }
  console.log(`  z${z}: ${w}×${h}`);
}

const cfgPath = 'data/map.json';
const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
Object.assign(cfg, { type: 'tiles', url: 'tiles/{z}/{x}/{y}.webp', width, height, attribution });
await writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(`${total} teselas en ${OUT}/ · data/map.json actualizado`);
