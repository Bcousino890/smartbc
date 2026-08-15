# Viewing Collections — Private Book · Handoff final

**Sprint · 2026-08-15 · `main` @ `cf4c280` · desplegado y verificado en producción**

**Estado: BCP PRIVATE VIEWING EXPERIENCE COMPLETE**

---

## 1. Private Book (escritorio y tablet horizontal)

En viewports ≥1024px apaisados la colección es ahora una **publicación paginada**: portada → índice («Tu día de visitas») → un spread por residencia → asesor → colofón. Un viewport = una composición, sin scroll vertical dentro de la página.

- **Spreads**: texto a una página, fotografía a sangre en la otra, alternando de lado por capítulo. La galería completa se abre como superposición dentro del spread, sin perder la paginación.
- **Dos numeraciones**: la residencia (`01 / 03`, ChapterMark) y la página del libro (`05 / 10`, en la barra de navegación). Jerarquías distintas, tipografía distinta.
- **Navegación**: Anterior / Índice / Siguiente al pie; el índice salta a cualquier residencia; teclado ←/→ (Home vuelve a portada); swipe en tablet con umbral de 60px para no robar el scroll.
- **Transición** *(addendum 2026-08-15)*: **giro de página real** — la hoja saliente rota sobre el lomo (`rotateY`, perspectiva 2400px, sombra de lomo dinámica, canto marfil de 1px) y la entrante se asienta debajo; ~700ms, portada más marcada (~850ms, «abrir el libro»). Direccional (adelante gira hacia fuera, atrás la hoja vuelve), RTL espejado. Navegación bloqueada mientras la hoja está en el aire (teclado, click y swipe disparan la misma animación; sin `stop_view` duplicados). `prefers-reduced-motion` → fundido simple, nunca 3D forzado. Solo `transform`/`opacity`, sin librerías, sin sonidos, sin textura de papel.
- **Sin secuestro**: el servidor renderiza el modo scroll (mejor LCP); el cliente cambia a libro tras montar. Como la portada llena el viewport en ambos modos, el cambio es invisible.

**Móvil y tablet vertical: intactos** — el recorrido vertical de siempre, con el ritmo corregido (menos aire tras «Explorar residencia»: `py-16/24/28 → py-12/20/24` y CTA `mt-11 → mt-8`).

## 2. Idiomas — 8, con RTL

`es · en · fr · it · de · ar · tr · he`. El agente elige el idioma **al crear el itinerario** (selector en el diálogo de creación, añadido en el addendum: antes solo estaba dentro del editor y era fácil no verlo — de ahí el «la traducción no se aplica») y puede cambiarlo después en «datos del día»; migración `0130` (`viewing_itineraries.language`, default `es`).

- Árabe y hebreo se sirven en **RTL** completo (layout espejado, flechas de teclado invertidas), con los grupos latinos —horas, precios— protegidos del algoritmo bidi con `dir="ltr"`.
- Fechas por locale del idioma (el árabe con dígitos latinos, para coincidir con el panel). La **moneda sigue la lógica del país**; solo el sufijo `/mes` se traduce.
- Solo afecta a la superficie pública. El panel sigue en español. Las páginas terminales (caducada/revocada) siguen en español: en ese punto no se conoce el idioma.
- Diccionario en `lib/viewing-collections/i18n.ts` (~35 claves × 8). **Traducciones escritas por IA: conviene que un hablante revise ar/tr/he antes de usarlas con clientes reales.**

## 3. Títulos editoriales

«Alquiler de piso en Calle de Jorge Juan» → **«Jorge Juan»**. Transformación de presentación (no toca `properties.title`): extrae el nombre de la vía si el título contiene una reconocible (calle, avenida, paseo, plaza…); ante cualquier duda conserva el original. 7 casos testeados. Verificado en producción: «Piso en venta en Calle José Abascal» se publica como «José Abascal».

