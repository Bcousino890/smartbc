# 🏢 SmartBC — Web Pública Inmobiliaria 2026
## Especificación de Diseño + Integración CRM

---

## ✅ SYNC CON BASE DE DATOS (100% DEL CRM)

### Tablas Conectadas Directamente
```
✓ properties       → Catálogo/Filtros/Detalles
✓ property_photos  → Galerías multimedia
✓ agencies         → Directorio agencias
✓ profiles         → Asesores (advisors)
✓ visit_requests   → Solicitudes de visita
✓ favorites        → Favoritos del cliente
✓ client_preferences → Preferencias guardadas
✓ conversations    → Chat cliente-asesor
✓ messages         → Historial de mensajes
```

---

## 🌍 CONFIGURACIÓN REGIONAL Y MULTIIDIOMA

### Países & Divisiones
```
ESPAÑA:
├─ Madrileña
│  ├─ Madrid Centro
│  ├─ Salamanca
│  ├─ Chamberí
│  ├─ Justicia
│  ├─ Retiro
│  ├─ Chamartín
│  ├─ Almagro
│  ├─ Recoletos
│  └─ Malasaña
└─ Otras provincias (future)

CHILE:
├─ Santiago Metropolitano
│  ├─ Providencia
│  ├─ Las Condes
│  ├─ Vitacura
│  ├─ La Florida
│  └─ Otros...
└─ Regiones (future)
```

### Monedas & Conversión
```
ESPAÑA (es-ES):
├─ Moneda: EUR (€)
├─ Format: "1.250,50 €"
└─ Precisión: 2 decimales

CHILE (es-CL):
├─ Monedas: CLP ($), UF, USD (US$)
├─ Selector en header (default: CLP)
├─ Format CLP: "$1.250.500" (sin decimales)
├─ Format UF: "UF 45,50"
├─ Format USD: "US$ 1,250.50"
└─ Tasas: Actualizadas diariamente (API externa)

GLOBAL (en):
├─ Monedas: EUR, CLP, USD
├─ Format: "USD 1,250.50"
└─ Default por IP/ubicación
```

### Idiomas Soportados
```
URL Structure:
/es/  → Spanish (Spain + Chile)
/en/  → English
/es-CL/ → Spanish (Chile) [si diferencia futura]
```

---

## 🎨 IDENTIDAD VISUAL 2026 — LUJO MODERNO

### Paleta de Colores Premium
```
PRIMARY:
├─ Blanco Cremoso: #F8F7F5 (backgrounds amplios)
├─ Negro Profundo: #0F0F0F (texto principal)
└─ Gris Claro: #E8E6E1 (bordes, divisores)

ACCENT (Lujo):
├─ Gold Champagne: #D4AF37 (botones principales, hover)
├─ Copper: #B87333 (alternativa, detalles)
└─ Rose Gold: #D4A574 (subtle, accents)

SECONDARY:
├─ Gris Oscuro: #2A2A2A (texto secundario)
├─ Gris Medio: #6B7280 (metadata)
└─ Azul Midnight: #1A2B4A (detalles, links)

SEMANTIC:
├─ Verde (Disponible): #10B981
├─ Amarillo (Reservado): #F59E0B
├─ Rojo (Vendido): #EF4444
└─ Gris (Archivado): #9CA3AF

BACKDROP:
├─ Overlay Hero: rgba(0, 0, 0, 0.40)
├─ Overlay Modal: rgba(0, 0, 0, 0.50)
└─ Subtle Gradient: linear-gradient(135deg, #F8F7F5 0%, #E8E6E1 100%)
```

### Tipografía Elegante
```
HEADINGS:
├─ H1 (Hero): Playfair Display Bold, 48-64px, line-height 1.1
├─ H2 (Secciones): Montserrat Bold, 36-44px, line-height 1.2
├─ H3 (Subsecciones): Poppins Bold, 24-28px, line-height 1.3
└─ H4 (Cards): Poppins SemiBold, 18-20px, line-height 1.4

BODY:
├─ Párrafos: Inter Regular, 16px, line-height 1.6 (desktop)
├─ Párrafos: Inter Regular, 14px, line-height 1.6 (mobile)
├─ Small: Inter Regular, 14px, line-height 1.5
└─ Tiny (metadata): Inter Regular, 12px, line-height 1.4

ACCENTS:
├─ CTA Buttons: Poppins SemiBold, 14-16px
├─ Links: Raleway Medium, underline on hover
└─ Código/Ref: Courier New, 12px (monospace)

WEIGHTS USED:
├─ 400 Regular (body, defaults)
├─ 500 Medium (labels, subtle emphasis)
├─ 600 SemiBold (card titles, CTAs)
└─ 700 Bold (headings, strong emphasis)
```

### Espaciado & Layout Grid
```
Base: 4px → 8, 12, 16, 24, 32, 48, 64, 96

DESKTOP (1440px):
├─ Max Content: 1280px (centered)
├─ Side Margins: 80px (luxury breathing room)
├─ Vertical Rhythm: 64px entre secciones
└─ Card Gap: 32px

TABLET (768px):
├─ Max Content: 100% - 40px
├─ Side Margins: 20px
├─ Vertical Rhythm: 48px
└─ Card Gap: 24px

MOBILE (375px):
├─ Max Content: 100% - 16px
├─ Side Margins: 8px (minimal)
├─ Vertical Rhythm: 32px
└─ Card Gap: 16px
```

---

## 📱 RESPONSIVE DESIGN STRATEGY

### Breakpoints
```
Mobile:     0px - 374px  (smallest phones)
Mobile:   375px - 639px  (standard phones)
Tablet:   640px - 1023px (tablets, landscape)
Desktop: 1024px - 1439px (desktops)
Widescreen: 1440px+      (optimized)
```

### Adaptaciones por Breakpoint

**MOBILE (375px):**
- Tipografía: -20% tamaño
- Imágenes: 1:1 aspect ratio (cuadrados)
- Menú: Hamburguesa colapsada
- Filtros: Modal full-screen
- Grid: 1 columna
- Touch targets: 48px mínimo

**TABLET (768px):**
- Grid propiedades: 2 columnas
- Filtros: Sidebar 25% ancho
- Imágenes: 16:10 aspect ratio
- Tipografía: Normal
- Espaciado: Reducido 20%

**DESKTOP (1440px):**
- Grid propiedades: 3 columnas
- Filtros: Sidebar sticky 280px
- Imágenes: 16:10 aspect ratio optimizado
- Espaciado: Amplio (lujo)
- Hover effects: Full interactivity

### Optimizaciones Críticas
```
Images:
├─ Formatos: WebP (primary) + AVIF (next-gen)
├─ Fallback: JPEG
├─ Hero: 1440×900 (desktop), 768×600 (tablet), 375×400 (mobile)
├─ Grid: 400×300 (desktop), 300×225 (tablet), 375×280 (mobile)
├─ Lazy Load: Intersection Observer API
└─ CDN: Supabase Storage optimizado

Performance:
├─ Lighthouse Score: >80
├─ Core Web Vitals: GOOD
├─ First Paint: <1.5s
├─ Largest Contentful Paint: <2.5s
└─ Cumulative Layout Shift: <0.1
```

