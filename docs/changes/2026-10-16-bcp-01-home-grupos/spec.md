# HOME · grupos editables de catálogos: especificación

Fabricio organiza la estantería de catálogos de su HOME en grupos y subgrupos propios, que crea, renombra y ordena él, para encontrar un catálogo antes de entrar en él. No cambia qué propiedades entran en ningún catálogo.

- **Tamaño:** grande o sensible (propuesta). Lleva una migración con tablas nuevas y funciones de escritura con guarda de dueño.
- **Responsable:** Fabricio.
- **Estado:** **borrador**. No está aprobada. No autoriza plan, implementación, migraciones ni PR.
- **Base explorada:** `origin/main` = `b1f2b49` (16 de octubre de 2026, tras el merge de E3, #321).
- **Antecedente:** [`futuro-home-grupos.md`](../2026-10-13-bcp-01-home-catalogo/qa-c2/futuro-home-grupos.md) (15 de octubre de 2026).
- **Nombre de la carpeta:** la regla pide la fecha del inicio de la implementación. Se renombra si esa fecha cambia.

## Contexto

### Lo que pidió Fabricio (16 de octubre de 2026, resumen fiel)

- Organizar la estantería de catálogos **antes** de entrar en cada uno. Por ejemplo: Salamanca → Recoletos, Castellana, Lista, Goya; Chamberí; Retiro.
- **Crear, renombrar y organizar los grupos él mismo**, sin depender de zonas fijas en el código.
- **Un catálogo puede cubrir varios barrios,** por ejemplo Recoletos y Castellana.
- **La organización es distinta de los criterios de la selección automática.** Ni el título ni el grupo de un catálogo pueden cambiar sus filtros sin avisar.
- **Se conservan** la navegación del CRM y todo lo ya entregado en los catálogos.
- **Fuera:** el PDF (importar y exportar) es otra tarea futura.

### Cómo es hoy la HOME (comprobado en el código de `b1f2b49`)

- **Página:**
  - `app/[country]/(admin)/admin/mi-espacio/page.tsx` comprueba en el servidor que el perfil está en `home_owners` (`requireHomeOwnerPage`); si no, 404.
  - Carga `listOwnerCatalogs(profile.id)` y pinta `HomeView`.
- **`HomeView`** (`components/admin/catalogs/home-view.tsx`) tiene tres bloques:
  - «Accesos»: Clientes, Propiedades y Solicitudes;
  - «Módulos»: Catálogos, y un hueco para «Próximos módulos»;
  - «Catálogos»: el recuento, el botón «Nuevo catálogo» (`NewCatalogForm`) y la estantería.
- **Estantería** (`components/admin/catalogs/catalog-shelf.tsx`, componente de cliente):
  - **Filtros en el navegador** sobre la lista completa del dueño: búsqueda por título o anuncio, anuncio de origen, **Zona**, operación, modo y estado (por defecto «Activos»), y el recuento «N de M».
  - **El filtro «Zona» se deduce de los criterios guardados** (`criteria.zones`), es decir, de la selección automática. Un catálogo manual sin zonas en sus criterios no aparece con ninguna zona.
  - **Rejilla de portadas** (`CatalogCover`), de 2 a 5 columnas según el ancho. Cada tarjeta lleva el título, el estado, el modo, el número de propiedades, el resumen de criterios, los anuncios de origen, la fecha y «Gestionar» → `…/catalogos/{id}`.
- **Orden:** `listOwnerCatalogs` pone primero los activos y, dentro de cada estado, lo último actualizado (`updated_at`). El número de catálogo (`numberLabel`) sale del orden de creación.
- **Datos** (migración `0192`):
  - `catalogs` guarda el dueño, el título, la entrada, el estado, `version` y las fechas;
  - `0194` añade el contacto, `0195` el modo y los criterios, y `0196` la portada elegida.
  - Cada escritura pasa por funciones `SECURITY INVOKER` que llaman a `catalog_require_owner` (dueño de la HOME y del catálogo, con bloqueo `FOR UPDATE`) y suben `catalogs.version`.
  - Las tablas tienen RLS sin políticas y solo `service_role`.
- **Huella del lector:** es el md5 de la instantánea interna (`0193`/`0202`). Cualquier dato que entre en la instantánea cambia la huella y avisa a los lectores abiertos.
- **Taxonomía de zonas:** `lib/madrid-zones.ts` (21 distritos y sus barrios) y `lib/catalogs/zones.ts` (alias de catálogos). Salamanca incluye Castellana, Fuente del Berro, Goya, Guindalera, Lista y Recoletos, así que el ejemplo de Fabricio cuadra con la taxonomía oficial. **Esta especificación no la toca.**
- **Fixtures de desarrollo:** `/dev-fixtures/mi-espacio` pinta la misma `HomeView` en modo `demo`. La prueba de regresión que mira la estantería es `prB.mjs` (`shelf-filters`, `shelf-count`).

### No comprobado

- Cuántos catálogos tiene hoy Fabricio en producción y con qué títulos. No hay acceso a producción; no hace falta para especificar.

## Decisiones

Aún no hay decisiones de Fabricio sobre esta tarea; las preguntas abiertas están al final. Lo que sigue son **requisitos que ya dio** (16 de octubre de 2026), no decisiones nuevas:

- **R1.** Los grupos los crea, renombra y ordena Fabricio; no son zonas fijas en el código.
- **R2.** Un catálogo puede cubrir varios barrios (ejemplo: Recoletos y Castellana).
- **R3.** La organización es independiente de los criterios. Ni el título ni el grupo cambian los filtros de propiedades.
- **R4.** Se conservan la navegación del CRM y las funciones de catálogos ya entregadas.
- **R5.** Esta primera versión es solo de organización. No rediseña los filtros de catálogos ni cambia otras partes del CRM.

## Propuesta (pendiente de aprobación)

Todo lo de esta sección es **propuesta**. Las alternativas están en «Preguntas abiertas».

### P1 · Modelo: etiquetas jerárquicas, varias por catálogo

- **Grupos con subgrupos:** un grupo puede tener subgrupos. **Dos niveles como máximo**: grupo → subgrupo. Ejemplo: «Salamanca» con «Recoletos», «Castellana», «Lista» y «Goya»; «Chamberí» y «Retiro» sin subgrupos.
- **Varios grupos por catálogo, sin copiarlo.** Un catálogo «Recoletos y Castellana» puede estar en los dos subgrupos; es el mismo catálogo con dos etiquetas (R2). Lo pide el ejemplo de Fabricio y lo anticipaba la nota del 15 de octubre.
- **Los grupos son de Fabricio:** privados del dueño, como la propia HOME. No los ve nadie más, ni el cliente, ni el lector, ni los enlaces compartidos, ni ninguna exportación futura.
- **Son solo organización:**
  - no tocan `catalogs.criteria` ni `catalogs.title`;
  - no tocan `catalogs.version` ni `updated_at`;
  - no tocan la instantánea ni la huella, así que asignar o renombrar no avisa a ningún lector ni reordena la estantería por «última actualización».
- **Los nombres son libres:** «Salamanca» como grupo no está ligado al distrito Salamanca de la taxonomía. Coincidir en el nombre no tiene efecto.

### P2 · Interfaz (dentro de la sección «Catálogos» de la HOME)

Se reutilizan los componentes y las clases del CRM: los botones de borde dorado, `crm-*` y el patrón de panel lateral del gestor (`SidePanel`/`SidePanelFooter`).

- **Selector de grupo encima de la estantería:**
  - **Escritorio:** una fila de botones tipo pestaña: **Todas · Sin organizar · Salamanca · Chamberí · Retiro**, cada una con su recuento.
    - Al elegir un grupo con subgrupos aparece una segunda fila: **Todo Salamanca · Recoletos · Castellana · Lista · Goya**.
  - **Móvil (362/320):** las mismas filas con desplazamiento horizontal dentro de la fila (nunca de la página), o un desplegable si hay muchos grupos.
  - **Recuentos:** siguen el filtro de estado actual; por defecto, Activos.
- **Combina con los filtros de hoy:** el grupo elegido se suma a la búsqueda, el anuncio, la zona, la operación, el modo y el estado; ninguno se quita.
  - El filtro «Zona» pasa a llamarse **«Zona de los criterios»**, para que no se confunda con los grupos.
  - El texto «Ningún catálogo coincide con estos filtros» se mantiene.
- **Estado en la URL:** el grupo elegido va en la dirección (`?grupo=…`). Al volver del gestor, la estantería sigue donde estaba.
- **Botón «Organizar»** junto a «Nuevo catálogo». Abre un panel lateral para:
  - crear un grupo o un subgrupo, con un nombre de 1 a 60 caracteres que no se repita entre hermanos;
  - renombrar;
  - ordenar con flechas ▲▼ (funcionan en táctil; el arrastre nativo no) y, opcionalmente, arrastrando en escritorio;
  - borrar, con confirmación (ver P4);
  - ver cuántos catálogos tiene cada grupo.
- **Asignar un catálogo:**
  - en cada tarjeta, un enlace pequeño **«Grupos»** junto a «Gestionar», con las etiquetas actuales como texto. Abre un diálogo con casillas por grupo y subgrupo;
  - el mismo diálogo, desde el menú «⋯» de la cabecera del gestor, junto a Archivar o Reactivar;
  - **se guarda al pulsar** y avisa con el mismo patrón de mensajes del gestor;
  - el diálogo dice: **«Los grupos solo ordenan tu HOME: no cambian qué propiedades entran en el catálogo.»**
- **Catálogo nuevo:** si hay un grupo elegido al crearlo, el formulario «Nuevo catálogo» ofrece ponerlo en ese grupo, con la casilla marcada y editable.
- **Tarjeta:** en cada tarjeta, debajo del título, las etiquetas del catálogo («Salamanca › Recoletos · Castellana») en texto pequeño.

### P3 · Qué significan «Todas» y «Sin organizar»

- **«Todas»:** todos los catálogos del dueño, sin mirar los grupos. Es lo que la estantería enseña hoy y la vista por defecto.
- **«Sin organizar»:** los catálogos que no están en ningún grupo ni subgrupo. Sirve para que ninguno se pierda al organizar.
- **Un grupo con subgrupos:** al elegirlo («Todo Salamanca») se ven los catálogos del grupo y de todos sus subgrupos, **sin repetir** ninguno.
- **Un subgrupo:** se ven solo sus catálogos.
- **Archivar un catálogo** no cambia sus grupos. El filtro de estado decide si se ve.

### P4 · Renombrar y borrar

- **Renombrar** cambia solo el nombre. Los catálogos siguen dentro y nada más cambia: ni títulos, ni criterios, ni lectores.
- **Borrar un subgrupo** pide confirmación: «Se quita la etiqueta de N catálogos. Los catálogos no se borran ni cambian.» Los catálogos que se queden sin ningún grupo pasan a «Sin organizar».
- **Borrar un grupo con subgrupos** pide confirmación y nombra sus subgrupos: se borran con él y se quitan sus etiquetas. Alternativa en la pregunta 5: impedirlo hasta vaciarlo o mover los subgrupos.
- **Nunca se borra ni se modifica un catálogo** al borrar un grupo.
- **Sin papelera ni «deshacer»** en esta primera versión. Las etiquetas perdidas se vuelven a poner a mano.

### P5 · Asignación manual; sugerencias solo como ayuda opcional

- **Primera versión: asignación solo manual.** Ningún catálogo entra solo en un grupo por sus criterios, su título o su modo (R3).
- **Sugerencias (opcional; ver pregunta 2):**
  - el diálogo «Grupos» puede proponer los grupos o subgrupos **ya creados** cuyo nombre coincida, sin tildes ni mayúsculas, con un barrio o distrito de los criterios guardados. Por ejemplo, criterios con el barrio Recoletos → «¿Añadir a Salamanca › Recoletos?»;
  - **nunca se aplican sin pulsar**, nunca crean grupos y nunca cambian los criterios;
  - los catálogos manuales no tienen sugerencias, porque no tienen zonas en sus criterios.

### P6 · Orden

- **Grupos y subgrupos:** orden manual. Los nuevos van al final.
- **Catálogos dentro de un grupo:** el orden de hoy (activos primero y después la última actualización). En la primera versión no se ordenan a mano.

## Alcance (si se aprueba la propuesta)

- Migración nueva (número libre al preparar el plan; hoy sería `0203`), con:
  - la tabla de grupos y la de asignaciones;
  - las funciones de escritura con guarda de dueño;
  - RLS, permisos y el script de reversión.
- Lectura de los grupos y las asignaciones en `listOwnerCatalogs` o en una consulta aparte del servidor.
- En la estantería:
  - el selector de grupo con su recuento y su estado en la URL;
  - las etiquetas en las tarjetas;
  - el panel «Organizar»;
  - el diálogo «Grupos» en la tarjeta y en el menú «⋯» del gestor;
  - la opción al crear un catálogo.
- El texto «Zona de los criterios» en el filtro actual.
- Las fixtures de desarrollo de la HOME con grupos de ejemplo.
- Pruebas:
  - SQL: permisos, guardas, límites, renombrar, borrar y «no toca catálogos ni la huella»;
  - lógica pura: «Todas», «Sin organizar», grupo con subgrupos sin repetir y combinación con los filtros;
  - navegador a 1440, 362 y 320, más la regresión `prB.mjs`.

## Fuera de alcance

- Cambiar los criterios, la selección automática, la taxonomía de zonas (`madrid-zones.ts`, `zones.ts`, alias) o el filtro «Zona» en sí, salvo su texto.
- Rediseñar la estantería, la rejilla de portadas o los filtros existentes.
- Grupos compartidos con otros usuarios, carpetas públicas o grupos visibles para el cliente.
- Más de dos niveles, orden manual de catálogos dentro de un grupo, colores o iconos por grupo, y papelera.
- Asignación automática por criterios o por título.
- PDF (importar y exportar).
- Cambios en otras pantallas del CRM o en su menú.

## Invariantes

- **Organizar no cambia el contenido:** crear, renombrar, ordenar, borrar o asignar grupos nunca cambia `catalogs.title`, `criteria`, `mode`, `status`, `version` ni `updated_at`, ni `catalog_items`, ni los ajustes de C1, C2 o E3, ni la instantánea, la huella o lo que ve el cliente.
- **Solo el dueño de la HOME** (`home_owners`) gestiona sus grupos, y solo con sus propios catálogos. Un grupo o catálogo ajeno o inexistente responde igual que hoy (`forbidden`), sin revelar si existe.
- **Las escrituras** son funciones atómicas con `catalog_require_owner`, `SECURITY INVOKER`, `search_path` fijo y `EXECUTE` solo para `service_role`, como `0192`–`0202`.
- **Los grupos no salen del área interna:** nada en el contrato público, el lector, `/api/seleccion/*` ni los enlaces compartidos.
- **Borrar un grupo** nunca borra un catálogo, y un catálogo nunca desaparece de «Todas».
- **Nada cambia sin grupos:** si no hay grupos, o la migración no está aplicada, la HOME funciona exactamente como hoy.

## Datos e impacto (propuesta)

- **Tablas nuevas** (sin tocar las existentes):
  - **`catalog_groups`:**
    - columnas `id`, `owner_id` → `profiles`, `parent_id` (nulo en un grupo; si no, un grupo **sin** padre), `name`, `position` y fechas;
    - nombre único entre hermanos sin distinguir mayúsculas;
    - un límite razonable, por ejemplo 100 grupos por dueño.
  - **`catalog_group_members`:**
    - columnas `group_id` y `catalog_id`, con clave `(group_id, catalog_id)` y `ON DELETE CASCADE` en las dos claves foráneas;
    - borrar un grupo o un catálogo solo quita la etiqueta.
- **Funciones:**
  - crear, renombrar, mover u ordenar (con la lista completa de ids, como `reorder_client_portal_links`) y borrar grupos;
  - poner y quitar un catálogo de un grupo.
  - **No** suben `catalogs.version` ni tocan `updated_at`.
- **Lectura:** una consulta más en la HOME (grupos y asignaciones del dueño), con coste despreciable frente a las instantáneas que ya lee para las portadas.
- **Producción:** fusionar puede desplegar y aplicar la migración. No hay datos que migrar: los grupos empiezan vacíos y todo está en «Sin organizar».
- **Sin integraciones externas,** sin IA y sin escrituras en propiedades.

## Recuperación de migraciones

- **Revertir con SQL** (`rollback-0203.sql` o el número que toque) es seguro: borra solo las dos tablas y sus funciones. **Se pierde la organización.** Los catálogos, sus criterios y lo que ve el cliente no cambian.
- **Código anterior con el esquema nuevo:** funciona e ignora los grupos; la HOME vuelve a la estantería de hoy.
- **Transacción:** el archivo irá en su propia transacción (`BEGIN`/`COMMIT`) y será idempotente, como las anteriores.

## Criterios de aceptación (propuesta)

| # | Criterio |
| --- | --- |
| AC1 | Fabricio crea «Salamanca» con los subgrupos «Recoletos», «Castellana», «Lista» y «Goya», y los grupos «Chamberí» y «Retiro». Los renombra y los reordena; el orden se mantiene al recargar. |
| AC2 | Un catálogo puede estar en «Recoletos» y en «Castellana» a la vez. En «Todo Salamanca» aparece una sola vez. |
| AC3 | «Todas» enseña lo mismo que la estantería de hoy y «Sin organizar» solo los catálogos sin ningún grupo. Los recuentos cuadran con lo que se ve. |
| AC4 | Asignar, renombrar, ordenar o borrar grupos no cambia el título, los criterios, el modo, el estado, `version`, `updated_at`, las propiedades ni la huella de ningún catálogo (prueba SQL y prueba en el navegador con el lector abierto). |
| AC5 | Borrar un grupo pide confirmación, no borra catálogos y deja en «Sin organizar» los que se queden sin grupo. |
| AC6 | El grupo elegido se combina con los filtros actuales, se guarda en la URL y se mantiene al volver del gestor. |
| AC7 | Solo el dueño de la HOME ve y edita sus grupos. Un grupo o catálogo ajeno da `forbidden`, y nada de esto aparece en el lector, en `/api/seleccion/*` ni en los enlaces. |
| AC8 | A 1440, 362 y 320 no hay desplazamiento horizontal de la página. Los controles se pueden usar con el teclado y en táctil (▲▼). |
| AC9 | Sin grupos, la HOME es como hoy (regresión `prB.mjs` en verde). La navegación del CRM y las secciones del gestor no cambian. |
| AC10 | Si se aprueban las sugerencias: solo aparecen sobre grupos ya creados, nunca se aplican sin pulsar y no cambian los criterios. |

## Riesgos

- **Confundir grupos y criterios:** que alguien crea que mover un catálogo a «Recoletos» cambia sus viviendas. Lo mitigan la frase del diálogo, el nombre «Zona de los criterios» y AC4.
- **Dos maneras de «zona»:** el filtro deducido de los criterios y los grupos propios. Mantener los dos puede confundir. Quitar el filtro de zona queda fuera de esta tarea y se puede valorar después.
- **Borrar un grupo con muchos catálogos dentro:** se pierde trabajo de organización sin «deshacer». Lo mitigan la confirmación con el recuento y que los catálogos no se tocan.
- **La estantería en el móvil** con muchos grupos. Lo mitigan la fila con desplazamiento propio o el desplegable, y AC8.
- **Que una escritura de grupos suba `version`** por reutilizar una función existente, lo que avisaría a los lectores sin motivo. Lo vigila AC4.
- **Número de migración:** hay que comprobar el siguiente libre justo antes de implementar y antes de publicar.

## Preguntas abiertas (para Fabricio)

1. **¿Varios grupos por catálogo o uno solo?** Propuesta: varios. Si un catálogo debe tener una sola «ubicación», el modelo y el diálogo se simplifican, pero un catálogo «Recoletos y Castellana» tendría que ir en «Salamanca» y no en los dos barrios.
2. **¿Solo manual, o también sugerencias a partir de los criterios guardados?** Propuesta: manual en la primera versión, con sugerencias opcionales que nunca se aplican solas (P5). ¿Las quieres ya o más adelante?
3. **¿Cuántos niveles y cómo se ordenan?** Propuesta: dos niveles (grupo → subgrupo), orden manual de los grupos y, dentro de cada grupo, los catálogos en el orden de hoy. ¿Te basta, o necesitas un tercer nivel u ordenar los catálogos a mano?
4. **«Todas» y «Sin organizar»:** propuesta como en P3. ¿Quieres que la HOME abra en «Todas» o en el último grupo que usaste?
5. **Borrar un grupo con subgrupos:** ¿se borran los subgrupos con él tras confirmar (propuesta), o no se puede borrar hasta vaciarlo o mover sus subgrupos?
6. **Un catálogo en un grupo y en uno de sus subgrupos a la vez** (por ejemplo, «Salamanca» y «Recoletos»): ¿se permite (propuesta: sí, aunque sea redundante) o se marca solo el subgrupo?

## Aprobación

Pendiente. Cuando Fabricio responda las preguntas y apruebe esta especificación, se preparará `plan.md` para su revisión. Esta especificación no permite implementar.
