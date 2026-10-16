# HOME · grupos editables de catálogos: plan

Especificación: [`spec.md`](spec.md). Las decisiones D1–D7 están aprobadas (16 de octubre de 2026); la especificación en conjunto **todavía no**.

- **Rama:** `fabri/bcp-01-home-grupos` (worktree `wt/bcp-01-home-grupos`, solo local).
- **Estado:** **borrador para revisión**. **No autoriza implementar**, instalar, migrar, arrancar servicios, hacer push ni abrir un PR.
- **Maqueta:** [`maquetas/home-grupos.html`](maquetas/home-grupos.html), con las capturas `maqueta-1…4.png` (ver §Propuesta visual).

## Base

- **Comprobada:** `origin/main` = `b1f2b49` (merge de #321, E3) con `git fetch` el 16 de octubre de 2026. La rama sale de ese commit.
  - Por ahora solo lleva documentación: el registro de la QA de E3 (`6d84376`) y esta especificación y este plan.
- **Numeración:**
  - la última migración en `main` es `0202_catalog_photo_prefs.sql`, así que **la siguiente libre hoy es `0203`**;
  - ningún PR abierto añadía `0202` en la comprobación de E3; **`0203` se comprobará en T0** sobre los PR abiertos.
- **Si `main` avanza** antes de implementar o de publicar:
  - `git fetch`, rebase de la rama sobre el `origin/main` nuevo y vuelta a comprobar la numeración;
  - si `0203` ya está usada, se renumera al siguiente número libre, también en el rollback, las pruebas y la documentación;
  - **nunca** se reutiliza un número publicado.

## Pasos de entorno que autoriza el plan (cuando se apruebe)

Los mismos que en E3, sin dependencias nuevas:

1. `git fetch origin` y comprobar `origin/main`. Rebase de `fabri/bcp-01-home-grupos` si hace falta.
2. `npm ci` en el worktree, con el `package-lock.json` existente, sin añadir paquetes.
3. **Postgres 16 temporal y sintético:**
   - el que ya está instalado (Homebrew), en el scratchpad (`pg-bcp01`, `127.0.0.1:54329`, base `bcp_test`), con `scripts/sql/run-local.sh`;
   - las migraciones y el rollback se ejecutan **solo ahí**.
4. **Copia aislada de la app** para el servidor de desarrollo y `next build`:
   - con `iso.sh sync | verify | run`: `env -i`, variables en lista blanca, sin `.env*`, y comprobación de que `@next/env` carga 0 archivos;
   - el servidor de desarrollo, solo en `127.0.0.1:3137` con `CATALOG_FIXTURES=1`.
5. **Chromium ya en caché** (Playwright 1208), con la red bloqueada (`--proxy-server=http://127.0.0.1:9`). Si hiciera falta descargar otro, se pregunta antes.

**No se autoriza** acceso a producción, credenciales, registros reales, IA real ni revisión de Codex.

## Diseño técnico (propuesta)

### Datos (`0203_catalog_groups.sql`, `BEGIN`/`COMMIT`, idempotente)

```
catalog_groups
  id          uuid PK default gen_random_uuid()
  owner_id    uuid NOT NULL → profiles(id) ON DELETE CASCADE
  parent_id   uuid NULL     → catalog_groups(id) ON DELETE CASCADE
  name        text NOT NULL  CHECK (char_length(btrim(name)) BETWEEN 1 AND 60 AND name = btrim(name))
  position    integer NOT NULL
  created_at, updated_at timestamptz
  UNIQUE INDEX (owner_id, coalesce(parent_id, '00000000-…'), catalog_fold(name))   -- nombre único entre hermanos
  INDEX (owner_id, parent_id, position)

catalog_group_members
  group_id    uuid → catalog_groups(id) ON DELETE CASCADE
  catalog_id  uuid → catalogs(id)       ON DELETE CASCADE
  created_at  timestamptz
  PRIMARY KEY (group_id, catalog_id)
  INDEX (catalog_id)
```

- **RLS sin políticas**, `REVOKE ALL` a `public`, `anon` y `authenticated`, y solo `service_role`, como `0192`–`0202`.
- **`catalog_fold`** (de `0195`) es `IMMUTABLE`, así que vale para el índice único. Si algún día se redefine, hay que reindexar; queda anotado en la migración.
- **Integridad del árbol, por dos vías:**
  1. **Las funciones** validan antes de escribir y devuelven errores con nombre.
  2. **Un disparador `BEFORE INSERT OR UPDATE`** en `catalog_groups` comprueba igualmente que, si hay `parent_id`:
     - el padre existe, es del mismo `owner_id` y no tiene padre (dos niveles, sin ciclos);
     - la fila no tiene hijos si se le pone padre.

     Y uno en `catalog_group_members` comprueba que `catalogs.owner_id` es igual a `catalog_groups.owner_id`. Así nada que escriba con `service_role` sin pasar por las funciones puede romper el árbol.

### Funciones (todas `SECURITY INVOKER`, `search_path = public`, `EXECUTE` solo para `service_role`)

| Función | Qué hace | Errores |
| --- | --- | --- |
| `catalog_group_create(actor, parent, name)` | Crea al final de su nivel (`max(position)+1`). | `forbidden`, `invalid_name`, `duplicate_name`, `too_deep`, `too_many_groups` |
| `catalog_group_rename(actor, group, name)` | Solo cambia `name` y `updated_at` **del grupo**. | `forbidden`, `invalid_name`, `duplicate_name` |
| `catalog_group_reorder(actor, parent, ids[])` | Reescribe las posiciones de **todos** los hermanos con la lista completa, como `reorder_client_portal_links`. | `forbidden`, `invalid_order` (la lista no es exactamente el conjunto de hermanos) |
| `catalog_group_move(actor, group, new_parent)` | **Solo si se aprueba la pendiente 2:** mueve un subgrupo a otro grupo, al final; sus asignaciones se mantienen. | `forbidden`, `too_deep`, `duplicate_name` |
| `catalog_group_delete(actor, group)` | Borra el grupo y sus subgrupos (y sus asignaciones, en cascada) **en una transacción**. Devuelve `{groups, assignments, unorganized}`. | `forbidden` |
| `catalog_group_preview_delete(actor, group)` | Solo lee: los mismos recuentos, para la confirmación. | `forbidden` |
| `catalog_group_set_member(actor, group, catalog, member bool)` | Pone o quita **una** asignación. Es idempotente: repetir no falla. | `forbidden` |

- **Propiedad:**
  - cada función llama primero a `catalog_require_owner(actor, NULL)` (está en `home_owners`) y comprueba que el grupo es del actor;
  - `set_member` comprueba además el catálogo con `catalog_require_owner(actor, catalog)`, que solo lo bloquea para leerlo y **no lo modifica**;
  - lo ajeno o inexistente da `forbidden` en todos los casos.
- **Serialización:** las escrituras de grupos de un mismo dueño se serializan con `SELECT … FROM home_owners WHERE profile_id = actor FOR UPDATE`. Así dos pestañas que crean, ordenan o borran a la vez no dejan posiciones duplicadas, ni asignaciones a un grupo que se está borrando, ni más de 100 grupos.
- **Nunca** escriben en `catalogs`, `catalog_items` ni en las tablas de C1, C2 o E3, y no suben `version`.
- **Borrar un árbol:**
  - `DELETE FROM catalog_groups WHERE id = g` (los hijos y las asignaciones caen por `ON DELETE CASCADE`), con el bloqueo del dueño ya tomado;
  - las asignaciones del catálogo a **otros** grupos no se tocan porque son otras filas;
  - después de borrar se normalizan las posiciones de los hermanos que quedan.

### Servidor (Next)

- **`lib/catalogs/groups.ts` (puro, sin `server-only`):**
  - tipos;
  - `validateGroupName` (el mismo criterio que SQL);
  - `shelfSelection(groups, members, catalogs, selection)`, que devuelve los ids visibles sin repetir, `sinOrganizar` y los recuentos por grupo con el filtro de estado;
  - `resolveGroup(urlParam, remembered, groups)`, que cae a «Todas» si el grupo no existe;
  - `cardTags(groups, memberIds)`.
- **`lib/catalogs/queries.ts`:** `listOwnerGroups(ownerId)` devuelve `{available, groups, members}`.
  - Si las tablas no existen (error `42P01` o `PGRST205`), devuelve `{available: false}`, avisa una vez en el registro y la HOME se pinta como hoy.
  - Una sola lectura de cada tabla, filtrada por `owner_id`.
- **`app/[country]/(admin)/admin/mi-espacio/actions.ts`:**
  - acciones `createGroupAction`, `renameGroupAction`, `reorderGroupsAction`, `moveGroupAction` (si se aprueba), `previewDeleteGroupAction`, `deleteGroupAction` y `setCatalogGroupAction`;
  - cada una comprueba `isHomeOwner`, valida los ids (`isUuid`) y el nombre, llama al RPC y traduce los errores con `lib/catalogs/errors.ts`;
  - **no** llaman a `saved()` ni a `notifyCatalogChanged()`, y no revalidan la ruta del catálogo; solo `revalidatePath(HOME_PATH)`. Es la garantía de no avisar a los lectores (AC4).
- **Página de la HOME:** carga `listOwnerGroups` junto a `listOwnerCatalogs` y lee `?grupo` de `searchParams`.

### Interfaz

- **`catalog-shelf.tsx`:**
  - **el selector de grupo:**
    - en escritorio, una fila de botones con `aria-pressed` y la segunda fila de subgrupos;
    - en escritorio, cuando hay más de 12 grupos raíz, «Más grupos ▾» abre la misma lista que el móvil;
    - en el móvil (por debajo de `sm`), un botón «Grupo: … ▾» que abre una hoja con la lista completa;
  - **el filtro por grupo** se aplica **antes** de los filtros actuales, que siguen igual;
  - **las etiquetas y el enlace «Grupos»** en cada tarjeta.
- **URL y último grupo:**
  - al elegir, `router.replace(?grupo=<id>)` sin recargar ni desplazar;
  - «Todas» quita el parámetro y «Sin organizar» usa `?grupo=sin`;
  - **el último grupo** se guarda según la pendiente 1. Con a) es `localStorage` (`bcp-home-grupo`, con `try/catch`; si no hay almacenamiento, sin recuerdo);
  - al entrar sin `?grupo` se usa el recordado. Si no existe en `groups`, «Todas», se borra el recordado y no sale ningún error.
