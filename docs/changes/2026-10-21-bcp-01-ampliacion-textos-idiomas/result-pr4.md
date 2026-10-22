# BCP-01 · Ampliación — resultado del PR4 · Base multilingüe del lector (sin IA)

**Especificación:** [`spec.md`](spec.md) (§3, DA9–DA21, N2, N3; N5 decidida el 22-10-2026) · **Plan:** [`plan.md`](plan.md) § PR4, con sus «Ajustes al implementar el PR4». Formato y reglas, como en [`result.md`](result.md) (PR1–PR3).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures. Sin producción, credenciales, IA (este PR no la usa en ningún paso) ni archivos `.env` del repositorio. Una excepción, contada en «Incidencia de procedimiento»: un `next build` lanzado por error sin aislar, que no tocó producción.

## PR4 · Base multilingüe del lector

- **Rama:** `fabri/bcp-01-lector-idiomas`, desde `origin/main` = `925e6439`, con PR1–PR3 ya fusionados.
  - Antes de empezar, la última migración en `main` era la 0222 (la 0221 es de particulares).
  - Se hizo en paralelo con el PR7a y la prueba técnica del PR5, cada uno en su worktree.
- **Migración:** `0223_catalog_languages.sql`, con [`rollback-0223.sql`](rollback-0223.sql). Sin dependencias ni paquetes nuevos.

### Qué hace

- **Diccionario del catálogo en 8 idiomas** (`lib/catalogs/i18n.ts`):
  - Idiomas: es, en, fr, it, de, ar, tr y he.
  - Se apoya en la maquinaria del itinerario: `COLLECTION_LANGUAGES`, `isRtl`, `intlLocale` y `TRANSLATION_REVIEW_REQUIRED`.
  - Cubre todas las etiquetas fijas del lector: portada, índice, ficha, navegación, galería, estados de las fotos y avisos en vivo.
  - También contacto, colofón, PDF, opiniones y sus errores, enlace no disponible, operación, precio «sin dato», planta y estaciones.
  - Incluye los títulos de las secciones, con «Vivir en {zona}» y el nombre propio sin traducir.
  - **ar, tr y he llevan la marca «sin revisión nativa»** y no se presentan como validados. Los textos fijos de los 8 idiomas los he escrito yo y están pendientes de tu revisión (plan 4.1).
  - El español reproduce **exactamente** los textos y formatos de antes. Una prueba lo comprueba, frase a frase y formato a formato.
- **Formato por idioma:**
  - Cifras, precios y fechas salen de `Intl` con el locale de cada idioma.
  - Siempre con dígitos latinos: el árabe usa `ar-u-nu-latn`, como el itinerario. Ejemplos: «€1,450,000» en inglés y «1,450,000 €» en árabe.
  - «También en venta…» es solo del gestor y sigue en español.
- **Idioma del catálogo y del enlace (0223):**
  - `catalogs.default_lang`: obligatorio, por defecto «es», con la misma lista y comprobación que 0130/0134.
  - `catalog_client_links.lang`: opcional; vacío significa «el del catálogo».
  - El idioma del token (el del enlace personal si lo tiene; si no, el del catálogo) entra en la instantánea como `lang` y, por tanto, en la huella.
  - Así, el lector, el vigilante y la captura del PDF no pueden servir el idioma de otro enlace (DA19).
  - Un enlace personal con idioma propio no cambia el de otros enlaces ni el del catálogo (DA17).
  - Funciones del dueño `catalog_set_default_lang` y `catalog_client_link_set_lang`: solo `service_role`, con la guarda del dueño y el error `invalid_lang`.
  - **Hasta el PR6 la interfaz solo da «es».** No hay selector en el gestor. Los demás idiomas se prueban con la operación `lang` nueva del almacén sintético.
- **Lector (`/seleccion/[token]`):**
  - `lang` y `dir` en la raíz, según el idioma del enlace.
  - **En árabe y hebreo se lee de derecha a izquierda (N2):**
    - Se reflejan el texto, el índice y la barra (siguiente a la izquierda, flechas giradas).
    - El teclado se refleja: ← avanza y → retrocede. Av Pág y Re Pág no cambian.
    - El deslizar también: hacia la derecha se avanza.
    - El giro de página y la galería van en RTL.
  - **La composición no cambia:** la foto y el panel de la apertura, y los dos paneles del detalle, ocupan **las mismas cajas** que en español. Siguen siendo dos pantallas por vivienda.
  - Cifras, precios, contador de páginas y teléfono van en LTR.
  - El contenido sigue en español hasta el PR6 (títulos, descripción, características, introducción y zona). Va aislado con `<bdi>` para que una frase española no se descoloque dentro de una página RTL; en LTR no cambia nada.
  - **Familias (N3):** Noto Naskh Arabic, Frank Ruhl Libre (títulos en hebreo) y Noto Sans Hebrew (texto en hebreo).
    - Se cargan con `next/font/google`, igual que el layout carga Cinzel, Playfair e Inter. Licencia OFL. Es la única petición de red nueva y se hace al construir.
    - Se aplican **solo** en ar y he. Los demás idiomas conservan exactamente su tipografía.
    - En ar y he se anula el espaciado entre letras de las etiquetas, que rompería el árabe ligado.
  - **Cambio de idioma en vivo:** cambia la huella y el lector abierto pasa al idioma nuevo sin recargar, en la misma página.
