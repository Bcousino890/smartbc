# BCP-01 · Ampliación: textos reutilizables, idiomas, «Vivir en…» y acabado visual — resultado

**Especificación:** [`spec.md`](spec.md) · **Plan:** [`plan.md`](plan.md). Aprobados por Fabricio el 21-10-2026 (N1–N4 cerradas, DA31–DA37; N5 abierta para el PR6).

> **La QA en producción y los merges son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures; sin producción, credenciales, IA real ni archivos `.env` del repositorio (el `next build` se hizo con `.env.production` apartado fuera del worktree).

## PR1 · Biblioteca de textos aprobados y reutilización

- **Rama:** `fabri/bcp-01-textos-aprobados`, desde `origin/main` = `8b640e3b`. Comprobado antes de empezar: última migración en `main` 0218 y ningún PR abierto con 0219 o posterior.
- **Migración:** `0219_catalog_copy_library.sql` con [`rollback-0219.sql`](rollback-0219.sql). Sin dependencias nuevas.

### Qué hace

- **Biblioteca por dueño** (`property_copy_versions`): versiones inmutables del título y la descripción aprobados de cada vivienda. Título y descripción son partes independientes: aprobar solo el título conserva la descripción aprobada antes con su huella de la ficha (DA32).
- **Publicar ≠ aprobar (N1).** Junto a «Publicar», la casilla «Guardar como texto aprobado de la vivienda» viene **desmarcada** en todos los catálogos y vuelve a desmarcarse tras usarla. Lo ya publicado se puede aprobar después con «Aprobar lo publicado aquí».
- **Nunca se aprueba un borrador** ni una descripción no vigente (su ficha cambió): primero se revisa y se publica.
- **Reutilización (DA33).** Al añadir una vivienda a un catálogo manual, **solo si ese catálogo no tiene ningún texto suyo** (ni borrador, ni publicado, ni en reserva), se copia la última versión aprobada como texto publicado e independiente del catálogo. Si la ficha cambió desde la aprobación, se copia igual y la regla C2 decide: el título se ve, la descripción no, y el gestor pide revisar. La conversión de automáticos y el cambio de modo no reutilizan nada.
- **Gestor.** Bloque «Texto aprobado de la vivienda» en el editor con versión, origen, aviso «Revisar», «Usar en este catálogo» (solo rellena el editor) y «Retirar título / descripción».
- **HOME.** Acceso «Textos aprobados» a la página con la biblioteca y la siembra. La siembra lista lo publicado en tus catálogos, **sin nada marcado** y sin IA. Señala los catálogos con asignaciones personales («puede ser personal») y no ofrece aprobar descripciones no vigentes.
- Ninguna escritura en la ficha del CRM, en otros catálogos ni en catálogos de otros dueños. Sin IA en ningún paso.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal (`scripts/sql/test-catalogs-core.sh`, secciones 2w y 2x): 0219 aplicada dos veces; 44 comprobaciones de `test-catalog-copy.sql` (publicar sin aprobar no reutiliza; aprobación idempotente; reutilizar copia publicada e independiente; editar la copia o aprobar otra versión no cambia otros catálogos; título solo conserva la descripción y su huella; descripción no vigente rechazada; con la ficha cambiada se ve el título y no la descripción; entrada con borrador o en reserva no se pisa; retirar partes; borrador nunca aprobable; candidatos con la marca de asignaciones; biblioteca de cada dueño; ficha del CRM intacta; permisos de anon y authenticated; conversión y cambio de modo sin copiar textos); aprobaciones simultáneas sin choque; reversión y reaplicación; título (0217), opiniones (0218) y conversión (0213) en verde con 0219 | ✅ |
| `test:catalogs-copy` (28 comprobaciones, nuevo en la CI) y todas las suites de la CI, `tsc`, `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures (17 comprobaciones): casilla desmarcada; publicar sin marcar no aprueba; aprobar lo publicado después; título nuevo con la casilla conserva la descripción; la casilla vuelve a desmarcarse; aviso «Revisar» con la ficha cambiada; añadir desde el buscador una vivienda con texto aprobado la trae publicada; siembra sin nada marcado, con aviso de catálogo asignado y sin aprobar descripciones no vigentes; móvil sin desbordes; sin errores de consola | ✅ |
| QA anteriores en esta rama: título propio (7) y lector (24) | ✅ |
| `next build` (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr1/`](capturas-pr1/).

