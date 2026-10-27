# Captaciones: mapa de zona y captación para un cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a `/es/admin/captaciones` una vista Mapa con pines de precio, zonas dibujables y captación en lote para un cliente elegido, con cruce por criterios y búsqueda con IA.

**Architecture:** La vista Mapa es una tercera vista de `ParticularesClient`. Un endpoint ligero devuelve pines (sin teléfono ni descripción); el cliente elegido aporta puntuaciones vía el cruce que ya existe (`getSuggestedParticulares`). El mapa es Leaflet con herramientas de edición propias (sin `leaflet-draw`), pines `divIcon` y capa canvas para los puntos. Sin migraciones.

**Tech Stack:** Next.js (App Router), React, Leaflet 1.9 (ya instalado), Tailwind con tokens del CRM, Supabase self-hosted, scripts de prueba `node --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-27-captaciones-mapa-cliente-design.md` (maqueta aprobada en `docs/superpowers/specs/assets/propuesta-mapa-captaciones-v4.html`).

## Global Constraints
- Solo España; Chile no se toca.
- Sin migraciones de base de datos. Si una tarea cree necesitar una, parar y preguntar.
- El endpoint de pines NO devuelve `phone`, `owner_name` ni `description`.
- Permisos: `particulares.view` para el mapa; `clientes.view` para elegir cliente; captar y guardar zona pasan por los gates existentes (`addPortalLinks`, acción de encargo).
- Máximo 300 enlaces por captación en lote.
- Colores y fuentes solo de `lib/theme/crm-palette.mjs` y de las clases `crm-*`/Tailwind existentes; nada de hex sueltos salvo los del mapa base y los pines.
- Todo texto de interfaz en español, frases en minúscula salvo la primera; mismo verbo en botón y confirmación («Captar» → «Captados 12»).
- No empujar a `main` ni a ninguna rama remota sin orden expresa: el push a `main` despliega solo.
- Un `fetch` externo necesita timeout (`AbortSignal.timeout`).

## Review Focus
- Anuncios sin coordenadas: no salen en el mapa pero se cuentan aparte («N sin ubicación»); el recuento del embudo coincide con el de la lista.
- Polígono con menos de 3 vértices, con vértices repetidos o autointersecado: se rechaza o se ignora sin romper la página.
- Zona enorme (toda Madrid): el endpoint limita a 2000 pines y dice «hay más, acerca el mapa».
- Cliente sin encargo suficiente (`insufficient_brief`) o sin preferencias: el mapa funciona sin puntuaciones y explica por qué.
- Captar dos veces el mismo anuncio: el segundo intento cuenta como «ya estaba», nunca duplica (lo garantiza `url_key` único).
- IA: respuesta del modelo que no es JSON válido, que cita ids fuera de la lista o que tarda más de 20 s no rompe la vista ni inventa criterios.
- Un rol sin `particulares.view` o un cliente fuera de su cartera recibe 403/404, no datos.

---

## File Structure
- `lib/geo/zone-geometry.ts` (nuevo): geometría pura de zonas.
- `lib/captaciones-map/pins.ts` (nuevo): tipos de pin y clasificación en estados.
- `lib/db/queries/particulares-map.ts` (nuevo): consulta de pines.
- `app/api/admin/particulares/map/route.ts` (nuevo): endpoint de pines.
- `app/api/admin/clientes/[clientId]/suggested-particulares/route.ts` y `lib/db/queries/suggested-particulares.ts` (modificar): devolver también el encargo resumido.
- `components/admin/captaciones-map/` (nuevo): `captaciones-map.tsx`, `use-zone-editor.ts`, `pin-marker.ts`, `map-toolbar.tsx`, `funnel-panel.tsx`, `pin-card.tsx`, `ai-bar.tsx`, `client-picker.tsx`, `map-theme.ts`.
- `app/[country]/(admin)/admin/particulares/particulares-client.tsx` (modificar): tercera vista «Mapa».
- `app/[country]/(admin)/admin/captaciones/captacion-actions.ts` (nuevo): acciones de servidor de captar y guardar zona.
- `app/api/admin/particulares/map-ai/route.ts` y `lib/captaciones-map/ai-rank.ts` (nuevos): búsqueda con IA.
- `public/geo/madrid-barrios.geojson` (nuevo, tarea 11).
- `scripts/test-captaciones-map.mts` (nuevo) y script `test:captaciones-map` en `package.json`.

