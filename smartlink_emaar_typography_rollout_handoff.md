# SMARTLINKS — EMAAR TYPOGRAPHY COMPLETE
## Handoff del rollout tipográfico SmartLink · 2026-08-20

## Scope
Solo las superficies SmartLink de propiedad: **`/compartir/[slug]`** y **`/c/[token]`**. Ambas renderizan el mismo componente `PublicPropertyView` (`app/compartir/[slug]/public-property-view.tsx`), así que el cambio se hizo una única vez ahí. Intactos y verificados: `/v`, `/s`, `/web`, portal cliente, CRM (que ya lleva su propio rollout), layouts, colores, spacing, funcionalidad, analytics y comportamiento de tokens.

## Scoping strategy
Nueva raíz **`.smartlink-root`** en el elemento raíz de `PublicPropertyView`. Los tokens `crm-*` de `app/globals.css` pasaron de `.crm-root .crm-X` a `.crm-root .crm-X, .smartlink-root .crm-X`: **una sola definición, dos raíces**, bebiendo de las mismas variables (`--crm-font-sans`, `--crm-font-display`). Fuera de ambas raíces los tokens no actúan — cero riesgo de fuga a `/web`, `/v`, `/s` o portal cliente. `PropertyGallery` (compartida con el portal cliente) conserva sus clases legacy y lleva el token `crm-badge` al lado: solo se activa dentro del SmartLink.

## Font mapping aplicado
| Rol | Antes | Ahora |
|---|---|---|
| Título de propiedad | Playfair 30/36px medium | **Optima-stack 30/36px 400 uppercase** (`crm-page-title`) — QA con títulos largos reales: envuelve limpio a 390px |
| Títulos de sección (DESCRIPCIÓN, CARACTERÍSTICAS, UBICACIÓN, galería, CTA) | Playfair 20–24px medium | **Optima-stack 22/24px 400 uppercase** (`crm-section-title`) |
| Precio | Playfair 30/36px medium | **Lato 700** 30/36px tabular (`crm-number`) — jerarquía intacta |
| Operación (VENTA · PISO) | 11px caps 0.18em | **Lato 400 14px caps 0.14em** (`crm-label`, eyebrow EMAAR) |
| Referencia (Ref. BC-xxxx) | mono 10px | **Lato 700 12px** (meta técnica: Lato, ni Optima ni serif) |
| Descripción | 14px (16 solo desktop) | **Lato 400 16px** en todos los viewports, leading relajado |
| Specs (DORMITORIOS/BAÑOS/SUPERFICIE) | label 11px caps | label **12px caps** (`crm-label-sm`), valor Lato sentence case |
| Features/amenities | labels 11px caps | **`crm-label-sm`** + valores Lato 14px |
| Botones/CTAs (WhatsApp, Email, teléfono, copiar enlace) | 12–14px medium | **Lato 700 12px caps 0.10em** (`crm-button`, patrón EMAAR literal) |
| Badges (contador fotos, badge de galería) | 10–11px | **`crm-badge`** (Lato 700 12px caps) |
| Metadata/footer | 11px | **12px** (`crm-meta`) |
| Gallery/map/vídeo labels | 11px caps | **`crm-label-sm`** |
| Formularios | n/a — el "request viewing" de esta superficie son CTAs directos (WhatsApp/email/tel.), no hay inputs | regla de 16px lista en `crm-input` si se añaden |

Serif editorial eliminada por completo del scope SmartLink: **0 Playfair/Cinzel/Cormorant** computadas (verificado en producción con auditoría de computed styles).

## Optima license status
Sin cambios: **`OPTIMA_LICENSE_REQUIRED`**. No se descargó ni copió ninguna fuente. SmartLinks reutiliza exactamente el mismo integration point del CRM (variables centrales en `globals.css` + bloque comentado en `app/layout.tsx`): cuando llegue la webfont licenciada, **CRM y SmartLinks la heredan a la vez desde el mismo loader, sin assets duplicados**. Hasta entonces, fallback temporal (Optima de sistema en macOS/iOS → Candara/Segoe en Windows → Lato).

## Files changed (3)
- `app/globals.css` — tokens con doble raíz `.crm-root` / `.smartlink-root` (una definición).
- `app/compartir/[slug]/public-property-view.tsx` — raíz `smartlink-root` + mapeo completo (23 tokens; 0 serif, 0 microtexto <12px).
- `components/property-detail/property-gallery.tsx` — token `crm-badge` junto a clases legacy (compat portal cliente).

## Responsive QA (producción real, 2 SmartLinks vivos con datos reales)
Viewports **390 / 430 / 834 / 1024 / 1440 / 1920**, zoom **100% y 125%** (16 capturas). Auditoría automática por página: overflow horizontal, serif residual, Optima <22px, texto <11.5px, uppercase en textos >80 caracteres, errores JS. **Resultado: cero hallazgos.** Revisión visual manual de desktop y móvil: título largo real en caps envuelve sin clipping a 390px, precio legible y jerárquico, specs en una fila, descripción 16px cómoda, CTAs correctos, sin solapes nuevos.

## Regressions
- Build de producción ✅ (149/149, typecheck) · guardrail tipográfico admin ✅ (el scope SmartLink no lo afecta).
- Suites ✅: `test:viewing-collections` (proyección pública `/v` — sin UUIDs expuestos), `test:client-shortlist` (`/s`), `test:portal-links`.
- Token/expiry/noindex/proyección/`/p/` image proxy/analytics/stable share: **sin cambios de código** en `app/c/[token]/page.tsx`, rutas `/p/**`, ni lógica alguna — solo clases CSS en la vista. `/compartir` y `/c` responden 200 en producción con el sistema nuevo (deploy verificado a los 160s, marcador `smartlink-root`).
- `/web` verificada tras deploy en pasadas anteriores (Cormorant/Montserrat intactas); portal cliente conserva su tipografía vía clases legacy + scope.

## Known limitations
1. **Optima**: hasta la licencia, Windows ve Candara/Segoe en los displays del SmartLink (igual que en el CRM). No se declara reproducción exacta.
2. El mapa puede tardar en pintar en el primer scroll (lazy-load preexistente, ajeno a tipografía).
3. `PropertyGallery` mantiene deliberadamente su look legacy (11px badge) fuera del SmartLink; si el portal cliente recibe algún día su propio rollout, quitar el compat.

# SMARTLINKS — EMAAR TYPOGRAPHY COMPLETE
