# BCP-01 · HOME de Fabricio y catálogo editorial: resultado

Enlaces: [spec.md](spec.md) · [plan.md](plan.md)

## Base y commits

**Fase 1 (PR-1)**, rama `fabri/bcp-01-fase1`, base `ffcdc7e7b48fdb216c45e9bcf0f924bf20e23b9c` (`origin/main` el 2026-10-13, comprobado con `git ls-remote`). El `main` local (`1506dbc`), el stash y las demás ramas no se tocaron.

| Commit | Tarea |
| --- | --- |
| `921247a` | Expediente (spec, plan, resultado) |
| `d610126` | T1 · migración `0192_catalogs_core.sql`, pruebas SQL locales, reversión |
| `e27aac7` | T2 · guarda de servidor del dueño |
| `f1a3f8d` | T5 · portada Boutique y formato (se adelantó a T3 porque la estantería la usa) |
| `977b15d` | T3 · HOME «Mi espacio», menú solo para el dueño, datos de prueba locales |
| `e681aa0` | T4 · gestión de catálogos con propiedades existentes |
| `3e597ca` | Paso de CI `test:catalogs` |
| `f7e5ef1` | Resultado de la fase 1 |
| siguiente | Registro del PR y la CI |

Número de migración: en la base ya existían `0188`–`0191` (de otras tareas), así que la fase 1 usa `0192`. Se vuelve a comprobar antes del push.

## Verificaciones

Todas en el worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01` con Node 22.23.3 (keg-only, instalado para esta tarea), después de `npm ci`.

| Comprobación | Orden | Resultado |
| --- | --- | --- |
| Pruebas SQL de 0192 (Postgres 16 temporal, E7) | `BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/test-catalogs-core.sh` | 4 escenarios en verde, 77 comprobaciones: siembra con 1, 0 y 2 coincidencias (0 y 2 → nadie entra); `anon` y `authenticated` sin permiso en las 4 tablas y en las funciones; `forbidden` para otro staff, un cliente y un actor nulo; el dueño sí; títulos vacíos o largos rechazados; solo propiedades existentes de España no vendidas ni archivadas; duplicados; orden con faltantes, sobrantes o repetidos rechazado; independencia entre catálogos; cada operación sube la versión y los fallos no; un solo enlace activo; cascada al borrar una propiedad; migración aplicada dos veces; reversión que deja `properties` intacta y permite volver a aplicar. |
| Controles negativos de los tests SQL | `test_util.ok(false)` y `expect_error` sin error | Los dos terminan con error (exit 3): los tests detectan fallos. |
| Barreras del Postgres temporal | `run-local.sh` con carpeta vacía, con otro nombre, dentro del repo y con orden desconocida | Se niega en los 4 casos (exit 2). |
| Lint de migraciones | `python3 scripts/lint-migrations.py` | OK |
| Tests puros | `npm run test:catalogs` | En verde: acceso (dueño, otro staff, cliente, sin sesión, fallos de lectura → denegado), acción no ejecutada si no es el dueño, mensajes de error, formato (precio, «sin dato», planta sin ordinal), datos de prueba solo con `development` + `CATALOG_FIXTURES=1`, validación y referencias (BC, slug, URL propia; portales y dominios ajenos rechazados). |
| Tipos | `npx tsc --noEmit` | Sin errores |
| Guía tipográfica del admin | `npm run test:typography` | **Falla igual que en la base**: las mismas 15 infracciones previas (p. ej. `particulares/enrichment-section.tsx`), comprobado con `git archive` de `ffcdc7e`. Ninguna en archivos de BCP-01. La CI no ejecuta esta guía. No se corrige aquí (fuera de alcance). |
| Regresiones | `npm run test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `test:smartlink`, `test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2` | Todos en verde |
| Revisión visual local (E7) | `scripts/dev-fixtures.sh` (sin `.env`, Supabase en `127.0.0.1:9`) + Chrome headless sin red externa | HOME y gestión con datos sintéticos a 1440 px y en un marco real de 362 px: Fraunces, Karla y Lato cargadas; 0 desbordes tras las correcciones (portadas que escalan con su contenedor, filas que se adaptan a móvil sin ocultar el precio). La HOME real sin sesión redirige a `/login` (307). |
| Interacción del gestor (local) | Script con la librería `playwright` del proyecto sobre `/dev-fixtures` | 12 comprobaciones en verde: bajar, subir desactivado en el primero, quitar, URL de portal → aviso de fase 3, referencia no reconocida → aviso, BC válida → se añade, archivar desactiva añadir, la portada refleja el título. |
| Sin escrituras fuera del catálogo | Revisión de código: `grep` de `.insert/.update/.delete/.upsert` en el código de BCP-01; solo `rpc("catalog_*")` | Ninguna escritura directa; `properties` solo se lee. El flujo de importar por enlace no se ha tocado. |
| Build de Next | CI del PR | En verde en la CI (no se ejecuta en local porque haría llamadas a servicios externos reales durante el prerender). |

