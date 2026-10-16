# HOME · grupos editables de catálogos: especificación

Fabricio organiza la estantería de catálogos de su HOME en grupos y subgrupos propios, que crea, renombra y ordena él, para encontrar un catálogo antes de entrar en él. No cambia qué propiedades entran en ningún catálogo ni lo que ve el cliente.

- **Tamaño:** grande o sensible. Lleva una migración con tablas nuevas y funciones de escritura con guarda de dueño.
- **Responsable:** Fabricio.
- **Estado:** **aprobada** el 16 de octubre de 2026, junto con la maqueta y el plan T0–T8 (ver «Aprobación»).
- **Base explorada:** `origin/main` = `b1f2b49` (16 de octubre de 2026, tras el merge de E3, #321).
- **Plan en borrador:** [`plan.md`](plan.md). **Maqueta:** [`maquetas/home-grupos.html`](maquetas/home-grupos.html).
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
  - **Filtros en el navegador** sobre la lista completa del dueño: búsqueda por título o anuncio, anuncio de origen, **Zona**, operación, modo y estado (por defecto «Activos»), y el recuento «N de M». Los filtros viven en el estado del componente, no en la URL.
  - **Rejilla de portadas** (`CatalogCover`), de 2 a 5 columnas según el ancho. Cada tarjeta lleva el título, el estado, el modo, el número de propiedades, el resumen de criterios, los anuncios de origen, la fecha y «Gestionar» → `…/catalogos/{id}`.
- **El filtro «Zona» depende de los criterios guardados (`criteria.zones`), no del modo.**
  - Las opciones son las zonas que aparecen en los criterios guardados de algún catálogo.
  - Un catálogo solo entra en una zona si sus criterios guardados la incluyen, sea manual o automático.
  - Un catálogo **manual** puede tener criterios guardados: `catalog_set_criteria` no exige el modo automático, y pasar de automático a manual (`catalog_set_mode`) conserva los criterios.
  - Un catálogo, manual o automático, sin zonas en sus criterios no aparece en ninguna zona.
- **Orden:** `listOwnerCatalogs` pone primero los activos y, dentro de cada estado, lo último actualizado (`updated_at`). El número de catálogo (`numberLabel`) sale del orden de creación.
- **Datos** (migración `0192`):
  - `catalogs` guarda el dueño, el título, la entrada, el estado, `version` y las fechas;
  - `0194` añade el contacto, `0195` el modo y los criterios, y `0196` la portada elegida.
  - Cada escritura pasa por funciones `SECURITY INVOKER` que llaman a `catalog_require_owner` (dueño de la HOME y del catálogo, con bloqueo `FOR UPDATE`) y suben `catalogs.version`.
  - Las tablas tienen RLS sin políticas y solo `service_role`.
- **Huella del lector:** es el md5 de la instantánea interna (`0193`/`0202`). Cualquier dato que entre en la instantánea cambia la huella y avisa a los lectores abiertos.
- **Taxonomía de zonas:** `lib/madrid-zones.ts` (21 distritos y sus barrios) y `lib/catalogs/zones.ts` (alias de catálogos). Salamanca incluye Castellana, Fuente del Berro, Goya, Guindalera, Lista y Recoletos. **Esta tarea no la toca ni depende de ella.**
- **Fixtures de desarrollo:** `/dev-fixtures/mi-espacio` pinta la misma `HomeView` en modo `demo`. La prueba de regresión que mira la estantería es `prB.mjs` (`shelf-filters`, `shelf-count`).

### No comprobado

- Cuántos catálogos tiene hoy Fabricio en producción y con qué títulos. No hay acceso a producción; no hace falta para especificar.

## Decisiones

Aprobadas por Fabricio el 16 de octubre de 2026 (resumen fiel):

- **D1. Varios grupos por catálogo:** un catálogo puede estar en varios grupos y subgrupos, también en un grupo y en uno de sus subgrupos a la vez. La vista de un grupo incluye lo asignado a sus subgrupos y enseña cada catálogo **una sola vez**.
- **D2. Solo manual:** en la primera versión las asignaciones son solo manuales. Las sugerencias a partir de los criterios quedan para más adelante.
- **D3. Dos niveles como máximo:** grupo → subgrupo.
- **D4. Orden:** los grupos y subgrupos se ordenan a mano. Los catálogos conservan su orden actual.
- **D5. Último grupo:** al volver a la HOME se recuerda el último grupo elegido.
- **D6. Borrar:** borrar un grupo borra sus subgrupos tras una confirmación explícita, pero nunca borra catálogos. Se conservan las asignaciones a otros grupos.
- **D7. «Todas» y «Sin organizar»:** «Todas» es la estantería de hoy, con sus demás filtros. «Sin organizar» son los catálogos a los que no les queda ninguna asignación.

Aprobadas por Fabricio el 16 de octubre de 2026, con la especificación (resumen fiel):

- **D8. El último grupo** se recuerda por separado en cada navegador o dispositivo.
- **D9. Mover un subgrupo** a otro grupo está permitido. Conserva sus asignaciones y el límite de dos niveles.
- **D10. Crear desde un grupo:** al crear un catálogo con un grupo elegido se ofrece una casilla opcional, **desmarcada**, para ponerlo en ese grupo. Nunca se asigna solo.
- **D11. El filtro geográfico actual** pasa a llamarse «Zona de los criterios», sin cambiar su comportamiento.
- **D12. Nombres** de 1 a 60 caracteres, únicos entre hermanos sin distinguir mayúsculas ni tildes.
- **D13. Como mucho 100 grupos** en total, subgrupos incluidos.

Correcciones exigidas antes de implementar (16 de octubre de 2026):

- **C1. Crear y asignar.** Si falla la asignación opcional al crear, no puede quedar un catálogo duplicado ni un resultado ambiguo. Se acepta una solución atómica. Hay que cubrir los reintentos y los envíos repetidos (ver el punto 5).
- **C2. La URL manda** sobre lo recordado. Elegir «Todas» no puede restaurar al momento un grupo recordado. Un grupo borrado o inaccesible cae a «Todas» sin riesgo.
- **C3. Lo recordado va por dueño y país,** y si el almacenamiento del navegador no está disponible no falla nada.
- **C4. Desde el gestor,** abrir los controles de grupos conserva los demás parámetros de navegación y las protecciones de lo escrito sin guardar.

Requisitos que ya había dado (16 de octubre de 2026):

- **R1.** Los nombres de los grupos son libres y editables, sin una jerarquía geográfica fija en el código.
- **R2.** Organizar no hace asignaciones automáticas ni cambia el título, los criterios, el modo, el contenido, `version`, `updated_at` ni la huella pública de un catálogo.
- **R3.** No se duplican catálogos: un catálogo en varios grupos es el mismo registro.
- **R4.** El acceso sigue limitado a Fabricio (`home_owners`).
- **R5.** Se conservan las convenciones visuales del CRM y su navegación global.
- **R6.** La primera versión es solo de organización. No rediseña los filtros de catálogos ni cambia otras partes del CRM.

## Comportamiento

### 1 · Modelo

- **Grupos:** cada uno tiene un nombre libre (R1). Puede tener subgrupos, que no pueden tener otros (D3).
- **Asignación:** una etiqueta catálogo ↔ grupo. Un catálogo puede tener varias (D1), sin copiarse (R3).
  - Si un catálogo está asignado a la vez a «Salamanca» y a «Recoletos», son dos asignaciones independientes. Quitar una no quita la otra.
- **Privados del dueño:** solo los ve y edita el dueño de la HOME (R4). No aparecen en el lector, ni en los enlaces compartidos, ni en `/api/seleccion/*`, ni en ninguna exportación.
- **Independientes de la taxonomía de zonas:** un grupo «Salamanca» no está ligado al distrito Salamanca. Coincidir en el nombre no tiene ningún efecto.

### 2 · Vistas de la estantería

| Vista | Qué enseña (siempre con los demás filtros aplicados) |
| --- | --- |
| **Todas** | Todos los catálogos del dueño, sin mirar los grupos: la estantería de hoy (D7). |
| **Sin organizar** | Los catálogos con **cero** asignaciones (D7). |
| **Grupo** («Todo Salamanca») | Los catálogos asignados al grupo **o** a cualquiera de sus subgrupos, cada uno una sola vez (D1). |
| **Subgrupo** («Recoletos») | Solo los catálogos asignados a ese subgrupo. |

- **Orden:** el de hoy en todas las vistas, con los activos primero y después la última actualización (D4).
- **Combinación con los filtros actuales:** el grupo es un filtro más, que se combina con la búsqueda, el anuncio, la zona, la operación, el modo y el estado. Ninguno de los filtros actuales cambia de comportamiento.
- **Archivar un catálogo** no cambia sus grupos. Con el estado «Activos» no se ve en ningún grupo; con «Archivados» o «Todos», sí.
- **Recuentos:** cada grupo y subgrupo enseña cuántos catálogos tiene **con el filtro de estado actual**. Los demás filtros solo cambian el «N de M» de la estantería.
- **Vacíos:**
  - un grupo sin catálogos: «Este grupo no tiene catálogos todavía. Asígnalos desde cada tarjeta con “Grupos”.»;
  - un grupo con catálogos que no pasan los filtros: el texto de hoy, «Ningún catálogo coincide con estos filtros».

### 3 · Recordar el grupo (D5, D8, C2, C3)

- **Qué se guarda:** la selección es siempre explícita en la URL de la HOME: `?grupo=todas`, `?grupo=sin` o `?grupo=<id>`.
  - Al elegir, la URL cambia sin recargar la página y **sin tocar otros parámetros**.
  - «Atrás» del navegador y los enlaces llevan a esa selección.
- **Qué manda:**
  1. **Con `?grupo` en la URL, manda la URL**, también si dice `todas`, aunque haya otro grupo recordado.
  2. **Sin `?grupo`** (al llegar desde el menú del CRM o desde «← Mi espacio» en el gestor), se usa lo recordado en **este** navegador. Si no hay nada recordado, «Todas».
  3. **Si el grupo de la URL o el recordado no existe** (se borró, es ajeno o está mal formado), se abre «Todas», se corrige la URL y lo recordado pasa a «Todas». No sale ningún error.
- **Elegir «Todas»** guarda «Todas» como lo recordado en el mismo momento, así que nunca vuelve un grupo anterior.
- **Dónde se guarda (D8, C3):** en el almacenamiento local de cada navegador, con una clave por **dueño y país** (`bcp-home-grupo:v1:<perfil>:<país>`).
  - Otro usuario del mismo navegador, o la HOME de otro país, no hereda lo recordado.
  - Si el almacenamiento no está disponible (navegación privada, bloqueado o lleno), simplemente no se recuerda nada y la HOME abre en «Todas».
- **Primera carga:** al llegar sin `?grupo`, el servidor no conoce lo recordado, así que la estantería puede enseñar «Todas» un instante hasta que el navegador lo aplica.
- **Los demás filtros** de la estantería siguen como hoy, en el estado del componente: no se recuerdan ni van en la URL (R6).

### 4 · Gestionar los grupos («Organizar»)

- Un botón **«Organizar»** junto a «Nuevo catálogo» abre un panel lateral; en el móvil ocupa toda la pantalla. Permite:
  - **crear** un grupo o un subgrupo, con un nombre de 1 a 60 caracteres sin espacios sobrantes, que no se repita entre hermanos sin distinguir mayúsculas ni tildes (D12);
  - **renombrar**, que solo cambia el nombre: las asignaciones se mantienen y ningún catálogo cambia;
  - **ordenar** con ▲▼ dentro de su nivel (D4). Las flechas funcionan con el teclado y en táctil, donde el arrastre nativo no existe. El orden se guarda al pulsar y es el mismo en el panel y en el selector;
  - **mover un subgrupo** a otro grupo con «Mover a…» (D9): va al final del grupo de destino y conserva sus asignaciones. Un grupo que tiene subgrupos no puede pasar a ser subgrupo;
  - **borrar** (D6, ver el punto 6);
  - **ver** cuántos catálogos tiene asignados cada grupo y subgrupo, sin filtros.
- **Límite:** 100 grupos y subgrupos en total por dueño (D13).
- **Guardado:** cada cambio se guarda al pulsar y avisa con el mismo patrón de mensajes del gestor. Si falla, dice por qué y no deja nada a medias.

### 5 · Asignar catálogos

- **En cada tarjeta:** un enlace **«Grupos»** junto a «Gestionar» abre un diálogo con una casilla por grupo y subgrupo, en su orden.
  - Se pueden marcar a la vez un grupo y uno de sus subgrupos (D1).
  - Cada casilla se guarda al pulsar.
  - El diálogo dice: **«Los grupos solo ordenan tu HOME: no cambian qué propiedades entran en el catálogo.»**
- **El mismo diálogo** en el menú «⋯» de la cabecera del gestor, junto a Archivar o Reactivar (C4). Se abre encima del gestor **sin cambiar la URL** ni sus parámetros (sección, vivienda), sin cerrar el panel abierto y sin tocar lo escrito sin guardar. Cerrarlo devuelve el foco al menú.
- **Etiquetas en la tarjeta:** debajo del título, en texto pequeño: «Salamanca › Recoletos · Castellana».
- **Catálogo nuevo (D10, C1):** el formulario «Nuevo catálogo» ofrece la casilla **desmarcada** «Ponerlo también en “<grupo>”» solo si hay un grupo o subgrupo elegido en la estantería. Con «Todas» o «Sin organizar» no aparece.
  - **Es atómico:** si la casilla está marcada, crear el catálogo y asignarlo es **una sola operación** en la base de datos. Si la asignación falla (por ejemplo, porque el grupo se acaba de borrar en otra pestaña), **no se crea el catálogo**. El formulario conserva lo escrito y dice: «No se ha creado el catálogo: el grupo “<grupo>” ya no existe. Desmarca la casilla o elige otro grupo.».
  - **Así un reintento nunca duplica:** o se creó todo y se va al gestor del catálogo nuevo, o no se creó nada.
  - **Envíos repetidos:** mientras se crea, el botón queda desactivado y el formulario ignora un segundo envío (doble clic o Intro repetido). Tras crear con éxito sigue bloqueado hasta salir de la página, así que **un envío produce como mucho un catálogo**.
  - **Si se pierde la respuesta** (corte de red), el formulario no sabe si se creó. Lo dice («Comprueba la estantería antes de volver a intentarlo») y no reintenta solo. Ese caso ya existe hoy y no cambia.
- **Nada automático** (D2, R2): nada asigna un catálogo por sus criterios, su título, su modo ni su zona.

### 6 · Borrar (D6)

- **Subgrupo:** se confirma con «Se quitará la etiqueta “Recoletos” de N catálogos. Los catálogos no se borran ni cambian.».
- **Grupo con subgrupos:** la confirmación explícita nombra los subgrupos y cuántos catálogos pierden etiquetas. Al aceptar se borran el grupo, sus subgrupos y sus asignaciones **en una sola operación**.
- **Las asignaciones a otros grupos se conservan.** Un catálogo que solo estaba en el árbol borrado pasa a «Sin organizar».
- **Nunca se borra ni se modifica un catálogo.**
- **Sin papelera ni «deshacer»** en esta primera versión.

### 7 · Filtro «Zona» actual (D11)

- Su nombre visible pasa a ser **«Zona de los criterios»** («Todas las zonas de los criterios» como opción inicial).
- Su comportamiento no cambia: sigue saliendo de las zonas de los criterios guardados (R6).

## Alcance

- Migración nueva, con el número libre comprobado al implementar y al publicar: **`0207_catalog_groups.sql`**. Al publicar, `0203`–`0206` ya estaban usadas en `main`:
  - dos tablas;
  - la función atómica de crear y asignar (C1);
  - las funciones de escritura con guarda de dueño;
  - RLS, permisos y el script de reversión.
- Lectura de los grupos y las asignaciones en el servidor de la HOME.
- En la HOME y el gestor:
  - el selector de grupo con su recuento, la URL y el último grupo;
  - las etiquetas en las tarjetas;
  - el panel «Organizar»;
  - el diálogo «Grupos» en la tarjeta y en el menú «⋯» del gestor.
- Las fixtures de desarrollo de la HOME, con grupos de ejemplo.
- Las pruebas descritas en el plan.

## Fuera de alcance

- Sugerencias o asignaciones a partir de los criterios (D2: más adelante).
- Cambiar los criterios, la selección automática, la taxonomía de zonas o el comportamiento de los filtros actuales.
- Recordar o llevar a la URL los demás filtros de la estantería.
- Rediseñar la estantería, la rejilla de portadas o las tarjetas, más allá de las etiquetas y el enlace «Grupos».
- Más de dos niveles, ordenar los catálogos a mano, colores o iconos por grupo, papelera o «deshacer».
- Grupos compartidos, visibles para el cliente o para otros usuarios.
- PDF.
- Otras pantallas del CRM y su navegación global.

## Invariantes

- **Organizar no cambia el contenido:** nunca cambia `catalogs` (ni título, ni criterios, ni modo, ni estado, ni `version`, ni `updated_at`), ni `catalog_items`, ni los ajustes de C1, C2 o E3, ni la instantánea, la huella o lo que ve el cliente. Tampoco provoca ningún aviso a un lector abierto.
- **Solo el dueño:** el dueño de la HOME (`home_owners`) gestiona sus grupos, y solo con sus propios catálogos. Un grupo o catálogo ajeno o inexistente responde `forbidden`, sin revelar si existe.
- **Integridad del árbol:**
  - un subgrupo tiene el mismo dueño que su grupo, y su grupo no tiene padre (nunca más de dos niveles);
  - un grupo con subgrupos no puede pasar a ser subgrupo;
  - no hay ciclos;
  - una asignación une un catálogo y un grupo del **mismo** dueño.
- **Atomicidad:** cada escritura es una función atómica con `catalog_require_owner`, `SECURITY INVOKER`, `search_path` fijo y `EXECUTE` solo para `service_role`. Borrar un árbol es una sola transacción.
- **Nada se pierde:** borrar grupos nunca borra un catálogo, y un catálogo nunca desaparece de «Todas».
- **Sin grupos, como hoy:** sin grupos, o si la migración no está aplicada, la HOME funciona exactamente como ahora.

## Datos e impacto

- **Tablas nuevas,** sin cambios en las existentes:
  - **`catalog_groups`:** `id`, `owner_id` → `profiles`, `parent_id` → `catalog_groups` (nulo en un grupo), `name`, `position` y fechas;
  - **`catalog_group_members`:** `group_id` y `catalog_id`, con `ON DELETE CASCADE` en las dos, y clave `(group_id, catalog_id)`.
- **Funciones:** crear, renombrar, ordenar, mover y borrar grupos; poner y quitar un catálogo de un grupo; y crear un catálogo ya asignado, en una sola transacción (C1), que reutiliza `catalog_create_v2` sin copiar su lógica.
  - Ninguna escribe en `catalogs` ni sube `version`.
  - `catalog_require_owner(actor, catalogo)` bloquea la fila del catálogo `FOR UPDATE` solo para comprobar el dueño, sin modificarla.
- **Lectura:** una consulta más en la HOME y en la cabecera del gestor. Su coste es despreciable frente a las instantáneas que la HOME ya lee para las portadas.
- **Producción:** fusionar puede desplegar y aplicar la migración. No hay datos que migrar: los grupos empiezan vacíos y todo está en «Sin organizar».
- **Sin integraciones externas,** sin IA y sin escrituras en propiedades.

## Recuperación de migraciones

- **Revertir con SQL** (`rollback-<número>.sql`) es seguro: borra solo las dos tablas y sus funciones. **Se pierde toda la organización**; antes se puede copiar con `\copy`. Los catálogos, sus criterios y lo que ve el cliente no cambian.
- **Código anterior con el esquema nuevo:** funciona e ignora los grupos; la HOME vuelve a la estantería de hoy.
- **Código nuevo sin el esquema:** la HOME se pinta como hoy, sin grupos ni «Organizar», y avisa en los registros del servidor. No es un error para el usuario.
- **Transacción:** el archivo va en su propia transacción (`BEGIN`/`COMMIT`) y es idempotente, como `0192`–`0202`.

## Criterios de aceptación

| # | Criterio |
| --- | --- |
| AC1 | Fabricio crea «Salamanca» con los subgrupos «Recoletos», «Castellana», «Lista» y «Goya», y los grupos «Chamberí» y «Retiro». Los renombra y los reordena; el orden se mantiene al recargar y es el mismo en el panel y en el selector. |
| AC2 | Un catálogo asignado a «Recoletos», a «Castellana» y a «Salamanca» aparece **una vez** en «Todo Salamanca», en «Recoletos» y en «Castellana». |
| AC3 | «Todas» enseña exactamente lo que la estantería de hoy con los mismos filtros. «Sin organizar» enseña solo los catálogos sin asignaciones. Los recuentos cuadran con lo que se ve. |
| AC4 | Asignar, quitar, crear, renombrar, ordenar o borrar grupos no cambia `catalogs` (título, criterios, modo, estado, `version`, `updated_at`), `catalog_items`, la instantánea ni la huella de ningún catálogo, y un lector abierto no recibe aviso. Se comprueba con pruebas SQL y en el navegador. |
| AC5 | Borrar un grupo con subgrupos pide confirmación explícita y borra el árbol de una vez. Ningún catálogo se borra, las asignaciones a otros grupos siguen y los que se quedan sin ninguna pasan a «Sin organizar». |
| AC6 | El grupo elegido va en la URL, que manda sobre lo recordado; elegir «Todas» no restaura otro grupo. Se recuerda por navegador, dueño y país al volver a la HOME. Un grupo borrado o ajeno cae a «Todas» sin error, y sin almacenamiento no falla nada. |
| AC7 | El grupo se combina con todos los filtros actuales sin cambiarlos. Un catálogo archivado conserva sus grupos y sigue el filtro de estado. |
| AC8 | Solo el dueño ve y edita sus grupos. Grupos y catálogos ajenos dan `forbidden`. No se pueden crear tres niveles, ni ciclos, ni asignaciones entre dueños distintos. Nada de esto sale en el lector, en `/api/seleccion/*` ni en los enlaces. |
| AC9 | A 1440, 362 y 320, con 30 grupos o más, no hay desplazamiento horizontal de la página. El selector y el panel se usan con el teclado y en táctil. |
| AC10 | Sin grupos, la HOME es como hoy: la regresión `prB.mjs` pasa (solo cambia el texto «Zona de los criterios») y la navegación del CRM y las secciones del gestor no cambian. |
| AC11 | Crear con la casilla marcada asigna el catálogo en la misma operación. Si la asignación falla, no se crea ningún catálogo y lo escrito se conserva. Un doble envío crea un catálogo como mucho. La casilla aparece desmarcada. |
| AC12 | Desde el gestor, abrir y usar «Grupos» no cambia la URL ni sus parámetros, no cierra el panel abierto y no pierde lo escrito sin guardar; la protección al salir sigue igual. |
| AC13 | Mover un subgrupo a otro grupo conserva sus asignaciones; no se puede mover un grupo con subgrupos debajo de otro. |

## Riesgos

- **Confundir grupos y criterios:** que alguien crea que poner un catálogo en «Recoletos» cambia sus viviendas. Lo mitigan la frase del diálogo, «Zona de los criterios» (D11) y AC4.
- **Dos ideas de «zona»:** el filtro sale de los criterios y los grupos son propios. Valorar si el filtro «Zona» sigue haciendo falta queda para después.
- **Borrar un árbol con muchos catálogos dentro:** se pierde organización sin «deshacer». Lo mitigan la confirmación explícita con los recuentos y que los catálogos no se tocan.
- **El móvil con muchos grupos.** Lo vigila AC9; el plan propone cómo resolverlo.
- **Que una escritura de grupos suba `version`** por reutilizar una función existente, lo que avisaría a los lectores sin motivo. Lo vigila AC4.
- **Número de migración:** se comprueba justo antes de implementar y antes de publicar.

## Decisiones pendientes

Ninguna. D8–D13 cierran las cuatro de la revisión anterior y fijan los límites.

## Aprobación

- **16 de octubre de 2026:** Fabricio aprueba las decisiones de producto D1–D7.
- **16 de octubre de 2026:** Fabricio aprueba esta especificación, la maqueta y el plan T0–T8, con las decisiones D8–D13 y las correcciones C1–C4, y autoriza ejecutar las tareas en orden, **parando antes del merge**.
  - **Autoriza:** `npm ci` con el lockfile existente y sin dependencias nuevas; Postgres temporal y sintético, con la migración, la concurrencia y la reversión solo ahí; un entorno aislado sin `.env*` ni credenciales heredadas; el Chromium ya disponible; las verificaciones SQL, TypeScript, de navegador, de regresión y de compilación; commits, push, PR y CI.
  - **No autoriza:** acceso a producción, escrituras en registros reales, IA real ni revisión adicional de Codex. El PDF sigue fuera.
