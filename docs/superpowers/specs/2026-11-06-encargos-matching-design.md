# Encargos múltiples por cliente con matching y avisos — diseño

Fecha: 2026-11-06 · Rama: `feat/encargos-matching` (worktree `/root/wt-encargos`) · Estado: borrador para aprobación

## Por qué

Hoy un cliente guarda UNA sola búsqueda (`client_preferences`, clave primaria `client_id`). Las
colaboradoras (otras agencias que traen clientes) llegan con varios encargos a la vez, cada uno con
zonas, presupuesto y requisitos distintos. Caso real que lo provocó: **Yeanette Rubertiello**
(+34 669 51 72 11, cliente `c2177533-4513-4a67-9e2a-94221ad84232`), con 3 demandas. Hoy solo la
Demanda 1 está en sus preferencias; las otras dos viven como texto en una nota interna y no hacen
matching.

El equipo quiere: (1) que **cada encargo haga matching por separado**, (2) que **un cliente pueda
tener muchos encargos**, y (3) que **cuando entre algo nuevo que encaje, se avise en
Notificaciones** con un enlace directo al matching de ese encargo.

## Qué ve el usuario (decidido por el dueño)

- En la ficha del cliente hay una sección **Encargos**: lista de encargos, cada uno con su
  nombre, estado (activo / en pausa / cerrado) y su búsqueda completa (los mismos campos que las
  preferencias actuales). Se pueden crear, editar, pausar y cerrar.
- Cada encargo activo tiene su propio **matching** con las tres fuentes: propiedades del CRM,
  particulares de portales y captaciones.
- Cuando entra una propiedad / anuncio / captación nuevo que encaja con un encargo activo, el
  **asesor asignado al cliente y los administradores** reciben una notificación en la campanita:
  «Se encontró una propiedad nueva para el encargo *X* de *Cliente*».
- Al pinchar la notificación se abre la ficha del cliente, en ese encargo, en su bloque de
  matching, con el elemento nuevo destacado. La notificación se marca leída.

## Objetivos

1. Un cliente, N encargos; cada uno con su matching independiente.
2. Aviso en la campanita a asesor asignado + administradores, de **todas las fuentes** (CRM,
   particulares, captaciones).
3. Enlace de la notificación → ficha del cliente → encargo → matching, con el elemento destacado.
4. Los clientes actuales no pierden nada: su preferencia actual pasa a ser su primer encargo.
5. Yeanette queda con **una sola ficha y sus 3 encargos reales dentro** (uno por cliente suyo).
6. Un encargo recién creado o modificado cuenta **también el stock actual**, no solo lo que entre
   después (ver «Decisiones añadidas», punto 3).

## No objetivos (v1)

- Correo al cliente por cada encargo. El digest actual (`/api/cron/property-alerts`) sigue
  funcionando solo con el encargo principal y no se amplía.
- Que el cliente vea o edite varios encargos en su portal (el portal sigue viendo el principal).
- Avisar de bajadas de precio o de cambios en elementos ya vistos.
- Cambiar el algoritmo de puntuación: se reutiliza `evaluateMatch` (`lib/clients/brief-match.ts`).

## Anti-objetivos (lo que sería un fracaso aunque «funcione»)

- **Spam**: una avalancha de avisos tras una carga masiva de portales, o el mismo aviso repetido.
- **Una avalancha de avisos por el stock existente** al crear un encargo: el stock actual cuenta
  para el matching, pero se avisa con **un solo aviso agrupado**, nunca uno por elemento. Y al
  migrar los encargos ya existentes no se avisa de nada.
- Romper cualquier pantalla o flujo que hoy lee `client_preferences` (la ficha, el portal del
  cliente, las captaciones, las alertas por correo, los pases de propiedades).
- Desplegar a producción sin visto bueno explícito.

## Restricciones

- Producción es un VPS propio: PostgreSQL en el contenedor `supabase-db`, Next.js con PM2. El push
  a `main` despliega solo (migra y reinicia). **Nada se fusiona ni se empuja sin OK del dueño.**
