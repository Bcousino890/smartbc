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
