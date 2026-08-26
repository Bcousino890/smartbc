# CRM TYPOGRAPHY — DAMAC vs EMAAR FORENSIC BENCHMARK v1.0

**Fecha:** 2026-08-20
**Método:** inspección con navegador real (Playwright + Chromium headless), `getComputedStyle()` sobre elementos vivos, `document.fonts`, CSSOM `@font-face`, interceptación de red de ficheros de fuente, y **CDP `CSS.getPlatformFontsForNode`** (la fuente que el motor de render usó de verdad, no la declarada). Viewports: 1440×900 (desktop, DPR 2) y 390×844 (móvil, UA iPhone, DPR 3).
**Páginas medidas por sitio:** homepage, listado (DAMAC `/en/search/`, EMAAR `/en/latest-launches/`) y ficha de proyecto (DAMAC Golf Gate 2, EMAAR Dubai Creek Harbour), en los dos viewports = 12 capturas JSON.
**Auditoría del repo:** grep exhaustivo sobre `app/**` + `components/**` (322 `.tsx`), conteos reales de ocurrencias.

Ningún archivo de fuente fue copiado ni descargado de los sitios auditados. No se ha modificado código.

---

# PART A — DAMAC LIVE TYPOGRAPHY FORENSICS

## A.1 Carga de fuentes real

DAMAC es una app Next.js que **self-hostea todas sus fuentes vía `next/font`** (`/_next/static/media/*.woff2`, con `font-display: swap` y fallbacks métricos `local("Arial")` con `size-adjust`). No usa Google Fonts CDN, ni Adobe Fonts CDN, ni Typekit.

| Familia (nombre interno next/font) | Fuente real | Pesos declarados | Rol | Origen |
|---|---|---|---|---|
| `__termina_3f6a3b` | **Termina** (Fort Foundry) | **400, 500** (solo dos ficheros) | Display, botones, cifras, labels | Self-hosted, propietaria |
| `__Roboto_e81766` | **Roboto** | 400, 500 | Body, UI, footer, forms | Self-hosted, libre |
| `__gssTwo_d60a2e` | **GE SS Two** | 500 | Árabe (UI) | Self-hosted, propietaria |
| `__Cairo_74342b` | Cairo | 300, 500 | Árabe | Self-hosted, libre |
| `__El_Messiri_97d836` | El Messiri | 400–700 | Árabe (display) | Self-hosted, libre |
| `__Josefin_Sans_a8383b` | Josefin Sans | 100–700 (variable) | **Declarada pero NO renderizada** en las 6 capturas (status `unloaded`) | Self-hosted, libre |

**Prueba de resolución (CDP):** en todos los titulares y botones el motor devolvió como fuente de plataforma **"Copyright Fort Foundry LLC"** (nombre interno del fichero de Termina) con `isCustomFont: true`; en el cuerpo devolvió **"Roboto"**. No hay ambigüedad: lo declarado es lo renderizado.

**Defecto real detectado:** el H1 de las fichas de proyecto pide `font-weight: 600` sobre Termina, pero solo existen caras 400 y 500 → el navegador sirve la 500 (o sintetiza). El "Demi" que se ve en sus H1 no es una cara real. Anotarlo para no "clonar" un peso que no existe.

**Ruido de terceros:** la ficha de proyecto carga además Google Sans / Material Symbols — vienen de un widget embebido de Google (mapa), no del sistema tipográfico de DAMAC.

## A.2 Tabla de roles DAMAC (computed styles medidos)

| Role | Family | Resolved font | Weight | Size desktop | Size mobile | Line-height | Letter-spacing | Transform | Ejemplo medido |
|---|---|---|---|---|---|---|---|---|---|
| Nav (los menús son overlays JS; ítems visibles) | Roboto | Roboto | 400 | 14–16px | 14–16px | 21–24px | normal | none | "Browse Properties" |
| Hero/Page H1 | Termina | Termina | 400 (home) / 600→500 real (detail) | 32px | 20px | 38.4px (1.2) | **3.2px (0.10em)** | **uppercase** | "GOLF GATE 2: WHERE LIFE…" |
| H2 | Termina | Termina | 400 | 32px | 20px | 38.4px (1.2) | 3.2px (0.10em) | uppercase | "A WORLD OF AMENITIES" |
| H3 / card title | Termina | Termina | 500 | 16px | 16px | 19.2px (1.2) | 1.6px (0.10em) | uppercase | "MANDARIN ORIENTAL" |
| Eyebrow/accordion label | Termina | Termina | 500 | 12px | 12px | 14.4px (1.2) | normal | uppercase | "Why DAMAC" |
| Lead / intro | Roboto | Roboto | 300* | 16px | 16px | 22.4–24px (1.4–1.5) | normal | none | párrafo descriptivo |
| Body estándar | Roboto | Roboto | 300*–400 | 16px | 16px | 19.2–24px | normal | none | — |
| Caption / metadata | Roboto | Roboto | 300* | 12px | 12px | 14.4px (1.2) | normal | none | "Male, Maldives" |
| Cifras / stats ("110+", "Est. 2002") | Termina | Termina | 400–500 | 20–32px | 20px | 1.2 | 2–3.2px (0.10em) | none | "Est. 2002" |
| Button primario/secundario | Termina | Termina | 400–500 | **12px** | 12px | 14.4px | 1.2px (0.10em) | uppercase | "EXPLORE" |
| Input / select | Roboto | Roboto | 400 | 12px | 12px | 14.4px | normal | none | "Sort by: Default" |
| Footer link | Roboto | Roboto | 300* | 12px | 12px | 14.4px | normal | none | "About DAMAC" |
| Pagination/slider control | Termina | Termina | 400 | 12px | 12px | 14.4px | 1.2px | uppercase | "Prev Slide" |

\* El CSS pide 300 pero solo hay caras 400/500 de Roboto: **el navegador renderiza la 400**. El "light" de DAMAC es nominal, no real.

## A.3 Casing y ritmo DAMAC

