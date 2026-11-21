// Rejilla de "zona visitada": un bit por celda (1024 celdas en el lado largo del mapa).
// Se pinta en un canvas de 1 píxel por celda que Leaflet escala sobre el mapa.
const COLOR = '#9d7bff';   // violeta: que no se confunda con el verde de los edificios vistos

export class VisitedGrid {
  constructor(W, H, n = 1024) {
    this.cell = Math.max(W, H) / n;
    this.cols = Math.max(1, Math.round(W / this.cell));
    this.rows = Math.max(1, Math.round(H / this.cell));
    this.bits = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = COLOR;
  }
  get(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    return ((this.bits[i >> 3] >> (i & 7)) & 1) === 1;
  }
  set(c, r, v) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c, mask = 1 << (i & 7);
    if (((this.bits[i >> 3] & mask) !== 0) === v) return false;
    if (v) { this.bits[i >> 3] |= mask; this.ctx.fillRect(c, r, 1, 1); }
    else { this.bits[i >> 3] &= ~mask; this.ctx.clearRect(c, r, 1, 1); }
    return true;
  }
  /** Pinta (v=true) o borra (v=false) un círculo en unidades de mapa. Devuelve si cambió algo. */
  paint(x, y, radius, v) {
    const cx = x / this.cell, cy = y / this.cell, rr = Math.max(radius / this.cell, 0.5);
    let changed = this.set(Math.floor(cx), Math.floor(cy), v);
    for (let r = Math.floor(cy - rr); r <= Math.floor(cy + rr); r++) {
      for (let c = Math.floor(cx - rr); c <= Math.floor(cx + rr); c++) {
        const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
        if (dx * dx + dy * dy <= rr * rr) changed = this.set(c, r, v) || changed;
      }
    }
    return changed;
  }
  at(x, y) { return this.get(Math.floor(x / this.cell), Math.floor(y / this.cell)); }
  /** fracción 0..1 del mapa marcada como visitada */
  coverage() {
    let n = 0;
    for (const b of this.bits) { let v = b; while (v) { n += v & 1; v >>= 1; } }
    return n / (this.cols * this.rows);
  }
  clear() { this.bits.fill(0); this.ctx.clearRect(0, 0, this.cols, this.rows); }

  // Serialización: "COLSxROWS:" + base64( RLE de ceros: 0x00,n = n bytes a cero ).
  serialize() {
    const out = [];
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i] === 0) {
        let n = 1;
        while (n < 255 && i + n < this.bits.length && this.bits[i + n] === 0) n++;
        out.push(0, n); i += n - 1;
      } else out.push(this.bits[i]);
    }
    let s = '';
    for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode.apply(null, out.slice(i, i + 8192));
    return `${this.cols}x${this.rows}:${btoa(s)}`;
  }
  /** Devuelve false si los datos no encajan con esta rejilla (otra proporción de mapa). */
  load(str) {
    this.clear();
    if (!str) return true;
    const sep = str.indexOf(':');
    if (str.slice(0, sep) !== `${this.cols}x${this.rows}`) return false;
    const raw = atob(str.slice(sep + 1));
    let o = 0;
    for (let i = 0; i < raw.length && o < this.bits.length; i++) {
      const b = raw.charCodeAt(i);
      if (b === 0) o += raw.charCodeAt(++i); else this.bits[o++] = b;
    }
    for (let i = 0; i < this.cols * this.rows; i++) {
      if ((this.bits[i >> 3] >> (i & 7)) & 1) this.ctx.fillRect(i % this.cols, (i / this.cols) | 0, 1, 1);
    }
    return true;
  }
}