- **`groups-panel.tsx` («Organizar»):**
  - reutiliza `SidePanel`/`SidePanelFooter` del gestor (`components/admin/catalogs/manager/side-panel.tsx`, genérico) y en el móvil ocupa toda la pantalla;
  - el árbol con ▲▼ y el menú «⋯» (Renombrar, Añadir subgrupo, Mover a…, Borrar);
  - crear inline;
  - la confirmación de borrado con los recuentos de `previewDelete`;
  - los mensajes en el pie.
- **`catalog-groups-dialog.tsx` («Grupos» de un catálogo):**
  - casillas en árbol, y cada una guarda al pulsar;
  - **la casilla vuelve atrás si falla, y no se pueden pulsar dos a la vez** (la casilla queda en «guardando»);
  - la frase sobre los criterios;
  - se usa desde la tarjeta y desde el menú «⋯» de `manager-header.tsx`.
- **Pendientes 3 y 4:** la opción en `new-catalog-form.tsx` y el texto «Zona de los criterios» solo si se aprueban.

### Archivado y filtros

- **Archivar o reactivar no toca las asignaciones** (son otra tabla) y el filtro de estado sigue mandando.
- **Los recuentos del selector** se calculan con el filtro de estado. Los demás filtros solo cambian el «N de M».
- **La zona** sigue saliendo de los criterios guardados (`criteria.zones`), con el mismo comportamiento.

