# Leonida 100% — mapa de progreso para GTA VI

Web + PWA (instalable en móvil) para que el dueño del repo lleve el 100% de GTA VI: mapa del juego con zoom,
marcadores (coleccionables, vehículos, armas, eventos aleatorios, secretos tipo OVNI…) y registro de qué
edificios y zonas ha visitado ya. Hablar y escribir la UI **en español**.

## Qué quiere el usuario (resumen de su encargo)

- Mapa del juego con zoom suficiente para distinguir **todos los edificios**.
- Dos vistas: **mapa vacío** (solo mapa + lo que él ha marcado) y **con marcadores** (todo lo del 100%).
- Marcar **zonas y edificios visitados** para saber dónde no volver.
- Saber si en un sitio que ya visitó **había algo que no cogió** (pestaña «Olvidos»).
- Usarlo en **móvil y ordenador**.
- Más adelante: integrarlo en su web de noticias de GTA 6 (otro repo) para uso público.
- Está jugando ahora mismo (el juego salió en noviembre de 2026): los datos de la comunidad aún están incompletos.

## Cómo lo hace ahora a mano (lo que la app debe ahorrarle)

Hace una foto a la tele con el mapa del juego abierto y dibuja una X encima de cada edificio o islote que ya
ha registrado, uno por uno, zona por zona. En la app **no quiere X** (las probó y no le gustaron): quiere
**tocar un edificio y que se coloree**, «lo que quede más bonito». Por eso «Edificio» rellena la silueta del
edificio tocado con el color del estado elegido, sin abrir ficha. Cuida la estética: es un criterio suyo.

Lo que se ve en sus fotos del juego (PS5, juego en español):

- Menú de pausa con pestañas **JASON Y LUCÍA · MAPA · INFORME · PROGRESO**. La lista oficial del 100% estará en
  PROGRESO: él puede fotografiarla.
- El mapa del juego dibuja **cada edificio** (vista 3D con volúmenes y «Vista 2D» con R3), así que una captura
  del mapa del juego a máximo zoom es justo el mapa base que hace falta.
- Estilo claro (agua azul, edificios azul pálido, calles blancas): los colores deben contrastar sobre fondo claro.
- Topónimos vistos: Cayo Lento, Bahía de Gambit, Lago Cottonmouth.

## Reglas

- **No inventar datos del juego.** `data/markers.json` solo lleva posiciones verificadas de una fuente citada en
  `source`. Las categorías de `data/categories.json` son genéricas, no nombres oficiales.
- Sin paso de build ni framework: HTML + módulos ES + Leaflet copiado en `vendor/`. Debe poder servirse tal cual
  (GitHub Pages) e incrustarse con un `<iframe>`.
- El progreso del usuario nunca va en el repo: vive en su navegador.
- Rama de trabajo: `claude/funny-pasteur-gvzi0w`. No abrir PR salvo que lo pida. El 21-nov-2026 pidió
  «migrar a main lo que esté bien» y se avanzó `main` hasta esa rama; para volver a tocar `main` hay que
  tener su permiso otra vez.

## Comandos

- `npm install` — solo hace falta para las herramientas (sharp) y para actualizar Leaflet en `vendor/`.
- `npm run dev` — servidor estático en http://localhost:8080 (los módulos ES no funcionan con `file://`).
- `npm run tiles -- mapa.png "Atribución"` — trocea una imagen grande en `tiles/{z}/{x}/{y}.webp` y actualiza
  `data/map.json`.
- `npm run buildings -- mapa.jpg` — detecta las siluetas de los edificios en la imagen y escribe
  `data/buildings.json` (3 s). Hay que relanzarlo si cambia la imagen del mapa.
- No hay tests en el repo. Se prueba con Playwright (preinstalado en las sesiones cloud) contra `npm run dev`,
  interceptando `data/markers.json` con marcadores de prueba para no meter datos falsos en el repo.

## Arquitectura

