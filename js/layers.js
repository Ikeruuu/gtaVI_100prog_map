/* global L */

/** ImageOverlay cuyo "img" es un <canvas> ya existente (para la rejilla de zona visitada). */
export const CanvasOverlay = L.ImageOverlay.extend({
  _initImage() {
    const el = (this._image = this._url);
    L.DomUtil.addClass(el, 'leaflet-image-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
    if (this.options.className) L.DomUtil.addClass(el, this.options.className);
    el.onselectstart = L.Util.falseFn;
  },
});

/** Mapa base de marcador de posición: rejilla con coordenadas, para cuando aún no hay imagen del mapa. */
export function placeholderLayer(space) {
  const Layer = L.GridLayer.extend({
    createTile(coords) {
      const size = this.getTileSize();
      const c = document.createElement('canvas');
      c.width = size.x; c.height = size.y;
      const g = c.getContext('2d');
      g.fillStyle = '#1b1530'; g.fillRect(0, 0, size.x, size.y);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (let i = 0; i <= size.x; i += size.x / 4) {
        g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, size.y); g.stroke();
        g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(size.x, i + 0.5); g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,.16)'; g.strokeRect(0.5, 0.5, size.x, size.y);
      const scale = Math.pow(2, space.Z - coords.z) * size.x / space.k; // unidades por tesela
      g.fillStyle = 'rgba(255,255,255,.28)'; g.font = '10px system-ui, sans-serif';
      g.fillText(`${Math.round(coords.x * scale)}, ${Math.round(coords.y * scale)}`, 6, 14);
      return c;
    },
  });
  return new Layer({ bounds: space.bounds, noWrap: true, minNativeZoom: 0, maxNativeZoom: space.Z });
}

/**
 * Capa de marcadores dibujada en un único canvas (aguanta miles de puntos en móvil).
 * items: { id, kind: 'marker'|'custom'|'building', ll, color, icon, found, missed, shape }
 * Los edificios se dibujan como una marca hecha a mano: shape 'x' (tachado), 'ring' (pendiente) o 'dash' (cerrado).
 */
function drawMark(g, x, y, r, it) {
  const s = r * 0.65;
  const path = () => {
    g.beginPath();
    if (it.shape === 'ring') g.arc(x, y, s, 0, Math.PI * 2);
    else if (it.shape === 'dash') { g.moveTo(x - s, y); g.lineTo(x + s, y); }
    else { g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); }
  };
  g.lineCap = 'round';
  path(); g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = r * 0.5 + 3; g.stroke();
  path(); g.strokeStyle = it.color; g.lineWidth = r * 0.5; g.stroke();
  g.lineCap = 'butt';
}

export const PinsLayer = L.Layer.extend({
  initialize() { this.items = []; this._screen = []; this.selectedId = null; },
  onAdd(map) {
    const pane = map.getPane('pins') || map.createPane('pins');
    pane.style.zIndex = 450; pane.style.pointerEvents = 'none';
    this._c = L.DomUtil.create('canvas', 'leaflet-zoom-hide', pane);
    this._g = this._c.getContext('2d');
    map.on('move zoom zoomend moveend resize viewreset', this.draw, this);
    this.draw();
  },
  onRemove(map) {
    map.off('move zoom zoomend moveend resize viewreset', this.draw, this);
    this._c.remove();
  },
  setItems(items) { this.items = items; this.draw(); },
  select(id) { this.selectedId = id; this.draw(); },
  draw() {
    const map = this._map; if (!map) return;
    const size = map.getSize(), dpr = window.devicePixelRatio || 1, c = this._c, g = this._g;
    if (c.width !== size.x * dpr || c.height !== size.y * dpr) {
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
    }
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.x, size.y);
    const r = Math.max(6, Math.min(15, 6 + (map.getZoom() - map.getMinZoom()) * 1.6));
    const screen = (this._screen = []);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(r * 1.15)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    for (const it of this.items) {
      const p = map.latLngToContainerPoint(it.ll);
      if (p.x < -r || p.y < -r || p.x > size.x + r || p.y > size.y + r) continue;
      screen.push({ it, x: p.x, y: p.y, r });
      if (it.kind === 'building') drawMark(g, p.x, p.y, r, it);
      else {
        g.globalAlpha = it.found ? 0.38 : 1;
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = it.color; g.fill();
        g.lineWidth = it.kind === 'custom' ? 2 : 1.5;
        g.strokeStyle = it.kind === 'custom' ? '#fff' : 'rgba(10,8,20,.85)';
        if (it.kind === 'custom') g.setLineDash([3, 2]);
        g.stroke(); g.setLineDash([]);
        if (r >= 9 && it.icon) g.fillText(it.icon, p.x, p.y + 1);
        g.globalAlpha = 1;
      }
      if (it.missed) { g.beginPath(); g.arc(p.x, p.y, r + 4, 0, Math.PI * 2); g.strokeStyle = '#ffb347'; g.lineWidth = 2.5; g.stroke(); }
      if (it.id === this.selectedId) { g.beginPath(); g.arc(p.x, p.y, r + 7, 0, Math.PI * 2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
  },
  /** Marcador bajo un punto del contenedor (el dibujado más arriba gana). */
  hit(pt, filter, pad = 6) {
    for (let i = this._screen.length - 1; i >= 0; i--) {
      const s = this._screen[i], dx = s.x - pt.x, dy = s.y - pt.y, rr = s.r + pad;
      if (dx * dx + dy * dy <= rr * rr && (!filter || filter(s.it))) return s.it;
    }
    return null;
  },
});
