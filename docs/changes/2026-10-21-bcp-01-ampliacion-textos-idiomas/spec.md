# BCP-01 · Ampliación: textos reutilizables, idiomas, «Vivir en…» y acabado visual — especificación

**Estado:** especificación y plan preparados, **sin implementar**. Fase: exploración de solo lectura y preparación. Nada de esto está en el código todavía.
**Base comprobada:** `origin/main` = `8b640e3b` (21 de octubre de 2026), con 0217 (título propio), 0218 (asignaciones y opiniones) y la descripción estructurada (#341). La última migración en `main` es la 0218; ningún PR abierto usa 0219 o posteriores (comprobado rama por rama).
**Tamaño:** grande o sensible (migraciones, contenido público, IA de pago bajo demanda, recursos tipográficos nuevos).

Las decisiones de Fabricio de este encargo se registran como **DA1–DA30** y no se vuelven a preguntar. Las únicas decisiones nuevas están en el apartado «Decisiones abiertas» (**N1–N4**), con recomendación.

## 1. Lo que se conserva (aprobado por Fabricio)

| | Decisión |
| --- | --- |
| **DA1** | La composición actual queda aprobada: **exactamente dos pantallas por vivienda** (apertura con foto y resumen; detalle con ficha y descripción completa), mismas disposiciones de escritorio y móvil, navegación, galería, valoraciones, asignaciones personales y accesibilidad. |
| **DA2** | Misma tipografía, posiciones, proporciones y reglas de número de páginas. Descripciones completas, con desplazamiento interno cuando haga falta. |
| **DA3** | Se mantienen permisos, controles de publicación, exclusiones de fotos, contacto, enlaces y salvaguardas del PDF. No hay rediseño ni pantallas de recorrido. |

## 2. Textos aprobados reutilizables (título y descripción)

**Hoy (comprobado):** `catalog_texts` guarda borrador y publicado **por catálogo y vivienda** (0197, 0217). Añadir una vivienda a otro catálogo (`catalog_add_property`, 0212) no copia nada: hay que volver a escribir o generar el texto.

| | Decisión |
| --- | --- |
| **DA4** | Existe una **biblioteca de textos aprobados por vivienda**, del dueño de la HOME. Al añadir la vivienda a un catálogo nuevo se copia automáticamente su **último texto aprobado vigente** (título y descripción). |
| **DA5** | Cada catálogo recibe una **copia independiente**. Aprobar otra versión en la biblioteca no cambia ningún catálogo ya creado o compartido. |
| **DA6** | **No son fuente reutilizable**: los borradores sin publicar y los textos personalizados para un cliente. Reutilizar no llama a la IA ni modifica la ficha del CRM. |
| **DA7** | Se respetan dueño y acceso: la biblioteca es del dueño (`owner_id`). Que una vivienda esté en catálogos de distintos usuarios no da acceso cruzado. |
| **DA8** | De otro catálogo **nunca** se copian: cliente, contacto, valoraciones, ajustes de fotos ni criterios de selección. Solo título y descripción. |

**Cómo se distingue «aprobado para reutilizar» de «publicado para un cliente».** Publicar en un catálogo sigue siendo lo que es hoy. Además, al publicar, una casilla **«Guardar como texto aprobado de la vivienda»** crea una versión en la biblioteca (su valor por defecto es la decisión **N1**). Desmarcarla mantiene ese texto solo en ese catálogo (p. ej. si habla del cliente). Una versión aprobada puede **retirarse** de la biblioteca sin tocar ningún catálogo.

**Siembra sin IA.** Una función de solo lectura lista como **candidatos** los textos ya publicados y vigentes (título y/o descripción) de los catálogos del dueño, agrupados por vivienda, con el catálogo de origen. Ningún candidato entra solo en la biblioteca: el dueño los confirma (uno a uno o en bloque), porque el sistema no puede saber si un texto publicado es personal. Los catálogos con asignaciones personales (0218) o cuyo texto nombra a un cliente se señalan como «posiblemente personalizado».

**Versionado.**
- Cada aprobación crea una **versión** inmutable (número correlativo por dueño y vivienda) con título, descripción, la huella de la ficha en ese momento (`catalog_source_hash`, la misma regla C2) y su origen.
- **Solo título**: es una versión válida (DC6/DC7 de 0217); al reutilizarla se copia el título y la descripción queda como esté.
- Un contenido idéntico al de la versión vigente **no crea versión nueva** (idempotente).
- **Traducciones** cuelgan de una versión concreta (ver §3): editar el español crea otra versión y las traducciones anteriores dejan de valer para ella.

**Si cambian los datos de la ficha.** La versión se conserva tal cual. El gestor indica «Revisar: cambió la ficha (dormitorios…)» con la misma lista de cambios que ya calcula `catalog_text_states`. No se regenera ni se sobrescribe nada. Al copiarla a un catálogo nuevo se aplica la regla C2 de siempre: el título se ve (DC6) y la descripción solo si su huella coincide con la ficha actual; si no, el catálogo muestra el nivel siguiente (historia, limpia o datos) y el gestor pide revisar.

**Concurrencia.** La aprobación se serializa por (dueño, vivienda) en la base de datos; dos aprobaciones simultáneas producen versiones en orden, nunca dos «vigentes». El guardado de borradores conserva su protección actual de revisión (`expected_rev`, conflicto con otra pestaña).

**Relación con lo existente.** La prioridad de fuentes (texto propio → historia → limpia → datos) no cambia. La copia en el catálogo es un **texto publicado normal** del catálogo, con su huella; el título sigue siendo independiente de la huella (DC6). La descripción estructurada (#341) organiza la copia igual que cualquier texto.

## 3. Catálogos en varios idiomas

**Hoy (comprobado):**
- El itinerario (`lib/viewing-collections/i18n.ts`) tiene 8 idiomas (es, en, fr, it, de, ar, tr, he), marca **ar, tr y he** como pendientes de revisión nativa (`TRANSLATION_REVIEW_REQUIRED`) y resuelve la dirección RTL con `isRtl`. **Solo traduce etiquetas fijas** de su interfaz: títulos y descripciones de viviendas salen en español.
- La caché `property_client_descriptions` (0172) es **compartida** por `/s`, `/compartir`, la importación automática y las instantáneas del catálogo (que leen su fila `es`). No tiene protección ante peticiones simultáneas y se llama en visitas públicas. **El catálogo no escribirá en ella.**
- El lector del catálogo y su PDF tienen todos los textos fijos en español y formatean con `es-ES`.

| | Decisión |
| --- | --- |
| **DA9** | Cada catálogo tiene un **idioma por defecto**; cada asignación personal puede tener un **idioma propio**, que también se aplica a su PDF. |
| **DA10** | Al elegir un idioma, el personal autorizado prepara **solo las traducciones que faltan, solo de ese idioma**, con el proveedor de IA ya configurado. Se guardan para reutilizarlas. |
| **DA11** | Las traducciones generadas se **revisan antes de publicarse**. |
| **DA12** | **Nunca** se llama a la IA por una visita pública, una descarga pública de PDF ni al cambiar a una traducción ya preparada y vigente. |
| **DA13** | Se traducen: etiquetas fijas, títulos de sección, título y descripción, características relevantes, controles de valoración, mensajes de estado y error, y el PDF. Se conservan nombres propios, datos verificados, precios y la identidad geográfica. |
| **DA14** | Una traducción solo se reutiliza si coinciden **exactamente** la versión de origen aprobada y el idioma. Editar el español no deja ninguna traducción antigua marcada como vigente. |
| **DA15** | Peticiones simultáneas de la misma versión e idioma producen **una sola** llamada a la IA. |
| **DA16** | Mientras un idioma se prepara o revisa, la experiencia publicada sigue intacta. |
| **DA17** | El idioma de un cliente no cambia el de otros clientes ni la atribución de sus valoraciones. |
| **DA18** | Se conservan la identidad y el orden de las secciones estructuradas entre idiomas: el clasificador por palabras clave en español **no** se pasa sobre texto traducido. |
| **DA19** | Contenido e idioma se capturan juntos en actualizaciones en vivo y PDF; nunca se sirve el idioma o el contenido de otro cliente por trabajo o caché compartidos. |
| **DA20** | Árabe y hebreo se leen de derecha a izquierda, también en el PDF (forma de letras y fuentes). Árabe, turco y hebreo siguen marcados «sin revisión nativa» y no se presentan como validados profesionalmente. |
| **DA21** | Si hay un obstáculo técnico, no se reduce la cobertura de idiomas ni se cambia la composición en silencio: se documenta y se decide. |

**Cómo se cumple (diseño).**
- **Unidad de traducción = la descripción ya organizada.** Se traduce bloque a bloque la salida del organizador español (introducción, Salón y luz, Cocina y comedor, Acabados y confort, La finca, Vivir en…), guardando la **clave de sección** de cada bloque. Los títulos de sección salen del diccionario del idioma; «Vivir en {zona}» conserva el nombre propio de la zona. Así no se reclasifica nunca texto traducido (DA18).
- **Dos niveles, como en DA5.** Las traducciones de la biblioteca cuelgan de su versión aprobada. Cuando un catálogo activa un idioma, las traducciones aprobadas se **copian** al catálogo con la huella del texto español publicado de ese catálogo. Editar y republicar el español deja esas copias **desactualizadas**: el gestor lo dice, ofrece «Preparar traducción» y los enlaces en ese idioma siguen viendo la versión anterior completa hasta que se apruebe la nueva (DA14, DA16). Nunca se mezcla un idioma con otro en la misma vivienda.
- **Un idioma se activa en un enlace solo cuando está completo**: todas las viviendas con texto tienen traducción aprobada y vigente. Hasta entonces el enlace sigue en el idioma anterior y el gestor muestra el progreso.
- **Características**: se traducen por cadena exacta de la ficha e idioma (tabla del dueño), con revisión; se conservan cifras y unidades.
- **Una sola llamada por versión e idioma** (DA15): reserva en la base de datos con caducidad (fila «en preparación» única por versión e idioma); quien llega después espera ese resultado.
- **Lectura pública**: el token decide el idioma (el del enlace personal o el del catálogo); la instantánea interna incluye el idioma y solo traducciones aprobadas y vigentes de ese idioma. La huella cambia con el idioma, así que el vigilante, la lectura coherente y la captura del PDF (que ya trabajan por token y huella) no pueden servir el idioma de otro enlace (DA19).
- **PDF**: mismas fuentes por idioma, dirección del texto RTL en árabe y hebreo, mayúsculas y números según el idioma, y metadatos de idioma (hoy fijos en `es-ES`).

**Viabilidad técnica (comprobada en el código, sin renderizar todavía).**
- **Motor de PDF** (`@react-pdf/renderer` 4.5.1, textkit 6.3.0, fontkit 2.0.4): ya trae algoritmo bidi, reordenación por línea, espejado de signos y forma de letras árabes por la tabla GSUB de la fuente. No refleja la maquetación en filas: eso se resuelve a mano donde haga falta. **No hace falta ninguna dependencia nueva.**
- **Fuentes del PDF**: las diez actuales (Playfair Display, Cinzel, Inter, subconjunto «latin» de Fontsource, OFL 1.1) **no tienen árabe ni hebreo** y les faltan ğ, Ğ, İ, ş y Ş del turco, «Ÿ» y el espacio fino que usa el francés al formatear números. Hace falta añadir recursos con licencia OFL 1.1: los subconjuntos «latin-ext» de las tres familias actuales (mismo diseño), una familia árabe y una hebrea (decisión **N3**).
- **Web**: `next/font` ya aloja «latin-ext», así que el turco funciona; ninguna de las tres familias tiene árabe ni hebreo, que hoy saldrían en la fuente del sistema. Hay que añadir familias árabe y hebrea de Google Fonts (OFL), sin paquetes nuevos, y fijar `lang` y `dir` en el lector.
- **Riesgos a despejar primero**: el espaciado entre letras de las etiquetas en Cinzel rompería el árabe ligado (se anula en esos idiomas); y la extracción de texto que usa la verificación de PDF no está probada con texto RTL (prueba técnica inicial antes de comprometer el PR).

## 4. Plantillas «Vivir en…»

**Hoy (comprobado):**
- La ficha tiene `zone` y `subzone` en **texto libre** (0001, 0017), sin código oficial. `subzone` solo se rellena cuando la fuente lo trae y a veces contiene un distrito.
- La taxonomía del catálogo (`lib/madrid-zones.ts`, 0195) tiene 21 distritos y 146 barrios **por nombre**, sin identificadores.
- Ya existe una tabla `neighborhoods` (0144, 0145) con **29 introducciones de barrio curadas** y alias, que usa el SmartLink pero no el catálogo.
- Ambigüedades reales: barrios que también son calles (Castellana, Goya, Lista, Almagro, Ibiza…); alias en sentidos opuestos (Chueca→Justicia en el catálogo, Justicia→Chueca en `neighborhoods`); distritos con texto propio (Salamanca, Retiro, Chamberí…).
- El organizador actual (#341) usa la zona como palabra clave, de modo que una frase con «calle Goya» puede caer en «Vivir en Goya».

| | Decisión |
| --- | --- |
| **DA22** | Biblioteca **editable y versionada** de descripciones de zona aprobadas, enlazadas a **identidades geográficas estables**, no a fragmentos de texto. |
| **DA23** | Se prefiere el **barrio verificado**; si solo se conoce el distrito, el distrito. Una calle o un título comercial son pistas, no prueba. Si hay ambigüedad o conflicto, se pide confirmación en vez de adivinar. |
| **DA24** | No se modifican en silencio los campos de ubicación del CRM. La clasificación es independiente de los grupos de la HOME y de los criterios de búsqueda. |
| **DA25** | La plantilla aprobada entra en la sección «Vivir en…» **sin repetir ni sobrescribir** una descripción de zona propia de la vivienda. |
| **DA26** | Describe la zona en general: sin distancias desde la vivienda, vistas, servicios del edificio ni características de la vivienda. |
| **DA27** | Las versiones de plantilla y sus traducciones se guardan para reutilizarlas; elegir una **no gasta IA**. Actualizar una plantilla no reescribe catálogos ya compartidos. |
| **DA28** | Se reutiliza el sistema de descripción estructurada existente; no se crea otro organizador. |

**Diseño.**
- **Registro de zonas** con identificador estable (`madrid/salamanca/recoletos`), nivel (distrito o barrio), nombre visible y alias. Se genera desde la taxonomía de 0195 y se cruza con `neighborhoods`, señalando a mano los casi-duplicados y alias contradictorios.
- **Clasificación por vivienda**, en tabla propia (nunca en `properties`):
  - automática **solo** si `subzone` o `zone` coinciden exactamente con un barrio o distrito y no hay conflicto;
  - **ambigua** si el término es también calle y la dirección lo nombra como calle, o si el barrio no pertenece al distrito de la ficha;
  - **sin clasificar** si solo hay pistas (título, calle);
  - el dueño confirma o corrige; esa decisión no la vuelve a tocar el sistema.
- **Plantillas**: versiones por zona con su texto en español y estado (borrador, aprobada, retirada). Se siembran como **borradores** desde las 29 introducciones de `neighborhoods`, sin IA, para revisarlas (pueden contener lugares concretos que haya que quitar según DA26). Las zonas sin texto pueden pedir un «Borrador con IA» genérico al pulsar, con la misma regla de no inventar.
- **Incorporación**: al copiar el texto a un catálogo (§2), o al pulsar «Aplicar plantilla» en el editor, el catálogo guarda **su copia** de la versión de plantilla. El organizador la recibe como entrada aparte y solo la usa si la descripción propia **no** tiene material de zona (DA25); el título «Vivir en {zona}» usa el nombre del registro, no el texto libre de la ficha.
- **Corrección incluida**: el nombre de la zona deja de contar como palabra clave cuando va precedido de «calle», «paseo», «avenida» o «plaza».

## 5. Acabado visual

| | Decisión |
| --- | --- |
| **DA29** | Solo pulido de lo existente, sin cambios de estructura: exposición, contraste, color y acabados decorativos discretos (filetes, esquinas, degradados o sombras donde mejoren lo ya establecido). Fotos originales intactas y tratamiento desactivable. Sin subir el brillo en bloque. Antes de tratar una foto borrosa como un problema de estilo, se comprueban su resolución y su entrega. Sin alteración generativa: ni estancias, ni acabados, ni medidas, ni vistas, ni muebles. Legibilidad, estados de carga y error, y rendimiento intactos. |
| **DA30** | Fabricio aprueba el tratamiento visual concreto **antes** de implementarlo. |

**Hallazgos de resolución (comprobados en el código):**
- El lector usa varios anchos para la foto de apertura, pero la **portada es una sola imagen de 1.600 px** a sangre, sin `srcset`, que en pantallas retina se amplía unas 1,8 veces. Es la causa más probable de que se vea blanda.
- En el PDF, la portada ocupa todo el A4 con una foto de 1.400 px: unos **80 ppi**.
- Las fotos se guardan a 2.560 px como máximo, en WebP de calidad 86.
- Estos dos ajustes de entrega (anchos de portada y del PDF) son mejora de calidad sin cambio de diseño.

**Propuestas para aprobar** (en [`propuestas-visuales/`](propuestas-visuales/README.md)):
1. **Tono adaptativo por foto**:
   - receta según sus medidas;
   - a las luminosas **no** se les sube el brillo y recuperan altas luces;
   - a las oscuras se les abren las sombras sin quemar;
   - se aplica a una copia y se puede desactivar;
   - lo mismo en lector, miniaturas, portada y PDF.
2. **Apertura**: filete interior crema fino, cuatro esquinas doradas de 20 px y un degradado inferior suave para el rótulo de fotografías. Misma composición.
3. **Portada**:
   - mismo velo vertical, que garantiza el contraste AA del título;
   - velo plano del 25 % al 8 %;
   - filete dorado interior;
   - contraste del título medido en el peor 5 % del fondo: hoy 9,38:1, propuesta 7,94:1, ambos por encima de AA.

**Coherencia**: el tono se aplica en el servicio de fotos (una variante tratada, cacheada, junto al original), así que lector, miniaturas, portada y PDF ven la misma foto. Los filetes, esquinas y degradados son CSS en el lector y se reproducen con formas vectoriales en el PDF.

## 6. Decisiones abiertas (nuevas)

| | Pregunta | Recomendación |
| --- | --- | --- |
| **N1** | ¿La casilla «Guardar como texto aprobado de la vivienda» viene **marcada** al publicar? | **Marcada**, salvo en catálogos con asignaciones personales, donde viene desmarcada y avisa. Es lo que hace útil la reutilización sin arriesgar textos personales. |
| **N2** | En árabe y hebreo, ¿se refleja la navegación? | **Sí la navegación y las flechas** («siguiente» a la izquierda, como hace el itinerario). **No la composición**: la foto y el panel quedan donde están. Así se respeta DA1 y la lectura es natural. |
| **N3** | Familias tipográficas para árabe y hebreo (web y PDF), todas OFL 1.1. | Árabe: **Noto Naskh Arabic** (títulos y texto, de estilo clásico, cercano a Playfair). Hebreo: **Frank Ruhl Libre** (títulos) y **Noto Sans Hebrew** (texto). Para turco y francés, los subconjuntos «latin-ext» de las fuentes actuales. |
| **N4** | Tras aprobar el acabado, ¿se aplica a todos los catálogos o se activa por catálogo? | **Activado por defecto en todos**, con un interruptor por catálogo y otro por foto para quitarlo. |

Todo lo demás son decisiones rutinarias de implementación y se anotan en el plan.

## 7. Fuera de alcance

Rediseño o páginas nuevas; cambiar la ficha del CRM o sus campos de ubicación; escribir en `property_client_descriptions`; traducir automáticamente al visitar; los ocho idiomas a la vez sin petición; retoque generativo de fotos; producción, credenciales, escrituras reales, IA real en pruebas de agentes y revisión de Codex no pedida.

## 8. Criterios de aceptación

| | Criterio |
| --- | --- |
| **AC1** | Aprobar un texto en un catálogo y añadir la vivienda a otro copia título y descripción sin IA; el CRM y el primer catálogo no cambian. |
| **AC2** | Aprobar una versión nueva no cambia catálogos existentes ni compartidos; los textos personales (casilla desmarcada) y los borradores nunca se copian. |
| **AC3** | Cambiar la ficha deja la versión intacta, marca «revisar» y aplica C2 en las copias; nada se regenera solo. |
| **AC4** | Dos aprobaciones o peticiones simultáneas no producen versiones vigentes en conflicto ni dos llamadas a la IA por versión e idioma. |
| **AC5** | La biblioteca es del dueño: otro usuario no la ve ni la usa aunque comparta la vivienda. |
| **AC6** | Un enlace personal en inglés y otro en español del mismo catálogo ven cada uno su idioma, en vivo y en PDF; sus valoraciones siguen atribuidas a su asignación. |
| **AC7** | Editar el español deja las traducciones desactualizadas (no vigentes); los enlaces en ese idioma siguen viendo la versión anterior completa hasta aprobar la nueva. |
| **AC8** | Ninguna visita pública, PDF público ni cambio a un idioma ya preparado llama a la IA (comprobado con IA simulada que cuenta llamadas). |
| **AC9** | Las secciones conservan clave y orden en los 8 idiomas; nada se reclasifica tras traducir. |
| **AC10** | Árabe y hebreo se leen RTL en escritorio, móvil y PDF, con letras unidas y sin cuadros vacíos; turco y francés sin glifos que falten; ar, tr y he muestran «sin revisión nativa» en el gestor. |
| **AC11** | Clasificación geográfica: coincidencias exactas se clasifican; calles homónimas, barrios fuera del distrito y pistas sueltas quedan para confirmar; el CRM no se modifica. |
| **AC12** | Una plantilla aprobada entra en «Vivir en…» solo si no hay texto propio de zona; actualizarla no cambia catálogos ya compartidos; elegirla no gasta IA. |
| **AC13** | Siguen exactamente dos pantallas por vivienda, la lectura completa en móvil y las suites actuales en verde (título, fotos, en vivo, opiniones). |
| **AC14** | Acabado visual: originales intactos, desactivable, sin aumento de altas luces quemadas, título de portada ≥ 4,5:1, misma composición (comparación de capturas antes y después) y mismo tratamiento en lector y PDF. |

## 9. Pendientes que esta ampliación no cierra

Siguen como estaban registrados, sin evidencia nueva:
- **G-ALQ**: PENDIENTE. Hacen falta los recuentos de la empresa y la aceptación de Fabricio, según `2026-10-13-bcp-01-home-catalogo/result.md`.
- **Caso original de Recoletos**: causa sin confirmar.
- **D13 en producción**: medición en vivo pendiente.
- **Validación de la importación de fichas con PDF representativos reales** (digitales, escaneados, mixtos y con varias viviendas): pendiente de muestras, según `2026-10-18-bcp-01-buscar-e-importar/checklist.md`. Las pruebas de PDF de esta ampliación son del PDF del catálogo, no de la importación.
