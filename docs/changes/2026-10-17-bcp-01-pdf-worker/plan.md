# PDF del catálogo · maquetar fuera del bucle de eventos: plan

Especificación: [`spec.md`](spec.md), en borrador.

- **Rama:** `fabri/bcp-01-pdf-worker`, en el worktree `wt/bcp-01-pdf-worker`. La rama solo existe en local: no se ha hecho push.
- **Estado:** **borrador**. Solo está autorizado planificar.

## Base

- `origin/main` = `4ccbfa6`, comprobado con `git ls-remote` el 17 de octubre de 2026. Incluye #323 (`38d2151`).
- Si `main` avanza antes del PR:
  - si no toca los archivos de la tarea, se anota el SHA nuevo;
  - si los toca, se rebasa y se repiten las comprobaciones;
  - si hay conflicto, se para y se avisa.

## Pasos de entorno que autorizaría el plan (al aprobarlo)

1. `npm ci` en el worktree, con el lockfile existente y **sin paquetes nuevos**. Es una instalación: descarga paquetes y puede ejecutar sus scripts.
2. **Copias aisladas** como en #323 (`iso.sh`: `env -i`, sin `.env*`, verificadas):
   - una con `next dev` y fixtures (`NODE_ENV=development CATALOG_FIXTURES=1`);
   - otra con **`next build` y `next start` (NODE_ENV=production)**.
3. **Simulador local de Supabase** (`scripts/pdf/sim-supabase.mts`, Node `http`, sin dependencias):
   - escucha solo en `127.0.0.1` y la app lo usa con `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<puerto>` y claves ficticias;
   - responde únicamente a las llamadas que hace la ruta del enlace:
     - `GET /rest/v1/catalog_shares?…` (versión y criterios);
     - `POST /rest/v1/rpc/get_public_catalog`;
     - `GET /rest/v1/properties?…` (fotos por clave);
     - las imágenes JPEG sintéticas con código (K5);
   - los datos salen del almacén sintético de las fixtures;
   - no se conecta a nada real; cualquier otra ruta responde 404.
4. **Herramientas ya usadas en #323:** Chromium de Playwright (de otro worktree), `swiftc` (`inspect.swift`) y `python3` (`objects.py`).
5. Commits en la rama, push, PR y CI.

**No autorizaría:** producción, credenciales, escrituras reales, migraciones, dependencias nuevas, cambios en el despliegue del VPS ni revisión de Codex.

## Diseño técnico

### Qué se queda en el hilo principal y qué va al hilo

| Hilo principal (como hoy) | Hilo de maquetación |
|---|---|
| Acceso del dueño o del enlace, captura fija S1 y H1 (K1), fotos por clave contra S1 y su conversión con `sharp`, logo, comprobación final por petición (K2) y respuesta HTTP | Solo `renderCatalogPdf`: las dos pasadas del índice, con react-pdf y las fuentes |

### Protocolo

- **Entrada, un mensaje** `{ v: 1, catalog, capturedAt, logo, root, photos: [{ id, width, height, data: ArrayBuffer } | { id, ok: false }] }`:
  - `catalog` es la **proyección saneada**: las fotos de cada vivienda pasan a marcadores `{}`, del mismo número, y `coverPhoto` pasa a un booleano. La portada se busca como hoy, en `photos` con el id `"cover"`;
  - `root` es la carpeta de las fuentes (`process.cwd()` del hilo principal);
  - los `data` van en la **lista de transferencia**: se mueven, no se copian.
- **Salida:**
  - `{ ok: true, pdf: ArrayBuffer, passes, heapUsedMB }`, con `pdf` transferido;
  - o `{ ok: false, error: "index_unstable" | "render_failed", detail }`.
- **Copias de las fotos:**
  - si el `Buffer` de `sharp` ocupa todo su `ArrayBuffer` (lo normal), se transfiere tal cual; si no, se copia **una vez** y se anota;
  - dentro del hilo, `Buffer.from(arrayBuffer)` no copia;
  - lo que sí copia, inevitablemente, es pdfkit: escribe el JPEG dentro del PDF.