- Migraciones numeradas en `supabase/migrations/` (la última es la 0242), aditivas e idempotentes,
  con rollback en `docs/changes/<expediente>/rollback-NNNN.sql` siguiendo la convención de la 0242.
- 15 filas en `client_preferences` hoy, 0 con alertas por correo activas, 7 clientes con asesor.
  Volumen bajo: no hace falta infraestructura pesada.
- Los avisos usan `crm_notifications` (campos `type`, `title`, `body`, `link`, `data` jsonb, `read`)
  y la campanita de `app/api/admin/notifications/route.ts`.
- El asesor del cliente es `profiles.assigned_advisor_id`. El alcance «solo lo suyo» de un asesor
  (`lib/db/queries/view-scope.ts`) debe respetarse al mostrar encargos y avisos.
- Solo España (`es`). Un admin solo debe recibir avisos si tiene acceso a `es`.
- Los portales alimentan `particulares` con el crawler de `/opt/idealista` (fuera de este repo): el
  matching no debe depender de modificarlo.

## Diseño propuesto (decisiones técnicas: mías, revisables)

### Modelo de datos

Extender `client_preferences` para admitir varias filas por cliente (la opción preferida) en lugar
de duplicar columnas en una tabla nueva:

- Añadir `id uuid` como nueva clave primaria; `client_id` deja de serlo.
- Añadir `label text` (nombre del encargo), `status text` (`active` | `paused` | `closed`),
  `is_primary boolean` y `position int`.
- Índice único parcial: una sola fila `is_primary = true` por cliente. Las filas existentes pasan a
  ser primarias y activas, así que todos los consumidores actuales siguen leyendo «la» preferencia
  del cliente filtrando por `is_primary` (cambio mecánico en los ~24 ficheros que la leen). Las
  escrituras que hoy hacen `upsert … onConflict client_id` pasan a apuntar a la fila primaria.
- El constructor puede elegir una tabla nueva `client_encargos` si comprueba que la opción de
  extender es más arriesgada; en ese caso `client_preferences` queda como espejo del principal y
  debe documentarse cómo se sincroniza.

Tabla nueva `encargo_matches` (registro de lo ya detectado y avisado):

- `encargo_id`, `source` (`property` | `particular` | `captacion`), `source_id`, `score`,
  `first_seen_at`, `notified_at`.
- Clave única `(encargo_id, source, source_id)`: garantiza **un solo aviso por elemento y encargo**.

### Detección

Una tarea periódica (ruta de cron `/api/cron/encargo-matches`, protegida con `CRON_SECRET` como las
demás, cada pocos minutos) que:

1. Toma lo creado desde la última marca de agua en cada fuente: `properties` (nuevas o recién
   disponibles), `particulares` (activos, no duplicados, sin fraude confirmado) y `captaciones`.
2. Evalúa cada elemento contra los encargos **activos** con `evaluateMatch`.
3. Inserta las coincidencias en `encargo_matches` (idempotente) y crea las notificaciones.

Al crear, reactivar o editar un encargo se hace además un **pase inicial sobre todo el stock
actual** (ver «Decisiones añadidas», punto 3) con un único aviso agrupado. El bloque de matching de
cada encargo muestra todo lo que encaja en este momento, avisado o no.

### Avisos

- Destinatarios: asesor asignado del cliente (si lo hay) + administradores con acceso al país del
  cliente. Sin duplicados si el asesor es además admin.
- Tipo `encargo_match`. Una notificación por encargo y pasada del cron: con un solo elemento nombra
  el elemento; con varios los agrupa («3 propiedades nuevas para el encargo X»), con un tope para
  que una carga masiva no inunde la campanita.
- `link`: `/{country}/admin/clientes/{clientId}?encargo={encargoId}&destacar={source}:{sourceId}#matching`.
  `data` guarda `clientId`, `encargoId` y los elementos para poder pintarlo.

### Pantallas