---

## 🏗️ ARQUITECTURA DE PÁGINAS

### 1️⃣ HOMEPAGE / HERO

#### Header (Fixed, Sticky)
```
Desktop Layout (1440px):
┌──────────────────────────────────────────────────────┐
│ Logo (60×40)  │ Nav Menu │ Moneda │ Lang │ Login/CTA │
└──────────────────────────────────────────────────────┘

Mobile Layout (375px):
┌────────────────────────────────────┐
│ Logo │         │ Moneda │ Hamburger │
└────────────────────────────────────┘

Components:
├─ Logo: 60px alto, clickeable a home
├─ Nav: [Inicio] [Catálogo] [Agencias] [Contacto]
│       └─ Desktop: Horizontal
│       └─ Mobile: Hamburger menu (slide-in left)
├─ Selector Moneda:
│  ├─ Dropdown (EUR, CLP, USD)
│  ├─ Ícono: 🔁 + "EUR" (text small)
│  ├─ Cookie: Persist en localStorage
│  └─ Hover: Mostrar rates
├─ Selector Idioma:
│  ├─ Dropdown (ES, EN)
│  ├─ Banderita + text
│  └─ Redirige a /es/ o /en/ si cambia
└─ CTAs:
   ├─ Botón secundario: "Iniciar Sesión" (link style)
   ├─ Botón primario: "Contactar Asesor"
   └─ Mobile: Stack vertical, ancho completo

Estilos:
├─ Background: Blanco cremoso (#F8F7F5)
├─ Shadow: 0 2px 8px rgba(0,0,0,0.04)
├─ Altura: 72px (desktop), 64px (tablet), 56px (mobile)
└─ Z-index: 100 (sobre contenido)
```

#### Hero Section (Full-width)
```
Layout:
┌────────────────────────────────────────────┐
│  [Imagen fondo / Video]                     │
│  Overlay gradiente (negro 40%)              │
│                                             │
│  "Vidas Extraordinarias                    │
│   en Ubicaciones Excepcionales"             │
│                                             │
│  Subtítulo subtle (2 líneas max)           │
│  [EXPLORAR CATÁLOGO]  [VER DESTACADAS]    │
│                                             │
│           ↓ (scroll indicator)              │
└────────────────────────────────────────────┘

Dimensiones:
├─ Desktop: min-height 700px, hero.cover
├─ Tablet: min-height 500px
├─ Mobile: min-height 400px, 100vw
└─ Aspect Ratio: 16:9 (videos), 4:3 (imágenes)

Contenido:
├─ H1: 60px (desktop), 36px (mobile), Playfair Bold
├─ Subtítulo: 18px (desktop), 14px (mobile), weight 400
├─ CTA Botones:
│  ├─ Primary: "Explorar Catálogo" (gold, large 56px)
│  ├─ Secondary: "Ver Destacadas" (text style)
│  └─ Stack: Horizontal (desktop), vertical (mobile)
└─ Scroll Indicator: Animated arrow down, 200ms pulse

Animaciones:
├─ Fade-in: 600ms ease-out (elementos)
├─ Stagger: 100ms entre elementos (top-down)
├─ Scroll indicator: Infinite pulse (pulsating)
└─ Hover CTA: Scale 1.05, shadow increase
```

#### Quick Search Bar (Overlay sobre hero)
```
Posición: Absolute, bottom -30px (half-in hero)
Background: White, shadow premium

Layout (3+ cols desktop, stack mobile):
┌────────────────────────────────────────────┐
│ Operación │ Duración │ Precio │ Habitaciones │
│ [Dropdown]│[Toggle]  │[Slider]│  [Dropdown]   │
│           │          │        │               │
│ Zona/Subzona │    Buscar     │
│ [Autocomplete]│   [Large CTA]│
└────────────────────────────────────────────┘

Fields (Synced from CRM):
├─ Operación (rent/sale):
│  ├─ Radio: Alquiler | Venta
│  └─ Mostrar duración SOLO si Alquiler
├─ Duración (short/long) - Conditional:
│  ├─ Radio: Corta | Larga
│  └─ Show only if operation === 'rent'
├─ Rango Precio:
│  ├─ Dual slider (min/max)
│  ├─ Dynamic based on country (EUR/CLP/USD)
│  └─ Actualizar en tiempo real
├─ Habitaciones:
│  ├─ Dropdown: Cualquiera, 1, 2, 3, 4, 5+
│  └─ Default: Cualquiera
├─ Zona/Subzona:
│  ├─ Autocomplete searchable
│  ├─ Mostrar subzonas cuando zona seleccionada
│  └─ Cargar zonas del DB (agencies.zones)
└─ Botón Buscar:
   ├─ Large CTA (gold background)
   ├─ Redirect: /catalogo?filters=...
   └─ Estado: Loading spinner si API lenta

Estilos:
├─ Padding: 32px
├─ Border-radius: 8px
├─ Background: #F8F7F5
├─ Shadow: 0 8px 32px rgba(0,0,0,0.12)
└─ Inputs: Borde 1px #E8E6E1, focus gold outline
```

#### Featured Section (Abajo del search)
```
"Propiedades Destacadas"

Grid: 3 cols (desktop), 1 col (mobile)
Carousel: Auto-scroll every 5s, manual arrows
Cards: Same as catalog cards (ver sección 2)

Filtro: Mostrar SOLO properties con badge:
├─ "exclusiva"
├─ "destacada"
└─ "premium"

Status filter: SOLO available (no reserved/sold)
Limit: 6 propiedades máximo
```

#### Trust Section
```
Stats animados:
├─ "150+ Propiedades" → Counter animado
├─ "25+ Años Experiencia" → Static
├─ "5000+ Clientes Satisfechos" → Counter
└─ "2 Países: España & Chile" → Static

Icons + grandes numbers + subtle descriptions
Animación: Cuando scroll llega a section (Intersection Observer)
```

#### CTA Section (Bottom)
```
"¿Listo para encontrar tu próximo hogar?"

Grande, impactante, botones prominentes:
├─ [Ver Catálogo] (primary)
└─ [Contactar Asesor] (secondary)
```

---

### 2️⃣ CATÁLOGO / LISTADO PROPIEDADES

#### Layout Principal (2 columnas)
```
┌─────────────────────────────────────────┐
│ Filtros Sidebar  │  Grid de Propiedades  │
│ (280px, sticky)  │  (3 cols, responsive) │
│                  │                       │
│ Zona/Subzona     │  [Card1] [Card2] [...] │
│ [+] Expandible   │  [Card4] [Card5] [...] │
│                  │  [Card7] [Card8] [...] │
│ Tipo Propiedad   │  [Paginación/Scroll]   │
│ [Checks]         │                       │
│                  │                       │
│ Operación        │                       │
│ [Radio]          │                       │
│                  │                       │
│ ... (ver abajo)  │                       │
└─────────────────────────────────────────┘

MOBILE: Filtros colapsables (hamburger icon top-left)
```

