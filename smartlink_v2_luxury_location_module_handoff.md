# SMARTLINK 2.0 — LUXURY LOCATION MODULE
## Handoff · 2026-08-21 · Engine v4.1 intacto · contrato factual y geográfico conservado

El módulo de ubicación deja de ser un mapa incrustado y pasa a ser una escena
de venta. Sprint completo: benchmark → decisión → implementación → QA real →
este documento.

---

## 1 · Benchmark forense

Ejecutado con Playwright a 1440 y 390 sobre las dos referencias.

**DAMAC — Islands 2.** Lo medible y accionable:
- la superficie del mapa es un `<canvas>` de 1440×682 con **`pointer-events:
  none`**: no captura el puntero por defecto. La página sigue haciendo scroll
  con el cursor encima (`pageScrolled: false` solo porque ya estaba al final;
  `wheelPrevented: false` → nadie intercepta la rueda);
- la conectividad se reduce a **tres escalones** en tipografía grande
  ("5 MINUTES", "10 MINUTES", "20 MINUTES"), no una tabla de distancias;
- el verbo de activación es **"EXPLORE"**;
- los controles del proveedor se limitan a una escala discreta.

**EMAAR — Address SkyView.** Bloqueó la automatización: su propio WordPress
lanza `wp is not defined` y `Cannot read properties of null`, y no se detecta
ninguna superficie de mapa. **No se inventan métricas suyas**: se toman sus
principios documentados —restraint editorial, controles apagados, mapa
integrado en la marca en vez de incrustado— sin fingir que se midieron.

**Conclusión que dirige el diseño:** el lujo aquí no está en tener más mapa,
sino en que el mapa **no pida nada** hasta que el cliente lo pida.

---

## 2 · Antes → después

| | Antes | Ahora |
|---|---|---|
| Superficie | `<iframe>` del visor de OSM | mosaico de teselas propio + Leaflet bajo demanda |
| Gestos | capturaba rueda y arrastre **al sobrevolar** | inerte hasta pulsar "Explorar mapa" |
| Color | cartografía cruda del proveedor | tratamiento de lujo en un token |
| Marcador | pin genérico del proveedor | marcador BCP con anillo dorado y aro blanco |
| Conectividad | — | rail de 3-5 destinos verificados |
| POIs | lista a dos columnas | destinos con categoría, seleccionables |
| Cabecera | `Ubicación · Zona` | + línea administrativa verificada |
| Atribución | chrome del iframe | discreta, presente en los dos estados |

---

## 3 · Estrategia de mapa — y el incidente que la decidió

El brief pedía no cambiar de proveedor sin razón técnica fuerte. **Aparecieron
dos, y la primera es de disponibilidad, no estética.**

**a) OpenStreetMap nos estaba bloqueando.** Durante la QA, sus servidores
devolvieron una tesela **HTTP 418 · "Access blocked — App is not following the
tile usage policy of OpenStreetMap's volunteer-run servers"**. Enlazar sus
teselas desde el navegador incumple su política de uso.

> ⚠️ El detalle venenoso: **ese aviso es un PNG válido**. Se pinta como una
> tesela más, `img.complete && naturalWidth > 0` da `true`, y ninguna
> comprobación de "¿cargó la imagen?" lo detecta. El SmartLink podía estar
> enseñando "Access blocked" a un cliente sin que saltara una sola alarma. La
> QA vigila ahora el **código HTTP** de cada tesela, no si la imagen cargó.

**b) El estilo estándar lleva el ruido incrustado.** La primera captura de QA
lo demostró: iconos de comercios, bancos e iglesias sobre el mapa, imposibles
de quitar con ningún filtro de color, robándole el protagonismo al marcador de
la vivienda. Es exactamente el clutter que el brief prohíbe (§6).

**Migración mínima elegida: CARTO Voyager sobre los MISMOS datos OSM.**
Cambia una constante de URL. Sin API key, sin coste, sin dependencia nueva,
sin superficie de privacidad nueva, con `@2x` para retina. La atribución suma
**© OpenStreetMap © CARTO**, como exige su licencia, en los dos estados.