- **ALL CAPS es el sistema entero de display**: H1, H2, H3, botones, labels y controles — todo Termina en mayúsculas. El cuerpo (Roboto) va en sentence case.
- **Tracking positivo constante de 0.10em** en Termina a cualquier tamaño (3.2px@32, 1.6px@16, 1.2px@12). Es la firma visual del sitio.
- **Jerarquía por tamaño, no por peso**: solo 400/500; el contraste jerárquico viene del salto 32 → 16 → 12 y del cambio de familia (Termina vs Roboto).
- **Line-height clavado en 1.2** para todo lo Termina; Roboto 1.2–1.5.
- **Densidad vertical alta** — títulos compactos, mucho aire entre secciones (espaciado, no interlineado).
- **Cifras y precios en Termina** (extendida, muy ancha): los números ocupan muchísimo espacio horizontal; en marketing funciona como gesto, en una tabla sería un problema.
- Escalado móvil: los display bajan de 32→20px y el tracking de 3.2→2px; los tamaños de 16 y 12px **no cambian**.

---

# PART B — EMAAR LIVE TYPOGRAPHY FORENSICS

## B.1 Carga de fuentes real

EMAAR también es Next.js. **Dos orígenes**: Lato/IBM Plex Sans Arabic self-hosted vía `next/font` y **Optima self-hosted a mano** en `/fonts/optima.woff2` + `/fonts/optima.ttf` con un `@font-face` clásico:

```css
@font-face { font-family: optima; font-style: normal; font-weight: 400;
  src: url("/fonts/optima.woff2") format("woff2"), url("/fonts/optima.ttf") format("truetype");
  font-display: optional; }
```

| Familia | Pesos declarados | Rol | Origen |
|---|---|---|---|
| **optima** | **solo 400** | Todos los headings (via `font-[optima]!`) | Self-hosted manual, propietaria (Linotype/Monotype) |
| **Lato** | 300, 400, 700 | Body, nav, botones, cards, footer — todo lo demás | next/font, libre (SIL OFL) |
| IBM Plex Sans Arabic | 300, 400, 700 | Árabe | next/font, libre |
| Font Awesome 6 Pro | 300 | Iconos | Self-hosted, comercial |

**Detalles forenses relevantes:**
- `font-display: optional` en Optima: si la fuente no llega a tiempo en la primera visita, el navegador **pinta el fallback y no la cambia** (cero CLS, a costa de que la primera impresión pueda salir sin Optima).
- El CSS usa pesos 500 y 600 de Lato en algunos elementos (footer heads, SUBSCRIBE) que **no existen como cara**: Chrome resuelve 500→400 y 600→700. Igual que DAMAC, pesos nominales.
- El fallback métrico de Lato generado por next/font es `local("Arial")` con ajustes — curiosamente coincide con el "web-safe" que exige su brand guide.

## B.2 Tabla de roles EMAAR (computed styles medidos)

| Role | Family | Resolved font | Weight | Size desktop | Size mobile | Line-height | Letter-spacing | Transform | Ejemplo medido |
|---|---|---|---|---|---|---|---|---|---|
| Nav primaria | Lato | Lato | 400 | 12px | 12px | 16px (1.33) | 1.2px (0.10em) | uppercase | "About Us" |
| Hero/Page H1 | optima | **Optima** | 400 | **46px** | **28px** | 57.5px (1.25) | **normal** | **uppercase** | "DUBAI CREEK HARBOUR" |
| H2 sección | optima | Optima | 400 | 36px | 34px | 40px (1.11) | normal | uppercase | "Communities 360° Tour" |
| H2 card de proyecto (listado/detalle) | optima | Optima | 400 | 24px | 22px | 33.6–36px (1.4–1.5) | normal | uppercase | "Oria at Dubai Creek Harbour" |
| H3 card/community title | optima | Optima | 400 | 24px | 22px | 32px (1.33) | normal | uppercase | "Dubai Creek Harbour" |
| Eyebrow / card label | Lato | Lato | 400 | 14px | 12px | 20px (1.43) | **2px (0.14em)** | uppercase | "DUBAI CREEK HARBOUR" |
| Metadata de card ("1-3 BR") | Lato | Lato | 400 | 12px | 12px | 16px (1.33) | 2px (0.17em) | none | "1-3" |
| **Precio** | Lato | Lato | 400 | 12px | 12px | 16px | 2px | uppercase | "From AED 3,197,888" |
| Lead / intro | Lato | Lato Light | 300 | 18px | 16px | 28px (1.56) | normal | none | "As the Leading Developer…" |
| Body estándar | Lato | Lato | 400 | 14px | 12px | 20px (1.43) | 0.35–1.4px | mixto | — |
| Label de sección/footer head | Lato | Lato | 500→400 real | 14px | 14px | 20px | 1.4px (0.10em) | uppercase | "About EMAAR" |
| Button primario | Lato | Lato | **700** | 12px | 12px | 16px (1.33) | 1.2px (0.10em) | uppercase | "GET IN TOUCH" |
| Button filtro/dropdown | Lato | Lato | 400 | 16px | 16px | 24px | normal | none | "PROPERTY TYPE" |
| FAQ / acordeón | Lato | Lato | 700 | 16px | 16px | 24px | 1.6px (0.10em) | uppercase | pregunta |
| Footer link | Lato | Lato | 400 | 12px | 12px | 16px | 1.2px (0.10em) | uppercase | "Who We Are" |

## B.3 Casing y ritmo EMAAR

- **Optima siempre en mayúsculas y siempre a peso 400, sin tracking.** La elegancia sale de la propia fuente (sans glífica humanista, con terminales acampanados), no de tracking artificial.
- **Lato lleva todo el tracking**: los labels/uppercase de Lato van a 0.10–0.17em; el cuerpo a normal.
- **Jerarquía por familia + tamaño**: Optima = display (22–46px), Lato = todo lo demás (12–18px). El peso 700 de Lato se reserva a botones y acordeones.
- Line-height más generoso que DAMAC: 1.25–1.5 en display, 1.33–1.56 en texto.
- **Los precios son texto pequeño en Lato con tracking** (12px), no protagonistas.
- Escalado móvil: H1 46→28, H2 36→34, cards 24→22, body 14→12. Los botones no cambian.

---

## §5 — EVIDENCIA OFICIAL DE MARCA EMAAR: BRAND GUIDE vs LIVE WEBSITE

Fuente verificada: página oficial `emaar.com/en/emaar-brand` y PDF oficial **"BRAND GUIDELINES – EXTERNAL – JAN 2025"** (`emaar.com/images/brand-guidelines/BRAND-GUIDELINES-EXTERNAL-JAN-2025.pdf`).

