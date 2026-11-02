# Comparación con el diseño de Figma (2 nov 2026)

Referencia: la exportación de 25 pantallas de `entrega_figma_2026-11-02` (PNG a 1440 × 1000, PDF y `.fig`). Implementación: PR #386 en `fabri/solicitudes-reparto` (head `561038b3`), capturada a la **misma anchura** (1440) sobre `next start` + simulador con datos sintéticos. Las capturas de la implementación están en `comparacion-figma/`. El archivo `.fig` no se ha inspeccionado capa a capa: la cuenta conectada a Figma sigue sin acceso de edición, así que las medidas son estimaciones sobre las imágenes.

**Conclusión en una frase:** la implementación respeta la estructura y los contenidos del diseño (tres vistas, ficha, acciones, estados), pero **no reproduce su lenguaje visual**: tamaños, jerarquía, color, tipografía, espaciado y composición de tarjetas son los del CRM actual, no los del mockup. No es una desviación menor; es visible en todas las pantallas.

## 1. Diferencias transversales (afectan a todas las pantallas)

| Aspecto | Figma | Implementación | Diferencia |
|---|---|---|---|
| **Paleta** | Texto `#21332E`, acción verde `#175847`, selección `#E7F1EA`, fondo `#F6F5F1`, por revisar `#FFF0D9`, error `#A13732`. Botones principales y pestañas activas en **verde**. | Tokens del CRM: tinta `#0a0a0a`, crema `#f7f3ed`, oro `#c9a96e`. Botones principales y pestañas activas en **negro**; acento dorado. | Cambio de identidad completo. D02 dice «pendiente de validar con la marca»: **decisión pendiente de Fabricio** antes de sustituir una paleta por otra. |
| **Tipografía** | Inter en todo; títulos de página **32 px negrita** en caja normal («Solicitudes»); títulos de tarjeta **18 px negrita**; texto de trabajo 16 px. | Títulos en la fuente de display del CRM (Optima/Candara), **mayúsculas** («SOLICITUDES», «REGISTRAR CONTACTO»); etiquetas en versalitas con tracking; texto de trabajo 13–14 px. | Figma no usa mayúsculas en ningún título ni etiqueta de sección. Los cuerpos del CRM son 2–3 px más pequeños. |
| **Bordes y radios** | Radio **12 px** en tarjetas, paneles, botones y campos; sombra muy suave. | Radio 6–8 px (`rounded-lg`/`rounded-md`), sin sombra. | Esquinas más cerradas en toda la interfaz. |
| **Botones** | Altura ~44 px, texto 14–15 px negrita, caja normal, anchos (los de acción ocupan toda la columna). | Altura ~32–40 px, texto 12–13 px, **mayúsculas con tracking**, anchos al contenido. | En Figma el botón principal es grande y verde; aquí es compacto y negro. |
| **Pastillas de estado** | Texto 12–13 px semibold, caja normal, fondo tintado suave, radio 8 px, sin borde. | Texto 11–12 px **mayúsculas**, borde fino, radio 4 px. | Mismo significado, distinta voz. |
| **Barra lateral** | Clara (blanca), logotipo oscuro, «Espacio comercial» y «Mis vistas» como dos grupos, entrada activa con fondo verde claro, usuario abajo en tarjeta. | Oscura (negra), la del CRM actual, con selector de país y todo el menú del panel. | El diseño no es el menú real del CRM, es una maqueta; no se puede copiar sin rehacer el panel. Fuera de este encargo salvo decisión expresa. |
| **Cabecera de la bandeja** | Migas («Bandeja comercial / Solicitudes»), título 32 px, subtítulo gris, buscador y filtros como **dos botones blancos grandes** a la derecha; debajo, **cuatro** segmentos grandes (Atención, Nuevas, Seguimiento, Todas) con contador; debajo, la línea «24 solicitudes · Primero las pendientes de atención» y a la derecha el conmutador de vista (Tarjetas / Por piso / Prioridades) con la activa en verde. | Título en mayúsculas; buscador como campo de entrada; filtro de operación (Todas/Venta/Alquiler/Sin determinar) y conmutador de vista en la misma fila; **seis** pestañas pequeñas subrayadas (Necesitan atención, Nuevas, Seguimiento, Mías, Pendiente de reparto, Todas). | La implementación conserva más vistas (Mías, Pendiente de reparto) y el filtro de operación, que el diseño omite: son funcionalidad que hay que conservar, pero su jerarquía visual es la de pestañas pequeñas, no la de segmentos grandes. |
| **Fondo y pie** | Fondo `#F6F5F1` uniforme; pie «BCP / EXPLORACIÓN UX/UI» (solo del prototipo). | Fondo crema con degradado del CRM; sin pie (correcto). | Solo color. |