#### Filtros Sidebar (Sticky en desktop)
```
Estructura:
├─ ZONA / SUBZONA
│  ├─ Mapa interactivo pequeño (Leaflet 350×300)
│  │  └─ Click on zona/marker → update filters
│  ├─ [+] Expandible: Lista texto
│  │  ├─ Checkbox: Madrid Centro
│  │  ├─ Checkbox: Salamanca
│  │  │  └─ [Subzones collapse]
│  │  │     ├─ Recoletos
│  │  │     ├─ Castellana
│  │  │     └─ ...
│  │  └─ ...
│  └─ Search input para filtrar zonas
│
├─ TIPO DE PROPIEDAD
│  ├─ Checkbox: Apartamento
│  ├─ Checkbox: Penthouse (property_type=penthouse)
│  ├─ Checkbox: Casa (property_type=house)
│  └─ Checkbox: Comercial (property_type=commercial)
│
├─ OPERACIÓN (Compra/Alquiler)
│  ├─ Radio: Venta (operation=sale)
│  ├─ Radio: Alquiler (operation=rent)
│  └─ [Mostrar duración SOLO si Alquiler]
│
├─ DURACIÓN (Conditional - si rent)
│  ├─ Radio: Corta (stay=short)
│  └─ Radio: Larga (stay=long)
│
├─ RANGO PRECIO (Dual Slider)
│  ├─ Min: 0 (dynamic min del DB)
│  ├─ Max: 999,999 (dynamic max del DB)
│  ├─ Currency selector: EUR/CLP/USD
│  ├─ Conversion en tiempo real
│  └─ Display: "€1,250 - €5,000"
│
├─ HABITACIONES
│  ├─ Slider: 0 - 5+
│  ├─ Display: "Cualquiera" a "5+ Habitaciones"
│  └─ From: bedrooms >= X
│
├─ BAÑOS
│  ├─ Slider: 0 - 4+
│  └─ From: bathrooms >= X
│
├─ ÁREA (m²)
│  ├─ Slider: 0 - 500+
│  ├─ Display: "50 - 200 m²"
│  └─ From: square_meters >= X
│
├─ CARACTERÍSTICAS (Checkboxes múltiple)
│  ├─ ☐ Exterior (features array contains)
│  ├─ ☐ Amueblado (furnished)
│  ├─ ☐ Balcón (balcony)
│  ├─ ☐ Terraza (terrace)
│  ├─ ☐ Ascensor (elevator)
│  ├─ ☐ Cocina equipada (equippedKitchen)
│  ├─ ☐ Garaje (garage)
│  ├─ ☐ Piscina (pool)
│  ├─ ☐ Portero (doorman)
│  └─ ☐ Aire acondicionado (airConditioning)
│
├─ CERTIFICADO ENERGÉTICO
│  ├─ Checkboxes: A, B, C, D, E, F, G, Pendiente
│  └─ From: building_features.energyCertificate
│
├─ DISPONIBILIDAD
│  ├─ From: available_from date
│  ├─ "Disponible desde..." (date picker)
│  └─ Mostrar SOLO disponibles después de X fecha
│
└─ BOTONES
   ├─ [APLICAR FILTROS] (gold, large)
   ├─ [LIMPIAR TODO] (text style)
   └─ Mostrar contador de resultados: "23 propiedades"

Interactividad:
├─ Filtros aplican en tiempo real (debounced)
├─ URL actualiza con query params (shareable)
├─ Mobile: Drawer full-screen, sticky botones abajo
└─ Persist: Guardar filtros en session storage
```

#### Grid de Propiedades
```
Desktop: 3 columnas
Tablet: 2 columnas
Mobile: 1 columna

Gutter: 32px (desktop), 24px (tablet), 16px (mobile)

TARJETA PROPIEDAD:
┌─────────────────────────────┐
│ [Imagen] [Badge: Premium]    │
│ [Heart ❤️] en top-right      │
│                              │
│ PRECIO: €4.800/mes           │
│ Ubicación: Salamanca, Madrid │
│                              │
│ 🛏️ 3 Beds  🚿 2 Baths  📐135m² │
│                              │
│ ★★★★★ (5.0) - 24 reviews    │
│                              │
│ [VER DETALLES →]             │
└─────────────────────────────┘

Elementos Tarjeta:

IMAGE:
├─ Aspect ratio: 16:10 (cuadrado en mobile)
├─ Cover_photo_url de property
├─ Lazy load: Intersection Observer
├─ Hover: Scale 105%, shadow increase
├─ Fallback: Gray placeholder

BADGE (Conditional):
├─ Si badge == "exclusiva" → "Exclusiva"
├─ Si badge == "destacada" → "Destacada"
├─ Si badge == "premium" → "Premium"
├─ Posición: Top-left, 8px offset
├─ Background: Gold (#D4AF37) + text white
├─ Padding: 4px 12px
├─ Font: Poppins SemiBold, 11px

HEART (Favorito):
├─ SVG clickeable (top-right, 32px)
├─ Color: Gray by default
├─ Color: Red (#EF4444) si favorited
├─ Acción: Toggle favorite (POST /api/favorites)
├─ Auth: Redireccionar a login si no loggeado

PRICE:
├─ Font: Montserrat Bold, 24px
├─ Format: "€4.800" (EUR) o "$1.250.500" (CLP)
├─ Display currency symbol
├─ Si rent + short: "/mes"
├─ Si sale: just price
└─ Color: #0F0F0F

LOCATION:
├─ Font: Inter, 14px, gray (#6B7280)
├─ Format: "Zone, City"
├─ Ejemplo: "Salamanca, Madrid"
├─ Si subzone: "Zone > Subzone, City"
└─ Ejemplo: "Salamanca - Recoletos, Madrid"

STATS:
├─ Icons + number (gray text)
├─ 🛏️ Bedrooms
├─ 🚿 Bathrooms
├─ 📐 Square Meters
├─ Ejemplo: "3 🛏️  2 🚿  135 📐"
└─ Gap: 16px entre stats

RATING:
├─ Stars (⭐ color gold)
├─ Score (5.0) + review count (24 reviews)
├─ Solo si existen reviews
├─ Font: Small, gray

BUTTON:
├─ Text: "Ver Detalles →"
├─ Style: Text link, underline on hover
├─ Link: /property/[slug]
└─ Color: Midnight blue (#1A2B4A)

ESTADO VISUAL:
├─ If status === "sold": Opacity 50%, "VENDIDO" overlay
├─ If status === "reserved": Orange badge, "RESERVADO"
├─ If status === "archived": Gray bg, "ARCHIVADO"
└─ If status === "available": Normal

Interactividad:
├─ Hover: Card elevation +4px, shadow +200%
├─ Hover image: Zoom 105% + brightness slight decrease
├─ Click card: Navigate to detail page
└─ Mobile: Tap feedback (active state)
```

#### Paginación / Infinite Scroll
```
Option A - PAGINATION (Traditional):
[< ANTERIOR]  [1] [2] [3] [4] [5]  [SIGUIENTE >]
├─ 20 items per page
├─ URL: /catalogo?page=2&filters=...
└─ Botones: Previous/Next, page numbers

Option B - INFINITE SCROLL (Modern, default):
├─ Auto-load cuando scroll -> 200px from bottom
├─ Loading indicator: Skeleton cards fade-in
├─ Lazy load: Intersection Observer
└─ Reset cuando filtro cambia

Recomendación: Infinite scroll por default,
toggle a pagination en settings
```

