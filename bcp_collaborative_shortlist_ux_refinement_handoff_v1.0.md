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
