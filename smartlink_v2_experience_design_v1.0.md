# SMARTLINK 2.0 — EXPERIENCE DESIGN v1.0
## Especificación de producto aprobable · deriva del brief `smartlink_v2_product_experience_design.md`

**Fase:** DISEÑO. Cero implementación, cero migraciones, cero IA en producción.
**Fuentes:** benchmark v1.0 (medido), SmartLink actual (auditado con archivo:línea), modelo de datos real (inventariado). Cada decisión de este documento cita de dónde sale.

---

# 0. RESUMEN DE UNA PANTALLA

SmartLink 2.0 = **disciplina narrativa EMAAR** (capítulos de 20–60 palabras con foto integrada, hechos fuera de la prosa) + **confianza mediática DAMAC** (vídeo arriba, plano como media, ubicación útil) + **capa BCP** (vivienda única, barrio de Madrid, requisitos, Personal Shopper, contacto directo). Un solo renderer adaptativo con 18 módulos canónicos y 4 estados (RICH / MEDIA-RICH / STANDARD / SPARSE). El Content Engine es un extractor con evidencia, no un copywriter: nunca inventa, nunca publica conflictos, siempre con humano en el circuito.

---

# 1. ESPECIFICACIÓN MÓDULO A MÓDULO

Convención: **Datos** = campos reales existentes hoy (✅) o nuevos requeridos (🔶). **Condición** = cuándo se renderiza. Todos los módulos omiten headings vacíos (brief §35).

### 01 · HERO MEDIA
- **Datos:** ✅ `property_photos[position=0..n]`, ✅ `property_media type='video'` (+🔶 `source`/`format` expuestos en la proyección pública — hoy la query no los selecciona; +🔶 metadata ffprobe para manuales).
- **Condición:** siempre (hay fotos siempre; placeholder jamás).
- **Desktop:** media full-bleed ~62vh. Overlay inferior con gradiente suave para legibilidad de identidad. Acción "VER TODAS LAS FOTOS · N" (abre Gallery 2.0).
- **Móvil:** media 100vw, ratio 4:3–16:10; identidad debajo, no superpuesta (legibilidad 60+).
- **Vídeo hero:** solo si `source='manual'` + horizontal + metadata válida (§3). `autoplay muted loop playsinline`, **poster obligatorio** (primera foto clasificada `facade|living` o cover), sin controles visibles hasta hover/tap. `prefers-reduced-motion` → poster estático. Conexión lenta (Save-Data / effective-type 2g) → poster.
- **Analytics:** `hero_video_play` (nuevo nombre sobre el `video_play` ya implementado y nunca invocado), `photo_gallery_open`.

### 02 · PROPERTY IDENTITY
- **Datos:** ✅ operation(+dual `?op=`), title, zone/subzone, price(+`/mes`), bcReference, ✅ `available_from` si aplica.
- **Layout:** eyebrow `VENTA · PISO` (crm-label) → título editorial (crm-page-title, sentence case si el título es largo — regla tipográfica ya vigente) → ubicación con icono → precio (crm-number 3xl) + ref badge.
- **Regla:** ninguna prosa aquí. El título NO se reescribe con IA en esta fase; se usa `displayPropertyTitle` actual.

### 03 · KEY FACTS
- **Datos:** ✅ bedrooms, bathrooms, square_meters, 🔶 floor (hoy derivado por parser — pasa a hecho validado del engine), + condicionales ✅ terraza/garaje/amueblado si están en features.
- **Layout:** fila de 3–5 tarjetas (patrón EMAAR "key-fact cards", benchmark §5-05). Desktop: fila; móvil: fila scrolleable sin salto de línea.
- **Regla dura:** estos hechos NO pueden reaparecer en la prosa de capítulos (el engine los resta — benchmark: 8,6 duplicados/descripción hoy).

### 04 · PROPERTY INTRO
- **Datos:** 🔶 bloque `OVERVIEW` aprobado del story.
- **30–60 palabras, una idea.** Sin barrio, sin specs, sin boilerplate. Si no hay story aprobado → fallback §7.

