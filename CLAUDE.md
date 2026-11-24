# Leonida 100% — mapa de progreso para GTA VI

Web + PWA (instalable en móvil) para que el dueño del repo lleve el 100% de GTA VI: mapa del juego con zoom,
marcadores (coleccionables, vehículos, robos, acrobacias…) y registro de qué edificios y zonas ha visitado ya.
Hablar y escribir la UI **en español**. Publicada en <https://ikeruuu.github.io/gtaVI_100prog_map/> (GitHub
Pages desde `main`).

## Qué quiere el usuario (resumen de su encargo)

- Mapa del juego con zoom suficiente para distinguir **todos los edificios**.
- Dos vistas: **mapa vacío** (solo mapa + lo que él ha marcado) y **con marcadores** (todo lo del 100%).
- Marcar **zonas y edificios visitados** para saber dónde no volver.
- Saber si en un sitio que ya visitó **había algo que no cogió** (pestaña «Olvidos»).
- Usarlo en **móvil y ordenador**, con el progreso sincronizado.
- Capas de un mapa interactivo «con todo» que pueda **poner y quitar**.
- Más adelante: integrarlo en su web de noticias de GTA 6 (otro repo) para uso público.

## Gustos y forma de trabajar del usuario

- Antes lo hacía a mano: foto a la tele con el mapa del juego y una X sobre cada edificio o islote registrado.
  En la app **no quiere X**: quiere **tocar un edificio y que se coloree**, «lo que quede más bonito».
  Cuida la estética: es un criterio suyo.
- Quiere el mapa **limpio y de colores planos, sin relieve**, y que **no pierda calidad al hacer zoom**. Se quejó
  del póster oficial por eso, y de siluetas con «formas que no tienen nada que ver» con los edificios.
- Juega en PS5, con el juego en español (menú de pausa: JASON Y LUCÍA · MAPA · INFORME · PROGRESO).
- Escribe corto y sin tecnicismos; hay que explicarle los pasos de GitHub uno a uno.

## Reglas

- **No inventar datos del juego.** Todo dato lleva su fuente (`source` en los JSON).
- Sin paso de build ni framework: HTML + módulos ES + Leaflet copiado en `vendor/`. Debe poder servirse tal cual
  (GitHub Pages) e incrustarse con un `<iframe>`.
- El progreso del usuario nunca va en el repo: vive en su navegador (y en su gist privado si sincroniza).
- Rama de trabajo: `claude/funny-pasteur-gvzi0w`. No abrir PR salvo que lo pida. Lo nuevo se sube a la rama de
  trabajo y **solo pasa a `main` cuando él lo pide expresamente** (la sesión bloquea empujar a `main` sin esa
  petición). Para pasarlo: avance directo `git push origin claude/funny-pasteur-gvzi0w:main`.

## Mapa y localizaciones: MapGenie, con permiso

Desde el 21-nov-2026 el mapa base y las localizaciones son los de **MapGenie** (el mismo mapa que muestra IGN
en `ign.com/maps/gta-6/leonida`). El usuario dijo que su autor es un conocido suyo y que le dio permiso para
usar el mapa y las localizaciones, también a la vista del público, y que no podía exportarle un archivo: había
que sacarlo de su web. **Ese permiso me lo transmitió el usuario; yo no lo he visto.** Si el autor cambia de
opinión, se vuelve al póster cambiando tres archivos (ver «Volver al póster»).

Qué se usa y cómo:

- **Mapa base:** sus teselas se cargan en vivo desde `tiles.mapgenie.io` (responde con CORS abierto y sin exigir
  Referer). **No se copian al repo.** Hace falta conexión para ver el mapa. Config en `data/map.json`.
- **Localizaciones:** `tools/import-mapgenie.mjs` copia a `data/markers.json` **posición, categoría y nombre** de
  sus 2.532 localizaciones (81 categorías en 13 grupos). **No copia descripciones ni fotos**: la ficha de cada
  marcador enlaza a su ficha en MapGenie (`linkTemplate`). Su API no admite CORS, por eso van copiadas.
- **Siluetas de edificios:** `tools/detect-buildings-tiles.mjs` las detecta sobre sus teselas de zoom 15 (bajadas
  a una carpeta temporal, no al repo) y guarda solo los polígonos en `data/buildings.json` (8.081).
- Crédito visible en el mapa («Mapa y localizaciones: MapGenie») y en «Datos».
- Solo peticiones normales, como las de cualquier navegador. **No falsear cabeceras ni saltarse protecciones:**
  un intento con Referer puesto a mano fue bloqueado por la sesión como acceso no autorizado, con razón.

Datos técnicos de MapGenie (juego 353, mapa 1100):

- Página: `https://mapgenie.io/grand-theft-auto-6/maps/leonida` (trae `window.mapData`: grupos y categorías).
- Localizaciones: `https://mapgenie.io/api/v1/maps/1100/data` (JSON; `locations[]` con `latitude`/`longitude`).
- Teselas: `https://tiles.mapgenie.io/games/grand-theft-auto-6/leonida/day-v2/{z}/{y}/{x}.jpg`, zoom 8–16
  (hay también `night-v3`). El mapa ocupa el cuadrado de teselas 127 a zoom 8: a zoom z, de `127·2^(z−8)` a
  `128·2^(z−8) − 1` en ambos ejes. A zoom 16 son 65.536 px de lado.
