# BCP ZONE EXPLORER — OPEN MAP STACK
## Handoff · 2026-08-22 · MapLibre GL JS + OpenFreeMap · en producción

---

# 1 · Decisión de proveedor

Google Maps queda **descartado** por producto: exigía facturación y coste
variable por vista para una funcionalidad que se quiere en **todos** los
SmartLinks.

**MapLibre GL JS + OpenFreeMap**: sin clave de API, sin facturación, uso
comercial permitido, teselas vectoriales sobre datos OpenStreetMap. El
bloqueador de credenciales del sprint anterior **desaparece**.

El prototipo de Google se retiró tras el cutover (queda en el historial de
git). La arquitectura de las fases A/B se conserva entera: dominio,
abstracción de proveedor, máquina de estados, destinos curados, reutilización
de universidades, analítica, carga perezosa y reglas de gestos.

## Stack verificado ANTES de construir

| Comprobación | Resultado |
|---|---|
| `tiles.openfreemap.org/styles/{liberty,positron,bright}` | 200, sin clave |
| Esquema | OpenMapTiles |
| `source-layer` disponibles | park, landuse, landcover, water, transportation, building, boundary, **poi**, place… |
| Campos de `poi` | `class`, `subclass`, `name`, `rank` — justo lo necesario |

---

# 2 · BCP LUXURY MADRID · estilo propio

`lib/services/location/bcp-map-style.ts`

Escrito **desde cero** sobre el esquema, no parcheando uno ajeno: así el mapa
contiene exactamente lo que queremos y no hay que ir apagando capas que nunca
deberían haber estado. Paleta aprobada intacta: marfil, piedra cálida, salvia,
azul mineral pálido, champán/arena, etiquetas en carbón y gris apagado. Ni
escala de grises ni beige plano.

**El ruido se controla por densidad, no quitando color.** Los tramos de `rank`
salen de la semántica REAL de OpenMapTiles (rank bajo = más importante),
leída del propio estilo oficial: puntos desde z15, rótulos desde z16, y se
descarta la cola `rank ≥ 20` — que era justo la que llenaba la escena de
clínicas y tiendas de barrio. Calma curada, no mapa vacío.

---

# 3 · Exploración real de lugares

- Clic → `queryRenderedFeatures` sobre una **allowlist de capas**
  (`poi-dot`, `poi-label`), no sobre cualquier etiqueta.
- **Allowlist de clases OSM** (`CLICKABLE_POI_CLASSES`, ~45 entradas): sin
  ella la experiencia se llenaría de bocas de riego, bancos y portales.
- De varias features gana la de menor `rank` (más relevante).
- Se normaliza a `LocationDestination` con `source: "osm_discovered"`.
- **Sin nombre, sin coordenadas o fuera de la allowlist → no se abre ficha.**
- **Clic en vacío → no se inventa lugar ni queda marcador fantasma.**

## Curado vs descubierto — separación estricta

| | BCP curado | Descubierto |
|---|---|---|
| Fuente | Neighborhood Knowledge Layer + universidades | basemap vectorial |
| Marcador | champán, de marca | **neutro** (marfil/carbón) |
| ETA | verificada, con `≈` | **null** — la ficha dice *"En la zona de la vivienda"* |
| Estatus | recomendación editorial de BCP | exploración del cliente |

Un lugar descubierto **nunca** se presenta como recomendación de BCP ni se
escribe en la capa curada. La regla está **codificada**: `fromOsmFeature()`
devuelve siempre `eta: null`.

---

# 4 · Ficha y origen

`ContextCard` es la misma pieza para destino curado y lugar descubierto, con
la diferencia deliberada de que el descubierto añade *Ver en OpenStreetMap* —
y solo si el id es real; si el identificador se derivó de coordenadas se
enlaza al punto, nunca a una URL que no lleve a ninguna parte.