### Fixtures (solo desarrollo)

- **`lib/catalogs/fixtures.ts` y `fixture-store.ts`:** grupos sintéticos (Salamanca con 4 subgrupos, Chamberí, Retiro y otros 30 para la prueba de muchos grupos), asignaciones en memoria y las mismas reglas que SQL.
  - Las operaciones de grupos **no** suben la versión de ningún catálogo de fixtures ni avisan al vigilante del lector.
  - Una variante con `?grupos=muchos` carga los 30 extra.
- **La HOME de fixtures** pasa los grupos y las acciones de fixtures, como hace hoy el gestor de fixtures.

## Tareas

Cada tarea es pequeña, con su verificación y su commit. El orden respeta las dependencias.

### T0. Base, numeración y registro

- **Entradas:** esta especificación y este plan aprobados.
- **Acción:**
  - anotar la aprobación;
  - `git fetch` y rebase si `main` avanzó;
  - comprobar en `main` y en los PR abiertos que `0203` está libre;
  - preparar el entorno (pasos 1–5).
- **Verificación:** `git ls-tree origin/main supabase/migrations/` y `gh pr diff --name-only` de los PR abiertos sin `0203`; `npm ci` sin cambios en el lockfile.
- **Cubre:** —
- **Commit:** «HOME grupos T0: aprobación y base».

