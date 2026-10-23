# BCP-01 · Ampliación — resultado · Traducciones reutilizadas en todo el equipo

**Contexto:** [`result-traduccion-automatica.md`](result-traduccion-automatica.md) (#354) y [`result-traduccion-precios.md`](result-traduccion-precios.md) (#355). Formato y reglas, como en [`result.md`](result.md).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y la IA falsa que cuenta llamadas. Ninguna llamada real a una IA; sin producción, credenciales ni archivos `.env` del repositorio.

## Rama y base

- **Rama:** `fabri/bcp-01-traduccion-compartida`, desde `origin/main` = `cd4e4627` (con #355).
- **Migración:** `0230_catalog_translations_team_reuse.sql`, con [`rollback-0230.sql`](rollback-0230.sql). Sin dependencias ni paquetes nuevos.

## Decisión de Fabricio (23-10-2026)

Si una vivienda ya se tradujo a un idioma, no se vuelve a pagar la IA al ponerla en otro catálogo, **sea de quien sea del equipo**. Aceptado: si alguien corrige a mano una traducción, esa corrección es la que reciben los catálogos nuevos.

## Antes

Cada traducción era del dueño del catálogo (0226) y la descripción, salvo que viniera de la biblioteca, era de **un** catálogo (DA31). El mismo piso con el mismo español se volvía a traducir en cada catálogo nuevo, y en cada persona del equipo. Las características y la plantilla «Vivir en…» se reutilizaban, pero solo dentro del mismo dueño.

## Ahora

Antes de pedir nada a la IA, para lo que le falte a una vivienda en un idioma, se busca en **todos los catálogos del equipo** una traducción ya **publicada** de:

| Parte | Se reutiliza si… |
|---|---|
| Descripción | es la **misma vivienda** y el **mismo español exacto** (huella y contenido) |
| «Vivir en…» | es exactamente el mismo texto de la plantilla |
| Cada característica | es la misma cadena exacta |

- Si hay varias, gana la **corregida o revisada a mano** y, después, la más reciente.
- Lo copiado pasa los **mismos filtros** al publicarse (contacto siempre; precio solo si no está en el español) y se publica en ese catálogo como «publicada sola». En «Idiomas» se ve «reutilizada de otro catálogo (sin IA)».
- **No se reutiliza:** un borrador sin publicar, otro idioma, otro español (si alguien cambió la descripción en su catálogo, se traduce esa), otra vivienda con el mismo texto, ni el título e introducción de cada catálogo (son de ese catálogo: siguen costando una llamada).
- Nunca pisa nada: solo rellena lo que no existe. Lo ya publicado en otros catálogos no cambia.
- Sustituye, para el mismo español, la parte de **DA31** que obligaba a traducir otra vez el texto propio de un catálogo aunque fuera idéntico al de la biblioteca (la prueba correspondiente se ha actualizado).

## Cambios

- **Base de datos (0230):** `catalog_tr_reuse(actor, fuente, plantilla, idioma, características)` (solo `service_role`, para dueños del equipo); columnas de procedencia `catalog_tr_texts.reused_from` y `catalog_tr_features.reused_from_owner`; tres índices para la búsqueda.
- **Servidor:** `reuseItem` en `lib/catalogs/translation-service.ts`, llamado en `autoUnit` antes de publicar y antes de gastar una llamada. Sirve igual para la primera visita y para «Preparar ahora». `prepareItem` y la reutilización comparten la preparación de fuentes (`unitSources`). Backend SQL (`translation-data.ts`) y espejo en memoria (`translation-memory.ts`, con el equipo como `team`).
- **Panel «Idiomas»:** etiqueta «reutilizada de otro catálogo (sin IA)».

## Verificación

- `npm run test:catalogs-translations`: 171 comprobaciones. Sección nueva «equipo»:
  - El catálogo de otra persona con las mismas viviendas solo paga el título: las viviendas se publican con la misma traducción y características.
  - El mismo dueño en otro catálogo: igual.
  - Con otro español, o con otro idioma, sí se traduce.
  - Se reutiliza la versión corregida a mano.
  - Un borrador sin publicar no se reutiliza.
- `scripts/sql/test-catalogs-core.sh` en Postgres temporal, en verde:
  - **2zm (27 comprobaciones nuevas):**
    - Se copian la descripción, la plantilla y la característica, con su procedencia, sin pisar nada; después la reserva da «ready», sin IA.
    - Se publica en el catálogo de la otra persona sin tocar el de la primera.
    - No se copian el borrador, otra huella, otro contenido con la misma huella, otra vivienda ni otro idioma.
    - Gana la corregida a mano.
    - Guardas de fuente ajena, idioma, persona fuera del equipo, anon y authenticated.
    - Reversión y reaplicación.
  - **2zn:** 0230 sobre las pruebas de 0228 y 0229.
- Todas las suites de CI (salvo `npm run build`, que se hizo aislado), `tsc` y lint de migraciones.

## Efectos de la migración al fusionar

- Añade dos columnas que admiten vacío (sin reescribir la tabla), tres índices y una función. **No cambia datos**, instantáneas, huellas ni permisos de lo existente.
- No hace nada por sí sola: la siguiente visita a un catálogo con viviendas sin traducir ya reutiliza lo que el equipo tenga publicado.

## Reversión

`rollback-0230.sql` (psql, una transacción) borra la función, los índices y las dos columnas. Lo ya copiado y publicado se queda publicado; con el código anterior, cada catálogo vuelve a traducir por su cuenta.

## QA en producción (Fabricio)

1. Elige una vivienda que ya esté traducida y publicada en algún catálogo, por ejemplo Calle de Padilla, 24 en turco.
2. Crea un catálogo nuevo (o pide a alguien del equipo que lo cree) con esa vivienda, sin tocar su descripción, y elige turco.
3. Abre el catálogo: la vivienda debe salir en turco enseguida y con la misma traducción. En «Idiomas» debe poner «reutilizada de otro catálogo (sin IA)». El título del catálogo sí se traduce (una llamada).
4. Si en ese catálogo editas la descripción en español de la vivienda, esa versión se traduce aparte, como antes.