**LA VIVIENDA** mantiene su pill de marca en el mapa vivo, idéntico al del
overview: la residencia no se pierde de vista mientras se explora.

---

# 5 · Estados, gestos y rendimiento

`PASIVO → EXPLORAR LA ZONA → FOCO CURADO / LUGAR DESCUBIERTO → VER ZONA COMPLETA`

El **estado pasivo sigue siendo el mosaico de teselas propio**: ya validado,
sin captura de scroll y sin coste. MapLibre y su CSS se cargan **bajo
demanda**, al pulsar *Explorar la zona*; quien no explora no paga los
kilobytes ni descarga una tesela vectorial.

Rollback sin desplegar: `NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER=osm-static`.

Atribución **OpenFreeMap · OpenMapTiles · OpenStreetMap**, compacta pero
visible, nunca oculta.

---

# 6 · Cuatro defectos que encontró la QA real, no los tests

1. **Mapa en blanco.** `maplibre-gl` **v6** construía su web worker con la URL
   de la *página* (`WORKER /compartir/…`) en vez de con su script: el worker
   que parsea las teselas nunca arrancaba, así que el mapa se montaba, pintaba
   controles… y no cargaba una sola tesela. La v6 es ESM-only y no sobrevive
   al bundling de Next. **Bajado a v5.24.0**, la línea estable.
2. **Fuente inexistente.** OpenFreeMap solo sirve *Noto Sans Regular*; pedir
   *Medium* daba 404 y dejaba esas etiquetas sin dibujar.
3. **Dos juegos de controles de zoom** apilados en la misma esquina (los
   propios del renderer anterior + el `NavigationControl` de MapLibre) se
   robaban los clics y el zoom quedaba inservible.
4. **Sobrecorrección de densidad.** Al apretar el filtro a `rank ≤ 6` no
   quedaba **ningún** POI pulsable — y sin POIs pulsables la exploración, que
   es el objetivo del sprint, no existe. Se corrigió leyendo la semántica real
   en el estilo oficial en vez de adivinar otro umbral.

---

# 7 · QA

**Funcional verificada en producción:** teselas cargando, marcador de la
vivienda presente, 7 POIs curados en el mapa, clic sobre un POI real del
basemap (*Nuclio Digital School Madrid*) abriendo nuestra ficha con categoría
correcta, sin ETA inventada y con enlace a OSM. Sin errores JS.

**Contratos:** `npm run test:zone` — proveedor y rollback, separación de las
tres fuentes, ETA nunca inventada, no todo el mapa es pulsable, fallo cerrado
sin dato utilizable, estilo de marca sin clave, y analítica por lista blanca.
`test:smartlink`, `test:tracking`, `test:neighborhoods`, typecheck y build en
verde.

La matriz visual completa se cerró después — ver **FINAL VISUAL QA** al final
de este documento.

---

# 8 · Limitaciones conocidas

1. **OpenFreeMap no ofrece SLA.** La abstracción se mantiene precisamente por
   eso: el día que haga falta, pasar a **PMTiles/Protomaps autoalojado** es un
   cambio de proveedor, no de producto. No se autoaloja ahora porque no hay
   una razón operativa real todavía.
2. **Sin routing.** Los destinos curados conservan su ETA geométrica con `≈`;
   los descubiertos no tienen tiempo y la ficha lo dice. Cuando interese,
   OSRM/Valhalla son la vía open source.
3. **Sin búsqueda** — deliberado: primero demostrar que el clic real sobre un
   POI da una ficha útil.
4. `maplibre-gl` v5 fijado a propósito: **no actualizar a v6** sin resolver
   antes el empaquetado del worker bajo Next.

---


---

# FINAL VISUAL QA · 2026-08-22

Matriz completa ejecutada contra producción, con revisión visual de las
capturas una a una — los tests no la sustituyen.

## Resultado