## Criterios de aceptación

| Criterio | Estado en la fase 1 | Evidencia |
| --- | --- | --- |
| AC1 solo Fabricio | Demostrado en local; **pendiente en vivo** | Tests SQL de denegación y de la siembra, tests de la guarda, redirección sin sesión. En vivo: falta comprobar que la siembra encuentra a `fabricio.andree@bcousinoprop.com` y que otro usuario recibe 404. |
| AC2 accesos | Demostrado en local; **pendiente en vivo** | Capturas de la HOME de prueba; enlaces a `/es/admin/clientes`, `/propiedades` y `/solicitudes`. |
| AC3 catálogos independientes | Demostrado en SQL local; **pendiente en vivo** | Escenario «independencia» de las pruebas SQL. |
| AC4a propiedades existentes | Demostrado en local; **pendiente en vivo** | Tests de referencias, prueba de interacción y funciones SQL. |
| AC4b portal | No es de esta fase | T16b (fase 3, tras G3). |
| AC12 aspecto visual | Dirección aprobada (D17); **aprobación final pendiente** | Capturas locales; la aprobación final se hace sobre lo implementado. |
| AC13 regresiones y CI | Regresiones locales y CI en verde; **repaso en vivo pendiente** | Ver «PR, CI y merge». |
| AC14 sin efectos en clientes ni en la disponibilidad | Demostrado por revisión de código; **pendiente en vivo** | La fase 1 solo escribe en tablas del catálogo. |
| AC5–AC11 | Fases 2–4 | — |

## QA de Fabricio

Pendiente: QA en vivo después del merge (lista en la descripción del PR).

## Revisión

Revisión adicional de Codex: no solicitada por Fabricio para la fase 1.

## Pendiente o no demostrado

- **Todo lo «en vivo»:** la siembra real, el acceso, las tablas en el Postgres de producción y la compatibilidad real solo se demuestran tras el merge. Las pruebas locales son sintéticas y no lo demuestran.
- **Diferencias con producción no comprobadas:** la versión de Postgres, los permisos y extensiones reales de Supabase y el esquema real de `auth`. Por eso los permisos se retiran de forma explícita.
- **Si la HOME da 404 a Fabricio en vivo:** la siembra no encontró exactamente un usuario con ese correo. Fabricio ejecuta, en solo lectura, `select id, email from auth.users where lower(email) = 'fabricio.andree@bcousinoprop.com';` y, si hace falta, se prepara una migración con el UUID que él aporte.
- **Interfaz en español:** la página y el gestor están en español. El menú y la cabecera tienen las claves en los cuatro idiomas del CRM.
- **Guía tipográfica del admin:** fallo previo ajeno a BCP-01 (ver «Verificaciones»).
- **Caso T10 que se arrastra a la fase 2:** registrado en `plan.md` (lector que pinta la huella antes de que la HOME publique la confirmación).

## Recuperación