**Cómo se pinta:**
- **bloqueado** → mosaico compuesto por nosotros (`lib/geo/tile-math.ts`) como
  `<img>` con `pointer-events: none`. Cero JS de mapa, cero gestos capturados,
  cartografía de lujo desde el primer frame;
- **explorar** → **Leaflet**, que ya era dependencia del proyecto, cargado
  **bajo demanda** junto a su CSS. Quien no explora no paga los kilobytes.

---

## 4 · Sistema de color

Un token en `app/globals.css`, no valores sueltos por el componente:

```css
--bcp-map-treatment: saturate(0.78) sepia(0.12) brightness(1.02)
                     contrast(0.97) hue-rotate(-5deg);
--bcp-map-wash:      rgba(196, 162, 106, 0.07);  /* velo cálido, aislado */
--bcp-map-canvas:    #efe9dd;                    /* papel bajo el mosaico */
```

Tierra en perla cálida, viales principales en champán, parques en salvia
**visible**, agua en azul mineral, etiquetas en carbón cálido. Ni escala de
grises (frío, parece un mapa desactivado) ni beige plano (los parques
desaparecen). El mismo token se aplica al `tile-pane` de Leaflet, así que
entrar en modo explorar **no cambia la paleta**.

El lienzo de papel importa: las teselas son `lazy`, y hasta que entran se ve
ese color, nunca un hueco blanco.

---

## 5 · Bloqueo de interacción — la regla crítica

El estado por defecto es **visualmente vivo, funcionalmente inerte**. Las
teselas son imágenes con `pointer-events: none`: no hay nada que pueda
capturar rueda, arrastre ni gesto táctil, ni en escritorio ni en móvil. No es
un `overlay` que intercepta — es que **debajo no hay mapa que interceptar**.

- activar: **`Explorar mapa`** (nunca por hover);
- salir: **`Volver al recorrido`**, que destruye la instancia de Leaflet y
  devuelve el mosaico inerte (con un destino enfocado, ese mismo sitio ofrece
  **`Ver zona completa`**);
- en modo explorar: pan, zoom, rueda y dos controles (`+` / `−`).

Verificado en los 66 casos moviendo el ratón al centro del mapa y girando la
rueda: la página baja y **la tesela no cambia de zoom**.

---

## 6 · Movimiento

Entrada contenida: el mosaico aparece, el marcador hace un `scale 0.96 → 1`
con **un solo** pulso de halo, y los nodos de conectividad y destinos entran
escalonados (70 ms). Al seleccionar un destino en modo explorar, encaje suave
propiedad + destino (`flyToBounds`, 0,7 s).

Nada de pin rebotando, pulso infinito, paralaje, zoom al pasar el ratón ni
coche animado. `prefers-reduced-motion` verificado en producción:
`animationName: "none"`, opacidad 1, halo oculto, **toda la información
disponible**.

---

## 7 · Conectividad, POIs y honestidad del dato

- El rail toma los **3-5 destinos de mayor prioridad** ya calculados por
  `lib/geo/poi-distance.ts`. **No se recalcula nada**: mismos minutos, mismo
  modo, misma `≈`, y **la corrección por `bbox` de POIs de gran superficie
  sigue intacta** (BC-1390 mantiene "Parque del Retiro ≈ 14 min a pie", no la
  medida contra el centroide).
- **Nunca se finge una ruta por calles.** No tenemos geometría de routing real
  y dibujar un trazado callejero inventado sería mentir. (La pasada de
  Destination Focus sí une vivienda y destino con una **recta** discontinua,
  que representa proximidad y no un recorrido — ver más abajo.)
- Los destinos se representan sobre el mapa como puntos discretos, siempre por
  debajo del marcador de la vivienda en jerarquía visual.
