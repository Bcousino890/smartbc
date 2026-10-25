# CRM-03 · Propiedades: columnas explícitas, respuesta al abrir y volver, y ficha más rápida

Tres mejoras medianas sobre la lista y la ficha de Propiedades, en PR pequeños e independientes, con paridad funcional y mediciones antes/después comparables.

- **Tamaño:** medio (aprobado por Fabricio, 2026-10-25).
- **Responsable:** Fabricio
- **Rama:** una por PR, desde el `main` remoto vigente.
- **Estado:** plan aprobado (2026-10-25). Base: `main` `a604f260` (incluye #375).

## Especificación

### Contexto

Viene de CRM-02 (`docs/changes/2026-10-24-crm-02-rendimiento/`, cerrado). Todas las cifras son **locales**: build de producción contra el simulador con 1.700 propiedades sintéticas. «40 ms» es latencia **simulada** por consulta; «móvil», CPU 4× más lenta y red limitada, **simuladas**. El rendimiento en producción no se ha medido.

**Consultas por navegación, separando identidad y permisos de datos** (petición aislada, E0):

| Navegación | Total | Identidad y permisos¹ | Datos |
|---|---|---|---|
| Menú → Propiedades (lista) | 9 | 5 | 4: `properties`, `agencies`, `property_tags`, `property_tag_links` |
| Lista → ficha de propiedad | 13 | 8 | 5: `properties`, `property_media`, `property_shares`, `property_tags`, `property_tag_links` |

¹ `getUser` (auth), `profiles`, `profiles_country_roles` y `user_permission_overrides`: middleware, `guardPage` y `getCurrentProfile`.

**Ninguna de las tres mejoras toca esa parte.** Las ganancias posibles salen solo de las consultas de datos, de su encadenamiento y de lo que pesan. Reducir la parte de identidad y permisos es otro trabajo, grande o sensible (D5 de CRM-02), y queda fuera.

**Lo que hoy pasa en cada punto** (comprobado en `main` `a4997ccb`):

- **A · Columnas de la lista.**
  - `getProperties` pide `select("*, agencies(name, slug), property_photos(url, is_cover, position)")` (`lib/db/queries/properties.ts:9`), hasta 2.000 filas.
  - La usan la lista del admin y la página de propiedades del portal cliente (`app/(cliente)/propiedades/page.tsx`).
  - El adaptador de la lista (`propertyRowToAdminProperty`) lee: `id`, `slug`, `external_id`, `bc_reference`, `property_reference`, `title`, `description`, `features`, `features_manual`, `floor_override`, `zone`, `subzone`, `operation`, `operations`, `stay`, `status`, `bedrooms`, `bathrooms`, `square_meters`, `price`, `currency`, `created_at` y `cover_photo_url`, más `agencies(name, slug)` y `property_photos(url, is_cover, position)`.
  - `description`, `features` y `features_manual` se necesitan para deducir la planta (`resolveFloor`): no se pueden quitar sin cambiar resultados.
  - `currency`, `property_reference` y `floor_override` no figuran en `database.types.ts`, pero sí en migraciones (0020, 0047 y 0146).
- **B · Abrir y volver.**
  - Lista → ficha (enlace del título y «Editar») y ficha → «Volver al listado» son `Link` internos sin ninguna señal: con 40 ms simulados pasan ~630 ms y ~510 ms sin que nada cambie en pantalla.
  - E2 solo cubre la sidebar.
  - El contrato de CRM-01 (`?volver=`, ancla y resalte de la fila de origen, pestaña nueva y salida segura) debe seguir intacto.
- **C · Ficha.** `app/[country]/(admin)/admin/propiedades/[slug]/page.tsx` encadena, una detrás de otra:
  1. `guardPage`;
  2. la propiedad con fotos y agencia;
  3. `property_media`;
  4. `property_shares`, y `property_share_opens` si hay enlaces;
  5. `property_tags` del país;
  6. **todos** los enlaces de etiquetas de todas las etiquetas del país (`getTagLinksByProperty`, páginas de 1.000, en serie), solo para quedarse con los de esta propiedad.

  Son 5-6 saltos de datos en serie; en producción, más si hay más de 1.000 enlaces de etiquetas.

**Límite de 2.000 propiedades (sin resolver).** La lista del admin pide como mucho 2.000 filas por país, o archivadas incluidas con «Ver archivadas». No se sabe cuánto margen queda: el último recuento conocido (1.632, del 2026-10-13) no distingue país ni archivadas. Si se supera, **la lista se corta sin avisar**. Este plan no cambia el tope. Se pide el recuento a una persona autorizada (ver el final) y, según el resultado, se decidirá aparte (aviso visible, tope mayor o paginación en servidor, que necesita su propia especificación).

### Decisiones

- `D1 (2026-10-25)`: Fabricio aprueba CRM-03 como trabajo **medio**, con P1-P4 tal como están abajo y el orden **C → B → A**.
- `D2 (2026-10-25)`: una observación de control de acceso surgida al planificar se **investiga aparte**, con lectura de código y pruebas sintéticas. Sus hallazgos y cualquier corrección van en un plan propio, fuera de este repositorio público, y no forman parte de CRM-03. Esto **no** autoriza cambios de permisos ni acceso a producción.
- `D3 (2026-10-25)`: el merge de PR-A sigue bloqueado hasta que la persona autorizada valide el esquema con la consulta del final. C y B pueden avanzar.

Propuestas aprobadas en D1:

- `P1`: **A** crea una consulta propia para la lista del admin (`getAdminPropertyList`) con la lista explícita de columnas. `getProperties` **no cambia**, porque la usa también el portal cliente.
- `P2`: **A** mantiene `description`, `features` y `features_manual` en la lista (deducción de la planta) y las fotos completas (recuento sin repetidos y portada de respaldo). Lo que se quita son las columnas que la lista no usa: direcciones, datos del propietario, notas internas, coordenadas, `building_features`, `source_url`, `title_rent`, `rent_price`, etc.
- `P3`: **B** usa el mismo mecanismo que E2 (D6): `useLinkStatus` dentro del `Link`, con el esqueleto superpuesto encima del contenido. **Sin `loading.tsx`**, que impone la espera mínima de ~800 ms medida en CRM-02. Esqueleto de ficha al abrir desde la lista; esqueleto de lista al pulsar «Volver».
- `P4`: **C** mantiene `guardPage` **antes** de cualquier lectura de datos. Solo se paraleliza lo que viene después, y las etiquetas de la ficha se leen por propiedad.
- **Resultados y errores de los demás usos:** al separar `getPropertyBySlugForAdmin`, la ficha, la story (`[slug]/story/page.tsx`) y el PDF (`/api/admin/properties/[slug]/pdf`) deben devolver lo mismo que hoy y fallar igual: propiedad inexistente → `null` (404 o lo que haga cada uno); error de la consulta de la propiedad → la misma excepción; error de los medios → hoy se ignora (`media ?? []`) y se sigue ignorando.

### Alcance

**PR-A · Columnas explícitas en la lista** (completa el alcance aplazado de E1)
- `getAdminPropertyList(filters, limit)` con `ADMIN_LIST_COLUMNS`; la página de la lista la usa en lugar de `getProperties`.
- Paridad pura: para filas sintéticas completas, el adaptador da exactamente lo mismo con la fila entera que con la fila reducida a `ADMIN_LIST_COLUMNS`. Así se demuestra que el adaptador no lee nada que falte. Los filtros, la búsqueda, los totales y las opciones devuelven lo mismo.
- Comprobación estática: cada columna de `ADMIN_LIST_COLUMNS` existe en `database.types.ts` o se añade en alguna migración.
- **Validación contra el esquema real antes del merge:** la consulta de solo lectura del final usa exactamente esas columnas. Si alguna no existe en producción, falla y se sabe antes de fusionar.
- Simulador: registrar también los bytes de cada respuesta. Es lo que **viaja serializado** (JSON de PostgREST) de la base de datos a Next con los datos sintéticos (ver «Límites»).

**PR-B · Respuesta inmediata al abrir una ficha y al volver**
- Generalizar `NavPendingMark` (E2) en un componente de «pendiente» reutilizable dentro de cualquier `Link`, con el esqueleto que se le pase. El de la sidebar no cambia de comportamiento.
- Usarlo en el título y en «Editar» de cada fila (esqueleto de ficha) y en «Volver al listado» de la ficha (esqueleto de lista).
- El enlace a la story (`<a>`, carga completa) y el borrado (`router.replace`) no cambian.
- Contrato de CRM-01 intacto. El arnés lo comprueba en R1-R4, R8 y R9: `?volver=`, la página, el ancla y el resalte de la fila, la pestaña nueva y la entrada directa.
- **Recorrido nuevo del arnés** con el esqueleto activo:
  - **navegación cancelada:** pulsar una ficha y, antes de que llegue, pulsar otra o «Volver»; gana el último destino y no queda ningún esqueleto colgado;
  - **navegación fallida:** respuesta de la ficha forzada a error; el esqueleto desaparece, sin pantalla bloqueada;
  - **Cmd/Ctrl+clic:** abre pestaña nueva sin esqueleto en la pestaña actual;
  - **con filtros y página 2:** abrir y volver conserva filtros, página, ancla y resalte.

**PR-C · Ficha más rápida**
- `getPropertyBySlugForAdmin` se separa en «propiedad» y «medios» sin cambiar su resultado para sus otros dos usos (PDF y story).
- En la ficha:
  1. `guardPage`;
  2. en paralelo, la propiedad y las etiquetas del país;
  3. en paralelo, los medios, los enlaces (y sus aperturas) y las etiquetas de **esta** propiedad.
- `getTagIdsForProperty(propertyId)` pide `property_tag_links?property_id=eq.…`. Se cruza con las etiquetas del país, igual que hoy. Es una consulta PostgREST existente con otro filtro: **no hay SQL ni migración**.
- Mismo comportamiento ante errores: si una lectura fallaba y lanzaba antes, sigue lanzando.

### Fuera de alcance

- Identidad y permisos: la segunda llamada a `getUser()` del middleware, memoizar `getCurrentProfile` o los permisos, cachés de identidad.
- SQL nuevo, RPC, índices y migraciones.
- El tope de 2.000 y la paginación en servidor.
- Cambiar la regla de recuento de fotos o la deducción de la planta.
- Control de acceso: no se toca aquí (ver D2).

### Criterios de aceptación

Se mide con el arnés de CRM-01/CRM-02, en builds equivalentes (copia aislada sin `.env`). La línea base de `main` se mide **en la misma sesión** que cada PR: 3 pasadas por variante (escritorio, 40 ms y móvil), en frío y en caliente, con mediana y dispersión. Cifras locales o simuladas, nunca de producción.

| # | Criterio | Línea base (E0, local) | Objetivo |
|---|---|---|---|
| AC1 | Contrato de navegación (CRM-01 + R10-R12) | 38/38 · 36/36 | igual, en todos los PR |
| AC2 | **A:** paridad del adaptador con fila completa y fila proyectada; filtros, búsqueda, totales, opciones y selección | — | cero diferencias |
| AC3 | **A:** bytes de la respuesta JSON de la base de datos a Next para la lista (sintético, medido en el simulador) | medido en PR-A | baja. En producción solo se conoce el **tamaño almacenado** por fila (ver «Límites»), no el tráfico real |
| AC4 | **A:** consultas de la lista | 9 (5 de identidad y permisos + 4 de datos) | ≤ 9; la parte de identidad y permisos, igual |
| AC5 | **A:** RSC al navegador | 879 KB | igual (no es el objetivo de A) |
| AC6 | **B:** primer indicador en lista → ficha y en «Volver» (40 ms) | ninguno | ≤ 100 ms |
| AC7 | **B:** contenido útil en lista → ficha y «Volver» | ~630 / ~510 ms (40 ms) | no empeora más de un 10 % |
| AC8 | **C:** saltos de datos en serie en la ficha | 5 (o 6 con aperturas) | ≤ 3 |
| AC9 | **C:** consultas de la ficha | 13 (8 + 5) | identidad y permisos igual (8); datos ≤ 5; enlaces de etiquetas siempre 1 lectura, sin paginar |
| AC10 | **C:** contenido útil en lista → ficha (40 ms) | ~630 ms | baja; estimado ~80-120 ms (2-3 saltos de 40 ms simulados) |
| AC11 | **C:** paridad de la ficha | — | mismas etiquetas, enlaces, aperturas y medios en la ficha sintética (arnés) y test puro del cruce de etiquetas |
| AC12 | Todos | — | `tsc`, los tests de CI (regresiones de identidad de #361 incluidas), build y CI en verde; claro/oscuro con capturas en B; sin cambios de sesión ni permisos |

**Estimación de C, explicada.** Hoy los datos de la ficha esperan 5 viajes en serie. Con el cambio son 2-3 (la propiedad y las etiquetas en paralelo; después medios, enlaces y etiquetas de la ficha en paralelo). Con 40 ms simulados eso son ~80-120 ms menos sobre ~630 ms. La parte de identidad y permisos (8 consultas, en buena parte en serie) no cambia y fija un suelo. En producción también se evita leer todos los enlaces de etiquetas del país, que crece con su número. La cifra real depende de la latencia real, que no se ha medido.

### Impacto en datos y despliegue

Sin migraciones ni datos reales. Las consultas siguen siendo lecturas PostgREST. Un merge a `main` despliega.

## Plan

**Entregas** (PR pequeños e independientes, cada uno contra `main` con su CI; ninguno se fusiona sin Fabricio):

| PR | Contenido | Depende de |
|---|---|---|
| CRM-03c · ficha | C | — |
| CRM-03b · abrir y volver | B | — (toca la lista y la ficha en otras líneas que C) |
| CRM-03a · columnas | A | la consulta autorizada del final, que valida el esquema real y da los bytes |

Orden propuesto: C, B y A. A espera a la consulta autorizada para no fusionar columnas sin contrastarlas con producción. Si llegan conflictos (en el expediente o en `properties.ts`), se rebasa.

**Cada PR:** worktree desde el `main` vigente; código y test; pasos de CI en local; medición en copia aislada (base de `main` y rama, en la misma sesión, con `caffeinate` y el Mac abierto y enchufado); capturas en claro y oscuro si hay cambio visual; un commit de código y otro de resultado en este expediente; PR; CI; parada antes del merge.

**Límites de la medición:**
- **Dos medidas distintas para A, que no se mezclan:**
  - **Bytes serializados** (JSON de PostgREST que llega a Next): solo se miden en el simulador, con datos sintéticos que no tienen el ancho real de notas, direcciones, etc.
  - **Tamaño almacenado** por fila (`pg_column_size` de la consulta autorizada): da una proporción orientativa entre la fila entera y las columnas de la lista en los datos reales. **No es tráfico de red**: el JSON tiene otra codificación (nombres de clave, comillas, números en texto, arrays) y su tamaño no coincide con el almacenado.
  - La reducción real del tráfico en producción quedará **sin medir** salvo que alguien la mida allí.
- Ninguna mejora de tiempo se presentará como de producción.

## Resultado · PR-C (ficha)

Medido el 2026-10-25 en la misma sesión: `main` `a604f260` (base) frente a la rama (`2997bb93`, el código de la ficha). Copias aisladas sin `.env`, 3 pasadas por variante, en frío y en caliente; mediana (mín–máx). **Todo es local o simulado: no son tiempos de producción.** Los datos sintéticos y el arnés son los de esta rama para los dos builds (`FIXTURE_GEN`/`HARNESS`), así que la base y la rama se miden con lo mismo.

**Contenido útil en lista → ficha (ms):**

| Variante | Recorrido | Base frío | Rama frío | Base caliente | Rama caliente |
|---|---|---|---|---|---|
| 40 ms simulados | R1 (filtros y página 2) | 654 (649–672) | **536** (523–546) | 662 (648–681) | **530** (506–535) |
| 40 ms simulados | R2 | 656 (628–656) | **520** (519–525) | 656 (639–678) | **539** (508–540) |
| escritorio | R1 | 120 (106–130) | 116 (109–123) | 115 (105–115) | 95 (90–100) |
| escritorio | R2 | 74 (58–76) | 70 (62–73) | 77 (76–84) | 68 (64–69) |
| móvil (CPU y red simuladas) | R1 | 608 (598–613) | 592 (591–598) | 593 (589–613) | 588 (587–590) |
| móvil | R2 | 561 (561–606) | 560 (548–592) | 562 (557–628) | 548 (548–557) |

- Con 40 ms por consulta se ahorran ~120 ms: los tres viajes en serie que desaparecen. Sin latencia, y en móvil (donde manda la red simulada del navegador, no la de la base de datos), la diferencia está dentro del ruido. Que la mejora real en producción sea mayor o menor depende de la latencia real, que no se ha medido.
- «Volver», la lista y el resto de recorridos no cambian (dentro del ruido).

| # | Criterio | Resultado |
|---|---|---|
| AC1 | Contrato de navegación | 42/42 (escritorio y 40 ms) y 40/40 (móvil) en las 36 corridas, base y rama |
| AC8 | Saltos de datos en serie | 6 → 3: (propiedad ‖ etiquetas del país) → (medios ‖ SmartLinks ‖ etiquetas de la ficha) → aperturas, solo si hay SmartLinks. Con 40 ms simulados, el ahorro medido (~120 ms) cuadra con 3 saltos |
| AC9 | Consultas de la ficha | 13 → 13: identidad y permisos 8 (igual); datos 5 (`properties`, `property_media`, `property_shares`, `property_tags`, `property_tag_links`). Los enlaces de etiquetas pasan a una lectura por `property_id`, sin paginar el país |
| AC10 | Contenido útil lista → ficha (40 ms) | 654 → 536 ms (R1) y 656 → 520 ms (R2), en frío |
| AC11 | Paridad de la ficha | ver abajo; y `test-admin-property-detail-tags` (cruce con el catálogo del país, igual que el mapa completo anterior) |
| AC12 | CI | `tsc`, tests y build en local; CI del PR |

**Paridad de texto (R13).** Se compara el texto completo de 6 fichas sintéticas (con y sin etiquetas, con etiquetas de `cl` que no deben salir, con y sin SmartLinks, aperturas, vídeo y plano) entre base y rama, en las 18 pasadas de cada una: 108 comparaciones.
- 88 idénticas.
- 20 difieren **solo** en marcas de tiempo relativas («Hace 212 h» → «Hace 213 h», 30 líneas en total): la última apertura de un SmartLink se pinta relativa a la hora actual y la base se midió antes. La comparación acepta únicamente líneas `Hace N min|h|d` en las dos versiones; cualquier otra diferencia contaría como fallo.
- 0 diferencias de otro tipo.

**Story, PDF y errores.** Mismo estado y tipo de respuesta en base y rama (una pasada adicional de cada build):

| Petición | Base | Rama |
|---|---|---|
| Ficha que existe / que no | 200 html / 404 html | 200 html / 404 html |
| Story que existe / que no | 200 html / 404 html | 200 html / 404 html |
| PDF que existe / que no | 200 pdf / 404 json | 200 pdf / 404 json |

Los errores de la base de datos no se pueden provocar en el simulador. Se conservan por construcción: la lectura de la propiedad sigue lanzando su error (antes y ahora); los medios siguen ignorando el suyo (lista vacía); los SmartLinks siguen lanzando; las etiquetas del país y de la ficha siguen fallando en vacío. La story y el PDF usan `getPropertyBySlugForAdmin`, que ahora se compone de las dos piezas nuevas en el mismo orden y devuelve el mismo objeto.

## Consulta de solo lectura para la persona autorizada

No bloquea C ni B; **sí bloquea el merge de A**. Claude no accede a producción ni pide credenciales. El resultado son solo agregados por país, sin datos personales.

```sql
BEGIN TRANSACTION READ ONLY;

-- 1) Margen frente al tope de 2.000 de la lista (por país).
SELECT country,
       count(*) FILTER (WHERE archived_at IS NULL)     AS sin_archivar,   -- lista por defecto
       count(*) FILTER (WHERE archived_at IS NOT NULL) AS archivadas,
       count(*)                                        AS total           -- con «Ver archivadas»
FROM public.properties
GROUP BY country
ORDER BY country;

-- 2) Tamaño ALMACENADO medio por fila (pg_column_size): fila entera frente a
--    las columnas de la lista (PR-A). Es orientativo: NO es el tamaño del JSON
--    que viaja por la red.
--    Si alguna columna no existe en producción, esta consulta falla: basta con
--    devolver el mensaje de error, que dice cuál.
SELECT country,
       round(avg(pg_column_size(p.*))) AS bytes_fila_completa,
       round(avg(pg_column_size(ROW(
         p.id, p.slug, p.external_id, p.bc_reference, p.property_reference, p.title,
         p.description, p.features, p.features_manual, p.floor_override, p.zone,
         p.subzone, p.operation, p.operations, p.stay, p.status, p.bedrooms,
         p.bathrooms, p.square_meters, p.price, p.currency, p.created_at,
         p.cover_photo_url
       )))) AS bytes_fila_lista
FROM public.properties p
WHERE p.archived_at IS NULL
GROUP BY country
ORDER BY country;

ROLLBACK;
```
