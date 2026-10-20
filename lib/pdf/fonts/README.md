# Fuentes del PDF del catálogo (identidad de la publicación del itinerario)

Archivos **estáticos** (react-pdf no admite fuentes variables) de las tres familias del catálogo, incluidos en el repositorio para que generar un PDF **no dependa de Google Fonts** ni de la red. Son las mismas familias que el layout raíz carga en el navegador con `next/font` (Playfair Display, Cinzel e Inter): enmienda visual [`docs/changes/2026-10-20-bcp-01-catalogo-visual/enmienda.md`](../../../docs/changes/2026-10-20-bcp-01-catalogo-visual/enmienda.md) (DV11).

| Archivo | Fuente | Peso / estilo | sha256 |
| --- | --- | --- | --- |
| `playfair-display-latin-400-normal.woff` | Playfair Display | 400 normal | `3afd64d114a27e2f6604684c30f72d6dbb6ba3e6f6b1675f15a942efc7a56410` |
| `playfair-display-latin-400-italic.woff` | Playfair Display | 400 cursiva | `cc638df9f516b3cbfd87d5012d0b657c81dec4e52dd5a8c9e0b87a2b39697bd9` |
| `playfair-display-latin-500-normal.woff` | Playfair Display | 500 normal | `29bceb26218e4d06f84792d571112cb7447448ef375ac3c07a367a14f756bd37` |
| `playfair-display-latin-600-normal.woff` | Playfair Display | 600 normal | `5798aa5a8bab09880d5e1dd9bfbc8e952fb0c80ec78e695cc339e15f006e8bb8` |
| `cinzel-latin-400-normal.woff` | Cinzel | 400 normal | `99c6477f06f0c717d31f2bb41013582c347be65366179d5726d107ad908ff3b0` |
| `cinzel-latin-500-normal.woff` | Cinzel | 500 normal | `9a9d232ab20440ff2571ebd2ef69ef562ff16b85af6a4c4eb62c1a75f986fa0f` |
| `cinzel-latin-600-normal.woff` | Cinzel | 600 normal | `7cffb40d1c02861fd0f2fedf9446f36b9d38ce312c723927667ebcffc8690894` |
| `inter-latin-400-normal.woff` | Inter | 400 normal | `e20fa0b4fd2dd26e4d14b3ac3cc922509c3a63fa5e910e90c614544aa042dd45` |
| `inter-latin-500-normal.woff` | Inter | 500 normal | `9b42c108da48b5ed55a3072e815ffee2d271562e6c0dd6998910e8f9c09e0a3d` |
| `inter-latin-600-normal.woff` | Inter | 600 normal | `6a9cb3a509b4eeaf12b7dda6c4aacac3e85d07f4201bf4dd716e332e692b87bd` |

- **Procedencia:** paquetes npm `@fontsource/playfair-display@5.3.0` (sha256 del `.tgz`: `564e61951ecc3e962793cd50395f718cda6350cb934f9000dbe0139c768dc023`), `@fontsource/cinzel@5.3.0` (`b80629f715b4603fd099c0ceaa94cc7a15308a75a9cf52f0613a312ee6d53c28`) y `@fontsource/inter@5.3.0` (`02034af8d41dcc67ac8eab88f642e129bb8a2e8922abf30229c32725f54d8fd6`). Se bajaron una vez con `npm pack` (20 de octubre de 2026) y se copiaron solo estos archivos; **no** son dependencias del proyecto.
- **Subconjunto «latin»:** U+0000–00FF, la puntuación general (U+2000–206F), € y otros. Comprobado con fontkit (20-10-2026) que las tres familias traen á é í ó ú ñ ü ¿ ¡ « » € ² º ª · — – ’: ya no hace falta pintar «º» y «ª» con otra fuente. El ornamento ✦ no está: se dibuja como vector.
- **Licencia:** SIL Open Font License 1.1 ([`OFL-PlayfairDisplay.txt`](OFL-PlayfairDisplay.txt), [`OFL-Cinzel.txt`](OFL-Cinzel.txt), [`OFL-Inter.txt`](OFL-Inter.txt)). La OFL permite incrustarlas en documentos.
- Las usa `lib/pdf/catalog/fonts.ts` (`Font.register`). Las fuentes anteriores (Fraunces y Karla, dirección C · Boutique) se retiraron en la enmienda visual.