### Ciclo de vida

- **Un hilo por PDF** (`new Worker(new URL("./render-worker", import.meta.url), { env: {}, resourceLimits, workerData: null })`).
  - Arranca limpio, así que las fuentes del catálogo se cargan de cero (el truco `freshCatalogFonts` deja de ser necesario, aunque se mantiene) y no se arrastra memoria entre PDF.
  - **Alternativa** si el arranque cuesta más de ~0,5 s (se mide en T1): un hilo persistente que se recicla cada N PDF o tras un tiempo sin uso. La elección se anota con su medición.
- **Concurrencia y cola:** las de hoy, sin cambios. Un PDF a la vez y una cola de 3. El turno del núcleo cubre **toda la vida del hilo**.
- **Fin normal:** el hilo envía el resultado y sale. El turno se libera en el `exit`.
- **Cancelación y tiempo:** cuando se activa la señal del trabajo (ya no queda nadie esperando o se acaba el presupuesto de 50 s):
  - se llama a `worker.terminate()`, que **interrumpe la maquetación de verdad**;
  - se espera al `exit` y solo entonces se libera el turno;
  - si el `exit` no llega en 5 s, se registra un error y se mantiene el turno retenido (nunca se libera con el hilo vivo; el proceso lo vigila PM2).
- **Fallos:**
  - un `error` del hilo, `ERR_WORKER_OUT_OF_MEMORY` o una salida con código distinto de 0 sin resultado dan «failed» (500);
  - no se reintenta;
  - se registra en el log `[catalogos] pdf hilo: …`.
- **Limpieza:** no hay archivos. Los `ArrayBuffer` transferidos se liberan con el hilo.
- **Límites de memoria:** `resourceLimits.maxOldGenerationSizeMb` a unas 2 veces el heap pico medido con 24 viviendas (T5).
- **Sin secretos:**
  - `env: {}`;
  - el módulo del hilo solo importa `render.ts` y sus dependencias puras. Una prueba busca en el chunk compilado nombres prohibidos (`createAdminClient`, `supabase`, `SUPABASE_`, `server-only`, `cookies`).

### Si el hilo no puede arrancar (O1)

Según la decisión de Fabricio:
- **A:** se maqueta en el propio hilo, como #323, con el log `[catalogos] pdf hilo no disponible: …`. Además, el interruptor `CATALOG_PDF_WORKER=0` fuerza ese modo.
- **B:** se responde 503.

## Tareas

### T0. Registro y base

- **Entradas:** la aprobación de Fabricio.
- **Acción:**
  - anotar la aprobación y la decisión O1 en `spec.md` y en este plan;
  - volver a comprobar `origin/main`;
  - ejecutar `npm ci`.
- **Verificación:** `git ls-remote`; `tsc` en verde sin cambios.
- **Commit:** «PDF hilo T0: aprobación y base».

### T1. Puerta: el hilo en el build compilado

- **Entradas:** T0.
- **Acción:**
  - un hilo **mínimo** que maquete un catálogo sintético con `renderCatalogPdf`;
  - lo lanza `render-in-worker.ts` con `new Worker(new URL(…))`;
  - en dev y en `next build` + `next start`.
- **Verificación:**
  1. `next build` emite un chunk del hilo, y el código compilado calcula su ruta **en tiempo de ejecución** (relativa al archivo), no con una ruta absoluta del build.
  2. El build se repite con `NEXT_BUILD_DIR=.next.new`, se renombra a `.next`, se reescribe `required-server-files.json` como hace `vps-autodeploy.sh`, y se arranca desde **otra ruta absoluta**. El hilo funciona.
  3. Dentro del hilo, react-pdf y las fuentes se cargan desde `node_modules` y desde `root`. El PDF tiene el texto y las fuentes correctas.
  4. Se mide el arranque del hilo (de la creación al primer mensaje), con 5 repeticiones.
  5. En dev, `next dev` y las pruebas con `node --experimental-strip-types` también lanzan el hilo; si no, se documenta cómo se prueba.