| Rol según brand guide | Guide dice | Live website hace | ¿Coincide? |
|---|---|---|---|
| Primary English (headlines) | **Optima** (reservada a titulares) | Optima 400 en todos los headings | ✅ Sí |
| Secondary English (subheads/body) | **Adobe Garamond Pro** | **Lato** 300/400/700 | ❌ No — la implementación digital sustituyó la serif corporativa por una sans libre |
| Web-safe primary | Arial Regular | (el fallback métrico de Lato es Arial ajustada) | ~ accidentalmente |
| Web-safe secondary | Georgia Regular | no aparece | ❌ |
| Arabic primary/secondary | GE Hili / GE SS | IBM Plex Sans Arabic | ❌ |

**Conclusión:** EMAAR live = "brand guide a medias, digitalizado con criterio": conserva la voz de marca donde más se ve (titulares Optima) y cambia el cuerpo editorial (Garamond) por una sans de trabajo gratuita y muy legible (Lato). Es exactamente la maniobra que un CRM necesitaría. BRAND GUIDE ≠ LIVE WEBSITE y este informe usa **el live** como referencia reproducible.

*(Nota lateral: GE SS —la secundaria árabe del guide de EMAAR— es literalmente la "gssTwo" que DAMAC self-hostea. Ambos grupos comparten proveedor tipográfico árabe.)*

---

# PART C — COMPARACIÓN EXACTA

| Role | DAMAC | EMAAR |
|---|---|---|
| Main family | Termina (Fort Foundry, propietaria) | Optima 400 (Linotype, propietaria) |
| Secondary family | Roboto 400/500 (libre) | Lato 300/400/700 (libre) |
| Nav | Roboto 14–16/400 | Lato 12/400 caps +0.10em |
| H1 | Termina 32/400–500 CAPS +0.10em, lh 1.2 | Optima 46/400 CAPS, tracking normal, lh 1.25 |
| H2 | Termina 32/400 CAPS +0.10em | Optima 36/400 CAPS, lh 1.11 |
| Card title | Termina 16/500 CAPS +0.10em | Optima 24/400 CAPS, lh 1.4 |
| Body | Roboto 16/400(nominal 300), lh 1.4 | Lato 14/400, lh 1.43; lead 18/300 lh 1.56 |
| UI small | Roboto 12/300–400 | Lato 12/400 (+2px tracking en meta) |
| Buttons | Termina 12/400–500 CAPS +0.10em | Lato 12/700 CAPS +0.10em |
| Inputs | Roboto 12/400 | Lato 16/400 (filtros), 12–14 resto |
| Prices/numbers | Termina 20–32px, extendida, protagonista | Lato 12/400 caps, discreto |
| Tracking | +0.10em fijo en TODA Termina | 0 en Optima; 0.10–0.17em solo en labels Lato |
| Uppercase usage | Todo el display + botones + labels | Todo el display + nav/botones/labels; body normal |
| Mobile scaling | 32→20 display; 16/12 fijos | 46→28, 36→34, 24→22; body 14→12 |
| Font licensing | Termina COMERCIAL + Roboto libre | Optima COMERCIAL + Lato libre |

---

## §6 — EVALUACIÓN ACCESIBILIDAD / AGENTES 60+

Medición sobre los valores exactos anteriores, sin alterarlos.

**Anatomía de las cuatro fuentes:**

| Criterio | Termina | Roboto | Optima | Lato |
|---|---|---|---|---|
| x-height aparente | Alta | Alta | Media | Alta |
| Apertura de caracteres | Media (geométrica, ancha) | Buena | Buena | Muy buena (semiredonda) |
| I/l/1 | **Débil** (geométrica: I y l casi idénticas) | Aceptable | Aceptable | Aceptable |
| O/0 | Débil (geométrica pura) | Buena (0 más estrecho) | Buena | Buena |
| Legibilidad 13–16px | No diseñada para eso (es display) | **Excelente** — nació para UI | **Mala** — Optima es display; a 12–14px en pantallas 1x sus astas moduladas se ensucian | **Excelente** — humanista, pensada para texto |
| Números | Anchísimos, tabulares disponibles | Excelentes, `tabular-nums` real | Elegantes, proporcionales | Buenos, **sin cifras tabulares en la familia estándar** |
| Lectura larga | No | Sí | No | Sí |

**Riesgos concretos si se traslada cada sistema literalmente al CRM:**

1. **DAMAC**: botones y labels a **12px EN MAYÚSCULAS con +0.10em** — para 60+ es lo peor de ambos mundos: las mayúsculas eliminan la silueta de palabra y 12px queda por debajo del mínimo cómodo. El body "300" de Roboto es nominal (renderiza 400), pero si alguien lo clonara con una cara 300 real, el contraste caería. Termina en una tabla de 30 filas convertiría cada cabecera en un bloque ancho e ilegible.
2. **EMAAR**: mismo problema en nav/footer (12px caps), y **el body móvil baja a 12px**. Optima solo funciona porque nunca la usan por debajo de 22px — esa regla hay que conservarla religiosamente. A zoom 125% ambos sobreviven bien (px relativos, sin truncados medidos).
3. A favor de ambos: line-heights ≥1.33 en texto, jerarquías simples de 3 niveles, y cuerpos (Roboto/Lato) de primerísima legibilidad.

**Veredicto 60+:** los CUERPOS de ambos (Roboto/Lato) son excelentes; los sistemas de DISPLAY son de marketing y necesitarán tamaños mínimos más altos en el CRM (eso es fase de rollout, no de este estudio). Entre los dos, EMAAR es estructuralmente más seguro porque su fuente de trabajo (Lato) cubre el 95% de la superficie y el display queda acotado a ≥22px.

---

## §7 — INTERNAL CRM FIT

| Criterion | DAMAC | EMAAR |
|---|---:|---:|
| Readability 60+ | 2.5/5 | **3.5/5** |
| Operational density | 2/5 | **4/5** |
| Numerical clarity | **4/5** | 3/5 |
| Luxury character | 4/5 | **4.5/5** |
| CRM suitability | 2.5/5 | **4/5** |
| Multilingual robustness | 3.5/5 | 4/5 |
| Licensing practicality | 3/5 | 3/5 |

