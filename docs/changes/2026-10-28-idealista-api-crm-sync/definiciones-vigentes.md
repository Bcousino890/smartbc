# Definiciones vigentes que sustituyen 0232 y 0233

Comprobado en `9356300a` (las migraciones se aplican por orden de nombre; vale la última).

| Objeto | Definición vigente | Lo que hace 0232/0233 |
|---|---|---|
| `catalog_candidates(jsonb, boolean, text)` | `0195_catalog_selection.sql:380` (única definición) | 0232 la redefine añadiendo solo `AND NOT p.reference_only` (comprobado con `diff`: una línea). md5 de `prosrc` antes `6d3a0e5952ba363f44136eca0781ff0b`, después `01e71e7d6e251918be0d6a759b82ad98`. |
| Política `properties_auth_select` | `0001_init.sql:330` | 0232 la recrea con `AND NOT reference_only`. |
| Política `property_photos_select` | `0001_init.sql:335` | 0232 la recrea con `AND NOT p.reference_only` (el personal sigue igual). |
| CHECK `properties_archived_reason_chk` | `0215_portal_link_watch.sql:55` | 0232 añade `idealista_api_withdrawn` e `idealista_crm_containment`. |
| CHECK `property_media_source_check` | `0115_property_videos.sql:76` | 0232 añade `idealista_ref`. |

Funciones de catálogo que **no** se redefinen, y por qué no hace falta:

| Función | Última definición | Por qué basta con los triggers |
|---|---|---|
| `catalog_add_property` | `0222_catalog_area_texts.sql` | Inserta en `catalog_items`, que rechaza fichas de referencia. |
| `catalog_adjust` / `catalog_available_inclusions` | `0196_catalog_adjustments.sql` | Los ajustes `include` se rechazan en `catalog_adjustments`. |
| `catalog_effective_ids` / `catalog_select` | `0196_catalog_adjustments.sql` | Automático = `catalog_candidates` + inclusiones; manual = `catalog_items`. |
| `catalog_internal_snapshot` | `0227_catalog_photo_finish.sql` | Lee lo que dan las anteriores. |
| `catalog_property_search` | `0212_catalog_search.sql` | Buscador del personal; añadir la ficha falla en `catalog_items`. |

La comprobación previa al merge (`scripts/sql/idealista-crm-sync-premerge.sql`) compara en producción estas definiciones con las del repositorio antes de fusionar.