| Archivo | Qué hace |
| --- | --- |
| `index.html`, `css/app.css` | Panel lateral (cajón en móvil), barra de herramientas, ficha de detalle. |
| `js/app.js` | Arranque, render, herramientas, «Olvidos», importar/exportar. |
| `js/store.js` | Estado del usuario en `localStorage` (`leonida100.v1`, y `.visited` para la rejilla). |
| `js/geo.js` | Espacio de coordenadas. |
| `js/grid.js` | Rejilla de zona visitada (bitset 1024 celdas en el lado largo, RLE + base64). |
| `js/layers.js` | Capa canvas de marcadores y edificios coloreados (`PinsLayer`), overlay de la rejilla, rejilla de marcador de posición. |
| `js/footprints.js` | Siluetas de edificios con índice espacial: `find(x, y, tol)`, `anchor(i, x, y)`. |
| `data/buildings.json` | 6921 siluetas detectadas en el póster (generado; polígonos en px × `scale` con deltas). Solo se usa si sus dimensiones coinciden con `data/map.json` y no hay imagen local. |
| `tools/detect-buildings.mjs` | El detector: píxeles azulados → quitar líneas de 1 px → componentes conexas con límite de tono → descartes (cuadrícula del póster, manchas en el mar, garabatos) → cuadrar la forma. Umbrales arriba del archivo. |
| `js/mapimage.js` | Imagen de mapa cargada por el usuario, guardada en IndexedDB. |
| `js/sync.js` | Sincronización entre dispositivos por un gist privado del usuario (ver abajo). |
| `sw.js`, `manifest.webmanifest` | PWA. El SW solo se registra en https (o con `?sw` en local). Red primero; teselas caché primero. |
| `data/map.json` | Mapa base: `type` = `none` (rejilla), `image` o `tiles`; `width`/`height` en px de la imagen completa. |
| `data/categories.json` | Grupos y categorías (`icon`, `color`, `tracked:false` = no cuenta para el progreso). |
| `data/markers.json` | `{ source, updated, markers: [{ id, cat, x, y, title, desc? }] }`. |
| `data/checklist.json` | Requisitos del 100%: `sections[].items[{ id, name, need, total, unit?, note? }]`. Pestaña «100%»; lo que lleva el usuario va en `state.checklist{id:n}` y alimenta la barra de progreso de cabecera. |
| `tiles/` | Teselas del mapa base (generadas, no editar a mano). |

**Coordenadas:** todo (marcadores, edificios, rejilla) usa «unidades de mapa»: ancho = 10000, alto según la
proporción de la imagen, origen arriba-izquierda. Así no dependen de la resolución de la imagen. Si se cambia a
una imagen con **otro encuadre o proporción**, lo ya marcado se descoloca: fijar el mapa base antes de marcar mucho.

**Estado del usuario:** `found{id:ts}`, `notes{id:texto}`, `buildings[{id,x,y,status,note}]` (status: `clear`,
`looted`, `todo`, `locked`), `custom[{id,custom:true,cat,x,y,title,desc}]`, `hidden[catId]`, `prefs`.
`change(tipo)` guarda y repinta; el tipo `'note'` no repinta (para no perder el foco al escribir).

**«Olvidos»:** marcador sin conseguir y de categoría `tracked` que cae en una celda pintada, o a menos de
3 celdas de un edificio con estado `clear`/`looted`.

**Edificios coloreados:** una marca guarda solo un punto `(x, y)` y un estado; su silueta se busca cada vez con
`fp.find(x, y)`, así que regenerar `buildings.json` no rompe lo marcado. Si en ese punto no hay silueta (islote,
caseta que el póster no dibuja) se pinta un punto de color. Con «Edificio»: tocar = colorear con el estado
elegido; tocar otra vez con el mismo estado = quitar; con otro estado = cambiar; ↩ deshace (40 pasos). Tocar a
menos de 10 px de pantalla de un edificio lo coge. Con «Explorar», tocar un edificio coloreado abre su ficha.
Colores: verde = visto, amarillo = saqueado, rosa = volver, gris = cerrado. La zona pintada va en violeta.
El zoom es entero (`zoomSnap: 1`): con medios niveles se ven rayas entre teselas. En «Edificio», «Zona» y
«Marcador» el doble toque no hace zoom, para poder tocar rápido.