### 05–10 · CAPÍTULOS DE HISTORIA (adaptativos)
`LIVING & LIGHT` · `KITCHEN & DINING` · `PRIVATE QUARTERS` · `OUTDOOR LIVING` · `FINISHES & COMFORT` · `THE BUILDING`
- **Datos:** 🔶 bloques aprobados del story (con evidencia); 🔶 foto clasificada por chapter (clases §4). Frecuencia real medida en BCP: LIVING 5/5, PRIVATE 5/5, BUILDING 5/5, FINISHES 4/5, OUTDOOR 3/5, KITCHEN implícito en LIVING (se renderiza como capítulo propio solo si el engine lo separa con confianza).
- **Condición por capítulo:** `story.blocks[chapter].status='approved'` AND `confidence ≥ 0.7` AND sin conflicto. Sin foto de su clase → §14 del brief: foto de apoyo no usada o capítulo compacto solo-texto. Nunca forzar.
- **Layout desktop:** alternancia 50/50 izquierda/derecha estricta (patrón EMAAR); heading crm-section-title + copy 20–60 palabras (techo 70). Un capítulo puede llevar 1 foto principal + hasta 2 de apoyo (composición 2-img).
- **Layout móvil:** foto arriba, copy debajo, siempre.
- **Analytics:** `story_chapter_view` (IntersectionObserver, 1 evento por capítulo por sesión).

### 11 · SIGNATURE VIDEO
- **Condición:** existe vídeo y NO es hero. **Posición: tras el 1º–2º capítulo narrativo** (patrón DAMAC ~1.500px), nunca tras toda la historia (hoy es el 6º módulo — gap ALTA del benchmark).
- **Heading:** `SIGNATURE FILM` (o `VÍDEO` si el tono se decide en ES — decisión abierta D6). Sin párrafo explicativo.
- **Reglas por tipo (benchmark §Q):** manual horizontal → signature. Auto horizontal → signature si no hay manual. **Auto vertical → contenedor vertical 9:16 centrado (max-h ~80vh), JAMÁS recortado a 16:9** (defecto actual documentado). Externo YT/Vimeo → embed actual (ya correcto, muted+loop). Si hay varios: manual > auto; el resto en miniaturas como hoy.
- **Analytics:** `video_play` + 🔶 `video_progress` (25/50/75/100 si player directo).

### 12 · RESIDENCE DETAILS
- **Datos:** ✅ features+features_manual pasados por 🔶 taxonomía (§5) → 3 grupos: RESIDENCIA / EDIFICIO / TÉCNICO.
- **Layout:** 3 columnas desktop (1 móvil) con heading crm-label por grupo y chips como hoy. Sustituye al "Características" plano con regex de 12 keywords.
- **Regla:** no repite beds/baths/m² (ya en Key Facts). "Orientación" solo si verificada (hoy se filtra — se mantiene el filtro salvo dato validado).

### 13 · FLOOR PLAN
- **Datos:** ✅ `property_media type='plan'`.
- **Layout:** preview grande + zoom/fullscreen (misma lightbox de Gallery 2.0 reutilizada) + swipe si varios. Sin lógica de unidades.
- **Analytics:** `plan_view` (ya implementado, nunca invocado — se activa).

### 14 · LIVING IN [BARRIO]
- **Datos:** 🔶 bloque `BARRIO` del story (30–70 palabras, factual) + opcional 🔶 capa de conocimiento por zona (D3). El benchmark midió que el 30–40% del texto actual es barrio: este módulo lo absorbe y lo separa de la vivienda.
- **Layout:** heading `VIVIR EN ALMAGRO` (crm-section-title) + copy + 1 foto de entorno si existe clase `facade_building`/`view` (nunca inventar — sin foto, solo texto).

### 15 · LOCATION & NEARBY
- **Datos:** ✅ coords (Nominatim cacheado) + mapa OSM actual; 🔶 POIs curados por zona (D2).
- **Layout:** mapa (proxy actual intacto) + lista `NEARBY` de **3–6 POIs** con modo explícito (`a pie` / `en coche`) SOLO si el dato es curado. Sin POIs → mapa + zona verificada, sin tiempos inventados.
- **Analytics:** `location_view`, 🔶 `poi_click`.

### 16 · RENTAL / SALE TERMS
- **Datos:** hoy hardcodeados por operación (se mantienen tal cual esta fase); 🔶 futuro data-driven (fuera de alcance).
- **Layout:** tarjeta única separada visualmente de la historia (ya existe; se conserva).

### 17 · BCP PRIVATE CLIENT SERVICES
- Igual que hoy (tarjeta oscura Personal Shopper), **siempre tras Terms, nunca intercalado** en la narrativa. El boilerplate de agencia extraído de las descripciones (detectado en 2/5) muere aquí: este módulo ES su único lugar.