#### Empty State
```
Si no hay resultados:
┌──────────────────────────┐
│      🔍 No encontrado    │
│                          │
│ "No hay propiedades que  │
│  coincidan tus filtros"  │
│                          │
│ Sugerencias:             │
│ • Amplía el rango precio │
│ • Prueba otra zona       │
│ • Contacta un asesor     │
│                          │
│ [LIMPIAR FILTROS]        │
│ [CONTACTAR ASESOR]       │
└──────────────────────────┘
```

---

### 3️⃣ DETALLE DE PROPIEDAD

#### Layout Principal
```
┌─────────────────────────────────────────────┐
│ [Header Sticky con Precio]                  │
├─────────────────────────────────────────────┤
│ GALERÍA MULTIMEDIA (Top)                    │
│ ┌─────────────────────────────────────────┐ │
│ │ [Imagen Principal - Fullscreen button]  │ │
│ │ [Visor con flechas next/prev]           │ │
│ └─────────────────────────────────────────┘ │
│ [Miniaturas horizontal scroll] 5/24        │
├─────────────────────────────────────────────┤
│ TWO-COLUMN LAYOUT (desktop, single mobile)  │
│                                             │
│ LEFT (70%):                                 │
│ ├─ Especificaciones                         │
│ ├─ Características (grid icons)             │
│ ├─ Descripción larga                        │
│ ├─ Condiciones (deposit, etc)               │
│ ├─ Mapa Leaflet                             │
│ └─ Preguntas frecuentes                     │
│                                             │
│ RIGHT (30%, sticky en desktop):             │
│ ├─ Card: Contacto Agencia                   │
│ ├─ Card: Perfil Asesor                      │
│ ├─ Card: Financiamiento                     │
│ ├─ Card: Solicitar Visita (form)            │
│ └─ [COMPARTIR]  [FAVORITO]                  │
├─────────────────────────────────────────────┤
│ PROPIEDADES SIMILARES (carousel)            │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                │
│ │ P1 │ │ P2 │ │ P3 │ │ P4 │  [>]            │
│ └────┘ └────┘ └────┘ └────┘                │
├─────────────────────────────────────────────┤
│ REVIEWS DE AGENCIA                          │
│ "Excelente servicio, muy profesionales"     │
│ ★★★★★ - Juan D. - verified buyer           │
└─────────────────────────────────────────────┘
```

#### Header Sticky (Al scroll)
```
Aparece cuando user scrolls > 200px

┌──────────────────────────────────────────┐
│ Referencia: BC-0042    Precio: €4.800/mes │
│ Salamanca, Madrid                         │
│ ❤️ Favorito   📞 Contactar   🔗 Compartir   │
└──────────────────────────────────────────┘

Sticky altura: 64px
Background: White with shadow
Opacity fade-in: 300ms ease-out
```

#### Galería Multimedia (Premium)
```
MAIN IMAGE VIEWER:
├─ Dimensiones: 100% width, 600px height
├─ Aspect ratio: 16:10 maintained
├─ Transiciones: Fade 300ms ease-out
├─ Navigation:
│  ├─ Left/Right arrows (large, gold on hover)
│  ├─ Keyboard: Arrow keys support
│  └─ Touch: Swipe left/right
├─ Fullscreen button (top-right):
│  └─ Alt + F para fullscreen
└─ Image counter: "3 / 24" (top-left)

LIGHTBOX FULLSCREEN:
├─ Dark overlay (rgba 0,0,0,0.95)
├─ Large image center
├─ Close button: X (top-right) o ESC key
├─ Navigation: Arrows o swipe
├─ Counter prominent
└─ Transition: Modal pop-in 200ms

THUMBNAIL STRIP (Horizontal scroll):
├─ Below main image
├─ Height: 80px
├─ Spacing: 8px between
├─ Each thumb: Clickable, highlight on active
├─ Scroll: Auto-scroll to active, arrows if overflow
├─ Show first 8, lazy load rest
└─ Aspect ratio: 16:10 consistent

VIDEO SUPPORT:
├─ If property.video_url exists:
│  ├─ Play button overlay on thumbnail
│  ├─ Click → Play in modal (YouTube-style)
│  └─ Autoplay: NO (respeto user)
└─ Video before photos in sequence
```

#### Especificaciones (Grid)
```
GENERAL SPECS:
┌────────────────────────────────┐
│ TIPO DE PROPIEDAD              │
│ Apartamento                    │
│                                │
│ ESTADO                         │
│ Excelente / Bueno / Reformar   │
│                                │
│ PLANTA                         │
│ 3ª Exterior                    │
│                                │
│ SUPERFICIE                     │
│ 135 m²                         │
│                                │
│ HABITACIONES                   │
│ 3 Dormitorios                  │
│                                │
│ BAÑOS                          │
│ 2 Baños Completos              │
└────────────────────────────────┘

BUILDING FEATURES:
┌────────────────────────────────┐
│ CALEFACCIÓN                    │
│ Gas Individual                 │
│                                │
│ AIRE ACONDICIONADO             │
│ Sí                             │
│                                │
│ CERTIFICADO ENERGÉTICO         │
│ Pendiente                      │
│                                │
│ DISPONIBLE DESDE               │
│ 15 de julio, 2026              │
└────────────────────────────────┘

Layout: 2 cols (desktop), 1 col (mobile)
Cards: Subtle borders, padding 16px
Font: Inter 14px, labels gray, values bold
Icons: Mini icons (🏠, 🔥, 💨, etc) optional
```

#### Características (Icon Grid)
```
Mostrar features como grid de ICONOS + LABELS

┌─────────┬─────────┬─────────┐
│ 🌞      │ 🚪      │ 🍳      │
│ Exterior│ Ascensor│ Cocina  │
│         │         │ Equipada│
├─────────┼─────────┼─────────┤
│ 🪴      │ 🏊      │ 🚗      │
│ Terraza │ Piscina │ Garaje  │
│         │         │         │
├─────────┼─────────┼─────────┤
│ 🛏️      │ 🚪      │ 🌡️      │
│ Amueblado│ Portero│ Aire    │
│         │ 24h    │ Acond.  │
└─────────┴─────────┴─────────┘

Grid: 3 cols (desktop), 2 cols (mobile)
Icon size: 32px
Label: Inter 14px, centered under icon
Spacing: 24px between items
Background: Subtle gray on hover

DATA SOURCE:
├─ features array (property.features)
├─ building_features.airConditioning
└─ building_features.heating type
```

