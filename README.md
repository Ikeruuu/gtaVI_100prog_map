# Leonida 100%

Mapa interactivo para llevar el 100% de GTA VI: marcadores por categoría, progreso, edificios y zonas
visitadas, y un aviso de «olvidos» (cosas sin coger en sitios donde ya estuviste). Funciona en el navegador
del ordenador y se instala en el móvil como app (PWA).

## Usarlo

```bash
npm run dev        # http://localhost:8080
```

O publicarlo con GitHub Pages (rama y carpeta raíz): es una web estática, sin build.

## El mapa

Viene con el póster oficial «The Great State of Leonida» de Rockstar (5775×7900 px) troceado en `tiles/`.
Para cambiarlo por otra imagen:

- **Solo en tu dispositivo:** pestaña «Datos» → «Cargar imagen del mapa…».
- **Para todos:** `npm install && npm run tiles -- mapa.png "Atribución"` regenera `tiles/` y `data/map.json`.

Si cambias a una imagen con otro encuadre, lo que ya tengas marcado se descoloca.

## Datos

- `data/checklist.json`: los 35 requisitos del 100% (fuente: guía de PowerPyx, 18-nov-2026).
- `data/categories.json`: categorías y colores.
- `data/markers.json`: marcadores del juego (vacío hasta importar posiciones verificadas).
- Tu progreso se guarda en el navegador. «Exportar» / «Importar» lo pasa de un dispositivo a otro.

## Sincronizar móvil y ordenador

En «Datos» → «Sincronizar móvil y ordenador»: crea un token de GitHub con permiso `gist`
(<https://github.com/settings/tokens/new?scopes=gist>) y pégalo una vez en cada dispositivo. El progreso se
guarda en un gist privado de tu cuenta y cada dispositivo lo sube y lo baja solo.

Proyecto de fan sin relación con Rockstar Games ni Take-Two. Grand Theft Auto es marca de sus dueños.
