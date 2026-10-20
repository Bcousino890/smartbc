# BCP-01 · Lector compacto, título y descripción, y opiniones de clientes: plan

**Especificación:** [`spec.md`](spec.md) (DC1–DC20). Se ejecuta dentro de la autorización coordinada del encargo.

## Base y coordinación

- `origin/main` = `dc009960` (merge de #338), comprobado con `git fetch` el 20-10-2026. Última migración 0216; 0217 y 0218 libres (ningún PR abierto las usa).
- **PR A** `fabri/bcp-01-lector-compacto` (worktree `wt/bcp-01-compacto`) desde `main`. **PR B** `fabri/bcp-01-opiniones` desde la rama A; se rebasa sobre `main` cuando A se fusione.
- No se tocan las ramas de buscar/importar ni otros PR abiertos.

## PR A · Lector compacto y título/descripción fiables

| Tarea | Contenido | Verificación |
| --- | --- | --- |
| A1 | `0217_catalog_text_title.sql` y `rollback-0217.sql` | `test-catalog-title.sql` en el Postgres temporal: aplicada dos veces, título solo, publicar, recarga, otro catálogo y ficha intactos, cambio de la ficha no lo retira, bloqueos, conflicto de revisión, reversión y reaplicación; cadena 0192–0216 sigue en verde |
| A2 | `editorial.ts`: `copy` (la descripción completa en bloques, DC3) | `test:catalogs-public` |
| A3 | Contrato público: `copy` sustituye a `lead`, `highlights`, `sections`, `mosaic` y `description` | tests del contrato y de privacidad |
| A4 | `reader-state.ts`: partes `open` y `detail` en las dos composiciones; se retira `journey-layout.ts` | tests D12 y de partes |
| A5 | Lector: Apertura con miniaturas; Detalle con ficha, características y descripción desplazable | capturas, teclado, reducir movimiento, fotos excluidas, en vivo |
| A6 | PDF compacto (`plan.ts`, `document.ts`, verificación) | `check-catalog-pdfs.mts` |
| A7 | Gestor: Título y Descripción; «Más opciones» con entrada y puntos; IA con título; textos de estado | `test:catalogs-manager`; prueba del título solo con el almacén de borradores |
| A8 | Fixtures: título propio en un catálogo y no en otro | lector y PDF de fixtures |
| A9 | Resultado, capturas y PR | CI |

## PR B · Asignaciones, opiniones y avisos

| Tarea | Contenido | Verificación |
| --- | --- | --- |
| B1 | `0218_catalog_client_feedback.sql` y `rollback-0218.sql`: `catalog_client_links` (token propio, caducidad, revocación, una activa por catálogo y cliente), `catalog_feedback` (por asignación y vivienda), funciones de dueño (crear, renovar, revocar, listar), lectura pública ampliada a enlaces personales, escritura de opinión por token con validación, idempotencia y aviso en `crm_notifications` | `test-catalog-feedback.sql`: dos clientes, reintento, edición, reorden, vivienda retirada, caducado, revocado, enlace general sin opinión, aviso único, reversión |
| B2 | Rutas públicas `GET/POST /api/seleccion/[token]/opiniones` con límite y validación | pruebas de la capa pura |
| B3 | Lector: «Tu opinión» en la pantalla 2, solo con enlace personal | capturas y QA |
| B4 | Compartir: «Asignar a cliente» (buscador de clientes con permisos y alcance), lista de enlaces personales | `test:catalogs-manager` |
| B5 | Ficha del cliente: tarjeta y bloque «Opiniones de catálogos» con permisos | prueba de lectura con alcance |
| B6 | Campana: avisos de opinión desde `crm_notifications` y marcar como leído; Captaciones no los cuenta | prueba de la ruta |
| B7 | Resultado y PR | CI |

## Pasos de entorno

Worktrees desde `origin/main`; `node_modules` clonado de un worktree con el mismo lockfile; Postgres 16 temporal (`scripts/sql/run-local.sh`, `BCP_PG_DIR=<scratchpad>/pg-bcp01`); servidor de fixtures (`scripts/dev-fixtures.sh`) y Chromium de Playwright en caché. Sin producción, credenciales, escrituras reales, IA real ni servicios de pago.