### Efectos de la migración al fusionar

- Crea la tabla `property_copy_versions`, **vacía**, y la columna `catalog_texts.copy_version_id`, **nula en todas las filas**.
- Crea las funciones `catalog_copy_*` y redefine `catalog_add_property` (igual que la de 0212 más la reutilización).
- Mientras no apruebes ningún texto, añadir viviendas se comporta exactamente como hoy.
- Ningún catálogo existente ni ninguna huella pública cambian por desplegar.

### Reversión

[`rollback-0219.sql`](rollback-0219.sql):
- Devuelve `catalog_add_property` a la versión de 0212 y borra las funciones nuevas, la columna y la tabla.
- **Se pierde la biblioteca**; si hay que conservarla, antes `SELECT * FROM property_copy_versions;`.
- Los textos ya copiados a catálogos siguen siendo textos normales del catálogo, publicados y editables.

### QA en producción (Fabricio)

1. En un catálogo, edita y publica un texto **sin** marcar la casilla. Añade esa vivienda a otro catálogo: debe llegar sin texto.
2. Vuelve al primero y pulsa «Aprobar lo publicado aquí». El bloque debe decir «Versión 1».
3. Añade la vivienda a un catálogo nuevo: debe llegar con título y descripción publicados. El primer catálogo y la ficha del CRM no cambian.
4. Cambia solo el título en el primero, marca la casilla y publica. El bloque debe mostrar «Versión 2» con la misma descripción. El catálogo del paso 3 sigue igual.
5. Quita la vivienda de un catálogo donde tenga un borrador y vuelve a añadirla: el borrador sigue ahí, sin reemplazar.
6. En «Mi espacio → Textos aprobados», revisa la lista: nada viene marcado y los catálogos asignados a clientes aparecen señalados.

## PR2 · Registro de zonas y zona confirmada de cada vivienda

- **Rama:** `fabri/bcp-01-zonas`, desde `origin/main` = `fdf58b69`. Antes de empezar se comprobó que la última migración en `main` es la 0219 y que no hay ningún PR abierto con la 0220 o posterior.
- **Migración:** `0220_catalog_areas.sql`, con [`rollback-0220.sql`](rollback-0220.sql). Sin dependencias nuevas.

### Qué hace

- **Registro de zonas con identidad estable** (`catalog_areas`): 21 distritos y 144 barrios de Madrid, con ids como `madrid/salamanca/recoletos`.
  - Se genera desde la taxonomía de `lib/madrid-zones.ts`.
  - Chueca, Malasaña y Huertas son zonas propias que apuntan a su barrio oficial.
  - «Águilas» y «Palos de la Frontera» se tratan como alias de «Las Águilas» y «Palos de Moguer».
- **Sugerencia prudente en el gestor (DA23, DA37).** Cada vivienda tiene en el editor un bloque «Zona de la vivienda»:
  - **Sugerida:** la zona coincide exactamente con el barrio o la zona de la ficha.
  - **Zona por confirmar:** pasa en tres casos.
    - El barrio de la ficha es también la calle de la dirección: Goya, Castellana, Lista, Almagro, Ibiza.
    - El barrio no es del distrito de la ficha.
    - La ficha nombra varias zonas.
  - **Sin clasificar:** la ficha no tiene zona, o la zona está fuera del registro, como Pozuelo.
- **La sugerencia nunca se aplica sola.** El dueño elige entre estas acciones:
  - «Confirmar», «Elegir otra» (distritos y barrios del registro) o «Sin zona verificada» (el apartado se llama «El barrio»).
  - «Quitar confirmación».
  - La confirmación vale para **todos sus catálogos**, nunca para los de otro dueño.
- **Lector.** «Vivir en …» usa el nombre del registro **solo con una confirmación vigente**.
  - Sin confirmación se ve exactamente igual que hoy.
  - Si cambian la zona, el barrio o la dirección de la ficha, la confirmación deja de valer, el lector vuelve a la zona de la ficha y el gestor avisa «Revisar».
  - Confirmar cambia la huella, así que los lectores abiertos se actualizan solos.