- **Se conserva todo lo aprobado:**
  - Composición, dos pantallas, copias por catálogo, título propio y exclusiones de fotos.
  - Enlaces personales y atribución de opiniones, contacto y grupos.
  - Vigilante por token y huella.
  - **El PDF no se toca:** sigue en español pase lo que pase con el idioma del enlace (`toPublicCatalog(…, "es")`). Le pasará el idioma el PR5.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal, secciones 2zc y 2zd de `scripts/sql/test-catalogs-core.sh` (variable `M17`).<br>**2zc:** 0223 aplicada dos veces sobre un enlace general y una asignación personal ya creados (38 comprobaciones de `test-catalog-languages.sql`):<br>• todos los catálogos existentes en «es» y los enlaces sin idioma propio<br>• la comprobación rechaza «pt» y «xx», y el idioma no puede quedar vacío<br>• «lang» entra en la instantánea, en la huella y en el vigilante<br>• el enlace general y el personal comparten huella si comparten idioma<br>• la medición de la HOME da la huella del enlace general<br>• cambiar el idioma del catálogo cambia la huella y sube la versión; repetirlo no hace nada<br>• **DA17:** el personal en árabe no cambia ni el general ni el catálogo; otra asignación hereda el del catálogo; vaciarlo vuelve al del catálogo<br>• se aceptan los 8 idiomas<br>• errores `invalid_lang`, `forbidden` (personal de la oficina y otro dueño), `link_not_found` y `link_revoked`<br>• permisos de anon y authenticated<br>• volver a «es» da la huella del despliegue<br>• la ficha del CRM queda intacta (huella de la fila)<br>**Reversión** (5 comprobaciones): columnas y funciones fuera, el catálogo abre sin «lang» y vuelve la huella de antes de 0223, también en el vigilante. Después, reaplicación (dos veces).<br>**2zd:** plantillas (0222), zonas (0220), biblioteca (0219), título (0217), opiniones (0218) y fotos (0202) en verde con 0223.<br>**Suite SQL completa** en verde: 2.606 comprobaciones. | ✅ |
| `test:catalogs-i18n`: 2.125 comprobaciones, nuevo en la CI como «Catálogos (idiomas, offline)».<br>• claves completas e idénticas en los 8 idiomas, sin vacíos y con los datos de cada función en su sitio<br>• el español idéntico a antes: precios, operación, planta, edición, fechas, avisos, errores de opiniones y de PDF, y títulos de sección<br>• dígitos latinos y símbolo por idioma<br>• RTL en ar y he, y la marca en ar, tr y he<br>• proyección con idioma, y el contenido igual en es y en<br>• el almacén sintético cambia la huella por idioma (DA17, DA19)<br>• comprobaciones de fuente: teclado y deslizar reflejados, composición sin reflejar, fuentes por `next/font`, PDF en «es», lista de 0223 y sin IA | ✅ |
| Las 26 suites de prueba de la CI (incluida la nueva), `tsc` y `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures (218 comprobaciones, `node_modules/.cache/visual-qa/lang-qa.mjs`):<br>• los 8 idiomas en escritorio: `lang` y `dir`; portada, índice, apertura, detalle y contacto con las etiquetas del idioma; precio y teléfono en LTR con dígitos latinos; familia correcta (Noto Naskh en ar, Frank Ruhl en he y Playfair en los demás)<br>• **apertura, detalle y segunda vivienda (foto al otro lado) con las mismas cajas que en español**, cajas medidas en el navegador y comparadas con 1 px de tolerancia<br>• **RTL (ar):** ← avanza, → retrocede, Av Pág avanza, «التالي» a la izquierda, flechas giradas, deslizar a la derecha avanza y a la izquierda retrocede<br>• galería en RTL con sus rótulos; modo desplazamiento<br>• descripción española aislada en LTR dentro de la página RTL<br>• **móvil 390 en ar y he:** foto arriba y panel debajo, sin desbordes<br>• **en vivo:** cambiar el idioma pasa el lector abierto de es a en y vuelta, en la misma página<br>• **DA17:** Ana en hebreo guarda su opinión con los mensajes en hebreo; Luis y el enlace general siguen en español<br>• enlace revocado con el lector abierto: aviso en árabe con `lang` y `dir`<br>• el español como antes<br>• sin errores de consola | ✅ |
| QA anteriores repetidas contra este servidor: lector (24), opiniones (23), título (7), estructura (15), textos aprobados (17), plantillas (29) y zonas (19).<br>Tras el último cambio, `title-qa` falló una vez en 2 pasos del gestor (guardar y publicar), que este PR no toca, y pasó 7/7 en las dos repeticiones siguientes. | ✅ |
| `next build` aislado (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr4/`](capturas-pr4/):
- Apertura y detalle en los 8 idiomas, en escritorio.
- En ar y he, además: portada, índice, contacto y colofón en escritorio, y portada, apertura y detalle en móvil.
- Galería y modo desplazamiento en árabe, la opinión en hebreo, el enlace no disponible en árabe y el cambio en vivo a inglés.