Una línea por nota:
- *Readability:* Roboto y Lato empatan en cuerpo; DAMAC pierde por poner Termina caps en cada control interactivo a 12px.
- *Density:* Termina es extra-ancha (su fallback necesita `size-adjust: 138%`): en tablas/sidebars consume ~35% más de ancho que una sans normal; Optima solo aparece en títulos y no toca la trama densa.
- *Numerical:* Roboto tiene cifras tabulares reales y compactas; Lato estándar no trae `tnum`, y un CRM vive de columnas de cifras (mitigable con `font-variant-numeric` fallback o usando Lato solo fuera de columnas numéricas).
- *Luxury:* Optima (Zapf) da el registro "premium clásico" que BCP busca sin dejar de ser sans; Termina da "premium contemporáneo/agresivo", más ruidoso en uso diario.
- *CRM suitability:* el sistema EMAAR ya está estructurado como un CRM (display acotado + sans de trabajo); el de DAMAC es un sistema de campaña.
- *Multilingual:* ambos cubren español completo; Lato/Roboto con soporte extendido; Termina y la Optima de EMAAR (400, un solo peso) son las piezas limitadas.
- *Licensing:* empate — cada uno tiene exactamente una fuente comercial y una libre (detalle en §15).

---

# PART D — AUDITORÍA TIPOGRÁFICA DEL SMARTBC ACTUAL

## §8 Fuentes de tipografía (verificado, no asumido)

**Único punto de carga en la app Next.js** — `app/layout.tsx:38-57` vía `next/font/google`, variables montadas en `<html>` (`app/layout.tsx:71-74`):

| Familia | Pesos | Variable CSS | Token Tailwind (`tailwind.config.ts:35-39`) |
|---|---|---|---|
| **Cinzel** | 400–700 | `--font-cinzel` | `font-display` |
| **Playfair Display** | 400–700 + italic | `--font-playfair` | `font-serif` |
| **Inter** | variable (todos) | `--font-inter` | `font-sans` ← **default del body** (`app/globals.css:12`) |

Más un **segundo sistema en `/web`** (marketing): `app/web/portal.css:1` importa por CDN Google Fonts **Cormorant Garamond + Montserrat** y los aplica con `!important` bajo `.portal-web` (y una clase `.eyebrow` global sin scope). Y un **tercer proyecto** aparte (`portal-web/`, TanStack) que replica ese mismo par por `<link>`.

- **0 archivos de fuente en el repo** (los `.woff2` de `.next/` son artefactos de build de next/font).
- **0 `@font-face` manuales**, **0 `<link>` a font-CDNs en la app Next**, **5 estilos inline tipográficos** en total (irrelevante).
- No hay `fontSize`, `letterSpacing` ni `mono` custom en Tailwind config — `font-mono` (78 usos) cae al stack por defecto.
- PDFs (`lib/pdf/*`): Helvetica/Times-Bold (fuentes base PDF). Emails: Georgia/Arial. No comparten identidad con la web.

## §9 Mapa de uso cuantificado

Base: 322 `.tsx` en `app/` + `components/`. **3.385 declaraciones de tamaño**, de las cuales **54,7% son arbitrarias** (`text-[Npx]`, 1.851 occ, 45 valores distintos).

| Current pattern | Approx usage | Where | Problem |
|---|---:|---|---|
| `font-serif` (Playfair) | 233 occ / 113 files (≈133 en admin) | títulos de sección/módulo, KPIs, avatares | el "serif de título" no es sistemático: módulos enteros (captaciones ×11 files, configuracion ×10, dashboard) no lo usan |
| `font-display` (Cinzel) | 160 occ / 35 files | `/web`, `/v`, `/s` + **fuga a admin** en `portal-links` (3 occ) | tipografía client-facing dentro del CRM |
| `font-sans` explícito | 96 occ / 21 files (47 en `portal-links/`) | resets | síntoma: un módulo pintado en editorial que resetea línea a línea |
| `font-mono` | 78 occ / 36 files | refs, IDs, logs | sin token `mono` en el tema — queda fuera de cualquier cambio global |
| Micro-tamaños 8–13.5px | **1.745 occ** (`text-[11px]` ×645, `text-[12px]` ×390, `text-[10px]` ×290, `text-[13px]` ×166 …) | todo el admin | 13 escalones distintos entre 8 y 14px conviviendo con `text-xs`/`text-sm` (1.251 occ más) |
| Pesos | 1.685 occ: medium 1.082 + semibold 544 (96,5%), bold 32, normal 27 | — | el sistema real es binario; `font-bold` es residuo de 3 islotes |
| `uppercase` | 373 occ / 117 files (73% con tracking) | labels, th, eyebrows | **78 recetas distintas** de label; 6 tamaños entre 8 y 12px para el mismo rol |
| `tracking-*` | 301 occ, **17 valores** + 2 clases CSS `.vc-tracked*` | fractura por superficie: `[0.22-0.28em]` solo `/web`; `[0.14em]` canon admin; `wide/wider` mezclados | tres escalas paralelas para la misma función |
| `tabular-nums` | 17 occ / 13 files | KPIs, contadores | cientos de celdas de cifras/precios NO lo llevan; **Playfair no tiene cifras tabulares reales** |

## §10 Jerarquía real actual (leída de componentes, archivo:línea en los informes de detalle)

| Rol | Receta real dominante | Fuente |
|---|---|---|
| Sidebar item | `text-sm font-medium` Inter | `components/admin-sidebar.tsx:236` |
| Sidebar group label | `text-[10px] font-semibold tracking-[0.18em]` | `admin-sidebar.tsx:216` |
| Page title (canon, 21 páginas) | **Playfair** `text-3xl font-medium tracking-tight md:text-[2.5rem]` | `components/admin/admin-page-header.tsx:25` |
| Page title (Dashboard — no cumple) | Inter `text-2xl font-bold` | `admin/page.tsx:82` |
| Tabs | `text-[12px] font-medium` (2 impl.) / `text-sm font-medium` (1) | command-tabs, inbox-shell, mensajes-tabs |
| KPI número | 3 sistemas: Inter `text-3xl font-bold` / Playfair `text-3xl` / Playfair `text-[22px] tabular-nums` | page.tsx / stat-card / primitives |
| Table header | `text-[10px] font-semibold uppercase tracking-[0.14em]` (canon en 6 tablas; 8 desviaciones) | properties/clients/agencies tables |
| Table body | `text-sm` base + celdas `text-[11px]`–`text-[13px]` | ídem |
| Price | `font-semibold` heredando `text-sm`, **sin tabular-nums**; un input de precio en **Playfair** `text-xl` | properties table :844; idealista-form:989 |
| Badges | 3 familias: `text-[10.5px]` Pill / `text-[11px]` tablas / `text-[9px]` overlays | primitives:93 etc. |
| Buttons | 4 tamaños (`[11px]`, `[12px]`, `[13px]`, `sm`), siempre `font-medium`, 3 implementaciones de `Button` | ui/button, primitives, inline |
| Inputs | `text-[13px]` (primitives) pero 5 variantes (12, 12.5, 13, sm) | primitives:309 y modales |
| Form labels | 4 dialectos (10px/0.14em, 10.5px/0.07em, 11-12px sin caps) | primitives:323 vs modales |
| Modal title | Playfair `text-xl` con `font-medium` O `font-semibold` O `text-[16px]` sin peso | modal.tsx:84, primitives:291 |
| Empty states | 5 recetas | empty-state.tsx, primitives:216… |

