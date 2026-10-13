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
| siguientes | paso de CI `test:catalogs`, este resultado y el registro del PR |

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
| Build de Next | CI del PR | Pendiente de la CI (en local haría llamadas a servicios externos reales durante el prerender, así que no se ejecuta). |

## Criterios de aceptación

| Criterio | Estado en la fase 1 | Evidencia |
| --- | --- | --- |
| AC1 solo Fabricio | Demostrado en local; **pendiente en vivo** | Tests SQL de denegación y de la siembra, tests de la guarda, redirección sin sesión. En vivo: falta comprobar que la siembra encuentra a `fabricio.andree@bcousinoprop.com` y que otro usuario recibe 404. |
| AC2 accesos | Demostrado en local; **pendiente en vivo** | Capturas de la HOME de prueba; enlaces a `/es/admin/clientes`, `/propiedades` y `/solicitudes`. |
| AC3 catálogos independientes | Demostrado en SQL local; **pendiente en vivo** | Escenario «independencia» de las pruebas SQL. |
| AC4a propiedades existentes | Demostrado en local; **pendiente en vivo** | Tests de referencias, prueba de interacción y funciones SQL. |
| AC4b portal | No es de esta fase | T16b (fase 3, tras G3). |
| AC12 aspecto visual | Dirección aprobada (D17); **aprobación final pendiente** | Capturas locales; la aprobación final se hace sobre lo implementado. |
| AC13 regresiones y CI | Regresiones locales en verde; **CI pendiente** | Ver «PR, CI y merge». |
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

<Se completa al abrir el PR.>