- Categorías (`Naturaleza`, `Cultura`, `Compras`, `Gastronomía`…) solo si
  aportan; `otro` nunca se pinta.

**Subtítulo editorial:** sale del dato administrativo **verificado**
(`district` / `municipality` de la capa curada, columnas de la migración
0145). Si no lo hay, **no se pinta nada**: no se fabrica una frase. Se
descartó componer "Entre el Retiro, Serrano y…" porque implica una afirmación
geográfica que el dato no respalda.

---

## 8 · Contrato público

Sin cambios de exposición sobre la vivienda. Lo único que crece en el DTO son
las **coordenadas de los POIs** (Retiro, Serrano, estaciones de metro):
landmarks públicos necesarios para situarlos en el mapa, que no dicen nada de
la propiedad. La precisión de la ubicación del inmueble es la misma de antes,
incluido el comportamiento sin coordenadas (círculo de zona, jamás un pin
falso ni tiempos inventados).

Los guardarraíles geográficos siguen: **Colina (Chile) no recibe barrio de
Madrid** — verificado como caso negativo en la QA.

---

## 9 · Estados adaptativos

| Situación | Render |
|---|---|
| coords + barrio + POIs | módulo premium completo |
| coords, pocos POIs | mapa + los destinos verificados que haya |
| barrio sin coords | capa editorial + zona aproximada, **sin tiempos** |
| ni barrio ni coords fiables | se omite, sin heading vacío |

Funciona igual en COMPLETE, PARTIAL, SPARSE y FACTS-LED: **no depende de la
riqueza de la Property Story.**

---

## 10 · Analítica

`location_module_view`, `map_explore` y `poi_select` sobre el `trackEvent`
existente. Sin PII, sin sistema nuevo, `experience_state` y el page-view
intactos (tracking 200 en los 66 casos).

---

## 11 · QA real — 22 propiedades × 3 viewports = **66/66**

Barrios: Recoletos, Castellana, Lista, Goya, El Viso, Almagro, Chamberí,
Retiro, Centro/Malasaña, Chueca, Chamartín, Salamanca, Ibiza, Niño Jesús,
Trafalgar, Somosaguas, Prado de Somosaguas.
Estados: COMPLETE (BC-0755), PARTIAL (BC-0002), SPARSE sin coords (BC-1385),
FACTS-LED (BC-1401, BC-0916), pocos POIs (BC-0708), **negativo Chile
(BC-1232)**.
Viewports: 1440, 390 y 1440 @125%.

Validado en cada uno: composición inicial, tratamiento de color aplicado,
**scroll con el cursor sobre el mapa sin zoom accidental**, activación y
desactivación explícitas, marcador, rail, tiempos, atribución, sin heading
vacío, sin overflow horizontal, sin errores JS, tracking 200, y **ninguna
tesela con HTTP distinto de 200**.

Capturas: `loc-final-1440.png`, `loc-final-390.png`, `loc-BC-1409-1440-live.png`.

---

## 12 · Regresiones

`test:smartlink` (incluye 9 comprobaciones nuevas de la geometría del mosaico,
contrastadas contra Web Mercator calculado por otra vía, no contra una
constante copiada) · `test:tracking` · `test:neighborhoods` 28/28 · typecheck ·
build de producción. Todo en verde. Engine v4.1 sin tocar.

---

## 13 · Dos defectos encontrados por el camino

1. **El CTA "Explorar mapa" se renderizaba transparente.** `bg-ink/92`,
   `bg-white/94` y `bg-white/78` **no existen**: Tailwind solo emite los
   valores de su escala de opacidad, así que la clase quedaba en el `className`
   sin ninguna regla detrás. Detectado comparando las clases del componente
   contra el CSS compilado —no a ojo—: `bg-ink/95` y `bg-gold/50` sí estaban,
   `/92` y `/94` no. **Vale la pena recordarlo: una clase de opacidad fuera de
   escala falla en silencio.**
2. El velo cálido deslavaba el CTA con su `mix-blend-mode`. Ahora va en un
   contenedor aislado y solo mezcla con las teselas.

