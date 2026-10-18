# Dependencias de la extracción de PDF (BCP-01 P7, I-17)

Revisadas el 18-10-2026 antes de instalarlas. Son gratuitas y de código abierto. No llaman a ningún servicio ni a ninguna IA, y todas sus versiones van fijadas a una versión exacta en `package.json`.

## Paquetes directos

| Paquete | Versión | Licencia | Procedencia | Tamaño en `node_modules` | Para qué |
|---|---|---|---|---|---|
| `pdfjs-dist` | 5.7.284 | Apache-2.0 | Mozilla, github.com/mozilla/pdf.js | 35 MB | Leer el PDF en el navegador: texto, imágenes incrustadas y pintado de páginas |
| `tesseract.js` | 7.0.0 | Apache-2.0 | github.com/naptha/tesseract.js | 1,6 MB | OCR en el navegador (Tesseract compilado a WebAssembly) |
| `tesseract.js-core` | 7.0.0 (dependencia de la anterior) | Apache-2.0 | github.com/naptha/tesseract.js-core | 43 MB | El núcleo en WebAssembly |
| `@tesseract.js-data/spa` | 1.0.0 | MIT (envoltorio) | github.com/naptha/tessdata; los modelos son los `tessdata_best` «int» de tesseract-ocr, con licencia Apache-2.0 | ~10 MB | Modelo de español |
| `@tesseract.js-data/eng` | 1.0.0 | MIT (envoltorio), modelo Apache-2.0 | ídem | ~14 MB | Modelo de inglés: el texto de los PDF mezcla los dos idiomas |

## Dependencias transitivas nuevas

| Licencia | Paquetes |
|---|---|
| MIT | `bmp-js`, `is-url`, `opencollective-postinstall`, `regenerator-runtime`, `zlibjs`, `node-fetch` (con `whatwg-url`, `tr46` y `webidl-conversions`) |
| Apache-2.0 | `idb-keyval`, `wasm-feature-detect` |

- **`@napi-rs/canvas` (MIT, ~25 MB con su binario):** es una dependencia **opcional** de pdf.js para pintar en Node. Aquí no se usa (el pintado ocurre en el navegador), pero npm la instala.
- **`postinstall` de `tesseract.js`:** solo es `opencollective-postinstall || true`, que imprime un mensaje y no descarga nada.

No hay ninguna licencia copyleft ni de pago.

## Cómo se sirven

Todo se carga desde nuestro propio servidor, nunca desde un CDN:
- **Ruta de los recursos:** `GET /api/admin/import-assets/<versión>/<fichero>`.
  - Exige `properties.create` y además pasa por la barrera de sesión de `/api/admin`.
  - **Lista cerrada** de 7 ficheros (`lib/imports/pdf/ocr.ts`): el worker de pdf.js (build `legacy`), el worker de tesseract, tres variantes de su núcleo y los dos modelos `.gz`.
  - Caché `private, max-age=1 año, immutable`. La versión va en la ruta, así que actualizar los paquetes cambia la URL.
- **El PDF no sale del navegador.** Solo se suben al servidor los campos y las fotos que la persona confirma en la revisión (P8).
- **Build «legacy» de pdf.js también en el navegador:** el build normal usa `Uint8Array.prototype.toHex`, una API muy reciente. Con él falló en el Chromium de pruebas, y fallaría igual en navegadores de hace pocos meses.

## Efectos en el despliegue

- **Cambia `package-lock.json`:** el autodeploy del VPS ejecutará `npm install`. Son unos 130 MB más en `node_modules`, contando `@napi-rs/canvas`.
- **Sin migraciones ni variables de entorno nuevas.**
- **El servidor solo lee los ficheros de la lista desde `node_modules`.** No ejecuta ni pdf.js ni el OCR.