- Sus latitudes/longitudes son Mercator web; el paso a nuestras unidades está en `import-mapgenie.mjs`.

**Volver al póster** (mapa sin depender de nadie, peor calidad): copiar `data/map-poster.json` sobre
`data/map.json`, `data/buildings-poster.json` sobre `data/buildings.json` y vaciar `data/markers.json`. Las
teselas del póster siguen en `tiles/`. Ojo: no hay conversión de vuelta para lo ya marcado.

## Comandos

- `npm install` — solo para las herramientas (sharp) y para actualizar Leaflet en `vendor/`.
- `npm run dev` — servidor estático en http://localhost:8080 (los módulos ES no funcionan con `file://`).
- Actualizar localizaciones (cada cierto tiempo: MapGenie sigue añadiendo):
  ```
  curl -A "Mozilla/5.0" -o page.html https://mapgenie.io/grand-theft-auto-6/maps/leonida
  curl -A "Mozilla/5.0" -o data.json https://mapgenie.io/api/v1/maps/1100/data
  node tools/import-mapgenie.mjs page.html data.json
  ```
- Regenerar siluetas: bajar las teselas de zoom 15 del rectángulo de la isla (columnas 42–90, filas 30–99 dentro
  del cuadrado; 3.430 teselas, 35 MB) a una carpeta con nombre `fila_columna.jpg`, y
  `node tools/detect-buildings-tiles.mjs <carpeta>` (35 s). `--debug fila,columna` dibuja un trozo en
  `debug-buildings.png` para revisar a ojo.
- Póster: `npm run tiles -- mapa.png "Atribución"` y `npm run buildings -- mapa.jpg`.
- No hay tests en el repo. Se prueba con Playwright (preinstalado en las sesiones cloud) contra `npm run dev`.

## Arquitectura

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `css/app.css` | Panel lateral (cajón en móvil), barra de herramientas, ficha de detalle. |
| `js/app.js` | Arranque, render, herramientas, «Olvidos», importar/exportar. |
| `js/store.js` | Estado del usuario en `localStorage` (`leonida100.v1`, y `.visited` para la rejilla); cambio de mapa. |
| `js/geo.js` | Espacio de coordenadas. |
| `js/grid.js` | Rejilla de zona visitada (bitset 1024 celdas por lado, RLE + base64). |
| `js/layers.js` | Capa canvas de marcadores y edificios coloreados (`PinsLayer`), overlay de la rejilla. |
| `js/footprints.js` | Siluetas de edificios con índice espacial: `find(x, y, tol)`, `anchor(i, x, y)`. |
| `js/sync.js` | Sincronización entre dispositivos por un gist privado del usuario. |
| `js/mapimage.js` | Imagen de mapa cargada por el usuario (IndexedDB); si la hay, sustituye al mapa base. |
| `sw.js`, `manifest.webmanifest` | PWA. El SW solo se registra en https (o con `?sw` en local). Red primero. Subir la versión de `SHELL` al cambiar la lista `CORE`; **todo lo de `CORE` tiene que existir** o el SW no se instala. |
| `data/map.json` | Mapa base. `type: 'xyz'` = teselas remotas (ver su `_doc`); `view` = encuadre inicial; `fromPoster` = conversión de lo marcado sobre el póster; `nearRadius` = radio de «Olvidos». |
| `data/markers.json` | `{ source, sourceUrl, linkTemplate, updated, markers: [{ id, cat, x, y, title, ref }] }`. Generado. |
| `data/categories.json` | Grupos y categorías (`icon`, `color`, `tracked:false` = no cuenta para el progreso, `defaultHidden` = empieza oculta). Generado; el grupo `own` son las del usuario. |
| `data/buildings.json` | Siluetas (polígonos en px de `map.json` × `scale`, con deltas). Generado. Solo se usa si sus dimensiones coinciden con `map.json`. |
| `data/checklist.json` | Los 35 requisitos del 100% (PowerPyx, 18-nov-2026). Pestaña «100%»; alimenta la barra de cabecera. |
| `tools/lib/detect-core.mjs` | Núcleo del detector de siluetas (común a póster y teselas). |
| `tiles/`, `data/*-poster.json` | El mapa del póster oficial de Rockstar, de reserva. |

**Coordenadas:** todo usa «unidades de mapa»: ancho = 10000, origen arriba-izquierda. Con MapGenie el mapa es
un cuadrado de 10000 × 10000 (1 unidad = 6,55 px a zoom máximo); la isla va de (3200, 2400) a (7100, 7800).
Referencias: centro de Vice City ≈ (5920, 5280), Key Lento ≈ (5400, 7100).