## §11 Inconsistencias concretas (las que justifican este proyecto)

1. **Cuatro dialectos de H1** conviviendo: Playfair 3xl/2.5rem (canon), Inter bold 2xl (Dashboard — la primera pantalla del CRM incumple su propio canon), Playfair `[20px]`/`[22px]` sin peso (Inbox, ficha cliente), Inter bold 3xl gris (analytics/ip-management). Rango del mismo rol: 20→40px.
2. **18 recetas distintas de `<h2>`** en admin para 66 elementos (de `text-sm` a `text-2xl`, con/sin serif, medium/semibold/bold).
3. **78 recetas de label uppercase** (373 occ) — colapsables a 2-3 tokens.
4. **Escala micro de facto sin documentar**: 9/9.5/10/10.5/11/11.5/12/12.5/13/13.5px + `text-xs`/`text-sm` — ~3.000 ocurrencias en el mismo rango de 8-14px.
5. **Fuga client→admin**: `components/admin/clientes/portal-links/**` usa Cinzel + `.vc-tracked-sm` (lenguaje de `/v`) y necesita 47 `font-sans` de reset. Único cruce de frontera; el resto de superficies está limpio.
6. **Islotes sin marca**: analytics, ip-management, particulares-detail-modal y `components/ui/button.tsx` (¡azul `bg-blue-600`!) usan Tailwind genérico gris + bold.
7. **Overrides peligrosos para cualquier cambio de familia**: Playfair en avatares de círculo fijo (10 sitios), un `<input>` en Playfair (idealista-form:989), KPIs `font-serif + tabular-nums + leading-none` (Playfair no tiene tnum), y el `!important` de `/web` sobre `.font-display`/`.eyebrow`.

---

# PART E — GLOBAL MAPPING PLAN

## §12 Mapa semántico de roles BCP (sin implementar)

```text
crm-display        crm-page-title     crm-section-title
crm-body           crm-body-strong    crm-nav
crm-label          crm-meta           crm-table-header
crm-table-body     crm-price          crm-button
crm-input          crm-badge          crm-caption
crm-number
```

## §13 Mapeo exacto a DAMAC

| BCP role | DAMAC source role | Family | Weight | Size | Line-height | Tracking | Transform |
|---|---|---|---|---|---|---|---|
| crm-display | Hero H1 | Termina | 400 | 32px (mob 20) | 1.2 | 0.10em | uppercase |
| crm-page-title | H2 | Termina | 400 | 32px (mob 20) | 1.2 | 0.10em | uppercase |
| crm-section-title | H3/card title | Termina | 500 | 16px | 1.2 | 0.10em | uppercase |
| crm-body | Body p | Roboto | 400 | 16px | 1.4 | normal | none |
| crm-body-strong | Body medium | Roboto | 500 | 16px | 1.2–1.4 | normal | none |
| crm-nav | Nav item | Roboto | 400 | 14px | 1.5 | normal | none |
| crm-label | Accordion/eyebrow | Termina | 500 | 12px | 1.2 | 0–0.10em | uppercase |
| crm-meta / crm-caption | Caption | Roboto | 400 (nominal 300) | 12px | 1.2 | normal | none |
| crm-table-header | — `MAPPED — NO DIRECT WEBSITE ANALOG` (más cercano: eyebrow Termina 12/500 caps) | Termina | 500 | 12px | 1.2 | 0.10em | uppercase |
| crm-table-body | — `MAPPED — NO DIRECT WEBSITE ANALOG` (más cercano: caption Roboto 12) | Roboto | 400 | 12px | 1.2 | normal | none |
| crm-price / crm-number | Stats | Termina | 400–500 | 20px | 1.2 | 0.10em | none |
| crm-button | Button | Termina | 500 | 12px | 1.2 | 0.10em | uppercase |
| crm-input | Select/inputs | Roboto | 400 | 12px | 1.2 | normal | none |
| crm-badge | Slider control | Termina | 400 | 12px | 1.2 | 0.10em | uppercase |

## §14 Mapeo exacto a EMAAR

| BCP role | EMAAR source role | Family | Weight | Size | Line-height | Tracking | Transform |
|---|---|---|---|---|---|---|---|
| crm-display | Hero H1 | Optima | 400 | 46px (mob 28) | 1.25 | normal | uppercase |
| crm-page-title | H2 sección | Optima | 400 | 36px (mob 34) | 1.11 | normal | uppercase |
| crm-section-title | Card title | Optima | 400 | 24px (mob 22) | 1.33–1.4 | normal | uppercase |
| crm-body | Body p | Lato | 400 | 14px (mob 12) | 1.43 | normal–0.025em | none |
| crm-body-strong | Footer head | Lato | 500→400 real (usar 700 si hace falta contraste) | 14px | 1.43 | 0.10em | opcional |
| crm-nav | Nav | Lato | 400 | 12px | 1.33 | 0.10em | uppercase |
| crm-label | Eyebrow | Lato | 400 | 14px | 1.43 | 0.14em | uppercase |
| crm-meta / crm-caption | Card metadata | Lato | 400 | 12px | 1.33 | 0.17em | none |
| crm-table-header | — `MAPPED — NO DIRECT WEBSITE ANALOG` (más cercano: nav/footer link Lato 12/400 caps 0.10em) | Lato | 400 | 12px | 1.33 | 0.10em | uppercase |
| crm-table-body | — `MAPPED — NO DIRECT WEBSITE ANALOG` (más cercano: body 14/400) | Lato | 400 | 14px | 1.43 | normal | none |
| crm-price | Price row | Lato | 400 | 12px | 1.33 | 0.17em | uppercase |
| crm-number | — `MAPPED — NO DIRECT WEBSITE ANALOG` (los KPI grandes serían Optima 24 "711,399 sqm") | Optima | 400 | 24px | 1.4 | normal | none |
| crm-button | Button primary | Lato | 700 | 12px | 1.33 | 0.10em | uppercase |
| crm-input | Filter/dropdown | Lato | 400 | 16px | 1.5 | normal | none |
| crm-badge | Utility button | Lato | 600→700 real | 12px | 1.33 | 0.05em | uppercase |

