# BCP-01 · E3 «Fotos por catálogo»: plan de implementación

**Estado: EJECUCIÓN APROBADA (D-QA19, 16 de octubre de 2026)**, T0–T9, con las correcciones del §0.
- Se para **antes del merge**: fusionar puede desplegar y aplicar `0202`.

**Especificación:** [`enmienda-e3.md`](enmienda-e3.md), con las decisiones E3-1 a E3-7 de Fabricio (D-QA13). Este plan **resuelve su requisito técnico abierto**, la identidad de la foto que se sirve (§3), y **corrige el número de migración**, que pasa de `0198` a `0202` (§1).

**Fuera de E3:**
- la organización editable de la HOME y el PDF. Toda exportación futura tendrá que usar la misma regla de fotos;
- G-ALQ, el caso de Recoletos, D13 en vivo y la QA en dispositivos reales: siguen como están y no son requisitos previos de E3.

## 0. Aprobación (D-QA19) y correcciones obligatorias

**Fabricio aprueba:**
- **N1(a):** ampliar el proxy de fotos existente con una identificación opaca y estable de la foto (`?f=`) y una versión del archivo (`?v=`). Sin la identificación nueva, el comportamiento es el de hoy.
- **N2:** se acepta el cambio único de los `src` de las fotos y de las huellas de los catálogos al desplegar. Los lectores abiertos pueden necesitar recargar.
- **Excluir la apertura elegida:** se confirma antes y su apertura vuelve a la automática.
- **Miniaturas del gestor:** enseñan la apertura efectiva.
- **La ejecución de T0–T9.**

Se conservan E3-1 a E3-7: exclusión en todo el catálogo y la galería, guardado al pulsar, respaldos de la portada y ninguna escritura en las fichas ni en las fotos del CRM.

**Correcciones obligatorias, incorporadas en este plan:**
1. **La regla de la última foto es transaccional**, también con exclusiones simultáneas. La función bloquea la fila del catálogo (`FOR UPDATE`) antes de contar, así que todos los ajustes de fotos de un catálogo van uno detrás de otro. Se prueba con **dos transacciones independientes simultáneas** en el Postgres temporal: la primera excluye y espera; la segunda queda bloqueada y, al confirmarse la primera, falla con `last_photo`.
2. **Los avisos de ajustes que ya no aplican no se pierden.**
   - La instantánea pública solo lleva ajustes de fotos que existen.
   - El gestor lee la tabla de ajustes **entera**, incluidos los de fotos borradas o reimportadas, y los cuenta y explica.
   - Filtrar la instantánea nunca borra esos diagnósticos.
3. **Redacción en la interfaz:** las exclusiones no cambian el CRM, pero excluir la foto de apertura o la de la portada del catálogo **activa su respaldo**. Cada caso tiene su confirmación y su explicación, sin decir que «no cambia la portada».
4. **Rendimiento:** se compara con la base **actual de `main`** en condiciones equivalentes (mismo Postgres temporal, mismos datos y mismo script, antes y después de `0202`), no con C2.
5. **La versión `v`** sale de la URL: **detecta los cambios de URL** (realojar), pero **no la sustitución del archivo en la misma URL**.
   - Se verifica lo que sí se cubre (realojar → `v` nuevo → foto nueva).
   - La limitación queda documentada: tras sustituir un archivo sin cambiar la URL, la caché de 24 h puede servir el anterior, como hoy.
   - No se amplía el alcance.

**QA de #320 en producción:** superada en sus dos comprobaciones (registrada en `result.md`).

**Siguen pendientes, y no son requisitos previos de E3:** G-ALQ, el caso original de Recoletos, D13 en vivo y la QA en dispositivos reales.

## 1. Base

