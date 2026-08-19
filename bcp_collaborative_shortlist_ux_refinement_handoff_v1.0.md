# BCP Shortlist — Revisión rápida y prioridades · Handoff

**Sprint · 2026-08-19 · `main` @ `ca19478` · desplegado y verificado en producción**

Sin tocar backend: mismas decisiones, mismo ranking, mismos comentarios, mismo
token, mismo resultado en el CRM y mismo `Create Itinerary`.

---

## El problema

Diecinueve láminas grandes en columna eran una página interminable. El
problema no era el tamaño de las residencias —eso estaba aprobado— sino
enseñarlas **todas grandes a la vez**. Decidir y ordenar son dos tareas
distintas y estaban mezcladas en una sola pantalla.

## Los tres momentos

| Modo | Para qué | Composición |
|---|---|---|
| **Revisar** | Decidir | Una residencia por pantalla, fotografía grande |
| **Prioridades** | Colocar | Filas compactas: miniatura, número, asa |
| **Resumen** | Comprobar antes de enviar | Solo texto |

Barra superior discreta con los contadores. **«Revisar» cuenta lo que FALTA,
no el total**, porque es lo único accionable; cuando no queda nada, una marca.

## Revisar

Al decidir **se pasa sola a la siguiente pendiente** — no hay que pulsar
«siguiente» después de cada una. También se recorre a mano: botones, flechas
del teclado en escritorio, y swipe horizontal en táctil con umbral alto y
desempate contra el gesto vertical, para que leer la ficha hacia abajo no
cambie de casa.

**Pasar de largo sin decidir no asigna ningún estado.** Comprobado contra la
base: recorrer residencias no escribe nada.

La bienvenida se presenta entera una sola vez; a la primera decisión se encoge
al nombre y deja la pantalla para la residencia.

## Prioridades

Solo las que quiere visitar, en filas de ~100 px: miniatura, número grande,
nombre, zona, precio y asa. Diez caben a la vista y se colocan rápido.
Reordenado con arrastre (solo desde el asa, con pulsación mantenida en táctil)
y con flechas ↑↓ como alternativa accesible, que no es un extra.

**Alternativas** y **descartadas** quedan plegadas, y desde ahí se puede
cambiar de idea sin salir: volver a prioritaria, pasar a alternativa o
recuperar una descartada.

## Resumen y envío

Recuento, lista ordenada y comentarios, sin fotografías. El envío **no exige
haber revisado todas**: si quedan pendientes pregunta si seguir revisando o
mandarlo igual. Puede que el cliente ya sepa que esas no le interesan.

## Analítica

`property_view` se dispara cuando la residencia pasa a ser **la activa de
verdad** en Revisar, una sola vez por residencia — ni por animaciones, ni por
cambios de tamaño, ni por ir y volver. `priority_change` solo cuando cambia el
orden. No se añadió analítica nueva por la existencia de modos.

## QA sobre producción

Los tres modos, en móvil (390) y escritorio (1440), con 29 residencias reales:

abre en revisar con **una sola** residencia · cabe sin scroll infinito · la
barra cuenta pendientes · al decidir pasa sola a la siguiente · **pasar de
largo no asigna estado** (verificado en la base) · prioridades en filas de
100–111 px · el resumen muestra la selección · con pendientes pregunta antes
de enviar. **16 comprobaciones, todas en verde.**

Altura de la composición al empezar a revisar:

| Pantalla | Contenido |
|---|---|
| 1440×900 | 1,00 pantallas |
| 1920×1080 | 1,00 pantallas |
| 390×844 | 1,30 pantallas |

## Limitaciones reales

1. **En móvil la residencia ocupa 1,3 pantallas**, no una. Con foto grande,
   nombre, precio, datos, tres decisiones y dos acciones no da para menos sin
   sacrificar la fotografía, que es lo que permite decidir. Se decide con un
   golpe de pulgar hacia abajo, no con scroll largo.
2. **Se retiró el reordenado de las pendientes** que existía en el listado
   anterior: en «una residencia cada vez» no hay lista que colocar. La acción
   de servidor (`setShortlistReviewOrder`) se conserva por si vuelve a hacer
   falta.
3. **El lado del agente sigue sin probar con sesión** — es lo mismo de siempre:
   crear la selección, previsualizar y `Crear itinerario con sus prioridades`.
4. **ar / tr / he sin revisión nativa**, como en el resto del producto.
5. En las fotografías de producción se ven **marcas de agua de los portales**
   ("SUM", "JV", "BARNES"). Es del pipeline de imágenes, no de esta pantalla,
   pero se le está enseñando al cliente.

---

## Cierre · marcas de agua y flujo del agente

### Marcas de agua — investigado, y la conclusión NO es la esperada

Dos causas distintas, y solo una era arreglable en código.

**1 · Fotos de anuncios de portal → CORREGIDO.** 90 de los 152 items de una
selección son anuncios que todavía no son ficha, y su fotografía se servía
**directamente desde `img4.idealista.com`**. Además de traer la marca del
portal, cada carga le contaba al cliente de dónde sale la casa — una fuga de
origen del mismo tipo que el contrato prohíbe. Ahora viajan por nuestro proxy
(`/p/i/{itemId}`), sin referrer, y solo responden mientras la selección siga
viva. Verificado en producción: la imagen sirve 200 y el HTML ya no nombra al
portal. Con test.

**2 · Fotos nuestras con marca (SUM, JV, BARNES) → NO se debe "arreglar".**
Las 469 fotografías de las 14 propiedades están en **nuestro** storage: la
marca está horneada en nuestra copia. No existe una "versión limpia" que
elegir — el limpiado dinámico **sobrescribe el fichero**, no crea una copia.

Nunca se ejecutó, y hay un motivo para no ejecutarlo: **lo probé sobre una
copia y el resultado destroza la fotografía**. El motor detecta la marca
(`alpha=0.95, zona=5%`) y la quita, pero deja la imagen fantasmeada y lavada,
como una doble exposición. Comprobado en dos fotos distintas.

Conclusión: la superficie del cliente ya usa la única versión que existe. El
arreglo real está aguas arriba —reimportar de una fuente sin marca, o afinar
el motor— y **no** en pasar el limpiador por el catálogo, que empeoraría las
fotos. Que sea manual y opt-in nos ha protegido.

### Flujo del agente — verificado hasta donde llega sin sesión

Escenario listo en la ficha de Paul: **5 prioritarias (1..5), 2 alternativas,
2 descartadas, enviada**. Comprobado a nivel de datos y de lógica:

- el recuento que verá la ficha es el correcto;
- el ranking va del 1 al 5 **sin huecos**;
- consta como enviada, con su fecha;
- 4 de las prioritarias necesitarán alta en la selección, con
  `source='client_shortlist'` — origen admitido por la base;
- ninguna prioritaria está archivada (romperían la publicación).

Y un hueco corregido de camino: si el cliente marca cinco y dos son anuncios
sin ficha, se creaba el itinerario con tres **sin decir nada**. Ahora avisa
antes de navegar, distinguiendo las que faltan por crear de las que ya no
están disponibles.

**Lo que solo puedes hacer tú:** pulsar `Crear itinerario con sus prioridades`
y comprobar que el borrador sale con las cinco en el orden 1..5, sin fecha,
sin horas y sin confirmaciones.

### Regresión final

```
npm run test:client-shortlist      verde (incluye la fuga por foto de portal)
npm run test:viewing-collections   verde
npm run test:idealista             100/100
npx tsc --noEmit                   limpio
npm run build                      ok
```