## 2. Pantalla a pantalla

### A01 · Galería (Tarjetas)
`comparacion-figma/A01_Galeria.png` frente a `04_A01_Galeria.png`.

- **Composición de la tarjeta.** Figma: imagen **16:10 con la pastilla de estado arriba a la izquierda** y el pie «Imagen de muestra»; debajo, dirección **18 px negrita**, precio **22 px negrita** en la misma línea que «2 hab. · 120 m²» (gris pequeño a la derecha); línea «DEMO-ID-001 · Vínculo exacto» en **verde pequeño**; separador; **nombre de la persona 16 px negrita**, mensaje en gris 14 px; responsable a la izquierda y «Hoy, 10:24» a la derecha; enlace «Abrir solicitud» en verde negrita. Implementación: imagen **16:9 con el motivo de atención arriba a la derecha**; dirección 15 px; precio y operación en gris 12 px (sin dormitorios ni m²); «Vínculo exacto» como pastilla con borde; avatar con inicial + nombre + mensaje entre comillas; responsable y «hace 2 horas» en 12 px; sin enlace «Abrir solicitud».
- **Datos que faltan en la tarjeta:** dormitorios y metros, la referencia del anuncio junto al vínculo (`DEMO-ID-001`), y el enlace explícito «Abrir solicitud».
- **Datos que sobran respecto a Figma:** el motivo de atención sobre la foto (en Figma la pastilla sobre la foto es el **estado**: Nueva / Sin asignar / Seguimiento / Por verificar), el avatar y las comillas.
- **Rejilla.** Figma: 3 columnas con **24 px** de separación y margen de 32 px; tarjetas ~370 px. Implementación: 3 columnas con 12 px de separación y margen 12 px; tarjetas ~375 px. Las tarjetas del diseño respiran más.
- **«Por verificar».** Figma: el hueco de imagen gris con «Sin imagen de origen verificada», título «Anuncio sin identificar», «Precio sin verificar», y la línea «Sin ID de origen · Revisión necesaria» en **rojo**. Implementación: cuadro vacío negro, el título del hilo, «Precio no recibido», y la pastilla «Por verificar» ámbar. El rojo de alerta del diseño no se usa.

### A02 · Ficha
`A02_Ficha.png` frente a `05_A02_Ficha.png`.

- **Ocupación.** Figma: la ficha ocupa **toda la pantalla** («Volver a tarjetas» arriba a la derecha), con cabecera a ancho completo y dos columnas 60/40. Implementación: panel lateral junto a la lista (430–480 px la lista, el resto la ficha). Es la diferencia de distribución más grande de todo el conjunto: en Figma la ficha es una página, aquí es un panel.
- **Cabecera.** Figma: nombre **32 px negrita** + pastilla «Nueva» verde claro; línea «Idealista · Hoy, 10:24 · SOL-DEMO-101»; a la derecha, **dos botones grandes**: «Jaime Delgado · Cambiar» (blanco) y «Abrir conversación en Zinto» (verde). Debajo, tres pestañas como **botones píldora** (Resumen activo en verde). Implementación: nombre 22 px; «Responsable Asesor Sintético CAMBIAR» en línea de texto; «Zinto: pendiente» como pastilla; fila de botones compactos (Registrar contacto negro, WhatsApp, Llamar, copiar, Más acciones); pestañas subrayadas.
- **Columna izquierda.** Figma: «Lo que preguntó» con el mensaje a **18 px**, «Presentación del cliente» y chips verdes claro; «Anuncio que consultó» con **foto 210 × 155**, dirección 22 px, precio 22 px, «2 hab. · 120 m² · Alquiler», «Idealista: DEMO-ID-001 | PROP-DEMO-01» en verde, botones «Ver anuncio original» y «Preparar visita»; «Datos del cliente». Implementación: «Siguiente paso» va **primero** (en Figma está en la columna derecha), títulos de panel en versalitas 12 px, mensaje a 14 px, chips grises con borde, el anuncio más abajo con foto pequeña.
- **Columna derecha.** Figma: «Siguiente paso» con pastilla ámbar «Pendiente de primer contacto», frase a 18 px, **botón verde grande «Registrar contacto»** y debajo «Llamar» / «Más acciones»; «Actividad reciente» con puntos verdes y «Ver historial completo». Implementación: no hay columna derecha; la actividad va en la pestaña «Actividad».
- **Textos conservados correctamente:** «Abrir Zinto o llamar no marca el contacto como realizado», la referencia del anuncio y el vínculo exacto.

