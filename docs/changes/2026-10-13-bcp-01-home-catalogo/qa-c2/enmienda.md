# BCP-01 · Enmienda tras la QA de C2: lector y gestor

Fecha: 14 de octubre de 2026. **Estado: decisiones DQ1–DQ8 aprobadas por Fabricio** (registro en §0). La aprobación permite actualizar esta enmienda y preparar el plan de **E1** ([`plan-e1.md`](plan-e1.md)); **no** autoriza implementar.

## 0. Registro de aprobación (14 de octubre de 2026)

Fabricio aprueba DQ1–DQ8, la dirección de las maquetas y el orden de entregas **E1 → E2 → E3**, con estas precisiones, que **mandan sobre el texto de las secciones siguientes** cuando difieran:

| | Decisión aprobada |
| --- | --- |
| **D-QA1** (DQ1) | El recorrido se agrupa por **extensión y espacio disponible real**, no solo por número de capítulos. Las palabras son una heurística: el encaje se **comprueba renderizado** con los tamaños de letra aprobados. Se conserva todo el contenido, sin relleno. No se promete un número fijo de páginas cuando el material no cabe. |
| **D-QA2** (DQ2) | Una entrada de más de unas **45 palabras** sale de la apertura y va **íntegra al principio del recorrido**, con un enlace de navegación claro. |
| **D-QA3** (DQ3) | Sin foto adecuada para el recorrido: una **página de texto cuidadosamente compuesta**, nunca una foto que no corresponde. |
| **D-QA4** (DQ4) | El recorrido automático se salta las fotos **clasificadas de forma fiable** como `floor_plan`, `street_context` u `other`, con la regla de confianza existente (corregida a mano, o IA ≥ 0,75). Las fotos **sin clasificar siguen siendo elegibles**: E1 no garantiza apartar un mapa o un aviso sin clasificar. No se aplica en silencio ninguna exclusión más amplia. |
| **D-QA5** (DQ5) | En **E3**: elegir la foto de apertura y excluir fotos **por catálogo**. «No usar esta foto en este catálogo» la **oculta en todo ese catálogo**: galería, miniaturas, apertura, recorrido y, donde aplique, portada del catálogo. Las fotos originales del CRM se conservan y siguen disponibles en todo lo demás. Los respaldos seguros de la portada se definen en la especificación y el plan de E3. **Su migración no se implementa ahora.** |
| **D-QA6** (DQ6) | Sin descripción vigente: **ficha de datos completa** y **mosaico adaptable de hasta cuatro fotos adicionales elegibles**, con acceso al resto de la galería. Nunca se inventa una descripción ni se muestran diagnósticos internos al cliente. |
| **D-QA7** (DQ7) | El gestor se organiza en **Viviendas, Contenido, Diseño y Compartir**, con la lista compacta y el editor único aprobados. Se conservan la **navegación global del CRM** y la tipografía Lato del admin: la barra lateral esquemática de las maquetas **no** autoriza rediseñarla. |
| **D-QA8** (DQ8) | **Diagnósticos de material en Contenido** («Sin descripción», capítulos sin foto adecuada…), **sin llamadas a la IA**. |
| **D-QA9** | **Valores sin guardar.** Cambiar de sección, cerrar un editor o abrir otra vivienda **conserva los valores escritos durante la sesión de edición actual**, en **todos** los formularios: criterios, título e introducción, portada, contacto y texto de cada vivienda. Nada se guarda ni se publica solo. **No** se promete que los valores sin guardar sobrevivan a una recarga (no está especificado). |
| **D-QA10** | **Entregas.** <ul><li>**E1:** defectos del lector L1–L4 más DQ1–DQ4 y DQ6, **sin migración**.</li><li>**E2:** organización del gestor y diagnósticos, conservando las acciones de servidor y la semántica de selección existentes.</li><li>**E3:** fotos por catálogo, con migración y plan de recuperación propios.</li><li>PDF (importar/exportar), fuera de este trabajo.</li></ul> |

