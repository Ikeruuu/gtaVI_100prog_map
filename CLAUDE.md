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

Hace una foto a la tele con el mapa del juego abierto y dibuja una **X negra encima de cada edificio o islote**
que ya ha registrado, uno por uno, zona por zona. Por eso «Edificio» es un sello rápido: un toque = una marca,
sin abrir ficha; el estado se elige en la barra de encima y tocar una marca existente abre su ficha.

Lo que se ve en sus fotos del juego (PS5, juego en español):

- Menú de pausa con pestañas **JASON Y LUCÍA · MAPA · INFORME · PROGRESO**. La lista oficial del 100% estará en
  PROGRESO: él puede fotografiarla.
- El mapa del juego dibuja **cada edificio** (vista 3D con volúmenes y «Vista 2D» con R3), así que una captura
  del mapa del juego a máximo zoom es justo el mapa base que hace falta.
- Estilo claro (agua azul, edificios azul pálido, calles blancas): las marcas deben contrastar sobre fondo claro
  (por eso llevan halo blanco).
- Topónimos vistos: Cayo Lento, Bahía de Gambit, Lago Cottonmouth.

## Reglas

- **No inventar datos del juego.** `data/markers.json` solo lleva posiciones verificadas de una fuente citada en
  `source`. Las categorías de `data/categories.json` son genéricas, no nombres oficiales.
- Sin paso de build ni framework: HTML + módulos ES + Leaflet copiado en `vendor/`. Debe poder servirse tal cual
  (GitHub Pages) e incrustarse con un `<iframe>`.
- El progreso del usuario nunca va en el repo: vive en su navegador.
- Rama de trabajo: `claude/funny-pasteur-gvzi0w`. No abrir PR salvo que lo pida.

## Comandos

- `npm install` — solo hace falta para las herramientas (sharp) y para actualizar Leaflet en `vendor/`.
- `npm run dev` — servidor estático en http://localhost:8080 (los módulos ES no funcionan con `file://`).
- `npm run tiles -- mapa.png "Atribución"` — trocea una imagen grande en `tiles/{z}/{x}/{y}.webp` y actualiza
  `data/map.json`.
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
| `js/layers.js` | Capa canvas de marcadores (`PinsLayer`), overlay de la rejilla, rejilla de marcador de posición. |
| `js/mapimage.js` | Imagen de mapa cargada por el usuario, guardada en IndexedDB. |
| `sw.js`, `manifest.webmanifest` | PWA. El SW solo se registra en https (o con `?sw` en local). Red primero; teselas caché primero. |
| `data/map.json` | Mapa base: `type` = `none` (rejilla), `image` o `tiles`; `width`/`height` en px de la imagen completa. |
| `data/categories.json` | Grupos y categorías (`icon`, `color`, `tracked:false` = no cuenta para el progreso). |
| `data/markers.json` | `{ source, updated, markers: [{ id, cat, x, y, title, desc? }] }`. |

**Coordenadas:** todo (marcadores, edificios, rejilla) usa «unidades de mapa»: ancho = 10000, alto según la
proporción de la imagen, origen arriba-izquierda. Así no dependen de la resolución de la imagen. Si se cambia a
una imagen con **otro encuadre o proporción**, lo ya marcado se descoloca: fijar el mapa base antes de marcar mucho.

**Estado del usuario:** `found{id:ts}`, `notes{id:texto}`, `buildings[{id,x,y,status,note}]` (status: `clear`,
`looted`, `todo`, `locked`), `custom[{id,custom:true,cat,x,y,title,desc}]`, `hidden[catId]`, `prefs`.
`change(tipo)` guarda y repinta; el tipo `'note'` no repinta (para no perder el foco al escribir).

**«Olvidos»:** marcador sin conseguir y de categoría `tracked` que cae en una celda pintada, o a menos de
3 celdas de un edificio con estado `clear`/`looted`.

**Herramientas:** Explorar · Edificio (sello rápido: X negra = visto, X verde = saqueado, aro naranja = volver,
raya gris = cerrado) · Zona (pincel, un dedo pinta y dos dedos mueven/zoom) · Borrar · Marcador (marcador propio).

## Entorno de las sesiones cloud

- La red es limitada: solo registros de paquetes. `curl` y WebFetch a webs de mapas/guías devuelven 403 /
  `ENOTFOUND` salvo que el host esté en la lista del entorno. WebSearch sí funciona (solo resúmenes).
- No hay `gh`; GitHub va por las herramientas MCP y solo sobre este repo.

## Pendiente

1. **Mapa base real.** Falta la imagen del mapa completo en alta resolución (decide cuánto se ven los edificios).
   Mientras tanto el usuario puede cargar una imagen propia desde «Datos» (se queda en su dispositivo).
2. **Datos de marcadores.** Sin fuente decidida. Copiar entera la base de datos de otra web de mapas (p. ej.
   MapGenie) choca con sus condiciones, sobre todo si luego se publica; preferir fuentes reutilizables (wiki con
   licencia CC BY-SA, citando) y lo que añada el propio usuario. Falta un importador `tools/` con calibración
   (puntos de control) si la fuente usa otro sistema de coordenadas.
3. **Lista oficial de requisitos del 100%** del juego, para una pestaña de checklist (no solo marcadores).
4. **Sincronización móvil ↔ ordenador.** Ahora es exportar/importar un archivo. Sincronizar de verdad necesita
   un backend (decisión del usuario).
5. **Publicación.** GitHub Pages desde la raíz sirve tal cual; lo activa el usuario en los ajustes del repo.
6. Versión pública para su web de noticias: revisar derechos del mapa (es de Rockstar) y de los datos antes.