---

### Task 1: Geometría de zonas

**Files:**
- Create: `lib/geo/zone-geometry.ts`
- Test: `scripts/test-captaciones-map.mts` (crear; añadir `"test:captaciones-map"` a `package.json` con el mismo patrón que `test:client-brief`)

**Interfaces:**
- Consumes: `ZonePolygon`, `ZonePolygonPoint` de `lib/zone-polygon.ts` (`[lng, lat]`).
- Produces:
  - `polygonAreaKm2(ring: ZonePolygon): number`
  - `polygonsAreaKm2(rings: ZonePolygon[]): number` (suma, sin descontar solapes)
  - `polygonBounds(rings: ZonePolygon[]): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null`
  - `circleToPolygon(center: ZonePolygonPoint, radiusM: number, steps?: number): ZonePolygon` (por defecto 48 pasos)
  - `isValidZoneRing(ring: ZonePolygon): boolean` (≥3 vértices distintos, área > 0, sin autointersección)
  - `insertMidpoint(ring: ZonePolygon, index: number): ZonePolygon` (inserta el punto medio entre `index` e `index+1`)
  - `removeVertex(ring: ZonePolygon, index: number): ZonePolygon` (no baja de 3 vértices: devuelve el mismo anillo)

- [ ] **Step 1: Escribir las pruebas que fallan** en `scripts/test-captaciones-map.mts`, con `node:assert/strict`:
  - un cuadrado de 0,01° de lado en Madrid (`[-3.70,40.40]…`) da `polygonAreaKm2` entre 0,92 y 0,97 (≈0,848 km × 1,113 km a 40,4° N);
  - `circleToPolygon([-3.7038,40.4168], 1000)` da un anillo cuya área está entre 3,0 y 3,3 km² y cuyos vértices distan 1000 m ±1 % del centro;
  - `isValidZoneRing` es `false` para 2 puntos, para tres puntos alineados y para un lazo (bowtie) y `true` para un triángulo normal;
  - `removeVertex` sobre un triángulo devuelve el mismo triángulo;
  - `insertMidpoint(triángulo, 0)` devuelve 4 vértices y el nuevo está en el punto medio exacto;
  - `polygonBounds([])` es `null`.
- [ ] **Step 2: Ejecutar** `npm run test:captaciones-map`. Esperado: falla con «Cannot find module».
- [ ] **Step 3: Implementar** las funciones en `lib/geo/zone-geometry.ts`. Área por proyección equirrectangular local (cos de la latitud media) con la fórmula del zapato; autointersección con comprobación de segmentos O(n²) (n ≤ 200, hay tope de vértices en `cleanPolygons`).
- [ ] **Step 4: Ejecutar** `npm run test:captaciones-map`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat(captaciones-mapa): geometría de zonas`.

---

### Task 2: Estados de pin y embudo

**Files:**
- Create: `lib/captaciones-map/pins.ts`
- Test: `scripts/test-captaciones-map.mts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `type MapPin = { id: string; lat: number; lng: number; price: number; operation: "rent" | "sale"; bedrooms: number | null; squareMeters: number | null; title: string; address: string | null; zone: string | null; coverUrl: string | null; portal: string | null; sourceUrl: string | null; isNew: boolean; isAgency: boolean; priceDropPct: number | null }`
  - `type PinTier = "match" | "partial" | "nomatch" | "out"`
  - `classifyPin(args: { inZone: boolean; score: number | null }): PinTier` — fuera de zona → `out`; en zona sin puntuación (sin cliente) → `partial`; `score ≥ 80` → `match`; `60–79` → `partial`; `<60` → `nomatch`.
  - `type Funnel = { inZone: number; priceOk: number; matches: number; newIn24h: number; avgPrice: number | null; withoutLocation: number }`
  - `computeFunnel(pins: MapPin[], inZoneIds: Set<string>, scores: Map<string, number>, opts: { maxPrice: number | null; operation: "rent" | "sale" | null; withoutLocation: number }): Funnel`
  - Sin cliente (`scores` vacío): `classifyPin` devuelve `"partial"` para anuncios en zona (todos se muestran con precio; nada es «encaja»), y `computeFunnel` devuelve `priceOk = inZone` y `matches = 0`.