| **D-QA11** | **Ejecución de E1 aprobada** el 14 de octubre de 2026 (tareas del plan), con tres correcciones obligatorias incorporadas en [`plan-e1.md`](plan-e1.md): <ul><li>cada cambio de API llega en el mismo commit que sus consumidores, con los literales tipados actualizados;</li><li>la verificación usa resultados explícitos y la completitud se compara con los capítulos de origen, no con `itemLayout`;</li><li>el servidor de fixtures y la compilación corren en una copia aislada sin `.env*` y con un entorno mínimo explícito, verificado antes de arrancar.</li></ul> Autoriza preparar el worktree, `npm ci`, usar el Chromium en caché, verificar en local, hacer commits, push de la rama, abrir el PR y la CI. **No autoriza el merge, E2, E3 ni PDF.** |
| **D-QA12** | **Ejecución de E2 aprobada** el 15 de octubre de 2026 (tareas T0–T10 de [`plan-e2.md`](plan-e2.md)), con A1–A4 aprobados y cuatro ajustes obligatorios incorporados en el plan (§0): <ul><li>lo escrito se conserva en bruto y exacto, y la normalización solo decide validación e indicadores;</li><li>las ediciones hechas durante un guardado en curso nunca se borran ni se pisan: la respuesta solo reconoce la instantánea enviada, con pruebas de guardado con retraso, con éxito y con fallo;</li><li>`test:catalogs-manager` entra en la CI real;</li><li>solo herramientas de lint existentes, sin instalar nada ni añadir configuración.</li></ul> Autoriza `npm ci`, el Chromium en caché, el entorno aislado, fixtures y pruebas sintéticas, commits, push de `fabri/bcp-01-e2`, el PR y la CI. **No autoriza el merge, E3 ni PDF.** |
| **D-QA13** | **Decisiones de E3 (15 de octubre de 2026):** E3-1 no se puede excluir la última foto; E3-2 una foto excluida se vuelve a usar explícitamente antes de elegirla como apertura; E3-3 respaldos de la apertura y de la portada del catálogo; E3-4 los ajustes de fotos se guardan al pulsar; E3-5 reimportar invalida los ajustes, con aviso; E3-6 la exclusión es de presentación, no revoca `/p`; E3-7 se puede excluir la foto de portada tras confirmar. Detalle en [`enmienda-e3.md` §5](enmienda-e3.md). **Autoriza a documentar E3, no a implementarlo.** Su plan queda pendiente: la prioridad pasa al diagnóstico de la selección automática. Sigue abierto el requisito técnico de la identidad de la foto servida (un `src` posicional no es estable si el CRM reordena; proxy y caché de 24 h). |
| **D-QA19** | **Ejecución de E3 aprobada** el 16 de octubre de 2026 (T0–T9 de [`plan-e3.md`](plan-e3.md)), con N1(a) (proxy de fotos con identificación opaca `?f=` y versión `?v=`), N2 (cambio único de `src` y huellas al desplegar), confirmación al excluir la apertura elegida, miniaturas del gestor con la apertura efectiva y cinco correcciones (última foto transaccional, avisos de ajustes que ya no aplican, redacción de los respaldos, rendimiento frente a `main` y límite de la versión por URL). Autoriza `npm ci`, el Postgres temporal, la copia aislada, el Chromium en caché, commits, push, PR y CI. **No autoriza el merge**, la HOME editable ni PDF. |

Sin revisión adicional de Codex.

Base: `origin/main` = `11f4bc1` (C2 fusionado). Evidencia: [informe de reproducción](informe.md). Maquetas: [lector](maquetas/lector.html) y [gestor](maquetas/gestor.html), con capturas en [`capturas/`](capturas/) (`maqueta-*.jpg`). Todo con datos sintéticos.

## 1. Qué se pide aprobar

| | Decisión | Recomendación | Maqueta |
| --- | --- | --- | --- |
| **DQ1** | Agrupar el recorrido **por extensión** (palabras por página) en vez de por número de secciones. | Sí. | R2 |
| **DQ2** | Si la entrada supera unas 45 palabras, sale de la apertura y **abre el recorrido**. | Sí. | R1, R2 |
| **DQ3** | Sin foto adecuada para un grupo de capítulos: **página tipográfica** centrada, nunca una foto sustituta. | Sí. | R3 |
| **DQ4** | No usar solas en el recorrido las fotos **clasificadas** como `floor_plan`, `street_context` u `other`. La galería no cambia. | Sí. Límite: una foto **sin clasificar** sigue siendo elegible. | — |
| **DQ5** | **Fotos por catálogo**: elegir la foto de apertura y marcar fotos «No usar en este catálogo», sin tocar la ficha del CRM. | Sí, pero en una entrega **aparte** (necesita migración: tamaño grande). | G2 (bloque azul) |
| **DQ6** | **Ficha breve** para «solo datos y fotos»: ficha completa y mosaico de hasta 4 fotos de la galería. | Sí. | R4, M2 |
| **DQ7** | Gestor en **cuatro secciones**: Viviendas, Contenido, Diseño y Compartir. | Sí. | G1–G4, GM1–GM3 |
| **DQ8** | Avisos de material en Contenido («Sin descripción», «N capítulos sin foto adecuada»), calculados sin IA. | Sí. | G2 |