- **Código:** otro PR con `git revert` del merge. El código anterior no usa las tablas nuevas.
- **Datos:** `rollback-0192.sql` (en este expediente) borra solo los objetos de 0192 y sus datos de catálogo. Lo ejecuta una persona, no un agente, y luego hay que quitar su fila de `schema_migrations`. Se probó en el Postgres temporal (las tablas desaparecen, `properties` queda intacta y 0192 se puede volver a aplicar).

## PR, CI y merge

- **PR-1:** [#310](https://github.com/Bcousino890/smartbc/pull/310), `fabri/bcp-01-fase1` → `main`, 47 archivos, marcado como fusionable.
- **`origin/main` antes del push:** seguía en `ffcdc7e…` y `0192` seguía libre (comprobado con `git fetch` y `git ls-remote`).
- **CI en `f7e5ef1`:** en verde ([run 38417305124](https://github.com/Bcousino890/smartbc/actions/runs/38417305124), 3 min). Pasaron todos los pasos: TypeScript, particulares, Idealista, unificación de leads, Zinto v2, **Catálogos (nuevo)**, **build de Next.js** y lint de migraciones.
- **CI del último commit** (este registro): se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede disparar el despliegue y aplicar `0192` en producción según el script versionado.
- Se conservan el worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01` y la rama.

---

# Fase 2 · PR-2 «Enlace y lector en vivo»

## Base y commits

Rama `fabri/bcp-01-fase2`, base `0af50705bcab0a7855ab4bec66849268a633699e` (merge de #310; `origin/main` al empezar y otra vez antes del push, comprobado con `git fetch` y `git ls-remote`). Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-fase2`. El `main` local, el stash, las demás ramas y el worktree de la fase 1 no se tocaron.

| Commit | Tarea |
| --- | --- |
| `96629f5` | T6 · migración `0193_catalog_public.sql`, pruebas SQL, reversión |
| `937d624` | T6–T10 · contrato público, enlaces, lector C, sincronización, medición, datos de prueba |
| siguiente | Expediente de la fase 2 y registro del PR |

Número de migración: `0188`–`0192` ya existen, así que la fase 2 usa `0193` (el plan decía `0189`). Comprobado libre en `origin/main` antes del push.

## Qué hay

- **0193** (solo funciones nuevas, todas `SECURITY INVOKER`, `search_path` fijo, `EXECUTE` solo para `service_role`): `catalog_internal_snapshot`, `get_public_catalog`, `get_catalog_states`, `catalog_public_fingerprint` y `catalog_share_create/renew/revoke`.
- **Contrato público** (`lib/catalogs/public-contract.ts`, `to-public.ts`): lista cerrada de campos; fotos por `/p/{slug}/{i}.webp`; descripción y características **solo** si existe la versión limpiada para clientes en español y sigue correspondiendo al texto actual de la ficha.
- **Enlaces** (T7): crear (60 días por defecto, 1–365), renovar con el mismo enlace aunque haya caducado, revocar. Panel en la gestión del catálogo.
- **Lector** `/seleccion/[token]` (T8): C · Boutique, doble página desde 900 × 620 y una página por debajo, índice, galería, teclado, deslizar, cápsula «← n / N →», modo desplazamiento (recordado en el navegador), «reducir movimiento», D12 (siguiente, índice, vacío), aviso sin conexión, caducidad local y una única vista de «no disponible».
- **Sincronización** (T9, E4): `GET /api/seleccion/[token]/eventos` (SSE: `hello`, `update` con el contenido entero, `ping` cada 500 ms, `unavailable`) y `GET /api/seleccion/[token]/estado` (respaldo). Vigilante único por proceso cada 300 ms; las acciones avisan al guardar.
- **Medición** (T10, E5): `?medir=1` en la gestión y en el lector.
- **Datos de prueba** (T11): almacén en memoria y API de cambios solo con `NODE_ENV=development` + `CATALOG_FIXTURES=1`.

## Verificaciones

Todas en local (E7), con Node 22.23.3, datos sintéticos y sin red externa en el navegador.

| Comprobación | Orden | Resultado |
| --- | --- | --- |
| Pruebas SQL de 0192 + 0193 (Postgres 16 temporal) | `BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/test-catalogs-core.sh` | Todos los escenarios en verde, **145 comprobaciones**. 0193: instantánea sin UUID, correo del dueño ni URL de almacenamiento; huella que cambia con el precio de una propiedad que **no** es la última editada, con el borrado en cascada, al pasar a vendida/archivada (sale) o reservada (marca), con alta/baja/orden/portada/URL de fotos, `features`, `floor_override` y descripción limpia, orden y título; que **no** cambia con propiedades de fuera del catálogo; función de instantánea de una sola sentencia; revocado, caducado o archivado → `valid=false` con la misma huella; nuevo enlace tras revocar con otro token; renovar un enlace caducado lo reactiva con el mismo token; días fuera de 1–365, enlace duplicado, sin enlace y actor ajeno rechazados; `anon` y `authenticated` sin permiso en las 7 funciones; 0193 aplicada dos veces, revertida y vuelta a aplicar. |
| Lint de migraciones | `python3 scripts/lint-migrations.py` | OK |
| Tests puros nuevos (en CI) | `npm run test:catalogs-public` | **99 en verde**: privacidad del contrato (claves prohibidas, UUID, URL de almacenamiento, teléfono de otra agencia en la descripción, caché desfasada), días del enlace; vigilante con reloj simulado (cambio en ≤ 300 ms con contenido completo, `poke`, lector con huella vieja al darse de alta, latido verificado, una consulta por pasada, `unavailable` sin cambio de contenido, **0 temporizadores** sin lectores, guardado durante una consulta en curso); cliente (arranque con guardado durante el saludo, caída del SSE justo antes de guardar → visible ≤ 2 s por el respaldo, SSE que nunca conecta, revocación por SSE y por consulta, caducidad local sin red, aviso sin conexión, `stop()` sin temporizadores); D12; espera de gesto ≤ 0,38 s; medición (pintado antes de la confirmación → «≤ 0 s», A → B → A sin reutilizar la pintura vieja, versión posterior que no se empareja con un ensayo anterior, lector ausente → fallo, duplicados y otro catálogo ignorados, 20 × 2 → aprueba, > 2 s o un solo lector → fallo). |
| Tests puros de la fase 1 | `npm run test:catalogs` | En verde |
| Tipos | `npx tsc --noEmit` | Sin errores |
| Guía tipográfica | `npm run test:typography` | Las mismas 15 infracciones previas que en la base, ninguna nueva (comparado línea a línea). Fuera de CI. |
| Regresiones | `test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `test:smartlink`, `test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2` | Todos en verde |
| `/v`, `/s`, `/c`, `/compartir`, `/p` | `git diff 0af5070..HEAD` | Sin cambios |
| Lector e integración local | `scripts/dev-fixtures.sh` + Playwright del proyecto (Chrome con proxy a un puerto cerrado) | **52 en verde** a 1440 × 900 y 362 × 780 táctil: navegación, índice, galería, teclado, deslizar, cápsula, modo desplazamiento y su memoria, menos movimiento, catálogos de 1, 4 y 12 viviendas y vacío, título de 120 caracteres, descripción de 1.500, doce fotos, foto vertical, reservada, precio y planta sin dato, venta y alquiler, cierre con el teléfono de la agencia, sin UUID en el HTML, `noindex`, fuentes Fraunces + Karla, **0 desbordes**. En vivo: cambio de precio, D12 a la siguiente y al índice, galería abierta cuya vivienda se quita, vacío, revocación sin cambio de contenido, caducidad, token inexistente, SSE bloqueado → respaldo, sin conexión → aviso y vuelta. |
| Enlace en la gestión (local) | Playwright sobre `/dev-fixtures` | 10 en verde: 60 por defecto, 0/366/2,5 rechazados, crear, renovar (mismo enlace), revocar, 362 px sin desbordes. |
| Medición sintética de punta a punta | HOME de prueba `?vivo=1&medir=1` + 2 lectores `?medir=1` | 20 ensayos (5 altas, 5 ediciones, 5 órdenes, 5 retiradas) × 2 lectores = 40 resultados, 0 fallos, máximo 0,03 s; repetida dos veces. **Sintética: no demuestra D13 en vivo.** |
| Otras cifras locales (sintéticas) | — | Revocación vista en ~40 ms; respaldo sin SSE: cambio visible en 389–459 ms. |
| Build de Next | CI del PR | Ver «PR, CI y merge». |

Correcciones hechas durante la revisión local: índice que desbordaba con títulos largos, galería móvil con el botón de cerrar fuera de pantalla, modo desplazamiento y paso de página que ensanchaban la página en móvil, folio que pisaba una descripción larga, hueco sobre la foto en móvil y **título de la portada que recortaba descendentes y acentos** (`catalog-cover.module.css`, pieza de la fase 1: corrección mínima de un defecto real; también mejora las miniaturas de la HOME).

## Criterios de aceptación (fase 2)

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| AC7 D13 (≤ 2 s) | Instrumentado; **pendiente: medición en vivo de Fabricio** (20 × 2) | Tests con reloj simulado y medición sintética local. Las cifras locales no demuestran el objetivo en vivo. |
| AC8 D12 y casos límite | Demostrado en local; **pendiente en vivo** | Tests de `reader-state` e integración local. |
| AC9 caducidad, revocación y sin conexión | Demostrado en local y SQL; **pendiente en vivo** | Tests SQL, del cliente y de integración. |
| AC11 privacidad | Demostrado en tests | Tests SQL de la instantánea, tests del contrato y HTML del lector sin UUID. |
| AC12 aspecto del lector | Capturas locales; **aprobación de Fabricio pendiente** | Capturas a 1440 px y 362 px. |
| AC13 regresiones y CI | Regresiones locales en verde; CI en el PR | — |

## Pendiente o no demostrado

- **D13 en vivo**: solo lo demuestra la medición de Fabricio (instrucciones en el PR). Si no pasa, se diagnostica sin relajar el objetivo.
- **nginx y el SSE**: `X-Accel-Buffering: no` y `Cache-Control: no-transform` (este último evita también la compresión de Next). Si nginx lo retiene igualmente, el lector cae al respaldo (consulta cada 500 ms) tras 1 s de silencio; en la medición se notaría.
- **Descripción de las viviendas**: solo se enseña la versión ya limpiada para clientes (la genera hoy «Ver residencia» de las colecciones `/v`, en español). Sin ella, el lector muestra los datos estructurados y no la descripción. Generarla al añadir la propiedad sería escribir fuera de las tablas del catálogo: no se hace en esta fase.
- **Cambios desde otras pantallas** (precio, fotos, estado de una propiedad editada en su ficha): los recoge el vigilante en ≤ 300 ms porque la huella cubre la instantánea completa. Están dentro de D13; su comprobación en vivo queda pendiente.
- **Coste del vigilante**: con lectores abiertos, una consulta cada 300 ms que calcula la instantánea de cada enlace abierto. Sin lectores, nada.
- **Varios procesos**: el aviso inmediato de las acciones es del proceso; con un solo proceso de PM2 (lo documentado) no importa.
- Diferencias con producción no comprobadas: versión de Postgres, datos reales y nginx.

## Recuperación

- **Código:** `git revert` del merge en otro PR.
- **Datos:** `rollback-0193.sql` borra solo las 7 funciones (los enlaces creados quedan en `catalog_shares`, de 0192, pero nadie puede abrirlos). Lo ejecuta una persona y luego quita su fila de `schema_migrations`. Probado en el Postgres temporal.
- **Enlaces de QA:** revocarlos desde la gestión al terminar.

## Revisión

Revisión adicional de Codex: no solicitada para la fase 2.
