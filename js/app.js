/* global L */
import { state, change, on, flush, exportJSON, importJSON, resetAll, loadVisited, saveVisited, uid } from './store.js';
import { makeSpace } from './geo.js';
import { VisitedGrid } from './grid.js';
import { CanvasOverlay, PinsLayer, placeholderLayer } from './layers.js';
import { getMapImage, setMapImage, clearMapImage, imageSize } from './mapimage.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getJSON = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });

// Marcas de edificio: igual que tachar con una X sobre una foto del mapa, pero con estados.
const BUILDING_STATUS = {
  clear: { icon: '✕', label: 'Visto, nada', color: '#14101f', shape: 'x' },
  looted: { icon: '💰', label: 'Saqueado', color: '#0b9e6a', shape: 'x' },
  todo: { icon: '🔁', label: 'Volver', color: '#ff7a00', shape: 'ring' },
  locked: { icon: '🔒', label: 'Cerrado', color: '#6c757d', shape: 'dash' },
};
const VISITED_STATUSES = new Set(['clear', 'looted']);

let map, space, grid, pins, visitedOverlay;
let groups = [], cats = [], catById = new Map();
let dataMarkers = [], dataMeta = {}, markerIndex = new Map(), base = {};
let missed = [], missedIds = new Set();
let tool = 'explore', brush = 22, selected = null;
let stamp = 'clear';        // estado con el que se marcan los edificios al tocar
const placed = [];          // edificios marcados en esta sesión, para «Deshacer»
const undoStack = [];

