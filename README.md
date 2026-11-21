# Leonida 100%

Mapa interactivo para llevar el 100% de GTA VI: marcadores por categoría, progreso, edificios y zonas
visitadas, y un aviso de «olvidos» (cosas sin coger en sitios donde ya estuviste). Funciona en el navegador
del ordenador y se instala en el móvil como app (PWA).

## Usarlo

```bash
npm run dev        # http://localhost:8080
```

O publicarlo con GitHub Pages (rama y carpeta raíz): es una web estática, sin build.

## El mapa y los datos

- **Mapa y localizaciones:** [MapGenie](https://mapgenie.io/grand-theft-auto-6/maps/leonida), con permiso de su
  autor. El mapa se carga en vivo desde sus servidores (hace falta conexión). De cada localización se guarda la
  posición, la categoría y el nombre; para fotos y detalles, cada ficha enlaza a MapGenie.
- **Edificios:** siluetas detectadas sobre ese mapa (`data/buildings.json`).
- **Lista del 100%:** guía de PowerPyx (18-nov-2026), en `data/checklist.json`.
- Tu progreso se guarda en el navegador. «Exportar» / «Importar» lo pasa de un dispositivo a otro.

De reserva queda el póster oficial de Rockstar (`tiles/`, `data/map-poster.json`).

## Sincronizar móvil y ordenador

En «Datos» → «Sincronizar móvil y ordenador»: crea un token de GitHub con permiso `gist`
(<https://github.com/settings/tokens/new?scopes=gist>) y pégalo una vez en cada dispositivo. El progreso se
guarda en un gist privado de tu cuenta y cada dispositivo lo sube y lo baja solo.

Proyecto de fan sin relación con Rockstar Games ni Take-Two. Grand Theft Auto es marca de sus dueños.