### T1. Migración, rollback y pruebas SQL

- **Entradas:** T0.
- **Acción:**
  - `supabase/migrations/0203_catalog_groups.sql` y `docs/changes/2026-10-16-bcp-01-home-grupos/rollback-0203.sql`;
  - `scripts/sql/test-catalog-groups-pre.sql` y `test-catalog-groups.sql`, con un escenario nuevo en `test-catalogs-core.sh`.
- **Verificación** en el Postgres temporal: todo `test-catalogs-core.sh` en verde, más estos casos:
  - **permisos:** sin `EXECUTE` para `anon` y `authenticated`; las funciones son INVOKER; un actor que no está en `home_owners` da `forbidden`; grupos y catálogos de otro dueño también; y `set_member` con un catálogo ajeno, igual;
  - **árbol:** un tercer nivel da `too_deep`; poner padre a un grupo con hijos, también; el disparador rechaza un `INSERT` directo que rompa el árbol o mezcle dueños; nombre repetido entre hermanos (sin distinguir mayúsculas ni tildes) da `duplicate_name`, pero se permite en otro nivel; límite de 100 grupos;
  - **orden:** `reorder` con una lista incompleta o con ajenos da `invalid_order`; las posiciones quedan 0…n−1;
  - **borrado:** borrar un grupo con 2 subgrupos y 5 asignaciones (de ellas, un catálogo también asignado a «Chamberí») borra 3 grupos y sus asignaciones, conserva la de «Chamberí», no borra catálogos y los recuentos de `preview_delete` coinciden;
  - **invariante AC4:** antes y después de **cada** operación son iguales `to_jsonb(catalogs.*)` de todos los catálogos, `catalog_items`, `md5(catalog_internal_snapshot(id)::text)` y `catalog_public_fingerprint`;
  - **concurrencia** con dos sesiones `psql` independientes:
    - A borra «Salamanca» con un `pg_sleep` dentro de la transacción mientras B asigna un catálogo a «Recoletos». B espera al bloqueo del dueño y luego da `forbidden`, y no queda ninguna asignación huérfana;
    - dos `create` simultáneos con el mismo nombre: uno da `duplicate_name`;
    - contraprueba sin el bloqueo, solo en la base temporal;
  - **reversión:** `rollback-0203.sql`, comprobar que los catálogos siguen intactos y volver a aplicar la migración (idempotente).
- **Cubre:** AC1, AC2, AC4, AC5, AC8.
- **Commit:** «HOME grupos T1: 0203, rollback y pruebas SQL».

### T2. Lógica pura y pruebas TS

