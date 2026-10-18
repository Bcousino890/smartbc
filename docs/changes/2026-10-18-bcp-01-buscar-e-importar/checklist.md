# BCP-01 · Buscador, conversión e importación: estado

Se actualiza en cada PR. Leyenda:
- ✅ hecho y verificado;
- 🟡 en curso o con PR abierto;
- ⬜ pendiente;
- ⛔ bloqueado, con su motivo.

## Entregas

| PR | Estado | Rama / PR | Nota |
|---|---|---|---|
| P0 · Expediente | 🟡 | #326 | — |
| P1 · Controles compartidos | 🟡 | #327 | Caracterización 31/31 (también contra el código original); navegador: DOM y estado idénticos a `main` |
| P2 · Motor de búsqueda (0212) | 🟡 | #328 | SQL 86, paridad 400 + 14, TS 50, concurrencia del máximo |
| P3 · Selección explícita | ⬜ | — | Depende de P1 y P2 |
| P4 · Conversión de automáticos (0213) | ⬜ | — | Depende de P2 y P3 |
| P5 · Base de la importación (0214) | 🟡 | #329 | SQL 82, flujo de punta a punta 47, TS 68, build de producción |
| P6 · Importar por enlace con borrador | ⬜ | — | Depende de P3 y P5 |
| P7 · Motor de extracción de PDF | ⬜ | — | Depende de P5 |
| P8 · Importar desde PDF | ⬜ | — | Depende de P6 y P7 |

## Pruebas que se exigen al terminar

| Evidencia | Estado |
|---|---|
| Buscador: filtros en sus límites, paginación y más de 2.000 fichas | ⬜ |
| Selección explícita y máximo de 24 | ⬜ |
| Conversión segura de automáticos, recarga si algo cambió y deshacer | ⬜ |
| Importar desde Propiedades y desde el catálogo, con los permisos del staff | ⬜ |
| Borrador privado, sin publicar en la web y sin correos | ⬜ |
| Duplicados, reintentos y fallos a medias | ⬜ |
| Enlaces correctos y alta opcional en un catálogo | ⬜ |
| PDF: fixtures sintéticos | ⬜ |
| PDF: **muestras reales** | ⛔ esperando muestras de Fabricio |
| Regresión del lector, el PDF del catálogo, E3 y los grupos de la HOME | ⬜ |

## Sigue abierto (no lo cierra esta tanda, D4)

- **G-ALQ:** pendiente de su prueba concreta.
- **El diagnóstico original de Recoletos:** las pruebas del buscador nuevo **no** lo demuestran.
- **D13 en vivo:** sin medir en producción.
- **Validación con PDF representativos:** pendiente de muestras.

## Para que decida Fabricio aparte (no bloquea)

- `importPortalLink` (enlaces de cliente) sigue creando fichas disponibles, sin revisión y con alertas (I-20).
- `updateProperty` no comprueba `properties.publish`, así que agent_senior puede publicar en la web.
- La RLS de `property_shares` impide a advisor y agent_senior crear enlaces `/c`.