```
VISUAL QA:            29 / 29 PASS
DESKTOP (1440):       PASS   · Recoletos, Goya, Almagro, El Viso
DESKTOP @125%:        PASS
MOBILE (390):         PASS
STUDENT:              PASS   · sección presente · universidad enfocada (TAI)
OSM DISCOVERY:        PASS   · POI real pulsado en los 4 barrios
BCP CURATED:          PASS   · ficha, foco y encuadre en los 4 barrios

SCROLL HIJACK:        0      (rueda sobre el mapa: la página baja, el mapa no)
JS ERRORS:            0
MAP LOAD FAILURES:    0      (0 respuestas de OpenFreeMap ≥400)
DOBLE INSTANCIA:      0      (1 mapa por escena en todos los casos)
```

Capturas en `~/Desktop/zone-explorer-qa/` — overview, curado, explore y
descubierto por barrio, más 125%, móvil (overview / explore / ficha) y
universidad.

## Lo que se comprobó en cada estado

| Criterio | Resultado |
|---|---|
| LA VIVIENDA visible y dentro del lienzo | en los 29 casos |
| La ficha NUNCA tapa a la vivienda | verificado por intersección de rectángulos |
| La ficha cabe entera en el escenario | sí, incluido móvil |
| Ficha en móvil ocupa poco del mapa | **22%** del escenario |
| Rótulos del rail sin cortes feos | 0 truncamientos en 1440, 125% y 390 |
| Atribución presente | en los 29 casos |
| Overflow horizontal | ninguno |

## Lugares descubiertos, reales, en cada barrio

Recoletos → *Instituto de Educación Secundaria Beatriz Galindo* (Educación) ·
Goya → *Príncipe de Vergara* (Transporte) · Almagro → *AGE Ginecología y
Obstetricia* (Salud) · El Viso → *Lima-Santiago Bernabéu* (Transporte).

Todos con marcador **neutro**, ficha propia y *"En la zona de la vivienda"* —
ningún minuto inventado. La distinción con lo curado (champán, con su `≈ N min`
verificado) se lee de un vistazo sin ser dos sistemas visuales distintos.

**Un POI educativo descubierto no se confunde con una universidad curada:**
el de Recoletos es un instituto de secundaria con marcador neutro y sin ETA;
las universidades salen en su sección, en champán y con tiempo verificado.

## Incidencia encontrada y corregida en esta pasada

**La atribución se comía el control de salida en móvil.** A 390 px ocupa dos
líneas y el pill *Salir de la zona* quedaba encima, difícil de pulsar. El
control sube por encima de ella en móvil y mantiene su sitio en escritorio.

## MapLibre congelado

```
maplibre-gl@5.24.0 — NO SUBIR A V6
```

La v6 se distribuye solo como ESM y su web worker se construye con la URL de
la *página* bajo el bundling de Next: el mapa se monta, pinta controles y **no
carga una sola tesela**. Hay un **guardarraíl en `npm run test:zone`** que
falla si la versión instalada deja de ser 5.x, para que no se cuele en una
actualización distraída.

## Línea base visual

Overview y exploración se distinguen deliberadamente: el overview es la
composición curada y calmada (área de foco, cápsulas, rail), y solo al entrar
en *Explorar la zona* aparece el mapa vectorial con sus POIs pulsables y sus
controles. Densidad equilibrada por tramos de `rank` reales, no por un umbral
arbitrario: puntos desde z15, rótulos desde z16, cola `rank ≥ 20` descartada.

## Limitaciones que siguen

1. OpenFreeMap sin SLA — la abstracción existe para poder pasar a PMTiles
   autoalojado sin tocar producto.
2. Sin routing: curados con `≈` geométrico, descubiertos sin tiempo.
3. Sin búsqueda, deliberado.
4. La matriz se ejecutó sobre cuatro barrios de Madrid centro-norte; zonas con
   cartografía muy distinta (Pozuelo, Torrelodones) no se han revisado
   visualmente una a una.

# BCP ZONE EXPLORER — COMPLETE & FROZEN
