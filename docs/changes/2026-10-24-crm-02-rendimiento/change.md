# CRM-02 · Rendimiento de navegación: Propiedades más ligera y respuesta inmediata

Que la lista de Propiedades envíe menos datos, que cada clic dé respuesta visual al momento y entender las peticiones de notificaciones y precarga antes de tocar nada compartido.

- **Tamaño:** medio (aprobado por Fabricio el 2026-10-24, E0–E3). Cualquier cambio en identidad, autorización, vigencia de permisos, middleware de sesión o esquema de base de datos queda fuera y requiere su propio plan explícito como grande o sensible (D5 de CRM-01).
- **Responsable:** Fabricio
- **Rama:** una por PR (ver «Entregas»), cada una desde el `main` remoto vigente **que ya incluya el merge de #368**. Este documento vive en `fabri/crm-02-rendimiento-propiedades` hasta entonces.
- **Estado:** **fusionado** (2026-10-25). E0, E1, E2, E3 y la precarga por intención (D7) están en `main`. Ver «Cierre».

## Especificación

### Contexto

Parte de la línea base medida en CRM-01: `docs/changes/2026-10-24-crm-01-navegacion/` (PR #368), ficheros `medidas/base-*.json`.

- Todas las cifras son **locales**: build de producción contra el simulador PostgREST con 1.700 propiedades sintéticas.
- «40 ms» significa latencia **simulada** por consulta, y «móvil», CPU 4× más lenta y red limitada **simuladas**.
- Ninguna cifra es un tiempo de producción.

Medido sobre `main` (`e0be8c7a`):

| Hecho | Cifra (local) | Fuente |
|---|---|---|
| Respuesta de menú → Propiedades (RSC) | 2.102 KB sin comprimir / 158 KB gzip, 9 consultas | `navegacionAislada` |
| Peso de los arrays de fotos en esa respuesta | 1,26 MB (≈ 58 %): 17.365 fotos de 1.511 propiedades | medido sobre la respuesta RSC |
| Uso real de las fotos en la fila | portada (`coverPhotoUrl`, o la primera foto si no hay) y número de fotos | `properties-admin-client.tsx:947-948` |
| Galería completa | solo al abrir el modal de fotos (`PropertyPhotosModal`, `initialPhotos`) | `properties-admin-client.tsx:1108-1112` |
| Clic → primer cambio en pantalla vs clic → contenido útil | casi iguales: 536 / 573 ms (40 ms simulados); sin indicador intermedio | arnés R1 |
| Móvil simulado: menú → Propiedades | 1.843 ms hasta contenido útil; hasta ~310 ms de tareas largas | `base-movil.json` |
| Contadores de la sidebar (visitas, notificaciones, mensajes) | **no se recalculan en cada navegación interna**: la petición aislada de una navegación no toca `visit_requests`, `crm_notifications` ni `team_*`. Solo corren en cargas completas (el panel completo: 28 consultas, 6 de ellas recuentos de mensajes, una por conversación) | arnés, `navegacionAislada` |
| `GET /api/admin/notifications` | se dispara en **cada** navegación. La campana vive en `AdminPageHeader` (usado por 21 páginas), así que se remonta con cada página y vuelve a pedir; además repite cada 60 s. La ruta hace `getCurrentProfile` y lee conversaciones, visitas, mensajes y `crm_notifications` | `components/admin/admin-page-header.tsx:36`, `notifications-bell.tsx:75`, `app/api/admin/notifications/route.ts` |
| Precargas | al entrar en `/es/admin` salen 21 precargas RSC automáticas (enlaces de la sidebar y fichas visibles). Sin frontera de carga, cada una pasa por el middleware: ~2 `getUser` + 1 `profiles`. Son unas 60-70 consultas de ~112 en esa ventana | ventana de «menú → Propiedades (repetida)» |

Lo que la tabla anterior dejaba sin medir (las consultas exactas de una precarga y de `/api/admin/notifications`) lo mide ya E0: ver «Resultado · E0». El efecto de `loading.tsx` sobre las precargas se mide en E2.

### Decisiones ya tomadas (no se reabren)

- `D2 (CRM-01)`: la respuesta al clic será un esqueleto del módulo más el elemento de la sidebar en estado pendiente (`loading.tsx` + `useLinkStatus`), con los tokens de claro/oscuro.
- `D5 (CRM-01)`: identidad, autorización, vigencia de permisos y esquema son trabajo grande o sensible y van en su propio plan.

### Decisiones de Fabricio (2026-10-24)

- `D1`: CRM-02 aprobado como trabajo **medio**, con E0–E3.
- `D2` · **Campana de notificaciones**:
  - Los datos se reutilizan hasta **60 s por pestaña**, en lugar de pedirlos en cada navegación.
  - **Excepción explícita:** tras marcar una notificación como leída se refresca **al momento**, sin esperar el intervalo.
  - Los datos en caché y las peticiones en curso se **aíslan por usuario y país**.
  - Al cerrar sesión o perder el acceso, los datos privados **se borran**.
  - Una respuesta que pertenezca a un contexto anterior (otro usuario, otro país, una sesión cerrada) **se descarta**.
  - Las peticiones simultáneas se **deduplican**, sin cambiar ninguna regla de autenticación ni de permisos: la ruta sigue decidiendo quién ve qué.
- `D3` · **Política de precarga de la sidebar**: se decide **solo después** de medir E0 y E2, incluido el efecto de las fronteras de carga. Antes de cambiarla, Claude presenta las alternativas **con números**. Cualquier opción basada en la intención del usuario debe funcionar con **foco de teclado** y con **toque**, sin pedir un segundo toque.
- `D4` · **Entorno**:
  - Copias aisladas **sin ningún fichero `.env`** ni credenciales reales (exportación de git sin `.env*`). Los ficheros de entorno existentes **no se mueven**.
  - Autorizado: herramientas existentes, datos sintéticos, tests, mediciones, commits, push, PR y CI.
  - No autorizado: paquetes nuevos, acceso a producción, cambios de autenticación o permisos, SQL o esquema, migraciones y revisiones adicionales de Codex.
- `D6 (2026-10-25)` · **Respuesta inmediata sin `loading.tsx`**: con una frontera de carga (`loading.tsx`, `Suspense`), React no revela el contenido antes de ~800 ms en cuanto ha enseñado un esqueleto (medido; ver «E2»), e incumplía AC6. Fabricio elige el **esqueleto superpuesto**: al pulsar el menú se enseña al instante el esqueleto de la sección encima del contenido, más la marca del enlace, sin `Suspense`. Solo cubre las navegaciones del menú; lista → ficha y «Volver» quedan como hoy.
- `D7 (2026-10-25)` · **Precarga del menú (resuelve D3)**: con los números de E0 y E2 delante, Fabricio elige la **alternativa B, por intención**. Se precarga al pasar el puntero, con el foco de teclado o al tocar, navegando con el mismo toque. Va en un PR propio, CRM-02e, después de E2.
- `D5` · **Entrega**:
  - PR pequeños y coherentes, con la CI en verde, incluidas las regresiones de identidad de #361 y los recorridos de navegación de #368.
  - Claude **se detiene antes de cada merge**, y también si algún criterio de aceptación no se puede cumplir.
  - Los recuentos de producción son contexto útil, pero no bloquean.

### Alcance

- **E0 · Medición ampliada** (sin cambios en la app):
  - Repetir por separado las precargas y `/api/admin/notifications` para contar sus consultas.
  - Arreglar los datos sintéticos para que esa ruta termine.
  - Nueva métrica «clic → primer indicador» (esqueleto o sidebar pendiente), separada de «clic → contenido útil».
- **E1 · Propiedades ligera:**
  - La lista recibe solo la **portada efectiva** (`coverPhotoUrl`, o la primera foto tras ordenar y deduplicar) y el **número de fotos deduplicado**, no el array.
  - Se conservan todos los campos que usan el filtrado, la búsqueda, la ordenación, los totales y la selección múltiple.
  - La galería completa se carga al abrir el modal, con las reglas de acceso y los límites de país actuales. Se conservan la subida, el borrado, el orden y la elección de portada.
  - Etiquetas en paralelo.
  - Agencias reducidas a `name, slug` en esta página.
  - Proyección explícita de columnas en lugar de `*` para la lista.
- **E2 · Respuesta inmediata (D2):**
  - `app/[country]/(admin)/admin/loading.tsx` genérico.
  - Esqueletos específicos de Propiedades, ficha, Clientes y Solicitudes.
  - Estado pendiente en la sidebar con `useLinkStatus`.
  - Retirar o corregir el `particulares/loading.tsx`, que nunca se usa en el listado.
- **E3 · Notificaciones y precargas, sin tocar autenticación:**
  - Campana según D2.
  - Política de precarga según D3, solo con números de E0 y E2 delante y con una propuesta aceptada.

### Fuera de alcance

- Quitar la segunda llamada a `getUser()` del middleware.
- Memoizar identidad o permisos por petición, o cachés globales de perfiles y permisos.
- Agregar los recuentos de mensajes en SQL o RPC.
- Índices, esquema o migraciones.
- Paginación en servidor.
- Cambiar las reglas de búsqueda, los filtros, los recuentos o la selección.

Lo que el código de autenticación compartido necesite se propone en un plan aparte, con las mediciones de E0 como base.

### Criterios de aceptación (medibles antes/después)

Se miden con el mismo arnés de CRM-01 (`scripts/qa/crm-01-navegacion.mts`, ampliado en E0), los mismos datos sintéticos y la misma máquina. `main` y la rama se compilan por separado y se etiqueta cada cifra como local, de 40 ms simulados o de móvil simulado.

| # | Criterio | Línea base (local) | Objetivo |
|---|---|---|---|
| AC1 | Tamaño sin comprimir de la respuesta RSC de menú → Propiedades | 2.102 KB | ≤ 1.000 KB (−50 % o más); gzip, que no crezca |
| AC2 | Consultas de esa navegación (aislada) | 9 | ≤ 9 |
| AC3 | Paridad funcional de la lista | — | **cero diferencias** en un script de paridad sobre el conjunto sintético entre el adaptador actual y el nuevo: resultados de cada filtro y búsqueda, opciones de distrito, zona y agencia, totales y estadísticas, número de fotos (deduplicado como hoy) y «seleccionar todas las filtradas» |
| AC4 | Galería bajo demanda | — | el modal muestra las mismas fotos, en el mismo orden y con la misma portada que hoy. Mientras carga, se ve un estado de carga, no una galería vacía. Si falla, error con reintento |
| AC5 | Clic → primer indicador (navegación interna, 40 ms simulados) | ≈ igual a útil (536 / 573 ms) | ≤ 100 ms |
| AC6 | Clic → contenido útil | 573 ms (40 ms simulados); 1.843 ms (móvil simulado) | no empeora más de un 10 % (ruido); en móvil simulado, que baje gracias a E1 |
| AC7 | Tareas largas en móvil simulado al mostrar la lista | hasta ~310 ms | que bajen |
| AC8 | Peticiones a `/api/admin/notifications` en el recorrido R1 (6 navegaciones) | 1 por navegación | ≤ 1 por pestaña cada 60 s (si se aprueba la decisión 2) |
| AC9 | Consultas por precarga y total de la ventana «entrada en `/es/admin`» | ~3 por precarga; ~112 en la ventana | medidas en E0; con `loading.tsx`, que no suban sin una decisión explícita (decisión 1) |
| AC10 | Contrato de navegación de CRM-01 | 29/29 · 29/29 · 28/28 | igual |
| AC11 | Identidad y CI | verde | `test:permission-scope` (regresiones de #361), `test:user-rank`, `tsc`, build y CI en verde; sin cambios en sesión ni permisos |
| AC12 | Estilo | — | esqueletos y estados pendientes con tokens en claro y oscuro; capturas en escritorio y móvil |
| AC13 | Apertura de la galería (medida aparte) | hoy instantánea: las fotos ya vienen en la lista | clic → estado de carga visible ≤ 100 ms; clic → galería útil medido y anotado (local, 40 ms simulados y móvil simulado) |
| AC14 | Robustez de la galería | — | casos probados: error y reintento; cerrar y reabrir; cambiar de propiedad con una petición en curso (una respuesta tardía nunca sobrescribe otra galería ni ediciones más nuevas); subir, borrar, reordenar y cambiar la portada; la portada y el número de fotos de la fila siguen siendo correctos después de cada cambio |
| AC15 | Campana (D2) | — | probado: 60 s por pestaña; refresco inmediato tras marcar como leída; aislamiento por usuario y país; datos borrados al cerrar sesión o perder el acceso; respuestas de un contexto anterior descartadas; peticiones simultáneas deduplicadas; sin cambios en las reglas de la ruta |
| AC16 | Honestidad de la medición | — | builds equivalentes (`main` y rama compilados igual), varias pasadas en frío y en caliente, mediana y dispersión. El trabajo de la base de datos solo se da por reducido si lo muestra el registro del simulador (consultas y filas pedidas), no porque el navegador reciba menos bytes |

Si una mejora no se ve en los números locales, no se presenta como mejora. Los tiempos de producción solo se afirman si Fabricio los mide con el fragmento de consola de CRM-01.

### Impacto en datos y despliegue

- Sin migraciones ni datos reales.
- E1 añade una ruta de solo lectura para la galería, que reutiliza el guard existente y cumple `test:api-guards`.
- Un merge a `main` despliega.

## Plan (aprobado 2026-10-24; empieza cuando `main` incluya #368)

1. **E0 · Medición ampliada:**
   - Arnés: repetir por separado también las peticiones `[rsc·precarga]` y `GET /api/admin/notifications`.
   - Métrica «primer indicador»: el primer elemento con `data-crm-pending`, o el esqueleto.
   - Desglose del tamaño RSC por campo de `AdminProperty`.
   - Datos sintéticos de mensajes con la forma que espera la ruta.
   - Repetir la línea base en las tres variantes.
2. **E1 · Propiedades ligera:**
   - `propertyRowToAdminListItem` (adaptador nuevo): `photoCount` = número tras `dedupePhotosByUrl`, `coverPhotoUrl` (o la primera foto) y sin `photos`. Se mantienen los campos que usan `admin-filter.ts`, `admin-search.ts` y la fila; `floor` se sigue resolviendo en el servidor con título, características y descripción.
   - Consulta de lista con columnas explícitas. Agencias `name, slug`. `getPropertyTags` dentro del `Promise.all`.
   - Galería: `GET /api/admin/properties/[slug]/photos`, con el mismo permiso que hoy deja abrir el modal; el modal la pide al abrirse.
   - Script de paridad (AC3) en CI.
3. **E2 · Respuesta inmediata:**
   - `loading.tsx` del admin y esqueletos por módulo.
   - Sidebar: hijo del `Link` con `useLinkStatus` que marca `data-crm-pending`. Se confirma la API en la documentación de Next 15.5.
   - Medir AC5, AC6 y AC9 y presentar la decisión 1 con números.
4. **E3 · Campana y precargas:** según las decisiones 1 y 2. Medir AC8 y AC9.

**Pasos de entorno (D4):**
- `git ls-remote origin refs/heads/main`. Comprobar con `git merge-base --is-ancestor <merge de #368> <main>` que incluye #368; si no, parar.
- Rama de la entrega desde ese SHA.
- Copia aislada para compilar y medir: `git archive <commit> | tar -x -C <scratchpad>/<copia> --exclude='.env*'`. La copia no tiene ningún `.env`; `node_modules` se enlaza desde el checkout principal tras comprobar que `next` es la versión del lockfile. Así no se toca ningún fichero de entorno existente.
- `main` y rama se compilan en copias equivalentes, con las mismas variables dummy.
- Simulador `:54371` y `next start` `:3271`; para parar, solo los procesos que escuchan (`lsof -ti tcp:<puerto> -sTCP:LISTEN`).

**Entregas (PR pequeños; ninguno se fusiona sin Fabricio):**

| PR | Contenido | Depende de |
|---|---|---|
| CRM-02a · E0 | datos sintéticos de notificaciones corregidos; arnés con medición separada de precargas, notificaciones y galería; línea base nueva tras #368; este expediente | #368 en `main` |
| CRM-02b · E1 | lista ligera, galería bajo demanda, script de paridad en CI | CRM-02a en `main` (necesita su arnés) |
| CRM-02c · E2 | esqueletos y estado pendiente; números con y sin fronteras de carga para D3 | CRM-02a en `main` |
| CRM-02d · E3 | campana según D2 | CRM-02a en `main` |
| CRM-02e · precarga | solo si Fabricio acepta una de las alternativas presentadas con números (D3) | CRM-02c en `main` |

CRM-02b, c y d tocan archivos distintos y pueden abrirse en paralelo contra `main`, sin apilarse, para que cada uno tenga su CI.

**Condiciones de parada:** si un criterio no se puede cumplir (por ejemplo, AC1 sin romper AC3, o AC6 superado), se para y se informa con los números antes de seguir.

## Resultado

### E0 · Medición ampliada y línea base tras #368

Todo es **local**: build de producción de `main` (`d31075fd`, merge de #368) más el arnés de este PR, en una copia exportada sin ningún `.env`, contra el simulador con datos sintéticos.
- «lat40» son 40 ms de latencia **simulada** por consulta.
- «móvil» es CPU 4× más lenta y red limitada, **simuladas**.
- 3 pasadas por variante, cada una con un servidor nuevo: «frío» y luego «caliente».
- Cifra = mediana (mín–máx).
- Salidas completas en `medidas/e0-base/`; tabla completa en `medidas/e0-base/resumen.md`.

Cambios de E0 (sin tocar la app):
- **Datos sintéticos de notificaciones corregidos:**
  - mensajes con `content`, `read_at` y remitente embebido;
  - visitas pendientes recientes y avisos de catálogo.
  - Con ello `/api/admin/notifications` responde entero (antes fallaba con `TypeError`).
- **Arnés (`scripts/qa/crm-01-navegacion.mts`):**
  - repite por separado las precargas RSC y cada `GET /api/…` de la ventana;
  - nueva métrica `primerIndicadorMs` (`[data-crm-pending="true"]` o `[data-crm-skeleton]`);
  - cuenta las peticiones a la campana por recorrido;
  - nuevo recorrido R10: abrir, reabrir y cambiar de galería.
- **Lanzador y resumen:**
  - `scripts/qa/crm-02-medir.sh` hace la copia aislada, el build y las pasadas en frío y en caliente;
  - `scripts/qa/crm-02-resumen.mts` calcula medianas y dispersión, y avisa si las consultas varían entre pasadas.

**Contrato de navegación de CRM-01**, en las 18 pasadas: **31/31** en escritorio y con lat40, **30/30** en móvil.

| Navegación | Consultas (aislada) | KB sin comprimir | Útil, escritorio | Útil, lat40 | Útil, móvil | Tareas largas, móvil |
|---|---|---|---|---|---|---|
| Menú → Propiedades | 9 | 2.103 | 309 (296–380) | 588 (561–659) | 1.971 (1.871–1.985) | 184 (155–238) |
| Ficha → «Volver» | 9 | 2.102 | 238 (236–261) | 507 (492–507) | 1.229 (1.199–1.254) | 338 (324–366) |
| Lista → ficha | 13 | 9 | 104 (97–110) | 634 (630–661) | 614 (585–625) | 0 |
| «Ver archivadas» | 9 | 2.373 | 354 (240–361) | 838 (831–858) | 1.422 (1.415–1.588) | 148 (114–247) |
| Menú → Clientes | 16 | 194 | 75 (75–82) | 586 (529–599) | 1.030 (1.029–1.055) | 0 |
| Clientes → ficha | 29 | 5 | 69 (64–73) | 875 (857–898) | 1.561 (1.545–1.614) | 130 (0–442) |
| Menú → Solicitudes | 16 | 3 | 48 (39–51) | 551 (543–558) | 937 (917–944) | 0 |
| Abrir la galería (1.ª vez) | — | — | 69 (66–85) | 72 (56–76) | 198 (124–207) | 107 (59–127) |
| Reabrir la galería | — | — | 54 (41–60) | 41 (37–53) | 102 (89–157) | 0 |

Qué se ve:

1. **Ningún indicador explícito.** `primerIndicadorMs` está vacío en todas las navegaciones: hoy no hay ni esqueleto ni estado pendiente (lo cubre E2).
2. **Precargas.** Cada precarga cuesta **3 consultas**, siempre: 2 `getUser` y 1 `profiles` del middleware, sin datos de página. La entrada en `/es/admin` dispara **21 precargas = 63 consultas**, además de las 28 de la propia página y las 9 de la navegación siguiente. En móvil salen menos: 17 precargas, 51 consultas.
3. **Campana.** Cada `GET /api/admin/notifications` cuesta **12 consultas**, y se repite en casi cada navegación. Peticiones por recorrido (mediana): R1 = 3, R2 = 3, R8 = 3, R9 = 2, R5 = 2, R4/R10/R7 = 1. Es la base de AC8.
4. **Contadores de la sidebar.** Confirmado de nuevo: la petición aislada de una navegación interna no toca `visit_requests`, `crm_notifications` ni `team_*`.
5. **Galería.** Hoy abre en ~70 ms en escritorio porque las fotos ya vienen con la lista. Abrirla pide además 1 `/api` de 9 consultas, la de «fotos desde la web». Es la referencia de AC13.
6. **Consultas estables.** Las consultas aisladas no varían entre las 18 pasadas: los criterios de consultas (AC2, AC9) se pueden comparar exactos.

**Verificaciones de E0** (en `wt/crm-02`, rama `fabri/crm-02a-medicion`): `npx tsc --noEmit`, los `npm run test:*` de CI, `next build` en la copia aislada y las 18 pasadas, todo en verde. CI del PR: ver el PR.

### E1 · Lista de Propiedades ligera y galería bajo demanda

**Cambios**
- **Adaptador (`lib/db/adapters.ts`):** la lista ya no envía `photos`. Envía `photoCount`, el número tras ordenar por posición y quitar URLs repetidas, y `coverPhotoUrl`, la portada efectiva: la marcada o, si no hay, la primera de la galería. `adminGalleryFromRows` es la única regla, compartida por la lista y por la galería.
- **Ruta nueva `GET /api/admin/properties/[slug]/photos?country=…`**, de solo lectura:
  - mismo `canAccess(role, "properties", "view")` que la página de la lista;
  - la regla de país del layout del admin, copiada en `canSeeAdminCountry`: **no** se usa `canOperateInCountry`, que deja pasar `multi_country` a un país que el layout bloquea;
  - la propiedad debe ser de ese país (si no, 404);
  - `Cache-Control: private, no-store`.
- **Modal de fotos:**
  - En la lista pide la galería al abrirse. En la ficha sigue recibiéndola hecha.
  - Mientras carga muestra un esqueleto (`data-crm-skeleton`).
  - Si falla, un aviso con «Reintentar»; nunca una galería vacía.
  - Subir queda desactivado hasta tener la galería.
  - Los turnos (`createGalleryTurns`) descartan las respuestas de un modal cerrado, de otra propiedad o anteriores a una edición.
  - Subir, borrar, ordenar y portada usan los mismos manejadores y acciones de siempre, y siguen haciendo `router.refresh()`. Así el número de fotos y la portada de la fila salen otra vez del servidor tras cada cambio.
- **Página:** agencias con `select("slug, name")` (antes `*` más colaboraciones) y `getPropertyTags` en paralelo con el resto.

**Resultado** (local; mismas condiciones que la línea base de E0; `medidas/e1/`, tabla completa en `medidas/e1/resumen.md`; mediana de 3 pasadas en frío)

| | Línea base | E1 | Criterio |
|---|---|---|---|
| RSC de menú → Propiedades, sin comprimir | 2.103 KB | **879 KB** | AC1 ≤ 1.000 ✓ |
| Ídem, gzip | 158 KB | 73 KB | que no crezca ✓ |
| Consultas de esa navegación | 9 | 9 | AC2 ≤ 9 ✓ |
| Útil, menú → Propiedades (escritorio · lat40 · móvil) | 309 · 588 · 1.971 ms | 306 · **490** · **1.452** ms | AC6: no empeora más de un 10 % ✓ |
| Útil, «Volver» (escritorio · lat40 · móvil) | 238 · 507 · 1.229 ms | 194 · 415 · **731** ms | ✓ |
| Tareas largas en móvil al volver | 338 ms | 150 ms | AC7: bajan ✓ |
| Carga completa de la lista (documento) | 2.517 KB | 1.191 KB | — |
| Contrato de navegación (escritorio · lat40 · móvil) | 31 · 31 · 30 | **36 · 36 · 35** (5 comprobaciones nuevas de R11) | AC10 ✓ |

- **AC3 · Paridad:** `scripts/test-admin-properties-gallery.mts`, en `npm run test:admin-properties`, en CI. Compara 400 propiedades sintéticas, con fotos desordenadas y repetidas y portadas vacías:
  - el número de fotos y la portada son los mismos que pintaba la fila;
  - los campos de la lista son los de antes, con `photoCount` en lugar de `photos`;
  - los 14 casos de filtros y búsqueda devuelven las mismas propiedades;
  - los totales y las opciones de operación, distrito, zona y agencia son iguales.
  - La selección múltiple usa los mismos ids (`slug`) y no depende de las fotos.
- **AC13 · Apertura de la galería, medida aparte** (frío; escritorio · lat40 · móvil):
  - **Indicador de carga:** 29 · 22 · 21 ms.
  - **Galería útil:** 74 · **206** · 198 ms, frente a 69 · 72 · 198 ms antes. Es el coste de pedirla al abrir: con 40 ms simulados por consulta sube ~130 ms.
  - **Reabrir:** 63 · 51 · 101 ms. Se enseña lo último conocido mientras se pide la versión al día.
- **AC14 · Robustez:** recorrido R11 en el build, con la ruta retrasada o haciéndola fallar con `page.route`. Pasa en las 18 pasadas:
  - fallo, aviso y reintento correcto;
  - cerrar y reabrir con la petición en vuelo;
  - cambiar de propiedad con una respuesta tardía de la anterior;
  - una edición («Hacer principal») hecha mientras llegaba una respuesta más vieja se conserva.
  - Los turnos tienen además tests puros.
  - **No demostrado con el simulador:** que subir y borrar lleguen al almacenamiento (el simulador no lo sirve). Esos caminos no cambian de código.
- **AC16 · Base de datos:** el registro del simulador muestra las **mismas tablas y el mismo número de consultas** (9). La consulta de propiedades es idéntica (`select=*` con fotos): **el trabajo de la base de datos para la lista no ha bajado**, solo lo que llega al navegador. Cambian dos cosas menores: agencias pide dos columnas en lugar de `*` más colaboraciones, y las etiquetas ya no esperan a la primera tanda (una espera menos con latencia).
### E2 · Respuesta inmediata al pulsar el menú

**Qué se probó y por qué cambió el diseño (D6).** La primera versión, la aprobada en D2 (`loading.tsx` general y uno por sección, más `useLinkStatus`), daba indicador en 17-49 ms. Pero el contenido útil no llegaba nunca antes de **~810-890 ms**, con o sin latencia: Propiedades pasaba de 309 a 889 ms y Solicitudes de 48 a 816 ms.
- **Causa:** el servidor respondía en ~25 ms (medido con `curl`). El retraso estaba en el navegador: React, una vez enseñado el *fallback* de un `Suspense`, espera un mínimo antes de revelar el contenido (`FALLBACK_THROTTLE_MS`, 300 ms por frontera), y había fronteras anidadas.
- **Variantes medidas** (una pasada, local; útil en escritorio):
  - V1, solo la marca del menú: igual que la base (Solicitudes 69 ms), pero en móvil no se ve nada porque el menú se cierra al pulsar.
  - V2, un único `loading.tsx` por sección: sigue en ~800 ms.
  - V3, esqueleto superpuesto: igual que la base, con indicador en 26-64 ms.
- Fabricio eligió V3 (D6).

**Cambios** (lo que queda):
- **`components/admin/nav-pending.tsx`**, dentro de cada `<Link>` de la sidebar. Mientras `useLinkStatus().pending`:
  - el enlace muestra una marca giratoria (`data-crm-pending`);
  - encima del área de contenido (portal en `<main>`, a la derecha de la sidebar) aparece el esqueleto de la sección de destino (`data-crm-skeleton`).
  - En móvil, el menú se cierra al pulsar y lo que se ve es el esqueleto.
- **`components/admin/route-skeletons.tsx`:** esqueletos solo con tokens (`cream`, `ink`, `gold`), así que funcionan en claro y oscuro. Llevan `aria-busy` y «Cargando…» para lectores de pantalla.
- **Sin `loading.tsx` nuevos:** se quitaron los que se habían añadido.
- **`particulares/loading.tsx`,** que ya existía, usa ahora el esqueleto genérico con tokens; antes llevaba `bg-white` y no seguía el modo oscuro.
- **Acceso:** el esqueleto no lleva datos, y el acceso lo siguen decidiendo el middleware, el layout y cada página.

**Resultado** (local; mediana de 3 pasadas en frío; frente a la línea base medida en la **misma sesión**, `medidas/e2/` y `medidas/base-misma-sesion/`)

| Navegación | Base (útil) | E2 (útil) | E2 (primer indicador) |
|---|---|---|---|
| 40 ms · menú → Propiedades | 578 | 596 (+3 %) | **39** |
| 40 ms · menú → Clientes | 589 | 571 | **32** |
| 40 ms · menú → Solicitudes | 568 | 551 | **29** |
| 40 ms · «Volver» (no pasa por el menú) | 513 | 523 (+2 %) | — |
| Móvil · menú → Propiedades | 1.841 | 1.868 (+1 %) | 442 |
| Móvil · menú → Clientes | 1.003 | 1.035 (+3 %) | 428 |
| Móvil · menú → Solicitudes | 911 | 911 | 401 |
| Escritorio · menú → Propiedades | 314 | 302 (−4 %) | 44 |
| Escritorio · menú → Solicitudes | 60 | 66 (+6 ms, +10 %) | 26 |

- **AC5:** primer indicador ≤ 100 ms con 40 ms simulados ✓ (29-39 ms).
- **AC6:** el contenido útil no empeora más de un 10 % ✓, según la tabla.
- En móvil el indicador llega a ~400-440 ms, porque la CPU simulada va 4× más lenta. Es la primera respuesta visible: antes no había ninguna hasta el contenido, a 900-1.850 ms.
- Contrato de navegación: 31/31, 31/31 y 30/30 en todas las pasadas.
- **Escritorio sin latencia:** la primera pasada de E2 coincidió con el Mac recién despertado (carga media 12) y dio cifras infladas: Propiedades 362 ms y «Volver» 277 ms, aunque «Volver» no toca el código de E2. Se repitió con la máquina en calma (`medidas/e2-escritorio-repetida/`) y es la que figura en la tabla. A esta escala (60-300 ms), el ruido entre pasadas es de ±10 %: «Volver» varía 229 → 249 ms sin cambio de código.

### D3 · Precarga del menú: alternativas medidas (decidido: B, D7)

Alternativa B: medición con el código de E2 más una variante solo para medir, en `exp/crm-02-precarga-intencion`. La sidebar con `prefetch={false}` precarga con intención: `onMouseEnter`, `onFocus` (teclado) y `onTouchStart`. La navegación ocurre en el mismo toque, sin pedir un segundo toque. Local; mediana de 3 pasadas; `medidas/precarga-intencion/`.

| | A · automática (hoy) | B · por intención |
|---|---|---|
| Precargas al entrar en `/es/admin` (escritorio · móvil) | 21 · 17 | **9 · 9** |
| Consultas de esas precargas (escritorio) | 63 | **27** |
| Útil, menú → Propiedades (escritorio · 40 ms · móvil) | 314 · 578 · 1.841 | 286 · 562 · 1.840 |
| Útil, menú → Clientes (escritorio · 40 ms · móvil) | 99 · 589 · 1.003 | 99 · 578 · 1.015 |
| Útil, menú → Solicitudes (escritorio · 40 ms · móvil) | 60 · 568 · 911 | 67 · 541 · 906 |

- **Por qué no se pierde nada:** sin fronteras de carga (D6), la precarga automática de estas rutas dinámicas solo hace el trabajo del middleware (3 consultas) y no adelanta la página.
- **Las 9 que quedan con B** no son del menú: son de los enlaces de fichas visibles en las listas.
- **Límite de la medición:** el arnés pasa el puntero justo antes del clic, así que no mide la ventaja de la precarga al pasar el ratón con más antelación, que con B sería la misma o mejor.
- **Recomendación de Claude:** B. **Decisión de Fabricio (D7, 2026-10-25): B.** Se implementa en CRM-02e.
### E3 · Campana de notificaciones (D2)

**Cambios**
- **`lib/notifications/bell-store.ts`** (puro, sin React). Es una copia por pestaña de los datos de la campana:
  - reutiliza lo pedido hasta **60 s** (`isFresh`);
  - `load(key, { force: true })` pide al momento: es la excepción tras marcar leída;
  - varias campanas a la vez comparten **una** petición en vuelo;
  - una respuesta más vieja que otra posterior no la pisa;
  - datos y peticiones van separados por contexto `usuario|país`;
  - al cambiar de usuario en la misma pestaña se borra todo lo del anterior;
  - con 401/403 (sin sesión o sin acceso), o al pulsar «Cerrar sesión», se borra lo privado y se descarta lo que esté en vuelo.
- **`components/admin/notifications-bell.tsx`:**
  - usa ese almacén con la clave del usuario de la sesión, que ahora expone `CrmThemeProvider`, y el país de la URL;
  - fuera del layout del admin, sin usuario conocido, funciona como siempre, sin compartir nada;
  - al abrir un aviso de opinión lo quita de la copia local y, cuando el `POST` de marcar leído termina, pide de nuevo.
- **`components/admin-sidebar.tsx`:** el formulario de «Cerrar sesión» borra la copia antes de enviarse.
- **Sin cambios en `/api/admin/notifications`** ni en ninguna regla de sesión o permisos: la ruta sigue decidiendo qué ve cada usuario.

**Resultado** (local; mediana; `medidas/e3/` frente a `medidas/base-misma-sesion/`)

| | Base | E3 |
|---|---|---|
| Peticiones a la campana · R1 (lista → ficha → «Volver»…) | 3 | **2** |
| Peticiones a la campana · R2 (Atrás/Adelante) | 3 | **1** |
| Peticiones a la campana · R5 (Clientes) | 2 | **1** |
| R12: 3 navegaciones del menú en < 1 min tras la primera página con campana | 1 por navegación | **0 nuevas** ✓ |
| R12: marcar leída | — | `POST` y nueva petición al momento ✓ |
| Consultas por cada petición a la campana | 12 | 12 (sin cambios en la ruta) |
| Útil, menú → Propiedades (escritorio · 40 ms · móvil) | 314 · 578 · 1.841 | 307 · 613 · 1.876 |
| Útil, «Volver» (escritorio · 40 ms · móvil) | 229 · 513 · 1.227 | 240 · 523 · 1.216 |

- **AC8 ✓:** dentro de una misma pestaña, como mucho una petición por minuto, salvo tras marcar leída.
- **Por qué el total por pasada solo baja de 15 a 12:** cada recorrido del arnés empieza con una carga completa de página (`page.goto`), que crea una pestaña nueva a efectos de memoria y pide una vez. En el uso normal (navegar por el menú dentro de la misma pestaña) el ahorro es el de R12: de una petición por navegación a una por minuto, 12 consultas cada vez.
- **AC15 ✓:** `scripts/test-notifications-bell-store.mts` tiene 12 tests, encadenados en `npm run test:crm-appearance`, en CI. Cubren:
  - plazo de 60 s y refresco forzado;
  - petición compartida y respuestas desordenadas;
  - aislamiento por país y por usuario, y respuesta tardía del usuario anterior;
  - borrado al cerrar sesión con lo que esté en vuelo;
  - 401/403;
  - error de red, que conserva lo último sin marcarlo fresco;
  - avisos a los suscriptores.
- **No demostrado en navegador:** el cambio de usuario dentro de la misma pestaña (iniciar sesión con otra cuenta sin recargar). El simulador no tiene inicio de sesión real. Queda cubierto por los tests puros y por el borrado al pulsar «Cerrar sesión».
- **Contrato de navegación:** 33/33, 33/33 y 31/31 en las 18 pasadas.

## Cierre

| Entrega | PR | Merge en `main` |
|---|---|---|
| E0 · medición y línea base tras #368 | #369 | `9b7b9044` |
| E2 · respuesta inmediata al pulsar el menú (D6) | #371 | `41886dae` |
| Precarga del menú por intención (D7) | #373 | `d9c35b43` |
| E3 · campana con datos por pestaña (D2) | #372 | `000c3070` |
| E1 · lista de Propiedades ligera y galería bajo demanda | #370 | `94c19f46` |

- Cada PR se fusionó con su CI en verde. Antes de abrirlo o de actualizarlo se rebasó sobre el `main` del momento.
- Las combinaciones que no se habían medido juntas se comprobaron en local con el arnés antes de subirlas:
  - E3 sobre E2: 33/33 y 31/31;
  - E1 sobre todo lo anterior: 38/38 y 36/36, con 879 KB y 9 consultas en la lista.
- La CI de `main` pasa en verde tras #373 y #372. La de `94c19f46` se lanzó tras el merge de #370.
- Fabricio hizo todos los merges. Ninguno incluye migraciones ni cambios de sesión o permisos.

**Pendiente de comprobar en producción** (no se pudo con el simulador):
- **Modal de fotos de la lista:** abrir la galería, subir, borrar, reordenar y cambiar la portada, y que el número de fotos y la portada de la fila se actualicen después. Subir y borrar no llegaron nunca al almacenamiento real en las pruebas.
- **Campana:** cerrar sesión y entrar con otra cuenta en la misma pestaña no debe enseñar avisos de la anterior. Está cubierto solo por tests puros.
- **Tiempos reales:** todas las cifras de este expediente son locales o simuladas. Para tenerlos de producción, sirve el fragmento de consola de CRM-01 (`docs/changes/2026-10-24-crm-01-navegacion/change.md`).

**Fuera de este expediente** (requieren su propio plan, grande o sensible, D5):
- quitar la segunda llamada a `getUser()` del middleware;
- reducir las lecturas repetidas de identidad y permisos por petición (12 consultas por petición a la campana; 29 en la ficha de un cliente);
- agregar los recuentos de mensajes en SQL;
- que la consulta de la lista deje de traer `*` con todas las fotos: E1 no reduce el trabajo de la base de datos.

## Recuento de propiedades por país (solo lectura; lo ejecuta una persona autorizada)

Sirve para saber cuánto margen queda hasta el tope de 2.000 de la lista (C3b de CRM-01) y para dimensionar E1. **No bloquea** CRM-01 ni E0. Claude no lo ejecuta ni necesita credenciales.

Se ejecuta en el servidor, en el contenedor de la base de datos, dentro de una transacción de solo lectura. Usuario y base según el procedimiento habitual de quien lo ejecute. El resultado son solo recuentos, sin datos personales.

```sql
BEGIN TRANSACTION READ ONLY;

-- 1) Propiedades por país: la lista sin «Ver archivadas» y con ella.
SELECT country,
       count(*) FILTER (WHERE archived_at IS NULL)     AS sin_archivar,      -- lo que carga la lista por defecto
       count(*) FILTER (WHERE archived_at IS NOT NULL) AS archivadas,
       count(*)                                        AS total             -- lo que carga con «Ver archivadas»
FROM public.properties
GROUP BY country
ORDER BY country;

-- 2) Fotos por país (para estimar E1): cantidad y largo medio de las URL.
SELECT p.country,
       count(ph.*)                    AS fotos,
       round(avg(length(ph.url)))     AS largo_medio_url
FROM public.properties p
JOIN public.property_photos ph ON ph.property_id = p.id
WHERE p.archived_at IS NULL
GROUP BY p.country
ORDER BY p.country;

ROLLBACK;
```

Basta con devolver las dos tablas de resultados.