/* ---------------- Arranque ---------------- */
async function boot() {
  const [mapCfg, catCfg, mk] = await Promise.all([getJSON('data/map.json'), getJSON('data/categories.json'), getJSON('data/markers.json')]);
  groups = catCfg.groups; cats = catCfg.categories; catById = new Map(cats.map((c) => [c.id, c]));
  dataMarkers = (mk.markers || []).filter((m) => catById.has(m.cat));
  dataMeta = { source: mk.source, updated: mk.updated };

  base = { ...mapCfg };
  try {
    const blob = await getMapImage();
    if (blob) {
      const url = URL.createObjectURL(blob);
      base = { type: 'image', url, local: true, ...(await imageSize(url)) };
    }
  } catch (e) { console.warn('Imagen local no disponible', e); }

  setupMap();
  bindUI();
  bindPaint();
  on((type) => { if (type === 'reset') loadGrid(); if (type !== 'note') refresh(); });
  refresh();
  setTool('explore');
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function setupMap() {
  space = makeSpace(base.width, base.height);
  map = L.map('map', {
    crs: L.CRS.Simple, minZoom: 0, maxZoom: space.Z + 2, zoomSnap: 0.5, zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90, zoomControl: false, maxBoundsViscosity: 0.9, attributionControl: !!base.attribution,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  if (base.type === 'tiles') {
    L.tileLayer(base.url, { tileSize: 256, minNativeZoom: 0, maxNativeZoom: space.Z, maxZoom: space.Z + 2, bounds: space.bounds, noWrap: true, attribution: base.attribution || '' }).addTo(map);
  } else if (base.type === 'image') {
    L.imageOverlay(base.url, space.bounds, { attribution: base.attribution || '' }).addTo(map);
  } else {
    placeholderLayer(space).addTo(map);
  }

  grid = new VisitedGrid(space.W, space.H);
  loadGrid();
  visitedOverlay = new CanvasOverlay(grid.canvas, space.bounds, { className: 'visited-layer', opacity: 0.42, interactive: false });
  pins = new PinsLayer().addTo(map);

  map.setMaxBounds(space.bounds.pad(0.3));
  map.fitBounds(space.bounds);
  map.on('click', onMapClick);
}

function loadGrid() {
  if (!grid.load(loadVisited())) toast('Las zonas pintadas eran de un mapa con otra proporción y no se pueden mostrar.');
  undoStack.length = 0;
}

/* ---------------- Datos derivados ---------------- */
function allMarkers() { return dataMarkers.concat(state.custom); }
const isTracked = (m) => catById.get(m.cat)?.tracked !== false;

function computeMissed() {
  const R2 = (grid.cell * 3) ** 2;
  const seen = state.buildings.filter((b) => VISITED_STATUSES.has(b.status));
  const out = [];
  for (const m of allMarkers()) {
    if (state.found[m.id] || !isTracked(m)) continue;
    let why = grid.at(m.x, m.y) ? 'zone' : null;
    if (!why) for (const b of seen) { if ((b.x - m.x) ** 2 + (b.y - m.y) ** 2 <= R2) { why = 'building'; break; } }
    if (why) out.push({ m, why });
  }
  return out;
}

function nearbyUnfound(x, y) {
  const R2 = (grid.cell * 3) ** 2;
  return allMarkers().filter((m) => !state.found[m.id] && isTracked(m) && (m.x - x) ** 2 + (m.y - y) ** 2 <= R2);
}

/* ---------------- Render ---------------- */
let raf = 0;
function refresh() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }

function render() {
  markerIndex = new Map(allMarkers().map((m) => [m.id, m]));
  missed = computeMissed();
  missedIds = new Set(missed.map((x) => x.m.id));
  renderPins(); renderProgress(); renderCats(); renderMissed(); renderData(); renderControls(); renderDetail();
}

function renderPins() {
  const p = state.prefs, items = [];
  if (p.mode === 'all') {
    const hidden = new Set(state.hidden);
    for (const m of allMarkers()) {
      if (hidden.has(m.cat)) continue;
      const found = !!state.found[m.id];
      if (found && p.hideFound) continue;
      const c = catById.get(m.cat);
      if (!c) continue;
      items.push({ id: m.id, kind: m.custom ? 'custom' : 'marker', ll: space.toLL(m.x, m.y), color: c.color, icon: c.icon, found, missed: missedIds.has(m.id) });
    }
  }
  if (p.showBuildings) {
    for (const b of state.buildings) {
      const s = BUILDING_STATUS[b.status] || BUILDING_STATUS.clear;
      items.push({ id: b.id, kind: 'building', ll: space.toLL(b.x, b.y), color: s.color, shape: s.shape });
    }
  }
  if (selected?.kind === 'new') items.push({ id: '__new', kind: 'custom', ll: space.toLL(selected.x, selected.y), color: '#fff', icon: '➕' });
  pins.selectedId = selected?.kind === 'new' ? '__new' : selected?.id ?? null;
  pins.setItems(items);
  if (p.showVisited) visitedOverlay.addTo(map); else visitedOverlay.remove();
}

function renderProgress() {
  const tracked = allMarkers().filter(isTracked);
  const done = tracked.filter((m) => state.found[m.id]).length;
  const pct = tracked.length ? (done / tracked.length) * 100 : 0;
  $('#progText').textContent = tracked.length ? `${done} de ${tracked.length} conseguidos` : 'Aún no hay marcadores cargados';
  $('#progPct').textContent = tracked.length ? `${pct.toFixed(pct < 10 ? 1 : 0)}%` : '';
  $('#progBar').style.width = pct + '%';
}

function renderCats() {
  const hidden = new Set(state.hidden), count = new Map(), done = new Map();
  for (const m of allMarkers()) {
    count.set(m.cat, (count.get(m.cat) || 0) + 1);
    if (state.found[m.id]) done.set(m.cat, (done.get(m.cat) || 0) + 1);
  }
  $('#catList').innerHTML = groups.map((g) => {
    const list = cats.filter((c) => c.group === g.id);
    if (!list.length) return '';
    return `<div class="group-h"><span>${esc(g.name)}</span><button data-group="${esc(g.id)}">mostrar / ocultar</button></div>` +
      list.map((c) => {
        const n = count.get(c.id) || 0, d = done.get(c.id) || 0;
        const label = c.tracked === false ? `${n}` : `${d}/${n}`;
        return `<label class="cat${n && d === n && c.tracked !== false ? ' done' : ''}"><input type="checkbox" data-cat="${esc(c.id)}"${hidden.has(c.id) ? '' : ' checked'}>` +
          `<i style="background:${esc(c.color)}">${c.icon}</i><span>${esc(c.name)}</span><em>${label}</em></label>`;
      }).join('');
  }).join('');
  $('#catList').style.opacity = state.prefs.mode === 'empty' ? 0.45 : 1;
}

const itemRow = (m, sub) => {
  const c = catById.get(m.cat);
  return `<button class="item" data-goto="${esc(m.id)}"><i>${c.icon}</i><div><b>${esc(m.title || c.name)}</b><small>${esc(sub)}</small></div></button>`;
};

function renderMissed() {
  const badge = $('#missedBadge');
  badge.hidden = !missed.length; badge.textContent = missed.length;
  $('#missedList').innerHTML = missed.length
    ? missed.map(({ m, why }) => itemRow(m, why === 'zone' ? 'En una zona que pintaste como visitada' : 'Junto a un edificio que marcaste como visto')).join('')
    : '<div class="empty">Nada pendiente en las zonas y edificios que has marcado como visitados.</div>';
}

function renderData() {
  $('#baseInfo').textContent = base.local
    ? `Usando la imagen que cargaste en este dispositivo (${base.width}×${base.height} px).`
    : base.type === 'none'
      ? 'Todavía no hay imagen del mapa: se muestra una rejilla. Carga una imagen del mapa completo en alta resolución (cuanta más resolución, mejor se distinguen los edificios al hacer zoom). Se guarda solo en este dispositivo.'
      : `Mapa alojado (${base.width}×${base.height} px).`;
  $('#mapClear').hidden = !base.local;
  $('#dataInfo').textContent = dataMarkers.length
    ? `${dataMarkers.length} marcadores${dataMeta.source ? ' · fuente: ' + dataMeta.source : ''}${dataMeta.updated ? ' · actualizado ' + dataMeta.updated : ''}.`
    : 'Aún no hay datos de marcadores del juego. Mientras tanto puedes añadir los tuyos con la herramienta «Marcador».';
  $('#statsInfo').textContent = `${state.buildings.length} edificios marcados · ${state.custom.length} marcadores propios · ${(grid.coverage() * 100).toFixed(2)}% del mapa pintado como visitado.`;
  const n = $('#notice');
  n.hidden = base.type !== 'none';
  if (base.type === 'none') n.innerHTML = '<span>Sin imagen de mapa: estás viendo una rejilla de prueba.</span><button data-open-data>Cargar mapa</button>';
}

function renderControls() {
  const p = state.prefs;
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === p.mode));
  $('#tgVisited').checked = p.showVisited; $('#tgBuildings').checked = p.showBuildings; $('#tgHideFound').checked = p.hideFound;
}