#### Descripción Larga (Rich Text)
```
TÍTULO: "Descripción"

Mostrar: properties.description o longDescription

Formato:
├─ Rich text (markdown parsed)
├─ Paragraphs: line-height 1.6
├─ Links: Blue underline
├─ Max width: 80ch (optimal reading)
└─ Max height: 400px with "Leer más" collapse

RICH TEXT SUPPORT:
├─ Bold, Italic
├─ Bullet lists
├─ Numbered lists
├─ Links (internal + external)
└─ NO: Scripts, embeds (sanitize!)

"Leer más" Collapse:
├─ If length > 400px: Show first 400px
├─ Button: "Leer más..." (gold link)
├─ Expand: Smooth height animation 300ms
└─ Collapse back: "Leer menos"
```

#### Condiciones (Depósito, Garantía, etc)
```
Si property.conditions existe:

┌────────────────────────────────┐
│ CONDICIONES IMPORTANTES        │
│                                │
│ 💰 Depósito: 1 mes de renta    │
│ 🏦 Garantía: 1 mes de renta    │
│ 🛍️ Personal Shopper: 1 mes     │
│                                │
│ Contacta un asesor para más... │
└────────────────────────────────┘

Cards/List: Clear, large text
Icons: Semantic (money, guarantee, etc)
CTA: Link to "Contactar Asesor"
```

#### Mapa Interactivo (Leaflet)
```
TÍTULO: "Ubicación"

┌──────────────────────────┐
│ [Leaflet Map 100% width] │
│ ├─ Markers: Property loc │
│ ├─ Zoom: 15 by default   │
│ ├─ Drag + Wheel enabled  │
│ ├─ Tiles: OSM neutral    │
│ └─ Height: 400px         │
├──────────────────────────┤
│ 📍 Salamanca, Madrid     │
│ Barrio: Recoletos        │
│ Calle: [address field]   │
│ Lat: 40.4201, Long: -3.... │
└──────────────────────────┘

MARKER:
├─ Custom icon: Gold/copper color
├─ Popup on click: Property title + price
├─ Cluster if multiple nearby (future)
└─ Animation: Bounce on load

TILES:
├─ Use OpenStreetMap (free tier)
├─ Style: Light/neutral (CartoDB light)
└─ NO Google Maps (cost + privacy)

NEARBY AMENITIES (Future):
├─ Universidad icons
├─ Metro stations
├─ Parques
└─ Hospitales
```

#### Sidebar Derecha (Sticky)

##### Card: Contacto Agencia
```
┌─────────────────────────────┐
│ BENJAMÍN COUSIÑO PROPIEDADES │
│                             │
│ 📞 +34 915 123 456          │
│ 📧 info@bencousiño.com      │
│ 🌐 www.bencousiño.com       │
│ 💬 WhatsApp: +34915123456   │
│                             │
│ Horario:                    │
│ Lun-Vie: 09:00 - 19:00      │
│ Sáb: 10:00 - 14:00          │
│ Dom: Cerrado                │
│                             │
│ [LLAMAR] [EMAIL] [WHATSAPP] │
│                             │
│ ⭐ 4.8/5 (234 reviews)      │
│ Ver reseñas                 │
└─────────────────────────────┘

Card: Borde gold subtle, padding 20px
Logo: Agencia logo 80×60
Contact links: Botones pequeños, col layout
Hours: Gray text, small font
Rating: Stars + count (link a reviews)
```

##### Card: Perfil Asesor Asignado
```
┌─────────────────────────────┐
│ TU ASESOR INMOBILIARIO      │
│                             │
│ [Avatar 80×80]              │
│ María González              │
│ Asesor Senior Especialista  │
│                             │
│ "Especialista en Madrid     │
│  Centro y Salamanca"        │
│                             │
│ 📍 Zona: Salamanca, Centro  │
│ 🏆 15+ años experiencia     │
│ ✓ Hablo: ES, EN, FR         │
│                             │
│ [CONTACTAR] [PERFIL]        │
└─────────────────────────────┘

Avatar: Circular, 80px
Name: Font bold
Title: Gray, smaller
Bio: Italic, 14px
Expertise tags: Badges
Languages: Small text
CTAs: Botones secondary
```

##### Card: Financiamiento
```
┌─────────────────────────────┐
│ OPCIONES DE FINANCIAMIENTO  │
│                             │
│ 🏦 Hipotecas                │
│ Hasta 80% del valor         │
│ 20 años plazo máx           │
│                             │
│ 💳 Planes de Pago           │
│ Opción flexible pagos       │
│ Contacta asesor             │
│                             │
│ [MÁS INFORMACIÓN]           │
│ [CALCULADORA HIPOTECA]      │
└─────────────────────────────┘

Show only if status === 'sale'
(Financiamiento no para alquileres)

Links: Lead to financial tools/contacts
```

##### Form: Solicitar Visita
```
┌─────────────────────────────┐
│ SOLICITAR VISITA            │
│                             │
│ □ Nombre Completo *         │
│                             │
│ □ Email *                   │
│                             │
│ □ Teléfono                  │
│                             │
│ □ Fecha Preferida           │
│   [Date picker]             │
│                             │
│ □ Horario                   │
│   Mañana / Tarde / Flexible │
│                             │
│ □ Comentarios               │
│   [Text area]               │
│                             │
│ ☐ Acepto términos de...     │
│                             │
│ [SOLICITAR VISITA]          │
│                             │
│ Respuesta típica: 2h        │
└─────────────────────────────┘

Validación:
├─ Required: name, email
├─ Email format validation
├─ Phone: optional (parse local)
└─ On error: Red border + message

Submitted:
├─ Create visit_requests record
├─ Send email to agency + advisor
├─ Show success toast: "¡Solicitud enviada!"
├─ Auto-clear form
└─ Later: Show SMS confirmation

Auth:
├─ If logged in: Pre-fill name/email
├─ If not: Show after form [Iniciar sesión]
└─ Required to submit
```

---

### 4️⃣ PÁGINA AGENCIAS

#### Layout
```
┌──────────────────────────────┐
│ NUESTROS SOCIOS INMOBILIARIOS│
│ Trabajamos con las agencias  │
│ mas reconocidas de España    │
├──────────────────────────────┤
│ Grid de Agencias (2-3 cols)  │
│                              │
│ [Card1] [Card2]              │
│ [Card3] [Card4]              │
│ ...                          │
└──────────────────────────────┘
```

#### Card Agencia
```
┌──────────────────────────────┐
│ [Logo 120×80]                │
│                              │
│ NOMBRE AGENCIA               │
│ C/ Calle Principal, Madrid   │
│                              │
│ 45 Propiedades activas       │
│ Venta: 20  |  Alquiler: 25   │
│                              │
│ ⭐ 4.8/5 (34 reviews)        │
│                              │
│ 📞 +34 915 555 666           │
│ 📧 info@agency.com           │
│ 🌐 www.agency.com            │
│                              │
│ [VER PERFIL] [CONTACTAR]     │
└──────────────────────────────┘

Data from:
├─ agencies table
├─ agency_partnerships (comisiones)
├─ properties count (rent/sale)
├─ reviews (future)
└─ contact info
```