### 18 · REQUEST A VIEWING (conversión)
- **Modelo EMAAR contenido + canales BCP** (brief §26): TOP = `SOLICITAR VISITA` (primario) + WhatsApp (secundario) en la identidad; MID = 1 CTA contextual `ORGANIZAR VISITA PRIVADA` tras el signature video o el 3er capítulo; BOTTOM = panel completo (WhatsApp/Email/Tel/Solicitar visita); móvil = **una sola sticky** simplificada (sin doble sticky DAMAC).
- "Solicitar visita" en esta fase = ancla al panel de contacto con asunto prerrellenado (sin formulario nuevo ni login); formulario real = decisión abierta D5.
- **Fix aprovechado:** el `shareUrl` de WhatsApp respetará la URL actual (hoy desde `/c/` reenvía a `/compartir/` y pierde el tracking — gap auditado).

---

# 2. WIREFRAMES

**Desktop (1440):**
```text
┌────────────────────────────────────────────────┐
│ 01 HERO (vídeo manual ó cover, full-bleed 62vh)│  [VER TODAS LAS FOTOS · 33]
├────────────────────────────────────────────────┤
│ 02 VENTA · PISO      Piso en Paseo del General │
│    Martínez Campos   Chamberí · Madrid         │
│    3.230.000 €  Ref. BC-0722   [SOLICITAR VISITA] [WA]
├────────────────────────────────────────────────┤
│ 03 [4 DORM] [5 BAÑOS] [214 M²] [3ª PLANTA]     │
├────────────────────────────────────────────────┤
│ 04 Intro 30–60 palabras (una idea)             │
├──────────────────────┬─────────────────────────┤
│ 05 FOTO salón        │ LIVING & LIGHT          │
│                      │ 20–60 palabras          │
├──────────────────────┼─────────────────────────┤
│ 07 PRIVATE QUARTERS  │ FOTO dormitorio         │  ← alternancia
│    20–60 palabras    │                         │
├────────────────────────────────────────────────┤
│ 11 SIGNATURE FILM (16:9 ó contenedor 9:16)     │
├──────────────────────┬─────────────────────────┤
│ 09 FINISHES (texto)  │ 10 THE BUILDING + foto  │
├────────────────────────────────────────────────┤
│ 12 RESIDENCE DETAILS (3 grupos en 3 columnas)  │
├────────────────────────────────────────────────┤
│ 13 FLOOR PLAN (zoom)                           │
├────────────────────────────────────────────────┤
│ 14 VIVIR EN ALMAGRO (copy + foto entorno)      │
├────────────────────────────────────────────────┤
│ 15 MAPA + NEARBY (3–6 POIs con modo)           │
├────────────────────────────────────────────────┤
│ 16 TERMS   │  17 BCP PRIVATE CLIENT SERVICES   │
├────────────────────────────────────────────────┤
│ 18 ¿TE INTERESA? [WA][EMAIL][TEL][VISITA]      │
└────────────────────────────────────────────────┘
```
**Móvil (390):** mismo orden, todo apilado foto→copy, key facts en fila scrolleable, 1 sticky bottom (`VISITA · WA · TEL`), mapa y detalles con lazy, hero-vídeo solo si ligero (si no, poster).

---

# 3. ÁRBOL DE DECISIÓN DEL RENDERER (completo)

```text
HERO:
  v = vídeos con metadata
  if ∃ v: source=manual ∧ aspect≥1 ∧ dur≤120s ∧ peso/seg razonable ∧ poster
      → hero = ese vídeo ; signature = resto
  else → hero = cover (is_cover || photos[0])
        if ∃ vídeo (cualquiera) → signature = mejor según: manual > auto_h > externo > auto_v

CAPÍTULOS (por cada chapter del módulo 05-10):
  if story.approved[chapter] ∧ confidence≥0.7 ∧ ¬conflict
      foto = photo_meta[clase(chapter)] con mayor score no usada
      if ¬foto → foto = apoyo genérica no usada || capítulo compacto solo-texto
      render(chapter)
  else skip  # jamás heading vacío ni placeholder

INTRO: story.approved[OVERVIEW] || fallback(§7)
PLAN: ∃ media[plan] → render
BARRIO: story.approved[BARRIO] || zona con capa curada → render ; else skip
POIs: ∃ pois_curados[zone] → 3–6 ; else solo mapa
TERMS: operation==rent → rental ; else sale
ESTADO GLOBAL: RICH ≥8 módulos con media premium · MEDIA-RICH vídeo+poco texto ·
               STANDARD story sin vídeo · SPARSE ≤7 módulos
```

