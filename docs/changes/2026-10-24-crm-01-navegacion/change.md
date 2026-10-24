# CRM-01 · Navegación con contexto y fluidez

Volver de una ficha a la lista de Propiedades sin perder filtros, página ni fila, y medir de verdad dónde se va el tiempo al navegar por el CRM.

- **Tamaño:** medio. Cualquier cambio posterior en identidad, autorización, vigencia de permisos o esquema de base de datos es grande o sensible y requiere su propio plan explícito.
- **Responsable:** Fabricio
- **Rama:** `fabri/crm-01-regreso-propiedades`: un solo PR, con el arnés y la línea base, la implementación y el resultado en commits separados
- **Estado:** plan aprobado; T0 implementado

## Especificación

### Contexto

Fabricio pidió un diagnóstico porque al pulsar «Volver» en una ficha de propiedad se pierden los filtros de la lista, y porque el CRM se siente lento. Un informe previo (24-10-2026) identificó la causa en el código y una lista de candidatos de rendimiento sin medir. Este expediente lo verifica sobre `origin/main` = `e0be8c7a` y lo reproduce en el build compilado (sección «Resultado»).

Comprobado en el código (`e0be8c7a`):

- **La lista guarda filtros y página en la URL.** Se escriben con `history.replaceState` (`properties-admin-client.tsx:288-332`) y se leen **solo al montar** (`useState(() => searchParams…)`, líneas 110-136).
- **«Volver» de la ficha apunta a la lista sin consulta** (`[slug]/property-edit-view.tsx:647-648`). Lo mismo ocurre al **borrar** (`router.push`, línea 173).
- **Los enlaces de las filas no llevan contexto de regreso** (`properties-admin-client.tsx:880`).
- **El interruptor de archivadas es un `<a href="?archivadas=0|1">`** (`propiedades/page.tsx:111-116`). Es una navegación de documento que sustituye toda la consulta. El servidor solo recibe `archivadas`, porque los filtros los escribe el cliente.
- **Rendimiento:** `getProperties(…, 2000)` envía todas las fotos de cada propiedad al cliente, que solo usa la portada y el número de fotos. No hay ningún `loading.tsx` útil en el admin. La sidebar no tiene estado de «pendiente». Identidad y permisos se leen varias veces por petición, sin `cache()`. El layout calcula sus contadores en secuencia.

### Decisiones

- `D1 (2026-10-24)`: «conservar la posición de lectura» = volver a la **fila de origen**, con un ancla en la URL y un resalte breve. No se guarda el píxel de scroll. Si la fila ya no está en esa página, la lista queda arriba.
- `D2 (2026-10-24)`: respuesta al clic (PR-B) = **esqueleto del módulo y elemento de la sidebar en estado pendiente** (`loading.tsx` + `useLinkStatus`), con los tokens de claro/oscuro.

### Alcance

**T0, línea base:**
- Arnés aislado: simulador con sesión sintética, datos sintéticos a escala y recorridos con Playwright.
- Reproducción del defecto.
- Mediciones de referencia.

**PR-A, contrato de regreso en Propiedades:**
- `volver=` en los enlaces de las filas, saneado con una lista blanca.
- «Volver» y «borrar» con contexto.
- Ancla a la fila.
- Archivadas conservando filtros.
- Página fuera de rango corregida.

**Siguientes entregas** (cada una con su propio plan):
- PR-B: respuesta inmediata al clic.
- PR-C: menos datos en la lista de Propiedades.
- PR-D: contadores, identidad y permisos, Clientes y Solicitudes.

### Fuera de alcance

- Persistir la selección múltiple entre ficha y lista.
- Propagar `volver` por ficha → story → ficha.
- Paginación en servidor.
- Cachés globales de identidad o permisos.
- Cambios de SQL, índices o esquema.
- Cambiar las reglas de negocio, los filtros o el universo de datos para ganar tiempo.

### Criterios de aceptación