- [ ] **Step 1: Pruebas que fallan**: `classifyPin({inZone:false,score:95})` = `out`; `{inZone:true,score:80}` = `match`; `{inZone:true,score:79}` = `partial`; `{inZone:true,score:59}` = `nomatch`; `{inZone:true,score:null}` = `partial`. `computeFunnel` con 5 pines (3 en zona, 2 con precio ≤ máximo, 1 con score 90, 1 `isNew`) da `{inZone:3, priceOk:2, matches:1, newIn24h:1}` y `avgPrice` igual a la media de los precios de los alquileres en zona, redondeada; con `inZoneIds` vacío todo es 0 y `avgPrice` es `null`.
- [ ] **Step 2: Ejecutar** y ver fallar.
- [ ] **Step 3: Implementar** en `lib/captaciones-map/pins.ts`.
- [ ] **Step 4: Ejecutar** y ver pasar.
- [ ] **Step 5: Commit** `feat(captaciones-mapa): estados de pin y embudo`.

---

### Task 3: Endpoint de pines

**Files:**
- Create: `lib/db/queries/particulares-map.ts`, `app/api/admin/particulares/map/route.ts`
- Modify: `lib/captaciones-map/pins.ts` (añadir `rowToMapPin`, puro, porque la consulta importa `server-only` y no se puede probar con el cargador de scripts)
- Test: `scripts/test-captaciones-map.mts` (parte pura)

**Interfaces:**
- Consumes: `isPointInAnyPolygon`, `decodeZonePolygons` de `lib/zone-polygon.ts`; `polygonBounds` (Task 1); `MapPin` (Task 2); `createAdminClient`; `fetchAllRows` y el patrón de `getParticularesIdsInPolygons` en `lib/db/queries/particulares.ts`; `requirePermission` de `@/lib/auth/guard`.
- Produces:
  - `rowToMapPin(row: Record<string, unknown>): MapPin | null` (en `lib/captaciones-map/pins.ts`; puro; `null` si faltan coordenadas o precio)
  - `getParticularesMapPins(args: { bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }; polygons: ZonePolygon[]; operation?: "rent" | "sale"; advertiser?: "particular" | "all"; showRetired?: boolean }): Promise<{ pins: MapPin[]; truncated: boolean; withoutLocation: number }>`
  - `GET /api/admin/particulares/map?bbox=minLng,minLat,maxLng,maxLat&zonePoly=<json>&operation=rent|sale&advertiser=particular|all` → `{ ok: true, pins: MapPin[], truncated: boolean, withoutLocation: number }`. 400 si `bbox` es inválido; 403 sin `particulares.view`.

- [ ] **Step 1: Pruebas que fallan** de `rowToMapPin`: fila completa → pin con `isNew` verdadero si `detected_at` < 24 h y `isAgency` verdadero si `advertiser_type === "professional"`; fila sin `latitude` → `null`; fila con `price` 0 → `null`; la salida nunca contiene las claves `phone`, `owner_name` ni `description` (recorrer `Object.keys`).
- [ ] **Step 2: Ejecutar** y ver fallar.
- [ ] **Step 3: Implementar** `getParticularesMapPins`: columnas `id, latitude, longitude, price, operation, bedrooms, square_meters, title, address, zone, cover_url, portal, source_url, detected_at, advertiser_type, price_drop_pct`; filtros `is_active`, `duplicate_of is null`, `taken_down_at is null`, `fraud_status is null`, `price > 0`, dentro del `bbox`; tope 2000 filas (`truncated` si hay más); recorte exacto por polígono con `isPointInAnyPolygon` cuando hay polígonos; `withoutLocation` = recuento de activos con `latitude is null` y el mismo filtro de operación/anunciante (consulta `head: true, count: "exact"`).
- [ ] **Step 4: Implementar la ruta** con `requirePermission("particulares", "view")`, validación del `bbox` (4 números finitos, mín < máx, lat/lng en rango) y `export const dynamic = "force-dynamic"`.
- [ ] **Step 5: Ejecutar** pruebas y `npx tsc --noEmit`. Esperado: PASS, sin errores en los archivos nuevos.
- [ ] **Step 6: Commit** `feat(captaciones-mapa): endpoint de pines`.

