// Importa las localizaciones y categorías del mapa de Leonida de MapGenie (el que muestra también IGN).
// Uso con permiso de su autor, obtenido por el dueño de este repo (ver CLAUDE.md).
//
//   curl -A "Mozilla/5.0" -o page.html https://mapgenie.io/grand-theft-auto-6/maps/leonida
//   curl -A "Mozilla/5.0" -o data.json https://mapgenie.io/api/v1/maps/1100/data
//   node tools/import-mapgenie.mjs page.html data.json
//
// Escribe data/markers.json y data/categories.json. Se copian posición, categoría y nombre de cada
// localización; NO sus descripciones ni sus fotos: la ficha de cada marcador enlaza a MapGenie para verlas.
import { readFile, writeFile } from 'node:fs/promises';

const [pagePath, dataPath] = process.argv.slice(2);
if (!pagePath || !dataPath) { console.error('Uso: node tools/import-mapgenie.mjs <page.html> <data.json>'); process.exit(1); }

const html = await readFile(pagePath, 'utf8');
const start = html.search(/window\.mapData\s*=\s*/);
if (start < 0) throw new Error('No encuentro window.mapData en la página');
const from = html.indexOf('{', start);
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = from; i < html.length; i++) {            // objeto JSON equilibrado
  const ch = html[i];
  if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) { end = i + 1; break; }
}
const page = JSON.parse(html.slice(from, end));
const data = JSON.parse(await readFile(dataPath, 'utf8'));

// --- Coordenadas: latitud/longitud (Mercator web) -> unidades de nuestro mapa (ver data/map.json) ---
const map = JSON.parse(await readFile('data/map.json', 'utf8'));
const ZOOM = map.zoomOffset + Math.log2(map.width / 256);          // zoom de MapGenie al que 1 px = 1 px de nuestro mapa
const WORLD = 256 * 2 ** ZOOM, ORIGIN = map.tileOffset * map.width; // esquina de nuestro cuadrado dentro del mundo
const toUnits = (lat, lng) => {
  const phi = (lat * Math.PI) / 180;
  const px = ((lng + 180) / 360) * WORLD - ORIGIN;
  const py = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * WORLD - ORIGIN;
  return [+(px * 10000 / map.width).toFixed(2), +(py * 10000 / map.width).toFixed(2)];
};

