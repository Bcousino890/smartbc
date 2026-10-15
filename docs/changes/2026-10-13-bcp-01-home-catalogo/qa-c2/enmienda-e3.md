# BCP-01 · E3 «Fotos por catálogo»: especificación y decisiones

**Estado: ESPECIFICACIÓN CON DECISIONES APROBADAS (15 de octubre de 2026); PLAN PENDIENTE.** Fabricio decidió E3-1 a E3-7 (§5, registro en [enmienda §0, D-QA13](enmienda.md)). Eso autoriza a **documentar** E3, no a implementarlo. El plan de implementación queda **pendiente**: la prioridad pasa al diagnóstico y la corrección de la selección automática, que viven **en su propia rama** (`fabri/bcp-01-seleccion`, `diagnostico-seleccion-auto.md` y `plan-seleccion.md`), separada de E3. Este documento no autoriza implementar, ejecutar migraciones, instalar nada, hacer push ni abrir un PR.

**Requisito técnico abierto (no resuelto en esta especificación).** Un `src` posicional (`/p/{slug}/{idx}`) **no** es una identidad estable de la foto cuando el CRM reordena. El diseño de E3 tiene que resolver la identidad de la foto que se **sirve de verdad**, no solo la que se elige, y comprobarlo con pruebas que miren la foto servida. Eso incluye las limitaciones actuales del proxy: ordena solo por `position` (mientras la instantánea desempata por `position, id`) y guarda cada respuesta 24 h en caché. Mientras eso no esté demostrado, nada de lo escrito en §3.3 y §3.5 se da por resuelto.

Origen: [enmienda §0, D-QA5](enmienda.md), aprobada el 14 de octubre de 2026, que **no** se reabre aquí: «elegir la foto de apertura y excluir fotos por catálogo. «No usar esta foto en este catálogo» la oculta en todo ese catálogo (galería, miniaturas, apertura, recorrido y, donde aplique, portada del catálogo). Las fotos originales del CRM se conservan y siguen disponibles en todo lo demás».

## 1. Base comprobada (15 de octubre de 2026)