### A03 · Registrar contacto
`A03_Registrar.png` frente a `06_A03_Registrar.png`.

- **Tamaño del diálogo.** Figma: 660 px de ancho, título **24 px negrita** caja normal, botón «X» cuadrado con borde. Implementación: 512 px, título en mayúsculas (display), «×» sin borde.
- **Opciones «¿Qué ocurrió?».** Figma: **tres** botones en una fila (Habló / No contesta / Email enviado), altura 44 px, activo en verde. Implementación: **cuatro** (añade «Escrito por WhatsApp», funcionalidad que se conserva) en dos filas, activo en negro, texto 14 px.
- **Nota.** Figma: etiqueta «Nota opcional» 14 px negrita, campo con fondo `#F6F5F1` y texto de ejemplo. Implementación: etiqueta en versalitas, campo blanco con borde.
- **Siguiente paso.** Figma: título «Programar siguiente paso» 18 px negrita con pastilla «Activado» a la derecha; tres atajos en fila (Mañana activo en verde / En 3 días / Elegir fecha); fecha y hora en dos campos grandes (31 oct. 2026 | 10:00); campo de acción; línea gris «Hora de Madrid · Se guardará en el historial». Implementación: `fieldset` con leyenda en versalitas; **cinco** atajos (añade «La semana que viene» y «Sin tarea»); campos nativos de fecha/hora; «Qué hay que hacer» como etiqueta; línea «03 nov, 10:00 · hora de Madrid (Europe/Madrid)…». Los campos nativos del navegador muestran la fecha como `03/11/2026`, no como «31 oct. 2026».
- **Pie.** Figma: Cancelar (blanco) y **Guardar contacto y tarea** (verde, el doble de ancho). Implementación: ambos compactos, el principal negro, deshabilitado hasta rellenar.

### A05 · Vínculo por verificar
`A05_Vinculo_por_verificar.png` frente a `08_A05_Vinculo_por_verificar.png`.

- Figma lo trata como **una página propia**: título «Verificar anuncio de origen», banda ámbar con «No tenemos una referencia de Idealista válida» en rojo, dos paneles (Evidencia de la solicitud / Resolución por persona autorizada) con campos «Pegar URL o ID del anuncio…» y «Motivo y evidencia de la corrección», botón verde ancho, y banda verde claro «El anuncio consultado permanece en el historial».
- Implementación: es la **misma ficha** con la pastilla «Pendiente de reparto» y el motivo «el anuncio no está identificado exactamente»; la corrección vive en «Revisar vínculo» (buscador de fichas + motivo) dentro del panel «Anuncio que consultó», y la evidencia en la pestaña «Cliente y datos». Funcionalmente equivalente, pero sin la jerarquía de alerta (la banda ámbar/roja) ni la explicación de los tres pasos.
- Nota: el campo «Pegar URL o ID del anuncio» del diseño **no existe** en la implementación (la corrección se hace eligiendo una ficha existente). Es una capacidad pendiente, no solo visual.

### A06 · Asignación
`A06_Asignacion.png` frente a `09_A06_Asignacion.png`.

- Figma: diálogo «Asignar ejecutivo» con **buscador de ejecutivo** y una **lista de tarjetas** (nombre + cargo), el actual resaltado en verde claro con «Responsable actual»; aviso ámbar sobre Zinto; Cancelar + «Confirmar asignación» verde ancho.
- Implementación: «Asignar solicitud» con un **desplegable** nativo, «Motivo (opcional)», el mismo aviso sobre Zinto como texto gris, botones compactos. Falta el buscador y la lista con cargo; el resaltado del responsable actual se sustituye por la línea «Responsable actual: …».
- Regla funcional conservada (y correcta frente al mockup): solo administradores ven «Cambiar»; el asesor ve «Solo un administrador puede cambiarlo».

