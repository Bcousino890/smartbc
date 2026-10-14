# BCP-01 · Ampliación C — enmienda y plan (C1 + C2)

**Estado:** enmienda y plan aprobados por Fabricio el 2026-10-13. Autoriza **C1 (Y0–Y5)**. C2 (Z1–Z7) queda planificado y **no empieza** hasta el merge de C1 y su QA en vivo. Sustituye a la sección «PR-C · Recorrido editorial» (X10–X13) de `ampliacion-plan.md`, que pasa a C2 con los cambios de abajo. Sin PDF, índices globales, disparadores, producción ni revisión adicional de Codex.

**Base de C1:** `origin/main` = `57a13bd` (merge de #314), comprobada en remoto. Última migración: `0195`. `0196` (C1) y `0197` (C2) son provisionales y se comprueban antes de cada push.

## 1. Por qué cambia C

Fabricio pidió, antes del recorrido editorial:
1. mantener el automático **con inclusiones y exclusiones persistentes** (sustituye la regla de PR-B «sin modelo híbrido» para esta ampliación; el modo manual sigue igual);
2. completar las descripciones que faltan, a mano o con un borrador de IA revisado;
3. elegir la **vivienda y la foto de portada**, independientes del orden.

Se reparte en dos PR: **C1** (ajustes, explicación y portada; toca `catalog_select`, el camino caliente del vigilante, y por eso va con su propia medición) y **C2** (descripciones y recorrido editorial).

## 2. Escala de producción (recuento ejecutado por Fabricio, 2026-10-13)

| Total de propiedades | Candidatas (España, sin archivar, disponible/reservada) | Candidatas con foto |
| --- | --- | --- |
| 1.632 | 818 | 813 |

El tamaño sintético más pequeño de PR-B («2.000») tiene 1.680 candidatas (1.630 con foto): producción es aproximadamente la mitad. Allí, una pasada del vigilante con 5 enlaces automáticos tardó 36 ms (p95 40) y con 20, 137 ms (Mac local). **Nada de esto demuestra D13 (≤ 2 s) en vivo**; esa medición sigue pendiente.

## 3. Lo comprobado en el código (solo lectura)

- La descripción pública solo existe si hay versión limpia **vigente** en `property_client_descriptions`. La crea `getClientDescription` (IA) al abrir la vivienda en `/compartir`, «Ver residencia» o al importar un anuncio; **el catálogo nunca la crea**. Casos: A) ficha sin texto, B) sin versión limpia, C) versión limpia caducada, D) limpia vacía.
- Historias (`lib/services/story/engine.ts`): dos llamadas a IA con caché por fuente; exigen ≥ 25 palabras en la ficha; la aprobación es **global de la propiedad** (la usan otras pantallas).
- «Generar descripción» (`/api/admin/propiedades/generate-description`) usa también **fotos** y escribe la ficha global: no se reutiliza.
- `aiComplete` usa el proveedor de Configuración → IA (`app_settings` `ai.config`; credenciales no leídas). Por defecto en código: Anthropic `claude-opus-4-8` u OpenRouter `deepseek/deepseek-v4-flash-latest`. **No hay registro de uso ni coste en la app** y la llamada no tiene tiempo máximo propio.

## 4. Reglas aprobadas — C1

**Ajustes en automático**
- Las coincidencias siguen entrando solas. Se puede **incluir**, **excluir** y **quitar el ajuste** (la vivienda vuelve a seguir los filtros). Una vivienda tiene como mucho un ajuste: incluir sustituye a excluir y al revés.
- **Exclusiones:** se aplican **antes** del máximo; la siguiente coincidencia ocupa la plaza. Persisten aunque la vivienda deje de coincidir.
- **Inclusiones:** plaza asegurada, **mezcladas en el orden de los criterios** (no primero). Se permiten fuera de zona o de precio, y **sin foto con aviso**; las coincidencias normales siguen exigiendo al menos una foto. Una foto de marcador cuenta como foto: ni la regla ni la explicación valoran su calidad.
- **Otra operación:** se permite con aviso; va en un grupo **posterior** al de la operación del catálogo, ordenado por su propio importe. Nunca se compara un alquiler mensual con un precio de venta.
- **No se pueden incluir** viviendas vendidas, archivadas o de fuera de España. Si una inclusión se vende o se archiva después, sale de la lista (como siempre) y libera su plaza; el ajuste se conserva con aviso.
- **Máximo 1–24 (12):** se bloquea añadir una inclusión o bajar el máximo cuando las inclusiones disponibles lo superarían: «Sube el máximo o quita una inclusión.» Sin recortes silenciosos.
- **Modo:** los ajustes se conservan al pasar a manual y al «Convertir», y vuelven a aplicarse al regresar a automático. La lista manual se trata según la opción elegida (igual que en PR-B). Sin duplicados; claves públicas estables.