Las correcciones L1–L4 (§2) no son decisiones nuevas: arreglan defectos confirmados dentro del alcance aprobado de C2.

## 2. Lector · correcciones (defectos D1–D4)

### L1 · Ningún capítulo aprobado queda sin acceso (D1)
En el nivel historia, el detalle reúne **«La historia completa»**: todos los capítulos aprobados en su orden y con su título. Si además hay una descripción limpia vigente, va después con su propio nombre. Si un recorrido no cabe en sus dobles páginas, el enlace de la última lleva a donde está lo que falta.

- **AC-L1.1** Con historias sintéticas de 6, 7, 8 y 9 capítulos, con y sin descripción limpia distinta y con y sin características, **cada capítulo aprobado aparece íntegro y en su orden** en escritorio (páginas y desplazamiento) y en móvil. Lo comprueba [`reproduccion-integridad.mts`](reproduccion-integridad.mts), que pasa a ser una prueba de `test:catalogs-public`.
- **AC-L1.2** Los micro-capítulos siguen yendo a las características. Un bloque con contacto, precio o agencia sigue sin mostrarse, como hoy.
- **AC-L1.3** El texto del catálogo y la descripción limpia no cambian de comportamiento: el detalle sigue trayendo su texto íntegro.

### L2 · Letra legible en doble página (D2)
Se pone un **suelo** al texto corrido, sin agrandar la página entera; lo que deja de caber se reparte (DQ1) o se desplaza dentro de la página como hoy.

- **AC-L2.1** A 1280 × 720 y 1440 × 900, en doble página, se miden con `getComputedStyle`:
  - texto del recorrido y descripción completa **≥ 15 px**;
  - entrada **≥ 16 px**;
  - datos clave **≥ 13 px**;
  - textos auxiliares **≥ 12 px**.
- **AC-L2.2** Cero desbordes recorriendo todas las páginas de los catálogos sintéticos de 1, 12 y 24 viviendas, incluido un texto de 6.000 caracteres, a 1280 × 720, 1440 × 900, 362 y 320 px.
- **AC-L2.3** En una página nada cambia: hoy mide 15,7 px.

*Comprobado en la maqueta R2:* una entrada de 80 palabras y tres capítulos breves **no caben** juntos en una página a 15 px. Por eso la cifra va unida a la agrupación por extensión, y el presupuesto de palabras por página se calibra en la implementación con textos reales de longitud máxima.

### L3 · La señal de desplazamiento no tapa nada (D3)
- **AC-L3.1** «Sigue leyendo ↓» ocupa **su propia banda** al pie de la zona de texto. Su caja no se cruza con ningún botón, enlace ni línea de texto visible, con la entrada de 96 palabras del caso real reproducida con datos sintéticos (prueba de cajas en el navegador).

### L4 · Estados de las fotos (D4)
- **AC-L4.1 Cargando:** el marco muestra el tono del papel y «Cargando foto…»; las miniaturas solo el tono. Con «reducir movimiento», sin animación.
- **AC-L4.2 Error:** «Foto no disponible». La galería sigue abriendo las demás fotos y no se repite la petición en bucle.
- **AC-L4.3 Sin foto adecuada:** no se dibuja marco vacío; la composición es la de DQ3.
- **AC-L4.4** Se prueba con una foto de fixture que tarda y otra que devuelve 404: en el lector, las miniaturas y la galería, sin errores de JS.

## 3. Lector · composición adaptativa (DQ1–DQ4, DQ6)

Principio: **conservar todo el contenido disponible, no inventar nada** (ni texto de relleno, ni afirmaciones, ni fotos) y no publicar nada solo. Dirección Boutique intacta.

- **DQ1 · Agrupación por extensión.**
  - Las secciones de un recorrido se reparten por presupuesto de palabras, no de dos en dos.
  - Una sección de menos de unas 25 palabras se une a la siguiente o a la anterior.
  - Cada doble página lleva como mucho una foto: la de su clase, si existe.
  - **AC:** el caso Reforma sintético (entrada de 96 palabras y capítulos de 9, 8 y 16) da **una** doble página de recorrido (R2). El caso Peñalver (11, 20 y 45 palabras, una foto de clase) da una página con su foto. Ninguna página de recorrido tiene menos de 25 palabras salvo que sea todo el contenido. Índice, folios y D12 siguen correctos tras reagrupar (pruebas T8/Z6 ampliadas).
