# BCP-01 · QA de C2 — informe de reproducción

Fecha: 14 de octubre de 2026. Fase: **QA de producto tras el despliegue de C2** (#316 fusionado, `origin/main` = `11f4bc1`). Este informe no cambia la aplicación; acompaña a la [enmienda](enmienda.md) y a las [maquetas](maquetas/). No se inicia la fase de PDF.

## Cómo se ha reproducido

| Fuente | Qué se hizo | Límites |
| --- | --- | --- |
| Catálogo público de QA (enlace facilitado por Fabricio; no se copia aquí) | Lectura del estado público (`/api/seleccion/…/estado`, el mismo JSON que recibe el lector) y recorrido con Chrome sin cabeza a **1280 × 720**, **362** y **320 px**; estado HTTP de las 54 fotos usadas en aperturas y recorridos; navegación rápida con red lenta simulada (400 ms, 50 KB/s) | Solo lectura. Sin admin, sin VPS, sin base de datos, sin credenciales, sin `?medir`. Los datos reales no se guardan en el repo: solo cifras y unas capturas |
| Código de `main` (`11f4bc1`) | `deriveEditorial`, `journeyGroups`, `itemParts` y `hasDetail` con datos **sintéticos**: [`reproduccion-integridad.mts`](reproduccion-integridad.mts) | Reproduce el riesgo; no prueba que haya ocurrido en producción |

El catálogo tiene 20 viviendas: 65 páginas en doble página y 23 en una página. Reparto por nivel: 6 con **historia aprobada**, 7 con **texto o descripción limpia** y 7 con **solo datos y fotos**. Ninguna de las 6 con historia tiene descripción limpia vigente ni puntos destacados.

## Defectos confirmados (corrección dentro de C2)

| # | Defecto | Evidencia | Causa en el código |
| --- | --- | --- | --- |
| **D1** | **Capítulos aprobados sin acceso en escritorio.** A partir del 7.º capítulo de una historia aprobada no hay forma de leerlo en doble página ni en modo desplazamiento de escritorio. | Reproducción sintética: con 7 capítulos falta el 7.º; con 9, faltan el 7.º, el 8.º y el 9.º. Pasa con y sin descripción limpia distinta y con y sin características. En móvil se ve todo. Control: el texto del catálogo no pierde nada (su detalle trae el texto íntegro). | `journeyGroups` enseña como mucho 3 × 2 secciones y, en el nivel historia, el detalle muestra la **descripción limpia** (o nada), no los capítulos. |
| | *No confirmado en producción:* el máximo real hoy es 6 capítulos (Diego de León), justo en el límite. Existen 8 capítulos posibles. | | |
| **D2** | **Letra demasiado pequeña en doble página a 1280 × 720.** | Medido: texto del recorrido **11 px**, datos clave **10,1 px**, descripción completa **10,5 px**, entrada 13,2 px. En una página el texto mide 15,7 px. | El tamaño de la página escala con la altura de la ventana (`--pw × 0,026`). |
| **D3** | **La señal «Sigue leyendo ↓» tapa un control.** | Apertura de Reforma en Goya (folio 50): la entrada de la historia (96 palabras) desborda y la señal se superpone a «Ver las 23 fotos». [Captura](capturas/repro-d1280-50-reforma-apertura.jpg). | La señal flota sobre el final de la zona de texto, sin espacio propio. |
| **D4** | **Sin estado de carga ni de error en las fotos.** | Con red lenta, el marco y las miniaturas son rectángulos vacíos sin ninguna indicación. [Captura](capturas/repro-d1280-red-lenta.jpg). Una foto que fallara se vería igual. | `FramedPhoto` y las miniaturas no tratan `load`/`error`. |

**Fotos rotas: no se confirma ninguna.** Las 54 fotos usadas responden 200 en menos de 0,9 s y, con red normal, todas cargan a 1280, 362 y 320 px. Los huecos en blanco de la QA visual eran fotos **cargando** (D4), no fallos permanentes.

## Fallbacks esperados (comportamiento aprobado, presentación mejorable)

| Caso | Lo que pasa | Por qué es lo esperado |
| --- | --- | --- |
| 7 viviendas **solo con datos y fotos** (p. ej. Calle de Goya 1.070.000 €, folio 21) | Apertura con foto, precio y datos; la página derecha queda medio vacía. [Captura](capturas/repro-d1280-21-salamanca-datos.jpg) | Sin descripción vigente no se inventa texto (regla aprobada). La composición es lo que falta → decisión DQ6. |
| **Páginas de recorrido sin foto** (Espartinas folio 25, Peñalver 29–30, Reforma 51) | Páginas de texto solas; Reforma 51 tiene una única frase de 10 palabras. [Peñalver](capturas/repro-d1280-30-penalver-j3.jpg), [Reforma](capturas/repro-d1280-51-reforma-j1.jpg) | Con historia, cada capítulo solo lleva una foto **de su clase**; si no la hay, va sin foto (mejor que una foto equivocada). Lo que falla es la **composición**: una sección por página sin mirar su extensión → DQ1. |
| **Goya 1.000.000 €** (folios 3–4) | La foto de apertura es una imagen de otra agencia con el aviso «Estamos pendientes de recibir el reportaje fotográfico»; la del recorrido es una captura de un mapa. [Captura](capturas/repro-d1280-04-goya-mapa.jpg) | Son fotos de la ficha del CRM: la de apertura es la portada de la ficha (o la primera si no hay marca), y la del recorrido es la siguiente en orden (nivel texto/limpia). Las clases de foto existentes **no tienen «mapa» ni «aviso»**: no se pueden reconocer de forma fiable. Excluirlas es una decisión nueva → DQ4/DQ5. |

## Decisiones de producto nuevas (no son defectos)

Se detallan, con recomendación y criterios, en la [enmienda](enmienda.md):

- **DQ1** · Agrupar el recorrido por extensión, no por número de secciones.
- **DQ2** · Sacar de la apertura una entrada larga.
- **DQ3** · Página tipográfica cuando no hay foto adecuada.
- **DQ4** · Qué clases de foto no entran solas en el recorrido.
- **DQ5** · Elección de fotos por catálogo. Necesitaría migración.
- **DQ6** · Ficha breve para solo datos y fotos.
- **DQ7** · Gestor en cuatro secciones.
- **DQ8** · Avisos de material en la gestión.

## Gestor

No se ha accedido al admin de producción. La propuesta parte del código actual: la columna principal concentra criterios, buscador, lista, inclusiones no disponibles, excluidas y los veinte bloques de texto; la lateral concentra portada, título/introducción, contacto, enlace, anuncios y medición. Las dos capturas de Fabricio confirman el problema de longitud. No hay defecto funcional que reproducir: es una reorganización (DQ7).

## Lo que no queda demostrado

- **D13 en vivo** (20 ensayos × 2 lectores) sigue pendiente: esta QA es visual.
- **Móvil en dispositivos reales.** Aquí: Chrome con viewport móvil a 362 y 320 px, sin desbordes horizontales y con el texto a 15,7 px.
- **Que D1 haya ocurrido en producción.** Solo se ha reproducido con datos sintéticos.
