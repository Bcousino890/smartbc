# BCP-01 · Buscador, conversión e importación: plan

- **Especificación:** [spec.md](spec.md), aprobada por D1, que autoriza ejecutar sin pedir otra aprobación.
- **Estado:** [checklist.md](checklist.md).

## Cómo se trabaja

- **Una rama y un worktree por PR**, creados desde el SHA de `origin/main` del momento (`git ls-remote`). CI en verde.
- **Nunca** se hace push a `main`, ni `--force`, ni merge por parte del agente.
- **Entorno aislado:**
  - copias sin `.env*`, comandos con `env -i` y variables ficticias;
  - un Postgres 16 temporal con `scripts/sql/run-local.sh` (127.0.0.1:54329, datos en el scratchpad);
  - el simulador de PostgREST (`scripts/sim/`);
  - Playwright Chromium con fixtures sintéticas.
- **Instalaciones (P7):** solo `pdfjs-dist`, `tesseract.js`, `tesseract.js-core` y los datos `spa`/`eng`, después de comprobar licencia, versión y procedencia. Cambian `package-lock.json`, así que el VPS ejecutará `npm install` en el despliegue.
- **Cada PR** describe sus efectos de migración y despliegue y trae una lista de QA para Fabricio.

## Entregas en orden de dependencias

| PR | Contenido | Migración | Depende de |
|---|---|---|---|
| **P0** · Expediente | Este expediente y la QA de #325 anotada en el `result.md` del hilo. | — | — |
| **P1** · Controles compartidos | 1. **Primero** se escribe una prueba de caracterización del predicado y de la URL de Propiedades. Para eso, el predicado se saca *tal cual* a `lib/properties/admin-filter.ts`, como función pura.<br>2. Después se crea `components/admin/property-search/*`: `FilterSelect`, `RangeChip`, `SearchBox`, `MoreFiltersToggle`, `ActiveChips` y las opciones.<br>3. Propiedades los importa sin cambiar su comportamiento.<br>4. `TagFilterMenu` pasa a tener `onManage` opcional. | — | P0 |
| **P2** · Motor de búsqueda | `0212`:<br>• `catalog_search(p_actor, p_catalog, p_filters) → jsonb`;<br>• `catalog_add_property` con el máximo de 24;<br>• `catalog_set_operation`.<br>Ampliación de `stub-supabase.sql`.<br>En TS: `lib/catalogs/search-filters.ts` (el modelo, `parse`, la normalización y la URL) y `lib/catalogs/search.ts` (la RPC, el texto y la planta, la paginación y la explicación). Un error nuevo, `catalog_full`. | 0212 | P0 |
| **P3** · Selección explícita | El gestor usa el buscador nuevo en los catálogos manuales y añade el ajuste «Operación del catálogo». El interruptor de modo deja de verse. **El panel de los automáticos antiguos no se toca** hasta P4. Se actualizan las fixtures. | — | P1, P2 |
| **P4** · Conversión | `0213`: `catalog_conversions`, `catalog_conversion_preview` y `catalog_convert_explicit(..., p_expected_version, p_expected_ids)`. En la interfaz, el aviso «Catálogo automático (antiguo)» con «Ver conversión». Un SQL de deshacer, probado. | 0213 | P2, P3 |
| **P5** · Base de la importación | `0214`:<br>• `property_import_drafts`;<br>• las funciones atómicas;<br>• `properties.new_listing_alerts_suppressed`;<br>• el bucket privado.<br>El filtro del cron de alertas.<br>`lib/imports/{drafts,duplicates,photos}.ts` y `lib/net/safe-fetch.ts`.<br>La ruta de subida de fotos del borrador, fuera del matcher del middleware y con su propia guarda. | 0214 | P0 |
| **P6** · Enlace con borrador | La página de importar pasa a usar borradores:<br>• revisión, agencia, duplicados y avisos;<br>• alertas apagadas;<br>• pasos con reintento;<br>• enlaces al terminar;<br>• catálogo opcional y `?catalogo=` con guarda.<br>Se conserva `linkId`/`clienteId`. «Añadir desde enlace» en el catálogo. | — | P3, P5 |
| **P7** · Motor de PDF | Dependencias y una ruta de recursos con lista cerrada. `lib/imports/pdf/*` (extraer, campos, separar, sanear). Fixtures sintéticos generados por un script: digital, escaneado, mixto y varias viviendas. | — | P5 |
| **P8** · Importar PDF | Interfaz de subida, separación y revisión por borrador. Confirmación con el mismo flujo de P6. Entradas desde Propiedades y desde el catálogo. | — | P6, P7 |