---

### Task 4: Mapa base con pines y tema claro/oscuro

**Files:**
- Create: `components/admin/captaciones-map/captaciones-map.tsx`, `pin-marker.ts`, `map-theme.ts`

**Interfaces:**
- Consumes: `MapPin`, `PinTier` (Task 2); `ZonePolygon`.
- Produces:
  - `CaptacionesMap(props: { pins: MapPin[]; tiers: Map<string, PinTier>; scores: Map<string, number>; selectedId: string | null; onSelect: (id: string | null) => void; onBoundsChange: (bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number }) => void; onMapReady: (map: L.Map) => void; theme: "light" | "dark" })`. No pinta polígonos: de eso se encarga el editor de la Task 5, que recibe la instancia por `onMapReady`. (cargado con `dynamic(..., { ssr: false })`, como `zone-draw-map.tsx`)
  - `buildPinIcon(pin: MapPin, tier: PinTier, theme: "light" | "dark", selected: boolean): L.DivIcon | null` (`null` para `out`, que se pinta como `circleMarker` de canvas)
  - `readStoredTheme(): "light" | "dark"` y `storeTheme(t)` con `localStorage` dentro de `try/catch`.

- [ ] **Step 1: Implementar** el mapa Leaflet con teselas de OpenStreetMap, `preferCanvas: true`, centro Madrid, y la capa de teselas con el filtro CSS de oscuro (`invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)`) cuando `theme === "dark"`; velo cálido del CRM (`--bcp-map-wash`) por encima.
- [ ] **Step 2: Pines**: `match` negro (dorado en oscuro) con precio; `partial` blanco con borde dorado y precio; `nomatch` punto de 12 px con el precio en `title`; `out` punto de 10 px en canvas. Punto dorado si `isNew`; borde discontinuo si `isAgency`. Precio: alquiler `1.350€`, venta `915k€`. Al superar 400 pines visibles, los `partial` y `nomatch` pasan a punto (solo los `match` conservan precio).
- [ ] **Step 3: Selección**: pulsar un pin llama a `onSelect(id)`; el pin seleccionado lleva anillo dorado. `onBoundsChange` se dispara con `moveend` y debounce de 350 ms.
- [ ] **Step 4: Verificación visual** con el harness de `/root/ux-harness` o una página de prueba temporal bajo `app/a/dev-preview/` (no se commitea): captura en claro y oscuro con 70 pines de ejemplo; comparar con la maqueta v4 y corregir diferencias.
- [ ] **Step 5: Commit** `feat(captaciones-mapa): mapa base con pines y tema`.

---

### Task 5: Editor de zonas (dibujar, editar, radio)

**Files:**
- Create: `components/admin/captaciones-map/use-zone-editor.ts`, `map-toolbar.tsx`
- Test: `scripts/test-captaciones-map.mts` (reductor puro)

**Interfaces:**
- Consumes: `isValidZoneRing`, `insertMidpoint`, `removeVertex`, `circleToPolygon` (Task 1).
- Produces:
  - `type EditorTool = "draw" | "edit" | "circle" | "barrio" | "iso"`
  - `type EditorState = { tool: EditorTool; polygons: ZonePolygon[]; draft: ZonePolygon }`
  - `zoneEditorReducer(state: EditorState, action: EditorAction): EditorState` (puro y exportado) con acciones `setTool`, `addDraftPoint`, `closeDraft`, `moveVertex`, `insertMidpoint`, `removeVertex`, `addCircle`, `setPolygons`, `clear`.
  - `useZoneEditor(map: L.Map | null, initial: ZonePolygon[], onChange: (p: ZonePolygon[]) => void): { state: EditorState; setTool(t: EditorTool): void; clear(): void }`
  - `MapToolbar(props: { tool: EditorTool; onTool(t: EditorTool): void; onClear(): void; hint: string; disabled?: Partial<Record<EditorTool, string>> })` — tarjeta de cristal con iconos, nombre en la herramienta activa, ayuda dentro de la tarjeta y herramientas deshabilitadas con su motivo en `title`.

