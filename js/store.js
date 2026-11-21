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
  prefs: { mode: 'all', hideFound: false, showVisited: true, showBuildings: true },
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
/** Guarda (con retardo) y avisa a la UI. type: 'found' | 'buildings' | 'custom' | 'prefs' | 'visited' | 'reset' */
export function change(type) {
  if (!timer) timer = setTimeout(flush, 250);
  emit(type);
}

export const loadVisited = () => { try { return localStorage.getItem(KEY_VISITED); } catch { return null; } };
export function saveVisited(str) {
  try { localStorage.setItem(KEY_VISITED, str); } catch (e) { console.warn(e); }
  emit('visited');
}

export function exportJSON() {
  return JSON.stringify({ app: 'leonida100', exported: new Date().toISOString(), ...state, visited: loadVisited() });
}
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'leonida100') throw new Error('El archivo no es una copia de Leonida 100%');
  const { app, exported, visited, ...rest } = d;
  state = merge(rest);
  flush();
  try { visited ? localStorage.setItem(KEY_VISITED, visited) : localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}
export function resetAll() {
  state = blank();
  flush();
  try { localStorage.removeItem(KEY_VISITED); } catch {}
  emit('reset');
}

addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
