# Itinerarios Tokio – primavera 2026

Repositorio con bloques modulares para planear un viaje en Tokio y alrededores. Cada bloque describe un día completo en formato Markdown (concepto, estructura, paradas clave, consejos prácticos y notas de temporada) y luego se puede convertir en mapas KML/PNG listos para Google My Maps. Se puede extender añadiendo nuevos itinerarios o editando los existentes a medida que cambian intereses, temporadas o datos prácticos.

## Requisitos previos
1. **Node.js + npm** para ejecutar los scripts (`npm install` al clonar).
2. **Google Cloud API Key** con acceso a:
   - *Places API* (para resolver coordenadas).
   - *Directions API* (para los tramos entre puntos).
   - *Maps JavaScript API* (para renderizar los PNG con tiles en inglés/español).
3. Guardá la key en `.env` (no versionado):  
   ```bash
   echo "GOOGLE_MAPS_API_KEY=tu_api_key" >> .env
   ```
   Si no configurás la key, el render usará OpenStreetMap automáticamente.

## Flujo de trabajo sugerido
1. **Crear/editar itinerarios en Markdown**: cada bloque vive en `bloques/<carpeta>/<NN-nombre>.md`.
2. **Cargar lugares del bloque** en `data/places-input/<block-id>.json`. Hoy ese paso se hizo manualmente/externamente (apoyándonos en un LLM para extraer la lista desde el Markdown), pero cualquier método es válido siempre que termine generando el JSON con `{ "name": "...", "hint": "..." }` siguiendo el orden del itinerario.
3. **Resolver coordenadas y rutas** con:
   ```bash
   npm run fetch:block -- <block-id>
   npm run routes:block -- <block-id>
   npm run build:map -- <block-id>      # genera maps/<block-id>.kml
   ```
4. **Renderizar mapas listos para My Maps**:
   ```bash
   npm run render:block -- <block-id> [--chunk-size=N]
   ```
   El comando produce `maps/<block-id>.png` (más los detalles si pedís `--chunk-size`).

## Estructura
- `bloques.md`: índice maestro con las categorías (urbano tradicional, historia, cultura local, subcultura, excursiones y evaluación). Incluye recordatorio de la ventana del viaje.
- `bloques/` subcarpetas: contienen los itinerarios detallados. Los nombres siguen la numeración del índice (`NN-nombre.md`).
  - `urbano - .../`: días dentro de Tokio separados por temática.
  - `excursion/`: escapadas de hasta dos horas de viaje (Kamakura, Hakone, etc.).
  - `evaluacion/`: ideas en reserva para futuros ajustes.
- `AGENTS.md`: guía de contribución para mantener estilo, comandos de revisión y tono.

## Cómo usar los bloques
1. Cada mañana revisá clima, energía y eventos especiales (hanami, iluminaciones).
2. Elegí un bloque del índice y abrí su archivo correspondiente en `bloques/`.
3. Seguí la estructura sugerida (orden óptimo de templos, cafés y transporte). Casi todos los bloques tienen notas específicas de primavera.
4. Podés mezclar o cortar bloques según ganas; el objetivo es tener más ideas de las que vas a usar.

## Contribuir
- Antes de editar, leé `AGENTS.md` para conocer estilo, comandos (`markdownlint`, `rg`) y tono en español rioplatense.
- Respetá la numeración y el formato "Bloques … / Itinerario …" al crear archivos nuevos.
- Tras agregar o modificar un bloque, asegurate de actualizar `bloques.md` y de incluir notas de temporada si aplican.
- Verificá cambios renderizando los `.md` (por ejemplo con `glow`) y corré `npx -y markdownlint-cli2 "**/*.md"` antes de hacer commit.
- Para mapas podés trabajar bloque a bloque:
  1. Creá `data/places-input/<block-id>.json` (lista de lugares del MD).
  2. `npm run fetch:block -- <block-id>` para guardar `data/places/<block-id>.json`.
  3. `npm run routes:block -- <block-id>` para guardar `data/routes/<block-id>.json`.
  4. `npm run build:map -- <block-id>` para generar `maps/<block-id>.kml`.
  Si querés regenerar todo de una vez, mantené `data/places-input.json` con todos los bloques y usá `./run-fetch.sh`, `./run-directions.sh`, `npm run build:maps`.

### Render de mapas (PNG listos para My Maps)
- **Prerequisitos**: `npm install` ya trae Puppeteer y conversores. Para tener etiquetas de Google en inglés/español, agregá `GOOGLE_MAPS_API_KEY=<tu_key>` al `.env`. Si no hay key, el render usa OpenStreetMap por defecto.
- **Panorámico por bloque**: `npm run render:block -- <block-id>` crea `maps/<block-id>.png` con la ruta, pines numerados y lista lateral.
- **Detalles por tramo**: sumá `--chunk-size=N` para generar además `maps/<block-id>-detalle-XX.png`, cada uno centrado en N paradas consecutivas (útil para itinerarios largos).
- **Mapas por lotes**: corré el script en un loop (`for id in ...; do npm run render:block -- $id; done`) para regenerar todos los bloques. Cada PNG queda en `maps/` (3‑6 MB aprox.).

