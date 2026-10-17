# PDF del catálogo · maquetar fuera del bucle de eventos: resultado

Especificación: [`spec.md`](spec.md). Plan: [`plan.md`](plan.md). Medición: [`medicion.md`](medicion.md).

**Aprobaciones de Fabricio, todas del 17-10-2026:**
- T0–T6;
- O1 = A: respaldo solo si el hilo no arranca;
- las salvaguardas S1–S5;
- D4: la excepción a W4 en la puerta T5.

## Base y commits

- **Base:** `origin/main` = `ab7bbcd` (merge de #324, S0), comprobado con `git ls-remote`.
- **Rama:** `fabri/bcp-01-pdf-worker`.
- **Lleva además, como documentación:**
  - el cierre del PDF de #323: P9/PDF12 aprobados en producción;
  - la exploración de la importación y del buscador;
  - la hoja de ruta: D-B2, D-I2 y D-O1;
  - la QA de S0 en producción.
- **Sin migración, sin dependencias nuevas** (`npm ci` con el lockfile existente) **y sin cambios en el VPS ni en el despliegue.**

| Commit | Tarea |
| --- | --- |
| `20a4940` | Cierre del PDF tras #323, hoja de ruta y borrador de este plan |
| `526593e`, `4205cd3` | Exploración y hoja de ruta (D-B2, D-I2, D-O1) |
| `497fd87` | T0: aprobación (O1 = A, S1–S5), base `ab7bbcd` y QA de S0 |
| `7327a77` | T1: el hilo funciona en el build compilado (puerta) |
| `4af62ae` | El hilo arranca mientras se descargan las fotos |
| `cd86d7c` | T3: pruebas del hilo real |
| `78117db` | T4: el PDF del hilo es el mismo |
| `d4119ee` | T5: medición y límite del heap del hilo (puerta T5) |
| (este commit) | T6: D4, regresiones, build final y resultado |

## Qué cambia

- **`lib/pdf/catalog/render-worker.ts` (el hilo):**
  - comprueba que están las fuentes, responde `ready`, recibe un único pedido, maqueta (las dos pasadas del índice) y devuelve el PDF transferido;
  - no toca la base de datos, la red ni la autorización.
- **`lib/pdf/catalog/render-in-worker.ts` (el cliente):**
  - **lanza el hilo al empezar el trabajo**, para que arranque mientras se descargan las fotos;
  - le da un entorno mínimo (`NODE_ENV`);
  - **no transfiere nada hasta `ready`**;
  - copia cada foto **una vez** a un `ArrayBuffer` propio y lo transfiere;
  - **termina el hilo y espera a su salida** al acabar, al cancelar, si se agota el tiempo o si las fotos «cambian».
- **Respaldo (O1 = A):**
  - **solo** si el hilo no llega a estar listo: el hilo sale primero, las fotos siguen intactas y queda el log saneado `[catalogos] pdf hilo no disponible: <código>`;
  - **nunca** tras empezar a maquetar.
- **Interruptor:** `CATALOG_PDF_WORKER=0`.
- **`lib/pdf/catalog/worker-protocol.ts`:** la proyección **saneada** (sin `src` ni claves de fotos, ni `coverPhoto`).
- **`lib/catalogs/export/generate.ts`:**
  - solo cambia la maquetación, que va al hilo;
  - el acceso, la captura fija (K1), las fotos por clave contra S1 y la comprobación final por petición (K2) siguen en el hilo principal, igual que antes;
  - **un hilo por PDF**, con la misma cola y la misma concurrencia (1 a la vez, cola de 3) (D4).
- **`next.config.ts`:** `workerPublicPath: "./"` **solo para el servidor**.
  - Sin esto, webpack calculaba la ruta del hilo con el `publicPath` de Next (`"/_next/"`), que apuntaba a `file:///_next/…`, y el hilo no arrancaba en el build compilado.
  - `""` no sirve: webpack lo trata como «sin valor» y vuelve al `publicPath`.
  - La ruta se calcula al ejecutar desde `__dirname`: `new URL("./"+chunk, …/.next/server/chunks/)`.
- **`resourceLimits.maxOldGenerationSizeMb = 256`:** unas 2 veces el heap pico medido. Es un límite **del heap de V8 del hilo**, no de la memoria total del proceso.

## Verificaciones

Todo es local y sintético:
- copias aisladas sin `.env*` ni credenciales (verificadas);
- simulador de PostgREST solo en `127.0.0.1`;
- fotos con código visual (K5);
- sin IA real.

| Comprobación | Resultado |
| --- | --- |
| `tsc --noEmit` | sin errores |
| `scripts/test-pdf-worker.mts`: hilo real; saneado, entorno, copias, respaldo solo al arrancar, sin respaldo tras un fallo o falta de memoria, cancelación, turno hasta la salida e interruptor | **27 ✅** |
| `scripts/pdf/check-catalog-pdfs.mts`: verificación completa, maquetada por el hilo | **530 ✅** (15 PDF por el hilo, 0 respaldos, 0 en línea) |
| `scripts/pdf/compare-worker-inline.mts`: misma entrada, hilo frente a camino actual, 7 casos | **21 ✅**: mismas páginas, texto, enlaces, fotos por página, fuentes, metadatos, pasadas y bytes |
| `scripts/pdf/worker-build-gate.sh` + `check-sim-pdfs.mts`: **build de producción** como el despliegue (`.next.new` → `.next`, `distDir` reescrito) y **movido a otra ruta**, 6 catálogos | **10 ✅ + 448 ✅** (ver «Build de producción final») |
| `scripts/pdf/check-routes.sh`, servidor de desarrollo aislado | **22 ✅** |
| Prueba de navegador del PDF (`pdf.mjs`, gestor y lector a 1440, 362 y 320) | **103 ✅** (19 PDF por el hilo, 0 respaldos) |
| `test:catalogs`, `test:catalogs-public`, `test:catalogs-manager`, `test:smartlink`, `test:viewing-collections` y `test-public-web` | en verde (83, 453 y 148 ✅…) |
| `test:typography` | las mismas 16 violaciones que ya hay en `main`; ninguna en archivos tocados |
| Matriz de regresión de #323 (servidor de desarrollo aislado) | **0 fallos** (ver abajo) |

### Build de producción final (W10, W11, W13)

`bash scripts/pdf/worker-build-gate.sh` sobre el código final, con `next build` en `.next.new`, `distDir` reescrito, renombrado a `.next` y la app movida a otra ruta absoluta, más `next start` y el simulador:
- **6 de 6 PDF** (1, 3, 4, 5, 12 y 24 viviendas) con `200`, **maquetados por el hilo** (6 líneas `pdf hilo`, **0 respaldos**);
- **ningún archivo nuevo** en el TMPDIR del servidor ni en el proyecto;
- `check-sim-pdfs.mts` sobre esos 6 PDF: **448 ✅**, con la identidad de cada foto por su código (versión = md5 de la URL, como en la base real), exclusiones de E3, foto que falla, índice y enlaces, texto completo y nada interno ni del simulador;
- **chunk compilado del hilo:** 0 apariciones del cliente de la base de datos, `supabase`, `SUPABASE_` y `fetch`. La única referencia a `process.env` es el gancho de prueba `echoEnv`, que solo lista las claves cuando lo activa una prueba.

### Matriz de regresión

Copias de las pruebas de #323 y de grupos contra el servidor de desarrollo aislado.

| Prueba | Resultado |
|---|---|
| `homes` (5 tamaños) | 56–57 ✅ cada uno |
| `content` (5 tamaños) | 33–34 ✅ cada uno |
| `design-share` (4 tamaños) | 34 ✅ cada uno |
| `lector` / `indice` / `prA` / `prB` / `enlace` / `c1` / `c2` | 52 / 187 / 54 / 40 / 10 / 31 / 186 ✅ |
| `vista` (2) / `e3` (3) / `grupos` (3) | 23 / 41 / 79–75 ✅ |
| **Total de fallos** | **0** |

**Incidencia del proceso:**
- En una primera pasada larga, `content` (1024 y 320), `indice`, `prA` y `prB` se cortaron por **tiempo agotado** (`page.goto` o `click` de más de 30 s), sin ninguna comprobación fallida. El servidor de desarrollo llevaba horas encendido y estaba al 124 % de CPU.
- Con el servidor reiniciado, esas pruebas y las que faltaban salieron enteras y en verde, con las mismas cifras que en #323.
- Ninguna de ellas pasa por el PDF.

## Rendimiento y memoria

Resumen. El detalle está en [`medicion.md`](medicion.md).

| | Antes (`ab7bbcd`) | Después |
|---|---|---|
| Latencia máx. de la web con el PDF de 24 viviendas | 832–931 ms | **40–44 ms** |
| Parones del bucle de más de 100 ms | 0,2–1,16 s por PDF | **ninguno** (p99 11–12 ms) |
| Duración, 12 y 24 viviendas | — | +4 % a +9 % |
| Duración, 1 vivienda | ~0,7–0,8 s | ~0,9–1 s (**+25 % a +33 %, ~+0,2 s: aceptado en D4**) |
| Huella física pico del proceso | 704–766 MB | 750–839 MB (+50–75 MB mientras vive el hilo) |
| Heap del hilo | — | 28/64 MB (1 vivienda) a 79/124 MB (24 viviendas) |

**Una copia por foto:** los `Buffer` de `sharp` son memoria externa y Node no deja transferirlos (`DataCloneError`, comprobado). Del orden del peso de los JPEG del PDF (≈ 3,5 MB con 24 viviendas).

**No es una garantía para producción:** las vCPU y la memoria del VPS son desconocidas. El hilo libera el bucle de eventos, pero comparte la CPU y la memoria de la máquina.

## Criterios de aceptación

| # | Estado | Evidencia |
| --- | --- | --- |
| W1 | demostrado | 530 ✅ por el hilo; comparación hilo / camino actual idéntica en 7 casos; 348 ✅ en el build compilado |
| W2 | demostrado en local | 0 parones de más de 100 ms; p99 11–12 ms |
| W3 | demostrado en local | latencia máx. de ~0,8–1 s a ~40 ms |
| W4 | demostrado con excepción (D4) | 12 y 24 viviendas +4 % a +9 %; 1 vivienda ~+0,2 s, aceptado |
| W5 | medido | huella +50–75 MB de pico; heap del hilo ≤ 79/124 MB; límite de 256 MB (del heap, no del proceso) |
| W6 | demostrado | cancelar una maquetación síncrona de 5 s → «cancelled» en < 3 s, sin hilo vivo; turno liberado al salir |
| W7 | demostrado | fallo o falta de memoria durante la maquetación → error, sin respaldo, sin hilo vivo; el PDF siguiente sale bien |
| W8 | demostrado | entorno del hilo = `NODE_ENV`; mensaje saneado (81 cadenas internas ausentes); el chunk compilado no contiene el cliente de la base de datos, `supabase`, `SUPABASE_`, `fetch` ni `process.env` |
| W9 | demostrado | rutas 22 ✅, navegador 103 ✅, catálogos K1–K3 ✅ y la matriz de regresión |
| W10 | demostrado | build compilado en `.next.new`, `distDir` reescrito, renombrado y movido a otra ruta → PDF por el hilo, verificado |
| W11 | demostrado | ningún archivo nuevo en el TMPDIR del servidor ni en el proyecto tras generar |
| W12 | demostrado (precisado) | una copia por foto, transferida sin segunda copia; originales intactos |
| W13 | demostrado | log del hilo en cada PDF del build compilado, ningún respaldo; contadores en Node |
| W14 | demostrado | arranque fallido → respaldo con las fotos intactas y el log saneado; fallo, tiempo agotado o cancelación → sin respaldo |

## QA de Fabricio (después del despliegue)

1. **Descarga el PDF de un catálogo grande** (unas 20–24 viviendas) desde el gestor y desde el enlace. Debe salir igual que antes.
2. **Mientras se genera**, navega por el CRM o abre el catálogo en otra pestaña: no debe quedarse parado un segundo.
3. **Un catálogo de 1 vivienda** puede tardar unas décimas más (aceptado en D4).
4. **Si algo falla**, en `pm2 logs smartbc-portal`:
   - cada PDF deja `[catalogos] pdf hilo: …`;
   - si apareciera `[catalogos] pdf hilo no disponible: …`, el PDF salió por el camino anterior y hay que avisar.

## Revisión

No se pidió revisión adicional de Codex: la aprobación lo excluía.

## Pendiente o no demostrado

- **En producción no se ha comprobado nada** (P-1): ni el rendimiento en el VPS, ni su CPU y memoria, ni el `proxy_read_timeout` de nginx.
- **El simulador no es Supabase.** Reproduce las llamadas de la ruta del enlace. La ruta del dueño comparte la misma maquetación y se probó en desarrollo con fixtures.
- **Límite heredado de E3:** un archivo sustituido en la misma URL no se detecta.
- **Lo siguiente, sin empezar:** el nuevo buscador del catálogo sin «Manual / Automático».
- **Siguen pendientes:** G-ALQ, el caso original de Recoletos y D13 en vivo.

## PR, CI y merge

Pendiente de publicar. El merge lo hace Fabricio. **Sin migración**, pero el merge dispara el autodespliegue.