## §15 Licencias / disponibilidad

| Fuente | Foundry | Modelo web | ¿En repo? | ¿Obtenible legalmente? | Fallback |
|---|---|---|---|---|---|
| **Termina** | Fort Foundry (Mattox Shuler) | **Comercial.** (a) Adobe Fonts con Creative Cloud — pero sirve desde CDN de Adobe, incompatible con la política "todo self-hosted en el VPS" salvo licencia de self-hosting; (b) licencia webfont one-time del foundry o YouWorkForThem (tiers por pageviews desde ~1× el precio desktop, $35+/estilo — un CRM interno cae en el tier mínimo) | No | Sí, comprando | Arial (así lo hace el propio DAMAC, `size-adjust: 138%` — delata lo ancha que es) |
| **Roboto** | Google | Libre (OFL/Apache), Google Fonts / next-font | No (trivial de añadir) | Sí, gratis | Arial |
| **Optima** | Linotype / **Monotype** (Hermann Zapf) | **Comercial.** Licencia webfont vía Monotype/MyFonts (pago por pageviews o perpetua self-host). macOS la trae como fuente de sistema, pero eso **no** licencia el embedding web | No | Sí, comprando | La propia EMAAR declara fallback de sistema; en Windows no existe → caería a sans genérica (por eso EMAAR usa `font-display: optional`) |
| **Lato** | Łukasz Dziedzic | **Libre (SIL OFL)**, Google Fonts / next/font | No (trivial) | Sí, gratis | Arial ajustada |
| Ya en repo | — | Inter (OFL), Playfair (OFL), Cinzel (OFL) vía next/font | Sí | — | — |

**LICENCE BLOCKER (matizado):** ninguna de las dos referencias es 100% reproducible gratis — cada una tiene exactamente una fuente de pago (Termina / Optima) y una libre (Roboto / Lato). En ambos casos la fuente de pago cubre SOLO el display; la ruta legal es una licencia webfont self-hosted de bajo tier (CRM interno = tráfico mínimo). Diferencia práctica: con EMAAR, el 95% de la superficie del CRM (Lato) es gratis desde el día uno y Optima puede llegar después (o sustituirse temporalmente mientras se compra); con DAMAC, Termina toca también botones, labels y cabeceras de tabla — la pieza de pago está incrustada en la trama operativa.

---

# PART F — INPUT PARA LA DECISIÓN FINAL

*(Hechos en las Partes A–E; esto es síntesis + recomendación separada.)*

## DAMAC — strongest reasons
- Sistema ultra-consistente y fácil de tokenizar: una regla (Termina caps +0.10em / Roboto resto) y solo 2 pesos por familia.
- Roboto es de lo mejor que existe para UI densa: cifras tabulares reales, hinting impecable a 12–14px.
- Identidad muy diferenciada y contemporánea; nadie confundiría el CRM con un template.
- Todo self-hosted vía next/font — arquitectura idéntica a la que smartbc ya usa; migración mecánica.
- Los números protagonistas (Termina extendida) darían unos KPI espectaculares.

## DAMAC — risks
- Termina en mayúsculas está en TODOS los controles (botones, labels, tabs): trasladado a un CRM denso multiplica el ancho (~+35%) y castiga la lectura 60+ a 12px.
- I/l/1 y O/0 débiles en la fuente que precisamente pintaría referencias y cifras de cabecera.
- La fuente de pago es la que más superficie operativa toca — sin ella no hay sistema.
- El peso 600 que usan en H1 no existe (síntesis del navegador): el "sistema" tiene menos caras reales de las que aparenta.
- Estética de campaña, no de herramienta: el riesgo de fatiga visual diaria es real.

## EMAAR — strongest reasons
- Estructura ya-es-un-CRM: display acotado a ≥22px (Optima) + sans de trabajo (Lato) para el 95% restante — es la misma arquitectura serif-título/sans-cuerpo que smartbc intenta tener hoy con Playfair+Inter, pero coherente.
- Lato es gratuita, completa (300/400/700 + itálicas), muy legible a 13–14px y amable con 60+.
- Optima aporta el registro "lujo clásico atemporal" (es la solución tipográfica del lujo desde hace 60 años: perfumería, joyería, hospitality) con un solo peso y cero tracking — barata de gobernar.
- Respaldada por un brand system corporativo público y estable (guide enero 2025): la referencia no va a cambiar de un rediseño a otro.
- `font-display: optional` + un solo woff2 para el display = riesgo de CLS mínimo.

## EMAAR — risks
- Optima NO sirve por debajo de ~18–20px en pantallas 1×: si alguien la usa en celdas o labels, se degrada — necesita una regla dura de tamaño mínimo.
- Solo existe (en el uso de EMAAR) a peso 400: sin negrita de display; la jerarquía debe salir de tamaño, no de peso.
- Lato estándar no trae cifras tabulares: las columnas de precios necesitarán mitigación (o convivir con Inter/Roboto en celdas numéricas).
- Optima es comercial (Monotype) y en Windows no hay fallback digno: la compra no es opcional.
- Su patrón live de nav/labels a 12px caps con tracking es tan castigador para 60+ como el de DAMAC — no debe copiarse a ciegas en la trama densa.

## Technical recommendation

Separando hechos de opinión: **los hechos** (medidos) son que EMAAR gana en densidad operativa, legibilidad 60+ y encaje CRM (§7: 4/3.5/4 vs 2/2.5/2.5), que su fuente libre cubre el 95% de la superficie, y que su arquitectura display-acotado + sans-de-trabajo coincide estructuralmente con la que smartbc ya tiene a medias. **La recomendación técnica** basada solo en exactitud, legibilidad, CRM fit, licensing y mantenibilidad es: **EMAAR TYPOGRAPHY**, reproducida desde el live (Optima 400 CAPS ≥22px para display + Lato como fuente universal de trabajo), con dos salvaguardas no negociables en el futuro sprint: tamaño mínimo de Optima, y suelo de 13px/sentence-case en la trama operativa aunque el live de EMAAR use 12px caps en marketing. La decisión final es tuya.

