# BCP CRM — EMAAR TYPOGRAPHY SYSTEM COMPLETE
## Handoff del rollout global de tipografía · 2026-08-20

## Estado legal de fuentes

| Fuente | Estado | Detalle |
|---|---|---|
| **Lato 300/400/700** | ✅ Activa | SIL OFL (libre), self-hosted vía `next/font/google`. Fuente universal de trabajo del admin. |
| **Optima 400** | ⚠️ `OPTIMA_LICENSE_REQUIRED` | **No hay woff2 licenciado en el repo** (verificado) y no se copió el de EMAAR. El display usa un fallback temporal: `Optima (sistema macOS) → Candara (Windows) → Segoe UI → Lato`. **La reproducción del display NO es 100% exacta en Windows hasta comprar la licencia** (Monotype/MyFonts, 1 sola cara: Regular 400). |
| Cinzel / Playfair / Inter | Sin cambios | Siguen cargadas en el root layout porque las superficies públicas protegidas las necesitan. **Ya no se usan en el admin.** |

**Integration point de Optima (cambio de 2 líneas cuando llegue la licencia):**
1. Fichero en `app/fonts/optima/optima-400.woff2` y descomentar el bloque `OPTIMA_LICENSE_REQUIRED` en [app/layout.tsx](app/layout.tsx) (añade `optima.variable` al `<html>`).
2. En [app/globals.css](app/globals.css) anteponer `var(--font-optima)` a `--crm-font-display`.
Todo el CRM hereda al instante: ningún componente conoce nombres de fuente.

## Carga de fuentes
- Central única en `app/layout.tsx` (next/font, self-hosted, `display: swap`, fallback métrico Arial → CLS contenido). Sin CDNs, sin `@import`, sin carga por componente.
- Elección `swap` (no `optional` como EMAAR live): en un CRM interno de sesiones largas preferimos que la fuente aparezca siempre; el fallback métrico evita saltos apreciables. Documentado en el propio layout.

## Tokens semánticos (app/globals.css, `@layer components`)

| Token | Receta (del benchmark EMAAR live) |
|---|---|
| `crm-display` | Optima-stack 400 · 46/28px · caps · tracking normal · lh 1.25 |
| `crm-page-title` | 36/30px · caps · lh 1.11 — h1 canónico de página |
| `crm-section-title` | 24/22px · caps — secciones, cards, modales |
| `crm-body` / `crm-body-strong` | Lato 400/700 · 14px · lh 1.43 |
| `crm-nav` | Lato 400 · 14px · tracking 0.02em (suelo 60+, no el 12px del nav marketing de EMAAR) |
| `crm-label` / `crm-label-sm` | Lato 400 caps · 14px/0.14em · 12px/0.10em |
| `crm-table-header` / `crm-table-body` | Lato 400 · 12px caps 0.10em / 14px |
| `crm-meta` / `crm-caption` | Lato 400 · 12px |
| `crm-price` / `crm-number` | Lato 700 · tabular-nums (ver limitaciones) |
| `crm-button` | Lato 700 · 12px · caps · 0.10em (patrón EMAAR literal) |
| `crm-input` | Lato 400 · 16px (además evita el auto-zoom de iOS) |
| `crm-badge` | Lato 700 · 12px · caps · 0.05em |

Ámbito: la clase **`.crm-root`** (en los dos layouts de admin, el login y los portales de modal/toast) fija Lato como familia por defecto de todo el árbol admin **sin tocar el body global** — las superficies públicas conservan Inter/Playfair/Cinzel y `/web` su Montserrat/Cormorant.

## Adaptación deliberada de accesibilidad (la única)
Suelo operativo 60+: cuerpo/tabla/nav **≥14px** en todos los viewports (no se reproduce el body móvil de 12px de EMAAR), labels ≥12px, inputs 16px, Optima nunca <22px, nunca uppercase en nombres de personas, títulos de propiedad, emails ni descripciones. Todo lo demás es el lenguaje EMAAR medido.

## Archivos y cobertura
- **151 archivos** (+2.503/−1.608): 3 de sistema (layout, tailwind, globals) + 2 layouts admin + login + primitivas compartidas (`components/admin/ui/primitives.tsx`, `admin-page-header`, `admin-sidebar`, `components/ui/*`) + ~140 archivos de módulos admin.
- Métricas antes → después (scope admin):

