# PDF del catálogo · maquetar fuera del bucle de eventos de la web: especificación

Sacar la maquetación del PDF del catálogo (react-pdf, síncrona y pesada) del bucle de eventos que atiende las peticiones web. Ni el PDF ni sus reglas cambian.

- **Tamaño:** grande o sensible. Cambia cómo se ejecuta una parte del servidor de producción (hilos), tiene que funcionar con el build compilado de Next y con el despliegue atómico del VPS, y toca la cancelación y los límites de una ruta pública.
- **Responsable:** Fabricio.
- **Estado:** **borrador**. Fabricio pidió preparar el plan el 17 de octubre de 2026. Eso **solo autoriza planificar**: no autoriza implementar, ni acepta los parones actuales como un compromiso definitivo.
- **Base:** `origin/main` = `4ccbfa6`, comprobado con `git ls-remote`. Incluye #323 (`38d2151`).

## Contexto

### Lo que hay hoy (comprobado en el código de `4ccbfa6`)

- **El flujo por petición** (`lib/catalogs/export/generate.ts`, `runner.ts`, `capture.ts`, `photos.ts`, `source.ts`):
  1. comprobación del acceso;
  2. captura fija S1 con su huella H1 (K1);
  3. fotos por clave, comprobadas contra S1 y convertidas a JPEG con `sharp`;
  4. maquetación con `renderCatalogPdf` (`lib/pdf/catalog/render.ts`): dos pasadas, por el índice;
  5. comprobación final del acceso y de la huella, **por cada petición** (K2).
- **Dónde se bloquea:** `sharp` ya trabaja fuera del bucle de eventos (en el pool de hilos de libuv). Lo que lo bloquea es **la maquetación** (`renderToBuffer`), que es síncrona.
- **Medido el 17 de octubre de 2026** en un M2 ([`medicion.md`](../2026-10-16-bcp-01-pdf/medicion.md)):

| Viviendas | Bloqueos del bucle |
|---|---|
| 1 | 2 × ~0,2 s |
| 24 | 2 × ~0,9 s (uno de 1,4 s) |

  Con el servidor de desarrollo, mientras se genera el PDF de 24 viviendas la web pasa de p95 39 ms a p95 719 ms, con un máximo de 1,36 s.
- **El turno (K3):** es del trabajo y se libera solo cuando este termina. Hoy la fase de fotos se cancela, pero **la maquetación no se puede interrumpir**.
- **La maquetación es independiente de los datos.** El subgrafo de `render.ts` (`document.ts`, `fonts.ts`, `export/plan.ts`, `journey-layout.ts` y los tipos de `public-contract.ts`) solo usa React, `@react-pdf/renderer` y `node:path`. No toca la base de datos, la autenticación ni `process.env`.
- **Lo que recibe la maquetación** es justo lo que hay que mandar a otro hilo, y no lleva secretos:
  - la proyección pública `PublicCatalog`;
  - la fecha de la captura;
  - el logo, como data URI;
  - las fotos, como JPEG con sus medidas.
- **Qué usa de la proyección:** de las fotos, solo **cuántas hay** («Foto x de y») y el índice de cada una; además, la clave pública opaca de cada vivienda, que ya ve el lector y sirve de índice. No usa `src` (la ruta del proxy, con el slug), ni las claves de las fotos, ni `coverPhoto`.
- **Next 15.5.23:**
  - `@react-pdf/renderer` y `sharp` están en la lista de paquetes externos del servidor que trae Next (`server-external-packages.json`): se cargan de `node_modules` en tiempo de ejecución;
  - el webpack que trae Next reconoce `new Worker(new URL(…, import.meta.url))` de `worker_threads` (en su lista por defecto aparece «Worker from worker_threads»);
  - `next build` usa webpack (`"build": "next build"`).
  - **No se ha comprobado** que el worker funcione en el build compilado (es la puerta T1 del plan).
