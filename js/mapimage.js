// Imagen de mapa cargada por el usuario desde su dispositivo, guardada en IndexedDB
// (no sale del navegador). Sirve para uso personal mientras no haya teselas alojadas.
const DB = 'leonida100', STORE = 'files', KEYNAME = 'mapimage';

function open() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), rq = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(rq.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}
export const getMapImage = () => tx('readonly', (s) => s.get(KEYNAME));
export const setMapImage = (blob) => tx('readwrite', (s) => s.put(blob, KEYNAME));
export const clearMapImage = () => tx('readwrite', (s) => s.delete(KEYNAME));

export function imageSize(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => rej(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}