| Métrica | Antes (benchmark) | Después |
|---|---:|---:|
| `font-serif` (Playfair) | 133 | **0** |
| `font-display` (Cinzel, fuga portal-links) | 6 (+47 resets `font-sans`) | **0** |
| Microtexto ≤11.5px | ~1.100 | **0** |
| `tracking-[...]` arbitrario | ~80 | **0** |
| Tamaños arbitrarios | 45 valores | **2 (en escala: 22px, 28px)** |
| Recetas de label uppercase | 78 | **2 tokens** |
| Sistemas de h1 | 4 | **1** (`crm-page-title`; nombres propios en Lato bold sentence-case) |
| Tokens `crm-*` aplicados | 0 | **326** |

- Excepciones del benchmark, todas resueltas: Dashboard h1, Sales Inbox h1, Client Command Center header, captaciones sans-bold, analytics/ip-management (solo tipografía; colores intactos), input Playfair de idealista-form (→ `crm-input font-bold`), avatares serif (→ Lato bold), fuga Cinzel/vc-* de portal-links, `ui/button.tsx` (tipografía unificada; su azul NO se tocó — el sprint prohíbe cambiar color).
- `font-medium`/`font-semibold` residuales resuelven a caras REALES de Lato por el algoritmo de font-matching de CSS (500→400, 600→700): no hay pesos sintéticos.

## Guardrail (CI)
`npm run test:typography` → `scripts/check-crm-typography.mjs`: prohíbe en admin font-serif/font-display, tamaños y trackings arbitrarios fuera de escala, fontFamily inline y Optima <22px. En verde sobre 247 archivos.

## QA ejecutada
- **Build de producción** ✅ (149/149 páginas, typecheck activo).
- **Regresiones funcionales** ✅: `test:portal-links`, `test:viewing-collections` (proyección pública `/v`), `test:client-shortlist` (`/s`), `test:sales-inbox`, `test:command-center`, `test:idealista` (100/100).
- **QA visual con navegador real** (Playwright, 390/430/834/1024/1440/1920 × zoom 100% y 125%): login, `/web` (regresión de superficie pública, intacta) y una página harness con todos los tokens y contenido con forma real (títulos largos en español, nombres, emails, precios €/UF). Resultado: **16/16 asserts de computed styles correctos** (familias, tamaños, pesos, tracking, transform, carga de las 3 caras de Lato) y **cero overflow horizontal** en login/harness en todos los viewports y zooms. 36 screenshots archivados en la sesión de trabajo.
- **Superficies protegidas**: `git status` confirma **cero cambios** en `/web`, `/v`, `/s`, `/compartir`, `/c`, portal cliente, `components/property-detail` y `components/section-header`.

## Limitaciones conocidas
1. **Optima sin licencia** → en Windows el display cae a Candara/Segoe UI. No declarar la reproducción como exacta hasta integrar el fichero licenciado (2 líneas, ver arriba).
2. **Lato no trae cifras tabulares reales**: `crm-price`/`crm-number` declaran `tabular-nums` (inofensivo), pero la alineación de columnas de cifras es la natural de Lato. Si en la práctica molesta en alguna columna, la vía aprobada es un fallback numérico acotado — nunca Optima en tablas.
3. **Pantallas admin con datos reales no capturadas en local**: `.env.local` tiene placeholders (sin DB local), así que la QA visual de Dashboard/Properties/Clients con datos reales debe hacerse en producción tras el deploy — la estructura tipográfica está verificada por computed styles y el harness.
4. `ui/modal` y `ui/pagination` se comparten con el portal cliente: sus títulos/números heredan el sistema nuevo también allí (coherente; las 5 superficies públicas protegidas no los usan).
5. Los PDFs (`lib/pdf/*`, Helvetica/Times) y emails (Georgia/Arial) quedan fuera del scope, como en el benchmark.

## Gobernanza futura
Nada de `font-serif`/`font-display`/`text-[Npx]`/`tracking-[...]` nuevos en admin: usar tokens `crm-*` o la escala `text-xs/sm/base/lg`, `text-[22px]`, `text-2xl`, `text-[28px]`, `text-3xl`. El guardrail lo vigila; añadidlo al flujo de PR/CI cuando exista.