- **DQ2 · Entrada larga.**
  - Más de unas 45 palabras: la apertura muestra foto, título, precio, datos y miniaturas, más «Sigue · La vivienda →».
  - La entrada completa abre el recorrido.
  - **AC:** ningún texto se recorta. En la apertura no aparece la señal de desplazamiento con esas entradas.
- **DQ3 · Página tipográfica.**
  - Un grupo sin foto adecuada va en una página centrada, con texto algo mayor y acceso a «Ver las N fotos».
  - **AC:** nunca se usa una foto de otra clase, ni un mapa o aviso, para rellenar.
- **DQ4 · Clases que no entran solas.**
  - En el recorrido automático (texto y descripción limpia, por orden) se saltan las fotos clasificadas como `floor_plan`, `street_context` u `other`.
  - Una clase cuenta si está corregida a mano, o si es de la IA con confianza ≥ 0,75 (la misma regla de C2).
  - **AC:** con fixtures de esas tres clases, no aparecen en el recorrido y siguen en la galería.
  - **Límite reconocido:** una foto sin clasificar sigue siendo elegible. No se puede saber si la foto-mapa de Goya está clasificada: Fabricio puede verlo en la revisión de fotos de esa ficha. Si no lo está, solo DQ5 o corregir la clase a mano la apartan.
- **DQ6 · Ficha breve** (solo datos y fotos).
  - Ficha completa y mosaico de hasta 4 fotos de la galería, en su orden, sin la de apertura y sin las de DQ4, que abren la galería.
  - En móvil, la ficha va desplegada, porque es todo lo que hay.
  - **AC:** el cliente nunca ve «Sin descripción» ni diagnósticos internos. Con 1–3 fotos el mosaico se adapta sin huecos.

## 4. Gestor en cuatro secciones (DQ7, DQ8)

Patrones adaptados de Shadcn Admin (lista compacta y formulario en panel lateral) y Atomic CRM (lista y registro individual), ambos MIT, con los componentes, la paleta y la tipografía Lato del CRM. **Sin instalar ningún framework ni dependencia nueva.** De Twenty solo se toma la idea de interacción (licencia mixta); no se copia código.

| Sección | Qué contiene | Maqueta |
| --- | --- | --- |
| **Viviendas** | Criterios resumidos y «Modificar criterios» (el panel de selección actual, en un cajón), modo manual/automático, vistas «En el catálogo · Coincidencias · Excluidas», buscador para incluir, lista compacta con el orden y la selección, y motivos y acciones en el panel de la vivienda. | G1, GM3 |
| **Contenido** | La misma lista con «Qué ve el cliente» y el estado del texto, filtros por estado y **un único editor**: panel lateral en escritorio y pantalla propia en móvil. | G2, GM1, GM2 |
| **Diseño** | Título, introducción, portada (vivienda y foto) y su vista previa. | G3 |
| **Compartir** | Asesor/a, nombre y teléfono; enlace, caducidad, renovar y revocar; «Organización interna · anuncios de origen» como bloque secundario; panel de medición con `?medir=1`. | G4 |

Cabecera fija con nombre, estado, número de viviendas, **«Vista previa»** y **«Compartir»**:
- «Vista previa» abre el lector del enlace activo. Si no hay enlace, lleva a Compartir.
- Ninguno de los dos guarda, publica ni crea nada.

### Criterios de aceptación del gestor
- **AC-G1 Navegación:**
  - la sección está en la URL (`?seccion=`): recargar o volver atrás conserva el sitio;
  - pestañas accesibles con teclado (`tablist`).
- **AC-G2 Viviendas:**
  - con 20–24 viviendas, la lista cabe sin desplazamiento horizontal a 1280 px;
  - siguen disponibles, **con las mismas reglas y mensajes**: incluir, excluir, quitar inclusión, volver a permitir, subir/bajar y quitar en manual, pasar a manual o automático, «Volver a mi lista anterior» y «Convertir»;
  - los bloqueos del máximo y los avisos (sin foto, otra operación, no disponible, zonas redundantes) se mantienen;
  - las explicaciones salen en el panel de la vivienda, no repetidas en cada fila.
- **AC-G3 Contenido (borradores) y valores sin guardar (D-QA9):**
  - un editor abierto a la vez;
  - cerrar el panel, pasar a otra vivienda o cambiar de sección **conserva lo escrito durante la sesión de edición**, sin guardarlo. Vale para **todos** los formularios: criterios, título e introducción, portada, contacto y texto de cada vivienda;
  - la fila y el filtro marcan «Cambios sin guardar»;
  - salir de la página con cambios pide la confirmación del navegador. Una recarga **no** conserva los valores sin guardar, y la interfaz no lo sugiere;
  - nada se guarda ni se publica solo;
  - «Guardar borrador» y «Publicar» siguen separados, con las mismas condiciones para publicar (borrador guardado, sin cambios pendientes, sin bloqueos, avisos confirmados uno a uno).