## Índice rápido por categoría
- **evaluacion**
  - [22 Sawara](/bloques/evaluacion/22-sawara.md)
  - [23 Fujinomiya](/bloques/evaluacion/23-fujinomiya.md)
  - [24 Chichibu](/bloques/evaluacion/24-chichibu.md)
- **excursion**
  - [17 Kamakura Enoshima](/bloques/excursion/17-kamakura-enoshima.md)
  - [18 Nikko Utsunomiya](/bloques/excursion/18-nikko-utsunomiya.md)
  - [19 Hakone](/bloques/excursion/19-hakone.md)
  - [20 Yokosuka](/bloques/excursion/20-yokosuka.md)
  - [21 Kawagoe](/bloques/excursion/21-kawagoe.md)
- **urbano-algo-alejado**
  - [33 Shibamata](/bloques/urbano-algo-alejado/33-shibamata.md)
- **urbano-cultura-local**
  - [10 Itabashi Oyama](/bloques/urbano-cultura-local/10-itabashi-oyama.md)
  - [11 Kichijoji Inokashira](/bloques/urbano-cultura-local/11-kichijoji-inokashira.md)
  - [12 Shimokitazawa Sangenjaya](/bloques/urbano-cultura-local/12-shimokitazawa-sangenjaya.md)
  - [13 Daikanyama Nakameguro Meguro River](/bloques/urbano-cultura-local/13-daikanyama-nakameguro-meguro-river.md)
  - [26 Todoroki Jiyugaoka Gotokuji Shoin](/bloques/urbano-cultura-local/26-todoroki-jiyugaoka-gotokuji-shoin.md)
  - [27 Chofu Jindaiji Jindai Botanical](/bloques/urbano-cultura-local/27-chofu-jindaiji-jindai-botanical.md)
  - [28 Mitaka Inokashira Norte](/bloques/urbano-cultura-local/28-mitaka-inokashira-norte.md)
  - [29 Kugayama Zenpukuji River](/bloques/urbano-cultura-local/29-kugayama-zenpukuji-river.md)
  - [30 Takanawa Sengakuji Gotanda](/bloques/urbano-cultura-local/30-takanawa-sengakuji-gotanda.md)
  - [36 Akabane Higashijujo](/bloques/urbano-cultura-local/36-akabane-higashijujo.md)
- **urbano-historia**
  - [25 Kanda Jimbocho Tokyo Station](/bloques/urbano-historia/25-kanda-jimbocho-tokyo-station.md)
  - [34 Ginza Nihonbashi](/bloques/urbano-historia/34-ginza-nihonbashi.md)
  - [35 Yasukuni Kokyo Gaien](/bloques/urbano-historia/35-yasukuni-kokyo-gaien.md)
  - [7 Tokyo Station Nihonbashi Marunouchi](/bloques/urbano-historia/7-tokyo-station-nihonbashi-marunouchi.md)
  - [8 Chiyoda Jimbocho Chidorigafuchi](/bloques/urbano-historia/8-chiyoda-jimbocho-chidorigafuchi.md)
  - [9 Ueno Okachimachi Ameyoko](/bloques/urbano-historia/9-ueno-okachimachi-ameyoko.md)
- **urbano-subcultura**
  - [14 Koenji Nakano](/bloques/urbano-subcultura/14-koenji-nakano.md)
  - [15 Akihabara Kanda](/bloques/urbano-subcultura/15-akihabara-kanda.md)
  - [16 Ikebukuro Sugamo](/bloques/urbano-subcultura/16-ikebukuro-sugamo.md)
- **urbano-tradicional**
  - [1 Asakusa](/bloques/urbano-tradicional/1-asakusa.md)
  - [2 Nippori](/bloques/urbano-tradicional/2-nippori.md)
  - [3 Monzen Nakacho](/bloques/urbano-tradicional/3-monzen-nakacho.md)
  - [31 Yanaka Profundo Ueno Toshogu Ikenohata](/bloques/urbano-tradicional/31-yanaka-profundo-ueno-toshogu-ikenohata.md)
  - [32 Tokyo Tower](/bloques/urbano-tradicional/32-tokyo-tower.md)
  - [4 Kagurazaka](/bloques/urbano-tradicional/4-kagurazaka.md)
  - [5 Sugamo Komagome Rikugien](/bloques/urbano-tradicional/5-sugamo-komagome-rikugien.md)
  - [6 Oji Asukayama Tabata](/bloques/urbano-tradicional/6-oji-asukayama-tabata.md)
