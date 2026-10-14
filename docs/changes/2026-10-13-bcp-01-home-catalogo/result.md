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
| siguiente | este resultado, la enmienda §8 y las capturas |

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

- **PR:** se abre tras el push; enlace a continuación.
- **`origin/main` antes del push:** `06d5e88…` (sin cambios desde la base); `0197` libre en `main` y en los 28 PR abiertos.
- **CI del último commit:** se comprueba tras el push; su resultado está en el PR.
- **Merge:** lo decide Fabricio. Puede desplegar y aplicar `0197`; el rollback del build no deshace el esquema.
- Se conservan el worktree y la rama.

## Revisión

Revisión adicional de Codex: no solicitada.