---

## 14 · Limitaciones conocidas

1. **CARTO sirve el basemap sin API key ni contrato.** Es lo correcto hoy
   (gratuito con atribución, misma data OSM), pero si el tráfico crece
   conviene pasar a un plan con SLA o a teselas propias. La lección del 418 de
   OSM es que un basemap gratuito puede cortarte sin avisar.
2. **La tesela bloqueada solo se detecta por código HTTP.** Si un proveedor
   sirviera un aviso con 200, volvería a ser invisible. Un chequeo periódico
   del módulo en producción cerraría del todo ese hueco.
3. Las teselas son `lazy`: bajando muy rápido puede verse el papel un
   instante antes del mosaico. Es deliberado (rendimiento sobre precarga).
4. El zoom se adapta al ancho para enseñar ~1,4 km de ciudad; en pantallas muy
   estrechas eso deja el barrio algo justo.
5. La selección de destino recentra el mapa **solo en modo explorar**: en
   estado bloqueado un clic registra el evento pero no mueve nada, a
   propósito.

---


---

# DESTINATION FOCUS POLISH · 2026-08-21

Última pasada de UX sobre el módulo ya aprobado. La paleta (ivory / warm stone
/ champagne / sage / charcoal) y la arquitectura del mapa **no se tocan**.

## El problema que se resuelve

Al pulsar un POI la tarjeta se activaba y el mapa cambiaba, pero la relación
**vivienda → destino** había que deducirla: el destino no tenía presencia
propia y nada unía los dos puntos.

## Cómo queda

Al seleccionar cualquier destino —tarjeta del rail, lista inferior o
universidad— se entra en **DESTINATION FOCUS**:

| Pieza | Tratamiento |
|---|---|
| **Vivienda** | marcador charcoal con anillo dorado, estable, origen inequívoco |
| **Destino** | marcador champán por encima de los secundarios, con **nombre + tiempo + modo** en etiqueta |
| **Encuadre** | los dos puntos con margen; ninguno pegado a un borde; sin perder el contexto de ciudad |
| **Conexión** | línea champán fina y discontinua, dibujada una sola vez |
| **Secundarios** | se apagan mientras hay foco: no compiten seis marcadores |
| **Reset** | **`VER ZONA COMPLETA`** restaura la vista general y limpia el foco |

## Decisiones que conviene conocer

**El foco funciona con el mapa BLOQUEADO.** El encuadre es matemática pura
(`fitTwoPoints` en `lib/geo/tile-math.ts`) sobre el mismo mosaico de teselas,
así que seleccionar un destino **nunca** desbloquea la rueda ni los gestos. La
decisión de interacción pasiva por defecto se mantiene intacta: solo
`Explorar mapa` activa la cartografía. Verificado con rueda de ratón sobre el
mapa en los 21 casos: la página baja, la tesela no cambia.

**La conexión es una recta, deliberadamente.** Representa **proximidad**, no
una ruta por calles. No hay proveedor de routing en el proyecto y **no se ha
añadido uno solo para esto**: dibujar un trazado callejero inventado sería
mentirle al cliente. Se mantiene la semántica `≈` de siempre.

**Una implementación, no tres.** Rail, lista "Cerca de la vivienda" y
universidades llaman al mismo `selectPoi` y comparten un único `focus`. La QA
comprueba que al pulsar arriba se activa también la fila de abajo.

**Orden de las tarjetas:** de más cerca a más lejos **dentro de cada modo**, a
pie primero. Una escala ascendente única mezclando modos se leería como una
línea de tiempo, y 12 min a pie no son comparables con 12 en coche.

**Contraste en foco:** el mapa base cede un punto de saturación
(`saturate(0.88) contrast(0.96)` encima del tratamiento aprobado) para que
destaquen vivienda, conexión y destino. Sigue siendo el mapa de color: ni
gris, ni oscurecido.

## Universidades cercanas