- Ficha del cliente: sección **Encargos** (listado + crear / editar / pausar / cerrar), reutilizando
  el formulario de búsqueda actual. El bloque de matching existente pasa a recibir el encargo
  seleccionado; el parámetro `encargo` de la URL elige cuál y `destacar` resalta el elemento.
- Campanita: pinta el nuevo tipo y marca leída al pinchar.

### Migración de datos

- Cada fila actual de `client_preferences` pasa a ser el encargo principal activo (`label`
  «Encargo 1» salvo que el constructor proponga algo mejor).
- Yeanette (una ficha, 3 encargos): su principal es la Demanda 1; se crean las Demandas 2 y 3 desde
  su nota interna (texto en `internal_notes` del cliente) con sus campos: Demanda 2 = alquiler,
  Recoletos/Justicia, amueblado, estudiantes, tope por dormitorios (3 dorm. → 5.200 €, 4 dorm. →
  6.300 €), 6 meses (enero–junio); Demanda 3 = alquiler larga estancia, Recoletos/Jerónimos/
  Castellana, 3–4 dorm., amueblado, hasta 5.900 €.

## Decisiones añadidas tras la revisión (llamadas mías, el dueño puede cambiarlas)

1. **Alcance: solo España (decisión del dueño: Chile no tiene nada que ver).** Sin encargos múltiples, avisos ni adaptador para Chile; los clientes `cl` siguen como hoy. **Qué es «captaciones» como fuente.** En España la pantalla `/es/admin/captaciones` es una vista
   sobre la tabla `particulares`, así que **particulares y captaciones son la misma fuente en ES**
   (se evalúa con `suggested-particulares.ts` / `evaluateParticularForClient`, no con
   `evaluateMatch` de propiedades). La tabla `captaciones` (migración 0048) es de Chile y queda **fuera**. Enum `source`: `property` | `particular`.
2. **Qué cuenta como «nuevo» (marca de agua).** `properties`: `created_at` o paso a `available`;
   `particulares`: `created_at` (nunca `scraper_extra`, que el crawler reescribe). Una fila solo se
   evalúa cuando tiene **al menos 15 minutos** (para que el enlazador `link-twins` ya haya corrido),
   y se excluyen las que tengan `duplicate_of` o `fraud_status` confirmado. Si el mismo inmueble
   llega por dos portales, el aviso se deduplica contra el **anuncio principal** (se resuelve
   `duplicate_of`): no hay segundo aviso aunque tenga otro `source_id`.
3. **El matching cuenta TAMBIÉN el stock actual, no solo lo nuevo (corrección del dueño).** Al crear
   un encargo, al reactivarlo o al cambiar sus criterios, se evalúa **todo el stock actual** de las
   fuentes y lo que encaja se registra en `encargo_matches` (con `first_seen_at`). Para no inundar
   la campanita, ese primer pase genera **un solo aviso agrupado** por encargo («12 propiedades
   actuales encajan con el encargo X de Y»), con enlace al matching; a partir de ahí cada elemento
   **nuevo** que encaje avisa por sí mismo (o agrupado en una pasada del cron). El mismo elemento
   nunca avisa dos veces por el mismo encargo. Al migrar los encargos que ya existen (los 15 clientes
   actuales) **no** se genera ningún aviso inicial: la migración solo registra su stock como ya
   visto, para no avisar de algo que el equipo ya conocía. El bloque de matching de cada encargo
   muestra siempre todo lo que encaja ahora mismo.
4. **El encargo principal.** No se puede pausar ni cerrar mientras sea el principal: hay que
   «hacer principal» a otro primero. Así los consumidores actuales (portal, alertas por correo,
   captaciones) filtran solo por `is_primary` y nunca encuentran un encargo cerrado. El digest por
   correo sigue usando únicamente el principal.