- **Organizador (2.4).** El nombre de la zona deja de contar como palabra clave del barrio cuando va detrás de calle, paseo, avenida, plaza, glorieta, ronda o travesía. Por ejemplo, «La finca da al paseo de la Castellana» queda en «La finca».
- **Sin cambios en otras partes:**
  - No escribe en la ficha del CRM: zona, barrio y dirección quedan intactos.
  - No toca los grupos de la HOME, los criterios ni la búsqueda (DA24).
  - No usa IA en ningún paso.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal, secciones 2y y 2z de `scripts/sql/test-catalogs-core.sh` (26 comprobaciones de `test-catalog-areas.sql`), con 0220 aplicada dos veces sobre un enlace ya creado:<br>• registro de 165 filas con su distrito, la zona popular y los alias<br>• sin confirmaciones, la misma huella y sin «area»<br>• una confirmación entra en la instantánea y cambia la huella<br>• las confirmaciones de otro dueño no se ven ni cuentan<br>• «sin zona verificada» llega con el nombre nulo<br>• al cambiar la dirección, la confirmación deja de publicarse y el gestor ve «revisar»<br>• volver a confirmar y quitar la confirmación funcionan<br>• errores `area_not_found`, `forbidden` y `property_not_found`<br>• permisos de anon y authenticated<br>• la ficha del CRM, los grupos y los términos de búsqueda no cambian<br>• reversión con el catálogo abriendo sin «area», y reaplicación<br>• título (0217), biblioteca (0219) y fotos (0202) en verde con 0220<br>• suite SQL completa en verde | ✅ |
| `test:catalogs-areas` (59 comprobaciones, nuevo en la CI): casos AC11 (Castellana, Goya, Lista, Almagro e Ibiza como calles; Chueca y Justicia; distrito en el barrio; casi-duplicados; fuera de Madrid), paridad registro↔0220, «Vivir en…» solo con confirmación vigente, arreglo de calles y comprobaciones de fuente (sin escribir en el CRM y sin IA) | ✅ |
| Todas las suites de la CI, `tsc` y `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures (19 comprobaciones):<br>• sugerida sin aplicar, y el lector igual que hoy<br>• «Sin zona verificada» da «El barrio» en el editor y en el lector, y cambia la huella<br>• cambiar a otra zona da «Vivir en Ibiza»<br>• con la ficha cambiada, aviso «Revisar» y vuelve la zona de la ficha<br>• quitar y volver a confirmar<br>• calle homónima: «Zona por confirmar»<br>• conflicto de distrito<br>• sin clasificar<br>• en el móvil, sin desbordes<br>• sin errores de consola | ✅ |
| QA anteriores repetidas en esta rama: estructura (15), textos aprobados (17), título (7) y lector (24) | ✅ |
| `next build` (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr2/`](capturas-pr2/).

### Efectos de la migración al fusionar

- Crea `catalog_areas` con 165 filas y `catalog_property_areas` **vacía**, más las funciones `catalog_area_*`.
- Redefine `catalog_internal_snapshot`: es la de 0217 más la zona confirmada vigente del dueño del catálogo.
- **Mientras no confirmes ninguna zona, ninguna instantánea ni ninguna huella cambian** (está probado).
- **Un cambio visible sin confirmar nada:** el arreglo del organizador cambia la sección de algunas frases.
  - Una frase que nombra la zona solo como calle («paseo de la Castellana», «calle de Goya») ya no se va sola a «Vivir en …»; se ordena como cualquier otra calle.
  - Esto lo calcula el código del lector, no la instantánea, así que la huella no cambia y un lector abierto lo verá al recargar.

### Reversión

[`rollback-0220.sql`](rollback-0220.sql):
- Devuelve la instantánea de 0217 y borra las funciones y las dos tablas.
- **Se pierden las confirmaciones**; si hay que conservarlas, antes `SELECT * FROM catalog_property_areas;`.
- Si se revierte la base de datos antes que el código:
  - El gestor oculta el bloque de zona sin romperse.
  - «Confirmar» da error.
  - El lector vuelve a la zona de la ficha.

### QA en producción (Fabricio)

1. Abre «Contenido» de un catálogo y despliega una vivienda. Debe salir «Zona de la vivienda» con la sugerencia y la frase «Hoy el apartado se llama…». El enlace del cliente no cambia.
2. Busca una vivienda cuya dirección sea la calle de su barrio, por ejemplo Calle Goya con barrio Goya. Debe decir «Zona por confirmar» y explicar lo de la calle.
3. En una vivienda con un texto publicado que hable del barrio, pulsa «Confirmar». Ten el enlace del cliente abierto: debe actualizarse solo y el apartado debe llamarse «Vivir en {zona del registro}».
4. Pulsa «Cambiar», elige «Sin zona verificada» y guarda. El apartado pasa a «El barrio». Abre otro catálogo tuyo con esa vivienda: también ha cambiado.
5. Pulsa «Quitar confirmación». Vuelve la zona de la ficha. En el CRM, la zona, el barrio y la dirección de la ficha no han cambiado en ningún paso.

