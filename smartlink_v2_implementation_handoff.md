# SMARTLINK 2.0 — BCP LUXURY PROPERTY EXPERIENCE COMPLETE
## Handoff de implementación · 2026-08-21 · desplegado en producción (`760038a`)

> **FIRST APPROVED PRODUCTION PROPERTY STORY** · BC-1416 ("Vivienda única de diseño en el corazón de Almagro") · **Engine v4** (baseline cerrado: dedupe por hecho, planta contextual, un bloque por capítulo, claim ownership, preservación de entidades) · **6 approved chapters** (Salón y luz · Cocina y comedor · Zona privada · Acabados y confort [solo-texto] · La finca [fachada #45] · Vivir en Almagro) · **1 intentionally rejected weak intro** · **0 conflicts** · 43 claims con cita literal (25 usados, 11 duplicados retirados, 2 boilerplate descartados) · fotos 47/47 clasificadas (caché, 0 re-llamadas) · floor=null (inferencia errónea de "planta baja del trastero" corregida con regla contextual) · subzone=Almagro verificada · smoke QA en producción: 1440/390/zoom 125 — 0 overflow, 0 errores JS, sin Key Fact PLANTA, alternancia imagen/copy correcta.

## CATALOG PROPERTY STORY ROLLOUT
*(2026-08-21 · Engine v4 congelado · rollout en dos tandas: 50 controladas + resto)*

| Estado del catálogo | Propiedades |
|---|---:|
| Activas en producción | 686 |
| **Con Property Story PUBLICADA** | **167** |
| En fallback determinista (sin story aprobable) | 519 |
| — de ellas, bloqueadas por conflicto factual | 343 |
| — descartadas por quality gate (recuperables editando) | 173 |
| — sin story (descripción demasiado corta) | 3 |

**Quality gate de publicación (16 criterios, `scripts/publish-story-batch.mts`)** — ninguna story se publica sin superarlos todos: 0 conflictos · engine v4 · evidencia trazable · 1 bloque por capítulo · claim no reutilizado · ≤70 palabras · ≥5 palabras salvo hecho factual · entidades respaldadas · planta no inferida de zona secundaria · foto semánticamente coherente · barrio coherente con zone/subzone · ≥3 capítulos narrativos · ≥8 fotos · propiedad disponible · sin heading vacío · sin boilerplate de agencia.

**Rechazos acumulados por gate:** 343 conflicto factual · 137 bloque demasiado corto · 18 <3 capítulos narrativos · 18 cobertura fotográfica <8 · 1 claim reutilizado · 1 propiedad no disponible. Los gates 2/4/6/7/8/9/15/16 no rechazaron ninguna: las invariantes v4 lo impiden en origen.

**QA post-publicación:** 12/12 en la tanda controlada y **20/20 en la muestra diversa final** (venta/alquiler, 8–62 fotos, 3–7 capítulos, descripciones de 73 a 545 palabras, 9 barrios, con y sin vídeo) × 3 escenarios (1440, 390, zoom 125%): 0 "Descripción" residual, 0 capítulos duplicados, 0 bloques >70 palabras, 0 boilerplate, 0 overflow, 0 errores JS, barrio/detalles/CTA presentes en todas.

**Contenido generado (inventario completo):** 684 stories · 16.383 fotos clasificadas por IA · 3.676 bloques editoriales con evidencia literal · 424 conflictos factuales detectados y bloqueados.

**Nota editorial (no es bug, decisión de producto):** los capítulos LA FINCA y COCINA tienden a ser breves (11–13 palabras de media) y hay arranques repetidos ("La vivienda…", "Ubicado/a en…"). Es consecuencia directa de la regla evidence > variedad literaria. Se corrige editando en el panel, nunca tocando el motor.

---

## Arquitectura implementada
Un único **Adaptive Property Renderer** (`app/compartir/[slug]/public-property-view.tsx`) compartido por `/compartir/[slug]` y `/c/[token]`, con la biblioteca canónica de 18 módulos y estados RICH / MEDIA-RICH / STANDARD / SPARSE emergentes de los datos (sin plantillas separadas, sin headings vacíos, sin placeholders). Naming visible en español sobrio (D6). Tipografía EMAAR intacta; `OPTIMA_LICENSE_REQUIRED` sin cambios.

## Migración (`supabase/migrations/0144_smartlink_v2.sql`) — aplicada en producción
- `property_story_versions` / `property_story_claims` / `property_story_blocks` — modelo de 3 capas con evidencia, keyed por `source_hash` (el sync puede pisar `description` sin tocar el story). Índice único parcial: una sola versión aprobada por propiedad.
- `property_photos` + columnas IA (`ai_class`, `ai_confidence`, `ai_source_hash`, `ai_model`, `class_override`, `classified_at`).
- `property_media` + `poster_url`/`probed_at` (metadata ffprobe para manuales; los auto ya la traían).
- `neighborhoods` + `neighborhood_pois` — extensibles por INSERT (D2), seeds curados: 9 barrios (Recoletos, Almagro, Salamanca, Chamberí, Retiro, Chamartín, Centro, Pozuelo, La Moraleja) + 33 POIs verificados. RLS activo sin policies (solo service-role).
- Incidencia real de deploy y su fix: el CHECK cerrado de `page_events` (0057) ya no existía en producción (vocabulario abierto desde Shortlist); recrearlo chocó con filas reales y el deploy abortó con rollback automático. La migración final respeta el vocabulario abierto y el seed de POIs es idempotente por lote. Verificado tras aplicar: 9/33/0 duplicados.

## Content Intelligence Engine (`lib/services/story/`)
`EXTRACT → VALIDATE → STRUCTURE → COMPRESS → HUMAN REVIEW → RENDER`, evidence-safe:
- **Extract** (IA, JSON Schema estricto): claims con **cita literal obligatoria** de la frase origen.
- **Validate** (determinista, `validate.ts`, testeado): números del texto contra specs (dormitorios/baños/m² con palabras españolas "tres" incluidas) → `conflict` con motivo; duplicados contra specs/features → fuera de la prosa; boilerplate de agencia (web/call center/off-market) → descartado.
- **Compress** (IA solo sobre claims supervivientes): bloques de 20–60 palabras, techo duro 70 (validado también al editar a mano).
- **Conflictos bloquean SOLO su bloque** (caso benchmark specs=2 vs "tres dormitorios" cubierto por test); los specs mandan siempre; una versión no puede publicarse con conflictos sin resolver.
- Caché por huella de fuente (mismo patrón que el generador de vídeo); modelo/proveedor trazados desde `app_settings['ai.config']`. Bajo demanda, sin backfill (D7).

## Review workflow (`/{country}/admin/propiedades/{slug}/story`)
Generar/regenerar · panel de conflictos con evidencia · editar copy por bloque (límite 70 palabras) · aprobar/rechazar bloque · publicar versión (exige ≥1 aprobado y 0 conflictos; degrada la aprobada anterior) · desactivar story (→ fallback) · vista previa del SmartLink · botones de inteligencia de media (clasificar fotos / analizar vídeos) con contadores de cobertura. Enlace desde la ficha de edición. `SOURCE → GENERATED → APPROVED`; sin aprobación, fallback.

## Fallback día 1 (activo hoy para todo el inventario)
Sin story aprobado: ≤120 palabras → bloque único; más → **split determinista por frases en bloques ≤70 palabras** bajo el heading genérico "Descripción" (sin headings temáticos inventados; respeta abreviaturas tipo S.XX). Verificado en producción: la ficha de 317 palabras que era un muro renderiza ahora en 7 párrafos legibles. Todo lo demás del 2.0 funciona sin IA.

## Foto → capítulo (`lib/services/photos/classify.ts`)
Clases v1 + opcionales del sprint; visión con el `aiComplete` existente (batch 10, downscale server-side), **persistida** en `property_photos` con hash de caché y `class_override` humano que manda. La proyección pública solo expone el nombre de clase con confianza ≥0.75 (umbral server-side). El renderer asigna la primera foto no usada de clase compatible; sin foto adecuada → capítulo compacto solo-texto; jamás una foto de otra estancia.

## Vídeo (`lib/services/video/probe.ts` + renderer)
- ffprobe (wrapper existente del VPS, soporta URL https) para manuales/directos → width/height/duración/format; `probed_at` evita re-sondeos; YouTube/Vimeo solo provider.
- **Hero-vídeo (D4)**: manual + directo + horizontal ≥960px + duración ≤180s → hero full-bleed `autoplay muted loop playsinline` con **poster obligatorio** (poster_url o portada), `prefers-reduced-motion` y `Save-Data`/2g → poster estático. Si no → hero imagen.
- **Signature** ("Recorrido en vídeo") tras los primeros capítulos — nunca al final; un solo autoplay por página (si hay hero-vídeo, el signature no autoreproduce); pausa fuera de viewport.
- **Vertical**: contenedor 9:16 propio, nunca recortado a 16:9. Externos: supporting con embed muted.

## Renderer y módulos
Hero media · identidad con conversión TOP (Solicitar visita + WhatsApp) · key facts (dormitorios/baños/m²/planta/terraza-garaje, fila scrolleable en móvil) · intro editorial · capítulos con alternancia 50/50 izquierda/derecha (móvil: foto arriba) · CTA MID "Organizar una visita privada" tras media/story · detalles agrupados RESIDENCIA/EDIFICIO/TÉCNICO/OTROS (taxonomía determinista `lib/property-features-taxonomy.ts`, ~40 reglas, lo no mapeado nunca se pierde) · plano con fullscreen y `plan_view` · "Vivir en {barrio}" (capa curada + bloque barrio del story) · ubicación con **POIs 3–6 y tiempos calculados por geometría** (haversine×factor urbano; sin coords geocodificadas no se muestran minutos — jamás inventados) · condiciones · Servicio privado BCP · panel Solicitar una visita (D5: ancla + mailto con asunto prerrellenado + canales) · **una sola sticky móvil**.
**Fix de tracking**: desde `/c/[token]` el WhatsApp reenvía la URL tokenizada (antes degradaba a `/compartir` y se perdía la atribución).

## Gallery 2.0 (`components/property-detail/property-gallery.tsx`)
Swipe táctil · lazy loading en tiles y thumbs · `+N` abre en la 5ª foto (antes índice 0) · `photo_view` también al navegar (antes solo al abrir) · modo `lightbox-only` controlado desde el botón del hero · teclado/fullscreen/contador conservados · `/p/` intacto. Portal cliente: mismas mejoras de comportamiento, cero cambios visuales de grid.

## Analytics
Activados/corregidos: `photo_view` (navegación), `scroll` 25/50/75/90, `video_play`, `plan_view`. Nuevos: `photo_gallery_open`, `hero_video_play`, `video_progress` (cuartos), `story_chapter_view` (IntersectionObserver, 1/sesión), `location_view`, `poi_click`, y `visit_request` cableado a los CTAs de visita. Sin PII nueva; vocabulario abierto de `page_events` respetado.

## Performance
Lazy bajo el fold, poster en todo vídeo, un autoplay máximo, pausa offscreen, reduced-motion y Save-Data, galería sin eager-load, `/p/` con su caché intacta.

## Seguridad / contrato público — sin retrocesos
`SELECT *` + adapter siguen filtrando igual; lo ÚNICO nuevo que cruza al cliente: metadata técnica de vídeo (source/format/medidas/poster), nombre de clase de foto, bloques aprobados del story (capítulo+copy, sin claims/evidencia/UUIDs), y barrio curado con POIs. Expiry/revocación/noindex/`/p/`/aislamiento de país intactos; nada de Supabase en el navegador.

## QA
- **Tests** (`npm run test:smartlink`, 20/20): fallback splitter (límite 70, sin pérdida de texto, abreviaturas), validación (conflicto "tres dormitorios" vs specs=2, duplicados, boilerplate), taxonomía, POIs por geometría (incluido "sin dato → no se muestra").
- **Suites** ✅: typography guardrail (250 archivos), portal-links, viewing-collections, client-shortlist, sales-inbox, command-center, idealista 100/100. Build 149/149.
- **Producción** (post-deploy, 2 SmartLinks reales × 390/430/834/1024/1440/1920 × zoom 100/125): auditoría automática **sin hallazgos** (0 overflow, 0 serif, 0 microtexto, 0 errores JS) + revisión visual: hero, key facts con planta, fallback en bloques, detalles agrupados, Vivir en Chamberí, POIs con tiempos, panel de visita — todo correcto; CTA mid correctamente omitido sin media/story (adaptividad verificada).

## Limitaciones conocidas
1. **Story/clasificación de fotos requieren la API key de IA** configurada en el panel (ai.config); sin ella, el botón devuelve error claro y el SmartLink sigue en fallback. Aún no se ha generado ningún story real — el primer uso del workflow lo hará el equipo (revisión humana obligatoria).
2. De las 9 propiedades-tipo del plan de pruebas, en producción hoy solo existen casos sin vídeo/plano (fallback + adaptividad verificados); hero-vídeo, vertical y plano quedan verificados por lógica+tests y pendientes de la primera propiedad real con esa media (el botón "Analizar vídeos" deja la metadata lista).
3. Los tiempos a POIs son estimaciones geométricas honestas (≈, modo explícito); si se quiere precisión de rutas reales, habría que integrar un router externo (decisión futura, no v1).
4. `neighborhoods.facts` (jsonb) queda reservado para la capa de conocimiento ampliada (D3 v2).

# SMARTLINK 2.0 — BCP LUXURY PROPERTY EXPERIENCE COMPLETE
