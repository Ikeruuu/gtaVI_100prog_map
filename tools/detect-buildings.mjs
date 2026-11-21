// Detecta las siluetas de los edificios en la imagen del PÓSTER y las guarda en data/buildings-poster.json
// (para el mapa de teselas de MapGenie, ver tools/detect-buildings-tiles.mjs).
//   npm run buildings -- ruta/al/mapa.jpg [salida.json]
// En el póster los edificios son manchas azuladas sobre el gris de las manzanas.
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { detectShapes, encode } from './lib/detect-core.mjs';

const [src, outPath = 'data/buildings-poster.json'] = process.argv.slice(2);
if (!src) { console.error('Uso: npm run buildings -- <imagen> [salida.json]'); process.exit(1); }
const SCALE = 10;   // las coordenadas se guardan en décimas de píxel

const { data, info } = await sharp(src, { limitInputPixels: false }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
console.log(`Imagen ${W}×${H}`);

const { shapes, dropped, stats, gridLines } = detectShapes({ data, W, H, C: info.channels }, {
  // Azul claramente por encima del rojo, ni tan oscuro como el agua o los escudos de carretera, ni tan claro como las calles.
  isBuilding: (r, g, b) => r >= 112 && r <= 192 && b - r >= 24 && b - r <= 80 && b >= 160 && b <= 222 && g >= r - 4 && g <= b + 6,
  isWater: (r, g, b) => r < 112 && b > 150 && g > 130,
  tone: 14,           // en el póster los edificios pegados solo se distinguen por un pequeño cambio de tono
  gridLines: true,
});
console.log(`Cuadrícula del póster: ${gridLines} líneas de píxeles · descartes:`, dropped);
console.log(`${shapes.length} edificios: ${stats.rect} rectángulos (${stats.prestado} con el giro de un vecino), ${stats.ortho} formas de ángulos rectos y ${stats.free} de contorno libre`);

await writeFile(outPath, JSON.stringify({
  _doc: 'Siluetas de edificios detectadas en el póster (tools/detect-buildings.mjs). Coordenadas en píxeles de la imagen completa multiplicados por `scale`; cada polígono es [x0, y0, dx1, dy1, dx2, dy2, …]. Generado: no editar a mano.',
  width: W, height: H, scale: SCALE, count: shapes.length, polys: shapes.map((s) => encode(s.pts, SCALE)),
}));
console.log(outPath + ' escrito');