## PR3 · Plantillas «Vivir en…» por zona

- **Rama:** `fabri/bcp-01-plantillas-zona`, desde `origin/main` = `afa0be41`.
  - Antes de empezar se comprobó que la última migración en `main` es la 0221 (particulares, ajena a esta ampliación) y que ningún PR abierto usa la 0222 o posterior.
- **Migración:** `0222_catalog_area_texts.sql`, con [`rollback-0222.sql`](rollback-0222.sql). Sin dependencias nuevas.

### Qué hace

- **Biblioteca de plantillas por dueño y zona del registro** (`area_text_versions`, DA22). Cada zona tiene como mucho un borrador y una versión aprobada; las anteriores quedan retiradas como historial. Se gestiona en la nueva página **«Mi espacio → Plantillas de zona»**:
  - **Traer borradores de los textos de barrios** (`neighborhoods`, sin IA). En producción, 24 de las 29 introducciones encajan con una zona del registro. Las 5 de fuera de Madrid (Somosaguas, Prado de Somosaguas, Torrelodones, Pozuelo y La Moraleja) se enseñan y no se traen. Llegan como **borradores**.
  - **Comprobación DA26.** Contacto, URL y precio bloquean. Las distancias, vistas, servicios del edificio, estancias o menciones de agencia se señalan, con la cita, para revisarlos. Las introducciones de Chamberí («en pocos minutos de metro») y Retiro («a un paseo») salen señaladas.
  - **Escribir a mano, «Borrador con IA»** (solo al pulsar: rellena el cuadro y no guarda), **Aprobar**, **Descartar borrador** y **Retirar plantilla**.
- **En el editor del catálogo,** dentro de «Zona de la vivienda», aparece el apartado «Plantilla «Vivir en…»». Solo sale con la zona confirmada y vigente:
  - «Aplicar plantilla» guarda **la copia de este catálogo**. Usa la del barrio o, si el barrio no tiene, la de su distrito.
  - Si la plantilla cambia después, el catálogo **no cambia** (DA27) y se ofrece «Usar la versión N».
  - «Quitar plantilla».
  - Si la zona confirmada cambia o caduca, la copia no se ve y se avisa.
- **Lector y PDF.** La plantilla entra en «Vivir en {zona}» **solo si la descripción propia no habla ya de la zona** (DA25), con el mismo organizador (DA28).
  - La ficha breve («solo datos») no cambia.
  - Aplicar o quitar cambia la huella, así que los lectores abiertos se actualizan solos.
- **Al añadir una vivienda con texto aprobado** (reutilización del PR1), llega también la copia de la plantilla de su zona confirmada. No pisa nunca una copia que el catálogo ya tuviera.
- **Elegir o aplicar una plantilla no usa IA** (AC12).
- **Sin cambios en otras partes:**
  - No escribe en la ficha del CRM ni en `neighborhoods`.
  - Las plantillas no dependen de los grupos ni de la búsqueda.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal, secciones 2za y 2zb de `scripts/sql/test-catalogs-core.sh` (41 comprobaciones de `test-catalog-area-texts.sql`), con 0222 aplicada dos veces sobre un enlace ya creado:<br>• sin copias, la misma huella<br>• un solo borrador por zona<br>• contacto y precio bloqueados<br>• aprobar exactamente lo visto (`draft_changed`)<br>• aplicar solo con zona confirmada (`area_text_unavailable`)<br>• la copia entra en la instantánea y cambia la huella<br>• actualizar o retirar la plantilla no cambia la copia<br>• otra zona o la ficha cambiada ocultan la copia, y vuelve con la zona<br>• plantilla del distrito para un barrio sin plantilla, y preferencia por el barrio<br>• quitar<br>• cada dueño, sus plantillas<br>• la siembra crea 1 y salta 3 (zona con versiones, zona inexistente, teléfono), solo borradores y sin duplicar<br>• descartar<br>• la reutilización al añadir trae la copia y no pisa la propia al volver a añadir<br>• permisos de anon y authenticated<br>• `neighborhoods` y la ficha intactas<br>• reversión y reaplicación<br>• zonas (0220), biblioteca (0219), título (0217) y fotos (0202) en verde con 0222<br>• suite SQL completa en verde | ✅ |