#### Perfil Agencia (Detail Page)
```
┌─────────────────────────────┐
│ BENJAMÍN COUSIÑO PROPIEDADES│
│ [Hero banner 1440×400]      │
│                             │
├─────────────────────────────┤
│ INFORMACIÓN                 │
│ Logo | Name | Contact       │
│                             │
│ Descripción                 │
│ Ubicaciones: 2 oficinas     │
│                             │
│ Team:                       │
│ [Advisor1] [Advisor2] [..] │
│                             │
│ Propiedades (grid):         │
│ [Prop1] [Prop2] [Prop3]     │
│ [Prop4] [Prop5] [Prop6]     │
└─────────────────────────────┘
```

---

### 5️⃣ PÁGINA CONTACTO

#### Layout Simple
```
┌────────────────────────────────┐
│ CONTACTA CON NOSOTROS         │
│ Responderemos en <2 horas     │
├────────────────────────────────┤
│ TWO COLUMN:                    │
│                                │
│ LEFT (Formulario):             │
│ ┌──────────────────────────┐   │
│ │ FORMULARIO DE CONTACTO   │   │
│ │                          │   │
│ │ □ Nombre Completo *      │   │
│ │ □ Email *                │   │
│ │ □ Teléfono               │   │
│ │ □ País (selector)        │   │
│ │ □ Asunto (dropdown)      │   │
│ │ □ Mensaje *              │   │
│ │   [Text area large]      │   │
│ │ □ He leído términos      │   │
│ │ [ENVIAR]                 │   │
│ └──────────────────────────┘   │
│                                │
│ RIGHT (Oficinas):              │
│ ┌──────────────────────────┐   │
│ │ ESPAÑA - MADRID          │   │
│ │ C/ Principal, 123        │   │
│ │ 28001 Madrid             │   │
│ │ 📞 +34 915 123 456       │   │
│ │ 📧 madrid@company.com    │   │
│ │                          │   │
│ │ Horario:                 │   │
│ │ Lun-Vie: 09:00 - 19:00   │   │
│ │ Sáb: 10:00 - 14:00       │   │
│ │                          │   │
│ │ [MAPA / DIRECTIONS]      │   │
│ └──────────────────────────┘   │
│                                │
│ CHILE - SANTIAGO               │
│ [...similar...]                │
└────────────────────────────────┘

Mobile: Stack single column
```

#### Validación y Envío
```
Validation:
├─ name: required, min 3 chars
├─ email: valid format
├─ message: required, min 10 chars
└─ On invalid: Show inline errors

Submission:
├─ POST /api/contact
├─ Send email to admin + asignados
├─ Show success toast
├─ Reset form
└─ Optional: SMS notification

Rate limiting:
├─ 5 emails por IP por hora
└─ Show error si limit exceeded
```

---

## 🎬 ANIMACIONES Y MICRO-INTERACCIONES

### Page Load
```
1. Fade-in hero (opacity 0 → 1, 600ms)
2. Elements stagger-down (100ms between):
   - Title
   - Subtitle
   - Search bar
   - CTA buttons
3. Search bar slides-up from 20px below (400ms)
4. Scroll indicator pulse (infinite)
```

### Hover Effects
```
BUTTONS:
├─ Scale: 1 → 1.05 (150ms)
├─ Shadow: Increase 200%
├─ Cursor: pointer
└─ Active: Scale 0.98 (click feedback)

CARDS:
├─ Transform: translateY -4px (200ms ease-out)
├─ Shadow: 0 4px 16px → 0 12px 32px
├─ Image zoom: 100% → 105% (300ms)
└─ Brightness: 100% → 95% (subtle)

LINKS:
├─ Underline: Slide-in from left (200ms)
├─ Color fade: gray → gold (200ms)
└─ Cursor: pointer

INPUTS:
├─ Border: #E8E6E1 → #D4AF37 (200ms)
├─ Shadow: none → 0 0 0 3px rgba(212,175,55,0.1)
└─ Background: subtle highlight
```

### Scroll Animations
```
HEADER:
├─ On scroll >100px: opacity 0.95
├─ Shadow fade-in (200ms)
└─ Transition: smooth

IMAGES:
├─ Lazy load: Fade-in 300ms when intersecting
├─ Blur-up: Optional (tiny blurred -> sharp)
└─ Parallax: Optional (scroll -20% at 50fps)

LAZY LOAD SKELETONS:
├─ Gray placeholder shimmer
├─ Fade-out when image loads
└─ Prevent layout shift (aspect ratio reserve)

COUNTER ANIMATIONS:
├─ On scroll to section: Animate numbers
├─ 0 → final value over 800ms
├─ Easing: ease-out
└─ Example: "150+" animate from 0

SCROLL REVEAL:
├─ Element opacity: 0 → 1 as it enters viewport
├─ Transform: translateY 20px → 0
├─ Duration: 400ms
└─ Offset: Start animation 50px before visible
```

### Loading States
```
BUTTONS:
├─ Disabled state: opacity 50%, cursor not-allowed
├─ Loading: Spinner icon (gold) + text fade-out
├─ Success: Checkmark animation (500ms)
└─ Error: Shake animation (200ms)

FORMS:
├─ On submit: Disable all fields
├─ Show spinner in button
├─ Prevent double-submit
└─ On error: Red flash, shake 200ms

INFINITE SCROLL:
├─ Show skeleton cards (3 placeholders)
├─ Fade-in when data arrives
└─ If failed: "Cargar más" button fallback
```

### Transitions
```
ROUTE CHANGES:
├─ Fade out: 200ms
├─ Fade in: 300ms
└─ Prevent: Disable navigation during transition

MODAL/DRAWER:
├─ Slide-in from right (250ms)
├─ Backdrop fade-in (200ms)
├─ On close: Reverse animation
└─ Easing: cubic-bezier(0.4, 0, 0.2, 1)

DROPDOWN/POPOVER:
├─ Scale: 0.95 → 1 (150ms)
├─ Opacity: 0 → 1 (150ms)
├─ Transform-origin: Top center
└─ On close: Scale 0.95, opacity 0
```

---

## 🔐 FUNCIONALIDADES DE USUARIO AUTENTICADO

### Login / Signup
```
Si no autenticado:
├─ Link: "Iniciar Sesión" en header
├─ Modal login:
│  ├─ Email input
│  ├─ Contraseña input
│  ├─ "Recordarme" checkbox
│  ├─ "¿Olvidaste la contraseña?" link
│  ├─ [INICIAR SESIÓN] button
│  └─ "¿No tienes cuenta?" + signup link
│
├─ Signup form:
│  ├─ Nombre completo
│  ├─ Email
│  ├─ Teléfono (optional)
│  ├─ Contraseña (con requisitos)
│  ├─ Confirmar contraseña
│  ├─ Acepto términos checkbox
│  └─ [CREAR CUENTA] button
│
└─ Auth via Supabase (self-hosted)

Redirect after login:
├─ If came from property: Return to detail
├─ If new visitor: Go to dashboard/preferences
└─ Remember referrer
```

### Dashboard Cliente (Future Expansion)
```
/dashboard (auth required)
├─ Perfil: Edit name, email, phone
├─ Mis Favoritos: Grid de guardados
├─ Mis Búsquedas: Saved searches
├─ Mis Visitas: Visit requests status
├─ Mensajes: Chat con asesor asignado
├─ Preferencias: Auto-match properties
└─ Configuración: Notificaciones, privacidad
```