### B01 · Por propiedad
`B01_Por_propiedad.png` frente a `11_B01_Por_propiedad.png`.

- Figma: **una tarjeta grande por anuncio** (foto 250 × 180 a la izquierda, dirección 24 px, precio 22 px, «DEMO-ID-001 · Vínculo exacto» verde, pastillas «4 solicitudes» / «1 sin contactar»; a la derecha «Última consulta» + nombre y botón verde ancho «Ver solicitudes del anuncio»); nota al pie «Los grupos se forman por ID exacto del anuncio y operación, nunca por dirección».
- Implementación: **lista acordeón** con cabecera pegajosa por inmueble (miniatura 56 × 44, título 15 px, metadatos en 12 px, pastillas «Vínculo exacto» / «Alquiler») y las solicitudes desplegadas debajo como filas. La nota del pie sí está.
- Es la pantalla donde la distribución más se aleja: Figma es una galería de inmuebles con acceso a B02 (demanda); aquí es una lista desplegable. B02 («Cartera por inmueble / Castelló», dos columnas: solicitudes del anuncio + ficha a la derecha) **no existe** como pantalla; su contenido se cubre desplegando el grupo y abriendo la ficha en el panel.

### C01 · Prioridades
`C01_Prioridades.png` frente a `13_C01_Prioridades.png`.

- Figma: tres columnas con fondo gris claro `#EEEDE8`, título 20 px + contador en píldora blanca; tarjetas con **foto a ancho completo**, nombre 18 px, dirección, precio 18 px negrita, pastilla de estado, pie «Jaime Delgado — Ver siguiente paso» (enlace verde). Nota al pie en gris.
- Implementación: columnas con fondo crema muy claro y borde; título en versalitas 12 px; tarjetas horizontales con miniatura 64 × 48 a la izquierda; nombre 14 px; sin precio; hasta tres pastillas apiladas; responsable en 12 px; sin «Ver siguiente paso». La nota sí está, arriba.
- La miniatura lateral y la ausencia de precio hacen que la columna se lea como lista, no como tablero de tarjetas.

### A08 · Datos / A10 · Origen / A09 · Traducción
En Figma son **pantallas separadas** con un gran título y tarjetas de dato (Identidad, Vínculo CRM, Presentación original, Otras consultas; Evidencia del anuncio consultado; Original · Español / Traducción · Inglés). En la implementación están reunidas en la pestaña «Cliente y datos» (evidencia del origen, cliente, duplicados) y el botón «Traducir» del panel del mensaje. Mismo contenido, en paneles con títulos en versalitas en lugar de tarjetas tituladas a 18 px.

### D01 · Móvil (390 px)
`D01_Movil.png` frente a `21_D01_Movil.png`.

- Figma: una columna limpia: «< Solicitudes», nombre **28 px**, dos pastillas (responsable, estado), **foto a ancho completo**, dirección/precio, vínculo, «Lo que preguntó», y **dos botones fijos abajo** («Registrar contacto» verde a ancho completo, «Abrir Zinto» blanco).
- Implementación: la cabecera completa de la bandeja (título, buscador, filtro de operación, conmutador y pestañas) sigue visible **encima** de la ficha, ocupando ~290 px antes de «Volver a la lista»; la ficha arranca con el nombre a 22 px, la línea de responsable, la pastilla de Zinto y la fila de botones compactos; sin foto a ancho completo; los botones no están fijos abajo.
- Sin scroll horizontal (comprobado), pero la ficha móvil no sigue la prioridad de contenido del diseño («01 persona y responsable, 02 anuncio y mensaje, 03 acción principal, 04 resto desplegable»).

### Reparto comercial (sin pantalla en Figma)
No existe en el diseño: lo pediste después. Se construyó con el lenguaje del CRM. Si se adopta la paleta y los tamaños del mockup, esta pantalla debería seguirlos también para no quedar como la única distinta.

## 3. Lo que sí coincide con Figma

