# SMARTLINK 2.0 — GOOGLE MAPS ZONE EXPLORER
## Handoff · 2026-08-21 · Fases A y B · **cutover BLOQUEADO por credenciales**

---

# ⛔ BLOQUEADOR — leer esto primero

**No existe ninguna credencial de Google Maps en el proyecto.** Comprobado en
los dos entornos:

| Dónde | Resultado |
|---|---|
| `.env.local` local | sin variable de Google |
| `.env.local` del VPS | sin variable de Google (hay Supabase, Smartproxy, CRON, Zinto) |
| Código (`app`, `lib`, `components`) | cero referencias a `maps.googleapis.com` o `google.maps` |

Sin **clave de navegador** y sin **Map ID** no se puede: cargar el SDK, crear
el estilo de marca (vive en el Map ID, en Cloud Console), resolver un sitio
pulsado, ni hacer la QA visual que exige el §35.

El §44 del brief es explícito para este caso: *"If any production credential /
compliance requirement is unavailable: ship behind flag/staging only and
report the blocker. Do not hardcode fake credentials."* Es exactamente lo que
se ha hecho. **No se han inventado credenciales ni se ha simulado una QA que
no se puede ejecutar.**

## Lo que hace falta para desbloquear

1. Proyecto de Google Cloud con **facturación activa**.
2. **Maps JavaScript API** habilitada. **Places API (New)** habilitada.
   Routes **NO** hace falta para el MVP.
3. **Map ID** de tipo *JavaScript / vector*, con el estilo
   `BCP LUXURY LIGHT` creado en Cloud Console (§15) — así el color se ajusta
   sin desplegar código.
4. **Clave de navegador** restringida por *HTTP referrer* a
   `bcousinoprop.com/*` y `portal.bcousinoprop.com/*`, y por API a las dos de
   arriba. **Nunca una clave sin restringir en el repositorio.**
5. Alertas de facturación y **cuotas por API** (§25).
6. Revisión de **términos EEA**, cookies y atribución (§26) — bloquea la
   salida a producción, no un preview interno.

Con esas dos variables puestas, el explorador de Google se enciende **solo**:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...   # clave de navegador restringida
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...    # Map ID con el estilo BCP
# rollback sin desplegar código:
NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER=osm
```

---

# 1 · Estado actual en producción

**Nada ha cambiado para el cliente.** Verificado en producción tras el
despliegue: el módulo resuelve `data-map-provider="osm"`, el rail y las
cápsulas funcionan igual, y **no se hace ni una sola petición a Google**.
El único cambio visible es de copy.

---

# 2 · Lo que sí se ha construido (Fases A y B)

La parte que abarata la migración el día que existan credenciales, y que se
puede validar sin ellas.

## 2.1 · El flag se auto-protege

`lib/services/location/provider.ts`

Google se enciende **únicamente si existen SUS DOS credenciales**. No hay
manera de activarlo a medias: sin clave, sin Map ID, o con un valor raro en el
override, el módulo se queda en el renderer actual y el SmartLink no se entera.
Es deliberado — es lo que impide que una migración incompleta llegue a un
cliente. `NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER=osm` fuerza el renderer actual
aunque las credenciales existan: **rollback sin desplegar**.

## 2.2 · Modelo de dominio único (§38, §39)

`lib/services/location/destination.ts`

```ts
type LocationDestination = {
  source: "bcp_curated" | "google_place" | "university"
  id: string; name: string; category: string
  lat: number; lng: number
  address?: string | null; subtitle?: string | null
  eta?: { minutes: number; mode: "walk"|"drive"|"transit"; approximate: boolean } | null
}
```

Un POI curado, una universidad y un sitio pulsado en Google se normalizan a la
**misma** forma. El renderer nunca maneja objetos del proveedor, así que
cambiarlo no obliga a tocar la composición.

**La regla de producto está codificada, no confiada a la disciplina:**
`fromGooglePlace()` devuelve siempre `eta: null` — un sitio descubierto en
Google **no puede** llegar a la interfaz con un tiempo inventado. La ETA la
calcula quien tiene el origen, con la misma lógica verificada del resto del
módulo.

## 2.3 · Carga bajo demanda y fallo elegante (§25, §34)

`lib/services/location/google-maps-loader.ts`

El SDK se carga al pulsar *Explorar la zona*, **nunca** al abrir el SmartLink:
el módulo está bajo el pliegue y la mayoría de visitas no llegan a explorar;
cargarlo siempre sería pagar un mapa dinámico por visita para nada. Si el
script falla, la capa devuelve `null`, el módulo sigue con el renderer actual
y **no se filtra al cliente el detalle del error de credencial**.

Los tipos son propios y mínimos: describen exactamente la superficie de la API
de la que dependemos, sin añadir `@types/google.maps` para código que todavía
no se ha podido validar.

## 2.4 · Coste por diseño (§25)

`PLACE_DETAIL_FIELDS` es una lista blanca corta: `id`, `displayName`,
`formattedAddress`, `location`, `primaryTypeDisplayName`, `types`. La
facturación de Places depende de los campos pedidos, así que pedir de más
cuesta dinero y expone datos que la ficha no usa. **Sin fotos, sin reseñas,
sin horarios** — el brief pide lujo mínimo, no TripAdvisor. Un test impide que
se cuelen campos caros.

## 2.5 · Analítica por lista blanca (§23)

`LOCATION_EVENTS` + `isAllowedLocationEvent()`, mismo patrón que ya se usa con
`experience_state`: el navegador no escribe nombres de evento libres.
`selectEventFor(source)` garantiza que cada fuente emite su evento —
`map_curated_poi_select`, `map_university_select`, `map_place_select`.

## 2.6 · Copy (§40)

`Explorar mapa` → **`Explorar la zona`**. Lo que se explora es el barrio, no
la tecnología.

⚠️ **Discrepancia de copy pendiente de tu decisión:** el §40 lista
`VOLVER A LA VISTA GENERAL`, pero tú pediste explícitamente
`VER ZONA COMPLETA` en el sprint anterior y así está aprobado. He **mantenido
tu versión** en vez de cambiar copy ya aprobado por un documento que puede ser
anterior. Dilo si prefieres la del brief.

---

# 3 · Tests de contrato — 40, todos en verde

`npm run test:zone`. Prueban **contratos de producto**, no detalles de
implementación:

| Contrato | Qué se comprueba |
|---|---|
| Flag | sin credenciales es imposible encender Google; override desconocido tampoco lo enciende; el rollback funciona |
| Fuentes | los tres orígenes son distinguibles y sus ids no colisionan |
| Honestidad | un sitio de Google **nunca** llega con ETA; los POIs curados conservan su tiempo verificado y su `≈` |
| Fallar cerrado | sin coordenadas, sin nombre, coordenadas no finitas, `(0,0)` o fuera de rango → no se pinta nada |
| Chile | sigue siendo un origen **válido** como punto: el guardarraíl de "sin barrio de Madrid" es de la capa de barrios, no del mapa |
| Coste | la lista de campos no contiene fotos/reseñas/horarios y sí lo que la ficha pinta |
| Analítica | evento inventado y texto libre rechazados |

Regresiones: `test:smartlink`, `test:tracking`, `test:neighborhoods` 28/28,
typecheck y build — todo en verde.

---

# 4 · Arquitectura resultante

```
LuxuryLocationModule                (composición, sin saber de proveedores)
  ├── cabecera editorial
  ├── ConnectivityRail
  ├── escenario del mapa
  │     ├── provider "osm"    → mosaico de teselas + Leaflet bajo demanda   ← HOY
  │     └── provider "google" → Zone Explorer                               ← bloqueado
  ├── ficha contextual        (compartida por ambos)
  ├── CERCA DE LA VIVIENDA
  └── UNIVERSIDADES