---

# PART G — ROLLOUT FEASIBILITY (sin tocar nada)

## §16 Qué habría que cambiar

| Capa | Cambio | Esfuerzo |
|---|---|---|
| Font loading | `app/layout.tsx:38-57`: sustituir/añadir familias vía next/font (Lato/Roboto son `next/font/google`; Optima/Termina serían `next/font/local` con el woff2 licenciado en `public/fonts/` o `app/fonts/`) | 1 archivo |
| Tailwind tokens | `tailwind.config.ts:35-39`: redefinir `sans` y `serif`→(display elegido); añadir `mono` explícito | 1 archivo |
| Global CSS | `app/globals.css`: sin cambios estructurales (body ya hereda `font-sans`) | 0–1 |
| Herencia automática | **Todo `font-sans` implícito + los 233 `font-serif` + los 96 `font-sans` explícitos cambian solos** al redefinir los tokens — ese es el premio de que el repo use tokens y no familias literales (0 font-family hardcodeados en UI) | ~300 files gratis |
| Excepciones a editar a mano | portal-links (Cinzel+vc-*, 6 occ + 47 resets), idealista-form:989 (input Playfair), avatares serif en círculos fijos (~10 sitios), KPIs `tabular-nums` si el display elegido no trae tnum, islotes gray (analytics, ip-management, ui/button azul) | ~12–18 files |
| Scope `/web` | proteger: `portal.css` pisa `.font-display`/`.eyebrow` con `!important`; decidir si `/web`, `/v`, `/s`, `/compartir` se quedan como están (recomendado: sí, están fuera del scope) | 1 decisión |

**Estimación:** ~3 archivos de sistema + ~15 de excepciones con edición directa; **~300 heredan automáticamente**. Excepciones peligrosas: las 5 listadas en §11.7.

## §17 One-source-of-truth

- Carga central única en `app/layout.tsx` (ya es así) — prohibir `@import`/`<link>` de fuentes en CSS de segmento (hoy `/web` lo viola).
- Tokens semánticos tipo `crm-*` (§12) implementados como componentes de texto o clases `@layer components`, no como recetas repetidas.
- Retirar el significado de `font-serif`/`font-display` como elección por página: las 78 recetas de label y 18 de h2 colapsan a los 16 roles.
- Pesos aprobados: los que el sistema elegido tenga como caras reales (EMAAR: 300/400/700; DAMAC: 400/500). Tamaños aprobados: una escala de ~8 pasos que absorba los 45 valores arbitrarios actuales.
- Lint/CI: bloquear `text-[Npx]` y `tracking-[Nem]` nuevos fuera de los tokens (los 1.851 existentes se migran por fases).

## §18 Riesgos de migración medibles

| Riesgo | Con DAMAC (Termina) | Con EMAAR (Optima/Lato) |
|---|---|---|
| Ancho de fila/botón | **ALTO** — Termina ≈ +38% de ancho (su propio fallback usa `size-adjust:138%`); truncados en sidebar (`truncate` ya presente), botones y `min-w` de tablas | BAJO — Lato ≈ Inter en métricas; Optima solo en títulos |
| Truncation | celdas `truncate text-[11px]` truncarán mucho antes | casi neutro |
| Alineación numérica | mejor que hoy (Roboto tnum real) | **vigilar**: Lato sin tnum en precios/KPI |
| Modales/forms | labels caps más anchos | neutro |
| Mobile overflow | tabs y chips caps +0.10em desbordarán a 390px | neutro |
| Hydration/CLS | next/font con fallback métrico = igual que hoy | ídem; Optima con `optional` puede "aparecer" solo a la 2ª visita — decidir `swap` vs `optional` |
| Avatares/KPIs con `leading-none` | Termina asciende poco (69% override) — re-centrar círculos | Optima ascendentes largos — re-centrar círculos |

## §19 Matriz de QA visual obligatoria antes/después

Pantallas: Dashboard · Properties (listado) · Property editor · Agencies · Particulares · Publicación · Idealista (config + form) · Clients list · Client Command Center · Sales Inbox · Documentación · diálogos (new-property-modal, create-client-dialog, permissions-drawer) · sidebar móvil · forms (login incluido).
Viewports: **390 / 430 / 834 / 1024 / 1440 / 1920**, cada una a zoom 100% y 125%.
Checks por pantalla: truncados nuevos, altura de fila de tabla, ancho de botones/CTAs, wrapping del sidebar, alineación de columnas numéricas, overflow horizontal móvil, CLS en primera carga fría.

---

# REQUIRED APPENDIX — EXACT TYPOGRAPHY TOKENS

## DAMAC EXACT TOKENS

```text
FAMILIES
  display/ui-accent : Termina (Fort Foundry) — self-hosted next/font, 2 ficheros woff2
  text/ui           : Roboto — self-hosted next/font
  arabic            : GE SS Two (500) · Cairo (300,500) · El Messiri (400-700)
  declarada sin uso : Josefin Sans (variable 100-700)

STACKS (reales del CSS)
  __termina_3f6a3b, __termina_Fallback_3f6a3b        [fallback = local Arial, size-adjust 138.39%, ascent 69.37%]
  __Roboto_e81766,  __Roboto_Fallback_e81766         [fallback = local Arial, size-adjust 99.78%]

WEIGHTS (caras reales)
  Termina: 400, 500          (el 600 usado en H1 detail NO existe — síntesis)
  Roboto : 400, 500          (el 300 pedido en CSS renderiza 400)

SIZES (px, desktop → mobile)
  display L : 32 → 20        (H1/H2, y stats grandes)
  display S : 29 → 20        (H3 hero secundario)
  card title: 16 → 16
  stat      : 20-32 → 20
  body      : 16 → 16
  ui/caption: 12 → 12        (botones, labels, footer, inputs, meta)
  nav aux   : 14 → 14

LINE-HEIGHTS
  Termina (todo): 1.2
  Roboto body   : 1.4-1.5 (22.4/24 sobre 16)
  Roboto ui     : 1.2 (14.4 sobre 12)

LETTER-SPACING
  Termina: +0.10em SIEMPRE (3.2px@32, 2.9px@29, 2px@20, 1.6px@16, 1.2px@12)
  Roboto : normal

TEXT-TRANSFORM
  uppercase: todo Termina display + botones + labels + controles
  none     : body Roboto, stats numéricos

RESPONSIVE
  32→20px y tracking 3.2→2px en display; 16/12px invariantes
  botones y ui: invariantes

LOADING
  next/font, font-display: swap, preload de .p.woff2, fallbacks métricos Arial
```