- **El despliegue** (según `CLAUDE.md` y `scripts/vps-autodeploy.sh`, no comprobado en el VPS):
  - `next start` se ejecuta en el checkout `/opt/smartbc-app`, con `node_modules` completo y PM2 de un solo proceso;
  - el build se compila en `.next.new`, se renombra a `.next` y se reescribe `distDir`;
  - las fuentes (`lib/pdf/fonts`) y el logo se leen desde `process.cwd()`, como ya hace #323.
- **En el repo no hay ningún mecanismo de hilos ni de procesos de cálculo que se pueda reutilizar.** El único precedente de trabajo pesado fuera del proceso web es ffmpeg, lanzado con `spawn` (`lib/services/video/ffmpeg.ts`).

### No comprobado

- La versión de Node, el número de vCPU y la memoria libre del VPS.
- El `proxy_read_timeout` de nginx.
- Cómo se comporta el worker en el build compilado, y después del renombrado `.next.new` → `.next`.

Un hilo aparte **no elimina** la competencia por la CPU ni por la memoria de la máquina. Si el VPS tiene pocas vCPU, la web seguirá algo más lenta mientras se genera un PDF, aunque su bucle de eventos ya no se pare. Ninguna medición local demuestra el rendimiento en producción.

## Opciones evaluadas

| Opción | Qué es | Valoración |
|---|---|---|
| **A. `worker_threads` compilado por Next** | Un hilo creado con `new Worker(new URL("./render-worker", import.meta.url))`. Webpack lo emite como un chunk aparte dentro de `.next`, y react-pdf se carga de `node_modules`. | **Recomendada**, si supera la puerta T1. Sin dependencias, sin servicios nuevos y sin pasos de build extra. Además, `worker.terminate()` permite **interrumpir de verdad la maquetación**, cosa que hoy no se puede. |
| **B. Proceso hijo (`child_process.fork`)** con un script propio | Sigue el precedente de ffmpeg y aísla del todo la memoria. | El script tendría que ser JS ya compilado. Eso exige un paso de build propio (cambia `vps-autodeploy.sh`) o ejecutar TypeScript en producción con opciones experimentales de Node. Además, otro proceso de Node consume unos 50–100 MB más. **Plan B** si A no supera T1. |
| **C. Hilo con el código TypeScript sin compilar** (`--experimental-strip-types` y el cargador del repo) | Evita depender de webpack. | Usa funciones experimentales de Node en producción, con una versión del VPS sin comprobar. **Descartada.** |
| **D. Servicio aparte de PM2** (un «servidor de PDF») | Separa del todo el trabajo. | Infraestructura nueva y otro proceso que vigilar; para un PDF de vez en cuando es desproporcionado. **Descartada.** |
| **E. Repartir la maquetación en trozos dentro del mismo hilo** | — | react-pdf maqueta en una sola llamada síncrona por pasada y no se puede trocear. **No es posible.** |
| **F. Abaratar las pasadas** (imágenes sustitutas en la primera) | — | Medido el 17 de octubre: solo ahorra un 15 %. **Insuficiente.** |
| **G. Cola en segundo plano y archivo guardado** | — | Rompe «nada de documentos generados guardados» y el modelo de una sola petición. **Descartada.** |
| **H. Paquetes de pool (piscina, tinypool)** | — | Serían dependencias nuevas, y con un solo PDF a la vez no hacen falta. **Descartada.** |

## Decisiones

- **D1 (17-10-2026):** el PDF ya está aprobado; ni su diseño ni su contenido se tocan.
- **D2 (17-10-2026):** el rendimiento se trata en una tarea aparte. Por ahora solo se planifica.
- **Pendiente O1:** qué pasa si el hilo **no puede arrancar** (ver «Preguntas abiertas»).

## Alcance

- Un módulo de maquetación en un hilo (`lib/pdf/catalog/render-worker.ts`) y su cliente (`render-in-worker.ts`).
  - El cliente lanza el hilo, le pasa los datos **sin secretos**, le **transfiere** las fotos sin copiarlas, recibe el PDF también transferido y lo termina si hace falta.
