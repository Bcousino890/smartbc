# SMARTLINK 2.0 — FINAL PREMIUM BASELINE

Fecha: 2026-08-22 · Estado: en producción y verificado contra páginas reales.
Cierre de consistencia. A partir de aquí, congelado (§18).

---

## 1. Un solo mapa

Antes había **dos experiencias**: el overview era un mosaico de teselas ráster
de CARTO y la exploración un mapa vectorial MapLibre. El cliente lo notaba —
*"cuando pulso Explorar se ve mejor"*.

Ahora overview y exploración son **el mismo mapa**: mismo renderer, mismo
estilo BCP Luxury Madrid, misma cámara, mismos marcadores. Lo único que cambia
es el estado de interacción:

| | OVERVIEW | EXPLORAR |
|---|---|---|
| gestos | bloqueados | sueltos |
| controles de zoom | no | sí |
| POIs curados | cápsulas editoriales con nombre (máx. 4, con comprobación de colisión) | marcadores de glifo |
| lugares de OSM | ocultos | visibles y pulsables |
| cámara | la compone el módulo | la gobierna el mapa |

El renderer Leaflet desaparece. El mosaico ráster sobrevive **solo** como red
de seguridad si MapLibre no carga (`onUnavailable`), nunca como experiencia
paralela.

⚠️ **Convenio de zoom.** MapLibre cuenta sobre teselas de 512px y nuestra
geometría (mosaico, `fitPoints`, `contextZoomForWidth`) sobre las de 256px del
esquema slippy: la misma escala cae **un nivel más abajo** en MapLibre. Está
medido en un navegador real —0.01º de latitud ocupan 612.3px tanto en slippy
z16 como en MapLibre z15—, encapsulado en `toMapLibreZoom()` y vigilado por
test. De haberlo supuesto, el overview habría salido al doble de escala.

⚠️ **El mapa se monta UNA vez.** Pasar a explorar no remonta nada (eso
recargaría teselas y parpadearía), así que la interacción y los marcadores
tienen que ser **reactivos**: si se crean dentro del `load`, se quedan
congelados en el estado inicial. Pasó: el primer intento dejaba un mapa que no
se podía mover, sin controles y con la línea de conexión terminando en el
vacío.

## 2. Paleta — city luxury

El problema de la versión anterior era que todo caía en la misma franja de
arena. Ahora:

- **suelo** marfil cálido `#f2f0ea`;
- **viario en tres pesos**: principal en BLANCO (es lo que hace legible una
  ciudad), secundario en gris cálido, local en hueso;
- **parques** en salvia real, **agua** en azul mineral;
- **etiquetas** en carbón, con el nombre de barrio por encima del de calle en
  tamaño y tracking;
- se probó una veladura de suelo urbano y **se retiró**: en una ciudad densa
  todo es residencial, así que solo teñía la escena de arena.

El test de paleta vigila el PRINCIPIO (el parque tira a verde, el agua a azul,
el viario contrasta con el suelo), no tres hex clavados.

## 3. Lenguaje de marcadores — [lib/services/location/markers.ts](lib/services/location/markers.ts)

Jerarquía deliberada, de más a menos peso:

1. **BCP RESIDENCE MARKER** — medallón: disco carbón, aro champán fino,
   respiro marfil, sombra corta y un glifo de vano (el arco de un portal
   madrileño en tres trazos). Ni pin rojo, ni emoji, ni píldora de sistema.
   Rótulo bajo el medallón en overview; en explorar se reconoce solo. Foco:
   halo, nunca rebote.
2. **POI curado** — cápsula marfil, glifo carbón de línea, filo champán. Misma
   familia para las ocho categorías: cambia el glifo, nunca el color. Al
   seleccionar, el champán toma el mando. Universidad: doble aro.
3. **Lugar descubierto (OSM)** — marcador neutro carbón sobre marfil,
   claramente distinto: nunca insinúa que BCP lo recomienda.

Los iconos son SVG mínimo escrito a mano, no una librería: los marcadores de
MapLibre son DOM, no React.

## 4. Descubrimiento progresivo

En overview los lugares de OSM no compiten (capa apagada). Al explorar
aparecen por tramos de relevancia: `rank` bajo primero, y la densidad se abre
al acercar. El tamaño distingue lo importante y un desvío de tono discreto
insinúa la categoría (verde para naturaleza, azulado para transporte) sin
convertir el mapa en un semáforo y **sin usar champán**, que está reservado a
lo curado.

⚠️ Los puntos miden 3px de radio: el clic consulta una **caja de ±10px**. Con
un solo píxel, acertar era cuestión de suerte y la exploración prometía
descubrimiento sin darlo.

## 5. Regla de micro-capítulo — [lib/services/story/micro-chapter.ts](lib/services/story/micro-chapter.ts)