## EMAAR EXACT TOKENS

```text
FAMILIES
  display : Optima — @font-face manual self-hosted (/fonts/optima.woff2 + .ttf)
  text/ui : Lato — self-hosted next/font
  arabic  : IBM Plex Sans Arabic (300,400,700)
  icons   : Font Awesome 6 Pro (300)

STACKS (reales del CSS)
  optima                                  [sin fallback declarado en la face; font-display: optional]
  Lato, "Lato Fallback"                   [fallback = local Arial, size-adjust 97.69%]

WEIGHTS (caras reales)
  Optima: 400 únicamente
  Lato  : 300, 400, 700    (500 y 600 pedidos en CSS resuelven a 400 y 700)

SIZES (px, desktop → mobile)
  display XL: 46 → 28      (H1)
  display L : 36 → 34      (H2 sección)
  display M : 24 → 22      (card/community title; también "número grande" tipo 711,399 sqm)
  lead      : 18 → 16      (Lato 300)
  body      : 14 → 12
  label     : 14 → 12/14
  ui/nav/btn: 12 → 12      (10px puntual en utility móvil)
  input/filtro: 16 → 16

LINE-HEIGHTS
  Optima 46: 57.5 (1.25) · 36: 40 (1.11) · 24: 32-36 (1.33-1.5)
  Lato body: 20 sobre 14 (1.43) · lead 28 sobre 18 (1.56) · ui 16 sobre 12 (1.33)

LETTER-SPACING
  Optima : normal SIEMPRE
  Lato   : labels/nav/botones 1.2-2px (0.10-0.17em) · body 0-0.35px

TEXT-TRANSFORM
  uppercase: TODO Optima + nav + botones + labels + footer links + precios de card
  none     : body, lead, metadata numérica

RESPONSIVE
  46→28, 36→34, 24→22, body 14→12; botones invariantes

LOADING
  Optima: @font-face manual, font-display: optional (anti-CLS)
  Lato  : next/font, font-display: swap, fallback métrico Arial
```

---

# FINAL QUESTIONS — RESPUESTAS EXACTAS

1. **¿Qué fuentes usa DAMAC live hoy?** Termina (Fort Foundry, 400/500) para todo display/botones/labels/cifras; Roboto (400/500) para cuerpo y UI; GE SS Two, Cairo y El Messiri para árabe; Josefin Sans declarada pero sin uso en las páginas medidas. Todo self-hosted vía next/font.
2. **¿Qué fuentes usa EMAAR live hoy?** Optima (solo 400, self-hosted `/fonts/optima.woff2`) para todos los headings, siempre uppercase; Lato (300/400/700) para absolutamente todo lo demás; IBM Plex Sans Arabic para árabe; Font Awesome 6 Pro para iconos.
3. **¿Coincide EMAAR live con sus brand guidelines?** A medias: Optima en titulares ✅ (tal como manda el guide de enero 2025); pero el cuerpo NO usa Adobe Garamond Pro ni Georgia — usa Lato ❌; y el árabe no usa GE Hili/GE SS ❌.
4. **¿Cuál tiene mejor legibilidad para agentes 60+?** EMAAR, por su fuente de trabajo: Lato (humanista, abierta) cubre el 95% de la superficie y el display queda acotado a ≥22px. El sistema DAMAC pone una display geométrica extra-ancha en mayúsculas a 12px en cada control. Ambos, eso sí, abusan de 12px caps en nav/labels — eso no debe copiarse literal.
5. **¿Cuál funciona mejor en tablas y formularios?** EMAAR (Lato 13-14px sentence case rinde como Inter hoy). Matiz a favor de DAMAC: Roboto tiene cifras tabulares reales y Lato no — para columnas de precios habría que mitigarlo.
6. **¿Cuál mantiene mejor sensación premium sin perder operatividad?** EMAAR: Optima es el registro clásico del lujo y solo ocupa los títulos; la operación queda en una sans neutra. DAMAC es más impactante pero su premium es de campaña publicitaria y satura en uso diario.
7. **¿Existe bloqueo de licencia para copiarla exactamente?** No absoluto, pero ninguna es gratis al 100%: Termina y Optima son comerciales (Fort Foundry/Adobe Fonts la primera; Monotype la segunda). Ambas se pueden licenciar como webfont self-hosted en el tier mínimo (CRM interno). Roboto y Lato son libres. Sin comprar la display: EMAAR queda operable al 95% (todo Lato), DAMAC queda sin sistema.
8. **¿Qué porcentaje del CRM heredaría el cambio global sin tocar componentes?** ≈95%. El repo no tiene font-family hardcodeadas en UI (0 inline relevantes): redefinir los 3 tokens (`sans`, `serif`, `display`) en `tailwind.config.ts` + `app/layout.tsx` propaga a los ~300 archivos. Solo ~15 archivos de excepciones necesitan mano.
9. **¿Qué componentes tienen overrides que impedirían una sustitución global limpia?** (a) `components/admin/clientes/portal-links/**` — Cinzel + `.vc-tracked-sm` + 47 resets `font-sans`; (b) el input Playfair de `idealista-form.tsx:989`; (c) avatares `font-serif` en círculos de tamaño fijo (~10 sitios); (d) KPIs `font-serif + tabular-nums + leading-none` (stat-card, primitives, overview-cards); (e) `app/web/portal.css` con `!important` sobre `.font-display` y `.eyebrow` global sin scope; (f) los islotes gray de analytics/ip-management y el `ui/button.tsx` azul, que ignoran cualquier token.
10. **¿Hay bloqueo técnico real para aplicar una de las dos a TODO el CRM interno?** No. La arquitectura (next/font + tokens Tailwind + body font-sans) es exactamente la correcta para el cambio; los riesgos son de licencia (comprar 1 fuente), de anchura (si es Termina) y de gobernanza (consolidar las 78 recetas de label y los 45 tamaños arbitrarios en tokens — que es el verdadero trabajo del sprint).

---

*Fin del estudio. Ninguna línea de código, CSS, paquete o fuente ha sido modificada o añadida. Decisión pendiente: DAMAC TYPOGRAPHY o EMAAR TYPOGRAPHY.*