---

# 4. METADATA DE FOTO (diseño del dato, no implementación)

Clases obligatorias: `living_room · kitchen · bedroom · bathroom · terrace_outdoor · facade_building · other` (+opcionales del brief §13). Por foto: `class`, `confidence`, `source_hash` (URL+modelo+versión), `human_override`. Clasificación batch con el `aiComplete` visión ya existente (misma infraestructura que analyze-photos, pero **persistida**). Umbral de uso en render: 0.75; debajo → la foto solo aparece en galería. El generador Ken Burns podrá reutilizar esta metadata para ordenar (mejora colateral, fuera de alcance del sprint).

# 5. TAXONOMÍA DE FEATURES (diseño del dato)

Mapa determinista string-crudo → `{key, grupo(RESIDENCIA|EDIFICIO|TÉCNICO), label_es}`; ~40 entradas cubren el vocabulario real observado (ascensor, portero, garaje, trastero, piscina, terraza, balcón, AC, calefacción, aerotermia, amueblado, reformado, armarios, vestidor, suite, exterior…). Lo no mapeado → grupo OTROS con el string original (nunca se pierde dato). Sustituye a las 2 regex/12 keywords actuales.

# 6. CONTENT ENGINE — diseño operativo

**Pipeline:** `EXTRACT (LLM segmenta el párrafo en claims con cita literal) → VALIDATE (números vs campos estructurados; duplicados vs specs/features → marcados; boilerplate → descartado) → STRUCTURE (claims→categorías §35 del benchmark) → COMPRESS (copy ≤70 palabras por bloque, solo desde claims válidos) → REVIEW (cola admin humana) → RENDER`.
- **Modelo de 3 capas** (brief §29) con trazabilidad bloque→claims→frase origen.
- **Persistencia versionada fuera de `properties.description`** (el sync la pisa — confirmado): conceptualmente `property_story_versions` + `blocks`, keyed por `source_hash` de la descripción; regeneración solo si cambia el hash. Esquema exacto en la fase de arquitectura.
- **Conflictos:** caso real Recoletos (specs=2, texto="tres dormitorios") → bloque PRIVATE bloqueado + flag admin; los specs mandan siempre; jamás se elige "el número más bonito".
- **Human-in-the-loop:** revisar/editar/aprobar/rechazar/regenerar por bloque; desactivar story por propiedad → fallback. Sin auto-publicación masiva.
- **Reutiliza:** `lib/services/ai/chat.ts` (visión+JSON schema+config BD), patrón de caché por huella del generador de vídeo, estilo editorial de `description-style.ts` como referencia de tono.

# 7. FALLBACK (sin story aprobado — el estado de TODO el inventario el día 1)

- Descripción ≤120 palabras → se muestra tal cual en bloque legible (caso Recoletos).
- Descripción >120 → **split determinista sin IA**: corte por frases a bloques ≤70 palabras bajo el heading `DESCRIPCIÓN` (sin inventar headings temáticos); mejora inmediata del muro de 317-388 palabras sin riesgo alguno.
- Todo lo demás del 2.0 (hero, key facts, signature video reposicionado, details agrupados, plano con zoom, mapa) **no depende del engine** y funciona desde el día 1.

# 8. LOS 4 ESTADOS CON LAS 5 PROPIEDADES REALES (demostración de adaptividad)

| Propiedad (producción) | Datos | Estado | Módulos renderizados |
|---|---|---|---|
| Martínez Campos (317w, 5 temas ricos, sin vídeo) | story completo posible | **STANDARD→RICH** con fotos clasificadas | 01·02·03·04·05·07·09·10·12·14·15·16·17·18 (14) |
| Lagasca ático dúplex (388w, 8 features) | story + outdoor | **STANDARD** | +08 OUTDOOR (terraza) |
| Narváez (323w, garaje+trastero+terraza) | story + técnico fuerte | **STANDARD** | 12 con grupo TÉCNICO poblado |
| Recoletos (110w, **conflicto beds**) | story corto, PRIVATE bloqueado | **SPARSE** | 01·02·03·04(=fallback texto)·10·14·15·16·17·18 (10) — el conflicto no bloquea la página, solo el bloque |
| Cualquiera con vídeo manual futuro | media premium | **MEDIA-RICH/RICH** | hero=vídeo + 11 omitido o segundo film |