// --- Categorías ---
const GROUP_ES = {
  'Points of Interest': 'Puntos de interés', Robberies: 'Robos', Vehicles: 'Vehículos', Style: 'Estilo', 'Food & Drink': 'Comida y bebida',
  'WAiNK Locations': 'Lugares WAiNK', Exploration: 'Exploración', 'Collectible Cards': 'Cartas coleccionables', Sports: 'Deportes',
  Activities: 'Actividades', Stunts: 'Acrobacias', Racing: 'Carreras', 'Illegal Operations': 'Operaciones ilegales',
};
const ICON = {
  ATM: '🏧', Gym: '🏋️', Club: '🪩', 'Ammu-Nation': '🔫', 'Basketball Hoop': '🏀', 'Golf Course': '⛳', 'Mini-Golf Course': '⛳', 'Pool Table': '🎱',
  'Shooting Range': '🎯', 'Arcade Machine': '🕹️', 'Fishing Hotspot': '🎣', 'Stunt Jump': '🛞', 'Base Jump': '🪂', 'Knife Flight': '✈️', 'Under the Bridge': '🌉',
  Bank: '🏦', 'Big Bank': '🏛️', 'Payday Loans': '🤝', 'Low-End Jewelry Store': '💍', 'High-End Jewelry Store': '💎', 'Pawn Shop': '🪙', 'ATM (Towable)': '🏧',
  'Convenience Store': '🏪', 'Fast Food': '🍔', 'Liquor Store': '🍾', Contact: '📞', Safe: '🔐', "Pay 'N' Spray": '🎨', 'Mod Shop': '🔧', 'Gas Station': '⛽',
  'Car Wash': '🧽', 'Electric Charger': '🔌', 'Bus Stop': '🚌', 'Train Station': '🚆', 'Ferry Terminal': '⛴️', 'Rental Vehicle': '🔑', 'Purchasable Garage': '🅿️',
  Garage: '🅿️', 'Standout Vehicle': '🚗', 'Randy Vehicle': '🚙', 'Moses Vehicle': '🚐', 'Casual & Street': '👕', Sportswear: '🎽', Formal: '👔',
  'Souvenir & Swimwear': '🩱', Thrift: '🧥', Footwear: '👟', 'Hair & Beauty': '💈', Tattoos: '🖋️', Electronics: '📱', 'Cafes & Takeout': '☕', Bar: '🍺',
  'Street Food': '🌭', Landmark: '🗽', Curiosity: '🔍', Sculpture: '🗿', 'Racing Challenge': '⏱️', 'Top Fun Drones': '🛸', 'Book Swap': '📚', Magazine: '📖',
  'Unique Playlist': '🎵', '1010 Mural': '📸',
};
const GROUP_ICON = { Racing: '🏁', 'Collectible Cards': '🃏', 'Illegal Operations': '💀' };
// Lo que no es para completar el juego (servicios, tiendas, transporte) no cuenta para el progreso y empieza oculto.
const UNTRACKED_GROUPS = new Set(['Points of Interest', 'Style', 'Food & Drink']);
const UNTRACKED = new Set(['Contact', "Pay 'N' Spray", 'Mod Shop', 'Gas Station', 'Car Wash', 'Electric Charger', 'Bus Stop', 'Train Station', 'Ferry Terminal', 'Rental Vehicle', 'Purchasable Garage', 'Garage']);
const HUES = [205, 350, 30, 280, 15, 265, 160, 50, 95, 185, 320, 0, 130];
function hsl(h, s, l) {   // -> #rrggbb
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const count = new Map();
for (const l of data.locations) count.set(l.category_id, (count.get(l.category_id) || 0) + 1);

const groups = [{ id: 'own', name: 'Lo que encuentro yo' }];
const categories = [
  { id: 'lootitem', group: 'own', name: 'Botín / objeto robable', icon: '💰', color: '#7ae582' },
  { id: 'safe', group: 'own', name: 'Caja fuerte', icon: '🔐', color: '#c8b6ff' },
  { id: 'interior', group: 'own', name: 'Interior accesible', icon: '🚪', color: '#e0aaff', tracked: false },
  { id: 'random', group: 'own', name: 'Evento aleatorio', icon: '❗', color: '#ff4fa3' },
  { id: 'secret', group: 'own', name: 'Secreto / easter egg', icon: '👽', color: '#80ffdb' },
  { id: 'poi', group: 'own', name: 'Punto de interés', icon: '📍', color: '#ced4da', tracked: false },
];
const ordered = [...page.groups].sort((a, b) => a.section_id - b.section_id || a.order - b.order);
ordered.forEach((g, gi) => {
  const cats = g.categories.filter((c) => count.get(c.id)).sort((a, b) => a.order - b.order);
  if (!cats.length) return;
  groups.push({ id: 'g' + g.id, name: GROUP_ES[g.title] || g.title });
  cats.forEach((c, ci) => {
    const untracked = UNTRACKED_GROUPS.has(g.title) || UNTRACKED.has(c.title);
    const cat = { id: 'mg' + c.id, group: 'g' + g.id, name: c.title, icon: ICON[c.title] || GROUP_ICON[g.title] || '📍', color: hsl((HUES[gi % HUES.length] + ci * 9) % 360, 72, 62 + (ci % 3) * 5) };
    if (untracked) { cat.tracked = false; cat.defaultHidden = true; }
    categories.push(cat);
  });
});

// --- Marcadores ---
const known = new Set(categories.map((c) => c.id));
const markers = [];
for (const l of data.locations) {
  const cat = 'mg' + l.category_id;
  if (!known.has(cat)) continue;
  const [x, y] = toUnits(parseFloat(l.latitude), parseFloat(l.longitude));
  markers.push({ id: 'mg' + l.id, cat, x, y, title: l.title, ref: l.id });
}

await writeFile('data/categories.json', JSON.stringify({
  _doc: 'Generado por tools/import-mapgenie.mjs. El grupo «own» son las categorías para los marcadores que añade el usuario; el resto vienen de MapGenie (nombres en inglés, como en su mapa). tracked=false => no cuenta para el progreso ni para «Olvidos»; defaultHidden => empieza oculta.',
  groups, categories,
}, null, 1) + '\n');
await writeFile('data/markers.json', JSON.stringify({
  _doc: 'Generado por tools/import-mapgenie.mjs. x/y en unidades de mapa (ancho 10000). ref = id de la localización en MapGenie, para enlazar a su ficha.',
  source: 'MapGenie',
  sourceUrl: 'https://mapgenie.io/grand-theft-auto-6/maps/leonida',
  linkTemplate: 'https://mapgenie.io/grand-theft-auto-6/maps/leonida?locationIds={ref}',
  updated: new Date().toISOString().slice(0, 10),
  markers,
}) + '\n');
console.log(`${markers.length} marcadores en ${categories.length - 6} categorías de ${groups.length - 1} grupos`);
