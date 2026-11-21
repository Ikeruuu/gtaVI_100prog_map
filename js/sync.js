// Sincronización entre dispositivos sin servidor propio: el progreso se guarda en un gist privado de la
// cuenta de GitHub del usuario, y cada dispositivo lo lee y lo escribe con un token que solo vive en él.
//
// Regla: se compara `mod` (fecha del último cambio de progreso) con lo que había en la última sincronización.
//   - solo cambió el otro dispositivo  -> se baja lo suyo
//   - solo cambió este                 -> se sube lo de este
//   - cambiaron los dos                -> se combinan (se conserva todo lo de ambos) y se sube el resultado
import { state, on, syncDoc, applySync, mergeSync } from './store.js';

const KEY = 'leonida100.sync';
const FILE = 'leonida100-sync.json';
const API = 'https://api.github.com';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Leonida%20100%25';

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} }

let cfg = read();   // { token, gistId, remoteMod, localMod }: los dos `mod` tal como quedaron al sincronizar
let status = { phase: cfg.token ? 'idle' : 'off', msg: '', at: 0 };
let busy = false, again = false, timer = 0;
let unionVisited = (s) => s;
const subs = new Set();

export const syncStatus = () => status;
export const onSyncStatus = (fn) => subs.add(fn);
function set(phase, msg = '') { status = { phase, msg, at: phase === 'idle' ? Date.now() : status.at }; subs.forEach((fn) => fn(status)); }

async function gh(path, opts = {}) {
  const r = await fetch(API + path, {
    cache: 'no-store', ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.status === 401) throw new Error('GitHub no acepta el token: está mal copiado o ha caducado.');
  if (r.status === 403) throw new Error('El token no tiene permiso para gists (o GitHub ha limitado las peticiones).');
  if (!r.ok) { const e = new Error('GitHub respondió ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

async function findOrCreate() {
  const list = await gh('/gists?per_page=100');
  const mine = list.find((g) => g.files && g.files[FILE]);
  if (mine) return mine.id;
  const made = await gh('/gists', {
    method: 'POST',
    body: JSON.stringify({ description: 'Leonida 100% — progreso (lo usa la app para sincronizar)', public: false, files: { [FILE]: { content: JSON.stringify({ app: 'leonida100-sync', mod: 0 }) } } }),
  });
  return made.id;
}

async function readRemote() {
  let g;
  try { g = await gh('/gists/' + cfg.gistId); }
  catch (e) { if (e.status !== 404) throw e; cfg.gistId = await findOrCreate(); g = await gh('/gists/' + cfg.gistId); }   // lo borraron: se rehace
  const f = g.files && g.files[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  let doc; try { doc = JSON.parse(text); } catch { return null; }
  return doc && doc.app === 'leonida100-sync' && doc.mod ? doc : null;
}

async function push() {
  const doc = syncDoc(), body = JSON.stringify({ files: { [FILE]: { content: JSON.stringify(doc) } } });
  await gh('/gists/' + cfg.gistId, { method: 'PATCH', body, keepalive: document.hidden && body.length < 60000 });
  cfg.remoteMod = cfg.localMod = doc.mod;
}

async function sync() {
  if (!cfg.token) return;
  if (busy) { again = true; return; }
  busy = true; set('syncing');
  try {
    if (!cfg.gistId) cfg.gistId = await findOrCreate();
    const remote = await readRemote();
    const local = state.mod || 0;
    const first = cfg.remoteMod === undefined;                 // primera vez que este dispositivo sincroniza
    const remoteChanged = !!remote && remote.mod !== cfg.remoteMod;
    const localChanged = first ? local > 0 : local !== cfg.localMod;
    if (remoteChanged && localChanged) { mergeSync(remote, unionVisited); await push(); set('idle', 'Se han combinado los cambios de dos dispositivos.'); }
    else if (remoteChanged) { applySync(remote); cfg.remoteMod = cfg.localMod = remote.mod; set('idle'); }
    else if (localChanged || !remote) { await push(); set('idle'); }
    else set('idle');
    save();
  } catch (e) {
    console.warn('Sincronización', e);
    set('error', navigator.onLine === false ? 'Sin conexión: se sincronizará al volver.' : e.message);
  } finally {
    busy = false;
    if (again) { again = false; sync(); }
  }
}

export const syncNow = () => sync();

/** Conecta este dispositivo con el token dado. Lanza un error (y no guarda nada) si GitHub lo rechaza. */
export async function connect(token) {
  cfg = { token: token.trim() };
  await sync();
  if (status.phase === 'error') { const msg = status.msg; cfg = {}; save(); set('off'); throw new Error(msg); }
}
export function disconnect() { cfg = {}; save(); set('off'); }

/** unionVisitedFn(str): suma a la zona pintada local la de otro dispositivo y devuelve el resultado serializado. */
export function initSync(unionVisitedFn) {
  unionVisited = unionVisitedFn;
  on((type) => {
    if (type === 'prefs' || !cfg.token) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if ((state.mod || 0) !== cfg.localMod) sync(); }, 3000);
  });
  document.addEventListener('visibilitychange', () => { if (cfg.token) sync(); });   // al volver: bajar; al salir: subir lo pendiente
  addEventListener('online', () => { if (cfg.token) sync(); });
  setInterval(() => { if (cfg.token && !document.hidden) sync(); }, 90000);
  if (cfg.token) sync();
}
