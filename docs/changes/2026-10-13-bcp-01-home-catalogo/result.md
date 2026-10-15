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

## PR, CI y merge (fase 2)

- **PR-2:** [#311](https://github.com/Bcousino890/smartbc/pull/311), `fabri/bcp-01-fase2` → `main`.
- **`origin/main` antes del push:** seguía en `0af5070…` y `0193` seguía libre (`git fetch` + `git ls-remote`).
- **CI en `694696d`:** en verde ([run 38428360720](https://github.com/Bcousino890/smartbc/actions/runs/38428360720)): TypeScript, particulares, Idealista, leads, Zinto v2, Catálogos (fase 1), **Catálogos (contrato público, sincronización y medición)**, **build de Next.js** y lint de migraciones.
- **CI del último commit** (este registro, solo documentación): se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede desplegar y aplicar `0193` en producción con el script versionado. Después, QA en vivo y la medición de D13 (instrucciones en el PR).
- Se conservan el worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-fase2` y la rama.

---

# Ampliación · PR-A «Marca, contacto y cierre» (X0–X3)

## Base y commits

Rama `fabri/bcp-01-amp-a`, base `f770e544360c350e5821701a83f857d4136decf0` (merge de #311), comprobada **en remoto** con `git ls-remote` al preparar el worktree y otra vez antes del push. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-amp-a`. No se tocaron el `main` local (`1506dbc`), el stash ni los worktrees de las fases 1 y 2.

| Commit | Tarea |
| --- | --- |
| `430671e` | X0 · especificación, decisiones (D18–D23, P1–P9, máximo de 1 a 24 aprobado) y plan aprobados en el expediente |
| `efa2067` | X1 · migración `0194_catalog_contact.sql`, pruebas SQL y `rollback-0194.sql` |
| `73eafdf` | X2 · contacto editable: validación, creación y gestión, contrato público desde el catálogo |
| `87a9063` | X3 · logo, cierre «Hablemos», barra móvil y señal de desplazamiento |
| siguiente | Este resultado |

`0194` era el número libre en `origin/main` antes del push.

## Qué cambia

- **Contacto público por catálogo** (`catalogs.contact_name`, `contact_phone` en E.164 y `contact_role`).
  - Lo ven la portada («Preparada por») y el cierre.
  - **Solo cambia lo que se muestra:** el nombre puede ser de otra persona y eso no le da acceso a Mi espacio (`home_owners` no cambia; probado en SQL).
  - El lector lo toma **solo** del catálogo; nunca recurre al perfil ni a una constante. Si falta un dato, esa línea no se pinta.
- **Catálogos existentes:** la migración los rellena con tu nombre de perfil, `+34 641 457 123` y «asesor», que es lo que ya se veía.
- **Catálogo nuevo:** el formulario precarga los mismos valores y se pueden cambiar antes de crear.
- **Regla #297:** intacta fuera de los catálogos. Un test lo vigila con la firma de correo y comprobando que nadie fuera del módulo usa el contacto editable.
- **Logo oficial** en la portada y en el cierre.
  - Es `public/logo.png` tal cual, sin filtros y con su proporción 6,32:1.
  - Contraste medido de 15,4:1 sobre el papel.
  - Se oculta en las miniaturas de la HOME de menos de 220 px.
- **Cierre «Hablemos»** según la maqueta aprobada:
  - logo, filete, «Contacto» y «Hablemos»;
  - tarjeta con «Tu asesor/a» y el nombre;
  - **una sola acción**, «Llamar» (`tel:`), y el número escrito debajo;
  - vigencia del enlace.
  - Sin WhatsApp, correo ni envíos.
- **Navegación en una página (móvil):** una barra **opaca de ancho completo** fija abajo.
  - La página reserva su altura más el área segura, y `scroll-padding` evita que un control enfocado quede debajo.
  - En la doble página, la cápsula sigue igual.
- **Texto largo en la doble página:**
  - el texto se desvanece abajo y aparece «Sigue leyendo ↓»;
  - la zona se puede enfocar con el teclado;
  - Av/Re Pág la desplazan sin pasar de página y ← → siguen pasando de página.

## Verificaciones (locales, datos sintéticos, E7)

| Comprobación | Resultado |
| --- | --- |
| SQL 0192 + 0193 + 0194 (`scripts/sql/test-catalogs-core.sh`, Postgres 16 temporal) | Todos los escenarios en verde, **257 comprobaciones**. Detalle de 0194: <br>• relleno de un catálogo creado antes de 0194; <br>• la instantánea conserva las claves de 0193 y añade `contact`; <br>• guardar el mismo contacto no cambia la huella; editarlo la cambia y sube la versión; <br>• validaciones de nombre, teléfono y rol, y nada se guarda si fallan; <br>• otro staff, un cliente y un actor nulo → `forbidden`; <br>• el asesor nombrado no entra en `home_owners`; <br>• `catalog_create` (firma de 0192) guarda los valores por defecto y `catalog_create_v2` el elegido; <br>• un perfil sin nombre válido no hace inventar un nombre; <br>• las restricciones protegen también escrituras directas; <br>• `anon` y `authenticated` sin permiso; <br>• 0192 y 0193 intactas; <br>• 0194 aplicada dos veces, revertida (y comprobado lo revertido) y vuelta a aplicar, con los tests de 0193 en verde después. |
| Lint de migraciones | OK |
| `npm run test:catalogs-public` (en CI) | 111 en verde: los 99 de la fase 2, que siguen pasando, y 12 nuevos sobre la validación (mismas reglas que SQL), el formato, el contrato sin perfil ni constante y la regla #297 intacta |
| `npm run test:catalogs`, `tsc --noEmit` | En verde |
| Regresiones (`viewing-collections`, `client-shortlist`, `portal-links`, `smartlink`, `particulares`, `idealista`, `lead-merge`, `zinto-v2`) | Todas en verde |
| `test:typography` | Las mismas 15 infracciones que en la base, ninguna nueva (fuera de CI) |
| `/v`, `/s`, `/c`, `/compartir`, `/p`, `lib/mailbox`, `lib/viewing-collections` | Sin cambios (`git diff`) |
| Lector de la fase 2 (Playwright, 1440 y 362 px) | 52 en verde con el código nuevo |
| PR-A en el navegador (Playwright, 1440, 362 y 320 px) | **54 en verde**: <br>• logo en la portada con su proporción y sin filtro; <br>• cierre con logo, «Tu asesor», nombre y número, una sola acción `tel:`; <br>• contacto editado con el lector abierto, visible en 2–3 ms (**sintético**); <br>• señal de desplazamiento: visible, enfocable, Av Pág desplaza el texto sin pasar de página, desaparece al final, ← sigue pasando de página; <br>• **la barra móvil no tapa nada**: al final de la página, con cada control enfocado y con los avisos de D12 y sin conexión, en la vivienda, el cierre, el índice y el modo desplazamiento; <br>• 0 desbordes; sin errores de JS; <br>• HOME: el logo se ve en miniaturas de 220 px o más y se oculta por debajo; crear precarga el contacto; <br>• gestión: precarga, teléfono inválido → aviso, guardar, el contrato público ya trae el contacto nuevo, 362 px sin desbordes. |
| Medición sintética 20 × 2 (fase 2) y panel del enlace | En verde (40/40, máximo 0,04 s; **local y sintético**) |

**Observaciones de la revisión visual:**
- Las capturas de página completa en móvil pintan la barra fija donde acaba la primera pantalla. Por eso la evidencia de móvil son capturas de pantalla a distintas alturas, más la comprobación programática de que nada queda tapado.
- En local aparece la insignia redonda «N» de Next, que es solo de desarrollo y no existe en producción.
- Con la emulación sin conexión de Playwright, un SSE ya abierto no se corta. El aviso «sin conexión» se probó con la API del lector inaccesible desde el arranque, igual que en la fase 2.

## Criterios

| Criterio | Estado |
| --- | --- |
| AC15 logo | Demostrado en local; **aprobación visual en vivo pendiente** |
| AC16 contacto editable | Demostrado en SQL y en local; **pendiente en vivo** |
| AC17 cierre | Capturas locales; **aprobación visual de Fabricio pendiente** |
| Condición 1 (barra móvil) | Demostrado en local a 362 y 320 px; **pendiente en un móvil real** |
| D13 para los cambios de contacto | Instrumentado (el guardado del contacto es un ensayo más con `?medir=1`); **medición en vivo pendiente** |

## Compatibilidad del despliegue y recuperación

- **Tras tu merge:** el despliegue compila, aplica `0194` y después cambia de versión. Mientras tanto, el build anterior sigue funcionando con la base nueva:
  - `catalog_create` mantiene su firma y ahora guarda el contacto por defecto;
  - la instantánea conserva todas las claves de 0193.
- **Si el despliegue vuelve al build anterior** (rollback del build), **el esquema no se revierte solo**. `0194` queda aplicada, lo que es compatible (ver arriba), y el lector anterior seguiría mostrando el perfil y el teléfono fijo.
- **Revertir de verdad:**
  - otro PR con `git revert` del merge;
  - `rollback-0194.sql`, que ejecuta una persona y que **borra los contactos editados**;
  - después, quitar la fila de `schema_migrations`.
  - Probado en el Postgres temporal.

## QA en vivo de Fabricio (tras el merge)

1. Abre la HOME. Las portadas grandes muestran el logo arriba y las miniaturas pequeñas, no.
2. En un catálogo de QA con enlace, abre el lector en otra ventana y ve al cierre. Comprueba el logo, «Tu asesor», tu nombre, «Llamar» y `+34 641 457 123`.
3. En la gestión, «Contacto que verá el cliente»:
   - pon otro nombre, otro móvil y «Tu asesora», y guarda;
   - el lector abierto cambia la portada y el cierre solo;
   - «Llamar» marca el número nuevo.
4. Escribe un teléfono incorrecto: aparece un aviso y no se guarda.
5. Comprueba que la persona nombrada (si es staff) **no** ve «Mi espacio» ni puede abrir `/es/admin/mi-espacio`.
6. Crea un catálogo: el formulario trae tu nombre, el teléfono de la agencia y «Tu asesor».
7. Un catálogo antiguo se ve igual que antes, con el logo añadido.
8. En el móvil:
   - recorre el lector hasta el cierre;
   - la barra de abajo no tapa ningún texto ni botón al final de cada página;
   - los avisos se leen.
9. En el escritorio, una vivienda con descripción larga muestra «Sigue leyendo ↓». Al hacer clic avanza el texto; con el foco en el texto, Av Pág lo desplaza.
10. D13: repite los 20 ensayos × 2 lectores de la fase 2 (puedes incluir cambios de contacto). Sigue pendiente también la medición de la fase 2.
11. Al terminar, revoca el enlace de QA.

## Pendiente o no demostrado

- Toda la QA en vivo de arriba, incluida la medición de 2 s (de esta entrega y de la fase 2).
- PR-B y PR-C empiezan tras tu merge y la QA de A.

## PR, CI y merge (PR-A)

- **PR-A:** [#312](https://github.com/Bcousino890/smartbc/pull/312), `fabri/bcp-01-amp-a` → `main`, marcado como fusionable.
- **`origin/main` antes del push:** `f770e54…`; `0194` libre.
- **CI en `d3b8f70`:** en verde ([run 38442435986](https://github.com/Bcousino890/smartbc/actions/runs/38442435986)). Pasaron TypeScript, las suites offline (incluidas las dos de catálogos), el **build de Next.js** y el lint de migraciones.
- **CI del último commit** (este registro, solo documentación): se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede desplegar y aplicar `0194`; el rollback del build no deshace el esquema.
- Se conservan el worktree y la rama.

## Revisión

Revisión adicional de Codex: no solicitada.

# Ampliación · PR-B «Zonas, precio, modo automático y anuncios» (X4–X9)

## Base y commits

Rama `fabri/bcp-01-amp-b`, base `f7bca42932aa51780cc0829ec7e31a67c65f98a7` (merge de #312, PR-A), comprobada **en remoto** con `git ls-remote` al preparar el worktree y otra vez antes del push. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-amp-b`. PR-A presente en la base (`0194_catalog_contact.sql`, contacto, logo y cierre).

| Commit | Tarea |
| --- | --- |
| `60d0199` | X4–X5 · `0195_catalog_selection.sql`: zonas de catálogo, criterios, selección automática, modo, búsqueda y anuncios; referencia TS, paridad TS ↔ SQL, pruebas SQL y `rollback-0195.sql` |
| `911663e` | X6 · medición de rendimiento base frente a 0195 (`scripts/sql/perf-catalogs.*`, `medidas/perf-pr-b-2026-10-13.tsv`) |
| `58c8363` | X7–X9 · gestión (zonas, precio, modo, buscador), anuncios, filtros de la HOME y medición con «sin cambio público» y camino del vigilante |
| siguiente | Este resultado |

## Qué hay

- **Zonas de catálogo (X4).** Taxonomía propia del catálogo (`lib/catalogs/zones.ts` = tabla `catalog_zone_terms`, 167 términos; un test exige que el bloque de la migración sea idéntico al que genera el código).
  - Chueca cuenta como Justicia, Malasaña como Universidad y Huertas como Cortes (alias solo del catálogo).
  - La taxonomía global (`lib/madrid-zones.ts`) y los textos de zona de las propiedades **no cambian** (probado).
  - El selector de barrio no ofrece los nombres populares, para no duplicar; el panel explica la equivalencia.
- **Criterios y selección automática (X5).** Varias zonas (distrito, barrio o texto libre), operación, precio mínimo/máximo, orden y máximo de 1 a 24 (12 por defecto).
  - Entra: España, sin archivar, disponible o reservada, **con al menos una foto**.
  - Venta compara `price`; alquiler compara `price` de un alquiler o `rent_price` de una dual; «venta y alquiler» no admite rango y pone primero la venta.
  - Precio 0 o vacío = desconocido: fuera si hay rango, al final si no.
  - Orden estable: grupo → precio (desconocidos al final) → más reciente → id. **Se filtra todo, se ordena y después se corta**; también se devuelve el total («4 de 5 coinciden»). Sin precorte de candidatos ni aproximaciones.
  - Claves públicas opacas y estables: la de la fila manual si la hay, si no `md5(key_salt‖id)` de 16 caracteres.
  - La lista manual **no se toca** al pasar a automático. Al volver: «Volver a mi lista anterior» (solo cambia el modo) o «Convertir la selección actual en lista manual» (sustituye la lista conservando claves y orden).
  - En automático **no hay** añadir, quitar ni reordenar: las acciones de lista devuelven `catalog_auto` (sin modelo híbrido).
  - La instantánea de un catálogo manual es **idéntica** a la de 0194 (misma huella; probado con un catálogo creado antes de 0195).
- **Gestión (X7).** Panel «Zonas, precio y modo»: operación, chips de zonas, precio en € o €/mes, orden, máximo, «Guardar criterios», «Ver qué entraría» y cambio de modo con vista previa de qué entra y qué sale. Buscador manual con los mismos filtros (aquí sin exigir foto), total real, «Añadir» / «Ya está» y «Ver más».
- **Anuncios de origen (X8).** Tabla `catalog_ads`: un catálogo puede tener varios anuncios y un anuncio varios catálogos.
  - Se asocian desde **Fichas guardadas (solo lectura)** o pegando el enlace/código de Idealista. El enlace **se analiza, nunca se abre** (`lib/catalogs/ads.ts`).
  - Nota interna opcional (≤ 200). Sin escrituras en `properties` ni en `idealista_listings`; «Fichas guardadas» no cambia.
  - Todo pasa por acciones con `withHomeAccess` y por funciones SQL con `catalog_require_owner`; la tabla no tiene permisos para `anon`/`authenticated`.
  - **El lector público no recibe nada de anuncios** (ni la instantánea ni el contrato los incluyen).
- **HOME (X8).** Filtros por texto (título o código de anuncio), anuncio de origen, zona, operación, modo y estado (por defecto «Activos»), con recuento «N de M». Cada tarjeta dice el modo, el resumen de criterios y cuántos anuncios tiene.
- **Medición (X9).**
  - Un guardado que no cambia lo público (misma huella) se apunta como «sin cambio público», **no cuenta** como ensayo y no espera lectores.
  - «Sin aviso inmediato» guarda sin avisar al vigilante: mide el camino de un cambio hecho desde la ficha (filas «(vigilante)»).
  - Se mantienen los casos de la fase 2: render antes del acuse, correlación por versión y huella, lector que falta = fallo. El CSV añade la columna «camino».

## Verificaciones (locales, datos sintéticos, E7)

| Comprobación | Resultado |
| --- | --- |
| SQL 0192–0195 (`scripts/sql/test-catalogs-core.sh`, Postgres 16 temporal) | Todos los escenarios en verde, **365 comprobaciones**. Detalle de 0195: <br>• catálogo manual creado antes de 0195: misma huella después; <br>• zonas y alias; criterios inválidos → `invalid_criteria`; <br>• casos de selección: foto, reservada, vendida, archivada, otro país, precio desconocido, duales, «venta y alquiler», desempates; <br>• máximo 24 de 30 candidatas con total 30; <br>• entra y sale sola una vivienda (huella y versión); claves estables; <br>• modo: vista previa, `restore`, `convert`, `mode_unchanged`, acciones de lista → `catalog_auto`; <br>• búsqueda con total y «ya está»; <br>• anuncios: alta por ficha y por código, duplicados, código o nota inválidos, ficha inexistente, quitar; <br>• otro staff, cliente o actor nulo → `forbidden`; `anon`/`authenticated` sin permiso; <br>• 0195 aplicada dos veces, revertida (comprobado lo revertido) y vuelta a aplicar. |
| Paridad TS ↔ SQL (generada, determinista) | 300 textos de zona y 40 juegos de criterios × 504 propiedades: lista ordenada y total **idénticos** (39 de 40 con resultado, totales hasta 275) |
| Lint de migraciones | OK |
| `npm run test:catalogs-public` (en CI) | **130 en verde**: los 111 de PR-A y 19 nuevos (taxonomía y alias, deriva migración ↔ código, criterios, selección, medición «sin cambio público» y «vigilante») |
| `npm run test:catalogs`, `tsc --noEmit` | En verde |
| Regresiones (`viewing-collections`, `client-shortlist`, `portal-links`, `smartlink`, `particulares`, `idealista`, `lead-merge`, `zinto-v2`) | Todas en verde |
| `test:typography` | Las mismas 15 infracciones que en la base, ninguna nueva (fuera de CI) |
| `/v`, `/s`, `/c`, `/compartir`, `/p`, `lib/mailbox`, `lib/viewing-collections`, `app/seleccion`, `app/api/seleccion`, contrato público | Sin cambios (`git diff`); del lado del lector solo cambia la medición compartida (`lib/catalogs/measurement.ts`, activa únicamente con `?medir=1`) |
| PR-B en el navegador (Playwright, 1440 y 362 px, `/dev-fixtures`) | **40 en verde**: <br>• HOME: activos por defecto, filtros por modo, anuncio (uno en dos catálogos), código, zona, alquiler, archivados; resumen de criterios en la tarjeta; <br>• gestión: barrio Justicia sin «Chueca» en el selector, € y €/mes, mínimo > máximo y máximo 25 → aviso sin guardar; «Ver qué entraría» = 5 de 5 (Chueca entra por Justicia; fuera la sin foto, la vendida y la sin precio); <br>• buscador: 6 de 6 (incluye la sin foto), «Añadir» → «Ya está» y entra en la lista; <br>• paso a automático con vista previa → «4 de 5 coinciden», sin añadir, flechas ni quitar; «Volver a mi lista anterior» recupera la lista con lo añadido; «Convertir» deja como manual la selección automática en su orden; <br>• anuncios: ficha ya asociada desactivada, asociar con nota, URL ajena → aviso, enlace de Idealista → solo el número, quitar; <br>• 0 desbordes a 1440 y 362 px; sin errores de JS. |
| Medición sintética 20 × 2 con X9 | **PASA**: 20/20 ensayos, 40/40 resultados, máximo 0,26 s; **5 por el camino del vigilante** y **2 «sin cambio público» apuntados aparte** (no cuentan). **Local y sintético.** |
| Lector (fase 2), enlace y PR-A en el navegador | 52, 10 y 54 en verde con el código nuevo (dos selectores de prueba ajustados porque el panel nuevo añade otro campo numérico y botones «Quitar …» en los chips de zona) |

No se midió el reparto SSE con 2/10/50 lectores: en `/dev-fixtures` no hay base de datos y el resultado solo mediría el bucle de Node.

## Rendimiento (X6) · ⚠️ decisión pendiente antes del merge

Postgres 16 temporal en este Mac, datos sintéticos (`scripts/sql/perf-catalogs.sh`, 10 vueltas de calentamiento, p50/p95/máx. en ms). Tabla completa en `medidas/perf-pr-b-2026-10-13.tsv`; planes con `EXPLAIN ANALYZE` revisados. **No es producción**: otra máquina, otra carga y otro reparto de zonas.

| Propiedades | Manual: instantánea | Auto: instantánea (p50) | `get_catalog_states` auto ×5 | auto ×20 | mixto 5 + 5 |
| --- | --- | --- | --- | --- | --- |
| 2.000 | 0,8 ms (base 0,7) | 5–7 ms | 36 ms (p95 40) | 137 ms (p95 143) | 39 ms |
| 10.000 | 0,8 ms (base 0,7) | 17–24 ms | 109 ms (p95 151) | 434 ms (p95 774) | 105 ms |
| 40.000 | 0,9 ms (base 0,8) | 48–86 ms | 374 ms (p95 437) | 1.514 ms (p95 1.697) | 370 ms |

- **Catálogos manuales:** sin cambio medible frente a la base (×20 enlaces: 15–16 ms frente a 12–13 ms).
- **Catálogos automáticos:** el coste crece con las propiedades **candidatas** (España, sin archivar, disponible o reservada) y con el número de **enlaces automáticos abiertos a la vez**.
  - Una pasada del vigilante consulta todos los enlaces abiertos, y `poke()` tras un guardado también lanza una pasada completa: el coste afecta a los dos caminos.
  - El presupuesto provisional de 50 ms (≤ 5 enlaces) **solo se cumple con unas 2.000 propiedades**.
  - Con 10.000 y 20 enlaces automáticos abiertos, cada pasada (~0,43 s) supera los 300 ms: las pasadas van una detrás de otra y la base trabaja sin pausa mientras haya lectores.
  - Con 40.000 y 20 enlaces, la pasada (~1,5 s) pone en riesgo D13 (2 s; el peor caso ronda 2 pasadas ≈ 3 s) y roza la ventana de 1,5 s del latido «verificado».
- Optimización ya aplicada (sin cambiar la semántica, con la paridad en verde tras cada paso): zonas por texto distinto y no por fila, lista de textos válidos en vez de unión por fila, CTE `MATERIALIZED` y foto al final.
- **No se ha añadido ningún índice global en `properties`** (no aprobado) y no parece que ayudara: casi todas las candidatas cumplen los filtros baratos.
- **Lo que hace falta de Fabricio:**
  1. Cuántas propiedades candidatas hay en producción (España, sin archivar, disponible o reservada). Si son del orden de 2.000, el plan sigue como está.
  2. Si son bastantes más, elegir antes del merge entre: (a) aceptar el coste con pocos enlaces automáticos abiertos a la vez; (b) un plan aparte con una señal fiable de cambio (p. ej. disparadores en `properties`/`property_photos` que marquen los catálogos automáticos afectados), que necesita aprobación. Bajar la frecuencia de comprobación de los automáticos cambiaría D13 y también requiere aprobación.

## Criterios

| Criterio | Estado |
| --- | --- |
| Zonas de catálogo con alias y paridad TS/SQL | Demostrado (SQL, paridad, unidades) |
| Selección automática: filtro completo → orden → máximo, total, entrada y salida | Demostrado en SQL y en local; **pendiente en vivo** |
| Cambio de modo reversible con vista previa | Demostrado en SQL y en local; **pendiente en vivo** |
| Anuncios reutilizables y filtros de la HOME | Demostrado en SQL y en local; **pendiente en vivo** |
| X9 medición con «sin cambio público» y camino del vigilante | Demostrado en local (sintético); **medición en vivo pendiente** |
| Rendimiento | Medido en local; **decisión pendiente** (ver arriba) |

## Compatibilidad del despliegue y recuperación

- **Tras tu merge:** el despliegue compila, aplica `0195` y después cambia de versión. Mientras tanto, el build anterior funciona con la base nueva:
  - todos los catálogos siguen en `manual` (valor por defecto), así que añadir, quitar y reordenar funcionan igual;
  - la instantánea manual conserva todas las claves y la huella de 0194;
  - las firmas de 0192–0194 no cambian.
- **Si el despliegue vuelve al build anterior**, **el esquema no se revierte solo**. `0195` queda aplicada, lo que es compatible mientras ningún catálogo esté en automático. Si ya hay alguno en automático:
  - su lector sigue mostrando la selección automática, porque la calcula SQL;
  - la gestión del build anterior enseña la lista manual guardada y, al intentar editarla, da un error genérico (`catalog_auto`).
  - Para volver a manual, usa el build nuevo o el rollback.
- **Revertir de verdad:**
  - otro PR con `git revert` del merge;
  - `rollback-0195.sql`, que ejecuta una persona y que **borra criterios, modo y anuncios asociados**. Los catálogos automáticos vuelven a su lista manual (la anterior, o la convertida si se convirtió);
  - después, quitar la fila de `schema_migrations`.
  - Probado en el Postgres temporal.

## QA en vivo de Fabricio (tras el merge y la decisión de rendimiento)

1. **HOME:** por defecto solo activos. Prueba cada filtro (texto, anuncio, zona, operación, modo, estado) y que el recuento «N de M» cuadra.
2. **Filtros en manual:** en un catálogo de QA, elige Salamanca + Justicia, venta, un rango de precio, y pulsa «Ver qué entraría». Comprueba que un piso de Chueca entra por Justicia y que no entran los sin foto, vendidos o sin precio.
3. **Buscador:** con los mismos filtros, añade una vivienda; pasa a «Ya está» y aparece en la lista.
4. **Avisos:** mínimo mayor que máximo, o máximo 25 → aviso y no se guarda.
5. **Paso a automático:** «Pasar a automático…» muestra qué entra y qué sale; confirma. La lista muestra «N de M coinciden» y no se puede añadir, quitar ni reordenar.
6. **Entrada y salida solas:** con el lector abierto, cambia desde la ficha de una propiedad algo que la haga entrar (p. ej. el precio o la primera foto) y otra que la haga salir (vendida). El lector se actualiza solo.
7. **Vuelta a manual:** prueba «Volver a mi lista anterior» (vuelve tu lista) y, en otro momento, «Convertir la selección actual en lista manual» (queda la selección en su orden).
8. **Anuncios:** asocia una ficha de «Fichas guardadas» con nota, pega un enlace de Idealista, intenta un enlace de otra web (aviso) y quita uno. El mismo anuncio puede ir en dos catálogos y la HOME los encuentra por él. Comprueba que el cliente no ve nada de anuncios en el lector.
9. **D13:** 20 ensayos × 2 lectores con `?medir=1`, incluidos algunos con «Sin aviso inmediato» (camino del vigilante). Guardar criterios en manual debe aparecer como «sin cambio público» y no contar.
10. Al terminar, revoca el enlace de QA.

## Pendiente o no demostrado

- La decisión de rendimiento de arriba (cifra de producción y, si hace falta, una opción aprobada).
- Toda la QA en vivo, incluida la medición de 2 s (de esta entrega y de las anteriores).
- PR-C empieza tras tu merge y la QA de B.

## PR, CI y merge (PR-B)

- **PR-B:** [#313](https://github.com/Bcousino890/smartbc/pull/313), `fabri/bcp-01-amp-b` → `main`.
- **`origin/main` antes del push:** `f7bca42…`; `0195` libre en `main` y en los 28 PR abiertos.
- **CI del último commit:** se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio **después de la decisión de rendimiento**. Puede desplegar y aplicar `0195`; el rollback del build no deshace el esquema.
- Se conservan el worktree y la rama.

## Revisión

Revisión adicional de Codex: no solicitada.

# Corrección tras la QA de PR-B · índice recortado

## Base y commits

Rama `fabri/bcp-01-indice`, base `7a9635cb58d4cc3493c368f2a5ffde3a8759eb58` (merge de #313, PR-B), comprobada en remoto. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-indice`.

| Commit | Qué |
| --- | --- |
| `84a7d25` | Índice dentro de la zona desplazable, datos sintéticos de 20 y 24 viviendas y guarda en `test:catalogs-public` |
| siguiente | Este resultado y las capturas |

## Defecto

En la QA en vivo de Fabricio (1280 × 720, 20 viviendas, 23 páginas), el índice se cortaba tras la entrada 11:
- la sección medía 610 px con `overflow: hidden`, y el contenido, 1006 px;
- la rueda no desplazaba nada (`scrollTop` en 0).

**Causa:** en la doble página (≥ 900 × 620) cada hoja tiene altura fija y `overflow: hidden`. Las descripciones largas ya se desplazaban dentro de su página (`ScrollRegion`, PR-A), pero la lista del índice no tenía zona propia.

Reproducido en local antes del arreglo (`capturas-indice/antes-1280-indice-20.jpg`):
- **también con 12 viviendas**, y también a 1440 × 1000 (860 px de hoja para 945 de contenido);
- con 20 viviendas a 1280 × 720, 610 px para 1054;
- en móvil no se recortaba, porque la página fluye.

## Arreglo

- La lista del índice va en la **misma `ScrollRegion`** que las descripciones largas (variante `index`). En la doble página se desplaza dentro de la hoja con:
  - el degradado abajo;
  - la señal **«Más viviendas ↓»** (un clic desplaza);
  - la zona enfocable y con nombre («Índice (se desplaza)»);
  - Av/Re Pág, que desplazan sin pasar de página (← → siguen pasando de página).
- Nada más cambia:
  - siguen todas las entradas, los títulos completos, los folios y el tamaño del texto;
  - la cabecera «En esta selección» no se mueve;
  - la composición Boutique y la navegación («Índice», ← →, clic en una entrada) siguen igual.
- En una página (móvil) y en el modo «Desplazar» el índice fluye entero y no aparece la señal.
- **No cambian:** la selección automática, el máximo, los filtros, el contrato público ni la base de datos. Sin dependencias ni migraciones.

## Verificaciones (locales, datos sintéticos, E7)

| Comprobación | Resultado |
| --- | --- |
| Índice en el navegador (Playwright): 12, 20 y 24 viviendas × 1280 × 720, 1440 × 1000, 362 y 320 px | **186 en verde**. En cada caso: <br>• todas las entradas, folios seguidos (3…N+2) y el título completo de la última (la de 24 lleva el de 120 caracteres); <br>• tamaño del título del índice sin reducir; <br>• ninguna entrada recortada por un contenedor sin desplazamiento; sin desbordes horizontales; sin errores de JS. <br>En la doble página: <br>• la señal y la zona enfocable aparecen solo si hace falta; <br>• la última **no** se ve al entrar; <br>• **rueda** → `scrollTop` > 0, la última a la vista (comprobado con `elementFromPoint`) y la señal desaparece al final, sin pasar de página; <br>• **clic** en la última → su página (N+2) con su título; el botón «Índice» vuelve; <br>• clic en la señal desplaza; Av Pág desplaza sin pasar de página; <br>• **teclado**: Tab llega a la última, queda a la vista y Enter la abre; <br>• modo «Desplazar»: la última se ve y no hay zona interna. <br>En móvil: <br>• se llega desplazando la página, la barra inferior no la tapa y **tocarla** abre su página. |
| Mismo diagnóstico con el código anterior | Recortada en los 6 casos de doble página (rueda sin efecto); móvil, bien |
| Lector (fase 2), enlace, medición 20 × 2, PR-A y PR-B en el navegador | 52, 10, 6, 54 y 40 en verde, sin tocar las pruebas |
| `npm run test:catalogs-public` (en CI) | **133 en verde**: los 130 de antes y 3 guardas nuevas (índice dentro de `ScrollRegion`, sin cortar la lista, hoja en columna flexible). La guarda principal falla con el código anterior (comprobado) |
| `test:catalogs`, `tsc`, 8 regresiones, lint de migraciones | En verde |
| `test:typography` | Las mismas 15 infracciones que la base, ninguna nueva |

**Capturas** en `capturas-indice/`:
- antes: 1280 × 720 con 20 viviendas, recortado;
- después, 1280 × 720 con 20 viviendas: al entrar y al final;
- 1440 × 1000 con 24 viviendas, al final;
- 362 px con 20 viviendas, al entrar;
- 320 px con 24 viviendas, al final.

La insignia redonda «N» es la de desarrollo de Next y no existe en producción.

**Táctil en la doble página** (tableta horizontal): la zona usa `overflow-y: auto`, que el navegador desplaza con el dedo. Playwright no simula ese gesto, así que **queda para tu QA en una tableta**.

## QA en vivo de Fabricio (tras el merge)

1. Abre el enlace de 20 viviendas a 1280 × 720 y ve al índice. Abajo se ve «Más viviendas ↓» y la lista se desvanece.
2. Usa la rueda sobre el índice hasta la entrada 20 y haz clic: abre la página 22.
3. Vuelve con «Índice». Con el teclado, recorre las entradas con Tab hasta la última y pulsa Enter.
4. A 1440 × 1000 y en el móvil, llega a la última entrada y ábrela.
5. Si puedes, prueba en una tableta horizontal que el índice se desplaza con el dedo.

## Pendiente o no demostrado

- La QA en vivo de arriba.
- **Sigue pendiente** lo de PR-B:
  - el recuento de producción, que ejecuta Fabricio;
  - la decisión de rendimiento y D13.
  - El recuento por sí solo no demuestra la latencia en vivo ni la capacidad. Nada de eso se da por cumplido aquí.
- PR-C no empieza hasta tu merge.
- Fuera del alcance de esta corrección, sin cambios:
  - la observación sobre fotos de marcador («pendiente de reportaje»), que no tiene regla aprobada;
  - la composición de la descripción, que pertenece a C.

## PR, CI y merge (corrección del índice)

- **PR:** [#314](https://github.com/Bcousino890/smartbc/pull/314), `fabri/bcp-01-indice` → `main`.
- **`origin/main` antes del push:** `7a9635c…` (sin cambios desde la base).
- **CI del último commit:** se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Sin migración: un rollback del build lo deshace por completo.

## Revisión

Revisión adicional de Codex: no solicitada.

# Ampliación · C1 «Ajustes del automático, explicación y portada» (Y0–Y5)

## Base y commits

Rama `fabri/bcp-01-c1`, base `57a13bd29c43a18bda2c637acabc301a7667cfd0` (merge de #314), comprobada en remoto al preparar el worktree y antes del push. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-c1`. `0196` libre en `main` y en los PR abiertos. Plan y decisiones: [`ampliacion-c-enmienda.md`](ampliacion-c-enmienda.md).

| Commit | Tarea |
| --- | --- |
| `1dc7522` | Y0 · enmienda de C, decisiones aprobadas, recuento de producción y plan C1/C2 |
| `8b8f09c` | Y1 · `0196_catalog_adjustments.sql`, pruebas SQL y `rollback-0196.sql` |
| `1efb0a2` | Y2 · referencia TS con ajustes, paridad TS ↔ SQL y explicación privada |
| `a2e7c46` | Y3–Y4 · gestión de ajustes, explicación y portada elegida (real y `/dev-fixtures`) |
| siguiente | Y5 · medición B frente a C1 (`perf-c1.sh`, `perf-c1-adjust.sql`), corrección de la instantánea (`OFFSET 0`) y este resultado |

## Qué hay

- **Ajustes del automático** (`catalog_adjustments`, un ajuste por vivienda):
  - **Excluir:** sale antes del máximo y su plaza la ocupa la siguiente coincidencia; la exclusión se conserva aunque la vivienda deje de coincidir.
  - **Incluir:** plaza asegurada, **mezclada en el orden de los criterios**. Se permite fuera de zona o de precio, **sin foto** (con aviso) y de **otra operación** (con aviso; grupo posterior ordenado por su propio importe, nunca comparado con precios de venta). No se pueden incluir vendidas, archivadas ni de fuera de España.
  - **Máximo 1–24:** se bloquea incluir o bajar el máximo cuando las inclusiones disponibles lo superarían («Sube el máximo o quita una inclusión»). Si una inclusión vendida vuelve a estar disponible y ya no cabe, entran las primeras del orden y la gestión lo avisa.
  - **Quitar el ajuste** devuelve la vivienda a los criterios. Los ajustes se conservan en manual y al «Convertir», y vuelven a aplicarse en automático. «Convertir» copia la lista efectiva con las mismas claves.
- **Explicación (solo gestión):** cada vivienda dice por qué está (zona, operación, precio) o que está incluida a mano y qué no cumple; avisos de sin foto, otra operación y no disponible; «Excluidas a mano» con «Volver a permitir»; «Inclusiones que hoy no aparecen»; el buscador (también «Todas las viviendas») dice por qué no entra cada una; aviso de zonas redundantes («Castellana ya está dentro de Salamanca»). Recuentos: «N de M coinciden» sin inclusiones; con ellas, «N en el catálogo · M coinciden · k incluidas a mano · e excluidas».
- **Portada elegida:** vivienda de la lista efectiva y una de sus fotos, independiente del orden. Respaldo: foto elegida → foto de portada de esa vivienda → primera vivienda con foto → sin foto. Avisos en gestión. La HOME toma la portada (y el recuento automático) de la **misma instantánea** que el lector.
- **Privacidad:** la instantánea solo gana `cover` (clave pública de la vivienda y el identificador opaco de la foto, el mismo `u` de las fotos) cuando hay elección; ni ajustes, ni explicación, ni criterios, ni anuncios, ni ids o URL de almacenamiento llegan al contrato público (test).

## Verificaciones (locales, datos sintéticos, E7)

| Comprobación | Resultado |
| --- | --- |
| SQL 0192–0196 (`scripts/sql/test-catalogs-core.sh`) | Todos los escenarios en verde, **549 comprobaciones**. Nuevos: <br>• **2f**: los tests de 0195 pasan sin cambios con 0196 aplicada dos veces; <br>• **2g** (80): huella de un manual y de un automático creados antes de 0196 sin cambios; exclusión y relleno; inclusión fuera de zona, sin foto y de otra operación en su sitio; bloqueos del máximo; vendida/archivada/Chile/inexistente rechazadas; una sola vez si ya coincide; quitar ajuste; excluir una incluida; inclusión vendida que libera su plaza y conserva el ajuste; inclusiones > máximo; claves estables y opacas; instantánea sin datos de ajustes ni UUID; vistas previas, búsqueda y recuentos; restore/convert/vuelta con los ajustes; portada (fuera de la lista, foto de otra vivienda, foto borrada, vivienda que sale y vuelve, manual, catálogo vacío); permisos (staff, actor nulo, `anon`, `authenticated`, RLS sin políticas, SECURITY INVOKER y search_path); `rollback-0196.sql` comprobado y 0196 reaplicada |
| Paridad TS ↔ SQL (generada) | 300 textos de zona y 40 criterios × 504 propiedades **con ajustes aleatorios**: lista, total, coincidencias y `via` idénticos (33 juegos con inclusiones, 24 con inclusiones fuera de criterios, 7 con más inclusiones que el máximo, 11 con otra operación en la lista) |
| `npm run test:catalogs-public` (en CI) | **159 en verde**: los 133 anteriores y 26 nuevos (selección con ajustes, explicación, zonas redundantes, portada y privacidad del contrato) |
| `test:catalogs`, `tsc`, 8 regresiones, lint de migraciones | En verde |
| `test:typography` | Las mismas 15 infracciones que la base |
| C1 en el navegador (Playwright, 1440 y 362 px, `/dev-fixtures`) | **30 en verde**: automático con explicación; excluir y volver a permitir; incluir fuera de zona (mezclada por precio), sin foto y de otra operación (al final); recuentos; bloqueo al bajar el máximo y al incluir una cuarta con máximo 3; quitar inclusión frente a excluir; el buscador se pone al día al actuar desde la lista; zona redundante; ajustes guardados en manual y aplicados al volver; portada elegida con foto concreta, respaldo al excluir su vivienda, vuelta y portada automática; 0 desbordes a 1440 y 362 px; sin errores de JS; el lector no recibe explicación, ajustes, criterios ni anuncios |
| Medición sintética 20 × 2 con las acciones nuevas | **PASA**: 20/20, 40/40, máximo 0,34 s; 12 ensayos por el camino del vigilante y 1 sin cambio público (no cuenta). **Local y sintético** |
| Lector (fase 2), enlace, medición 20 × 2, PR-A, PR-B e índice | 52, 10, 6, 54, 40 y 186 en verde. Una comprobación de PR-B que exigía «sin buscador en automático» (la regla «sin modelo híbrido») se adaptó a la regla aprobada en C1: en automático sigue sin campo de referencia, flechas ni «Quitar», y ahora tiene el buscador de incluir/excluir |

Capturas en `capturas-c1/` (inclusiones con su explicación, excluida, portada elegida, 362 px y medición). La insignia «N» es la de desarrollo de Next.

## Rendimiento (Y5)

Postgres 16 temporal en este Mac, datos sintéticos (`scripts/sql/perf-c1.sh`, 10 vueltas de calentamiento; p50/p95/máx. en ms). Tres fases sobre **los mismos datos**: **B** (0195), **C1** (0196 sin ajustes ni portada) y **C1+aj** (2 exclusiones, 2 inclusiones y portada elegida en cada uno de los 20 automáticos). El tamaño 1.000 tiene unas 840 candidatas, cerca de las **818** de producción. Tabla completa: `medidas/perf-c1-2026-10-14.tsv`. **No es producción** (otra máquina, otra carga) y **no demuestra D13**.

| Propiedades | Automática · instantánea (p50) B → C1 → C1+aj | Pasada del vigilante, 5 enlaces auto (p50, p95) | 20 enlaces auto (p50, p95) | Manual ×20 |
| --- | --- | --- | --- | --- |
| 1.000 | 3,6–6,3 → 4,3–6,8 → 4,5–7,0 | 28 (30) → 30 (32) → 31 (32) | 109 (116) → 120 (127) → 122 (141) | 15 → 15 → 15 |
| 2.000 | 5,2–7,2 → 6,1–7,9 → 6,3–8,1 | 35 (38) → 39 (43) → 47 (69) | 139 (142) → 162 (195) → 153 (162) | 15 → 15 → 15 |
| 10.000 | 20–24 → 17–22 → 15–22 | 123 (179) → 111 (356) → 99 (130) | 418 (509) → 513 (1.329) → 396 (419) | 18 → 16 → 15 |

- **Sobrecoste de C1 con 1.000–2.000:** del orden del **7–15 %** en las pasadas automáticas (una unión con las inclusiones y una ventana más en `catalog_select`); los catálogos manuales no cambian.
- **Referencias de evaluación** (no puertas automáticas): con 1.000 y 2.000, 5 enlaces automáticos quedan **por debajo de 50 ms** (30–47 ms de p50) y 20 enlaces **por debajo de 300 ms** (120–162 ms). Con 10.000, igual que en PR-B, 20 enlaces automáticos superan los 300 ms; ahí las tres fases quedan en el mismo orden y el ruido del equipo es mayor que la diferencia (p95 de 1,3 s en C1 frente a 0,4 s en C1+aj sobre los mismos datos), así que no se saca conclusión de C1 a ese tamaño.
- **Hallazgo y corrección durante la medición:** con portada elegida, la instantánea calculaba la lista **dos veces** (el planificador copiaba la subconsulta en cada uso). Medido: instantánea automática de 6,5 → 12,8 ms con 1.000. Se corrigió en `0196` con `OFFSET 0` (barrera de optimización): vuelve a 6–8 ms. La suite SQL completa (549) y las huellas siguen iguales.
- Sin índices globales ni disparadores. D13 (≤ 2 s) en vivo sigue **pendiente**.

## Compatibilidad del despliegue y recuperación

- **Tras tu merge:** el despliegue compila, aplica `0196` y cambia de versión. Mientras tanto el build anterior funciona con la base nueva: `catalog_select`, `catalog_auto_preview` y `catalog_property_search` devuelven columnas de más que el código anterior ignora; sin ajustes ni portada, las instantáneas y huellas son idénticas a las de 0195 (probado).
- **Si se vuelve al build anterior**, el esquema no se revierte solo. La base sigue aplicando los ajustes y la portada que ya existan (el lector las ve); la gestión antigua no puede editarlos (y sigue rechazando añadir/quitar a mano en automático).
- **Revertir de verdad:** `git revert` del merge + `rollback-0196.sql` (lo ejecuta una persona; lleva al principio una consulta de copia). **Se pierden** los ajustes y la portada elegida; los automáticos vuelven a ser solo criterios; la lista manual no se toca. Después, quitar la fila de `schema_migrations`. Probado en el Postgres temporal.

## QA en vivo de Fabricio (tras el merge)

1. En un catálogo de QA en automático con enlace abierto en otra ventana: **excluye** una vivienda. Sale en el lector y entra la siguiente; el recuento dice «… · 1 excluida» y aparece en «Excluidas a mano». «Volver a permitir» la devuelve.
2. Con el buscador en «Todas las viviendas», **incluye** una fuera de zona o de precio: entra en su sitio por precio, con «Incluida a mano · fuera de criterios» y el motivo. En el lector no lleva ninguna marca.
3. Incluye una **sin foto** (aviso) y una de **otra operación** (aviso; va al final).
4. Intenta **bajar el máximo** por debajo de las inclusiones y **añadir** una inclusión de más: aviso «Sube el máximo o quita una inclusión» y no se guarda.
5. «**Quitar inclusión**» frente a «**Excluir**»: la primera devuelve la vivienda a los criterios; la segunda la deja fuera.
6. Pasa a manual («Volver a mi lista anterior») y vuelve a automático: los ajustes siguen. Prueba también «Convertir».
7. **Portada:** elige una vivienda que no sea la primera y una foto suya. El lector y la HOME muestran esa foto; cambia el orden (precio descendente) y no se mueve. Excluye esa vivienda: aviso y respaldo; vuelve a permitirla y vuelve la elegida. «Volver a la portada automática».
8. **Explicaciones:** comprueba con tu catálogo de 64 coincidencias que los motivos te ayudan a validar el recuento y la selección.
9. **Privacidad:** en el lector no aparecen motivos, criterios, ajustes ni anuncios.
10. **D13:** 20 ensayos × 2 lectores con `?medir=1`, incluidos ajustes y cambios de portada (algunos «Sin aviso inmediato»). Sigue pendiente también la medición en vivo de las entregas anteriores.
11. Al terminar, revoca el enlace de QA.

## Pendiente o no demostrado

- La QA en vivo de arriba, incluido D13 (≤ 2 s) en el VPS: las mediciones de aquí son locales y sintéticas.
- C2 (descripciones y recorrido editorial) empieza tras tu merge y la QA de C1.

## PR, CI y merge (C1)

- **PR:** [#315](https://github.com/Bcousino890/smartbc/pull/315), `fabri/bcp-01-c1` → `main`.
- **`origin/main` antes del push:** `57a13bd…` (sin cambios desde la base); `0196` libre en `main` y en los 28 PR abiertos.
- **CI del último commit:** se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede desplegar y aplicar `0196`; el rollback del build no deshace el esquema.
- Se conservan el worktree y la rama.

## Revisión

Revisión adicional de Codex: no solicitada.

# Ampliación · C2 «Textos del catálogo y recorrido editorial» (Z1–Z7)

## Base y commits

Rama `fabri/bcp-01-c2`, base `06d5e88b913e860ae33d4afb61ac0c4b3dbc4053` (merge de C1), comprobada en remoto al empezar y otra vez antes del push. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-c2`. `0197` libre en `main` y en los 28 PR abiertos. Reglas aprobadas: [`ampliacion-c-enmienda.md`](ampliacion-c-enmienda.md) §8.

| Commit | Tarea |
| --- | --- |
| `409c732` | Z1 · `0197_catalog_texts.sql`, pruebas SQL y `rollback-0197.sql` |
| `5d80ff3` | Z2 · huella de la historia en un módulo puro (`source-hash.ts`), misma fórmula |
| `6a3797c` | Z3 · derivación editorial pura (`editorial.ts`) y reglas de texto (`text-rules.ts`) |
| `ef8f1f8` | Z4 · «Preparar» y «Borrador con IA» solo en el catálogo; comprobación determinista |
| `ef200e5` | Z5 · gestión de los textos (real y `/dev-fixtures`) |
| `78a3b74` | Z6 · lector por partes: apertura, recorrido y detalle; hoja continua en móvil |
| `ab19832` | Z5 · corrección: el editor conservaba mal los avisos al guardar (hallado en las pruebas de navegador) |
| `269ba73` | Z7 · medición C1/C2 e instantánea en una sola consulta |
| `62cf21d` | este resultado, la enmienda §8 y las capturas |

## Qué hay

- **Texto por catálogo y vivienda** (`catalog_texts`): borrador y publicado por separado. Guardar un borrador **no** cambia lo que ve el cliente (misma huella). Publicar copia el borrador y **sella la huella de la fuente** (texto de la ficha, características, m², dormitorios, baños, planta y operación; **no** precio ni disponibilidad). Retirar, borrar (con confirmación) y la reserva: si la vivienda sale de la lista, su texto se conserva hasta que se borre.
- **Prioridad en el lector:** texto publicado y vigente → historia aprobada vigente (comprobada con todas las versiones del motor) → descripción limpia vigente → solo datos y fotos.
- **Fuente cambiada:** el texto deja de verse, se conserva, la gestión dice qué cambió («Publicado · revisar (cambió los m²)») y el lector baja de nivel. Un cambio de precio no lo invalida.
- **IA solo al pulsar** con el proveedor ya configurado (hoy DeepSeek; sin cambiar configuración, sin dependencia nueva y sin estimar coste por llamada): «Preparar desde la ficha» usa la limpieza de siempre **sin escribir** en `property_client_descriptions`; «Borrador con IA» recibe solo hechos (sin precios, fotos ni contacto). Devuelven una **propuesta**; 60 s de máximo, «Cancelar», y una respuesta tardía nunca pisa lo editado.
- **Comprobación al publicar:** teléfono, correo, web y precio **bloquean** (en TS y otra vez en SQL); cifras y elementos que la ficha no dice son avisos que se confirman uno a uno. Los avisos se ven al abrir un borrador guardado.
- **Recorrido C · Boutique** (doble página): apertura (foto, título, precio, datos clave, entrada breve y hasta 3 puntos verificados) → hasta 3 dobles páginas de secciones breves alternando foto y texto → detalle con la ficha completa y la **descripción íntegra**. Si el texto no cabe en el recorrido, la última doble página enlaza al detalle. Solo los capítulos de una historia aprobada llevan título. **Una página (móvil):** una hoja continua por vivienda con todo el recorrido y la ficha y la descripción plegables.
- **Índice y folios** cuentan las partes; el índice da la apertura de cada vivienda. **D12 desde cualquier parte:** vivienda quitada → apertura de la siguiente con aviso → índice → estado vacío; si una parte deja de existir (texto acortado o retirado), la anterior que exista; reordenar no te mueve; girar/estrechar conserva la vivienda.
- **Aislamiento y privacidad:** nada de C2 escribe en `property_client_descriptions`, `properties.description` ni en las historias (prueba SQL); el contrato público no lleva borradores, huellas, fuente sellada ni UUID (prueba).

## Verificaciones (locales, datos sintéticos, E7)

| Comprobación | Resultado |
| --- | --- |
| SQL 0192–0197 (`scripts/sql/test-catalogs-core.sh`) | Todos los escenarios en verde, **683 comprobaciones**. Nuevos: **2h** (0197 aplicada dos veces, `rollback-0197.sql`, reaplicación) y **2i** (las pruebas de 0196 pasan sobre 0197); `test-catalog-texts.sql`: compatibilidad de la instantánea sin textos, clase de foto, borrador sin cambio de huella, `draft_changed`, bloqueos sin falsos positivos (años, m²), fuente cambiada, precio que no invalida, reserva, retirar, borrar, aislamiento de tablas globales, permisos, RLS y SECURITY INVOKER |
| `npm run test:catalogs-public` (en CI) | **219 en verde** (159 de C1 + 60 de C2: huella de la historia idéntica a la anterior, derivación editorial, IA falsa con tiempo agotado y cancelación, comprobación, lector por partes y D12 desde cada parte) |
| `test:catalogs`, `tsc`, `npm run build`, 8 regresiones (`smartlink`, `viewing-collections`, `client-shortlist`, `portal-links`, `particulares`, `idealista`, `lead-merge`, `zinto-v2`), lint de migraciones | En verde |
| `test:typography` | Las mismas 15 infracciones que la base |
| C2 en el navegador (Playwright, `/dev-fixtures`) | **186 en verde**: 1440 × 900 y 1280 × 720 (13 páginas, folios del índice 3/8/12, cada parte con su folio, descripción íntegra en el detalle, texto de 5.938 caracteres con enlace al detalle, Av Pág dentro del texto, galería desde una foto del recorrido, modo desplazamiento, «reducir movimiento»); 362 y 320 px (hoja continua, plegables, barra que no tapa, deslizar); **1, 12 y 24 viviendas** recorriendo **todas** las páginas sin desbordes a los cuatro tamaños (6/48/93 páginas en doble página, 4/15/27 en una); D12 en vivo desde recorrido, detalle y última, estado vacío, galería abierta, reordenar y cambio de composición; privacidad del contrato; gestión con IA falsa (cancelar, respuesta tardía que no pisa, borrador, avisos al reabrir, bloqueos de teléfono y precio, vista previa, publicar en vivo, retirar, fuente cambiada, borrar, reserva al excluir y vuelta); editor a 362 y 320 px |
| Regresiones del lector (fase 2, PR-A, PR-B, índice, enlace, C1) | 52, 54, 40, 187, 10 y 31 en verde. **Cambios de expectativa justificados:** en doble página cada vivienda tiene ahora varias partes, así que el catálogo de prueba pasa de 7 a **13** páginas y el de una vivienda de 4 a **6** (calculado de forma independiente desde el estado público); «índice → vivienda 2» va a la página **6** y se comprueba que es la que dice el índice; la señal «Sigue leyendo» se busca en el detalle, donde vive ahora la descripción larga; y la comprobación «la barra no tapa» ignora el contenido de un plegable cerrado (no se pinta; comprobado con `checkVisibility()` y captura). En móvil los recuentos no cambian |
| Medición sintética 20 × 2 publicando y retirando textos | **PASA** 20/20, 40/40, 10 por el camino del vigilante. Tres ejecuciones: máximo **1,46 s** con el equipo saturado (carga 53 por procesos del sistema) y **0,21 s y 0,22 s** con carga normal. C1 y fase 2 repetidas: PASA (0,29 s y 0,19 s). **Local y sintético** |

Capturas en `capturas-c2/` (apertura, recorrido, detalle, historia, solo datos, 24 viviendas, hoja móvil, D12, gestión con avisos, bloqueos, IA que no pisa, fuente cambiada, reserva y medición). La insignia «N» es la de desarrollo de Next.

## Rendimiento (Z7)

Postgres 16.13 temporal en un Mac (Apple M2, 8 GB, macOS 26.5), datos sintéticos (`scripts/sql/perf-c2.sh`, 10 vueltas de calentamiento; p50/p95/máx. en ms). Fases sobre **los mismos datos**: **C1** (0196 con 2 exclusiones, 2 inclusiones y portada en los 20 automáticos), **C2** (0197 sin textos ni historias) y **C2+textos**: texto de **5.879 caracteres** (el máximo es 6.000) publicado en **las 600 viviendas de los 40 catálogos** e historia aprobada de 7 capítulos en 1 de cada 3 propiedades. Es el peor caso, no el uso esperado. Tabla completa: `medidas/perf-c2-2026-10-14.tsv`. **No es producción** y **no demuestra D13**.

| Propiedades | Instantánea 24 viviendas (p50 · bytes) C1 → C2 → C2+textos | Vigilante, 5 enlaces auto (p50 / p95) | 20 enlaces auto (p50 / p95) | 20 enlaces manuales (p50) |
| --- | --- | --- | --- | --- |
| 1.000 | 4,4 → 5,4 → 7,4 ms · 38 KB → 38 KB → **221 KB** | 30 / 31 → 34 / 35 → **41 / 42** | 119 / 127 → 134 / 136 → **165 / 167** | 15 → 25 → 44 |
| 2.000 | 6,2 → 7,2 → 9,8 ms · 38 KB → 38 KB → 214 KB | 38 / 39 → 41 / 42 → **48 / 49** | 148 / 153 → 164 / 168 → **193 / 196** | 15 → 25 → 45 |
| 10.000 | 24 → 24 → 26 ms · 38 KB → 38 KB → 214 KB | 115 / 310 → 108 / 116 → 113 / 116 | 445 / 491 → 437 / 517 → 461 / 473 | 16 → 25 → 47 |

- **Coste del código nuevo sin textos:** +1 ms por instantánea automática y ~+0,6 ms por catálogo manual de 12 (dos búsquedas por vivienda); en la pasada del vigilante, **+10–12 %** con 5 y 20 enlaces automáticos (1.000–2.000).
- **Con textos largos en todo:** la instantánea de 24 viviendas pasa de 38 KB a **~190–245 KB** y la pasada de 20 enlaces automáticos sube un 30–38 % sobre C1. La instantánea solo viaja al lector cuando cambia la huella; la pasada del vigilante solo la recalcula para comparar.
- **Referencias** (no puertas): con 1.000 y 2.000, 5 enlaces automáticos quedan **por debajo de 50 ms** en las tres fases (con 2.000 y textos en todo, 48–49 ms, justo debajo) y 20 enlaces **por debajo de 300 ms** (165–196 ms). Con 10.000, igual que en PR-B y C1, 20 automáticos superan los 300 ms en las tres fases; la diferencia de C2 queda dentro del ruido del equipo.
- **Hallazgo y corrección durante la medición:** la primera versión de 0197 añadía una función SQL por vivienda (`catalog_item_json_c`). Medido: ~30 % más lenta que unir el texto y la historia en la misma consulta de la lista (con 1.000, 5 enlaces y textos en todo: 53 → 41 ms). La instantánea usa ahora dos `LEFT JOIN LATERAL` (mismo JSON, comprobado) y la función desaparece; la suite SQL completa sigue en verde.
- El stub de pruebas declara los índices de historias que **ya existen en producción** (0144); antes faltaban y la medición penalizaba C2 con lecturas secuenciales. Sin índices globales nuevos ni disparadores. D13 (≤ 2 s) en vivo sigue **pendiente**.

## Compatibilidad del despliegue y recuperación

- **Tras tu merge:** el despliegue compila, aplica `0197` y cambia de versión. Mientras tanto, el build anterior funciona con la base nueva: la instantánea trae claves de más (`text`, `story` y la clase `k` de las fotos) que el código anterior ignora. Si `0197` fallara, el script de despliegue no cambia de versión y sigue la anterior (`scripts/vps-autodeploy.sh`); el código nuevo necesita sus funciones para la gestión de textos.
- **Una actualización de más en lectores abiertos:** las viviendas con **historia aprobada** o con **fotos clasificadas** cambian la instantánea, así que esos catálogos cambian de huella una vez tras el despliegue y los lectores abiertos se actualizan solos. Sin historias ni clases, la huella no cambia (probado).
- **Si se vuelve al build anterior** sin tocar la base: el lector vuelve a la descripción limpia (ignora textos e historias); los textos siguen guardados pero no se pueden editar.
- **Revertir de verdad:** `git revert` del merge + `rollback-0197.sql` (lo ejecuta una persona). **Antes**, copia de seguridad: `\copy (SELECT * FROM catalog_texts) TO 'catalog_texts_backup.csv' CSV HEADER` (va al principio del archivo). **Se pierden todos los textos de los catálogos**, borradores y publicados; las historias, las descripciones limpias y las fichas no se tocan; la instantánea vuelve a la de C1 y las huellas cambian otra vez. Después, quitar la fila de `schema_migrations`. Probado en el Postgres temporal.

## QA en vivo de Fabricio (tras el merge)

1. Abre un catálogo de QA con su enlace en otra ventana (escritorio) y en el móvil.
2. **Preparar desde la ficha (IA)** en una vivienda con descripción: es una llamada real al proveedor configurado (la pagas tú, no la estimamos). Comprueba que aparece la propuesta sin guardarse, prueba «Cancelar», y escribe en el texto mientras trabaja: debe ofrecer «Usar la propuesta» sin pisarte.
3. **Borrador con IA** en otra: revisa los avisos (cifras o elementos que la ficha no dice), corrige o confirma uno a uno, **Guarda** y mira que el lector no cambia. Cierra y reabre el editor: los avisos siguen.
4. Escribe un teléfono, una web o un precio: «Publicar» queda bloqueado y dice por qué.
5. **Publica:** el lector cambia en vivo (apertura con tu entrada y puntos, recorrido y detalle). **Retira:** vuelve al nivel anterior y el borrador se conserva.
6. **Fuente cambiada:** cambia los m² o una característica de esa ficha en el CRM. La gestión dice «Publicado · revisar (cambió …)» y el lector deja de mostrar el texto. Cambia solo el precio: el texto sigue.
7. **Reserva:** excluye o quita una vivienda con texto: queda en «Textos en reserva»; vuelve a incluirla y recupera su texto. «Borrar texto» pide confirmación.
8. **Aislamiento:** tras «Preparar», la descripción para clientes de esa ficha y su SmartLink no cambian.
9. **Recorrido:** a 1440 y 1280 × 720, recorre una vivienda con texto, otra con historia aprobada, otra con descripción limpia y otra sin texto; comprueba los folios del índice, teclado, deslizar, galería, modo desplazamiento y «reducir movimiento». En el móvil (362 y 320), la hoja continua y los plegables.
10. **D12 entre partes:** con el lector en el recorrido o el detalle de una vivienda, quítala: debe abrir la siguiente con aviso; con la última, el índice; sin ninguna, el estado vacío.
11. **D13:** 20 ensayos × 2 lectores con `?medir=1`, publicando y retirando textos (algunos «Sin aviso inmediato»). Las cifras de aquí son locales y sintéticas: no sirven como resultado en vivo.
12. Al terminar, revoca el enlace de QA.

## Pendiente o no demostrado

- La QA en vivo de arriba, incluido D13 (≤ 2 s) en el VPS con 2 lectores y 20 ensayos.
- El rendimiento con los datos reales (1.632 propiedades, 818 candidatas, 813 con foto) no está medido; el tamaño 1.000 sintético es el más parecido.
- El coste real de la IA depende del proveedor configurado; no se ha estimado.
- PDF (importar/exportar): no empezado, como pide el encargo.

## PR, CI y merge (C2)

- **PR:** [#316](https://github.com/Bcousino890/smartbc/pull/316), `fabri/bcp-01-c2` → `main`.
- **`origin/main` antes del push:** `06d5e88…` (sin cambios desde la base); `0197` libre en `main` y en los 28 PR abiertos.
- **CI del último commit:** se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede desplegar y aplicar `0197`; el rollback del build no deshace el esquema.
- Se conservan el worktree y la rama.

## Revisión

Revisión adicional de Codex: no solicitada.

# QA de C2 tras el despliegue

Fabricio fusionó #316. La reproducción de la QA y la propuesta de correcciones y reorganización están en [`qa-c2/`](qa-c2/informe.md). Hay cuatro defectos confirmados: un capítulo de historia inaccesible en escritorio a partir del 7.º (reproducido con datos sintéticos), letra de 11 px en doble página a 1280 × 720, la señal de desplazamiento sobre un botón y fotos sin estado de carga o error. Decisiones DQ1–DQ8 aprobadas el 14 de octubre de 2026 ([enmienda §0](qa-c2/enmienda.md)); plan de E1 en borrador, pendiente de aprobación para ejecutarse ([`plan-e1.md`](qa-c2/plan-e1.md)). Sin cambios en la aplicación.

# E1 · Lector: correcciones y composición adaptativa

## Base y commits

Rama `fabri/bcp-01-e1`, base `origin/main` = `36aff9aab45e8d8479cca46c5a48aaf2f35c4771`, comprobada con `git ls-remote` al empezar. Respecto a `11f4bc1` (C2 fusionado) solo añade un arreglo de particulares que no toca ningún archivo de E1. Worktree `/Users/fabriirguez/SMARTBC/wt/bcp-01-e1`; el checkout original y el stash no se tocaron. Plan aprobado con correcciones: [`qa-c2/plan-e1.md`](qa-c2/plan-e1.md); decisiones: [`qa-c2/enmienda.md`](qa-c2/enmienda.md) §0 (D-QA1–D-QA11).

| Commit | Tarea |
| --- | --- |
| `6b3975a`, `d12398a` | Informe, enmienda, maquetas y plan (traídos de `fabri/bcp-01-c2-qa`) |
| `aa895a7`, `b2aafad` | T0 · plan corregido (dependencias, verificación independiente, aislamiento) y D-QA11 |
| `d3a9704` | T1 · clases excluidas del recorrido automático y `mosaic` |
| `f6c072b` | T2 · señal en banda propia y letra mínima en doble página |
| `e6d4a5a` | T3 · estados de carga y error de las fotos |
| `a90ae3f` | T4 · composición adaptativa y sus consumidores (API y consumidores en el mismo commit) |
| `59975c6` | T5 · fixtures sintéticas de la QA |
| `97e7f3b`, `cd1dcc0`, `9ea42bc`, `65be14f` | T6 · calibración renderizada y arreglos que encontró la matriz de navegador |
| `fa34a03` | T7 · este resultado y las capturas |

## Qué hay

- **L1 · Ningún capítulo sin acceso.** Si el recorrido de una historia no alcanza en sus 3 dobles páginas, el detalle trae **«La historia completa»**: todos los capítulos aprobados y seguros, en orden y con su título. Si hay descripción limpia, va después como «Descripción de la ficha». En móvil todo sigue en la hoja.
- **L2 · Letra mínima en doble página:**
  - recorrido y descripción completa ≥ 15 px;
  - entrada ≥ 16 px;
  - datos clave ≥ 13 px;
  - todo texto auxiliar ≥ 12 px, incluidos los botones y la portada.
- **L3 · La señal tiene su banda.** «Sigue leyendo ↓» va en una banda propia bajo la zona que se desplaza y nunca tapa texto ni controles.
- **L4 · Fotos con estado:**
  - cargando: tono del papel y «Cargando foto…» en marcos grandes;
  - error: «Foto no disponible», y en la galería «Esta foto no se puede mostrar», que deja pasar a las demás;
  - sin reintentos;
  - sin animación con «reducir movimiento».
- **Composición del recorrido** (`lib/catalogs/journey-layout.ts`, pura y determinista):
  - se agrupa por extensión, con capacidad calibrada en pantalla;
  - nada escaso: ninguna página se cierra con menos de 25 palabras, y un recorrido entero de menos de 25 va en la apertura;
  - entrada de más de 45 palabras: íntegra al principio del recorrido, con «Sigue · La vivienda →» (D-QA2);
  - página de texto compuesta cuando no hay foto adecuada (D-QA3);
  - como mucho 3 dobles páginas; lo demás, íntegro en el detalle.
- **D-QA4:** el recorrido automático (texto y descripción limpia) se salta las fotos con clase fiable `floor_plan`, `street_context` u `other`. Una foto sin clase sigue siendo elegible. La galería no pierde ninguna.
- **D-QA6 · Ficha breve:**
  - datos completos (operación, precio y zona en su cabecera; superficie, dormitorios, baños y planta en la ficha) y características;
  - mosaico adaptable de hasta 4 fotos elegibles, que abren la galería, más «Ver las N fotos»;
  - nunca «Sin descripción» ni diagnósticos.
- **Contrato público:** solo gana `mosaic` (índices). Sin clases de foto, niveles ni diagnósticos. Sin migración, sin SQL y sin cambio de huella.

## Límites calibrados (`journey-layout.ts`)

Medidos en el navegador a 1280 × 720 y 1440 × 900 con el texto a 15 px:

| Constante | Valor | Por qué |
| --- | --- | --- |
| `C_TEXT` / `C_PHOTO` | 125 / 70 palabras-equivalentes | Unas 7 palabras por línea y 19 líneas útiles por página; la foto pequeña (62 % del ancho; vertical al 44 %) ocupa unas 7,5 líneas |
| `HEADING_COST` / `BLOCK_COST` | 15 / 4 | Un título ≈ 2 líneas; cada bloque deja de media media línea |
| `INTRO_FACTOR` | 1,15 | La entrada (Fraunces cursiva, 16 px) cabe un 15 % menos por línea |
| `TINY_WORDS` | 25 palabras reales | Regla de «nada escaso» (mide palabras, no peso) |
| `LEAD_OPENING_MAX_WORDS` | 45 | D-QA2 |
| `MORE_COST` | 10 | Sitio del enlace «Sigue en…» en la última página de un recorrido truncado |
| `MAX_JOURNEY_SPREADS` | 3 | Se mantiene |

**Resultado:**
- a 1440 × 900 no se desplaza ninguna página de recorrido salvo el capítulo de 300 palabras;
- a 1280 × 720 se desplazan dentro de su página, con su banda, solo los bloques más largos que una página (capítulos de 120 y 300 palabras) y los detalles largos.

En el rango de 900 × 620 a 1280 × 720, fuera de los viewports aprobados, lo que no cabe se desplaza con su banda y nada se recorta (comprobado a 1024 × 640).

**Decisiones de implementación** (Claude, plan §8). Al calibrar aparecieron tres reglas más, todas para no dejar páginas escasas:
- «nada escaso» mide palabras reales;
- una cola escasa se une siempre a la página anterior salvo que choquen dos fotos;
- un recorrido de menos de 25 palabras va a la apertura.

## Verificaciones (locales, datos sintéticos, entorno aislado)

**Aislamiento (plan §2.1).** El servidor de fixtures y la compilación corrieron en una copia temporal sin ningún `.env*`, con `env -i` y solo variables ficticias, con Supabase en `127.0.0.1:9`. Antes de arrancar se verificó:
- 0 archivos `.env*` en la copia;
- solo las variables permitidas, más `__CF_USER_TEXT_ENCODING`, que añade macOS;
- `@next/env` informa de 0 archivos cargados en desarrollo y en producción.

Los registros no contienen ninguna línea `Environments:`. Ningún `.env` se abrió, imprimió ni copió.

| Comprobación | Resultado |
| --- | --- |
| `npm run test:catalogs-public` (en CI) | **262 en verde**. Nuevas: «E1 · fotos» (índices exactos del recorrido y del mosaico), «E1 · composición» (casos a–l con dobles páginas, partes y folios **calculados a mano**; L1 contra los **capítulos de origen** con 6–9 capítulos, sin limpia, con limpia distinta y con características, y el micro-capítulo como característica; 300 viviendas aleatorias como complemento). Z6 reescrita con valores explícitos |
| `test:catalogs`, `tsc`, `test:smartlink`, `test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2`, `test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `lint-migrations` | En verde |
| `test:typography` | Las mismas 15 infracciones que la base, todas en archivos ajenos a E1 |
| Compilación aislada (`npm run build`) | Correcta. Sin `.env` cargados; las llamadas a Supabase fallan contra el puerto cerrado, como se espera |
| Matriz E1 en el navegador (1280 × 720, 1440 × 900, 1024 × 640, 362 y 320 px) | **153 en verde** (tabla siguiente) |
| Regresiones del lector y de la gestión | Lector 52, índice 187, PR-A 54, PR-B 40, enlace 10, C1 31 y C2 186 en verde. Mediciones sintéticas 20 × 2: fase 2, C1 y C2 **PASA** (máximos 0,29, 0,21 y 0,20 s). Local y sintético: no demuestra D13 |

**Matriz E1** (token `qa` de 11 viviendas, más `journey`, `journey12`, `journey24` y `one`):
- **Doble página (1280 × 720 y 1440 × 900):**
  - 32 páginas y folios del índice 3, 5, 7, 12, 16, 21, 25, 26, 27, 28 y 30, **calculados a mano**;
  - cada página es la parte esperada y lleva su folio;
  - letra mínima en todas;
  - la señal nunca se cruza con texto ni controles;
  - sin desbordes y nada recortado;
  - el recorrido cabe salvo los bloques largos.
- **Contenido:**
  - (a) entrada íntegra en j1 con su enlace;
  - L1 con las historias de 8 y 9 capítulos comparadas con su **texto de origen**, en páginas y en modo desplazamiento;
  - «La historia completa» con «Portería» como característica;
  - (f) el recorrido usa exactamente las fotos 4, 5 y 6 y la galería conserva las 7;
  - ficha breve con 1, 3 y 34 fotos (0, 1 y 4 de mosaico), y el mosaico abre la galería en su foto;
  - página compuesta sin fotos;
  - capítulo largo con su banda.
- **Navegación:** teclado, Inicio/Fin, modo desplazamiento, «reducir movimiento» y sin errores de JS.
- **En vivo:**
  - un texto de una frase vuelve a la apertura de la misma vivienda;
  - D12 desde recorrido y desde detalle (7 / 27);
  - el índice tras reordenar;
  - reordenar mantiene la parte;
  - estrechar la ventana conserva la vivienda.
- **Fotos (L4), con y sin «reducir movimiento»:**
  - red lenta: «Cargando foto…», con animación solo sin «reducir movimiento»;
  - error: «Foto no disponible» y galería navegable;
  - **una sola petición** por foto fallida;
  - al volver a una página, las fotos quedan cargadas en 130–220 ms.
- **Series:**
  - `one` = 5 páginas y `journey` = 12, calculados a mano;
  - `journey12` y `journey24` recorridos enteros sin desbordes a 1280 × 720, 1440 × 900 y 1024 × 640;
  - la última vivienda del índice abre en su folio;
  - el texto de 5.938 caracteres llega íntegro al detalle.
- **Una página (362 y 320):**
  - `qa` en 14 hojas, sin desbordes en ningún token;
  - los 9 capítulos de origen en la hoja;
  - ficha breve con los datos a la vista y 4 fotos;
  - la barra no tapa el final.

**Cambios de expectativa en las regresiones**, recalculados a mano y nunca con `itemLayout`:
- **`lector.mjs`** (token `main`): de 13 a **12** páginas, porque el Ático (una frase de 9 palabras) pasa a la apertura. Piso señorial abre en la **5** y lo comprueba también el índice. `one` pasa de 6 a **5**.
- **`c2.mjs`** (token `journey`): de 13 a **12** páginas, con folios 3, 8 y 11:
  - los cuatro capítulos breves de la historia en una doble página;
  - «Conserje» en el detalle (página 10);
  - la ficha breve de la vivienda 3 (11);
  - la foto del recorrido es ahora la pequeña dentro de la página;
  - el texto de una frase en vivo vuelve a la apertura (3 / 9);
  - D12 desde un recorrido da 3 / 7.
- **Totales de `journey12`/`journey24` en doble página:** ya no se fijan a mano, porque dependen del reparto de fotos de cada vivienda. Se comprueba que el índice y el contador coinciden y se recorren todas las páginas.
- **Prueba «vuelta a una foto en caché»:** con respuestas interceptadas no se puede verificar la caché de forma fiable. Se comprueba que las fotos no se atascan en «cargando».

Ninguna comprobación se quitó ni se relajó para pasar. Cada cambio de expectativa está en esta lista, con su motivo.

**Incidencias de entorno, no de E1:**
- una primera compilación de `/dev-fixtures/mi-espacio` superó los 30 s de PR-A (repetida en verde);
- el servidor de desarrollo de Next se reinició una vez al acercarse a su umbral de memoria tras horas de pruebas (C2 repetida en verde, el entorno aislado se mantuvo).

Capturas en [`qa-c2/capturas-e1/`](qa-c2/capturas-e1/) (JPEG): apertura y recorrido con entrada larga, historia completa, fotos del recorrido sin clases excluidas, ficha breve, capítulo largo, página compuesta, 24 viviendas, foto cargando y foto con error, D12 y hojas a 362 y 320 px. La insignia «N» es la de desarrollo de Next.

## Recuperación

- E1 es solo código: sin migración, sin cambios de datos y sin cambio de huella. Fusionar puede desplegar, como cualquier merge a `main`.
- **Revertir:** `git revert` del merge en rama y PR, que fusiona Fabricio. Vuelve el lector de C2 tal cual y no se pierde ningún dato. El campo `mosaic` deja de enviarse.
- **Lectores abiertos durante el despliegue:** siguen con su versión hasta recargar; el campo de más no les afecta. Con la versión nueva, el número de páginas de algunos catálogos cambia y D12 conserva la vivienda.

## QA en vivo de Fabricio (tras el merge)

1. Abre el catálogo de QA a 1280 × 720 y a 1440 × 900:
   - el texto del recorrido se lee bien (unos 15 px);
   - ninguna página tiene una frase suelta;
   - «Sigue leyendo» no tapa nada.
2. **Reforma en Goya:**
   - la apertura ya no lleva la entrada de 96 palabras;
   - «Sigue · La vivienda →» lleva a la entrada íntegra y los capítulos breves comparten página con su foto.
3. **Espartinas y Conde de Peñalver:** sin páginas sueltas de texto escaso; donde no hay foto de su clase, página de texto compuesta.
4. **Goya 1.000.000 €:**
   - si la foto-mapa tiene clase `street_context`, `other` o `floor_plan` fiable, ya no aparece en el recorrido;
   - si no está clasificada, sigue apareciendo (límite aprobado de D-QA4; lo resuelve E3).
   - La apertura seguirá usando la portada de la ficha (el aviso de reportaje pendiente) hasta E3 o hasta que se cambie la portada en el CRM.
5. **Viviendas sin descripción:** ficha breve con datos completos y mosaico; tocar una foto abre la galería.
6. **Diego de León:** el recorrido muestra sus 6 capítulos y, si no cabe, el detalle trae «La historia completa».
7. **Fotos:** con red lenta (por ejemplo, el móvil con poca cobertura) se ve «Cargando foto…» en vez de marcos vacíos.
8. En el móvil real, recorre dos o tres viviendas: hoja continua, ficha breve y galería.
9. **D13:** 20 ensayos × 2 lectores en el VPS con `?medir=1` (sigue pendiente; lo de aquí es sintético).

## Pendiente o no demostrado

- QA en vivo, D13 en el VPS y QA en dispositivos reales.
- **Ruta de imagen ya cargada antes de hidratar.** Se trata con `img.complete` al montar, pero el lector siempre arranca en la portada, así que no se ha podido ejercitar con las fixtures.
- **Mapas y avisos sin clasificar:** pueden seguir entrando en el recorrido hasta E3.
- **E2 (gestor), E3 (fotos por catálogo) y PDF:** no empezados.

## PR, CI y merge (E1)

- PR: [#317](https://github.com/Bcousino890/smartbc/pull/317), `fabri/bcp-01-e1` → `main`.
- `origin/main` antes del push: `36aff9a…`, sin cambios desde la base.
- CI del último commit: se comprueba tras el push; su resultado está en el PR.
- Merge: lo decide Fabricio. Puede desplegar; no hay migración.

## Revisión

Revisión adicional de Codex: no solicitada.


# E2 · Gestor en cuatro secciones

Plan: [`qa-c2/plan-e2.md`](qa-c2/plan-e2.md), aprobado el 15 de octubre de 2026 con A1–A4 y cuatro ajustes obligatorios (registro: [enmienda §0, D-QA12](qa-c2/enmienda.md)).

## Base y commits

- **Base:** `origin/main` = `87bf218`. Comprobada antes de empezar y de nuevo antes del push (sin cambios: `87bf218`). Respecto al merge de E1 (`78bfa15`) solo añade un commit de particulares, ajeno a catálogos.
- **Rama:** `fabri/bcp-01-e2`, en el worktree `wt/bcp-01-e2`. El checkout original (en `main`, limpio), su stash y los demás worktrees no se han tocado.
- **Commits**, uno por tarea; los arreglos de T9 van aparte y cada commit compila:

| Commit | Tarea |
| --- | --- |
| `5f08885` | Plan (borrador) |
| `9b04e75` | T0 · aprobación (D-QA12) y ajustes en el plan |
| `a907e83` | T1 · modelos puros (material, secciones, borradores en bruto, guardados en curso), sus pruebas y el paso en la CI |
| `c004360` | T2 · `material` en `CatalogDetail` con la instantánea del lector |
| `5b7c17b` | T3 · fixtures de E2 |
| `6abf705` | T4 · cuatro secciones, URL, cabecera |
| `8354b2d` | T5 · valores sin guardar, aviso al salir, A1–A3 |
| `6c23bf0` | T6 · Viviendas |
| `1260894` | T7 · Contenido |
| `57f5e4d` | T8 · Diseño y Compartir |
| `e6046ce`, `75213a6`, `fb1359d` | T9 · arreglos encontrados por la matriz (abajo) |
| (T10) | Este resultado y las capturas; el enlace del PR y la CI, en un commit posterior |

## Qué hay

**Estructura.** El gestor tiene cabecera y cuatro pestañas, con la sección en la URL (`?seccion=viviendas|contenido|diseno|compartir`) y la vivienda abierta en `&vivienda=`.
- Las secciones cambian con `history.pushState`, sin pedir nada al servidor; Atrás y Adelante recorren secciones y paneles.
- La barra lateral del CRM y Lato no cambian.

**Cabecera:**
- muestra el nombre (fijo al desplazar, en escritorio), el estado, el modo, el número de viviendas, la validez del enlace y «Cambios sin guardar (N)», que lleva a cada formulario;
- **«Vista previa»** abre `/seleccion/<token>` en otra pestaña si el enlace está activo. Si no, lleva a Compartir con el motivo («Aún no hay enlace», «El enlace caducó», «Reactiva el catálogo») y el foco en el enlace;
- **«Compartir»** cambia de sección;
- **⋯** contiene Archivar/Reactivar.
- Ninguno de ellos guarda, publica, crea enlaces ni llama a la IA. Lo comprueban los contadores de la fixture.

**Viviendas:**
- **Criterios:** resumen con «Modificar criterios», que despliega el panel de siempre.
- **Vistas:** «En el catálogo», «Coincidencias» y «Excluidas» en automático; «En el catálogo» y «Añadir» en manual.
- **Lista compacta:** sin párrafos ni desplazamiento horizontal, con insignias y avisos con su número. Las acciones de selección son las de siempre.
- **Panel de la vivienda:** «Por qué está en el catálogo» y las mismas acciones. Es lado a lado en escritorio ancho y pantalla propia en móvil.

**Contenido:**
- filtros con su número (Todas, Por revisar, Borradores, Publicados, Sin texto propio, Sin descripción, Cambios sin guardar) y búsqueda;
- columnas «Qué ve el cliente» (con «Por qué»: la prioridad y la fuente), «Texto» y «Material» (D-QA8);
- **un solo editor**, con «‹ ›». «Guardar borrador» y «Publicar» van en el pie fijo, con el mensaje al lado;
- «Textos en reserva», y lo escrito para viviendas que ya no están, con «Copiar» y «Descartar».

**Diseño:** título, introducción y portada (vivienda y foto, con los respaldos de C1). La vista previa usa lo escrito y lo marca si no está guardado; con enlace activo, ofrece «Abrir la vista previa completa».

**Compartir:**
- contacto y enlace, como antes;
- «Organización interna · anuncios de origen», plegado;
- medición con `?medir=1`.

**Valores sin guardar (D-QA9 y ajustes 1 y 2).** Un único dueño, `manager/drafts-store.ts`, fuera de React, guarda lo escrito en los cinco formularios. Las reglas son puras y están probadas (`lib/catalogs/manager-state.ts`):
- lo escrito se conserva **en bruto** («1.200.000», «600 111 222», un distrito sin añadir). La normalización solo decide los indicadores;
- un guardado reconoce **solo la instantánea enviada**. Lo escrito durante el guardado se conserva tanto si sale bien como si falla;
- lo guardado que cambia «en otra pestaña» se enseña como conflicto, con «Descartar mis cambios» o «Mantener los míos» (que no guarda);
- sobrevive a cambiar de sección, cerrar el editor, cambiar de vivienda, refrescar y navegar dentro del CRM. **No** sobrevive a una recarga, y la interfaz no lo sugiere.

**Aviso al salir.** `beforeunload` cubre recargar y cerrar. Un clic en fase de captura cubre los enlaces internos (barra lateral, «‹ Mi espacio»…) y otro cubre «Cerrar sesión». Aceptar descarta los cambios de ese catálogo.

**Decisiones aprobadas:**
- **A1:** «Atrás» que sale del gestor no se intercepta. Al volver dentro del mismo documento, los valores siguen ahí con el aviso «Tienes cambios sin guardar de antes».
- **A2:** con la revisión cambiada, el servidor rechaza como siempre. Lo escrito se conserva, se enseña la versión guardada y se decide. El siguiente guardado sigue comprobando la revisión.
- **A3:** cerrar, cambiar de vivienda o salir de Contenido cancela la IA pendiente, y reabrir no la vuelve a llamar.
- **A4:** solo se descarta la portada sin confirmar cuya vivienda sale de la lista, con aviso.

**Diagnósticos (D-QA8).** `getCatalogDetail` ya leía `catalog_internal_snapshot` para la portada. Con esa misma instantánea calcula `material` (`toPublicItem` → `materialOf`), **sin consultas nuevas ni IA**:
- «Sin descripción»;
- «N capítulos sin foto adecuada»;
- «Sin fotos».

**Lo que no cambia** (comprobado con `git diff 87bf218` → 0 líneas):
- `actions.ts` y la página real del gestor;
- SQL, migraciones y permisos;
- el contrato público, `to-public`, la composición del lector y la huella;
- las rutas públicas y el middleware.

La medición envuelve exactamente las mismas acciones que antes, en un único sitio (`wrapped`).

## Decisiones y desviaciones anotadas

- **`materialByProperty` va en `lib/catalogs/material-data.ts`**, no en `material.ts` como decía el plan. Usa `to-public`, que importa `node:crypto`, y así `material.ts` sigue sirviendo en el navegador.
- **Panel lado a lado solo desde 1280 px.** El plan decía 1024, pero con la barra lateral del CRM (260 px) la lista se desbordaba a 1024 con el panel abierto (lo encontró la matriz). Entre 1024 y 1279 px el panel ocupa el ancho, como en móvil.
- **«Coincidencias · N»** es lo que coincide para el automático (con foto). La búsqueda de esa vista es la de siempre, que también enseña las que coinciden pero no pueden entrar solas (sin foto), con su motivo; una línea lo explica.
- **Accesibilidad:** el botón «Quitar» de la lista manual se llama ahora «Quitar «título»» (antes, solo «Quitar»). Las filas abren el panel con «Ver «título»».
- **Mensajes:** con un panel abierto, el mensaje del gestor sale en su pie, junto a las acciones; si no, encima de la sección.
- **En móvil no hay barras fijas arriba,** por el botón de menú fijo del CRM. La cabecera es fija solo en escritorio.
- **Búsqueda:** el texto y el alcance se conservan entre vistas como estado de interfaz (no cuentan como cambio sin guardar). Faltaba en T6, la matriz lo encontró y se corrigió en T9.
- **Esc** cierra el panel también cuando el foco se ha quedado en la página (al desactivarse el botón pulsado). Lo encontró la matriz.

## Verificaciones (locales, datos sintéticos, entorno aislado)

**Aislamiento (plan §2.1).** El servidor de fixtures y la compilación corrieron en una copia temporal sin ningún `.env*`, con `env -i` y solo variables ficticias, y con Supabase en `127.0.0.1:9`. Antes de cada arranque se verificó:
- 0 archivos `.env*`;
- **lista blanca** de variables (solo las permitidas, más `__CF_USER_TEXT_ENCODING` de macOS);
- `@next/env` informa de 0 archivos cargados en desarrollo y en producción.

Ninguna línea `Environments:` en los registros. Ningún `.env` se abrió, imprimió ni copió. IA solo falsa. `npm ci` con el lockfile existente; `package-lock.json` no cambia.

| Comprobación | Resultado |
| --- | --- |
| `test:catalogs-manager` (nueva, también en la CI) | **68 en verde**. Casos escritos a mano: material, secciones y URL, lo escrito en bruto, guardado con retraso (éxito y fallo), conflictos, texto con revisión (A2) y filtros |
| `test:catalogs`, `test:catalogs-public` | 81 y 263 en verde |
| `tsc`, `test:smartlink`, `test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2`, `test:viewing-collections`, `test:client-shortlist`, `test:portal-links`, `lint-migrations` | En verde |
| `test:typography` | Las mismas 15 infracciones que la base, todas en archivos ajenos. Las 6 que había metido E2 se corrigieron |
| Lint (ESLint) | **No disponible:** el repo no tiene configuración de ESLint ni el paquete instalado, y `next lint` pediría crear una. No se ha añadido nada (ajuste 4) |
| Compilación aislada (`npm run build`) | Correcta. Sin `.env` cargados ni línea `Environments:`; las llamadas a Supabase van al puerto cerrado |
| Matriz E2 en el navegador | **980 en verde** en la tanda final, sobre el último código (tabla siguiente) |
| Regresiones | Lector 52, índice 187, PR-A 54, PR-B 40, enlace 10, C1 31 y C2 186 en verde, **los mismos números que en E1**. Mediciones sintéticas 20 × 2 de fase 2, C1 y C2: **PASA** (máximos 0,21, 0,30 y 0,23 s). Es local y sintético: no demuestra D13 |

**Matriz E2** (fixtures por defecto y `?grande=1`; recuentos escritos a mano en T3: 22 en manual, «24 de 29 coinciden» en automático, primera la nº 25 y última la nº 26; 5 «Sin descripción»: las nº 19, 23, 27, 31 y 35):

| Prueba | 1280 × 720 | 1440 × 900 | 1024 × 768 | 362 × 740 | 320 × 568 |
| --- | --- | --- | --- | --- | --- |
| Navegación, cabecera y teclado (T4) | — | 32 | — | — | — |
| D-QA9: valores sin guardar y salidas | — | 59 | — | 59 | 59 |
| Ajustes 1 y 2, conflictos y A2 | — | 31 | — | 31 | 31 |
| IA (A3 y AC-G4) | — | 15 | — | 15 | 15 |
| Viviendas (AC-G2) | 56 | 56 | 57 | 57 | 57 |
| Contenido (AC-G3, AC-G4 y DQ8) | 33 | 33 | 34 | 34 | 34 |
| Diseño y Compartir (AC-G5, AC-G6 y A4) | 34 | 34 | — | 34 | 34 |
| Barras fijas, pestañas y desbordes (AC-G7) | ✓ | ✓ | ✓ | ✓ | ✓ (46 en total) |

Qué cubre:
- **AC-G1 (navegación):**
  - URL, recarga, sección desconocida, Atrás/Adelante;
  - 0 peticiones al servidor al cambiar de sección;
  - teclado de las pestañas (← → Inicio Fin Intro Espacio);
  - parámetros conservados.
- **Cabecera:**
  - «Vista previa» con y sin enlace (con el motivo y el foco), «Compartir» y ⋯ Archivar/Reactivar;
  - un recorrido solo de navegación: **0 escrituras y 0 llamadas a la IA**.
- **AC-G2 (Viviendas):**
  - todas las acciones de selección con su **mensaje literal de `87bf218`**: subir y bajar (desactivados en los extremos), quitar con confirmación, añadir por búsqueda y por referencia (también no válida), criterios no válidos, zonas redundantes, «Ver qué entraría», pasar a automático, excluir desde la fila y el panel, Excluidas y volver a permitir, Coincidencias e incluir, el máximo que bloquea, quitar inclusión, volver a la lista anterior y convertir;
  - 22 y 24 filas sin desplazamiento horizontal, también con el panel abierto;
  - motivos solo en el panel;
  - el panel: URL, foco en el título, «‹ ›», Esc con el foco de vuelta a la fila y Atrás.
- **AC-G3 y D-QA9:**
  - valores exactos en los cinco formularios tras cambiar de sección, cerrar, abrir otra vivienda y Atrás/Adelante;
  - «Cambios sin guardar (6)», un punto en cada pestaña y las marcas de las filas;
  - «‹ Mi espacio», la barra lateral **real** del CRM y «Cerrar sesión» piden confirmación (al cancelar, se queda);
  - recarga con `beforeunload` (cancelar se queda; aceptar no recupera nada ni lo sugiere);
  - A1: Atrás sale sin diálogo, y Adelante vuelve con los valores y su aviso;
  - aceptar salir descarta.
- **Ajustes 1 y 2 (en los cinco formularios):**
  - guardado con 1,5 s de retraso mientras se sigue escribiendo: con éxito se envía exactamente la instantánea (`__fxLast`) y lo escrito después sigue y se marca, sin conflicto;
  - con fallo, se conserva todo y sale el mensaje de error;
  - «900.000», «600 111 222» y un distrito sin añadir se conservan tal cual.
- **A2 y conflictos:**
  - un guardado «en otra pestaña» enseña el conflicto con lo guardado y no toca lo escrito;
  - «Mantener los míos» no guarda, y el siguiente guardado usa la revisión nueva;
  - con la revisión vieja, el servidor rechaza con su mensaje y se puede decidir;
  - «Descartar» enseña lo guardado;
  - conflicto también en el título.
- **AC-G4 (IA falsa):**
  - 0 llamadas al abrir;
  - A3 al cerrar, al cambiar de vivienda y al salir de Contenido (sin llamada al reabrir);
  - «Cancelar», respuesta tardía con «Usar la propuesta», aviso «piscina» confirmable uno a uno (también al reabrir) y bloqueo por teléfono.
- **Contenido y DQ8:**
  - filtros y material con los números escritos a mano, búsqueda y «Por qué»;
  - guardar, publicar, fuente cambiada, retirar y borrar con sus mensajes literales;
  - reserva, lo escrito de viviendas que ya no están (Copiar y Descartar) y Atrás.
- **AC-G5 (Diseño):**
  - vivienda y foto, «Usar su foto de portada», «Volver a la portada automática»;
  - respaldo de C1 cuando la portada guardada sale;
  - A4 sin tocar los otros formularios;
  - vista previa con lo escrito.
- **AC-G6 (Compartir):**
  - validaciones del contacto;
  - crear (duración inválida desactiva), copiar, renovar y revocar con confirmación;
  - archivado y anuncios plegados;
  - escrituras exactas en los contadores.
- **AC-G7 (móvil):**
  - las 4 pestañas en una fila;
  - sin desbordes en ninguna sección (con los criterios desplegados y cada vista);
  - con Tab por cada campo y botón del editor y del panel, nada queda bajo el pie fijo ni bajo el botón de menú del CRM;
  - avisos desplazados al final por encima del pie;
  - el último bloque, por encima del pie.

**Regresiones y cambios de selector.** Ninguna expectativa (número, mensaje o estado) ha cambiado. Solo se ha adaptado cómo se llega a cada control:
- **Lector e índice:** sin ningún cambio.
- **PR-A y enlace:** el gestor se abre en `&seccion=compartir`.
- **PR-B:**
  - «Modificar criterios» al empezar;
  - la búsqueda manual, en la vista «Añadir»;
  - la lista se comprueba en «En el catálogo»;
  - el buscador de incluir, en «Coincidencias»;
  - los anuncios, en Compartir, abriendo «Organización interna».
- **C1:**
  - `titles()` pasa antes a «En el catálogo»;
  - `search()` va a «Coincidencias»;
  - los motivos y avisos de cada vivienda (`item-reason`, `item-warning`) se leen en su panel;
  - «Excluidas» para su lista y «Volver a permitir»;
  - la portada, en Diseño;
  - «el buscador lo marca…» repite antes la búsqueda.
- **C2:**
  - el gestor se abre en Contenido;
  - pasar a automático, excluir y volver a permitir se hacen en Viviendas.
  - La espera fija tras «Volver a permitir» se cambió en T3 por «esperar a la condición (máx. 5 s)», porque con la barra lateral real la página tarda un poco más; la expectativa es la misma.
- **Mediciones (fase 2, C1 y C2):**
  - el gestor se abre en Compartir (el panel de medición está ahí) y cada paso va antes a su sección;
  - el «Quitar» de la lista manual se busca como «Quitar «…»».

**Errores de las pruebas (míos) corregidos durante la verificación,** sin tocar la aplicación:
- un recuento de guardados mal esperado;
- leer recuentos antes de que se pintaran;
- buscar la reserva quitando en manual (la fixture solo refleja la reserva excluyendo en automático, como ya hacía C2);
- pulsar el «Mi espacio» de la barra lateral en vez del del gestor, lo que llevó a `/login` del servidor local, con Supabase en el puerto cerrado;
- el menú móvil del CRM, que se queda abierto.

**Incidencias de entorno, no de E2:**
- con ese clic a `/login`, una petición del servidor de desarrollo se quedó colgada y tumbó por tiempo dos pruebas de esa tanda (repetidas, en verde);
- en la tanda final, tras horas de carga del servidor de desarrollo:
  - **el lector** dio 3 fallos en gestos de deslizar en móvil. E2 no toca el lector (0 líneas), y repetido solo dio 52 en verde dos veces;
  - **Contenido a 362 px** leyó una fila antes de pintarse. La lectura pasó a «esperar a la condición (máx. 5 s)», con la misma expectativa, y repetida dio 34 en verde dos veces.
- Una tanda intermedia de la matriz se paró a medias para no mezclar versiones de código; la tabla es la tanda final completa.

Capturas en [`qa-c2/capturas-e2/`](qa-c2/capturas-e2/) (JPEG, datos sintéticos). La franja negra inferior («Fuentes…») y la «N» son superposiciones de desarrollo de la página de fixtures y de Next, no del producto. En móvil, el botón de menú del CRM flota sobre el contenido al desplazar, como en todo el CRM; ningún campo con foco queda debajo (AC-G7). Contienen:
- Viviendas en manual (22), los criterios, el automático con el panel abierto y Coincidencias;
- el editor con avisos y cambios sin guardar, y el filtro «Sin descripción»;
- Diseño con la vista previa, la cabecera con «Cambios sin guardar» y Compartir;
- a 362 y 320 px: Viviendas, el panel de una vivienda, Contenido, el editor con el pie fijo y Compartir.

## Recuperación

- **E2 es solo código:**
  - sin migración, sin cambios de datos, sin cambio de huella ni del contrato público;
  - los valores sin guardar solo viven en la memoria de la pestaña.
- **Revertir:** `git revert` del merge en una rama y PR, que fusiona Fabricio. Vuelve el gestor de E1 y no se pierde ningún dato guardado.
- **Durante el despliegue:** quien tenga el gestor abierto sigue con su versión hasta recargar.

## QA en vivo de Fabricio (tras el merge)

1. Abre un catálogo en Mi espacio. Comprueba:
   - las cuatro pestañas;
   - que la URL cambia (`?seccion=`);
   - que Atrás y Adelante recorren secciones.
2. **Viviendas:**
   - «Modificar criterios»;
   - en automático, «Coincidencias» y «Excluidas», incluir y excluir;
   - el panel de una vivienda con «Por qué está en el catálogo».
3. **Contenido:**
   - filtros y material;
   - abre un texto, escribe sin guardar, cambia de vivienda y de sección, y vuelve: lo escrito sigue ahí;
   - «Guardar borrador» y «Publicar» como antes.
4. **Diseño:** cambia el título sin guardar y mira la vista previa. Elige la portada.
5. **Compartir:** contacto, enlace, «Vista previa» desde la cabecera, y los anuncios en «Organización interna».
6. **Con algo sin guardar:**
   - pulsa otro enlace del menú del CRM: debe pedir confirmación;
   - recarga: el navegador avisa.
7. **En el móvil real:**
   - la barra de cuatro pestañas;
   - el editor como pantalla propia, con «Guardar borrador» y «Publicar» abajo sin tapar los campos.
8. **D13:** `?medir=1` en el VPS (sigue pendiente; lo de aquí es sintético).

## Pendiente o no demostrado

- La QA completa de Fabricio, D13 en vivo (VPS) y las pruebas en dispositivos reales. Las comprobaciones de aquí son locales y sintéticas.
- **Lint con ESLint:** no disponible en el repo (ajuste 4).
- **«Atrás» que sale del gestor** no se intercepta (A1). Los valores no sobreviven a una recarga ni a otro documento, por diseño (D-QA9).
- **Fuera de alcance:** E3 (fotos por catálogo) y PDF, que no se han empezado.

## PR, CI y merge (E2)

- PR: [#318](https://github.com/Bcousino890/smartbc/pull/318), `fabri/bcp-01-e2` → `main`.
- `origin/main` antes del push: `87bf218…`, sin cambios desde la base.
- CI del último commit: se comprueba tras el push; su resultado está en el PR. Incluye el paso nuevo `test:catalogs-manager`.
- Merge: lo decide Fabricio. Puede desplegar; no hay migración.

## Revisión

Revisión adicional de Codex: no solicitada.