# 9. ANALYTICS (mapa completo)

Ya activos: `page_view`, `photo_view` (se corrige: también al navegar, no solo al abrir), `contact_click`, `time_on_page`. Se activan (ya implementados): `video_play`, `plan_view`, `scroll` (25/50/75/90). Nuevos: `story_chapter_view`, `location_view`, `poi_click`, `photo_gallery_open`, `video_progress`, `request_viewing`. Sin datos personales nuevos.

# 10. RENDIMIENTO (requisitos para el sprint)

Lazy en toda media bajo el fold; poster obligatorio en vídeo; un solo vídeo en autoplay simultáneo (pause al salir de viewport); galería sin eager-load (gap actual: 40 fotos → 40 requests al abrir); proxy `/p/` intacto; reduced-motion y Save-Data respetados; sticky única en móvil.

# 11. QUÉ NO SE COPIA (cerrado, del brief §40)

Sin unit-selector, sin KPIs de comunidad, sin related projects, sin registro-para-plano, sin doble sticky, sin FAQ por defecto, sin brochure workflow, sin hero de 20MB sin salvaguarda móvil, sin claims lifestyle genéricos.

# 12. CRITERIOS DE ACEPTACIÓN — TRAZABILIDAD

| Criterio (brief §42) | Dónde queda resuelto |
|---|---|
| 1 Sin muro de 300 palabras | §6 engine + §7 fallback determinista |
| 2 Fotografía integrada | §1 (05–10) + §4 clases |
| 3 Vídeo promovido | §1-01/11 + §3 árbol |
| 4 Hechos fuera de prosa | §1-03 + regla dedupe §6 |
| 5 Residencia/edificio/barrio separados | §1-10/12/14 |
| 6 Sin módulos vacíos | §3 (skip, no placeholder) |
| 7 Raw data preservado | §6 (description intacta; story aparte versionado) |
| 8 Sin inventar | §6 reglas duras + conflictos |
| 9 Móvil | §2 + §10 |
| 10 Reconociblemente BCP | tipografía EMAAR ya desplegada + módulos 16-18 |
| 11 Contacto directo | §1-18 |
| 12 Más premium que un portal | densidad §36 brief + hero full-bleed + capítulos |

# 13. DECISIONES ABIERTAS PARA TU APROBACIÓN

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Idioma del story generado | Solo ES en v1 (los SmartLinks son ES hoy); multi-idioma después |
| D2 | Fuente de POIs | **Curación manual por zona** (~7 zonas × 5-8 POIs, una tarde de trabajo, determinista, sin API externa — encaja con la política VPS-only) frente a API de terceros |
| D3 | Capa de conocimiento de barrio | Sí, pero v1 mínima: 1 párrafo curado por zona (7 zonas), reutilizable; el engine solo la complementa |
| D4 | Hero-vídeo en v1 | Como los manuales no tienen metadata aún, v1 lanza con hero=imagen + signature reposicionado; hero-vídeo se activa cuando exista ffprobe-metadata (evita bloquear el sprint) |
| D5 | "Solicitar visita" | v1 = ancla+asunto prerrellenado (sin formulario ni backend nuevo); formulario público con anti-spam = fase posterior |
| D6 | Naming visible | Headings en español (`SIGNATURE FILM`→`VÍDEO`?, `LIVING & LIGHT`→`SALÓN Y LUZ`?…) — propongo tabla ES en el kickoff del sprint |
| D7 | Alcance del backfill | Story bajo demanda (al abrir/editar propiedad) en vez de backfill masivo del inventario |

# 14. SIGUIENTE FASE (tras tu aprobación)

`SMARTLINK 2.0 — IMPLEMENTATION ARCHITECTURE + SINGLE SPRINT`: persistencia del story, engine con validación y cola de revisión, clasificación de fotos, metadata de vídeo (ffprobe), taxonomía de features, renderer adaptativo, Gallery 2.0, plano con zoom, POIs curados, analytics, QA responsive completa y estrategia de fallback/migración — todo definido arriba, nada pendiente de investigación.