- **En paralelo:** P1, P2 y P5 se pueden preparar a la vez. P7 puede empezar cuando esté P5.
- **Números de migración:** se confirman contra `main` al abrir cada PR.
- **PR en espera:** si uno depende de otro que aún no se ha fusionado, se rebasa cuando Fabricio lo fusione.

## Migraciones

Todas siguen las mismas reglas:
- `BEGIN`/`COMMIT` e idempotentes;
- solo `service_role`, `SECURITY INVOKER` y `search_path` fijo;
- `lint-migrations.py` en verde;
- probadas **solo** en el Postgres temporal: dos aplicaciones seguidas, vuelta atrás, concurrencia y el build anterior funcionando con el esquema nuevo.

| Migración | Vuelta atrás | Qué ve el build anterior |
|---|---|---|
| 0212 | Volver a la definición de `catalog_add_property` de 0195 y borrar las funciones nuevas. No se pierden datos. | Funciones que no usa. `catalog_full` solo salta por encima de 24. |
| 0213 | Borrar las funciones. `catalog_conversions` se conserva, porque con ella se puede devolver un catálogo a automático. El SQL de deshacer está documentado y probado. | Nada cambia. |
| 0214 | Borrar la tabla, las funciones y la columna. Los archivos del bucket se vacían por la API de Storage. **Se pierden los borradores pendientes y la marca de supresión de alertas.** | La columna nueva tiene valor por defecto, así que no le afecta. |

**Fusionar un PR con migración equivale a una posible aplicación en producción.**

## Verificación

| Dónde | Qué se comprueba |
|---|---|
| **SQL** (Postgres temporal) | `test-catalog-search.sql`, `test-catalog-conversion.sql` y `test-import-drafts.sql`, dentro de `test-catalogs-core.sh` o junto a él:<br>• cada filtro en sus límites;<br>• más de 2.000 filas;<br>• dueño frente a otro miembro del staff;<br>• máximo de 24;<br>• misma huella y mismas claves al convertir, `selection_changed` y deshacer;<br>• dos sesiones confirmando el mismo borrador a la vez → una sola ficha;<br>• supresión de alertas. |
| **TS** (offline) | • Paridad TS↔SQL de la normalización de filtros.<br>• Caracterización de Propiedades.<br>• Texto y planta.<br>• Duplicados.<br>• Campos del PDF y separación de viviendas. |
| **Rutas** (con el simulador) | • El cron de alertas.<br>• Que nunca se envíe `published_web`.<br>• La guarda de `?catalogo=`.<br>• Las rutas de fotos del borrador, con tipo, tamaño y permiso. |
| **Navegador** (Playwright) | • Gestor: buscar, añadir, ordenar, quitar y llegar a 24.<br>• Conversión con un cambio a mitad.<br>• Importar por enlace y por PDF desde las dos entradas, con doble clic, fallos y reintento.<br>• Regresión del lector, el PDF, E3 y los grupos de la HOME. |
| **Build de producción** | Con variables ficticias, y con `test:api-guards`, `test:api-session-policy`, `test:catalogs*` y `test:public-web` en verde. |

**Con PDF reales:** pendiente hasta que Fabricio pase muestras. No se da por validado antes.