- **`generate.ts`** cambia una sola llamada: `renderCatalogPdf(…)` pasa a `renderInWorker(…, signal)`. Todo lo demás se queda en el hilo principal, como hoy:
  - el acceso;
  - la captura y la lectura coherente;
  - las fotos y sus comprobaciones;
  - la comprobación final de cada petición;
  - las respuestas.
- **El núcleo (`runner.ts`):** el turno se libera cuando el hilo **ha salido de verdad** (evento `exit`). Una cancelación o el fin del presupuesto **terminan el hilo**, también durante la maquetación.
- **Límites del hilo:**
  - uno a la vez, el mismo turno que hoy;
  - techo de memoria (`resourceLimits`), fijado tras medir;
  - entorno vacío (`env: {}`).
- Pruebas, mediciones antes y después en el mismo entorno, y la prueba del **build de producción compilado**.

## Fuera de alcance

- Cambios en el diseño, el contenido, el índice, las fuentes, las fotos o las reglas de privacidad del PDF.
- Más de un PDF a la vez. Solo se replantearía con una medición y una decisión de Fabricio aparte.
- Dependencias nuevas, servicios nuevos, cambios en el despliegue del VPS y migraciones.
- La importación de PDF de colaboradores: es la siguiente entrega funcional, con su propio expediente.

## Invariantes

- **El PDF es el mismo:** con los mismos datos, el texto, las páginas, el índice, los enlaces, las fuentes incrustadas y las imágenes (identificadas por su código, K5) coinciden con los del renderizado actual.
- **Autorización y coherencia en el hilo principal:**
  - el acceso del dueño o del enlace, la captura fija (K1), las fotos por clave contra S1 y la comprobación final por petición (K2) no cambian y **no se trasladan al hilo**;
  - el hilo recibe la **proyección pública saneada**: sin `src`, sin claves de fotos y sin `coverPhoto`, que quedan como marcadores vacíos que conservan cuántas fotos hay;
  - recibe también los bytes de las fotos, el logo y la fecha;
  - nunca recibe tokens, ids internos, slugs, URL, credenciales ni variables de entorno.
- **Nada persistente:** ni archivos temporales, ni PDF guardados, ni caché de documentos. Todo vive en memoria durante la petición.
- **Límites acotados:**
  - siguen la cola, los límites por enlace y por dueño, los tiempos máximos y las respuestas 404, 409, 429 y 503;
  - el turno nunca se libera mientras el hilo siga vivo;
  - un hilo que se termina o que falla no deja nada colgando.
- **Si el hilo falla** (excepción, falta de memoria, salida inesperada), la petición recibe un error claro y el siguiente PDF funciona.

## Datos e impacto

- **Sin migración, sin dependencias nuevas y sin variables de entorno obligatorias.** Solo una opcional si Fabricio elige el interruptor de O1.
- **Despliegue:** el chunk del hilo va dentro de `.next`. El merge lo despliega como cualquier PR, y también despliega lo que haya en `main` sin desplegar.
- **Memoria:** el hilo vive dentro del mismo proceso, así que su memoria cuenta en la RSS de PM2. Se mide y se acota.
- **CPU:** compite con la web. El bucle de eventos queda libre, pero la máquina sigue siendo la misma.

## Recuperación de migraciones

No hay migraciones.

## Recuperación del cambio

- **Vuelta atrás:** revertir el merge con un PR (`git revert`). El código vuelve a maquetar en el hilo principal, como #323.
- **Opcional (O1):** un interruptor `CATALOG_PDF_WORKER=0` en el entorno, que fuerza la maquetación en el propio hilo sin tocar el código. Lo cambiaría Fabricio en el VPS y exige reiniciar PM2.

## Criterios de aceptación