| `test:catalogs-area-texts` (56 comprobaciones, nuevo en la CI):<br>• DA25 en el organizador y en el lector (texto propio, descripción limpia, agencia, ficha breve)<br>• avisos DA26 sin falsos positivos en «la vivienda de media altura» ni en «referencia verde»<br>• las 29 introducciones reales (24 asignadas y 5 fuera)<br>• plan de siembra<br>• barrio antes que distrito y copia solo con zona vigente<br>• «Borrador con IA» con IA falsa (prompt, una llamada, respuesta vacía)<br>• aplicar y sembrar sin IA<br>• fuente de 0222 | ✅ |
| Todas las suites de la CI (26), `tsc` y `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures (29 comprobaciones):<br>• siembra de borradores con Pozuelo fuera<br>• aviso de distancia y editar sin avisos<br>• aprobar solo lo guardado<br>• teléfono bloqueado<br>• «Borrador con IA» con 1 llamada falsa y sin guardar<br>• retirar<br>• sin zona confirmada no hay plantilla<br>• aplicar: editor y lector con «Vivir en Jerónimos»<br>• versión nueva: el catálogo sigue con su copia<br>• otra zona: oculta y avisada; vuelve con la zona<br>• texto propio de zona: manda lo propio<br>• quitar<br>• distrito para Almagro<br>• móvil sin desbordes<br>• sin errores de consola | ✅ |
| QA anteriores repetidas: zonas (19), estructura (15), textos aprobados (17), título (7) y lector (24) | ✅ |
| `next build` (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr3/`](capturas-pr3/).

### Efectos de la migración al fusionar

- Crea `area_text_versions` y `catalog_area_copies`, **vacías**, y las funciones `catalog_area_text_*`.
- Redefine `catalog_internal_snapshot`: es la de 0220 más la copia de la plantilla con zona vigente.
- Redefine `catalog_add_property`: es la de 0219 más la copia de la plantilla al reutilizar un texto aprobado.
- **Ningún catálogo ni ninguna huella cambian al desplegar:** sin plantillas aprobadas y aplicadas no hay nada que enseñar.
- **No siembra nada sola:** los borradores se traen con el botón.

### Reversión

[`rollback-0222.sql`](rollback-0222.sql):
- Devuelve la instantánea de 0220 y `catalog_add_property` de 0219, y borra las funciones y las dos tablas.
- **Se pierden las plantillas y las copias de los catálogos.** Si hay que conservarlas, antes `SELECT * FROM area_text_versions; SELECT * FROM catalog_area_copies;`.
- Si se revierte la base de datos antes que el código:
  - El editor oculta el apartado de plantilla sin romperse.
  - La página «Plantillas de zona» dice que no puede leerlas.
  - El lector deja de enseñar las copias.

### QA en producción (Fabricio)

1. En «Mi espacio» sale el acceso «Plantillas de zona». Ábrelo: debe ofrecer traer **24 borradores** y listar las 5 zonas de fuera de Madrid como «No se traen».
2. Pulsa «Traer 24 borradores». Llegan como borradores, sin aprobar ninguno. Revisa los de Chamberí y Retiro, que salen con aviso de distancia; edita, guarda y aprueba, por ejemplo, el de Recoletos.
3. En «Alquiler en Barrio de Salamanca», abre una vivienda de Recoletos con la zona **confirmada**. Debe aparecer «Plantilla «Vivir en…» · Disponible: Recoletos (Salamanca), versión 1». Pulsa «Aplicar plantilla».
4. Con el enlace del cliente abierto, si el texto de esa vivienda **no habla del barrio**, debe aparecer «Vivir en Recoletos» con la plantilla. Si **sí habla del barrio**, se queda su texto y la plantilla no se repite.
5. Edita y aprueba una versión 2 de Recoletos. El catálogo del paso 3 no cambia y su editor ofrece «Usar la versión 2».
6. «Quitar plantilla» la quita de ese catálogo. La ficha del CRM y los textos de barrios del SmartLink no cambian en ningún paso.

### Pendientes que siguen igual

G-ALQ, diagnóstico original de Recoletos, D13 en producción y validación de la importación con PDF representativos reales: sin cambios, esta ampliación no los cierra.