- [ ] **Step 1: Pruebas que fallan del reductor**: `closeDraft` con 2 puntos no añade polígono; con 3 puntos válidos lo añade y vacía el borrador y pasa a `edit`; con un lazo lo rechaza (estado igual); `moveVertex` mantiene el número de vértices; `removeVertex` no baja de 3; `addCircle` añade un anillo válido; `clear` vacía todo; un máximo de 5 polígonos (el sexto se ignora).
- [ ] **Step 2: Ejecutar** y ver fallar.
- [ ] **Step 3: Implementar** el reductor y el hook (capas Leaflet propias: polígono con borde dorado continuo y brillo suave, vértices como anillos, puntos dorados de punto medio, doble clic en vértice lo quita; en `draw` clic añade y doble clic cierra; en `circle` clic fija el centro y arrastrar el radio con vista previa en metros). Emitir `onChange` con la lista completa tras cada cambio, con los vértices redondeados a 5 decimales (`encodeZonePolygons`).
- [ ] **Step 4: Implementar** `MapToolbar` con teclado: `Tab` recorre, `Enter` activa, `Esc` cancela el borrador; foco visible; `aria-pressed` en la herramienta activa.
- [ ] **Step 5: Ejecutar** pruebas; revisar a mano con captura que dibujar, mover y añadir vértices funcionan.
- [ ] **Step 6: Commit** `feat(captaciones-mapa): editor de zonas`.

---

### Task 6: Panel de embudo, ficha del pin y lista lateral

**Files:**
- Create: `components/admin/captaciones-map/funnel-panel.tsx`, `pin-card.tsx`, `map-results-list.tsx`

**Interfaces:**
- Consumes: `Funnel`, `MapPin`, `PinTier` (Task 2).
- Produces:
  - `FunnelPanel(props: { funnel: Funnel; areaKm2: number | null; clientName: string | null; captured: number | null })`
  - `PinCard(props: { pin: MapPin; score: number | null; reasons: string[]; warnings: string[]; clientName: string | null; onCapture?: () => void; capturing?: boolean; onClose(): void })`
  - `MapResultsList(props: { pins: MapPin[]; scores: Map<string, number>; selectedId: string | null; filter: "match" | "all" | "new"; onFilter(f): void; onSelect(id: string): void })`

- [ ] **Step 1: Implementar** `FunnelPanel` (cristal, tres barras proporcionales a «en zona», cifras con `tabular-nums`, «N sin ubicación» visible cuando > 0; sin cliente muestra solo «en zona», «nuevos» y «precio medio»).
- [ ] **Step 2: Implementar** `PinCard` con foto, precio con separador de miles, motivos (verde) y avisos (dorado), botones «Captar para {cliente}» (solo con cliente), WhatsApp y Ficha. Los avisos solo los ve el equipo (esta vista es solo admin).
- [ ] **Step 3: Implementar** `MapResultsList` con anillo de encaje (`conic-gradient`), pestañas Encajan/Todos/Nuevos y desplazamiento al elemento seleccionado.
- [ ] **Step 4: Verificación visual** con captura frente a la maqueta v4.
- [ ] **Step 5: Commit** `feat(captaciones-mapa): panel de embudo, ficha y lista`.

---

### Task 7: Integrar la vista Mapa en Captaciones

**Files:**
- Modify: `app/[country]/(admin)/admin/particulares/particulares-client.tsx` (selector de vista ~línea 364), `app/[country]/(admin)/admin/particulares/use-particulares-filters.ts` (parámetro `vista`)
- Create: `components/admin/captaciones-map/captaciones-map-view.tsx`

**Interfaces:**
- Consumes: todo lo anterior; `GET /api/admin/particulares/map` (Task 3); `encodeZonePolygons`/`decodeZonePolygons`.
- Produces: `CaptacionesMapView(props: { initialPolygons: ZonePolygon[]; filters: { operation?: "rent" | "sale"; advertiser: "particular" | "all" } })` y valor `"map"` en el selector de vista (`grid | list | map`, persistido en la URL como `vista=map`).