| # | Criterio |
|---|---|
| AC1 | «Volver» desde una ficha abierta en la lista conserva los parámetros válidos, la página y la fila de origen (recorridos R1 y R3 del arnés). |
| AC2 | Atrás/Adelante y los controles internos no se contradicen, ni siquiera cuando la misma ruta cambia de consulta sin remontar (R2). |
| AC3 | Una URL explícita manda: ningún estado recordado la sobrescribe, y recargar reconstruye los filtros. No se añade al historial una entrada por cada tecla. |
| AC4 | Sin un origen válido (entrada directa, `volver` manipulado), el regreso es la lista del país actual. Ningún `volver` produce una ruta fuera de `/<país>/admin/propiedades`. |
| AC5 | «Ver/Ocultar archivadas» conserva los demás filtros y ajusta la página solo si ya no existe (R4). |
| AC6 | Borrar desde la ficha vuelve a la lista con contexto y no deja la ficha borrada en el historial. |
| AC7 | Sin sesión o con la cuenta suspendida, la lista sigue redirigiendo al login. Los tests de identidad de #361 siguen en verde sin cambios. |
| AC8 | Estilo, claro/oscuro y funciones actuales sin cambios, salvo el resalte de la fila (D1). |

### Impacto en datos y despliegue

Ninguno: sin migraciones, sin datos reales ni integraciones. T0 solo añade scripts de prueba y documentación. PR-A cambia código de cliente y una página del admin. Un merge a `main` despliega.

### Aprobación de la especificación

2026-10-24: Fabricio aprobó el plan CRM-01 (especificación y plan en un solo paso, desde el modo de planificación).

## Plan

### Base

`origin/main` = `e0be8c7af003f5b1f62d2cbe3a0a9f37ea41a06b` (`git ls-remote origin refs/heads/main`, 2026-10-24).

### Tareas

1. **T0 · Arnés y línea base** (este PR, sin cambios en la app):
   - `scripts/sim/postgrest-sim.mts`: nuevas opciones `--auth` (sirve `GET /auth/v1/user` solo para los tokens sintéticos del JSON) y `--latency <ms>` (espera simulada, anotada en el registro). Además entiende `or=(…)` de condiciones simples.
   - `scripts/sim/fixtures/crm-01-admin.gen.mts`: datos sintéticos deterministas.
     - 1.700 propiedades con 8-15 fotos cada una, 30 agencias, 20 etiquetas, 300 clientes y conversaciones.
     - Tres usuarios: propietario, asesor y cuenta suspendida.
   - `scripts/qa/crm-01-navegacion.mts`: recorridos R1-R7 más identidad.
     - Mide clic → primer cambio, clic → contenido útil y clic → red en reposo.
     - Repite la petición de cada navegación por separado, para contar sus consultas y su tamaño exactos.
   - Verificación: el arnés reproduce el defecto (rojo) y deja cifras de referencia en `medidas/`.
2. **PR-A · Regreso con contexto:**
   - `lib/properties/admin-list-url.ts` (puro), con test `scripts/test-admin-properties-list-url.mts` en CI.
   - Cambios en `properties-admin-client.tsx`, `property-edit-view.tsx` y `propiedades/page.tsx` (interruptor cliente).
   - Verificación: el mismo arnés en verde en R1-R4, `tsc`, los tests de CI y el build.
3. **PR-B, PR-C y PR-D:** según el plan aprobado, cada uno medido con este mismo arnés antes y después.

### Pasos de entorno que autoriza el plan

```sh
git -C ~/SMARTBC/smartbc ls-remote origin refs/heads/main
git -C ~/SMARTBC/smartbc worktree add -b fabri/crm-01-navegacion ~/SMARTBC/wt/crm-01 <SHA>
ln -s ~/SMARTBC/smartbc/node_modules ~/SMARTBC/wt/crm-01/node_modules   # next 15.5.23 = lockfile
mv .env.production <scratchpad>/crm-01-env.production.bak                 # sin leerlo; se restaura al cerrar
node --experimental-strip-types scripts/sim/fixtures/crm-01-admin.gen.mts <scratch>/fixture.json <scratch>/img
node --experimental-strip-types scripts/sim/postgrest-sim.mts 54371 <scratch>/fixture.json <scratch>/sim.jsonl <scratch>/img --auth [--latency 40]
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54371 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon \
  SUPABASE_SERVICE_ROLE_KEY=dummy-service NEXT_BUILD_DIR=.next.qa npx next build
# mismas variables + npx next start -H 127.0.0.1 -p 3271
BASE=http://127.0.0.1:3271 SIM_LOG=<scratch>/sim.jsonl OUT=<salida.json> VARIANT=escritorio|movil \
  node --experimental-strip-types scripts/qa/crm-01-navegacion.mts
# cierre: parar servidor y simulador, devolver .env.production, rm -rf .next.qa
```