- Las tres vistas como conmutador de una sola bandeja; textos y etiquetas de los estados; el vínculo como pastilla propia (Vínculo exacto / Por verificar); «Pendiente de reparto» visible; el aviso de que abrir Zinto o llamar no es contactar; «Registrar contacto» con resultado + nota + tarea en una sola confirmación y la hora de Madrid explícita; la nota «no se agrupa por dirección» en B01 y «sin arrastrar» en C01; el diálogo de reasignación con el aviso sobre Zinto; y los estados independientes de D02 (vínculo, reparto, Zinto, próximo paso).

## 4. Decisiones pendientes de Fabricio antes de ajustar

1. **Paleta y tipografía.** D02 la marca como «pendiente de validar con la marca». Opciones: (a) adoptar la paleta verde/Inter del mockup en Solicitudes y Reparto; (b) mantener los tokens del CRM pero copiar tamaños, radios y espaciados del diseño. (a) crea dos lenguajes dentro del mismo panel; (b) conserva la coherencia con el resto del CRM. No se ha cambiado nada hasta que decidas.
2. **Ficha como página o como panel.** El diseño la trata como página completa; la implementación, como panel junto a la lista (lo que permite recorrer la cola con las flechas). Cambiarlo afecta a navegación y a U03 (conservar filtros y posición).
3. **Barra lateral.** El menú del mockup es ilustrativo; no se propone sustituir el del CRM.
4. **Capacidad nueva de A05:** «Pegar URL o ID del anuncio». Hoy la corrección exige elegir una ficha existente; aceptar una URL/ID obliga a validar dominio y patrón (spec §Recepción). Es trabajo aparte.
5. **B02 (demanda por anuncio) como pantalla propia** o seguir con el acordeón.

## 5. Qué se puede ajustar sin tocar reglas ni funcionalidad

Con cualquiera de las dos opciones de paleta, estos cambios son solo de presentación y no alteran ninguna regla confirmada (solo administradores asignan; un asesor por cliente; una solicitud por anuncio; vínculo exacto; límites de Zinto, extensión y reprocesado):

- Títulos en caja normal y tamaños del diseño (32/24/18/16); pastillas y botones en caja normal; radio 12 px; separación 24 px en rejillas.
- Tarjeta A01: imagen 16:10, estado sobre la foto, dormitorios/m², referencia junto al vínculo, enlace «Abrir solicitud», sin avatar.
- Ficha: cabecera con nombre grande y botones de responsable/Zinto; «Lo que preguntó» a 18 px; anuncio con foto grande; «Siguiente paso» con el botón principal ancho.
- Diálogos: anchura 660 px, botón principal ancho, atajos en fila, fecha en formato «31 oct. 2026» (campo propio en lugar del nativo).
- B01: tarjetas de inmueble grandes con botón «Ver solicitudes del anuncio» (manteniendo la regla de agrupación exacta).
- C01: tarjetas con foto a ancho completo, precio y «Ver siguiente paso».
- Móvil: ocultar la cabecera de la bandeja al abrir una ficha; foto a ancho completo; botones fijos abajo.

Lo que **no** debe copiarse del mockup por chocar con reglas ya confirmadas: el desplegable/lista de asesores visible para cualquiera (solo administradores), «Abrir conversación en Zinto» como sincronización (Zinto sigue pendiente), y cualquier texto que sugiera que unir por teléfono junta anuncios distintos.

## 6. Aplicado (decisión de Fabricio, 2 nov 2026: «la estética del Figma, adaptada al CRM»)

Decisiones §4 resueltas: **(1)** paleta verde e Inter del Figma en Solicitudes y Reparto comercial; **(2)** la ficha pasa a ser una página propia; **(3)** la barra lateral del CRM no se toca. §4.4 (A05 con URL/ID) y §4.5 (B02 como pantalla propia) siguen pendientes. Capturas a 1440 y 390 en `comparacion-figma/despues/`, sobre el mismo simulador con datos sintéticos (fotos de muestra generadas solo para la captura).