> LA FINCA · "Finca construida en 1941."

Es verdad y es seguro, pero no sostiene una banda de capítulo con su rótulo.
El hecho pasa a **DETALLES DE LA VIVIENDA** y el capítulo desaparece. Es una
regla de **presentación**: no relaja ninguna validación, no borra el dato y no
toca el Engine v4.1 (congelado).

No decide por longitud —el brief lo prohíbe y con razón: *"Dormitorio diáfano
con ventanas tipo Velux"* es corto y distintivo— sino contando **unidades de
información independientes**, con cada estancia nombrada contando por
separado. Dos frases, o dos unidades, ya sostienen un capítulo.

Calibrada contra las 677 fichas reales: **650 capítulos** son micro y **25
propiedades** se quedan sin ninguno — que es exactamente el "corto a
propósito" del §12.

## 6. Calidad del prelude

Regla nueva: un titular cuyas palabras con contenido salen **todas** del saco
común (luz, amplitud, diseño, confort, reforma…) no ancla nada de ESTA
vivienda y valdría para cientos. Auditados los 655 en producción, 25 estaban
en ese caso; regenerados con feedback.

También se corrigió el parser: aceptaba `TITULAR:` pero no `TÍTULAR:`, y seis
titulares llegaron a producción con la etiqueta pegada delante.

## 7. Marca de agua — pasada dirigida

En vez de 1.600 llamadas de visión sobre las ~16.000 fotos clasificadas, se
revisaron las **2.018 imágenes que hoy están en público**: portada, imagen de
cada capítulo (con el mismo algoritmo de selección del renderer) y primera de
galería.

```
PUBLIC IMAGES CHECKED:      2018
WATERMARKED PUBLIC IMAGES:   108
REPLACED (portada):           37
NO CLEAN ALTERNATIVE:          4 portadas · 103 fotos de su clase
```

La portada es lo primero que se ve: si lleva el logo de otro portal y hay una
foto limpia, manda la limpia. La galería **no** se reordena (sus índices son
públicos y se comparten por WhatsApp).

## 8. Cifras finales

```
MAP RENDERERS ACTIVE:              1  (MapLibre GL JS v5.24.0 · + mosaico ráster
                                       solo como red de seguridad)
PASSIVE MAP PROVIDER:              MapLibre + OpenFreeMap / OpenMapTiles
EXPLORE MAP PROVIDER:              MapLibre + OpenFreeMap / OpenMapTiles

ACTIVE PROPERTIES:                 677
CON NARRATIVA SUFICIENTE:          655

SOURCE-RICH / OUTPUT-THIN:          10
DATA-RICH / DESCRIPTION-POOR:        1
GENUINELY CONTENT-POOR:             11

MICRO-CHAPTERS REMOVED/MOVED:      650  (25 fichas quedan sin capítulos: minimal by design)
PRELUDES APROBADOS:                651
PUBLIC WATERMARKED IMAGES REMAINING: 4 portadas sin alternativa limpia
PUBLIC CONFLICT CLAIMS:              0
PUBLIC CONFLICT BLOCKS:              0
```

⚠️ La auditoría A/B/C cuenta la **apertura editorial** como narrativa
renderizada, que es lo que el cliente lee. Medida solo sobre bloques daba 201
en el grupo A: era un artefacto de no contar el prelude.

## 9. Limitaciones conocidas

- **El dato de marca de agua solo cubre lo público** (2.018 de ~32.000 fotos).
  El resto queda sin analizar y se trata como limpio; se captura solo en
  cuanto una foto se reclasifique.
- **4 portadas** siguen marcadas porque todas las fotos de esa propiedad lo
  están. Solución real: pedir material limpio.
- **La distinción fachada / entorno es de juicio**: una fachada fotografiada
  desde la acera de enfrente puede leerse como calle. El sesgo está puesto a
  propósito hacia el falso negativo (umbral 0.85, sin revertir).
- **Los 10 del grupo A** tienen bloques en conflicto: su evidencia existe pero
  se contradice, y recuperarla exigiría relajar la seguridad. No se hace.
- **La regla de micro-capítulo es léxica**: mide unidades de información
  contra un vocabulario. Un hecho distintivo con palabras raras podría contar
  como una sola unidad; el sesgo está puesto a conservar el capítulo.
- El rótulo de barrio del basemap puede quedar detrás del medallón en algunos
  encuadres. Es cosmético y no oculta información propia.

## 10. Congelado (§18)

No se añade: buscador, proveedor de rutas, más proveedores de mapa, más
complejidad en el motor de Story, CMS ni pipelines de IA nuevas.

# SMARTLINK 2.0 — FINAL PREMIUM BASELINE