- **AC-G4 Contenido (IA):**
  - la IA solo actúa al pulsar;
  - se mantienen «Cancelar», los 60 s y que una respuesta tardía no pisa lo editado («Usar la propuesta»);
  - los avisos se ven al reabrir un borrador guardado.
  - «Qué ve el cliente» explica la prioridad (texto publicado → historia → descripción limpia → datos y fotos) y la fuente cambiada.
- **AC-G5 Diseño:** las reglas de portada de C1 se mantienen: vivienda de la lista efectiva, foto suya, respaldos y avisos, y «Volver a la portada automática».
- **AC-G6 Compartir:**
  - contacto, enlace, caducidad, renovar y revocar se comportan igual;
  - los anuncios de origen no llegan nunca al contrato público.
- **AC-G7 Móvil (362 y 320 px):**
  - sin desplazamiento horizontal;
  - las cuatro secciones caben en la barra;
  - las acciones fijas no tapan campos, avisos ni botones (misma comprobación de cajas que el lector).
- **AC-G8 En vivo:** cada acción que cambia lo que ve el cliente sigue avisando al lector, igual que hoy (D12/D13; medición 20 × 2 sintética en verde).

## 5. Lo que no cambia

- Reglas del automático (0195/0196): criterios, máximo 1–24, inclusiones y exclusiones, orden, recuentos y explicaciones.
- Portada elegida y sus respaldos.
- Permisos E1 (dueño, `service_role`, RLS, SECURITY INVOKER).
- Prioridad de las fuentes de texto, vigencia por huella de la fuente y vuelta al siguiente nivel cuando cambia.
- IA solo a demanda, con revisión humana, bloqueos de contacto y precio, y avisos confirmables.
- Aislamiento: ninguna escritura en `property_client_descriptions`, `properties.description`, historias ni otras cachés compartidas; nada toca las fichas ni las fotos del CRM.
- Contrato público y privacidad.
- Actualizaciones en vivo, D12 y D13.
- Teclado, deslizar, galería, modo desplazamiento y «reducir movimiento».
- Índice y folios correctos.

## 6. Entregas recomendadas

| Entrega | Contenido | Tamaño | Migración |
| --- | --- | --- | --- |
| **E1 · Lector** | L1–L4 y DQ1–DQ4 y DQ6 aprobadas. Primero: es lo que ve el cliente. | Medio | No |
| **E2 · Gestor** | DQ7 y DQ8. Solo interfaz: mismas acciones de servidor y mismas funciones SQL. | Medio–grande (reorganización estructural de la pantalla) | No |
| **E3 · Fotos por catálogo** *(si se aprueba DQ5)* | Foto de apertura y exclusiones por catálogo y vivienda, editables en Contenido; el lector las respeta. | Grande | Sí (`0198`, con su recuperación) |

Si DQ1–DQ6 no se aprueban, E1 queda en L1–L4. E1 y E2 no dependen entre sí. E3 depende de E2 (vive en su panel).

## 7. Fase y siguiente paso

> **Actualización (15 de octubre de 2026):** E1 está fusionado (PR #317). **E2** está fusionado (PR #318, `84538e7`, CI en verde) y Fabricio ha aceptado su QA en vivo (cuatro secciones, conservación de lo escrito y confirmación al salir). Siguen pendientes las pruebas en dispositivos reales y D13 en vivo. **E3** tiene la especificación con sus decisiones aprobadas (D-QA13, [`enmienda-e3.md`](enmienda-e3.md)), pero el plan está **en pausa**: antes va el diagnóstico de la selección automática ([`diagnostico-seleccion-auto.md`](diagnostico-seleccion-auto.md)). La organización de la HOME por grupos queda como propuesta futura ([`futuro-home-grupos.md`](futuro-home-grupos.md)). Lo que sigue en esta sección es el estado del 14 de octubre.

- **Fase actual:** decisiones aprobadas (§0). Plan de E1 en **borrador**, pendiente de aprobación para ejecutarse: [`plan-e1.md`](plan-e1.md). No se ha cambiado la aplicación.
- **Siguiente paso:** Fabricio aprueba (o corrige) el plan de E1. Solo entonces se prepara el entorno y se implementa E1. E2 y E3 tendrán su propio plan.
- **Fuera de alcance:** PDF (importar/exportar) y la medición D13 en vivo, que sigue pendiente.