lib/services/location/
  ├── provider.ts        elección de proveedor + lista blanca de eventos
  ├── destination.ts     LocationDestination y sus adaptadores
  └── google-maps-loader.ts   único punto de contacto con el SDK
```

## Lo que NO se toca (§28, §29)

La **capa de conocimiento de barrios sigue siendo la fuente editorial**: 29
barrios curados, intros, alias, POIs verificados, `verified_source`, lógica
bbox y los casos negativos de Chile. Google es el proveedor de exploración,
**no** la fuente de verdad, y **no** puede escribir en la base de datos
curada. Engine v4.1, stories, publication policy y FACTS-LED intactos.

---

# 5 · Lo que queda para el día que haya credenciales

1. Componente `ZoneExplorerGoogle` montando `Map` con el Map ID, marcador
   avanzado de LA VIVIENDA, `gestureHandling: "cooperative"` (§20) y clic en
   POI del basemap → `placeId` → Place Details con la lista blanca →
   `fromGooglePlace()` → ficha contextual **ya existente**.
2. Estilo `BCP LUXURY LIGHT` en Cloud Console con la paleta aprobada.
3. Fase C: activar en Recoletos, Goya, Almagro, El Viso y una propiedad de
   estudiante; QA visual de los 10 estados del §35.
4. Fase D: cutover global manteniendo el rollback una ventana de release.
5. Fase E: retirar el código Leaflet-only **solo** si ninguna otra superficie
   lo necesita (`app/web` y el map-picker de admin lo usan hoy).

---

# 6 · Limitaciones conocidas

1. **El explorador de Google no se ha podido ejecutar ni una vez.** Sin clave
   no hay forma de validarlo, así que su código es prototipo no verificado
   hasta que exista un preview con credenciales. No debe darse por bueno.
2. **Coste real desconocido.** No se puede estimar el gasto mensual sin saber
   el tráfico de SmartLinks que llegaría a *Explorar la zona*. Conviene medir
   primero `zone_explorer_open` sobre el renderer actual para dimensionarlo
   antes de encender nada.
3. **EEA/cookies sin revisar.** Cargar recursos de Google desde el navegador
   no es equivalente en privacidad al comportamiento actual con OSM/CARTO.
   Bloquea producción, no un preview.
4. El basemap actual (CARTO) sigue sin contrato ni SLA — la lección del 418 de
   OSM es que un basemap gratuito puede cortar sin avisar.

---

# BCP ZONE EXPLORER — FASES A/B COMPLETAS · CUTOVER BLOQUEADO POR CREDENCIALES