- [ ] **Step 1: Implementar** `CaptacionesMapView`: orquesta mapa + barra + embudo + lista + ficha; pide pines al cambiar `bbox`/polígonos/filtros (cancelando la petición anterior con `AbortController`); sincroniza `zonePoly` en la URL con `router.replace` sin recargar; calcula `inZoneIds` con `isPointInAnyPolygon`.
- [ ] **Step 2: Añadir** el botón «Mapa» (icono `Map` de lucide) al selector de `ParticularesClient`; en vista Mapa se ocultan la cuadrícula y la paginación y se muestran los filtros existentes de operación y anunciante.
- [ ] **Step 3: Estados vacío/error**: sin zona → mensaje «Dibuja una zona en el mapa para ver los anuncios que caen dentro»; error de red → aviso con «Reintentar»; `truncated` → «Hay más de 2000 anuncios: acerca el mapa o dibuja una zona más pequeña».
- [ ] **Step 4: Comprobar** que la vista Cuadrícula/Lista y el filtro de zona del modal siguen funcionando igual (captura antes/después) y que `?zonePoly=` abre el mapa con la zona ya dibujada.
- [ ] **Step 5: Ejecutar** `npx tsc --noEmit` y `npm run lint` sobre los archivos tocados.
- [ ] **Step 6: Commit** `feat(captaciones-mapa): vista Mapa en Captaciones`.

---

### Task 8: Elegir cliente y puntuaciones

**Files:**
- Create: `components/admin/captaciones-map/client-picker.tsx`
- Modify: `lib/db/queries/suggested-particulares.ts`, `app/api/admin/clientes/[clientId]/suggested-particulares/route.ts`, `components/admin/captaciones-map/captaciones-map-view.tsx`
- Test: `scripts/test-captaciones-map.mts`

**Interfaces:**
- Consumes: `GET /api/admin/clientes/search?q=` (devuelve `{ data: { id, full_name, email, … }[] }`); `getSuggestedParticulares`.
- Produces:
  - `ClientPicker(props: { value: PickedClient | null; onChange(c: PickedClient | null): void })` con `type PickedClient = { id: string; name: string }`; búsqueda con debounce de 250 ms; opción «Quitar cliente».
  - La respuesta de `suggested-particulares` añade `brief: { operation: "rent" | "sale" | null; maxPrice: number | null; minBedrooms: number | null; polygons: ZonePolygon[]; summary: string }` (resumen tipo «Alquiler · hasta 1.400 € · 2 hab.»). Es aditivo: los consumidores actuales no se rompen.
  - `buildScoreMap(suggestions: SuggestedParticular[]): Map<string, number>` (puro, en `lib/captaciones-map/pins.ts`; importar el tipo con `import type`, el módulo de origen es `server-only`).

- [ ] **Step 1: Prueba que falla** de `buildScoreMap`: dos sugerencias devuelven un mapa id→`matchScore`; lista vacía devuelve mapa vacío.
- [ ] **Step 2: Implementar** `buildScoreMap`; ejecutar la prueba.
- [ ] **Step 3: Extender** `getSuggestedParticulares` para devolver el `brief` resumido desde el `brief` que ya calcula (sin consulta nueva); ajustar la ruta para incluirlo en las respuestas `ok` y mantener los códigos de error existentes.
- [ ] **Step 4: Implementar** `ClientPicker` y conectarlo en la vista: al elegir cliente se piden sugerencias; la zona del cliente (`brief.polygons`) se carga en el editor si el mapa no tiene zona; las puntuaciones alimentan `tiers`, la lista y el embudo (`maxPrice` y `operation` del brief); la cabecera muestra «Captando para {nombre}» y su resumen.
- [ ] **Step 5: Casos límite**: `insufficient_brief` y `no_preferences` muestran un aviso con enlace a la ficha del cliente (`?encargo=editar`) y el mapa sigue funcionando sin puntuaciones; cliente de otro país → vacío explícito (ya lo devuelve la ruta).
- [ ] **Step 6: Ejecutar** pruebas y `npx tsc --noEmit`. Commit `feat(captaciones-mapa): elegir cliente y puntuaciones`.

---

### Task 9: Captar en lote y guardar la zona en el encargo

**Files:**
- Create: `app/[country]/(admin)/admin/captaciones/captacion-actions.ts` (`"use server"`: solo exporta funciones async), `lib/captaciones-map/capture.ts` (puro, con `toPortalLinkInputs`)
- Modify: `lib/db/queries/particulares-map.ts` (añadir `getParticularesMapPinsByIds(ids: string[]): Promise<MapPin[]>`), `components/admin/captaciones-map/captaciones-map-view.tsx`, `pin-card.tsx`
- Test: `scripts/test-captaciones-map.mts`

