# HOME · grupos editables de catálogos: resultado

**Documentos:**
- especificación: [`spec.md`](spec.md), aprobada el 16 de octubre de 2026 con D1–D13 y las correcciones C1–C4;
- plan: [`plan.md`](plan.md), T0–T8 aprobado el mismo día;
- maqueta: [`maquetas/home-grupos.html`](maquetas/home-grupos.html).

## Base y commits

- **Base:**
  - la exploración se hizo sobre `b1f2b49` (merge de #321);
  - antes de implementar, `main` había avanzado a `d7199e4` («fix(clientes): mensajes coherentes del encargo y de las sugerencias», sin relación con catálogos), y la rama se rebasó sobre ese commit;
  - antes de publicar, otra vez sobre `afa6b94`, cuyos commits (particulares y clientes) no tocan catálogos ni la HOME.
- **Numeración:**
  - al implementar, la última migración de `main` era `0202` y ningún PR abierto usaba `0203`, así que la migración se escribió como `0203`;
  - **antes de publicar,** `main` había avanzado a `afa6b94` con `0203_particulares_agency_webs.sql` a `0206_properties_photos_source.sql`;
  - se volvió a rebasar la rama y la migración pasó a **`0207_catalog_groups.sql`**, con `rollback-0207.sql`, las pruebas y la documentación;
  - `0207` está libre en `main` y en los PR abiertos, comprobado con `gh pr diff --name-only`.
- **Rama:** `fabri/bcp-01-home-grupos`, en el worktree `wt/bcp-01-home-grupos`.

| Commit | Tarea |
| --- | --- |
| `1de0bb0` | BCP-01 E3: merge de #321 (b1f2b49) y QA de Fabricio en producción superada |
| `eb3e2ee` | HOME · grupos de catálogos: especificación en borrador (sin implementar) |
| `cf9250b` | HOME · grupos: decisiones D1–D7, especificación consolidada, plan y maqueta en borrador |
| `de9da65` | HOME grupos T0: aprobación (D8–D13, C1–C4) en la especificación y el plan |
| `82fe344` | HOME grupos T1: 0203 (el número de entonces; ver T7) (grupos, asignaciones, crear y asignar atómico), rollback y pruebas SQL |
| `3978f3b` | HOME grupos T2: regla pura de la estantería (vistas, recuentos, URL y recuerdo, escrituras) y pruebas |
| `7c9b484` | HOME grupos T3: lectura de grupos, acciones de grupos sin aviso a los lectores y crear en un grupo (atómico) |
| `96ea118` | HOME grupos T4–T6: fixtures, selector de grupos, «Organizar», «Grupos» (HOME y gestor) y crear en un grupo |
| `340dab3` | HOME grupos T7: migración renumerada a 0207 tras rebasar sobre main, regresiones y capturas |
| (este commit) | HOME grupos T8: resultado |

El commit `1de0bb0` solo registra el merge de #321 y la QA de E3 en el expediente de BCP-01.

## Qué hace

**Datos (`0207_catalog_groups.sql`, en una transacción e idempotente):**
- **Tablas:**
  - `catalog_groups`: dueño, padre, nombre y posición;
  - `catalog_group_members`: catálogo ↔ grupo, con `ON DELETE CASCADE` en las dos claves.
- **Permisos:** RLS y solo `service_role`, como en `0192`–`0202`.
- **Funciones** `catalog_group_create`, `rename`, `reorder`, `move`, `preview_delete`, `delete` y `set_member`, todas `SECURITY INVOKER` con guarda de dueño:
  - las escrituras de un mismo dueño se serializan con el bloqueo de su fila de `home_owners`;
  - **dos niveles**, sin ciclos y sin mezclar dueños. Lo comprueban las funciones y, además, disparadores que también paran las escrituras directas;
  - **nombres** de 1 a 60 caracteres, únicos entre hermanos sin distinguir mayúsculas ni tildes, con un índice único sobre `catalog_fold`;
  - **100 grupos** como mucho, subgrupos incluidos;
  - **borrar un grupo** borra en una sola operación sus subgrupos y SUS asignaciones, nunca catálogos;
  - **mover** un subgrupo a otro grupo conserva sus asignaciones.
- **`catalog_create_in_group` (C1):** crea el catálogo (`catalog_create_v2`) y lo asigna en la misma transacción; si la asignación falla, no queda catálogo.
- **Nada de esto toca `catalogs`** (tampoco `version` ni `updated_at`), ni `catalog_items`, ni las tablas de C1, C2 o E3, ni la instantánea o la huella pública.

**HOME:**
- **Selector de grupo encima de la estantería:**
  - en escritorio, una fila con «Todas · Sin organizar · grupos» y, si el grupo tiene subgrupos, una segunda fila; con más de 12 grupos, «Más grupos»;
  - en el móvil, «Grupo: … ▾» con la lista completa;
  - los recuentos siguen el filtro de estado.
- **Vistas:** «Todas» es la estantería de siempre; «Sin organizar», los catálogos sin asignaciones; un grupo enseña sus catálogos y los de sus subgrupos, cada uno una vez.
- **Filtros:** el grupo se suma a los de siempre, que no cambian. El de zona se llama ahora «Zona de los criterios» (D11).
- **URL y recuerdo:**
  - la URL siempre lleva `?grupo=todas|sin|<id>`, se cambia con `history.replaceState` y conserva los demás parámetros;
  - la URL manda; sin ella, lo recordado en ese navegador por dueño y país; si no, «Todas»;
  - un grupo que ya no existe cae a «Todas» y se corrigen la URL y lo recordado;
  - sin almacenamiento del navegador, no se recuerda nada y no falla nada.
- **«Organizar»:** crear, renombrar, ▲▼, «Mover a…» y borrar con una confirmación que nombra los subgrupos y dice cuántos catálogos pierden etiquetas y cuántos quedan sin organizar.
- **«Grupos» en cada tarjeta,** con casillas que se guardan al pulsar y vuelven atrás si fallan. Las etiquetas de la tarjeta dicen, por ejemplo, «Salamanca › Recoletos, Castellana».
- **«Nuevo catálogo»:** con un grupo elegido aparece la casilla desmarcada «Ponerlo también en “…”». Es atómica: un envío repetido se ignora y, si falla, se conserva lo escrito.

**Gestor:** «Grupos…» en el menú «⋯» abre el mismo diálogo. No cambia la URL, no cierra el panel abierto ni toca lo escrito sin guardar, y al cerrar devuelve el foco al «⋯» (C4).

**Organizar no avisa a los lectores:**
- las acciones van en `group-actions.ts`, que no importa el vigilante (`sync-hub-instance`) ni guardados de catálogo, ni revalida rutas, y devuelve el estado nuevo de los grupos;
- en las fixtures, la ruta propia `/dev-fixtures/api/grupos` tampoco avisa.

**Sin la migración** (código nuevo con el esquema anterior), la lectura falla, se avisa una vez en el registro y la HOME se pinta como antes, sin grupos.

### Cambios respecto al plan, y por qué

- **Asignar sin bloquear el catálogo.** `catalog_group_set_member` comprueba que el catálogo es del dueño con una lectura, en vez de `catalog_require_owner(actor, catálogo)`, que lo bloquea `FOR UPDATE`. Organizar ni siquiera bloquea la fila del catálogo; la clave foránea sigue impidiendo asignar uno inexistente.
- **Sin `revalidatePath`.** Las acciones de grupos devuelven el estado y no revalidan rutas. Revalidar la HOME haría que Next volviera a leer las instantáneas de todos los catálogos en cada clic; la página ya es `force-dynamic`.
- **Diálogos propios.** «Organizar» y «Grupos» son diálogos (`groups-modal.tsx`) con el mismo aspecto que el `Modal` del CRM, más `role="dialog"`, `aria-modal`, foco atrapado y de vuelta, y una pila para los diálogos anidados.
  - No reutilizan `SidePanel`, que es la mitad de un diseño lista + panel.
  - No reutilizan el `Modal` del CRM, que no tiene esas propiedades de accesibilidad.
- **Esc y Tab en captura.** Con un diálogo abierto, el diálogo atiende Esc y Tab antes que nadie: sin eso, el Esc del panel de la vivienda del gestor cerraba también el panel (lo destapó la prueba de C4). Además, la casilla que se está guardando no se desactiva, para que el foco no salga del diálogo.
- **La HOME de fixtures crea catálogos** en el almacén sintético; antes decía «Vista de prueba». Hacía falta para probar C1. `?sinGrupos=1` conserva la HOME de antes para la regresión.

## Verificaciones (locales, datos sintéticos, entorno aislado)

**Entorno:**
- `npm ci` con el lockfile existente, sin cambios en él;
- Postgres 16 temporal (`pg-bcp01`), donde se ejecutaron todas las migraciones y la reversión;
- copia aislada con `iso.sh verify`: sin `.env*`, variables en lista blanca y `@next/env` con 0 archivos cargados;
- Chromium en caché con la red bloqueada.

**SQL:** `test-catalogs-core.sh` entero en verde, con **930** comprobaciones y 0 `ERROR`. Los escenarios nuevos:
- **«2n»** (`0207` sobre catálogos previos, aplicada dos veces, 105 comprobaciones escritas a mano):
  - permisos e INVOKER;
  - fuera de `home_owners`, `forbidden`;
  - el árbol del ejemplo y su orden;
  - nombres: repetidos sin mayúsculas ni tildes, otro nivel, 60/61 caracteres, control y espacios;
  - tres niveles, propio padre y mezcla de dueños, también con `INSERT`/`UPDATE` directos;
  - grupos y catálogos de otro dueño;
  - asignaciones múltiples (padre e hijo) e idempotentes;
  - orden con listas inválidas;
  - mover (conserva las asignaciones; `invalid_move`, `too_deep`, `duplicate_name`);
  - vista previa y borrado de un árbol: recuentos, catálogos intactos, asignaciones a otros grupos conservadas y renumeración;
  - el límite de 100;
  - crear y asignar: si la asignación falla, 0 catálogos; un reintento sin grupo, 1.
- **Después de cada operación,** la huella de comprobación sigue idéntica. Cubre `to_jsonb` de todos los catálogos, `catalog_items`, enlaces, ajustes, textos, ajustes de fotos, el md5 de cada instantánea, `catalog_public_fingerprint` y la huella de `get_public_catalog`.
  - **Control:** editar un título o añadir una propiedad SÍ la cambia.
- **Concurrencia con dos sesiones independientes:**
  - borrar un grupo mientras otra sesión le asigna un catálogo: la segunda esperó **1,50 s** (1,46 s en la primera pasada) al bloqueo del dueño, dio `forbidden` y no quedó ninguna asignación huérfana;
  - el límite de 100 con dos creaciones simultáneas: la segunda esperó **1,48 s** (1,52 s en la primera) y dio `too_many_groups`, así que se queda en 100;
  - **contraprueba sin el bloqueo,** solo en la base temporal: las dos crean y quedan **101**. El bloqueo es necesario.
- **Reversión** (`rollback-0207.sql`): sin tablas ni funciones de grupos, y la huella de los catálogos igual que antes; después se vuelve a aplicar dos veces.
- **«2o»:** la selección (2k) y la paridad TS ↔ SQL siguen en verde con `0207`.

**TS y CI:**
- `tsc` limpio;
- `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager` en verde;
- en `test:catalogs-manager`, 49 comprobaciones nuevas de la regla pura:
  - nombres con el mismo criterio que SQL;
  - vistas, recuentos y etiquetas;
  - URL y recuerdo (prioridad, «Todas», borrado, mal formado, por dueño y país, sin almacenamiento, otros parámetros);
  - las escrituras de las fixtures con los errores de SQL;
- además, una prueba estática de que `group-actions.ts` no importa el vigilante ni la huella pública, no llama a `notifyCatalogChanged`, `saved()` ni `revalidatePath`, y solo llama a funciones `catalog_group_*`.

**Navegador:** `grupos.mjs`, **79/79 a 1440 y 75/75 a 362 y a 320** (cuatro comprobaciones son solo de escritorio):
- vistas y recuentos, combinación con modo y zona, y archivados;
- recordar al volver desde el gestor;
- `?grupo=todas` manda, y «Todas» no restaura otro grupo;
- un grupo borrado en otra pestaña, inexistente o mal formado: «Todas»;
- se conservan los demás parámetros y la clave va por dueño y país;
- sin almacenamiento del navegador, nada falla;
- «Organizar»: crear, repetido, 61 caracteres, subgrupo, renombrar, ▲ con el foco en su sitio, mover, y Esc en el menú, en la confirmación y en el panel;
- borrar Salamanca: la confirmación y su resultado;
- «Grupos»: un grupo y su subgrupo, el fallo con un grupo borrado y el foco de vuelta;
- **un lector abierto no recibe ningún aviso** (`update`/`unavailable`) y su huella no cambia mientras se organiza. **Control:** un cambio real de título sí le llega;
- crear: sin casilla con «Todas»; casilla desmarcada con un grupo;
- **si la asignación falla, 0 catálogos y lo escrito se conserva; doble clic e Intro dan 1 catálogo, asignado; sin marcar, sin grupo;**
- 37 grupos sin desplazamiento horizontal, «Más grupos» y la lista del móvil;
- **desde el gestor:** la URL, el panel abierto, lo escrito sin guardar, la marca «sin guardar», el foco y la protección al salir, todo igual;
- `?sinGrupos=1`: la HOME de antes.

**Matriz de E2 y regresiones:** tanda completa, en secuencia (servidor de fixtures aislado):
- **Matriz de E2:**
  - `t4` 32/0;
  - `dqa9` 59/0, `saves` 31/0 y `ai` 15/0 en los tres tamaños;
  - `homes` 56–57/0 y `content` 33–34/0 en cinco tamaños;
  - `design-share` 34/0 en cuatro tamaños;
  - `bars` 46/0.
- **Regresiones:** `lector` 52/0, `indice` 187/0, `prA` 54/0, `prB` 40/0, `enlace` 10/0 y `c1` 31/0.
- **Pruebas recientes:** `vista` 23/0 (1440 y 362) y `e3` 41/0 (1440, 362 y 320).
- **`grupos`:** 79/0 a 1440 y 75/0 a 362. A 320 falló una vez «renombrar» (73/2): solo esperaba 350 ms al mensaje. La comprobación siguiente de esa misma pasada ya veía el nombre nuevo guardado. Repetida tres veces, 75/0; ahora espera al mensaje y da 75/0.
- **Cortadas por un pico de carga del equipo** (carga ~13): `c2` y `sel` no llegaron a cargar alguna página (90 s y 30 s), y las tres mediciones se cortaron también. No hubo fallos de aserción. **Repetidas aisladas:**
  - `c2` 186/0;
  - `medicion`, `c1-medicion` y `c2-medicion` PASA (20/20 ensayos, 0 fallos; máximos 0,24, 0,33 y 0,20 s);
  - `sel` 39/0 a 1440 y 362.
- **Tras el último rebase sobre `afa6b94`:** se repitieron `grupos` (79/75/75), `prA` 54/0, `prB` 40/0, `lector` 52/0, `homes` 56/0, `content` 33/0 y `e3` 41/0, y la suite SQL entera (930 ok, 0 `ERROR`; esperas de 1,50 y 1,48 s y contraprueba con 101).

**Expectativa cambiada a propósito:** `prB.mjs` busca ahora el filtro por su nombre nuevo, `select[aria-label='Zona de los criterios']` (D11). Su resultado («2 de 4») no cambia.

**Compilación aislada:** `next build` en la copia aislada, con `iso.sh verify` antes (sin `.env*`, variables en lista blanca y `@next/env` sin archivos cargados): compila y genera 156/156 páginas, también sobre `afa6b94`.

**Rendimiento:** la HOME y la página del gestor hacen una lectura más por dueño (sus grupos y asignaciones), sin tocar las consultas de catálogos. No se ha medido aparte: es una lectura pequeña, indexada por `owner_id`, frente a las instantáneas que la HOME ya lee para las portadas.

**Capturas:** [`capturas/`](capturas/), en escritorio y en móvil:
- la estantería con Salamanca;
- la lista de grupos del móvil;
- «Organizar»;
- la confirmación de borrar;
- «Grupos» de un catálogo;
- «Nuevo catálogo» con la casilla.

## Criterios de aceptación

| # | Estado | Evidencia |
| --- | --- | --- |
| AC1 | demostrado (local) | SQL «2n» (árbol, renombrar, ordenar, 0…n−1); `grupos.mjs` (crear, renombrar, ▲ y el orden igual en el selector) |
| AC2 | demostrado (local) | SQL (padre + hijos, «Todo Salamanca» = 3 sin repetir); TS; navegador (nº 02 una vez; nº 03 en Chamberí y Goya, una vez) |
| AC3 | demostrado (local) | TS (vistas y recuentos); navegador («Todas» = 3 de 4 como antes; «Sin organizar») |
| AC4 | demostrado (local) | SQL (la huella de comprobación tras cada operación, con control positivo); prueba estática de `group-actions.ts`; navegador (lector abierto: 0 avisos y la huella igual; control positivo) |
| AC5 | demostrado (local) | SQL (vista previa y borrado; asignaciones a otros grupos conservadas); navegador (confirmación con recuentos; 4 catálogos siguen) |
| AC6 | demostrado (local) | TS y navegador (URL > recuerdo > «Todas»; «Todas» no restaura; borrado, ajeno o mal formado: «Todas»; por dueño y país; sin almacenamiento) |
| AC7 | demostrado (local) | navegador (grupo + modo, grupo + zona de los criterios; archivados con «Archivados» y «Activos») |
| AC8 | demostrado (local) | SQL (permisos, `forbidden`, tres niveles, ciclos, dueños mezclados, también con escrituras directas); los grupos no están en la instantánea pública (la huella no cambia) |
| AC9 | demostrado (local) | navegador a 1440, 362 y 320 con 37 grupos, sin desbordes; ▲▼ y teclado |
| AC10 | demostrado (local) | `?sinGrupos=1` y `prB.mjs` en verde (solo cambia el nombre del filtro); matriz de regresiones |
| AC11 | demostrado (local) | SQL (atómico: si falla, 0 catálogos; reintento, 1); navegador (desmarcada, fallo, doble envío = 1, asignado) |
| AC12 | demostrado (local) | navegador (gestor: la URL, el panel, lo escrito sin guardar, la marca y la protección al salir, iguales) |
| AC13 | demostrado (local) | SQL y navegador (mover conserva las asignaciones; un grupo con subgrupos no se mueve) |

«Local» significa demostrado con datos sintéticos, no en producción.

## QA de Fabricio

- **Merge:** PR #322 fusionado por Fabricio en el commit `94b513f` de `main`, el 16 de octubre de 2026 a las 18:33 UTC. La CI de `main` en ese commit, en verde.
- **Despliegue:** comprobado solo desde fuera, en solo lectura. El identificador del build público cambió de `MZ1Il_u884oJWTSvMvW6u` a `7B48neqNGUSUgJmsRRh8j` después del merge.
  - **`0207`:** no se ha verificado en la base de datos. Se da por aplicada porque, si las migraciones fallan, el despliegue no cambia de versión, y la funcionalidad que depende de ella funciona.
- **Aceptación de Fabricio** (16 de octubre de 2026): la funcionalidad de grupos desplegada en la HOME funciona correctamente.
  - El informe es general: no detalla qué comprobaciones hizo ni en qué dispositivos, así que aquí no se da por cubierto ningún dispositivo real concreto.

## Revisión

No se pidió revisión adicional de Codex.

## Pendiente o no demostrado

- **La QA de Fabricio en producción:** aceptada el 16 de octubre de 2026 (ver «QA de Fabricio»). Esta era la lista propuesta, y el informe no dice punto por punto qué se revisó:
  - crear su árbol (Salamanca → Recoletos, Castellana, Lista, Goya; Chamberí; Retiro);
  - asignar catálogos, también uno a dos barrios;
  - comprobar «Todas» y «Sin organizar»;
  - volver desde un catálogo;
  - crear un catálogo con la casilla;
  - borrar un grupo de prueba;
  - y lo mismo en el móvil.
- **No ejecutado en local:** el camino real con PostgREST (`listOwnerGroups` y las RPC) y la sesión real. Lo cubren las mismas funciones SQL, probadas en el Postgres temporal, y las fixtures, que aplican las mismas reglas.
- **Primera carga sin `?grupo`:** el servidor no conoce lo recordado, así que la estantería puede enseñar «Todas» un instante hasta que el navegador lo aplica. Está documentado en la especificación.
- **Siguen pendientes, sin relación con esta tarea:** G-ALQ y el caso original de Recoletos. D13 en vivo tampoco se ha medido.
- **Fuera de alcance:** el PDF y las sugerencias a partir de los criterios (D2).

## Despliegue y recuperación

- **Fusionar puede desplegar y aplicar `0207`.** Solo crea objetos nuevos y no migra datos: los grupos empiezan vacíos y todo está en «Sin organizar».
- **Código anterior con el esquema nuevo:** funciona e ignora los grupos.
- **Código nuevo sin el esquema:** la HOME de siempre, sin grupos.
- **Recuperación:**
  - **del código:** `git revert` del merge. La HOME vuelve a la de antes y las tablas se quedan sin usar;
  - **del esquema:** `rollback-0207.sql`, que ejecuta una persona. **Se pierde toda la organización** (grupos y asignaciones); antes se puede copiar con `\copy`. Los catálogos, sus criterios y lo que ve el cliente no cambian.

## PR, CI y merge

- Rama `fabri/bcp-01-home-grupos` → `main`. El enlace del PR y el estado de la CI están en el PR.
- PR: [#322](https://github.com/Bcousino890/smartbc/pull/322). CI en verde en `b86334a`, con TypeScript, las pruebas de catálogos, `next build` y migraciones.
- **El agente no fusiona.** Fusionar puede desplegar y aplicar `0207` (ver «Despliegue y recuperación»); lo decide Fabricio.
