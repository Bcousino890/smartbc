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