### Incidencia de procedimiento (la cuento tal cual)

Al ejecutar «todas las suites de la CI» con un bucle sobre `.github/workflows/ci.yml`, el bucle lanzó también `npm run build` (`next build`), que está en esa lista. Corrió **sin el aislamiento obligatorio**: con `.env.production` en su sitio, que Next cargó, y con el servidor de fixtures vivo.

- **No hubo acceso a producción.** La única traza de red del log es «supabaseUrl is required», es decir, el cliente de la base de datos no llegó a tener destino.
- **No se leyó ni se imprimió el archivo:** el log solo muestra su nombre.
- **Lo que hice después:**
  1. Paré el servidor de fixtures.
  2. Borré `.next`, que podía llevar incrustados valores públicos de ese archivo.
  3. Comprobé con `git` que `.env.production` y `tsconfig.json` estaban intactos.
  4. Repetí el build con el procedimiento aislado (fila de arriba).
- No queda ninguna carpeta de build.

### Efectos de la migración al fusionar

- Añade `catalogs.default_lang` (todos en «es») y `catalog_client_links.lang` (vacía), más las funciones `catalog_lang_snapshot`, `catalog_set_default_lang` y `catalog_client_link_set_lang`.
- Redefine `get_public_catalog` y `get_catalog_states` (las de 0218 con el idioma del token) y `catalog_public_fingerprint` (la de 0193 con el idioma del catálogo).
- **Todas las huellas públicas cambian una vez,** porque la instantánea gana `"lang":"es"`. Los lectores abiertos reciben una actualización **sin ningún cambio visible**: todo sigue en español, con la misma página.
- Mientras nadie elija otro idioma, que hoy solo se puede hacer por SQL, el lector y el PDF son los de siempre.
- No escribe en la ficha del CRM ni en ninguna otra tabla.

### Reversión

[`rollback-0223.sql`](rollback-0223.sql):
- Devuelve `get_public_catalog` y `get_catalog_states` a las de 0218 y `catalog_public_fingerprint` a la de 0193.
- Borra las funciones nuevas y las dos columnas.
- **Se pierden los idiomas elegidos.** Si hay que conservarlos, antes: `SELECT id, default_lang FROM catalogs WHERE default_lang <> 'es'; SELECT id, lang FROM catalog_client_links WHERE lang IS NOT NULL;`
- Las huellas vuelven a las de antes de 0223 (está probado). Los lectores abiertos reciben otra actualización sin cambios visibles.
- Si se revierte la base de datos antes que el código, el lector no recibe idioma y sigue en español.

### QA en producción (Fabricio)

1. Abre el enlace de un catálogo compartido. Debe verse **exactamente igual que antes**: textos, tipografía, posiciones, dos pantallas por vivienda, PDF y opiniones. Si tenías un lector abierto durante el despliegue, se actualiza una vez solo, sin cambiar nada.
2. Descarga el PDF desde el lector: igual que antes, en español.
3. En un enlace personal, guarda una opinión. Llega a la ficha del cliente como siempre.
4. Revisa los textos fijos de los 8 idiomas en `lib/catalogs/i18n.ts` o en las capturas de `capturas-pr4/`. **ar, tr y he necesitan un hablante nativo** antes de usarse con clientes.
5. (Opcional, solo si quieres verlo en producción antes del PR6) Con psql: `SELECT catalog_client_link_set_lang('<tu id de dueño>', '<id de una asignación de prueba>', 'ar');`. Abre ese enlace personal: debe leerse de derecha a izquierda y con las mismas cajas, mientras el enlace general sigue en español. Para deshacerlo, la misma llamada con `NULL`.

### Ajustes al plan

Están en [`plan.md`](plan.md), «Ajustes al implementar el PR4 (22-10-2026)».
- Migración 0223.
- Tanda 1 en paralelo y PR7b aplazado.
- N5 decidida.
- `lang` siempre en la instantánea.
- PDF en «es» hasta el PR5.
- Composición sin reflejar.
- Cifras en LTR.
- Títulos de sección con el contenido hasta el PR6.
- Sin selector en el gestor.
- Enlace no válido al abrir, en español.
- Galería sin las familias ar y he.
- Sin espaciado entre letras en ar y he.

Además:
- Los avisos en vivo del lector son ahora **códigos** que el lector escribe en su idioma.
- La portada admite etiquetas, y la HOME conserva las de siempre.
- Los mensajes de la descarga del PDF admiten los del idioma, y el gestor sigue con los españoles.
- La planta breve de los datos clave sale del formato y no de recortar «Planta ».
