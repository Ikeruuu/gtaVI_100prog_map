// Estado del usuario (progreso) persistido en localStorage.
// Todo lo que el usuario marca vive aquí; los datos del juego viven en data/*.json.
const KEY = 'leonida100.v1';
const KEY_VISITED = KEY + '.visited';

const blank = () => ({
  v: 1,
  found: {},      // id de marcador -> timestamp
  notes: {},      // id de marcador -> texto
  buildings: [],  // { id, x, y, status, note, ts }  edificios marcados a mano
  custom: [],     // { id, cat, x, y, title, desc }  marcadores propios
  hidden: [],     // ids de categoría ocultas
  checklist: {},  // id de requisito del 100% -> cantidad que llevas
  mod: 0,         // cuándo cambió el progreso por última vez (ms); lo usa la sincronización
  prefs: { mode: 'all', hideFound: false, showVisited: true, showBuildings: true, outlines: true },
});

function merge(d) {
  const b = blank();
  return { ...b, ...d, prefs: { ...b.prefs, ...(d && d.prefs) } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(JSON.parse(raw));
  } catch (e) { console.warn('No se pudo leer el progreso', e); }
  return blank();
}

export let state = load();

const listeners = new Set();
export const on = (fn) => listeners.add(fn);
const emit = (type) => listeners.forEach((fn) => fn(type));

let timer = 0;
export function flush() {
  clearTimeout(timer); timer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('No se pudo guardar el progreso', e); }
}
/**
 * Guarda (con retardo) y avisa a la UI. type: 'found' | 'buildings' | 'custom' | 'checklist' | 'note' | 'prefs' | …
 * Todo menos 'prefs' (ajustes de vista, propios de cada dispositivo) cuenta como cambio de progreso y
 * actualiza `state.mod`, que es lo que mira la sincronización.
 */
export function change(type) {
  if (type !== 'prefs') state.mod = Date.now();
  if (!timer) timer = setTimeout(flush, 250);
  emit(type);
}

export const loadVisited = () => { try { return localStorage.getItem(KEY_VISITED); } catch { return null; } };
export function saveVisited(str) {
  try { localStorage.setItem(KEY_VISITED, str); } catch (e) { console.warn(e); }
  change('visited');
}

/* ---- Cambio de mapa base: lo marcado sobre el póster antiguo se pasa a las coordenadas del mapa nuevo ---- */
let spaceId = null, fromPoster = null, convertVisited = null;
function convertCoords(d) {
  for (const k of ['buildings', 'custom']) for (const o of d[k] || []) { o.x = fromPoster.ax * o.x + fromPoster.tx; o.y = fromPoster.ay * o.y + fromPoster.ty; }
}
/**
 * Declara en qué mapa trabaja la app. `T` = { ax, ay, tx, ty } para pasar del póster a este mapa (o nada) y
 * `convVisited(str)` convierte la zona pintada. Devuelve true si había progreso del póster y se ha convertido.
 */
export function setSpace(id, T, convVisited) {
  spaceId = id; fromPoster = T || null; convertVisited = convVisited;
  const cur = state.space || 'poster';
  if (cur === id) { state.space = id; return false; }
  const had = state.buildings.length + state.custom.length > 0 || !!loadVisited();
  if (cur === 'poster' && fromPoster) {
    convertCoords(state);
    const v = convVisited(loadVisited());
    try { v ? localStorage.setItem(KEY_VISITED, v) : localStorage.removeItem(KEY_VISITED); } catch {}
  }
  state.space = id;
  if (had) state.mod = Date.now();
  flush();
  return had && cur === 'poster' && !!fromPoster;
}
/** Un documento de otro dispositivo que aún estaba en el póster se convierte antes de usarlo. */
function normalizeDoc(doc) {
  const cur = doc.space || 'poster';
  if (!spaceId || cur === spaceId) return doc;
  if (cur === 'poster' && fromPoster) { convertCoords(doc); doc.visited = convertVisited(doc.visited); }
  doc.space = spaceId;
  return doc;
}

/* ---- Sincronización: el progreso (sin ajustes de vista) como un único documento ---- */
const SYNCED = ['found', 'notes', 'buildings', 'custom', 'checklist'];
export function syncDoc() {
  const doc = { app: 'leonida100-sync', mod: state.mod || 0, space: state.space || 'poster', visited: loadVisited() };
  for (const k of SYNCED) doc[k] = state[k];
  return doc;
}
/** Sustituye el progreso local por el de otro dispositivo. */
export function applySync(doc) {
  normalizeDoc(doc);
  const b = blank();
  for (const k of SYNCED) state[k] = doc[k] ?? b[k];
  state.mod = doc.mod || 0;
  flush();
  try { doc.visited ? localStorage.setItem(KEY_VISITED, doc.visited) : localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}
/**
 * Combina el progreso local con el de otro dispositivo cuando los dos han cambiado: se queda con todo lo de
 * ambos (lo borrado en uno solo puede reaparecer). `unionVisited(str)` suma la zona pintada del otro y
 * devuelve la rejilla resultante serializada.
 */
export function mergeSync(doc, unionVisited) {
  normalizeDoc(doc);
  const byId = (a, b) => { const m = new Map(); for (const x of [...(b || []), ...(a || [])]) m.set(x.id, x); return [...m.values()]; };
  state.found = { ...doc.found, ...state.found };
  state.notes = { ...doc.notes, ...state.notes };
  state.buildings = byId(state.buildings, doc.buildings);
  state.custom = byId(state.custom, doc.custom);
  const cl = { ...doc.checklist };
  for (const [k, v] of Object.entries(state.checklist)) cl[k] = Math.max(v, cl[k] || 0);
  state.checklist = cl;
  state.mod = Date.now();
  flush();
  const merged = unionVisited(doc.visited);
  try { merged ? localStorage.setItem(KEY_VISITED, merged) : localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}

export function exportJSON() {
  return JSON.stringify({ app: 'leonida100', exported: new Date().toISOString(), ...state, visited: loadVisited() });
}
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'leonida100') throw new Error('El archivo no es una copia de Leonida 100%');
  const { app, exported, visited, ...rest } = d;
  state = merge(rest);
  state.mod = Date.now();
  flush();
  try { visited ? localStorage.setItem(KEY_VISITED, visited) : localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}
export function resetAll() {
  state = blank();
  state.mod = Date.now();
  flush();
  try { localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}

addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
