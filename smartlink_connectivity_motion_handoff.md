# BCP CONNECTIVITY MOTION — DAMAC-INSPIRED PREMIUM BASELINE

Fecha: 2026-08-22 · En producción, medido en navegador real.
Fuente de verdad: `smartlink_damac_connectivity_motion_architecture.md`.

---

## Forense previa

**DAMAC sí era accesible.** La banda "CONNECTED TO DUBAI" se alcanzó con un
navegador real (captura en `referencia-damac.png`). Lo observado —comportamiento
visible, no código— confirma el modelo del documento:

- el rail es **DOM superpuesto al mapa**, no una capa del mapa;
- los nodos son **discretos**: 5 / 10 / 20 minutos ocupan la misma separación,
  luego el espaciado **no es proporcional** al tiempo (valida el Modelo A);
- el indicador descansa **en el extremo de origen**, junto al proyecto;
- el basemap es deliberadamente apagado y el marcador del proyecto domina.

Ese último punto fue el que destapó nuestro primer error de implementación
(ver abajo).

## Lo implementado

| Pieza | Antes | Ahora |
|---|---|---|
| Conexión vivienda→destino | curva discontinua sobre el mapa | **eliminada**; la relación la cuentan rail, cámara y ficha |
| Rail | hitos estáticos | hitos + **indicador de viaje** que recorre hasta el nodo elegido |
| Cámara | salto seco | se desliza con la misma curva, 80 ms después del rail |
| Destino en el mapa | círculo dorado suelto | cápsula con glifo de su categoría, en champán |
| Ficha en móvil | tarjeta flotante recortada | **tarjeta inferior** dentro del mapa |
| Tiempos | repartidos por el código | `LOCATION_MOTION` + `LOCATION_EASING` |

`RAIL = CONNECTIVITY · MAP = PLACE · MARKER = IDENTITY · CARD = CONTEXT ·
MOTION = EMOTION`

### Detalles que importan

- **El indicador se anima al centro REAL del nodo**, medido en el DOM dentro
  del sistema de coordenadas del rail. Con etiquetas de ancho variable y
  scroll horizontal en móvil, calcularlo por porcentaje se desalinea.
- **Interrumpible**: pulsar otro destino cancela la animación anterior
  (`Animation.cancel()`) y detiene la cámara (`map.stop()`) antes de encuadrar
  de nuevo. Cuatro clics rápidos dejan el indicador **a 0 px** del nodo activo.
- **El overview entra quieto**: la primera colocación —en reposo, al comienzo
  del hilo— no se anima. A partir de ahí, todo cambio viaja.
- **Reduced motion**: el indicador se coloca sin recorrido, la cámara salta y
  la ficha aparece sin desplazamiento. La información es idéntica.
- **El nodo activo se distingue por relleno Y por peso de la etiqueta**, nunca
  solo por color.

## Tres errores propios, corregidos con medición

1. **El indicador no tenía de dónde salir.** Se montaba solo al seleccionar,
   así que aparecía ya colocado sobre el nodo: el viaje —que es toda la
   historia— no se veía nunca. Lo cazó la QA de movimiento midiendo la
   posición a mitad de animación y al final (la misma x). Ahora espera en
   reposo al comienzo del hilo, atenuado, como el coche de DAMAC junto al
   proyecto.
2. **La primera selección seguía sin viajar** tras el arreglo anterior: la
   marca de "ya colocado" se activaba solo con una selección, y silenciaba
   justo el primer trayecto.
3. **La ficha móvil se salía del mapa.** Los keyframes de entrada de la ficha
   centrada de escritorio llevan `translateX(-50%)` horneado dentro; al
   convertirla en tarjeta inferior, ese transform la empujaba media pantalla a
   la izquierda. Y una vez colocada abajo, el encuadre seguía reservando la
   banda arriba, con lo que tapaba el marcador de la vivienda: la banda ahora
   se reserva donde está la ficha.

## QA de movimiento (no solo capturas)

Grabación en `grabacion-1.webm`. Secuencia medida en producción:

```
                         escritorio 1440   móvil 390
indicador en reposo            102 px         51 px
tras elegir el 2.º nodo
  · a mitad de animación       271 px        141 px   ← hay recorrido
  · asentado                   306 px        153 px
4 clics rápidos encadenados
  · indicador                  511 px        256 px
  · nodo activo                511 px        256 px
  · desfase                      0 px          0 px   ← no encola ni sobrepasa
ficha tras los 4 clics    "WiZink Center" (el último, no uno viejo)
reset                     indicador en reposo · ficha cerrada · sin nodo activo
```