**Interfaces:**
- Consumes: `addPortalLinks(clientId, links, options)` de `app/[country]/(admin)/admin/clientes/portal-links-actions.ts`; `cleanPolygons` de `lib/clients/brief.ts`; el patrón de guardado de `client_preferences` de `clientes/[id]/actions.ts`.
- Produces:
  - `toPortalLinkInputs(pins: MapPin[], scores: Map<string, number>): PortalLinkInput[]` (en `lib/captaciones-map/capture.ts`, puro; `import type { PortalLinkInput }`; omite pines sin `sourceUrl`; `notes` = «Captado desde el mapa ({score}% de encaje)»; respeta el orden por puntuación descendente).
  - `captureForClient(clientId: string, pinIds: string[]): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }>` (acción de servidor: vuelve a leer los pines por id en el servidor, no confía en datos del cliente, y limita a 300).
  - `saveClientZone(clientId: string, polygons: ZonePolygon[]): Promise<{ ok: true } | { ok: false; error: string }>` (aplica `cleanPolygons`; exige `clientes` editar con el mismo gate que el guardado de encargo; actualiza solo `search_polygons`).

- [ ] **Step 1: Pruebas que fallan** de `toPortalLinkInputs`: omite pines sin URL, ordena por score, pone la nota con el porcentaje redondeado, trunca a 300.
- [ ] **Step 2: Ejecutar** y ver fallar; implementar; ver pasar.
- [ ] **Step 3: Implementar** `captureForClient`: gate, relectura de los pines por id con `getParticularesMapPins`-style (columnas mínimas) y llamada a `addPortalLinks`; devuelve los conteos de `inserted`/`skipped`.
- [ ] **Step 4: Implementar** `saveClientZone` sin tocar otros campos del encargo (`update` de una sola columna, `updated_at`).
- [ ] **Step 5: UI**: botón «Captar los N que encajan» con confirmación («Se añadirán N anuncios a la ficha de {cliente}»), resultado «Captados 12 · 3 ya estaban», y «Guardar zona en el encargo de {cliente}» con confirmación «Zona guardada»; ambos deshabilitados sin cliente, con el motivo en `title`.
- [ ] **Step 6: Recontar «ya captados»**: tras captar, los pines captados pasan a estado «captado» (marca visual en la lista) y el panel lo refleja.
- [ ] **Step 7: Ejecutar** pruebas, `npx tsc --noEmit`, `npm run lint`. Commit `feat(captaciones-mapa): captar en lote y guardar zona`.

---

### Task 10: Búsqueda con IA

**Files:**
- Create: `lib/captaciones-map/ai-rank.ts`, `app/api/admin/particulares/map-ai/route.ts`, `components/admin/captaciones-map/ai-bar.tsx`
- Test: `scripts/test-captaciones-map.mts` (parser)

**Interfaces:**
- Consumes: `aiComplete(opts)` de `lib/services/ai/chat.ts` (leer su `AICompleteOpts` antes de llamar); `requirePermission`.
- Produces:
  - `buildAiPrompt(query: string, candidates: { id: string; text: string }[]): { system: string; user: string }`
  - `parseAiRanking(raw: string, validIds: Set<string>): { criteria: string[]; matches: { id: string; satisfied: string[]; missing: string[] }[] }` (puro; tolera ```json…```, descarta ids fuera de `validIds`, devuelve vacío si no es JSON válido).
  - `POST /api/admin/particulares/map-ai` con `{ query: string; ids: string[] }` (máx. 200 ids, `query` ≤ 300 caracteres) → `{ ok: true; criteria: string[]; matches: {id, satisfied, missing}[] }`. Lee `title`, `address`, `attrs`, `description` de la tabla en el servidor; la descripción nunca se devuelve al navegador. Timeout de 20 s. 403 sin `particulares.view`; 429 si el mismo usuario pide más de 10 búsquedas por minuto.
  - `AiBar(props: { disabled: boolean; onResult(r: { criteria: string[]; matches: … }): void })`.