## 4. Solicitudes → «Preparar visitas»

Segunda puerta al **mismo** sistema — cero tablas nuevas, cero duplicación.

| Caso | Dónde | Qué hace |
|---|---|---|
| **1 · Cliente resuelto** | Fila de solicitud de visita | Enlace directo a la ficha, anclado en `#viewing-collections` |
| **2 · Lead sin cliente** | Tarjeta de lead Idealista / consulta web | Diálogo con los datos prellenados (nombre, email, teléfono) → crea el cliente con el mecanismo real del CRM (requiere permiso `clientes.create`). Sin email, genera dirección interna `…@sin-email.bcousinoprop.com` avisando al agente |
| **3 · Posible duplicado** | mismo diálogo | Detecta coincidencia por email o cola de 9 dígitos del teléfono y ofrece **«Vincular y preparar visitas»** por encima de crear |
| **Contexto de propiedad** | lead con `matched_property_id` | Checkbox «Añadir a su selección la propiedad del anuncio» (marcado por defecto, `source='manual'`) |

Decisión del agente siempre — el diálogo muestra la coincidencia, nunca decide solo. Al confirmar aterriza en la ficha del cliente, en el bloque de selección.

## 5. QA realizado

**Automático (local, banco visual):** libro en 1440 y 1024 apaisada; scroll en 430 y 768 vertical; teclado (avance, retroceso, Home, paginación final `10/10`); salto desde índice; galería superpuesta; inglés y árabe con RTL verificado (`dir=rtl` presente, CTA traducido). Sin overflow, sin errores de consola. **187 asserts** de proyección/permisos/i18n/títulos en verde. `tsc` limpio, build ok.

**En producción (colección real en inglés, ya eliminada):** portada «Curated for», índice «Your viewing day», fecha «Monday, 17 August 2026», DataPoints «Bedrooms/Bathrooms/Surface», «Explore residence», título editorial extraído, contrato client-safe intacto (sin owner_*, sin UUIDs, sin rutas de Storage), spreads con fotografía real de cartera, móvil en scroll.

**El `stop_view` en el libro** usa un `Set` por sesión: navegar adelante y atrás por la misma residencia no duplica el evento.

**Capturas** en `/tmp/book-shots/` y `/tmp/prod-book/` (regenerables con el banco `/v/design-preview?lang=…`).

## 6. QA manual pendiente (requiere tu sesión)

Lo que no puedo probar sin login — **las cuatro pantallas prioritarias**:

1. **Solicitudes → Preparar visitas**: pestaña *Idealista* → botón en una tarjeta → prueba «Vincular» con un lead cuyo teléfono coincida con Cliente Prueba, y «Crear cliente» con uno nuevo. Verifica que aterrizas en la ficha con la propiedad del anuncio ya en la selección.
2. **Reordering** (flechas) — el libro debe respetar el orden nuevo.
3. **Stop editor** — incluye el selector de idioma nuevo en «datos del día».
4. **Publish dialog** — publica en inglés y abre el enlace en escritorio (libro) y móvil (scroll).

Tu draft «VIEWING MONDAY TIM» sigue donde lo dejaste; lo respeté al limpiar mis datos de QA.

## 7. Limitaciones reales

1. **Traducciones ar/tr/he sin revisión humana** (§2).
2. **Solicitudes probado a nivel de código y compilación**, no de click — es el QA manual de arriba.
3. La coincidencia por teléfono usa cola de 9 dígitos sobre clientes con teléfono (≤500): suficiente hoy, revisar si la base crece mucho.
4. Persisten los duplicados históricos de numeración de migraciones (0122/0123 ajenos vs propios); el runner registra por nombre completo de fichero, así que no re-ejecuta, pero la ambigüedad cosmética sigue.
5. En el libro, una página con muchísimo contenido (título larguísimo + reservada + dirección) puede necesitar scroll interno en 1024×768 — es intencionado, mejor que recortar.