Reduced motion: mismas posiciones finales, sin recorrido intermedio.

Capturas por estado en `~/Desktop/bcp-connectivity-motion/`
(`motion-overview`, `motion-focus`, `motion-rapid`, `motion-reset`, cada una a
1440, 390 y con `-red` para reduced motion), más `ANTES-diagonal-*.png` con la
línea que se ha retirado.

## Las cinco preguntas de cierre (§56)

**Q1 · ¿Localizo la vivienda al instante, sin leer la ficha?** Sí. El medallón
carbón con aro champán y su rótulo es el único objeto oscuro del mapa.

**Q2 · ¿Entiendo qué destino he elegido sin leer geometría?** Sí. El nodo del
rail se rellena, su etiqueta gana peso, el indicador llega hasta él y en el
mapa solo queda esa cápsula en champán.

**Q3 · ¿Entiendo el tiempo sin seguir una línea por el mapa?** Sí: los minutos
están en el rail y en la ficha; el mapa ya no dibuja ninguna línea.

**Q4 · ¿El mapa queda más calmado tras seleccionar?** Sí. Al elegir destino
desaparecen las cápsulas de los demás POIs y el área de foco, y no entra
ningún elemento nuevo salvo el destino.

**Q5 · ¿Parece una presentación inmobiliaria premium y no una herramienta
GIS?** Sí. Era exactamente la diagonal discontinua lo que lo hacía parecer
software de medición.

## Lo que NO se ha tocado

MapLibre sigue congelado en 5.24.0; el proveedor sigue siendo
OpenFreeMap/OpenMapTiles; no hay routing, ni nuevos datos, ni nuevas
analíticas. El contrato factual de ETA es el mismo, y lo descubierto en OSM
sigue sin parecer recomendado por BCP.

## Limitaciones conocidas

- El rail muestra **5 destinos**; la lista inferior sigue teniendo más. Es
  deliberado (§8 del documento).
- **El espaciado de los nodos no es proporcional al tiempo** — igual que en
  DAMAC. Los minutos son etiquetas factuales, no geometría. Escrito aquí para
  que nadie lo reinterprete más adelante.
- El área de foco de la vivienda sigue siendo un **halo DOM** en overview, no
  una capa de círculo de MapLibre (§18 daba las dos opciones como válidas).
  Funciona porque en overview la cámara es fija; si algún día el overview
  admitiera zoom, convendría moverlo a capa.
- La ficha de escritorio se mantiene **arriba y centrada**, no anclada por
  cuadrantes: la banda superior reservada por el encuadre ya garantiza que no
  tape ni a la vivienda ni al destino, y anclarla por cuadrante reintroducía
  el recorte que se arregló en su día.

# BCP CONNECTIVITY MOTION — DAMAC-INSPIRED PREMIUM BASELINE

---

# SEARCH NEAR THIS HOME

Fecha: 2026-08-22 · En producción y verificado con QA real.

El cliente puede comprobar personalmente cualquier lugar relevante para su
decisión —universidad, colegio, hospital, restaurante, dirección— sin que
SmartLink se convierta en Google Maps: el overview conserva la historia curada
y la búsqueda vive SOLO en modo explorar.

## Arquitectura

```
teclear   → búsqueda LOCAL (universidades verificadas + POIs curados) · 0 red
Enter /   → servidor BCP → LocationSearchProvider → Nominatim
"Buscar"     · ritmo GLOBAL 1 req/s · caché 24h · dedupe de concurrentes
          → SearchPlaceDto → fromSearchResult() → LocationDestination
             (source: osm_search, ETA de NUESTRA capa geométrica o distancia)
```

- **Proveedor abstracto** ([search-provider.ts](lib/services/location/search-provider.ts)):
  la UI y la ruta API solo conocen `LocationSearchProvider`. Migrar a Photon
  self-hosted = cambiar una línea (`locationSearchProvider`). El dominio puro
  vive en [search.ts](lib/services/location/search.ts), con tests.
