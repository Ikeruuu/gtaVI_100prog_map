# Leonida 100% — cómo seguir este proyecto en otro chat

Documento de relevo escrito el 24-nov-2026. Sirve para retomar el trabajo con el Claude conversacional
(claude.ai) o con cualquier otra sesión. **Sube este archivo al chat nuevo** (o pega su contenido) junto con el
mensaje de arranque del final.

## Qué es

Una web que se instala en el móvil como app para llevar el 100% de GTA VI: mapa del juego con zoom, capas de
localizaciones que se ponen y quitan, edificios que se colorean al tocarlos para saber cuáles ya he registrado,
lista de los 35 requisitos del 100%, aviso de «Olvidos» y progreso sincronizado entre móvil y ordenador.

- **Web publicada:** <https://ikeruuu.github.io/gtaVI_100prog_map/>
- **Código:** <https://github.com/Ikeruuu/gtaVI_100prog_map> (repositorio público, rama `main`)
- **Documento técnico completo:** `CLAUDE.md` en el repositorio. Si el chat nuevo necesita detalle, súbele
  también ese archivo.

## Estado actual: qué funciona

Todo esto está publicado en la web:

1. **Mapa:** el de MapGenie (el mismo que usa IGN), plano y nítido hasta el máximo zoom. Se carga en vivo desde
   sus servidores, así que hace falta conexión.
2. **2.532 localizaciones** en 81 capas (robos, cajas fuertes, vehículos destacados, acrobacias, cartas,
   revistas, operaciones ilegales, canastas…). Se marcan como conseguidas y se buscan por nombre. Las de
   servicios (cajeros, tiendas, bares, autobuses) empiezan ocultas. Cada ficha enlaza a MapGenie para ver fotos
   y detalles.
3. **Edificios:** 8.081 siluetas detectadas sobre el mapa. Con la herramienta «Edificio», tocar uno lo colorea:
   verde = visto, amarillo = saqueado, rosa = volver, gris = cerrado. Tocar otra vez lo quita; ↩ deshace.
4. **Zonas:** pincel para pintar áreas visitadas (en violeta).
5. **Pestaña «100%»:** los 35 requisitos del juego con sus cifras; se apunta a mano lo que llevo.
6. **Pestaña «Olvidos»:** localizaciones sin conseguir que están junto a un edificio que di por visto o dentro
   de una zona pintada.
7. **Sincronización:** con un token de GitHub (permiso `gist`) pegado en «Datos» en cada dispositivo, el
   progreso se guarda en un gist privado de mi cuenta y pasa solo del móvil al ordenador.
8. **Marcadores propios:** herramienta «Marcador» para añadir lo que encuentre yo.

## Dónde está guardado cada cosa

| Qué | Dónde |
| --- | --- |
| El código y los datos del mapa | GitHub, rama `main` |
| Mi progreso (edificios, conseguidos, zonas) | En el navegador de cada dispositivo, y en mi gist privado `leonida100-sync.json` |
| Copia de seguridad manual del progreso | «Datos» → «Exportar» descarga un archivo; «Importar» lo recupera |
| El contexto del proyecto | Este archivo y `CLAUDE.md` |

**Consejo antes de cambiar nada:** pulsa «Exportar» en la web y guarda ese archivo. Es la copia de tu progreso.

## Lo que queda por hacer (ideas, ninguna urgente)

1. **Contar solo la pestaña «100%»:** que se rellene con lo que marco como conseguido en el mapa, en vez de a mano.
2. **Nombres de las capas en español** (ahora están en inglés, como en MapGenie).
3. **Eventos aleatorios y secretos tipo OVNI:** MapGenie aún no los tiene. Se pueden añadir con «Marcador», o
   volver a importar sus datos cuando los amplíen.
4. **Mapa sin conexión:** hoy no se ve el mapa sin internet.
5. **Ponerlo en mi web de noticias de GTA 6** (otro repositorio): se puede incrustar con un `<iframe>`.

## Cosas que hay que saber

- **Permiso de MapGenie:** su autor es un conocido mío y me dio permiso de palabra para usar el mapa y las
  localizaciones, también a la vista del público. De cada localización solo se copia posición, categoría y
  nombre; no sus descripciones ni fotos. Si cambiara de opinión, el repositorio guarda de reserva el póster
  oficial de Rockstar (`tiles/`, `data/map-poster.json`, `data/buildings-poster.json`).
- **Preferencias mías:** quiero el mapa limpio y de colores planos; no me gustan las X para marcar, prefiero
  que el edificio se coloree; cuida que quede bonito. Explícame los pasos de GitHub uno a uno.
- **Cómo está hecho:** web estática sin instalación ni compilación (HTML, JavaScript y Leaflet). GitHub Pages
  publica lo que haya en `main`, y tarda un par de minutos en actualizar.
- **Archivos principales:** `index.html`, `css/app.css`, `js/app.js` (lógica), `js/layers.js` (dibujo),
  `js/store.js` (progreso), `js/sync.js` (sincronización), `data/markers.json` (localizaciones),
  `data/categories.json` (capas), `data/buildings.json` (siluetas), `data/checklist.json` (lista del 100%),
  `data/map.json` (mapa base).

## Cómo seguir según con qué trabaje

- **Con el Claude conversacional (claude.ai):** no puede ejecutar el proyecto ni subir cambios a GitHub por su
  cuenta. Puede explicarme cosas, diseñar mejoras y escribir el código; yo lo pego en GitHub desde la web
  (abrir el archivo → lápiz «Edit» → pegar → «Commit changes»). Para cambios pequeños va bien; para cambios
  grandes en varios archivos es incómodo. Si le pido cambiar un archivo, tengo que subírselo antes para que vea
  cómo está ahora.
- **Con Claude Code** (si mi plan lo permite): abrir una sesión sobre este repositorio; lee `CLAUDE.md` solo y
  continúa donde se quedó.

## Mensaje de arranque para el chat nuevo

> Te adjunto CONTINUAR.md, el relevo de un proyecto mío: una web para llevar el 100% de GTA VI. El código está
> en https://github.com/Ikeruuu/gtaVI_100prog_map y la web en https://ikeruuu.github.io/gtaVI_100prog_map/.
> Léelo entero antes de contestar. No puedes ejecutar ni subir código: cuando haya que cambiar algo, dime qué
> archivo necesitas que te suba, dame el archivo completo ya modificado y explícame paso a paso cómo pegarlo en
> GitHub. Háblame en español y sin tecnicismos. Lo primero que quiero hacer es: [escribe aquí lo que quieras].