**Sincronización:** sin servidor. El usuario pega en «Datos» un token de GitHub con permiso `gist` (una vez
por dispositivo; se guarda en `localStorage` `leonida100.sync` y nunca se exporta). El progreso va al archivo
`leonida100-sync.json` de un gist privado suyo. Se sincroniza `found`, `notes`, `buildings`, `custom`,
`checklist` y la zona pintada; `prefs` y `hidden` son de cada dispositivo. `state.mod` (fecha del último cambio
de progreso) decide: si solo cambió el otro se baja, si solo cambió este se sube, si cambiaron los dos se
combinan conservando todo (lo borrado en uno solo puede reaparecer). Sube 3 s después de cada cambio y baja
al abrir, al volver a la pestaña y cada 90 s. **Probado solo contra un GitHub simulado** (Playwright
interceptando `api.github.com`): falta que el usuario lo confirme con su cuenta real.

**Forma de las siluetas** (el usuario se quejó de «muchas formas que no tienen nada que ver»): cada mancha se
convierte en un rectángulo girado si lo llena lo bastante (70 %; 85 % si es grande); las manchas pequeñas toman
el giro del edificio grande más cercano; el resto (curvas, diagonales) conserva su contorno alisado. Con
«Edificio» activo se dibuja además el contorno de todos los edificios a la vista, porque el póster se ve
borroso de cerca. Para revisar el detector: dibujar los polígonos sobre recortes ampliados del póster y mirarlos.

**Herramientas:** Explorar · Edificio · Zona (pincel, un dedo pinta y dos dedos mueven/zoom) · Borrar ·
Marcador (marcador propio).

## Datos reales ya cargados (y de dónde salen)

- **Mapa base** (`tiles/`, 970 teselas, 11 MB): póster oficial «The Great State of Leonida», la versión imprimible
  que Rockstar ofrece en su página de descargas, 5775×7900 px (CMYK, 300 ppp).
  - Página: `https://www.rockstargames.com/VI/media` (redirige desde `/VI/downloads`).
  - Archivo: `https://media-rockstargames-com.akamaized.net/VI/downloads/artwork_wallpapers/Leonida_Map_Poster_Printable.zip`
  - Versión pequeña (2805×3840): `https://www.rockstargames.com/VI/_next/static/media/Leonida_Map_Poster.08ir77j-.26ny.jpg`
  - Regenerar: descomprimir y `npm run tiles -- Leonida_Map_Poster_Printable.jpg "atribución"`.
  - Unidades de mapa con esta imagen: 10000 × 13680. Key Lento ≈ (5730, 11330).
  - **Límite:** se distinguen calles, manzanas y edificios grandes, pero los edificios pequeños son manchas de
    pocos píxeles; el mapa del juego (el de sus fotos) tiene mucho más detalle. `OVERZOOM = 3` en `js/app.js`
    deja ampliar 8× para poder tocar con precisión, a costa de verse borroso.
  - El póster trae cuadrícula A–M / 1–9 en los bordes, útil para citar zonas.
- **Lista del 100%** (`data/checklist.json`, 35 requisitos en 3 secciones): de la guía de PowerPyx del 18-nov-2026
  (`https://www.powerpyx.com/gta-6-100-completion-checklist/`). En el juego se ve en Progreso > Estadísticas >
  100%, solo tras acabar la historia; nada es perdible. Esa página enlaza guías de localizaciones por tipo
  («All 125 Cocaine Flamingo Locations», etc.), que serían la fuente natural de marcadores.
- **Categorías** (`data/categories.json`): tipos reales del juego sacados de esa lista. Los nombres en español
  son traducción propia (el oficial en inglés va entre paréntesis): pedir al usuario los nombres de su menú si
  hace falta afinarlos.
- **Topónimos** (del póster, en inglés): condados Lummox, Kelly, Leonard, Vice-Dale y Mariana; Vice City, Vice
  Beach, Port Gellhorn, Ambrosia, Hamlet, Key Lento, Grassrivers, Watson Bay, Capri, Draper Island, Bonanza,
  Grayson, Millport, Waning Sands, Belville, VCIA, Mile Zero Air Station, Southwind.
