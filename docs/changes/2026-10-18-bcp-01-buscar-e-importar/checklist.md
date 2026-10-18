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
| P3 · Selección explícita | 🟡 | #330 | Navegador: buscar → añadir → máximo de 24 → ordenar y quitar → operación; los automáticos conservan su panel |
| P4 · Conversión de automáticos (0213) | 🟡 | #331 | SQL 30, concurrencia, deshacer y vuelta atrás; navegador: vista previa → cambio entre medias → recarga → convertir |
| P5 · Base de la importación (0214) | 🟡 | #329 | SQL 82, flujo de punta a punta 47, TS 68, build de producción |
| P6 · Importar por enlace con borrador | 🟡 | #332 | Navegador 32/32 (doble clic, fallo y reintento, duplicado, HTML pegado, cliente y catálogo); flujo SQL 50 |
| P7 · Motor de extracción de PDF | 🟡 | #333 | Node 27/27 con OCR real sobre 4 PDF sintéticos; navegador 16/16 sin CDN; licencias en `dependencias-pdf.md` |
| P8 · Importar desde PDF | 🟡 | #334 | Navegador 25/25 (separar, recortar, un borrador por vivienda, reintento de fotos, revisión); flujo SQL 53 |

## Pruebas que se exigen al terminar

| Evidencia | Estado |
|---|---|
| Buscador: filtros en sus límites, paginación y más de 2.000 fichas | 🟡 SQL, TS y navegador en verde (P2/P3); falta la QA en producción |
| Selección explícita y máximo de 24 | 🟡 SQL con concurrencia y navegador en verde (P2/P3); falta la QA en producción |
| Conversión segura de automáticos, recarga si algo cambió y deshacer | 🟡 SQL (deshacer y vuelta atrás) y navegador en verde (P4); falta la QA en producción |
| Importar desde Propiedades y desde el catálogo, con los permisos del staff | 🟡 permiso `properties.create` en páginas, acciones y rutas; dueño de la HOME comprobado en el servidor (P5–P8); falta la QA con usuarios reales |
| Borrador privado, sin publicar en la web y sin correos | 🟡 forzado en SQL y comprobado en el flujo y en el cron (P5); falta la QA en producción |
| Duplicados, reintentos y fallos a medias | 🟡 SQL (dos confirmaciones a la vez → una ficha), flujo y navegador (P5/P6/P8) |
| Enlaces correctos y alta opcional en un catálogo | 🟡 flujo y navegador (P6/P8); falta la QA en producción |
| PDF: fixtures sintéticos | ✅ digital, escaneado, mixto y varias viviendas, en Node (OCR real) y en Chromium (P7/P8) |
| PDF: **muestras reales** | ⛔ esperando muestras de Fabricio |
| Regresión del lector, el PDF del catálogo, E3 y los grupos de la HOME | 🟡 `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager` en verde en cada PR; sin recorrido nuevo del lector en navegador en esta tanda |

## Orden de fusión y migraciones

- **Orden:** #326 → #327 y #328 → #330 → #331 → #329 → #332 → #333 → #334. Las ramas apiladas se rebasan cuando se fusiona la anterior.
- **Migraciones:** 0212 (#328), 0213 (#331) y 0214 (#329). Cada PR explica su efecto y cómo volver atrás.
- **Dependencias de npm:** #333 cambia `package-lock.json` (pdf.js, tesseract.js y los datos `spa`/`eng`), así que el VPS hará `npm install`.

## Sigue abierto (no lo cierra esta tanda, D4)

- **G-ALQ:** pendiente de su prueba concreta.
- **El diagnóstico original de Recoletos:** las pruebas del buscador nuevo **no** lo demuestran.
- **D13 en vivo:** sin medir en producción.
- **Validación con PDF representativos:** pendiente de muestras.

## Para que decida Fabricio aparte (no bloquea)

- `importPortalLink` (enlaces de cliente) sigue creando fichas disponibles, sin revisión y con alertas (I-20).
- `updateProperty` no comprueba `properties.publish`, así que agent_senior puede publicar en la web.
- La RLS de `property_shares` impide a advisor y agent_senior crear enlaces `/c`.