### Aprobación del plan

2026-10-24: Fabricio aprobó el plan («User has approved your plan»).

## Resultado

### T0 · Reproducción en el build compilado

`next build` + `next start` de `e0be8c7a` (sin cambios en la app), con datos sintéticos y una sesión sintética de propietaria. Resultado: **11 de 29 comprobaciones del contrato en verde** en escritorio (11/28 en móvil).

| Recorrido | Observado en `e0be8c7a` |
|---|---|
| R1 lista → ficha → «Volver» | ❌ La fila enlaza a `/es/admin/propiedades/<slug>` sin contexto. «Volver» lleva a `/es/admin/propiedades` sin consulta: se pierden operación, distrito y página 2, y los controles vuelven a vacío. |
| R2 Atrás del navegador | ✅ Atrás restaura la URL filtrada, los controles y la página 2. ❌ Si se pulsa «Propiedades» en el menú estando en una lista filtrada, la URL queda sin consulta pero los controles siguen en «alquiler»: la lista no se remonta y el estado contradice la URL (confirma C1d). |
| R3 entrada directa / pestaña nueva | ✅ La entrada directa vuelve a la lista del país. ❌ La pestaña nueva abierta desde una lista filtrada vuelve sin filtros. |
| R4 archivadas | ❌ «Ver archivadas» deja solo `?archivadas=1` y «Ocultar» deja solo `?archivadas=0`. Además es una recarga completa del documento (23 consultas y 2,5 MB). |
| R8 página fuera de rango / borrar | ❌ Con `?pagina=999` se ve la última página, pero la URL sigue diciendo 999. ❌ Borrar desde la ficha vuelve a la lista sin filtros y deja la ficha borrada en el historial (`push`). |
| R9 lista → ficha → story → ficha → lista | ❌ El enlace a la story no lleva contexto, la story vuelve a la ficha sin él y la ficha vuelve a la lista sin filtros (también desde una pestaña nueva). ✅ Sin contexto, se acaba en la lista del país (salida segura). |
| R7 clics rápidos | ✅ Prevalece el último destino. |
| Identidad | ✅ Sin sesión → `/login`. Cuenta suspendida → `/login?suspended=1`. |

Por qué el síntoma se nota «a veces»: con Atrás del navegador los filtros vuelven, pero con el botón interno no.

### T0 · Línea base (local, no son tiempos de producción)

Mediciones en `medidas/base-escritorio.json`, `base-escritorio-lat40.json` (40 ms **simulados** por consulta) y `base-movil.json` (CPU 4× y red limitada, **simuladas**).

- «Aislada» = la petición de esa navegación repetida sola con sus mismas cabeceras: sus consultas son exactas.
- Sin latencia, los tiempos dependen sobre todo del renderizado y del simulador en memoria.

| Navegación | Consultas (aislada) | Respuesta sin comprimir / gzip | Útil, escritorio | Útil, 40 ms simulados | Útil, móvil simulado |
|---|---|---|---|---|---|
| Menú → Propiedades (RSC) | 9 | 2.102 KB / 158 KB | 335 ms | 573 ms | 1.843 ms |
| Lista → ficha (RSC) | 13 | 9 KB / 2 KB | 105 ms | 641 ms | 593 ms |
| Ficha → «Volver» (RSC) | 9 | 2.101 KB / 158 KB | 218 ms | 519 ms | 1.184 ms |
| Ficha → Atrás del navegador | 0 (caché del router) | — | 56 ms | 60 ms | 123 ms |
| Carga completa de la lista (documento) | 23 | 2.511 KB / 178 KB | 300 ms | 910 ms | 3.803 ms |
| «Ver archivadas» (documento) | 23 | 2.809 KB / 199 KB | 270 ms | 878 ms | 2.074 ms |
| Carga completa del panel `/es/admin` | 28 | 54 KB / 9 KB | — | — | — |
| Menú → Clientes (RSC) | 16 | 193 KB / 6 KB | 88 ms | 566 ms | 996 ms |
| Clientes → ficha (RSC) | 29 | 4 KB / 1 KB | 59 ms | 871 ms | 1.536 ms |
| Menú → Solicitudes (RSC) | 16 | 2 KB / 1 KB | 67 ms | 547 ms | 924 ms |

Qué dicen estos números:

1. **No hay respuesta visual inmediata.** En todas las navegaciones internas, el primer cambio en pantalla llega casi a la vez que el contenido útil: con 40 ms simulados, menú → Propiedades da primer cambio en 536 ms y útil en 573 ms. Mientras tanto la pantalla anterior sigue igual. Esto confirma C4 en la práctica y es lo que ataca PR-B (D2). En móvil, el «primer cambio» de los clics del menú es el propio menú cerrándose, no una indicación de carga.
2. **La lista de Propiedades pesa 2,1 MB sin comprimir por navegación**, y el **58 % (1,26 MB) son los arrays de fotos** (17.365 fotos para 1.511 propiedades visibles). La fila solo usa la portada y el número de fotos. Las URL sintéticas son más cortas y más repetitivas que las reales, así que en producción la proporción y el tamaño comprimido serán probablemente **mayores**; está pendiente de medir allí. En móvil, procesar esa respuesta genera hasta ~310 ms de tareas largas en el navegador. Esto justifica PR-C.
3. **C6 se matiza:** en una navegación interna el layout del admin **no** vuelve a ejecutar sus contadores. La petición aislada de Propiedades no toca `visit_requests`, `crm_notifications` ni `team_*`. Los contadores (6 consultas de mensajes, una por conversación) solo se ejecutan en cargas completas de documento: entrada, recarga o «Ver archivadas». La carga completa del panel `/es/admin` suma 28 consultas.
4. **Lo que sí se repite en cada clic:**
   - El middleware: 2 `getUser` y 1 `profiles` por petición, también en cada precarga.
   - La página: su propio `getCurrentProfile`.
   - `GET /api/admin/notifications`, que se dispara de nuevo en cada navegación.
   - Las precargas automáticas: al entrar en `/es/admin` se precargan 20 rutas, cada una pasa por el middleware.
5. **Clientes → ficha = 29 consultas en una sola petición** (7 de `profiles`) y **Solicitudes = 16** (6 de `lead_inbox_facts`). Es el candidato de PR-D.

### Medición en producción (opcional; la ejecuta Fabricio)

Pegar en la consola de DevTools del CRM real **después** de navegar por el recorrido. Solo devuelve la ruta sin consulta, la duración y el tamaño; no lee cookies, tokens ni contenido. No exportar HAR, porque contiene cookies.

```js
copy(JSON.stringify(performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation"))
  .filter((e) => e.entryType === "navigation" || e.name.includes("_rsc="))
  .map((e) => ({ ruta: new URL(e.name).pathname, ms: Math.round(e.duration), kb: Math.round((e.transferSize || 0) / 1024), tipo: e.entryType === "navigation" ? "documento" : "rsc" }))))
```

### Verificaciones

| Comprobación | Dónde | Resultado |
|---|---|---|
| `git ls-remote origin refs/heads/main` | local | `e0be8c7a`, igual que la base del informe |
| `next build` con variables dummy y sin `.env.production` | `wt/crm-01` | correcto (~75 s) |
| Arnés, escritorio | `next start` :3271 + simulador :54371 | 11/29 en verde; los fallos son la reproducción |
| Arnés, escritorio con 40 ms simulados | ídem, `--latency 40` | 11/29 |
| Arnés, móvil simulado | ídem | 11/28 (R7 solo en escritorio) |
| Peticiones externas | arnés | solo teselas de `tile.openstreetmap.org` (mapa de la ficha), abortadas |

### Criterios de aceptación

| Criterio | Estado | Evidencia |
|---|---|---|
| AC1-AC6 | fallido en `e0be8c7a` (esperado: es la reproducción) | `medidas/base-escritorio.json` |
| AC7 | demostrado en `e0be8c7a` | arnés, sección «Identidad» |

### Revisión

Sin revisión de Codex: no se ha pedido.

### Pendiente o no demostrado

- Los tiempos son locales o con latencia simulada; los de producción los obtiene Fabricio con el fragmento de consola.
- El recuento real de propiedades por país, archivadas incluidas, frente al tope de 2.000 (C3b) lo confirma Fabricio.
- La medición no cubre el recorrido 8 del informe (guardar o archivar y volver con datos que cambian): el simulador no guarda escrituras. PR-A lo cubre por diseño (siempre se vuelven a pedir los datos) y con la prueba de borrado.

### PR, CI y merge

Pendiente de abrir. El merge lo hace Fabricio y despliega.