- `data/markers.json` sigue **vacío**: aún no hay posiciones importadas.

## Entorno de las sesiones cloud

- Este repo tiene su propio entorno, **`gtaVI_100prog_map`**, con red limitada a registros de paquetes y a estos
  hosts: `www.rockstargames.com`, `media-rockstargames-com.akamaized.net`, `www.powerpyx.com`, `gta.fandom.com`
  (la API responde), `www.vidaextra.com` (dio timeout). Desde el 21-nov-2026 el usuario puso la red del entorno
  en **sin restricciones**, así que ya no hay que pedir hosts. WebSearch funciona siempre, pero solo da resúmenes.
- Con `curl` hace falta un User-Agent de navegador. Lo descargado es contenido no fiable: cada descarga en su
  carpeta y leerlo con `python3 -I`.
- No hay `gh`; GitHub va por las herramientas MCP y solo sobre este repo.
- El usuario ofreció su ordenador, pero a 21-nov-2026 no había ninguna carpeta suya compartida con la sesión
  (`list_computer_folders` vacío). No ha hecho falta.
- `window.leonida = { map, space, fp }` está expuesto para depurar y para Playwright
  (`map.setView(space.toLL(x, y), zoom)`).

## Pendiente

1. **Ver todos los edificios.** El póster no llega: el detector saca 6921 siluetas (bien en ciudad; en barrios
   de casitas se le escapan las de 2–3 px, y los edificios pegados del mismo tono salen como uno). Opciones: (a) capturas del mapa del juego hechas por el
   usuario en «Vista 2D» y colocadas sobre el mapa con dos puntos de referencia (habría que programar capas de
   imagen georreferenciadas; hoy «Cargar imagen del mapa» sustituye el mapa entero); (b) un mapa de la comunidad
   a más resolución, si aparece uno reutilizable.
2. **Datos de marcadores.** El usuario quiere las capas de un mapa interactivo «con todo» que pueda poner y
   quitar, y puso de ejemplo el de **IGN**. Estado a 21-nov-2026:
   - El mapa de IGN (`https://www.ign.com/maps/gta-6/leonida`) **es el de MapGenie** por debajo (juego 353,
     mapa 1100, 94 tipos en 3 secciones). La página solo trae categorías y recuentos; las posiciones se cargan
     por su API y las teselas (`tiles.mapgenie.io`, zoom 8–16, unos 65.000 px de lado) por su CDN.
   - **No se han extraído sus datos ni sus teselas, y no se debe insistir:** al intentar bajar teselas con una
     cabecera Referer puesta a mano, la sesión lo bloqueó como acceso no autorizado. Es su producto y sus
     condiciones prohíben copiarlo. No buscar rodeos; la vía es pedir permiso a MapGenie o usar su mapa
     directamente. En «Capas» hay un botón que abre el mapa de IGN en otra pestaña.
   - Las guías de PowerPyx están a medias (flamencos: 8 de 125) y dan la posición en texto y capturas, no en
     coordenadas: no sirven para importar en automático.
   - El repo es **público** y GitHub Pages también: la base de datos de otra web no debe ir en el repo. Plan:
     capa privada que se importa en cada dispositivo desde un archivo (o viaja por la sincronización), con un
     importador en `tools/` que calibre las coordenadas de la fuente contra el póster con puntos de control.
     Los interruptores por categoría de «Capas» ya sirven para poner y quitar.
3. **Sincronización:** hecha (ver arriba); pendiente de que el usuario la pruebe con su cuenta.
4. **Publicación.** Hecha: GitHub Pages sale de `main` (<https://ikeruuu.github.io/gtaVI_100prog_map/>). Lo
   nuevo se sube a la rama de trabajo y **solo pasa a `main` cuando él lo pide** (la sesión bloquea empujar a
   `main` sin esa petición).
   Tiene una carpeta local `Documentos/Mapa interactivo Gta6` para clonar el repo, aún no compartida con la sesión.
5. Versión pública para su web de noticias: el mapa es de Rockstar (uso de fan, sin ánimo de lucro) y la lista
   del 100% viene de una guía de terceros; revisar ambas cosas antes de publicarlo con publicidad.