### Favoritos
```
HEART ICON ON CARDS:
├─ If logged in:
│  ├─ Click → POST /api/favorites (add/remove)
│  ├─ Visual feedback: Turn red
│  ├─ Toast: "Agregado a favoritos"
│  └─ Toggle remove: Toast "Removido"
│
├─ If not logged in:
│  ├─ Click → Open login modal
│  ├─ After login: Add to favorites auto
│  └─ Toast: "Agregado a favoritos"
│
└─ Persist in DB (favorites table)

MY FAVORITES PAGE:
├─ /mis-favoritos (auth only)
├─ Grid de propiedades guardadas
├─ Filter/sort by: Price, date, zone
├─ Remove from favorites (heart click)
└─ Share link to favoritos
```

### Chat con Asesor
```
MESSAGING SYSTEM:
├─ If logged in + property detail:
│  ├─ Form at bottom: "Escribe aquí..."
│  ├─ Send button (paper-plane icon)
│  └─ Auto-create conversation on first msg
│
├─ Chat Interface:
│  ├─ Scroll to bottom on new message
│  ├─ Bubbles: Client (right, gold), Advisor (left, gray)
│  ├─ Timestamps: Hover on message
│  ├─ Read status: Check if advisor read
│  └─ Typing indicator: "Asesor está escribiendo..."
│
└─ Notifications:
   ├─ Desktop: Toast when new message
   ├─ Email: Digest si no online
   └─ Unread count in header
```

---

## ⚡ PERFORMANCE Y SEO

### SEO Meta Tags
```
DYNAMIC PER PAGE:

Home (/):
├─ title: "Propiedades de Lujo en Madrid y Chile | BC Propiedades"
├─ description: "Descubre propiedades exclusivas de venta y alquiler..."
├─ og:image: Hero image
└─ og:url: canonical

Property Detail (/property/[slug]):
├─ title: "[Título propiedad] - [Zona] | BC Propiedades"
├─ description: "[Primera línea descripción...]"
├─ og:image: Cover photo URL
├─ og:price: "[price] [currency]"
├─ structured-data: schema.org/Property
└─ canonical: Full URL

Catalog (/catalogo?filters=...):
├─ title: "Catálogo Propiedades | Filtros activos"
├─ description: "Venta y alquiler en [zonas...]"
├─ robots: "index, follow"
└─ canonical: Without query params
```

### Structured Data (Schema.org)
```
PROPERTY LISTING:
{
  "@context": "https://schema.org",
  "@type": "Property",
  "name": "[title]",
  "description": "[description]",
  "image": "[cover_photo_url]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[address]",
    "addressLocality": "[city]",
    "addressCountry": "[ES/CL]"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "[latitude]",
    "longitude": "[longitude]"
  },
  "pricingCurrency": "[EUR/CLP/USD]",
  "price": "[price]",
  "numberOfRooms": "[bedrooms]",
  "numberOfBathroomsUnitComplete": "[bathrooms]",
  "floorSize": {
    "value": "[square_meters]",
    "unitCode": "MTK"
  },
  "agent": {
    "@type": "RealEstateAgent",
    "name": "[agency_name]",
    "telephone": "[phone]"
  }
}

AGENCY:
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[agency_name]",
  "url": "[website]",
  "telephone": "[phone]",
  "email": "[email]",
  "address": {...},
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[rating]",
    "reviewCount": "[count]"
  }
}
```

### Performance Optimization
```
IMAGES:
├─ Format: WebP primary, AVIF next-gen, JPEG fallback
├─ Sizes: responsive srcset (400w, 800w, 1200w, 1600w)
├─ Lazy load: Intersection Observer
├─ Blur-up: Optional low-res placeholder
├─ CDN: Supabase Storage with caching headers
└─ Compression: Sharp optimize on upload

JAVASCRIPT:
├─ Code splitting: Route-based
├─ Tree-shaking: Unused code removal
├─ Minification: Prod build automatic
├─ Lazy load: Components on-demand
└─ Bundle: <100KB gzip

CSS:
├─ Utility-first: Tailwind CSS (purge unused)
├─ Critical CSS: Inline above-the-fold
├─ Split: Page-specific CSS async
└─ Variables: CSS custom properties

CACHING:
├─ HTTP: 3600s (1h) for static assets
├─ Service Worker: Offline fallback (future)
├─ Database: Supabase query caching
└─ API: 300s for filter options

METRICS TARGETS:
├─ Lighthouse Score: >80 (Performance)
├─ FCP: First Contentful Paint <1.5s
├─ LCP: Largest Contentful Paint <2.5s
├─ CLS: Cumulative Layout Shift <0.1
└─ FID: First Input Delay <100ms
```

### Accessibility (WCAG 2.1 AA)
```
CONTRAST:
├─ Minimum ratio 4.5:1 for normal text
├─ 3:1 for large text (>18px)
├─ Test: WebAIM contrast checker

KEYBOARD NAVIGATION:
├─ Tab order: Logical flow
├─ Focus visible: 3px outline
├─ Skip to main: Hidden link at top
├─ Escape: Close modals/menus
├─ Enter/Space: Activate buttons
└─ Arrow keys: Navigate carousels/maps

SCREEN READERS:
├─ Alt text: All images descriptive
├─ ARIA labels: Interactive elements
├─ Landmark regions: main, nav, footer
├─ Heading hierarchy: h1 → h2 → h3
├─ Form labels: Properly associated
└─ Link text: Descriptive, no "click here"

MOTION:
├─ prefers-reduced-motion: Respect
├─ Auto-play: Only on user interaction
├─ Flashing: Avoid (frequency >3Hz)
└─ Animations: <2s default
```

---

## 🏛️ ARQUITECTURA TÉCNICA

### Tech Stack
```
FRONTEND:
├─ Runtime: Node.js 18+
├─ Framework: Next.js 15 (App Router)
├─ Language: TypeScript 5.6+
├─ UI Library: React 19
├─ Styling: Tailwind CSS 3.4+
├─ Animations: Framer Motion (optional)
├─ Maps: Leaflet 1.9+ + react-leaflet
├─ State: Server Components (default)
├─ Auth: Supabase Auth (self-hosted)
└─ HTTP: Fetch API, SWR (optional)

BACKEND (Next.js API Routes):
├─ API Handler: pages/api/routes
├─ Database: Supabase PostgreSQL (self-hosted)
├─ ORM: Raw SQL via supabase-js
├─ Auth: Supabase JWT tokens
├─ Files: Supabase Storage (self-hosted)
├─ Email: Nodemailer
└─ Rate limiting: Upstash (if needed)

DEPLOYMENT:
├─ Host: Hetzner VPS (self-hosted)
├─ Server: PM2 (process manager)
├─ Reverse proxy: Nginx
├─ SSL: Let's Encrypt + auto-renewal
├─ DB: PostgreSQL in Docker
├─ Storage: Supabase Storage in Docker
└─ CI/CD: Git push → VPS pull (cron)

MONITORING:
├─ Logs: ELK stack o Datadog (future)
├─ Performance: Sentry (error tracking)
├─ Uptime: Uptime Robot
└─ Metrics: Custom analytics
```