- **`origin/main` = `84538e7859bd694fa5e1f2954d9593d7c2be2457`** (merge de E2, PR #318). CI de `main` sobre ese commit: **en verde** (comprobado en solo lectura con `gh run list`).
- **Última migración:** `0197_catalog_texts.sql`, así que E3 sería **`0198`**. Ninguna otra migración posterior en `main`.
- **Worktree de documentos:** `/Users/fabriirguez/SMARTBC/wt/bcp-01-e3`, rama `fabri/bcp-01-e3`, desde ese SHA. Sin `npm ci` ni servidores. El checkout original (en `main`, limpio), su stash y los demás worktrees no se han tocado.
- **E2 en vivo:** Fabricio acepta las cuatro secciones, la conservación de lo escrito al cambiar de sección o de vivienda y la confirmación al salir por el menú del CRM. Siguen **pendientes** las pruebas en dispositivos reales y D13 en vivo.

## 2. Cómo funcionan hoy las fotos (exploración en solo lectura, con su origen)

### 2.1 Identidad y ciclo de vida de una foto del CRM

| Hecho | Dónde |
| --- | --- |
| `property_photos` tiene `id uuid`, `property_id`, `url`, `position`, `is_cover`, clase (`ai_class`, `ai_confidence`, `class_override`) y tamaño de origen. Ningún índice único en `(property_id, position)`: puede haber filas duplicadas | `0001`, `0033`, `0144`, `0153` |
| **Reordenar** cambia `position` e `is_cover` en las mismas filas (por URL): el `id` se conserva | `app/(admin)/admin/propiedades/actions.ts` (`reorderPropertyPhotos`) |
| **Borrar** quita las filas de esa URL | ídem (`deletePropertyPhoto`) |
| **Realojar** en segundo plano cambia la `url` de la misma fila: el `id` se conserva y la URL **no** | `lib/sync/import-by-link/insert.ts` |
| **Reimportar** por enlace **borra todas las fotos de la ficha y las vuelve a crear con `id` nuevos** | ídem |
| La portada C1 ya guarda la **fila**: `catalogs.cover_photo_id uuid`, sin clave foránea (para poder detectar que ya no existe) | `0196` |

**Conclusión.** La identidad más estable que existe es `property_photos.id`: sobrevive a reordenar y a realojar.
- **Ni la posición ni la URL** sirven: la primera cambia al reordenar y la segunda al realojar.
- **Nada sobrevive a una reimportación**, porque las filas son nuevas (decisión E3-5).
- **El índice público** (`/p/{slug}/{idx}`) es una posición y no se puede usar como identidad.

### 2.2 Instantánea interna y huella

- `catalog_item_json` (última versión en `0197`) proyecta las fotos como `{u: md5(url), w, h, c: is_cover, k: clase fiable}`, ordenadas por `position, id`.
  - `u` es el identificador opaco que usa todo lo que viene después. **Cambia** si se realoja la foto.
- La portada del catálogo sale en la instantánea como `cover: {key, photo: md5(url)}`, resuelta desde `cover_photo_id`.
- **Huella pública = `md5(catalog_internal_snapshot)`** (`0193`: `get_public_catalog`, `get_catalog_states`, `catalog_public_fingerprint`). Por tanto, **cualquier cosa que E3 añada a la instantánea cambia la huella**, y eso ya basta para que el lector abierto se actualice (D12/D13). Al revés también: si un catálogo no tiene ajustes de fotos y la instantánea no cambia, su huella no cambia al desplegar.
- **Aviso en vivo:** cada acción del gestor termina en `saved()` (`notifyCatalogChanged`, revalidación y huella antes y después, para la medición), y el vigilante compara huellas con `get_catalog_states`.

### 2.3 Proyección pública (TypeScript)

- `toPublicPhotos` (`lib/catalogs/to-public.ts`):
  - quita duplicados por `u`;
  - **`src = /p/{slug}/{idx}.webp`, donde `idx` es la posición en la lista ENTERA de fotos de la ficha (sin duplicados)**;
  - `coverIndex` = la primera con `is_cover`, o 0.
- `coverPhotoOf` (portada C1): foto elegida → foto de portada **del CRM** de esa vivienda → primera vivienda con foto → sin foto.
- `deriveEditorial` y la composición de E1 trabajan con **índices del array público**:
  - `coverIndex` es la foto de apertura;
  - cada sección lleva `photo` (índice);
  - `mosaic` son índices;
  - las fotos de los capítulos se eligen por clase;
  - las alternas saltan las ya usadas y las clases excluidas del recorrido (`floor_plan`, `street_context`, `other`).
- Los diagnósticos de material de E2 (`material-data.ts`) y la portada de las tarjetas de la HOME (`queries.ts`) se calculan con esta misma proyección.

### 2.4 El proxy de fotos `/p/{slug}/{idx}`

- Ordena las fotos de la ficha **solo por `position`**, quita duplicados por URL, sirve la del índice pedido y la guarda **24 h en caché** (CDN).
- **Es público y general:** lo usan también la web y otras superficies. No sabe nada del catálogo.
- **Riesgo que ya existe hoy** (no lo crea E3): la instantánea desempata por `position, id` y el proxy solo por `position`. Con dos fotos en la misma posición, el índice podría apuntar a otra foto. Se documenta; arreglarlo sería un cambio del proxy, fuera de E3.

### 2.5 Lector

- La apertura usa `photos[coverIndex]`, y la galería se abre desde ahí.
- La galería guarda **un índice**. `applyUpdate` (D12), al llegar una versión nueva, solo **recorta** ese índice. **Si se excluye una foto anterior a la que se está viendo, la galería pasaría en silencio a enseñar la siguiente.** E3 tiene que reasignarlo por identidad (§3.5).
- Una vivienda sin fotos ya tiene su versión «Sin fotos» (`pages.tsx`).

### 2.6 Gestor (E2) y otras lecturas

- **Portada en Diseño:** `CoverPicker` → `listCoverPhotos`, que da `id` de fila y miniatura por el proxy, con el mismo índice sin duplicados. Elegir una foto guarda al momento (`catalog_set_cover`).
- **Vista previa del recorrido en el editor de textos:** `previewJourney` / `textSourceFor` (`lib/catalogs/texts.ts`) leen `property_photos` **directamente**, sin saber de qué catálogo se trata. Sin cambios, ignorarían las exclusiones.
- **Fixtures:** `fixture-store.ts` construye `InternalItem.photos` con `u` sintéticos.
- **Selección automática:** exige «al menos una foto» con el recuento **global** de `property_photos` (`photo_count`). E3 **no** cambia esta regla.

## 3. Diseño propuesto

### 3.1 Identidad y datos (migración `0198`)

Tabla nueva, propia del catálogo:

```sql
CREATE TABLE catalog_photo_prefs (
  catalog_id  uuid NOT NULL REFERENCES catalogs(id)   ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  photo_id    uuid NOT NULL,                 -- property_photos.id, SIN clave foránea (como cover_photo_id)
  kind        text NOT NULL CHECK (kind IN ('exclude', 'opening')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (catalog_id, photo_id, kind)
);
CREATE UNIQUE INDEX catalog_photo_prefs_one_opening ON catalog_photo_prefs (catalog_id, property_id) WHERE kind = 'opening';
-- RLS activada, REVOKE para public/anon/authenticated, solo service_role (como catalog_texts y catalog_adjustments).
```

- **Sin clave foránea a `property_photos`:**
  - así se detecta un ajuste que ya no se aplica (la foto se borró o se reimportó) y el gestor puede avisar, en vez de que desaparezca sin dejar rastro;
  - las filas huérfanas no hacen nada: la instantánea solo cruza con fotos que existen.
- **Funciones:** `SECURITY INVOKER`, solo `service_role`, con la guarda de dueño de siempre (`catalog_require_owner`), y cada una sube `catalogs.version`:
  - `catalog_photo_exclude(p_actor, p_catalog, p_property, p_photo, p_exclude boolean)`;
  - `catalog_photo_opening(p_actor, p_catalog, p_property, p_photo uuid | NULL)`, donde `NULL` vuelve a la apertura automática.
- **Validación**, igual que la portada de C1:
  - la vivienda tiene que estar en la lista efectiva;
  - la foto tiene que ser suya;
  - más lo que decidan E3-1 y E3-2.
- **Nunca escriben** en `property_photos`, `properties`, la clasificación de fotos ni ninguna caché.
- **Duplicados por URL:** el proxy y la proyección ya tratan dos filas con la misma URL como una sola foto. E3 hace lo mismo: si se excluye cualquiera de esas filas, la foto se excluye.

### 3.2 Instantánea

- `catalog_internal_snapshot` añade a cada vivienda, **solo si tiene ajustes**, `pp: {x: [u…], o: u | null}`: las excluidas y la apertura elegida, ya traducidas a `md5(url)` con un `LEFT JOIN LATERAL` (el mismo patrón que los textos de `0197`).
- `catalog_item_json` **no cambia**.
- **Compatibilidad:** sin ajustes, la instantánea es **idéntica byte a byte**, así que la huella no cambia al desplegar y nadie recibe una actualización en vivo por E3.
- La portada (`cover.photo`) no cambia de forma. Lo que cambia es su respaldo (§3.4).

### 3.3 Una sola autoridad: `effectivePhotos`

Módulo nuevo y puro, `lib/catalogs/photo-selection.ts`:

```ts
export interface EffectivePhoto { u: string; proxyIdx: number; w: number | null; h: number | null; k: string | null }
export interface EffectivePhotos {
  photos: EffectivePhoto[];      // las que se usan en ESTE catálogo, en el orden del CRM
  openingIndex: number;          // índice en `photos` (0 si no hay ninguna)
  openingSource: "chosen" | "crm-cover" | "first" | "none";
  excluded: number;              // cuántas fotos (sin duplicados) quedan fuera
  stale: { opening: boolean; excluded: number }; // ajustes que ya no aplican
}
export function effectivePhotos(item: InternalItem): EffectivePhotos;
```

- **Reasignación de índices (la regla importante):**
  - `proxyIdx` es la posición en la lista **entera** de la ficha, sin duplicados; es la que entiende `/p`. Así `src` sigue apuntando a la foto correcta aunque se quiten otras;
  - **todos los demás índices** (`coverIndex`, `sections[].photo`, `mosaic`, el índice de la galería y el «N fotos») se refieren a la lista **ya filtrada**.
- **Quién la usa** (y nadie más decide qué fotos se ven):
  - `toPublicPhotos` y, a través de ella, el lector entero: apertura, recorrido, mosaico, miniaturas, galería, recuentos y navegación;
  - `coverPhotoOf` (portada del catálogo y tarjeta de la HOME);
  - los diagnósticos de material de E2;
  - la vista previa del recorrido del editor de textos;
  - las listas de fotos del gestor.
  - Cualquier exportación futura (PDF, fuera de E3) también tendrá que usarla.
- **Apertura efectiva:** el orden de respaldo es la decisión E3-3. Mi recomendación:
  1. la elegida, si existe y no está excluida;
  2. la portada del CRM, si no está excluida;
  3. la primera no excluida;
  4. ninguna.

### 3.4 Portada del catálogo y apertura de cada vivienda: dos cosas distintas

| | Portada del catálogo | Foto de apertura de una vivienda |
| --- | --- | --- |
| Dónde se elige | **Diseño** (como en C1) | **Contenido**, en el panel de la vivienda |
| Qué es | La imagen de la cubierta del catálogo entero | La primera foto de esa vivienda en el lector |
| Datos | `catalogs.cover_property_id` / `cover_photo_id` (sin cambios) | `catalog_photo_prefs` (`kind = 'opening'`) |

- **En la interfaz** se distinguen con nombre propio: «Portada del catálogo» y «Foto de apertura de esta vivienda (solo en este catálogo)».
- **Respaldo de la portada** (decisión E3-3; mi recomendación):
  1. la foto elegida, si existe, su vivienda está en la lista y no está excluida;
  2. la **apertura efectiva de esa vivienda en este catálogo** (hoy es la portada del CRM: es el único cambio de C1);
  3. la apertura efectiva de la primera vivienda con fotos;
  4. sin foto.
- El selector de portada de Diseño **no ofrece** fotos excluidas, y avisa si la portada elegida ha dejado de valer.

### 3.5 Lector y actualizaciones en vivo

- Guardar un ajuste de fotos cambia la instantánea, y con ella la huella. Las nuevas acciones pasan por `saved()`, igual que las demás: aviso inmediato, vigilante y medición `?medir=1`. D12 no cambia de forma.
- **La galería abierta se reasigna por identidad.**
  - En `applyUpdate`, si la foto que se ve (su `src`) sigue en la lista nueva, la galería se queda en ella, en su índice nuevo.
  - Si se ha excluido, se queda en la misma posición, que ahora muestra la siguiente, y avisa: «Esa foto ya no forma parte del catálogo».
  - Si no queda ninguna, la galería se cierra.
  - El `src` es estable mientras el CRM no reordene; si reordena, la reasignación cae en el caso «la misma posición». Todo esto se prueba con resultados escritos a mano.
- La composición de E1 se recalcula con la lista filtrada. Si una vivienda pierde páginas del recorrido, se aplica la regla de siempre: la parte anterior que exista.

### 3.6 Gestor (dentro de la organización de E2)

- **Contenido, panel de la vivienda:** nuevo bloque **«Fotos en este catálogo»**, como en la maqueta G2.
  - Miniaturas en el orden del CRM, cada una con su estado: «Apertura», «No se usa en este catálogo» o normal.
  - Acciones: «Usar como foto de apertura», «No usar en este catálogo», «Volver a usarla» y «Volver a la apertura automática».
  - Un recuento («Se usan 7 de 9 fotos»).
  - Avisos de los ajustes que ya no aplican (E3-5).
  - Una nota fija: «Esto no cambia la ficha del CRM ni la portada del catálogo (Diseño)».
- **Diseño:** la portada del catálogo, como ahora, sin las fotos excluidas y con los avisos de respaldo.
- **Material (E2):** el recuento y «Sin fotos» ya reflejan las exclusiones, porque salen de la misma proyección.
- **Vista previa del recorrido** del editor de textos: con las fotos de este catálogo. `textSourceFor` y `previewJourney` reciben el catálogo; es un cambio de API que llega con todos sus consumidores en el mismo commit.
- **Cómo se guarda:** depende de la decisión E3-4. Con mi recomendación (guardar al pulsar, como Excluir en Viviendas o la portada en Diseño), no hay borrador de fotos ni nada que añadir al almacén de E2, y las salvaguardas de E2 (estado sin guardar, IA, conflictos) no cambian.

### 3.7 Modos, compatibilidad y lo que no cambia

- **Lo que no cambia:** las reglas de selección (automático, máximo, inclusiones, exclusiones, «al menos una foto» con el recuento global), los permisos, el contrato público (mismos campos: `photos`, `coverIndex`, `mosaic`, `sections`) y las fichas, fotos y clasificación del CRM.
- **Ajustes y lista:**
  - solo se editan mientras la vivienda está en la lista efectiva;
  - se **conservan** si sale (automático que se recalcula, exclusión, quitarla en manual) y vuelven a aplicarse si vuelve, como los textos en reserva.
- **Catálogos existentes:** sin ajustes, se ven exactamente igual, con la misma huella.
- **Las clases de foto de E1** (plano, calle, otra) siguen fuera del recorrido automático. Una exclusión de E3 es más fuerte: la quita de todo el catálogo. Elegir a mano una foto de esas clases como apertura está permitido, porque es una decisión explícita.

### 3.8 Migración, recuperación y despliegue

- **`0198_catalog_photo_prefs.sql`:**
  - la tabla, las dos funciones y `catalog_internal_snapshot` redefinida (con `OFFSET 0` y los permisos de `0197`);
  - idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`) y probada aplicándola dos veces.
- **Recuperación:** `rollback-0198.sql`, que ejecuta una persona.
  - Deja la instantánea de `0197` y borra las funciones y la tabla.
  - **Se pierden todos los ajustes de fotos de todos los catálogos.** Antes hay que copiarlos con `\copy (SELECT * FROM catalog_photo_prefs) TO … CSV HEADER`.
  - Las fichas y fotos del CRM no se tocan. Las huellas de los catálogos con ajustes cambian (vuelven a verse todas sus fotos).
- **Compatibilidad del despliegue** (build → migraciones → cambio de versión, y si el health check falla vuelve el build anterior con el esquema nuevo):
  - **código viejo con esquema nuevo:** funciona. Ignora `pp` (el TS actual no lee claves desconocidas), así que enseñaría todas las fotos, pero no hay errores;
  - **código nuevo con esquema viejo:** no se da, porque las migraciones van antes del cambio de versión. Aun así, `effectivePhotos` sin `pp` se comporta como hoy.
- **Fusionar puede desplegar y aplicar `0198`.**

### 3.9 Verificación prevista (detalle en el plan)

- **SQL**, en el Postgres 16 temporal de las fases anteriores (`scripts/sql/test-catalogs-core.sh`, escenario nuevo «2j»):
  - permisos, RLS y `SECURITY INVOKER`;
  - guarda de dueño y foto que no es de la vivienda;
  - instantánea idéntica sin ajustes y huella que cambia con ellos;
  - reordenar, realojar (cambia la URL), borrar y reimportar;
  - duplicados por URL;
  - ajustes que se conservan si la vivienda sale y vuelve;
  - ninguna escritura en tablas globales;
  - aplicada dos veces, rollback y reaplicación;
  - y que **los tests de `0196` y `0197` siguen en verde sobre `0198`**.
- **Pruebas puras,** con resultados escritos a mano: `effectivePhotos` (índices del proxy frente a índices filtrados, apertura y sus respaldos, todas excluidas, duplicados), `coverPhotoOf`, los índices de E1 tras filtrar, el material y `applyUpdate` con la galería reasignada.
- **Navegador**, con fixtures sintéticas y en la copia aislada de E1/E2:
  - excluir y elegir apertura con el lector abierto (también con la galería abierta);
  - portada y sus respaldos;
  - escritorio, 362 y 320 px;
  - mediciones sintéticas 20 × 2;
  - regresiones de E1 y E2.

### 3.10 Fuera de alcance

- PDF (importar/exportar). Se deja anotado que **toda exportación futura tendrá que respetar las exclusiones y la apertura de cada catálogo** (usando `effectivePhotos`).
- Cambiar el proxy `/p` o su caché.
- Cambiar las reglas de elegibilidad de la selección.
- D13 en vivo.

## 4. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un índice mal reasignado enseña otra foto | Una sola función (`effectivePhotos`), `src` con el índice del proxy y pruebas con casos escritos a mano |
| Galería que cambia de foto en silencio | Reasignación por `src` y aviso (§3.5) |
| Reimportar en el CRM borra los ajustes de hecho (filas nuevas) | Aviso en el gestor (E3-5) |
| Una foto excluida sigue existiendo en `/p` | Es una regla de presentación, no de confidencialidad (E3-6) |
| Proxy y caché de 24 h con un CRM que reordena | Riesgo que ya existe; E3 no lo empeora (el `src` sigue la regla de hoy) |
| Rendimiento de la instantánea | Un `LEFT JOIN LATERAL` como en `0197`; se mide con `perf-catalogs.sh` y se compara con C2 |

## 5. Decisiones de Fabricio (aprobadas el 15 de octubre de 2026)

| | Decisión |
| --- | --- |
| **E3-1** | **No se puede excluir la última foto** que se ve de una vivienda en el catálogo. Para que la vivienda no aparezca, se quita o se excluye en Viviendas. Si después el CRM borra las fotos que quedaban, la vivienda se ve «Sin fotos» y el gestor lo avisa |
| **E3-2** | Una foto excluida **tiene que volver a usarse explícitamente** antes de poder elegirla como foto de apertura |
| **E3-3** | **Respaldos.** *Apertura de una vivienda:* foto elegida en uso → portada del CRM en uso → primera foto en uso → ninguna. *Portada del catálogo:* foto elegida en uso → apertura efectiva de esa vivienda en este catálogo → apertura efectiva de la primera vivienda con fotos → sin foto. El segundo paso cambia el respaldo de C1, que antes era la portada del CRM |
| **E3-4** | Los ajustes de fotos **se guardan al pulsar**, sin depender del borrador ni de la publicación del texto |
| **E3-5** | Se acepta que **reimportar** las fotos en el CRM crea identidades nuevas, invalida los ajustes anteriores y puede volver a mostrar fotos excluidas. **El gestor lo avisa** |
| **E3-6** | La exclusión es una regla de **presentación del catálogo**. No revoca el acceso a la foto por el proxy público general `/p` |
| **E3-7** | Se puede excluir la foto que es la **portada del catálogo**, tras una confirmación. Después se usa su respaldo |

Lo que decido yo y queda anotado:
- la identidad por `property_photos.id`;
- los duplicados por URL tratados como una sola foto;
- la reasignación de índices (§3.3);
- los ajustes que se conservan cuando la vivienda sale de la lista;
- los nombres en la interfaz;
- la instantánea idéntica sin ajustes.

## 6. Fase y siguiente paso

- **Fase actual:** especificación de E3 con decisiones aprobadas. **Plan pendiente**: Fabricio ha puesto antes el diagnóstico de la selección automática.
- **Antes de escribir el plan,** queda por resolver el requisito técnico de la identidad de la foto servida (al principio de este documento).
- **Siguiente paso de E3,** cuando Fabricio lo retome: preparar el plan en borrador con `0198`, su rollback y sus pruebas en el Postgres 16 temporal, la copia aislada, las fixtures sintéticas y la aprobación de ejecución que necesite.
- **Fuera:** PDF (toda exportación futura tendrá que respetar las exclusiones) y D13 en vivo.