**Cómo está hecho.** Una capa `.sol-root` (`app/globals.css`, bloque «SOLICITUDES») con los tokens de D02 como variables y su variante oscura, y utilidades `*-sol-*` en `tailwind.config.ts`. Dentro de esa capa la tinta, el oro y el papel del CRM se reasignan a la paleta del Figma. Los componentes compartidos (`Button`, `Pill`, `Modal`, `Panel`, campos) llevan atributos `data-variant`, `data-tone`, `data-crm-modal` y `data-crm-panel`, con los que la capa les da radio de 12 px, caja de frase, botón principal verde de 44 px y diálogos de 660 px. Fuera de Solicitudes y Reparto el CRM se ve exactamente igual. La escala del Figma que no está en la del CRM (13, 15, 17 y 32 px) va en clases propias (`sol-meta`, `sol-ui`, `sol-price-sm`, `sol-name`), no como `text-[Npx]`, así que `test:typography` no tiene ninguna violación en estas pantallas.

| Pantalla | Qué cambia |
|---|---|
| Cabecera | Miga, título 32 px, subtítulo según la vista, buscador y «Filtros +» a la derecha; los seis segmentos como botones de 44 px con contador (el activo, en verde); línea «N solicitudes · orden» con el filtro de operación y el conmutador Tarjetas / Por piso / Prioridades. |
| A01 Tarjetas | Rejilla de 1, 2 o 3 columnas con separación de 24 px; foto con el estado arriba a la izquierda; dirección a 18 px y precio a 22 px; Ref. o Cod. junto al estado real del vínculo; persona a 18 px; mensaje; responsable o «Pendiente de reparto»; hora; «Abrir solicitud». |
| B01 Por piso | Una tarjeta grande por anuncio: foto de 248 × 180, título a 24 px, precio, Ref. · Vínculo exacto, «N solicitudes», «N sin contactar», última consulta y «Ver solicitudes del anuncio», que despliega las filas. Se mantiene la agrupación exacta y el grupo «Por verificar». |
| C01 Prioridades | Columnas sobre gris claro con contador; tarjetas con foto, nombre, dirección, precio, estado de color, responsable y «Ver siguiente paso». |
| A02 Ficha | Página propia con miga y «Volver a tarjetas» (o a la vista de origen); nombre a 32 px y su estado; caja del responsable («Nombre · Cambiar», origen y Zinto: pendiente); «Abrir conversación en Zinto»; pestañas en pastilla; dos columnas. A la izquierda, «Lo que preguntó» a 18–20 px, «Anuncio que consultó» con foto grande y «Datos del cliente». A la derecha, «Siguiente paso» con «Registrar contacto» a todo el ancho, «Llamar» y «Más acciones», y después «Actividad reciente» con «Ver historial completo». |
| A03 / A06 diálogos | 660 px, título en caja de frase, campos de 44 px y botón principal ancho y verde. |
| D01 Móvil | Una columna, el anuncio antes del mensaje y «Registrar contacto» y «Abrir Zinto» fijos abajo; sin desbordamiento horizontal en las tres vistas ni en la ficha. |
| Reparto | Misma capa: tipografía, colores, radios y botones del Figma. |
| Oscuro | No está en el Figma: la apariencia por usuario del CRM se respeta con una variante de los tokens; el verde se aclara y el texto sobre él pasa a oscuro. |

**Conservado sin cambios de comportamiento:** solo un administrador asigna o reasigna, con motivo y versión; un asesor por cliente; una solicitud por anuncio; la foto de nuestra ficha y «Preparar visita» solo con vínculo exacto; abrir Zinto o llamar no registra contacto; Zinto, «pendiente»; los filtros, la página y la posición se conservan al volver de la ficha (la bandeja sigue montada, oculta, y se restaura el scroll de la ventana); ↑/↓ recorren la cola solo dentro de una ficha (con la bandeja a la vista, las flechas desplazan la página).

**Diferencias que quedan, y por qué:**
- La barra lateral y el pie del prototipo: §4.3.
- Se mantienen seis segmentos, no cuatro: «Mías» y «Pendiente de reparto» son funcionalidad.
- El filtro de operación sigue a la vista: es una decisión de trabajo constante.
- La tarjeta no muestra dormitorios ni m²: la solicitud no los trae y no se inventan. En su lugar va la operación.
- «Ver anuncio original» se llama «Ver en Idealista»: el enlace que tenemos es la conversación de Idealista, no el anuncio.
- La fecha del diálogo sigue con el selector nativo (§5).