| # | Criterio |
|---|---|
| W1 | **Mismo PDF.** `scripts/pdf/check-catalog-pdfs.mts`, con el hilo, pasa entero (hoy son 529 comprobaciones). Para cada fixture, el hilo y el renderizado actual dan el mismo número de páginas, el mismo texto extraído por página y las mismas imágenes por página (por su código). |
| W2 | **Bucle de eventos libre** (en local, M2, la herramienta de `measure.mts`). Mientras se genera el PDF de 24 viviendas, el hilo principal no se bloquea más de 150 ms seguidos y el p99 de su retraso es de 50 ms o menos. Hoy son ~900 ms, dos veces. Los valores se presentan; no se prometen en producción. |
| W3 | **Respuesta de la web, antes y después en el mismo entorno** (`next start`, build compilado y simulador local). Se mide la latencia de una ruta ligera en reposo y durante el PDF de 24 viviendas, para el código de `main` y para el de la rama. Se presentan p50, p95 y máximo. Se espera que el máximo baje claramente frente a «antes»; si no baja, se informa antes de seguir. |
| W4 | **Duración:** el PDF de 1, 12 y 24 viviendas no tarda más de un 25 % que antes (en el mismo entorno). Se mide el arranque del hilo por separado. |
| W5 | **Memoria:** se mide la RSS pico del proceso y el heap del hilo, antes y después. Con esos datos se fija `resourceLimits`, que se presenta junto a los números. |
| W6 | **Terminación real:** cuando se cancela (no queda nadie esperando) o se acaba el presupuesto durante la maquetación, el hilo se termina (`exit` observado). El turno se libera solo después, y la petición siguiente funciona. |
| W7 | **Fallos acotados:** una excepción, falta de memoria o salida inesperada del hilo dan «failed» (500) a la petición, liberan el turno al salir el hilo y el PDF siguiente sale bien. No queda ningún hilo vivo. |
| W8 | **Sin secretos en el hilo:** dentro del hilo, `process.env` está vacío. El chunk compilado del hilo no contiene el cliente de la base de datos, la autenticación ni nombres de variables secretas (búsqueda en `.next`). Una prueba comprueba que el mensaje al hilo no contiene el token, los slugs, las claves `f`, los valores `u` ni `/p/`. |
| W9 | **Sin cambios de autorización ni de límites:** las 22 comprobaciones de rutas, las 103 de navegador, las pruebas de catálogos (K1, K2, K3) y la matriz de regresión siguen en verde. |
| W10 | **Build de producción:** `next build` emite el chunk del hilo. Después de renombrar `.next.new` → `.next` y reescribir `distDir` como el script de despliegue, y también desde **otra ruta absoluta**, `next start` genera un PDF válido de punta a punta (ruta del enlace con el simulador), que pasa las comprobaciones de W1. |
| W11 | **Nada persistente:** antes y después de generar no aparecen archivos nuevos en el directorio temporal ni en el proyecto. |
| W12 | **Copias de fotos:** las fotos van al hilo **transferidas**, sin copiarse (los `ArrayBuffer` quedan separados en el hilo principal), y el PDF vuelve transferido. Lo comprueba una prueba. |

## Preguntas abiertas

- **O1 · Si el hilo no puede arrancar** (falta el chunk, falla al cargar react-pdf…):
  - **A) Maquetar en el propio hilo, como hoy:** el PDF sigue funcionando, pero vuelve el parón. Se registra en el log con una etiqueta clara, y además se añade el interruptor `CATALOG_PDF_WORKER=0`.
  - **B) Responder 503:** la web no se para, pero el PDF no funciona hasta que se arregle o se revierta.
  - **Recomendación: A.** Es el comportamiento que ya está aprobado en producción, y el log permite detectarlo. Solo se aplica cuando el hilo no arranca; nunca a un fallo o a un tiempo agotado durante la maquetación, que siguen dando error.
- **Datos del VPS (opcional, recomendado):** para documentar lo que se supone del despliegue, Fabricio puede ejecutar en el VPS `node -v; nproc; free -m` (solo lectura) y pasar la salida. No bloquea la implementación.

## Aprobación

Pendiente. Aprobar la especificación permite preparar el plan definitivo, no implementar.
