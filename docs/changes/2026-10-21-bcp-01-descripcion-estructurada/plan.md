# BCP-01 · Descripción estructurada: plan

**Especificación:** [`spec.md`](spec.md). Rama `fabri/bcp-01-descripcion-estructurada` (worktree `wt/bcp-01-estructura`) desde `origin/main` = `e9504eda` (ya con 0217 y 0218).

| Tarea | Contenido | Verificación |
| --- | --- | --- |
| S1 | `lib/catalogs/structure.ts`: temas, palabras clave y sinónimos, clasificación por frase con contexto (DE3), títulos del autor (DE6), capítulos de historia (DE7), introducción (DE4), zona (DE9); devuelve `copy` y las partes sin material | `scripts/test-catalogs-structure.mts` (nuevo en la CI): casos de DE3–DE9, negaciones, tildes, frases mixtas, sin pérdidas ni repeticiones, texto largo |
| S2 | `editorial.ts`: los tres niveles pasan por el organizador; `Editorial.missing` | `test:catalogs-public` adaptado (DC3) |
| S3 | Editor: `area` en `CatalogTextView`; vista previa organizada en vivo y aviso de partes sin material; instrucción de la IA (DE11) | `test:catalogs-manager`, IA simulada, QA en fixtures |
| S4 | Lector y PDF sin cambios de código; verificación de PDF con los bloques nuevos | `check-catalog-pdfs.mts`, QA en Chromium (escritorio y móvil), capturas |
| S5 | Resultado, capturas y PR | todas las suites de la CI, `tsc`, `next build` |

Entorno: fixtures sintéticos, IA simulada, sin producción ni escrituras reales. Pendientes que se conservan: G-ALQ, Recoletos, D13 y PDF representativo.