- **Puerta:** si 1–3 no se cumplen, **se para** y se presentan a Fabricio la evidencia y el plan B (proceso hijo con un JS compilado; exige cambiar el despliegue). No se cambia el despliegue por cuenta propia.
- **Commit:** «PDF hilo T1: el hilo funciona en el build compilado (puerta)».

### T2. Simulador y medición «antes» en el mismo entorno

- **Entradas:** T1 superada.
- **Acción:**
  - `scripts/pdf/sim-supabase.mts`: el simulador de los pasos de entorno, con fotos grandes de 3.600 px con código (las de T10 de #323, en disco);
  - medir **con el código de `main` (`4ccbfa6`) compilado** y `next start` + simulador:
    - el PDF de 1, 12 y 24 viviendas: duración y RSS del proceso;
    - la latencia de `/api/seleccion/<otro token>/estado`, cada 50 ms, en reposo y durante el PDF de 24 viviendas (p50, p95 y máximo);
  - **se reutiliza** `scripts/pdf/measure.mts` en el mismo M2 (duración, pico y bloqueos), en lugar de repetir lo de [`medicion.md`](../2026-10-16-bcp-01-pdf/medicion.md); solo se repite para que «antes» y «después» salgan de la misma sesión.
- **Verificación:** el PDF que genera `next start` + simulador pasa las comprobaciones de `check-catalog-pdfs` (texto, fotos por código e índice). La herramienta acepta un PDF ya generado.
- **Cubre:** la base de W2, W3, W4 y W5, y la punta a punta de W10.
- **Commit:** «PDF hilo T2: simulador local y medición antes».

### T3. Hilo de maquetación y cliente

- **Entradas:** T1 y T2.
- **Acción:**
  - `lib/pdf/catalog/render-worker.ts`: el hilo;
  - `lib/pdf/catalog/render-in-worker.ts`: el cliente, con su ciclo de vida, la transferencia, `env: {}`, `resourceLimits`, la terminación con la señal y la traducción de errores;
  - `sanitizeForWorker(catalog)`;
  - en `generate.ts`, `renderCatalogPdf` → `renderInWorker(…, signal)`;
  - en `runner.ts`, el turno se libera al `exit` del hilo. Hoy ya se libera en el `finally` del trabajo; lo que cambia es que el trabajo espera la salida del hilo;
  - O1 (A o B).
- **Verificación:** pruebas puras nuevas en `test-catalogs-public.mts`:
  - el saneado conserva cuántas fotos hay y no deja ni `src`, ni `f`, ni `u`, ni `/p/`, ni slugs;
  - la transferencia separa los `ArrayBuffer`;
  - un error, una salida con código distinto de 0 o la falta de memoria (con un `resourceLimits` mínimo en la prueba) dan «failed», sin hilos vivos;
  - abortar durante la maquetación termina el hilo, y el turno se libera solo tras el `exit`; para eso hay un retardo de prueba que solo se activa desde la prueba, nunca desde la app;
  - las pruebas de K2 y K3 que ya existen siguen en verde.
- **Cubre:** W6, W7, W8 y W12.
- **Commit:** «PDF hilo T3: maquetación en un hilo con terminación real».

### T4. Mismo PDF

- **Entradas:** T3.
- **Acción:**
  - `check-catalog-pdfs.mts` con el hilo, en todos sus casos;
  - una comparación «hilo frente a en línea» para cada fixture: páginas, texto por página e imágenes por página (código K5);
  - `check-routes.sh` (22) y `pdf.mjs` (103) en la copia de desarrollo.
- **Cubre:** W1, W9 y W11. Para W11, se lista el directorio temporal y el proyecto antes y después.
- **Commit:** «PDF hilo T4: el PDF del hilo es el mismo».

### T5. Medición «después» y límites

- **Entradas:** T4.
- **Acción:**
  - las mismas mediciones de T2 con el código de la rama compilado: duración, RSS, heap del hilo, bloqueos del hilo principal y latencia de la web;
  - fijar `maxOldGenerationSizeMb` con el pico medido;
  - redactar `medicion.md` con las tablas de antes y después, sin extrapolarlas a producción.
- **Verificación:**
  - W2: el bucle de eventos no se bloquea más de 150 ms seguidos y su p99 es de 50 ms o menos;
  - W3: la latencia de la web se presenta, antes y después;
  - W4: la duración no sube más de un 25 %;
  - W5: los datos de memoria y el límite elegido.
- **Puerta:** si W2 o W3 no mejoran claramente, o W4 o W5 empeoran más de lo previsto, **se para** y se presenta a Fabricio antes de seguir.
- **Commit:** «PDF hilo T5: medición después y límites».

### T6. Build de producción, regresiones, resultado y PR

- **Entradas:** T5.
- **Acción:**
  - repetir W10 con el código final: build, renombrado `.next.new` → `.next`, otra ruta absoluta, `next start` + simulador, el PDF pasa las comprobaciones;
  - buscar los nombres prohibidos en el chunk del hilo (W8);
  - la matriz de regresión de #323 (HOME, contenido, diseño, lector, vista, E3, grupos) y `pdf.mjs`;
  - `tsc`, `test:catalogs*` y `test:typography` (sin avisos nuevos);
  - `result.md`; volver a comprobar `main`; push; PR; CI.
- **Parada:** antes del merge.
- **Commit:** «PDF hilo T6: regresiones, build de producción y resultado».

## Verificación final

- La CI del PR en verde.
- Todo W1–W12 con su evidencia en `result.md`. Lo no demostrado se dice con su motivo.

**QA de Fabricio después del despliegue:**
- descargar el PDF de un catálogo grande y comprobar que sale igual;
- opcionalmente, medir desde su terminal la latencia de una página pública mientras lo descarga. El agente prepara el comando de solo lectura (un bucle `curl -w %{time_total}` contra la ruta de estado de un enlace suyo).

## Riesgos y suposiciones

| Riesgo o suposición | Qué se hace |
|---|---|
| **Webpack no emite el hilo, o lo resuelve con rutas absolutas del build** | Lo detecta T1 (puerta). Plan B: proceso hijo con un JS compilado, que cambia el despliegue y lo decide Fabricio. |
| **React del hilo:** el chunk del hilo puede resolver `react` de otra forma que las rutas (React empaquetado frente a `node_modules`) | T1 comprueba que el PDF sale bien en el build compilado. |
| **Las vCPU del VPS son desconocidas:** con 1 o 2, la web sigue compitiendo por la CPU | El bucle queda libre, pero puede haber algo de lentitud. No se promete latencia en producción. Los datos del VPS (opcionales) los aporta Fabricio. |
| **Memoria:** el hilo suma su heap a la RSS del mismo proceso | Se mide (T2 y T5) y se acota con `resourceLimits`. Con OOM, «failed» y el proceso sigue. |
| **Node del VPS desconocido** | `worker_threads`, `resourceLimits` y `env` existen en todas las versiones de Node que soporta Next 15; la CI usa la 22. |
| **PM2 en modo clúster** (no documentado así) | Cada proceso tendría su propio turno. Hoy se documenta un solo proceso. |
| **El simulador no es Supabase** | Solo reproduce las 4 llamadas de la ruta del enlace. La ruta del dueño comparte el mismo código de maquetación y se cubre en dev con fixtures; las dos se prueban en producción en la QA de Fabricio. |

## Aprobación

Pendiente. Desde la aprobación del plan se podría implementar T0–T6, con las puertas de T1 y T5.
