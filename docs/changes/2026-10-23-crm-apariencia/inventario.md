# Inventario · Apariencia del CRM

Qué cubre el tema, qué se revisa a mano y qué queda protegido. Base: `origin/main` `36788970`. La columna «QA» se rellena en el «Resultado» de cada PR.

## 1. Cáscara y componentes compartidos

| Pieza | Archivo | Nota |
| --- | --- | --- |
| Cáscara ES/CL | `app/[country]/(admin)/layout.tsx` | Degradado de fondo y dos halos con colores literales → tokens. Monta el tema. |
| Cáscara legado | `app/(admin)/layout.tsx` | Igual (casi todas sus páginas redirigen a `/es/admin`). |
| Barra lateral | `components/admin-sidebar.tsx` | Ya oscura (`bg-ink text-cream-50`): debe seguir oscura. Logo con `filter` propio (se deja). Lleva el selector (PR3). |
| Cabecera de página | `components/admin/admin-page-header.tsx`, `components/language-switcher.tsx` | Desplegable de idioma. |
| Campana | `components/admin/notifications-bell.tsx` | Desplegable. |
| Primitivas | `components/ui/*` (modal, toast, card, button, skeleton, empty-state, pagination, stat-card, page-footer) | Compartidas con el portal del cliente: allí siguen en claro porque el portal no tiene el atributo. |
| Primitivas admin | `components/admin/ui/primitives.tsx`, `components/admin/property-search/*`, `components/admin/permissions/*` | Filtros, chips, interruptores. |
| Carga | `app/[country]/(admin)/admin/particulares/loading.tsx`, `components/ui/skeleton.tsx` | |

## 2. Páginas (las dos variantes de país comparten código)

`/es/admin` y `/cl/admin` + las rutas legado `/admin/*` (redirigen).

| Área | Rutas | Piezas con riesgo |
| --- | --- | --- |
| Inicio / panel | `admin`, `admin/dashboard`, `admin/mi-espacio` | `dashboard-greeting-card` (hex), `components/dashboard/*` |
| Propiedades | `propiedades`, `[slug]`, `[slug]/story`, `story-review`, `importar`, `importar/pdf` | `properties-admin-client` (hex, `bg-gold text-ink`), `property-edit-view` (hex, `iframe`), fotos, vídeo, etiquetas (colores de datos) |
| Catálogos (gestor) | `mi-espacio/catalogos/[id]`, `textos-aprobados`, `plantillas-zona` | `studio.module.css` (`--st-*` + retoques), `catalog-cover` incrustada (protegida) |
| Clientes | `clientes`, `clientes/[id]` | `client-detail-panel(-cl)` (hex), mapas Leaflet, enlaces del portal, itinerarios |
| Solicitudes | `solicitudes`, `solicitudes-documentacion` | `solicitudes-admin-client` (hex), avatar en portal |
| Captaciones (CL) | `captaciones`, `[id]`, `pipelines` | Mapa Leaflet |
| Particulares | `particulares`, `particulares/scraper` | `particular-modal` (portal, `recharts`, hex), visor de fotos (portal), tarjetas sobre foto, `zone-map`, `priority-select` |
| Agencias | `agencias`, `agencias/[id]` | `agency-*` (hex) |
| Calendario | `calendario` | `bg-gold text-ink` (botones, día de hoy) |
| Mensajes | `mensajes` | `team-chat` (hex), insignias doradas, `iframe` de Zinto (tercero) |
| Correo | `correo` | Vistas previas de correo en `iframe` (documento aparte, sin cambios) |
| Publicación | `publicacion`, `idealista`, `idealista/configuracion`, `portalinmobiliario`, `sindicacion`, `integraciones`, `integraciones/[slug]` | `publicacion-cl-client` (hex), `map-picker`, `idealista-form` |
| Informes | `reportes`, `analytics` (legado) | `reportes-client` (hex), `timeline-chart`, `device-chart` (`recharts`, hex) |
| Equipo | `usuarios` | Matriz de permisos, cajón |
| Ajustes | `configuracion`, `diagnostico`, `demo-setup`, `security/ip-management` | Formularios largos (correo, Zinto) con hex |

## 3. Pares que la regla general no resuelve (se arreglan uno a uno en PR2)

- **Texto tinta sobre dorado sólido** (`bg-gold … text-ink`): ~20 sitios (calendario, mensajes, particulares, propiedades, agencias, clientes, publicación, fotos, recomendaciones). En oscuro el texto tinta pasa a claro → `text-fixed-ink`.
- **Texto sobre foto**: rótulos y botones sobre imágenes con `bg-black/…` o `bg-ink/…` y `text-white` (siguen igual por diseño); revisar los que usen `text-ink` sobre `bg-white/…` encima de fotos.
- **Colores literales**: `bg-[#…]`, `text-[#…]` y hex en `style` (lista de ~50 archivos en la exploración): verde de WhatsApp (marca, se queda), `#856329` (dorado de texto) → token, degradados de las cáscaras → tokens, ejes y rejillas de gráficos → tokens.
- **Gráficos** (`recharts`): `timeline-chart`, `device-chart`, `particular-modal`. Series con sus colores; ejes, rejilla y tooltip con tokens.
- **Mapas** (Leaflet): teselas y controles propios del mapa sin tocar; solo el marco.
- **Colores de datos** (etiquetas de propiedades con color elegido por el usuario): se muestran tal cual.

## 4. Protegido (no recibe nunca el tema)

| Superficie | Por qué no cambia |
| --- | --- |
| Web pública `/web`, portal `(cliente)`, `/c`, `/compartir`, `/a`, `/p`, `/v`, `/s`, `/seleccion`, `/og`, login, `/dev-fixtures` | No montan la cáscara del CRM: el atributo nunca está; los tokens no existen y cada utilidad usa su color de siempre. |
| Portada del catálogo incrustada (`catalog-cover`) en la estantería y en «Portada y estilo» | CSS module con colores propios + envoltorio `.crm-theme-light`. |
| Vistas previas de correo, Zinto, YouTube/Vimeo | `iframe`: documento aparte. |
| PDF (`@react-pdf` en servidor) e impresión del navegador | Sin CSS / tokens solo `@media screen`. |
| Fotos, logos, vídeos, teselas | Sin filtros ni velos nuevos. |