**Reutiliza lo que ya existía, no crea nada:**
- el catálogo `lib/data/universities.ts` — la misma fuente que "Distancia al
  campus" del portal de cliente, con sus sedes, direcciones y coordenadas;
- el `computePoiTravel` del propio módulo, así que **ni un minuto nuevo ni
  otra fórmula**: mismos tiempos, mismos modos, misma `≈` que cualquier otro
  destino.

Una entrada por universidad, con **su sede más cercana** (mostrar dos campus
de la misma escuela ocuparía sitio sin añadir información), máximo 5, ordenadas
por cercanía, y ninguna por encima de 45 minutos — más allá deja de ser un
argumento de la ubicación. Al pulsarlas ejecutan **el mismo Destination
Focus**: no existe ningún `UniversityMap`.

### Sobre el "contexto estudiante"

Se buscó la condición existente y **no la hay en esta superficie**: el perfil
`Estudiante` vive en la ficha del **cliente** dentro del CRM
(`ClientProfileType`), y un SmartLink público es **anónimo** — no sabemos
quién lo abre. La única señal a nivel de propiedad sería `stay = 'short'`, que
no es lo mismo que un estudiante.

Por decisión de producto (2026-08-21), la sección **no se condiciona a un
segmento adivinado**: se muestra cuando aporta —hay coordenadas y hay campus a
distancia razonable— y **no existe** cuando no, sin heading vacío ni "no hay
universidades". Es la opción honesta: preferimos dar el dato a todo el mundo
que inventarnos quién está mirando.

## Analítica

`location_poi_select` y `location_university_select` (con nombre, categoría y
`experience_state`) y `location_overview_restore`, sobre el `trackEvent`
existente. Sin PII, sin migración.

## QA real — 21/21

7 SmartLinks × 3 viewports (1440, 390, 1440 @125%): 5 POIs de estilo de vida
reales enfocados (Retiro, Mercado de la Paz, Lázaro Galdiano, Movistar Arena,
Dos de Mayo), universidad enfocada en cada uno de esos 5, y 2 SmartLinks sin
coordenadas que **no** deben mostrar la sección.

Verificado en cada caso: destino y vivienda inequívocos, conexión visible y
con longitud real, etiqueta dentro del lienzo, active state sincronizado
arriba y abajo, secundarios apagados, universidad usando el mismo focus,
`VER ZONA COMPLETA` restaurando (sin conexión, sin activos, con el rail
intacto), **la página no salta al seleccionar**, **la rueda sobre el mapa no
hace zoom**, sin overflow, sin errores JS, atribución presente.

Regresiones: `test:smartlink` (+12 comprobaciones nuevas de encuadre y
universidades) · `test:tracking` · `test:neighborhoods` 28/28 · QA del módulo
de ubicación 66/66 · typecheck · build.

## Defecto encontrado y corregido en esta pasada

`fitTwoPoints` redondeaba el zoom **hacia abajo**, y en una pirámide de teselas
eso cuesta un nivel completo: el doble de escala. Con la vivienda y el Retiro a
1,2 km se veía **medio Madrid** —río Manzanares y M-30 incluidos— con los dos
puntos diminutos en el centro. Ahora se prueba primero el nivel más ceñido y
solo se baja si de verdad no caben con un margen mínimo digno. El padding
pedido pasa a ser una preferencia y la garantía es ese margen. Cubierto con una
regresión que mide el ancho real del encuadre en metros.

## Limitaciones

1. La conexión no es una ruta: si algún día entra un proveedor de routing real
   y fiable, la geometría puede sustituirla sin tocar el resto del módulo.
2. Las universidades usan las coordenadas del catálogo existente (precisión
   ~50-200 m según su propia documentación), suficiente para un `≈` pero no
   para una ruta puerta a puerta.
3. El foco muestra un destino cada vez, a propósito: comparar dos destinos a la
   vez volvería a llenar el mapa de marcadores.

# LUXURY LOCATION MODULE — COMPLETE