- **Local primero (§3, §13)**: al teclear, sugerencias instantáneas de datos
  NUESTROS. La universidad verificada gana al resultado externo homónimo, y
  el dedupe conoce las siglas: "URJC" local absorbe a "Universidad Rey Juan
  Carlos" del geocoder (salió en la QA real — sin mirar el catálogo, la misma
  entidad aparecía dos veces).
- **Sesgo hacia la vivienda (§12)**: viewbox de ~10km sin `bounded` +
  `countrycodes=es`. "Colegio del Pilar" devuelve el de Castelló primero, sin
  impedir resultados legítimos más lejos.
- **ETA honesto (§9)**: la misma capa geométrica de universidades y POIs
  (haversine + factor de callejero, siempre `≈`). Si andando no aplica, en
  coche; si nada aplica con honestidad, distancia geodésica ("1,8 km · De la
  vivienda, en línea recta"). Sin routing, sin horarios, sin reseñas.
- **Marcador propio (§7)**: lupa carbón que solo viste champán por estar
  seleccionada. Ni curado ni descubierto: lo trajo una búsqueda del cliente.
- **El rail NO se toca (§19)**: el resultado es exploración de sesión. No
  entra en CONECTADA CON MADRID, ni en la capa de barrios, ni implica
  recomendación de BCP.

## Política de proveedor (§21) — leer antes de "mejorar"

El Nominatim público **no es infraestructura de autocompletado**. Nada de
peticiones por tecla: la búsqueda externa se dispara solo con Enter o
"Buscar", pasa siempre por el servidor BCP y este impone el ritmo global de
1 req/s (cola en memoria; asume el PM2 de un solo proceso, como los
limitadores de Idealista), caché de 24h por consulta+celda de ~1km y dedupe
de consultas concurrentes. Si algún día hace falta autocompletado global en
vivo, NO se estira esto: se migra el proveedor (Photon soporta forward search
y sesgo por ubicación).

## Privacidad (§17-18)

Al geocoder viajan solo la consulta y la coordenada de la vivienda (pública).
Sin nombre de cliente, sin email, sin identidad de navegación. La consulta en
crudo no se persiste; la analítica registra `zone_search_submit` (el hecho) y
`zone_search_result_select` con categoría + fuente, nunca el texto tecleado.

## QA real ejecutada (§20)

| Consulta | Resultado |
|---|---|
| "IE" (local) | IE · campus más cercano según zona: María de Molina en Salamanca, IE Tower en Pozuelo · 0 llamadas API |
| "Colegio del Pilar" | el de Calle de Castelló primero (cercanía) |
| "Hospital Ruber" | Ruber Juan Bravo primero |
| "Ten con Ten" | Calle de Ayala 6 · ≈11 min a pie |
| "El Corte Inglés" | Preciados, Princesa, Fernando el Católico |
| "Calle de Serrano 21, Madrid" | dirección exacta resuelta |
| "xyzzy quijotesco 999" | mensaje de no encontrado, mapa intacto |
| "URJC" | 1 sola fila (verificada); reset limpio |

Zonas probadas: Salamanca, Chamberí, El Viso, Pozuelo. Teclado
(flechas/Enter/Escape, combobox accesible) y móvil 390 verificados; al elegir
resultado el teclado se cierra antes de mover la cámara.

```
LOCAL SEARCH:              PASS
EXTERNAL PLACE SEARCH:     PASS
UNIVERSITY PRIORITY:       PASS  (1 fila, gana la verificada)
MAP FOCUS:                 PASS  (vivienda + resultado, lupa, ficha)
DISTANCE:                  PASS  (ETA ≈ o distancia geodésica)
NOMINATIM REQUEST RATE:    ≤1/s  (5 consultas concurrentes sin caché → 4,7s)
RAW SEARCH PII STORED:     0
MOBILE:                    PASS
```

## Limitaciones conocidas

- La caché y el limitador viven **en memoria del proceso**: asumen el PM2 de
  un solo proceso, la misma asunción documentada de los limitadores de
  Idealista. Si eso cambia, mover ambos a la BD.
- La búsqueda requiere **coordenadas precisas** de la vivienda: sin geocodificar,
  el buscador no se monta (no hay contra qué sesgar ni medir).
- El resultado externo hereda la calidad de OSM: un lugar mal etiquetado
  llega sin categoría (icono genérico) — se muestra, no se inventa.