### Database Queries
```
PROPERTIES LISTING:
SELECT
  p.id, p.slug, p.title, p.price,
  p.bedrooms, p.bathrooms, p.square_meters,
  p.zone, p.subzone, p.cover_photo_url,
  p.operation, p.stay, p.status, p.badge,
  a.name as agency_name
FROM properties p
LEFT JOIN agencies a ON p.agency_id = a.id
WHERE p.status = 'available'
  AND p.operation = $1  -- 'rent' or 'sale'
  AND (p.stay = $2 OR p.operation = 'sale')  -- short/long if rent
  AND p.price BETWEEN $3 AND $4
  AND p.bedrooms >= $5
  AND p.square_meters >= $6
  AND p.zone = ANY($7::text[])
ORDER BY p.created_at DESC
LIMIT 20 OFFSET $8;

PROPERTY DETAIL:
SELECT
  p.*,
  ARRAY_AGG(DISTINCT ph.url) as photos,
  a.*, ap.commission_pct
FROM properties p
LEFT JOIN property_photos ph ON p.id = ph.property_id
LEFT JOIN agencies a ON p.agency_id = a.id
LEFT JOIN agency_partnerships ap ON a.id = ap.agency_id
WHERE p.slug = $1
GROUP BY p.id, a.id, ap.id;

FAVORITES:
SELECT p.* FROM properties p
INNER JOIN favorites f ON p.id = f.property_id
WHERE f.client_id = $1;

AGENCIES LIST:
SELECT
  a.*,
  COUNT(CASE WHEN p.operation = 'rent' THEN 1 END) as rent_count,
  COUNT(CASE WHEN p.operation = 'sale' THEN 1 END) as sale_count,
  AVG(r.rating) as avg_rating,
  COUNT(r.id) as review_count
FROM agencies a
LEFT JOIN properties p ON a.id = p.agency_id AND p.status = 'available'
LEFT JOIN reviews r ON a.id = r.agency_id
GROUP BY a.id
ORDER BY a.name;
```

---

## 📱 DISEÑO RESPONSIVO DETALLADO

### Breakpoints Específicos
```
MOBILE FIRST APPROACH:

// Extra small devices (280-374px) - NO required
// Small phones (375-424px) - MIN target
@media (min-width: 375px) { ... }

// Regular phones (425-767px)
@media (min-width: 425px) { ... }

// Tablets (768-1023px)
@media (min-width: 768px) {
  .grid { @apply grid-cols-2; }
  .sidebar { width: 280px; }
}

// Desktops (1024-1439px)
@media (min-width: 1024px) {
  .grid { @apply grid-cols-3; }
  .sidebar { position: sticky; }
}

// Large screens (1440px+)
@media (min-width: 1440px) {
  .container { max-width: 1280px; }
  .grid { gap: 32px; }
}
```

### Mobile Optimizations
```
TOUCH:
├─ Minimum touch targets: 48×48px
├─ Spacing between targets: 8px minimum
├─ Thumb-friendly layout: Bottom 80% of screen
└─ No hover-only functionality

PERFORMANCE:
├─ Images: Lower resolution (400px max width)
├─ Disable animations > 2s
├─ Lazy-load below fold
└─ Minimal third-party scripts

USABILITY:
├─ Font size: 16px minimum (prevent zoom)
├─ Line height: 1.5 minimum
├─ Link underlines: Obvious or clear hit area
├─ Modals: Full-screen on mobile
├─ Forms: One column, large inputs
└─ Avoid horizontal scroll
```

---

## 🎯 CHECKLIST DE ENTREGA FINAL

HOMEPAGE:
- [ ] Hero section con video/imagen background
- [ ] Quick search bar funcional
- [ ] Featured properties carousel
- [ ] Trust stats animated
- [ ] CTAs prominentes

CATÁLOGO:
- [ ] Filtros sidebar (desktop + mobile modal)
- [ ] Grid de propiedades (responsive)
- [ ] Infinite scroll/pagination
- [ ] Price currency conversion
- [ ] Real-time filter updates

DETAIL PÁGINA:
- [ ] Galería multimedia (lightbox)
- [ ] Specs grid
- [ ] Rich text description
- [ ] Leaflet map con marker
- [ ] Solicitar visita form
- [ ] Chat sidebar con asesor
- [ ] Related properties carousel

AGENCIAS:
- [ ] Directory grid
- [ ] Agency profile pages
- [ ] Contact info
- [ ] Team profiles

GLOBAL:
- [ ] Header fixed con nav
- [ ] Moneda/idioma selector
- [ ] Login modal
- [ ] Responsive mobile-first
- [ ] SEO meta tags + structured data
- [ ] Lighthouse >80
- [ ] WCAG AA accessible
- [ ] Error boundaries
- [ ] 404 personalizado
- [ ] Loading states
- [ ] Toast notifications

---

## 📊 DATOS REALES DEL CRM

### Enums & Types a Usar
```
operation: 'rent' | 'sale'
stay: 'short' | 'long'  // Solo si rent
status: 'available' | 'reserved' | 'sold' | 'archived'
property_type: 'apartment' | 'penthouse' | 'house' | 'commercial'
property_state: 'excellent' | 'good' | 'needsRenovation'
heating: 'individualGas' | 'centralGas' | 'electric' | 'none'
airConditioning: 'yes' | 'no' | 'preInstalled'
energyCertificate: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'pending'
badge: 'exclusiva' | 'destacada' | 'premium'
features: ['exterior', 'furnished', 'balcony', 'terrace', 'elevator', 
           'equippedKitchen', 'garage', 'pool', 'doorman', 'airConditioning']
```

### Campos Obligatorios a Mostrar
```
ALWAYS SHOW:
├─ id, slug, title
├─ price, currency (calculated)
├─ bedrooms, bathrooms
├─ zone, city
├─ cover_photo_url
├─ operation (rent/sale)
├─ status
└─ agency info (if available)

OPTIONAL BUT IMPORTANT:
├─ square_meters
├─ subzone
├─ available_from
├─ features (array)
├─ building_features (JSON specs)
├─ latitude, longitude
├─ bc_reference
└─ badge (exclusiva/destacada/premium)

HIDDEN FROM PUBLIC:
├─ owner_name, owner_phone, owner_email
├─ internal_notes
├─ source_url
├─ external_id
└─ created_by/updated_at (timestamps)
```

---

## 🚀 PRÓXIMOS PASOS (ROADMAP)

**Phase 1 (MVP - 4 semanas):**
- Homepage + Hero
- Catálogo básico con filtros
- Detalle propiedad
- Contacto/visita form

**Phase 2 (2-3 semanas):**
- Login/Signup
- Dashboard cliente
- Favoritos persistentes
- Chat asesor

**Phase 3 (Ongoing):**
- Reviews/ratings
- Financiamiento calculator
- Advanced search
- Admin panel
- Analytics dashboard

---

**Versión:** 2.0 (Completo CRM Sync)
**Última Actualización:** 2026-06-21
**Estado:** LISTO PARA DISEÑO EN GAMMA / FIGMA
```