**Explicación (solo en gestión)**
- Cada vivienda: por qué coincide (zona, operación, precio) o que está incluida a mano (y qué criterios no cumple), avisos de sin foto y de otra operación; las excluidas, en su lista.
- En el buscador: por qué no entra una vivienda. Aviso de zonas redundantes («Castellana ya está dentro de Salamanca»).
- Nada de esto, ni los criterios ni los anuncios, llega al contrato público.

**Portada**
- Vivienda de la **lista efectiva** y una de sus fotos, independiente del orden.
- Respaldo: foto elegida mientras exista → foto de portada de esa vivienda → si la vivienda sale o no tiene fotos, la primera foto disponible de la lista → catálogo vacío: sin foto.
- Avisos en gestión; la HOME usa la misma portada. El contrato público no cambia (`coverPhoto`, por el proxy neutro).

## 5. Reglas aprobadas — C2 (para su plan; no se implementan en C1)

- Un cambio de precio **no** invalida el texto del catálogo, porque ese texto no puede mencionar precios (la comprobación los bloquea).
- Manda el texto **publicado y vigente** del catálogo; después la historia aprobada vigente; después la descripción limpia vigente; si no, datos y fotos.
- Si la fuente cambia, el texto **deja de mostrarse**, se conserva para revisarlo y aparece «Revisar»; se usa el siguiente nivel.
- Avisos del borrador de IA: cada uno se corrige o se confirma uno a uno; contacto o URL **bloquean siempre**.
- El texto editorial de una vivienda que sale queda **en reserva**; solo se borra si se pide.
- «Preparar descripciones» debe quedarse en el catálogo, o pedir aprobación expresa del efecto sobre la caché compartida (`property_client_descriptions`).
- Antes de activar generación real se aclara el coste del proveedor activo. IA solo al pulsar el botón; nunca publica sola; los agentes no generan nada con datos reales.

## 6. Plan C1 (este PR: `fabri/bcp-01-c1`)

| Tarea | Contenido | Depende de |
| --- | --- | --- |
| Y0 | Este documento y el puntero en `ampliacion-plan.md` | — |
| Y1 | `0196_catalog_adjustments.sql`: `catalog_adjustments` + `catalog_adjust` / `catalog_adjust_clear`; `catalog_select` con ajustes (columna `via`); recuentos, vistas previas, conversión y búsqueda sobre la lista efectiva; `catalogs.cover_property_id` / `cover_photo_id` + `catalog_set_cover`; instantánea con `cover` solo si hay elección; permisos E1; pruebas SQL, doble aplicación, `rollback-0196.sql` y reaplicación | Y0 |
| Y2 | Referencia TS con ajustes (paridad TS ↔ SQL con ajustes aleatorios) y `lib/catalogs/explain.ts` | Y1 |
| Y3 | Gestión: Incluir, Excluir, Quitar inclusión, Volver a permitir; recuentos y motivos | Y2 |
| Y4 | Selector de portada, mapeo público y HOME | Y1 |
| Y5 | Medición B frente a C1 (1.000 / 2.000 / 10.000; 1, 5 y 20 enlaces) y `result.md` | Y1–Y4 |

**Medición:** 50 ms (5 enlaces) y 300 ms (20 enlaces) por pasada son **referencias de evaluación**, no una puerta automática; se anotan tiempos, distribución y sobrecoste. Si aparece un resultado que cambie el plan, se informa con evidencia antes de cambiar nada.