- [ ] **Step 1: Pruebas que fallan** de `parseAiRanking`: JSON válido → coincidencias; texto con valla ```json → igual; JSON con un id que no está en `validIds` → ese id descartado; texto basura → `{ criteria: [], matches: [] }`; `criteria` limitado a 6 elementos.
- [ ] **Step 2: Ejecutar** y ver fallar; implementar `buildAiPrompt` y `parseAiRanking`; ver pasar.
- [ ] **Step 3: Implementar la ruta** con límite de frecuencia en memoria por usuario, tope de 200 ids y `AbortSignal.timeout(20000)`; si la IA no está configurada (`AINotConfiguredError`) → 503 con «La IA no está configurada. Actívala en Configuración».
- [ ] **Step 4: UI**: al pulsar Enter se envían los ids en zona (máx. 200, los de mayor puntuación primero); los criterios salen como etiquetas de cristal bajo la barra; las coincidencias suman +12 al score mostrado (tope 99) y añaden «✦ IA» con los criterios cumplidos y los que faltan en la ficha del pin. Estado de carga con el campo deshabilitado y botón «Cancelar».
- [ ] **Step 5: Probar** contra el proveedor configurado con una consulta real si hay clave disponible; si no, documentar que solo se probó el parser. Commit `feat(captaciones-mapa): búsqueda con IA`.

---

### Task 11: Barrios (depende de la decisión abierta 1)

**Files:**
- Create: `public/geo/madrid-barrios.geojson` (reducido y simplificado), `lib/geo/barrios.ts`
- Modify: `use-zone-editor.ts`, `map-toolbar.tsx`

**Interfaces:**
- Consumes: acción `setPolygons` del reductor (Task 5), pasando `[...state.polygons, ring]` (el tope de 5 polígonos lo aplica el propio reductor).
- Produces: `loadBarrios(): Promise<{ id: string; name: string; district: string; ring: ZonePolygon }[]>` con caché en memoria; herramienta «Barrios» que pinta los barrios con borde fino, resalta al pasar el cursor y añade el barrio pulsado como un polígono más.

- [ ] **Step 1: Pausa**: no empezar hasta que el dueño confirme la fuente de los datos (datos abiertos del Ayuntamiento de Madrid, CC-BY). Si no se confirma, la herramienta queda deshabilitada con el motivo «Próximamente» y esta tarea se cierra sin código.
- [ ] **Step 2: Preparar** el GeoJSON (simplificar a ≤ 150 KB, un anillo por barrio, nombres coherentes con `lib/madrid-zones.ts`); añadir la atribución «Datos: Ayuntamiento de Madrid (CC-BY)» a la esquina del mapa.
- [ ] **Step 3: Prueba que falla** de `loadBarrios` con un GeoJSON mínimo de fixture: devuelve anillos `[lng, lat]` válidos (`isValidZoneRing`).
- [ ] **Step 4: Implementar** y conectar la herramienta; verificar con captura. Commit `feat(captaciones-mapa): barrios`.

---

### Task 12: Verificación final y revisión

**Files:** ninguno nuevo.

- [ ] **Step 1: Ejecutar** `npm run test:captaciones-map`, `npm run test:client-brief`, `npm run test:typography` y `npx tsc --noEmit`. Esperado: todo en verde.
- [ ] **Step 2: Ejecutar** `npm run lint` y revisar que no hay avisos nuevos en los archivos tocados.
- [ ] **Step 3: Recorrido manual** con el harness de capturas: sin cliente (dibujar zona, ver pines y embudo), con cliente (puntuaciones, captar, guardar zona), con IA, claro y oscuro, escritorio y móvil (390 px). Comparar con la maqueta v4.
- [ ] **Step 4: Comprobar permisos**: rol sin `particulares.view` recibe 403 en `/api/admin/particulares/map` y `/map-ai`; un asesor con alcance «solo lo suyo» no encuentra en el selector clientes ajenos.
- [ ] **Step 5: Revisión** con `superpowers:requesting-code-review` sobre toda la rama; arreglar lo confirmado.
- [ ] **Step 6: No empujar.** Dejar la rama `feat/captaciones-mapa-cliente` local y preguntar al dueño antes de subirla o fusionarla (el push a `main` despliega solo).