5. **Colaboradora = una ficha con un encargo por cliente suyo (corrección del dueño).** Yeanette es
   colaboradora y trae clientes; cada cliente suyo tiene **una demanda = un encargo**. Por tanto:
   **una sola ficha de Yeanette en Clientes (la que ya existe) con 3 encargos dentro**, uno por
   demanda. Nada de 4 encargos ni de fichas separadas. Cada encargo lleva un campo opcional de texto
   «cliente final / referencia» (p. ej. «Demanda 2 · estudiantes») para distinguirlos.
   - «3 dorm. hasta 5.200 € **o** 4 dorm. hasta 6.300 €» es **un solo encargo** (un solo cliente
     final). Se soporta con un tope de precio **por número de dormitorios** en el encargo (columna
     `max_price_by_bedrooms`, jsonb opcional, p. ej. `{"3":5200,"4":6300}`). Si existe, manda sobre
     `max_price` para esa cantidad de dormitorios; si no, se usa `max_price`. Hay que adaptar
     `evaluateMatch`/el filtro SQL del candidato (cambio pequeño y cubierto por tests de
     `brief-match`) y mostrarlo en el formulario de encargo.
   - La migración solo transforma estructura y convierte cada fila existente en encargo principal.
     Los encargos 2 y 3 de Yeanette los crea un script puntual (idempotente, no hace nada si el
     cliente no existe) que ejecuta el dueño en producción; su Demanda 1 actual ya es correcta y
     pasa a ser su encargo principal.
6. **Destinatarios.** Asesor asignado (`profiles.assigned_advisor_id`) **si no está suspendido**
   (`suspended_at`) y tiene acceso al país del cliente, más todos los usuarios con rol `admin` u
   `owner` (y `agent_admin`) con acceso a ese país (`profiles.country` / `countries` /
   `multi_country`). Un asesor con alcance «solo lo suyo» que no sea el asignado no recibe nada. Si
   el asesor asignado es además admin, una sola notificación. El cron usa service role, así que
   estos filtros se aplican a mano en el código y se prueban; se reutiliza cualquier helper que ya
   exista en `lib/db/queries/view-scope.ts` en vez de reimplementar el alcance.

7. **El matching lee el texto, no solo los números (recordatorio del dueño).** Cada encargo se
   evalúa con la misma lectura de evidencia que ya existe: título, **descripción** y
   **características** de la ficha (y `attrs`, `floor`, `condition` en particulares), con regex
   sobre texto sin tildes. Eso incluye exterior/interior, «bajo», terraza/balcón, reformado,
   amueblado, ascensor, mascotas, imprescindibles y deseables, etc. Se descarta solo con evidencia
   explícita y, si la ficha no menciona algo, se avisa en `matchWarnings` en vez de descartar. Los
   dos adaptadores de fuente (propiedades y particulares) deben aplicar esa
   misma lectura al motor de cada encargo, y el aviso de la campanita debe poder mostrar el motivo
   («exterior, terraza, reformado») que salió del texto. Cobertura de tests: casos con la evidencia
   solo en la descripción, solo en las características y contradictoria.

8. **Captaciones también elige encargo (petición del dueño, 2026-11-06).** En `/es/admin/captaciones?cliente=…` la barra «Captando para {cliente}» debe permitir elegir **cualquiera de los encargos del cliente** (no solo el principal) y todo lo que depende del encargo debe seguir al elegido: resumen y «Ver encargo», «Editar encargo», «Encaja N» y puntuaciones, brief y zona dibujada del mapa (se guarda en ese encargo), y la tarjeta «Para el encargo de X» de la ficha del anuncio. Captar para el cliente y añadir a su book sigue siendo del cliente. Plan: Task 11.

## Dejado al constructor

Nombres exactos de columnas y rutas, estructura de componentes, forma del agrupado de avisos y su
tope, frecuencia del cron, cómo detectar «recién disponible» en propiedades, estrategia de pruebas
(se espera cobertura del dedupe, del filtrado por país/asesor y de la migración con vuelta atrás),
y si el encargo principal puede cerrarse.

## Cómo se entrega

En esta rama, sin fusionar ni empujar. La instalación del cron en el VPS y el despliegue los
decide el dueño después de ver la rama funcionando.