**Criterios de aceptación C1:** AC-C1-1 exclusión antes del máximo y relleno · AC-C1-2 inclusión mezclada con plaza asegurada (fuera de criterios, sin foto, otra operación), con aviso en gestión y sin marca en el lector · AC-C1-3 bloqueo al añadir y al bajar el máximo · AC-C1-4 quitar ajuste; ajustes conservados en los cambios de modo; lista manual intacta · AC-C1-5 explicación en gestión y ausente del contrato público · AC-C1-6 portada estable y sus respaldos · AC-C1-7 huella sin cambios para catálogos sin ajustes ni portada · AC-C1-8 medición anotada.

## 7. Plan C2 (después del merge de C1 y su QA)

Z1 `0197_catalog_texts.sql` (borrador/publicado por catálogo y vivienda, huella de la fuente sin precio, estados A–D e historia, instantánea con el texto vigente) · Z2 `lib/services/story/source-hash.ts` · Z3 `lib/catalogs/editorial.ts` (prioridad de §5, entrada, destacados, privacidad) · Z4 IA a demanda con comprobación determinista (IA falsa en pruebas; coste aclarado antes de activarla) · Z5 gestión del texto · Z6 lector con varias dobles páginas y hoja continua en móvil · Z7 medición y resultado. Su plan detallado se revisa con estas reglas antes de empezar.

## 8. C2 — reglas consolidadas al implementar (rama `fabri/bcp-01-c2`)

Aprobadas por Fabricio al encargar C2; sustituyen a lo que §5 dejaba abierto.

- **Proveedor de IA:** se reutiliza el proveedor y el modelo ya configurados (Configuración → IA; hoy DeepSeek, financiado por el equipo). No se cambia la configuración global, no se añade proveedor ni dependencia y **no se promete un coste por llamada** (los comentarios antiguos del repo no sirven de precio). Los agentes nunca hacen llamadas reales ni usan datos de producción: en las pruebas la IA es falsa e inyectada.
- **IA solo al pulsar:** «Preparar desde la ficha (IA)» y «Borrador con IA» devuelven una **propuesta**; nada se guarda ni se publica sin el dueño. Tiempo máximo 60 s y «Cancelar»; una respuesta tardía no pisa lo editado (se ofrece «Usar la propuesta»).
- **Aislamiento:** «Preparar» reutiliza la misma limpieza que la descripción para clientes (extraída a `client-text.ts`, sin cambiar a quien ya la usaba) pero **no escribe** en `property_client_descriptions`. Nada de C2 toca `properties.description`, las historias globales ni otras cachés compartidas; las historias aprobadas y la descripción limpia solo se **leen** como respaldo (prueba SQL).
- **Prioridad pública:** texto del catálogo publicado y vigente → historia aprobada vigente → descripción limpia vigente → solo datos y fotos.
- **Vigencia:** la huella de la fuente cubre texto de la ficha, características (también manuales), m², dormitorios, baños, planta y operación; **no** el precio ni la disponibilidad. Si cambia, el texto deja de verse, se conserva, la gestión dice qué cambió y el lector baja de nivel.
- **Comprobación al publicar:** contacto (teléfono, correo, web) y precio **bloquean** (en TS y otra vez en SQL); cifras y elementos que la ficha no dice son **avisos** que se corrigen o se confirman uno a uno.
- **Reserva y borrado:** quitar o excluir una vivienda deja su texto en reserva; solo «Borrar texto» (con confirmación) lo elimina.
- **Recorrido C · Boutique:** apertura ligera (foto, título, precio, datos clave, entrada breve y hasta 3 puntos verificados), secciones breves alternando con fotos (hasta 3 dobles páginas), detalle con la ficha completa y la descripción íntegra; en móvil, una hoja continua con la ficha y la descripción plegables. Sin títulos temáticos inventados: solo los capítulos de una historia aprobada llevan título.
- **Medición:** 50 ms (5 enlaces) y 300 ms (20 enlaces) son referencias, no prueba de D13 ni puerta del 10 %.