- **`origin/main` = `f39fda2`** (merge de #320). Lleva K1–K5 (#319) y la vista previa (#320).
- **Rama:** `fabri/bcp-01-e3`, solo local. Se rebasó sobre `f39fda2`.
  - En el rebase, el diagnóstico de la selección quedó idéntico al de `main`.
  - Lleva la especificación, D-QA13, la propuesta de grupos de la HOME y el registro de la QA de #320.
- **Migraciones en `main`:** la última es `0201_property_tags.sql`. `0198`–`0201` son de otros cambios (clientes, particulares, etiquetas), así que **E3 es `0202_catalog_photo_prefs.sql`**.
  - Ningún PR abierto añade `0202`.
  - Se vuelve a comprobar antes del push. Si otro la ocupa, se renumera y se avisa.
- **Lo que se comprobó en el código de `f39fda2`:**
  - el proxy `/p/{slug}/{idx}` ordena solo por `position`, quita duplicados por URL y guarda 24 h en caché pública;
  - la instantánea ordena por `position, id`;
  - `toPublicPhotos` da `src` por índice;
  - las filas del gestor enseñan siempre la foto 0 (`coverPhotoUrl`), sin mirar la portada del CRM;
  - la galería del lector guarda un índice y, en D12, solo lo recorta;
  - la vista previa del recorrido (`texts.ts`) lee `property_photos` directamente;
  - el selector de portada (`listCoverPhotos`) usa índices del proxy.

## 2. Decisiones aprobadas (D-QA13), y cómo las aplica el plan

| | Decisión | Dónde |
| --- | --- | --- |
| E3-1 | No se puede excluir la última foto en uso | SQL `catalog_photo_exclude` (`last_photo`) y el botón desactivado con su motivo |
| E3-2 | Una foto excluida hay que volver a usarla antes de elegirla de apertura | SQL `catalog_photo_opening` (`photo_excluded`); la interfaz no lo ofrece |
| E3-3 | Respaldos de la apertura y de la portada | `effectivePhotos` y `coverPhotoOf` (§4) |
| E3-4 | Cada ajuste se guarda al pulsar, aparte de los textos | Acciones propias con `saved()`; sin borrador en el almacén de E2 |
| E3-5 | Reimportar invalida los ajustes; aviso claro | Ajustes «que ya no aplican» en el gestor (§5.2) |
| E3-6 | Oculta en todo el catálogo; `/p` sigue sirviendo la foto en general | §3 y §4 |
| E3-7 | Confirmar antes de excluir la foto de la portada del catálogo; luego, su respaldo | Confirmación en la interfaz; SQL lo permite |

**Lo que decido yo y queda anotado:**
- **Excluir la foto que está elegida como apertura de esa vivienda** se permite tras confirmar («La apertura vuelve a la automática»). La función borra esa elección en la misma transacción. Es la misma lógica que E3-7.
- **Las miniaturas de las filas del gestor** pasan a enseñar la apertura efectiva de la vivienda en el catálogo. Hoy enseñan la foto 0, que puede no ser ni la portada del CRM. Es la regla única que se pide.

## 3. Identidad de la foto servida (requisito técnico abierto)

**El problema.** La foto se elige por `property_photos.id`, pero se sirve por **posición**: `/p/{slug}/{idx}`. Eso falla en varios casos:
- el CRM reordena las fotos;
- hay dos fotos en la misma posición (el proxy no desempata por `id`);
- la caché de 24 h guarda la foto que había antes en esa posición.

En cualquiera de ellos, el lector puede enseñar **otra** foto, incluida una excluida.

**La solución:**
- **Clave opaca de la foto:** `f = left(md5('catalog-photo:' || property_photos.id), 16)`.
  - Es estable al reordenar y al realojar, porque el `id` se conserva.
  - Cambia al reimportar (filas nuevas), que es lo que dice E3-5.
  - No es el `uuid` ni la URL, y no permite deducirlos.
  - No depende del catálogo: el proxy es general y no lo conoce.
- **Versión del archivo:** `v = left(md5(url), 8)`. Solo sirve para que la caché no devuelva un archivo viejo tras realojar: cambia con la URL y no identifica la foto.
- **`src` público:** `/p/{slug}/{idx}.webp?f={f}&v={v}`, donde el lector añade `&w=`.
  - `idx` se conserva para que la ruta siga teniendo la misma forma.
- **Cambio en el proxy `/p`**, aditivo. **Sin `f` todo sigue exactamente igual** para la web y las demás superficies.
  - **Con `f`:** lee las fotos de la ficha con su `id`, calcula la clave de cada una y sirve **la que coincide**, sin mirar `idx` ni el orden.
  - **Si ninguna coincide** (foto borrada o reimportada después de la instantánea): `404` con `Cache-Control: no-store`. **Nunca otra foto.**
    - El lector recibe la versión nueva por el vigilante, porque la instantánea cambió con la ficha.
  - **La caché pública de 24 h** se guarda por URL completa (con `f` y `v`): una clave y una versión dan siempre el mismo archivo.
- **Cómo se demuestra** (§8): pruebas que piden la imagen por `src` a la ruta real, en la copia aislada con datos sintéticos, después de reordenar, poner dos fotos en la misma posición, realojar y borrar. Se comprueba la foto **servida**, no solo la elegida.
- **Lo que no cambia:**
  - el proxy sin `f` (incluido su orden solo por `position`, que es un riesgo de hoy y se documenta);
  - el acceso general a las fotos (E3-6).

**Consecuencia al desplegar (decisión nueva N2):**
- La instantánea pasa a llevar el `id` interno de cada foto (`i`) y todos los `src` cambian.
- La huella de **todos** los catálogos cambia **una vez**. Los lectores abiertos reciben una actualización o hay que recargarlos.
- Las imágenes se vuelven a pedir una vez, con la caché fría.
- Esto sustituye a la promesa de la especificación de una «instantánea idéntica sin ajustes».

## 4. Una sola regla: `lib/catalogs/photo-selection.ts`

Es una función pura con resultados escritos a mano:

```ts
export interface EffectivePhoto { key: string; v: string; proxyIdx: number; w: number | null; h: number | null; k: string | null; crmCover: boolean; photoId: string }
export interface EffectivePhotos {
  photos: EffectivePhoto[];        // en uso en ESTE catálogo, en el orden del CRM, sin duplicados por URL
  all: Array<EffectivePhoto & { excluded: boolean }>; // solo gestión
  openingIndex: number;            // en `photos`; 0 si no hay ninguna
  openingSource: "chosen" | "crm-cover" | "first" | "none";
  stale: { opening: boolean; excluded: number };     // ajustes que ya no aplican (E3-5), solo gestión
}
export function effectivePhotos(item: InternalItem): EffectivePhotos;
export function photoKey(photoId: string): string;   // f
export function photoVersion(u: string): string;     // v
```

**Reglas:**
- **Duplicados por URL** cuentan como una sola foto: la primera en el orden `position, id`. Si se excluye cualquiera de sus filas, se excluye la foto.
- **Apertura (E3-3):** la elegida, si está en uso → la portada del CRM, si está en uso → la primera en uso → ninguna.
- `proxyIdx` es solo informativo. Los índices de apertura, secciones, mosaico, galería y recuentos son de la lista **ya filtrada**.

**Quién la usa** (y nadie más decide qué fotos se ven):

| Consumidor | Hoy | Con E3 |
| --- | --- | --- |
| Lector: apertura, recorrido de E1, mosaico, miniaturas, galería y «N fotos» | `toPublicPhotos` por índice | `effectivePhotos` (`coverIndex` = apertura) |
| Portada del catálogo y tarjeta de la HOME | `coverPhotoOf`: elegida → portada del CRM | elegida en uso → **apertura efectiva de esa vivienda** → apertura efectiva de la primera con fotos → ninguna (E3-3) |
| Diagnósticos de material (E2) | proyección pública | la misma, ya filtrada |
| Vista previa del recorrido (editor de textos) | `property_photos` directo | `textSourceFor(propertyId, catalogId)` con los ajustes del catálogo |
| Filas del gestor (miniatura) | foto 0 por `slug` | apertura efectiva |
| Selector de portada (Diseño) | todas, por índice | solo las fotos en uso, con `src` por clave |

**Privacidad.** El contrato público solo gana `PublicPhoto.key` (= `f`) y el `src` nuevo. Nunca salen el `uuid`, la URL de storage, `photoId` ni `pp`. Lo vigilan los tests del contrato (`FORBIDDEN_PUBLIC_KEYS`, sin UUID, sin URL de storage).

## 5. Datos, gestor y lector

### 5.1 Migración `0202_catalog_photo_prefs.sql`

Va en `BEGIN`/`COMMIT`, como `0196` y `0197`. Es idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`) y se prueba aplicándola dos veces.

**Tabla `catalog_photo_prefs`:**
- columnas `catalog_id`, `property_id`, `photo_id` (sin clave foránea a `property_photos`), `kind` (`exclude` | `opening`), `created_at` y `created_by`;
- clave primaria `(catalog_id, photo_id, kind)`;
- una sola apertura por `(catalog_id, property_id)`;
- RLS activada, `REVOKE` para `public`, `anon` y `authenticated`, y solo `service_role`.

**`catalog_photo_exclude(p_actor, p_catalog, p_property, p_photo, p_exclude boolean)`:**
- guarda de dueño;
- la vivienda tiene que estar en la lista efectiva;
- la foto tiene que ser de la vivienda;
- **E3-1:** no deja la vivienda sin ninguna foto en uso (`last_photo`);
- si se excluye la apertura elegida, borra esa elección;
- sube `catalogs.version`.

**`catalog_photo_opening(p_actor, p_catalog, p_property, p_photo uuid | NULL)`:**
- las mismas guardas;
- **E3-2:** no admite una foto excluida (`photo_excluded`);
- `NULL` vuelve a la apertura automática;
- sube la versión.

**`catalog_item_json`:** cada foto añade `'i', ph.id`, solo en la instantánea **interna**.

**`catalog_internal_snapshot`:**
- añade `pp: {x: [photo_id…], o: photo_id | null}` a cada vivienda que tenga ajustes, solo con fotos que existen (`LEFT JOIN LATERAL`, como en `0197`);
- la portada sigue igual.

**Las funciones nunca escriben** en `property_photos`, `properties`, la clasificación ni ninguna caché.

**Recuperación:**
- `rollback-0202.sql`, que ejecuta una persona:
  - repone `catalog_item_json` y `catalog_internal_snapshot` de `0197`;
  - borra las funciones y la tabla.
- **Se pierden todos los ajustes de fotos.** Antes hay que copiarlos con `\copy … TO … CSV`.
- Las fichas del CRM no se tocan.
- `test-rollback-0202.sql` lo prueba.

**Compatibilidad:**
- **código viejo con el esquema nuevo:** funciona. Ignora `i` y `pp`, así que enseña todas las fotos con los `src` de antes;
- **código nuevo con el esquema viejo:** no se da, porque las migraciones van antes del cambio de versión. Aun así, sin `i` el `src` cae al formato de hoy.

**Fusionar puede desplegar y aplicar `0202`.**

### 5.2 Gestor (dentro de las secciones de E2)

**Contenido, panel de la vivienda: bloque «Fotos en este catálogo».**
- Miniaturas en el orden del CRM, cada una con su estado: «Apertura», «No se usa en este catálogo» o normal.
- Acciones: «Usar como foto de apertura», «No usar en este catálogo», «Volver a usarla» y «Volver a la apertura automática».
- **Confirmaciones:** al excluir la portada del catálogo (E3-7) y al excluir la apertura elegida.
- Un recuento («Se usan 7 de 9 fotos») y un aviso de los ajustes que ya no aplican (E3-5).
- La nota «Estos ajustes no cambian la ficha ni las fotos del CRM». Si una exclusión afecta a la foto de apertura o a la de la portada del catálogo, se explica qué respaldo entra en su lugar (corrección 3).
- **Se guarda al pulsar** (E3-4) con `saved()`: aviso inmediato, vigilante y medición.

**Diseño:** el selector de portada sin las fotos excluidas, con el aviso del respaldo.

**Lo que no cambia:** las salvaguardas de E2 (lo escrito sin guardar, conflictos, IA, publicación), las prioridades de texto de C2/E1, los permisos (dueño de la HOME, como en todo el gestor) y las reglas de selección automática (se sigue exigiendo al menos una foto con el recuento global).

### 5.3 Lector y actualizaciones en vivo

- **Guardar un ajuste** sube la versión y cambia la instantánea. Funcionan D12 y la lectura coherente por versión de K1.
- **La galería abierta se reasigna por `key`** (`applyUpdate`):
  - si la foto que se ve sigue en uso, se queda en ella, en su índice nuevo;
  - si se ha quitado, se queda en la misma posición con el aviso «Esa foto ya no forma parte del catálogo» (o en la última, si era la última);
  - si no queda ninguna, la galería se cierra.
- **La composición de E1** se recalcula con la lista filtrada. Si desaparecen partes, se usa la parte anterior que exista, como siempre.

## 6. Tareas (un commit por tarea, cada una compila con sus consumidores)

| Tarea | Contenido | Archivos | Verificación |
| --- | --- | --- | --- |
| T0 | Aprobación (D-QA19) | este plan, `enmienda-e3.md` | — |
| T1 | **SQL** `0202`, rollback y tests | `supabase/migrations/0202_catalog_photo_prefs.sql`, `rollback-0202.sql`, `scripts/sql/test-catalog-photos-pre.sql`, `test-catalog-photos.sql`, `test-rollback-0202.sql`, escenario «2l» en `test-catalogs-core.sh` | Postgres 16 temporal, resultados escritos a mano; `lint-migrations.py`; 2k, 0196 y 0197 siguen en verde sobre `0202` |
| T2 | **Regla única** | `lib/catalogs/photo-selection.ts`, `scripts/test-catalogs-public.mts` | Casos de §8, escritos a mano |
| T3 | **Proyección pública y portada** | `to-public.ts`, `public-contract.ts` (`PublicPhoto.key`), `material-data.ts` | Contrato y privacidad; índices de E1 tras filtrar; respaldos de la portada |
| T4 | **Proxy `/p` con `f`** | `app/p/[slug]/[idx]/route.ts` + una función pura `pickPhotoByKey` con sus pruebas | La foto servida tras reordenar, empatar, realojar y borrar |
| T5 | **Lector:** galería por clave y aviso | `reader-state.ts`, `catalog-reader.tsx` | Pruebas de `applyUpdate` |
| T6 | **Servidor del gestor** | `actions.ts` (dos acciones con `saved()`), `queries.ts` (fotos del panel, miniaturas, avisos, selector de portada), `texts.ts` (vista previa con el catálogo, con todos sus consumidores), `types.ts`, fixtures (`fixture-store.ts` con `i`/`pp` y versión, `fixture-manager.tsx`) | `tsc` y pruebas puras |
| T7 | **Interfaz del gestor** | `manager/content-section` (panel), `cover-picker`, mensajes | Navegador (T8) |
| T8 | **QA en el navegador, regresiones, rendimiento, compilación y capturas** | Solo los arreglos que salgan | §8 |
| T9 | **Resultado y PR** | `result.md`, `qa-c2/capturas-e3/` | Push, PR y CI en verde. **Se para antes del merge** |

**CI:** las pruebas puras van en `test:catalogs-public` y `test:catalogs-manager`, que ya corren en la CI. La SQL corre en el Postgres temporal y su salida queda en el resultado.

**Recuperación del código:** `git revert` del merge. El esquema de `0202` puede quedarse, porque es compatible con el código viejo. Si hay que quitarlo, `rollback-0202.sql` (§5.1).

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La foto servida no es la elegida | Proxy por clave (`f`), nunca por posición, y pruebas sobre la foto servida |
| Un índice mal reasignado | Una sola función; casos escritos a mano |
| La galería cambia de foto en silencio | Reasignación por `key` y aviso |
| Caché de 24 h con un archivo viejo | `v` en la URL; un `f` sin coincidencia da `404 no-store` |
| Cambio de huella y caché fría una vez al desplegar | Documentado (N2): recargar los enlaces abiertos |
| Rendimiento de la instantánea | `LEFT JOIN LATERAL`; `perf-catalogs.sh` comparado con C2 |
| Reimportar invalida los ajustes | Aviso en el gestor (E3-5) |

## 8. Verificación (resultados escritos a mano, datos 100 % sintéticos)

**Vivienda de prueba** con las fotos A (portada del CRM, posición 0), B (1), C (2), D (2, empate de posición con C) y E (3, la misma URL que B).

**SQL:**
- permisos, RLS e `INVOKER`;
- guarda de dueño, foto ajena y vivienda fuera de la lista;
- E3-1: excluir A, C y D deja B/E; excluir también B da `last_photo`;
- E3-2: elegir de apertura una excluida da `photo_excluded`;
- excluir la apertura elegida la borra;
- la versión sube con cada ajuste;
- `pp` solo con ajustes;
- reordenar y realojar conservan los ajustes;
- reimportar los deja sin aplicar, y el gestor los cuenta como avisos;
- los ajustes se conservan si la vivienda sale de la lista y vuelve;
- ninguna escritura en tablas globales;
- aplicada dos veces, rollback y reaplicación.

**Regla única:**
- apertura elegida → portada del CRM → primera en uso, con su origen;
- E y B cuentan como una;
- los índices filtrados frente a los del proxy;
- la portada del catálogo con sus cuatro casos (E3-3);
- las secciones y el mosaico de E1 con la lista filtrada;
- el material.

**Proxy:**
- `?f=` sirve la misma foto antes y después de reordenar, con C y D empatadas y tras realojar (`v` cambia);
- un `f` borrado da `404 no-store`;
- sin `f`, el comportamiento de hoy.

**Lector:** galería abierta en C, se excluye B → sigue en C; se excluye C → la misma posición con aviso; sin fotos → se cierra.

**Navegador** (copia aislada, escritorio, 362 y 320):
- excluir y elegir la apertura con el lector abierto y con la galería abierta;
- las confirmaciones de E3-7 y de la apertura;
- el aviso de ajustes que ya no aplican;
- la portada y su respaldo;
- que las fotos servidas son las elegidas, comparando las imágenes;
- sin desbordes;
- la medición sintética 20 × 2;
- la matriz de E2 y las regresiones de E1, C1, C2 y K1–K5.

**Rendimiento:** `perf-catalogs.sh` comparado con C2.

**Compilación** en la copia aislada.

## 9. Autorizaciones que necesita la ejecución

1. `npm ci` en el worktree de E3, con el lockfile existente y sin dependencias nuevas.
2. El Postgres 16 temporal (`run-local.sh`, `pg-bcp01`), con las migraciones `0192`–`0197` y `0202` solo ahí.
3. La copia aislada, sin `.env*`, para las fixtures y la compilación.
4. El Chromium en caché. Si faltara, se pregunta.
5. Commits, push de `fabri/bcp-01-e3`, PR y CI. **No** el merge, que puede desplegar y aplicar `0202`.

**Durante toda la ejecución:** ningún acceso a producción, ninguna credencial, ninguna escritura en fichas reales y ninguna llamada real a la IA.

## 10. Decisiones nuevas para Fabricio

- **N1 · Identidad en el proxy general.** Hay dos maneras de servir las fotos del catálogo:
  - **(a, recomendada)** ampliar `/p` con la clave opaca `?f=` y la versión `?v=`, sin cambiar nada cuando no se usan;
  - **(b)** una ruta propia del catálogo, solo para el lector, con el enlace del catálogo. Es más aislada, pero duplica el tratamiento de imágenes (anchos, rangos y caché).
- **N2 · Cambio único al desplegar:**
  - la huella de todos los catálogos y los `src` de sus fotos cambian una vez;
  - los lectores abiertos se actualizan o hay que recargarlos;
  - la caché de imágenes se enfría una vez.
  - Sustituye a la «instantánea idéntica sin ajustes» de la especificación.

## 11. Fase y siguiente paso

- **Fase:** ejecución de E3 aprobada (D-QA19), T0–T9.
- **Siguiente paso:** las tareas en orden, parando antes del merge.