/* ---------------- Ficha de detalle ---------------- */
function openDetail(sel) { selected = sel; renderPins(); renderDetail(); }
function closeDetail() { if (!selected) return; selected = null; renderPins(); renderDetail(); }

function catOptions(current) {
  return groups.map((g) => `<optgroup label="${esc(g.name)}">` + cats.filter((c) => c.group === g.id)
    .map((c) => `<option value="${esc(c.id)}"${c.id === current ? ' selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('') + '</optgroup>').join('');
}

function renderDetail() {
  const el = $('#detail');
  if (!selected) { el.hidden = true; el.innerHTML = ''; return; }
  // No pisar la ficha mientras se escribe en ella.
  if (!el.hidden && el.dataset.for === (selected.id || 'new') && el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const close = '<button class="icon-btn" data-act="close" aria-label="Cerrar">✕</button>';
  let html = '';
  if (selected.kind === 'new') {
    html = `<div class="d-head"><i style="background:#fff">➕</i>Nuevo marcador${close}</div>
      <h2>Añadir marcador propio</h2>
      <select id="nCat">${catOptions(selected.cat || 'collectible')}</select>
      <input type="text" id="nTitle" placeholder="Nombre (p. ej. «Caja fuerte en el motel»)" maxlength="80">
      <textarea id="nDesc" placeholder="Notas: cómo llegar, qué hay…"></textarea>
      <div class="d-foot"><button class="btn ghost" data-act="close">Cancelar</button><button class="btn primary" data-act="create">Guardar</button></div>`;
  } else if (selected.kind === 'building') {
    const b = state.buildings.find((x) => x.id === selected.id);
    if (!b) { selected = null; el.hidden = true; return; }
    const near = nearbyUnfound(b.x, b.y);
    html = `<div class="d-head"><i style="background:#fff">🏠</i>Edificio marcado${close}</div>
      <div class="status">${Object.entries(BUILDING_STATUS).map(([k, s]) => `<button data-status="${k}" class="${b.status === k ? 'on' : ''}">${s.icon} ${s.label}</button>`).join('')}</div>
      ${near.length ? `<div class="warn">Aquí hay ${near.length === 1 ? 'algo' : near.length + ' cosas'} que no has conseguido:</div><div class="list" style="margin-bottom:10px">${near.map((m) => itemRow(m, catById.get(m.cat).name)).join('')}</div>` : ''}
      <textarea data-note placeholder="Nota: qué había, por dónde se entra…">${esc(b.note)}</textarea>
      <div class="d-foot"><button class="btn danger" data-act="delete">Eliminar</button></div>`;
  } else {
    const m = markerIndex.get(selected.id);
    if (!m) { selected = null; el.hidden = true; return; }
    const c = catById.get(m.cat), found = !!state.found[m.id];
    html = `<div class="d-head"><i style="background:${esc(c.color)}">${c.icon}</i>${esc(c.name)}${m.custom ? ' · propio' : ''}${close}</div>
      <h2>${esc(m.title || c.name)}</h2>
      ${m.desc ? `<p>${esc(m.desc)}</p>` : ''}
      ${missedIds.has(m.id) ? '<div class="warn">Marcaste este sitio como visitado, pero esto sigue sin conseguir.</div>' : ''}
      <button class="btn found-btn${found ? ' on' : ''}" data-act="found">${found ? '✓ Conseguido' : 'Marcar como conseguido'}</button>
      <textarea data-note placeholder="Nota personal…">${esc(state.notes[m.id] || '')}</textarea>
      ${m.custom ? '<div class="d-foot"><button class="btn danger" data-act="delete">Eliminar</button></div>' : ''}`;
  }
  el.dataset.for = selected.id || 'new';
  el.innerHTML = html;
  el.hidden = false;
  if (selected.kind === 'new' && matchMedia('(min-width: 821px)').matches) $('#nTitle').focus();
}

function onDetailClick(e) {
  const goto = e.target.closest('[data-goto]');
  if (goto) return goTo(goto.dataset.goto);
  const st = e.target.closest('[data-status]');
  if (st && selected?.kind === 'building') {
    const b = state.buildings.find((x) => x.id === selected.id);
    b.status = st.dataset.status; return change('buildings');
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'close') return closeDetail();
  if (act === 'create') {
    const title = $('#nTitle').value.trim(), cat = $('#nCat').value;
    const m = { id: uid('c'), custom: true, cat, x: selected.x, y: selected.y, title: title || catById.get(cat).name, desc: $('#nDesc').value.trim() };
    state.custom.push(m);
    if (state.hidden.includes(cat)) state.hidden = state.hidden.filter((c) => c !== cat);
    state.prefs.mode = 'all';
    selected = { kind: 'marker', id: m.id };
    $('#detail').hidden = true;
    return change('custom');
  }
  if (act === 'found') {
    if (state.found[selected.id]) delete state.found[selected.id]; else state.found[selected.id] = Date.now();
    return change('found');
  }
  if (act === 'delete') {
    const id = selected.id;
    if (selected.kind === 'building') state.buildings = state.buildings.filter((b) => b.id !== id);
    else { state.custom = state.custom.filter((m) => m.id !== id); delete state.found[id]; delete state.notes[id]; }
    selected = null;
    return change(id.startsWith('b') ? 'buildings' : 'custom');
  }
}

function onDetailInput(e) {
  if (!e.target.matches('[data-note]') || !selected) return;
  const v = e.target.value;
  if (selected.kind === 'building') { const b = state.buildings.find((x) => x.id === selected.id); if (b) b.note = v; }
  else if (v) state.notes[selected.id] = v; else delete state.notes[selected.id];
  change('note');
}

function goTo(id) {
  const m = markerIndex.get(id);
  if (!m) return;
  if (state.prefs.mode !== 'all' || state.hidden.includes(m.cat) || (state.prefs.hideFound && state.found[id])) {
    state.prefs.mode = 'all'; state.prefs.hideFound = state.prefs.hideFound && !state.found[id];
    state.hidden = state.hidden.filter((c) => c !== m.cat);
    change('prefs');
  }
  document.body.classList.remove('panel-open');
  map.flyTo(space.toLL(m.x, m.y), Math.max(map.getZoom(), space.Z - 1), { duration: 0.6 });
  openDetail({ kind: 'marker', id });
}

/* ---------------- Interacción con el mapa ---------------- */
function onMapClick(e) {
  if (tool === 'paint' || tool === 'erase') return;
  // Con «Edificio» solo se abren edificios ya marcados (para poder marcar uno encima de un marcador);
  // con «Marcador» siempre se crea uno nuevo.
  const hit = tool === 'add' ? null
    : pins.hit(e.containerPoint, (it) => it.id !== '__new' && (tool !== 'building' || it.kind === 'building'), tool === 'building' ? 0 : 6);
  if (hit) return openDetail({ kind: hit.kind === 'building' ? 'building' : 'marker', id: hit.id });
  const [x, y] = space.fromLL(e.latlng);
  const inside = x >= 0 && y >= 0 && x <= space.W && y <= space.H;
  if (tool === 'building' && inside) {
    // Marcado rápido: un toque = una marca, sin abrir ficha (tocar una marca existente sí la abre).
    const b = { id: uid('b'), x, y, status: stamp, note: '', ts: Date.now() };
    state.buildings.push(b); placed.push(b.id);
    state.prefs.showBuildings = true;
    selected = null;
    const near = VISITED_STATUSES.has(stamp) ? nearbyUnfound(x, y) : [];
    if (near.length) toast(`Ojo: aquí hay ${near.length === 1 ? 'algo' : near.length + ' cosas'} sin conseguir (mira «Olvidos»)`);
    return change('buildings');
  }
  if (tool === 'add' && inside) return openDetail({ kind: 'new', x, y });
  closeDetail();
}

function setTool(t) {
  tool = t;
  const painting = t === 'paint' || t === 'erase';
  $$('#toolbar button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  const el = map.getContainer();
  el.className = el.className.replace(/\btool-\w+/g, '').trim() + ' tool-' + t;
  map.dragging[painting ? 'disable' : 'enable']();
  $('#brushbar').hidden = !painting;
  $('#stampbar').hidden = t !== 'building';
  $$('#stampbar [data-stamp]').forEach((b) => b.classList.toggle('on', b.dataset.stamp === stamp));
  $('#brushCursor').hidden = true;
  $('#brushCursor').classList.toggle('erase', t === 'erase');
  $$('#brushbar [data-brush]').forEach((b) => b.classList.toggle('on', +b.dataset.brush === brush));
  if (painting && !state.prefs.showVisited) { state.prefs.showVisited = true; change('prefs'); }
  if (painting) closeDetail();
}

function bindPaint() {
  const el = map.getContainer(), cursor = $('#brushCursor');
  const active = new Set();
  let painting = false, dirty = false, last = null;
  const isPaint = () => tool === 'paint' || tool === 'erase';

  const dab = (e) => {
    const [x, y] = space.fromLL(map.mouseEventToLatLng(e));
    const rad = brush * space.unitsPerPx(map.getZoom()), v = tool === 'paint';
    if (last) {
      const d = Math.hypot(x - last[0], y - last[1]), n = Math.max(1, Math.ceil(d / Math.max(rad / 2, grid.cell / 2)));
      for (let i = 1; i <= n; i++) dirty = grid.paint(last[0] + ((x - last[0]) * i) / n, last[1] + ((y - last[1]) * i) / n, rad, v) || dirty;
    } else dirty = grid.paint(x, y, rad, v) || dirty;
    last = [x, y];
  };
  const end = (commit) => {
    if (!painting) return;
    painting = false; last = null;
    if (commit && dirty) saveVisited(grid.serialize());
    else { const snap = undoStack.pop(); if (!commit && snap) restore(snap); }
    dirty = false;
  };

  el.addEventListener('pointerdown', (e) => {
    if (!isPaint() || e.target.closest('.leaflet-control')) return;
    active.add(e.pointerId);
    if (active.size > 1) return end(false);      // segundo dedo: es un pellizco, se descarta el trazo
    if (e.button) return;
    painting = true; dirty = false; last = null;
    undoStack.push(grid.bits.slice()); if (undoStack.length > 12) undoStack.shift();
    dab(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (!isPaint()) return;
    if (e.pointerType === 'mouse') {
      const r = el.getBoundingClientRect();
      cursor.hidden = false;
      cursor.style.left = e.clientX - r.left + 'px'; cursor.style.top = e.clientY - r.top + 'px';
      cursor.style.width = cursor.style.height = brush * 2 + 'px';
    }
    if (painting && active.size === 1) dab(e);
  });
  el.addEventListener('pointerleave', () => { cursor.hidden = true; });
  const up = (e) => { active.delete(e.pointerId); end(true); };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

function restore(bits) {
  grid.bits.set(bits);
  const s = grid.serialize();
  grid.load(s);
  saveVisited(s);
}

/* ---------------- UI ---------------- */
function bindUI() {
  $('#toolbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('#brushbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-brush]');
    if (b) { brush = +b.dataset.brush; setTool(tool); }
  });
  $('#undoBtn').addEventListener('click', () => { const s = undoStack.pop(); if (s) restore(s); else toast('Nada que deshacer'); });
  $('#stampbar').innerHTML = Object.entries(BUILDING_STATUS).map(([k, s]) => `<button data-stamp="${k}">${s.icon} ${s.label}</button>`).join('')
    + '<button id="undoStamp" title="Quitar la última marca">↩</button>';
  $('#stampbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stamp]');
    if (b) { stamp = b.dataset.stamp; return setTool('building'); }
    if (!e.target.closest('#undoStamp')) return;
    let id; do { id = placed.pop(); } while (id && !state.buildings.some((x) => x.id === id));
    if (!id) return toast('Nada que deshacer');
    state.buildings = state.buildings.filter((x) => x.id !== id);
    if (selected?.id === id) selected = null;
    change('buildings');
  });

  $('#modeSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) { state.prefs.mode = b.dataset.mode; change('prefs'); } });
  $('#tgVisited').addEventListener('change', (e) => { state.prefs.showVisited = e.target.checked; change('prefs'); });
  $('#tgBuildings').addEventListener('change', (e) => { state.prefs.showBuildings = e.target.checked; change('prefs'); });
  $('#tgHideFound').addEventListener('change', (e) => { state.prefs.hideFound = e.target.checked; change('prefs'); });

  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

  $('#catList').addEventListener('change', (e) => {
    const id = e.target.dataset.cat; if (!id) return;
    state.hidden = e.target.checked ? state.hidden.filter((c) => c !== id) : [...new Set([...state.hidden, id])];
    if (e.target.checked) state.prefs.mode = 'all';
    change('prefs');
  });
  $('#catList').addEventListener('click', (e) => {
    const g = e.target.closest('[data-group]')?.dataset.group; if (!g) return;
    const ids = cats.filter((c) => c.group === g).map((c) => c.id);
    const anyVisible = ids.some((id) => !state.hidden.includes(id));
    state.hidden = anyVisible ? [...new Set([...state.hidden, ...ids])] : state.hidden.filter((c) => !ids.includes(c));
    change('prefs');
  });

  $('#search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase(), box = $('#searchResults');
    if (q.length < 2) { box.innerHTML = ''; return; }
    const res = allMarkers().filter((m) => `${m.title || ''} ${m.desc || ''} ${catById.get(m.cat).name}`.toLowerCase().includes(q)).slice(0, 40);
    box.innerHTML = res.length ? res.map((m) => itemRow(m, catById.get(m.cat).name + (state.found[m.id] ? ' · conseguido' : ''))).join('') : '<div class="empty">Sin resultados</div>';
  });
  for (const id of ['#searchResults', '#missedList']) $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) goTo(b.dataset.goto); });

  $('#detail').addEventListener('click', onDetailClick);
  $('#detail').addEventListener('input', onDetailInput);

  $('#panelOpen').addEventListener('click', () => document.body.classList.add('panel-open'));
  $('#panelClose').addEventListener('click', () => document.body.classList.remove('panel-open'));
  $('#stage').addEventListener('click', (e) => { if (e.target === $('#stage')) document.body.classList.remove('panel-open'); });
  $('#notice').addEventListener('click', (e) => { if (e.target.closest('[data-open-data]')) { showTab('data'); document.body.classList.add('panel-open'); } });

  $('#mapFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await setMapImage(f); flush(); location.reload(); } catch (err) { toast('No se pudo guardar la imagen: ' + err.message); }
  });
  $('#mapClear').addEventListener('click', async () => { await clearMapImage(); flush(); location.reload(); });

  $('#exportBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
    a.download = `leonida100-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!confirm('Importar sustituye el progreso de este dispositivo por el del archivo. ¿Continuar?')) return;
    try { importJSON(await f.text()); selected = null; toast('Progreso importado'); } catch (err) { toast(err.message); }
  });
  $('#resetBtn').addEventListener('click', () => {
    if (confirm('¿Borrar TODO tu progreso en este dispositivo (conseguidos, edificios, zonas y marcadores propios)? No se puede deshacer.')) { selected = null; resetAll(); toast('Progreso borrado'); }
  });

  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDetail(); document.body.classList.remove('panel-open'); } });
}

function showTab(name) {
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + name; });
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;margin:0;padding:12px;background:#400;color:#fff;z-index:9999;white-space:pre-wrap">No se pudo iniciar: ${esc(e.message)}</pre>`);
});
