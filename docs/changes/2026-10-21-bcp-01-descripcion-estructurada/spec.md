# BCP-01 · Descripción estructurada del catálogo: especificación

**Encargo (Fabricio, 2026-10-21).** Cada vivienda tiene su propia descripción de catálogo, escrita a mano o preparada con el asistente de IA ya configurado. El sistema identifica palabras clave **y** el contexto de cada frase y organiza el texto en la estructura editorial estándar, sin recorrido ni páginas extra, igual en lector (escritorio y móvil), vista previa del editor y PDF. Sin llamadas de IA al leer. Sin inventar nada.

Sigue al expediente [2026-10-20-bcp-01-compacto-y-opiniones](../2026-10-20-bcp-01-compacto-y-opiniones/spec.md) (DC1–DC20 siguen vigentes). Tamaño: grande (lector, PDF, editor y contrato de datos).

## Decisiones

| | Decisión |
| --- | --- |
| **DE1** | **Estructura estándar** de la descripción, en este orden fijo: introducción breve (sin título) · **Salón y luz** · **Cocina y comedor** · **Acabados y confort** · **La finca** · **Vivir en [zona verificada]**. Solo se muestran las partes con material: nunca un título vacío ni texto de relleno. |
| **DE2** | **Un solo organizador determinista** (`lib/catalogs/structure.ts`, puro) produce la representación organizada (`copy`) que usan el lector, la vista previa del editor y el PDF. Se calcula en el servidor al proyectar la instantánea (como hasta ahora `copy`) y en el editor en vivo; nunca llama a una IA. |
| **DE3** | **Clasificación por frase**: palabras clave y sinónimos (sin tildes, con plurales) por tema, más contexto: una frase sin palabra clave que empieza con un conector o un pronombre («Además», «También», «Este», «Sus», «Con», «Dispone de»…) hereda el tema de la frase anterior de su mismo párrafo. Una frase con varios temas va **una sola vez** al tema con más señales; en empate, al primero que menciona. Lo que no casa con ningún tema se conserva en la introducción. |
| **DE4** | **Introducción** = la entrada propia (si la hay) o la primera frase del texto (≤ 45 palabras: el autor la escribió para abrir, aunque nombre un tema), más el material no clasificado, en párrafos. Nada se repite entre introducción y secciones: cada frase tiene un único destino. |
| **DE5** | **Negaciones y matices**: el texto se mueve **literal**, nunca se reescribe ni se resume. «Sin ascensor» va a La finca tal cual; las características verificadas siguen saliendo solo de la ficha (ninguna afirmación nueva). |
| **DE6** | **Títulos escritos por el autor**: una línea corta que nombra una parte estándar (p. ej. «Salón», «Cocina:», «La finca», «El barrio», «Vivir en Retiro») se reconoce y todo lo que sigue hasta el siguiente título va a esa parte; se normaliza el orden. Un título no estándar («Dormitorios:») no se muestra: su contenido se clasifica frase a frase y se conserva. |
| **DE7** | **Historias aprobadas** (fuente de nivel 2): se conservan sus capítulos **compatibles** con su título (Salón y luz, Cocina y comedor, Acabados y confort, La finca, Vivir en…) sin reclasificar frases, en el orden estándar; la entrada va a la introducción. Los capítulos no compatibles («La vivienda», «Zona privada», «Vida al aire libre») conservan su texto dentro de la introducción, sin título. Los micro-capítulos siguen yendo a características, como hasta ahora. |
| **DE8** | **Descripción limpia** (nivel 3) y **texto publicado** (nivel 1) se organizan con las mismas reglas; la prioridad entre fuentes no cambia (C2). |
| **DE9** | **Zona**: el título «Vivir en …» usa la zona verificada de la ficha (`subzone`, si no `zone`); sin zona verificada, «El barrio» (vocabulario cerrado existente). Los nombres de la zona verificada cuentan como palabras clave del tema. No se añaden distancias ni servicios que el texto no diga. |
| **DE10** | **Editor**: se conservan título y descripción por catálogo, «Preparar desde la ficha» y «Borrador con IA» (solo al pulsar; la publicación sigue siendo explícita; nunca se pisa lo escrito o publicado). Debajo de la descripción, una **vista previa organizada en vivo** con la misma función del lector y un aviso de qué partes quedan sin información («Sin material sobre: cocina, finca»). Es una ayuda, no un bloqueo. |
| **DE11** | **IA**: el borrador recibe en su instrucción la estructura estándar para cubrir, con los hechos que haya, salón y luz, cocina, acabados, finca y zona; se le recuerda que no invente. Los agentes solo usan IA simulada. |
| **DE12** | **Lector y PDF**: exactamente dos pantallas por vivienda (DC1); la pantalla 2 muestra los bloques organizados con sus títulos en el mismo orden en escritorio, móvil y PDF. Sin cambios en título propio (0217), fotos, actualizaciones en vivo ni opiniones (0218). |

## Alcance

`lib/catalogs/structure.ts` (nuevo); `editorial.ts` (usa el organizador en los tres niveles); `texts.ts`/acciones (zona verificada para el editor); panel de textos (vista previa en vivo y avisos); `ai-draft.ts` (instrucción); pruebas nuevas y las existentes adaptadas; expediente y capturas.

## Fuera de alcance

Cambiar la ficha del CRM o las historias guardadas; páginas de recorrido; títulos fuera de la estructura estándar; reescritura o resumen automático del texto; IA al leer; producción, credenciales, escrituras reales, IA real, servicios de pago y revisión de Codex.

## Criterios de aceptación

| | Criterio |
| --- | --- |
| **E1** | Texto publicado, descripción limpia e historia aprobada producen la misma estructura estándar, en el mismo orden, en lector (escritorio y móvil), vista previa y PDF. |
| **E2** | Texto sin títulos y párrafos con varios temas: cada frase aparece exactamente una vez; ninguna se pierde (comparación frase a frase con la fuente). |
| **E3** | Negaciones («sin ascensor», «no tiene calefacción») se conservan literales en su sección; no aparece ninguna característica nueva. |
| **E4** | Palabras clave con y sin tilde se reconocen igual; textos largos (1.500 palabras) llegan enteros. |
| **E5** | Partes sin información no se muestran y el editor las señala. |
| **E6** | Exactamente dos pantallas por vivienda; título propio, fotos, en vivo y opiniones sin cambios (suites existentes en verde). |

## Impacto en datos y despliegue

Sin migración. Cambia el contenido de `copy` en la instantánea pública (y por tanto la huella de los catálogos con descripción): los lectores abiertos reciben la versión nueva en vivo, como con cualquier cambio.