- **Entradas:** T1 (para alinear la validación del nombre).
- **Acción:** `lib/catalogs/groups.ts` y una sección nueva en `scripts/test-catalogs-manager.mts`, que ya corre la CI.
- **Verificación:** `tsc` limpio y `test:catalogs-manager` en verde, con estos casos:
  - un grupo más su subgrupo sin repetir catálogos;
  - «Todas» igual a la lista de hoy;
  - «Sin organizar» después de borrar un árbol;
  - los recuentos con el filtro de estado y con archivados;
  - la combinación con zona, modo, operación, anuncio y búsqueda;
  - `resolveGroup` con un id borrado, ajeno o mal formado → «Todas»;
  - `validateGroupName` igual que SQL, con un corpus compartido.
- **Cubre:** AC2, AC3, AC6, AC7.
- **Commit:** «HOME grupos T2: regla pura de la estantería».

### T3. Servidor: lectura y acciones

- **Entradas:** T1 y T2.
- **Acción:** `listOwnerGroups`, las acciones, los mensajes de `errors.ts` y la página de la HOME con `searchParams`.
- **Verificación:**
  - `tsc` limpio;
  - una prueba con un cliente simulado de que las acciones de grupos **no** llaman a `notifyCatalogChanged` ni a `saved`;
  - la HOME sin las tablas (error simulado) devuelve `available: false` y se pinta como hoy.
- **Cubre:** AC4, AC8, AC10.
- **Commit:** «HOME grupos T3: lectura y acciones del servidor».

### T4. Fixtures de desarrollo

- **Entradas:** T2.
- **Acción:** los grupos sintéticos, las operaciones en memoria y la HOME de fixtures con grupos; también `?grupos=muchos`.
- **Verificación:** `CATALOG_FIXTURES=1` en la copia aislada; la HOME de fixtures abre en «Todas» igual que hoy y `prB.mjs` pasa.
- **Cubre:** AC10.
- **Commit:** «HOME grupos T4: fixtures».

### T5. Selector, URL y etiquetas en la estantería

- **Entradas:** T3 y T4.
- **Acción:** el selector de escritorio y móvil, `?grupo`, el último grupo (según la pendiente 1), la caída a «Todas», las etiquetas y el enlace «Grupos».
- **Verificación:** prueba de navegador nueva `grupos.mjs` (en el scratchpad, como las anteriores) a 1440, 362 y 320:
  - vistas y recuentos;
  - combinación con los filtros;
  - un catálogo archivado;
  - URL y recuerdo al volver del gestor;
  - un grupo borrado → «Todas»;
  - 30 grupos sin desplazamiento horizontal de la página;
  - teclado: tabulación y Enter.
- **Cubre:** AC2, AC3, AC6, AC7, AC9.
- **Commit:** «HOME grupos T5: selector de grupos en la estantería».

### T6. Panel «Organizar» y diálogo «Grupos»

- **Entradas:** T5.
- **Acción:**
  - el panel: crear, renombrar, ▲▼, mover (si se aprueba), borrar con confirmación y los mensajes;
  - el diálogo en la tarjeta y en el menú «⋯» del gestor;
  - la opción en «Nuevo catálogo» y el texto del filtro de zona, solo si se aprueban las pendientes 3 y 4.
- **Verificación:** `grupos.mjs` amplía con:
  - AC1 (crear el ejemplo de Salamanca, renombrar y ordenar, y recargar);
  - AC2 (asignar a un grupo y a su subgrupo);
  - AC5 (borrar un árbol);
  - errores (nombre repetido o vacío);
  - táctil (▲▼ sin arrastre) y la casilla que vuelve atrás si falla;
  - **AC4 en el navegador:** un lector abierto en otra pestaña con el vigilante de cambios no recibe ningún evento ni aviso y su `data-huella` no cambia mientras se organiza. Las fixtures registran las veces que se avisa, y debe ser 0.
- **Cubre:** AC1, AC2, AC4, AC5, AC8, AC9.
- **Commit:** «HOME grupos T6: organizar y asignar».

### T7. Regresiones, capturas y compilación

- **Entradas:** T6.
- **Acción:**
  - la matriz completa de E2 y las regresiones, en secuencia y sin nada en paralelo; `prB.mjs` y `homes` sin cambios de expectativas, salvo el texto de la zona si se aprueba la pendiente 4;
  - capturas en `capturas/`;
  - `next build` aislado.
