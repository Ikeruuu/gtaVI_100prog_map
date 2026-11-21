# Leonida 100%

Mapa interactivo para llevar el 100% de GTA VI: marcadores por categoría, progreso, edificios y zonas
visitadas, y un aviso de «olvidos» (cosas sin coger en sitios donde ya estuviste). Funciona en el navegador
del ordenador y se instala en el móvil como app (PWA).

## Usarlo

```bash
npm run dev        # http://localhost:8080
```

O publicarlo con GitHub Pages (rama y carpeta raíz): es una web estática, sin build.

## Poner el mapa del juego

- **Rápido, solo para ti:** pestaña «Datos» → «Cargar imagen del mapa…». La imagen se guarda en ese dispositivo.
- **Alojado, con zoom fluido:** `npm install && npm run tiles -- mapa.png "Atribución"` genera `tiles/` y
  actualiza `data/map.json`.

## Datos

- `data/markers.json`: marcadores del juego (vacío hasta importar datos verificados).
- `data/categories.json`: categorías y colores.
- Tu progreso se guarda en el navegador. «Exportar» / «Importar» lo pasa de un dispositivo a otro.

Proyecto de fan sin relación con Rockstar Games ni Take-Two. Grand Theft Auto es marca de sus dueños.