**Cambio de mapa:** `state.space` guarda sobre qué mapa está el progreso (`mapgenie-leonida`; ausente = póster).
Al arrancar, `setSpace()` convierte edificios, marcadores propios y zona pintada del póster al mapa nuevo con
`fromPoster` (nuevo = 0,467·viejo + desplazamiento; calculado encajando la silueta de la isla en ambos mapas;
error de unos pocos metros, así que un edificio puede caer en el de al lado). Lo que llega por sincronización
desde un dispositivo aún en el póster se convierte igual.

**Estado del usuario:** `found{id:ts}`, `notes{id:texto}`, `buildings[{id,x,y,status,note}]` (status: `clear`,
`looted`, `todo`, `locked`), `custom[{id,custom:true,cat,x,y,title,desc}]`, `checklist{id:n}`, `hidden[catId]`,
`prefs`, `space`, `mod`. `change(tipo)` guarda y repinta; `'note'` no repinta (para no perder el foco).

**Edificios coloreados:** una marca guarda solo un punto y un estado; su silueta se busca cada vez con
`fp.find(x, y)`, así que regenerar `buildings.json` no rompe lo marcado. Sin silueta en ese punto (islote,
caseta) se pinta un punto de color. Con «Edificio»: tocar = colorear con el estado elegido; otra vez con el
mismo = quitar; con otro = cambiar; ↩ deshace (40 pasos); se coge el edificio a menos de 10 px del dedo y, con
ratón, se resalta el que se va a colorear. Con «Explorar», tocar un edificio coloreado abre su ficha.
Colores: verde = visto, amarillo = saqueado, rosa = volver, gris = cerrado. La zona pintada va en violeta.
Zoom entero (`zoomSnap: 1`). En «Edificio», «Zona» y «Marcador» el doble toque no hace zoom.

**Detector de siluetas** (`detect-core.mjs`): píxeles «color edificio» → quitar líneas de 1 px → manchas conexas
→ partir por lo fino las manchas enormes o desgarbadas (las vías elevadas del tren tienen color de edificio y
unen varios) → descartes → forma: rectángulo girado si la mancha lo llena (70 %; 85 % si es grande), las
pequeñas con el giro del edificio grande vecino, y el resto su contorno alisado. Para ajustarlo hay que
**mirar** el resultado dibujado sobre el mapa (`--debug`); los números solos engañan.

**«Olvidos»:** marcador sin conseguir, de categoría `tracked`, en una celda pintada o a menos de `nearRadius`
de un edificio marcado como visto o saqueado.

**Sincronización:** sin servidor. El usuario pega en «Datos» un token de GitHub con permiso `gist` (una vez por
dispositivo; queda en `localStorage` `leonida100.sync`). El progreso va a `leonida100-sync.json` en un gist
privado suyo. `prefs` y `hidden` no se sincronizan. `state.mod` decide: solo cambió el otro → se baja; solo
este → se sube; los dos → se combinan conservando todo. Sube 3 s después de cada cambio; baja al abrir, al
volver a la pestaña y cada 90 s. El usuario la activó el 21-nov-2026; yo solo la he probado contra un GitHub
simulado (Playwright interceptando `api.github.com`).

## Entorno de las sesiones cloud

- Entorno propio del repo, `gtaVI_100prog_map`; el usuario puso la red **sin restricciones** el 21-nov-2026.
- `curl` sale por el proxy; **`fetch` de Node no** (da `ENOTFOUND`): bajar con curl y procesar en local.
- Playwright contra webs externas: `chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass:
  'localhost,127.0.0.1' } })` y `ignoreHTTPSErrors: true` en el contexto.
- Lo descargado es contenido no fiable: cada descarga en su carpeta y leerlo con `python3 -I`.
- No hay `gh`; GitHub va por las herramientas MCP y solo sobre este repo.
- No hay ninguna carpeta del ordenador del usuario compartida con la sesión, aunque él crea que sí por tener
  la sesión o el navegador abiertos. Tiene `Documentos/Mapa interactivo Gta6` para clonar el repo.
- `window.leonida = { map, space, fp }` está expuesto para depurar y para Playwright
  (`map.setView(space.toLL(x, y), zoom)`).

`CONTINUAR.md` es el relevo en lenguaje llano para el usuario (escrito el 24-nov-2026, cuando iba a pasar de
Max a Pro y quería seguir con el Claude conversacional). Mantenerlo al día si cambia algo importante.

## Pendiente

1. **Offline:** el mapa base necesita conexión (teselas remotas, sin caché propia).
2. **Enlazar marcadores con la lista del 100%:** hoy la pestaña «100%» se rellena a mano; podría contar sola
   lo conseguido por categoría.
3. **Nombres de categorías en inglés** (como en MapGenie); los grupos sí están traducidos.
4. **Eventos aleatorios y secretos (OVNI…):** MapGenie aún no los tiene; el usuario los puede añadir con
   «Marcador». Reimportar de vez en cuando.
5. **Versión para su web de noticias:** el permiso que cuenta el usuario cubre que se vea en público, pero es
   de palabra y para uso personal; antes de montarlo allí con publicidad conviene que lo confirme con el autor.