- **Verificación:** todo en verde y los fallos de tiempos repetidos y explicados; la compilación sin `.env*` cargados.
- **Cubre:** AC9, AC10.
- **Commit:** «HOME grupos T7: regresiones y capturas».

### T8. Resultado, PR y CI

- **Entradas:** T7.
- **Acción:**
  - `result.md`, con las salidas reales;
  - volver a comprobar la base y la numeración;
  - push de la rama, PR en español y CI;
  - **parar antes del merge.**
- **Verificación:** la CI del PR en verde.
- **Cubre:** —
- **Commit:** «HOME grupos T8: resultado».

## Verificación final

- **SQL:** `test-catalogs-core.sh` entero, con los escenarios nuevos, la concurrencia, la contraprueba y la reversión.
- **TS y CI:** `tsc`, `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager`.
- **Navegador:** `grupos.mjs` a 1440, 362 y 320, más la matriz completa y las regresiones.
- **Compilación:** `next build` aislado.
- **CI** del PR en verde.
- **QA de Fabricio en producción** después del despliegue: crear su árbol, asignar, borrar un grupo de prueba y comprobar en el móvil.

## Recuperación

- **Fusionar puede desplegar y aplicar `0203`.**
- **Revertir el código** (`git revert` del merge): la HOME vuelve a la de hoy y las tablas se quedan sin usar.
- **Revertir el esquema** (`rollback-0203.sql`, a mano): se pierde la organización; antes se copia con `\copy`. No toca los catálogos.
- **Código nuevo sin el esquema:** la HOME como hoy (`available: false`).

## Propuesta visual

En [`maquetas/home-grupos.html`](maquetas/home-grupos.html) (estática, con datos sintéticos, la paleta y Lato del admin):

1. **`maqueta-1.png`**, escritorio 1440: la fila de grupos con recuento, la segunda fila de subgrupos de Salamanca, los filtros de siempre y las tarjetas con etiquetas y «Grupos».
2. **`maqueta-2.png`**, panel «Organizar»: el árbol con ▲▼ y «⋯», crear inline, la nota sobre los criterios y el mensaje del pie.
3. **`maqueta-3.png`**, diálogo «Grupos» (un grupo y dos subgrupos marcados) y la confirmación al borrar un grupo con subgrupos.
4. **`maqueta-4.png`**, móvil 362: el botón «Grupo: Salamanca › Recoletos ▾», los filtros de siempre y la hoja con la lista completa.

Se ha comprobado que ningún marco desborda en horizontal.

## Riesgos y suposiciones

- **Suposición:** `catalog_require_owner(actor, catalogo)` no modifica el catálogo; solo lo bloquea. Comprobado en `0192`. Si una versión posterior lo cambiara, T1 lo detectaría con el invariante AC4.
- **Suposición:** la cabecera del gestor puede recibir los grupos sin una consulta pesada; es una lectura pequeña por dueño.
- **Riesgo:** el bloqueo por dueño serializa también las asignaciones desde pestañas distintas. Es aceptable con un solo usuario y operaciones cortas.
- **Riesgo:** que `localStorage` no esté disponible (navegación privada), con la pendiente 1 a). Sin recuerdo, abre «Todas»; no es un error.
- **Riesgo:** fallos de tiempos en la matriz, como en E3. Se repiten aislados y se explican.
- **No comprobado:** el número real de catálogos de Fabricio. El diseño aguanta con 100 grupos y es independiente del número de catálogos.

## Decisiones pendientes que afectan al plan

Son las de la especificación; el plan se ajusta a lo que se decida:

1. **El último grupo en el navegador (propuesta) o en la cuenta.** Con la cuenta, T1 añade una columna o tabla de preferencias y T3 su lectura y escritura.
2. **«Mover a…» un subgrupo.** Si es que no, sale `catalog_group_move` de T1 y T6.
3. **Asignar al crear un catálogo.** Si es que no, sale de T6.
4. **Texto «Zona de los criterios».** Si es que no, sale de T6 y las expectativas de `prB` no cambian.

## Aprobación

Pendiente. Este plan no autoriza la ejecución.
