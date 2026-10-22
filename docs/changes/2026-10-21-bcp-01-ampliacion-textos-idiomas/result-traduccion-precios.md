# BCP-01 · Ampliación — resultado · Traducciones con el precio del original

**Contexto:** [`result-traduccion-automatica.md`](result-traduccion-automatica.md) (#354). Formato y reglas, como en [`result.md`](result.md).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures. Ninguna llamada real a una IA; sin producción, credenciales ni archivos `.env` del repositorio.

## Rama y base

- **Rama:** `fabri/bcp-01-traduccion-precios`, desde `origin/main` = `b48b9a36` (con #354).
- **Migración:** `0229_catalog_translation_prices.sql`, con [`rollback-0229.sql`](rollback-0229.sql). Sin dependencias ni paquetes nuevos.

## El caso (22-10-2026)

«Alquiler de piso en Calle de Padilla, 24», en turco: «Bloqueada: menciona un precio (bloque 1/3)». Fabricio: «yo creo que está bien».

- El español dice «5.500 /mes», «5.780 /mes» y «150 mensuales»: **sin «€»**, así que el filtro de precios (`PRICE_RE` / `catalog_text_blocker`, que exige «€» o «euros») no lo ve y se publica.
- La IA, al traducir, escribió «5.500 €/ay», «5.780 €/ay» y «150 €». El mismo filtro, aplicado a la traducción, la bloqueó.

Es decir: la traducción no añadía nada que el español no dijera; solo el símbolo.

## La regla nueva

Una traducción se bloquea por precio **solo si inventa uno**: cada importe con «€»/«euros» de la traducción debe tener sus cifras en el texto español del mismo bloque (o título, o característica). Ejemplos:

| Español | Traducción | Resultado |
|---|---|---|
| «150 mensuales» | «aylık 150 €» | se publica |
| «1.450.000 €» | «€1,450,000» | se publica (mismas cifras) |
| «150 mensuales» | «aylık 180 €» | bloqueada: importe cambiado |
| «Piso de 90 m²» | «aylık 2.000 €» | bloqueada: precio inventado |
| cualquiera | teléfono, correo o web | bloqueada siempre |

El texto español **no cambia de regla** (un «5.500 €» escrito en español sigue bloqueándose como antes).

## Qué cambia

- **Servidor** (`lib/catalogs/translations.ts`): `translationBlockers(es, tr)` = contacto siempre + importes que no están en el original. La usan `checkTranslation`, `translationCurrent`, `applyItemTranslation` y la publicación de características (`translation-service.ts`). El espejo de fixtures (`translation-memory.ts`) imita la base de datos.
- **Base de datos (0229):** `catalog_tr_text_blocker(text)` (solo contacto) y, con el mismo cuerpo que en 0226 salvo ese filtro, `catalog_tr_blocker`, `catalog_tr_feature_save` y `catalog_tr_approve`. La base de datos no conoce el español de cada bloque con la forma que tiene el servidor, así que el control de «precio inventado» vive en el servidor (que es el único que escribe: todas son solo `service_role`); la base de datos sigue siendo la última barrera para contacto.
- **Lo ya guardado:** el borrador turco bloqueado se vuelve a comprobar al leerlo (los bloqueos no se guardan, se calculan), así que tras el merge pasa a «lista» y **se publica en la siguiente visita sin otra llamada a la IA**.

## Verificación

- `npm run test:catalogs-translations`: 161 comprobaciones (casos de la tabla, el caso real de Padilla 24 y el texto de 0229).
- `scripts/sql/test-catalogs-core.sh` en Postgres temporal, en verde, con las secciones nuevas:
  - **2zk:** 0229 aplicada dos veces; los bloques turcos reales pasan `catalog_tr_blocker`; teléfono, correo y web siguen dando `text_has_contact`; el español sigue dando `text_has_price`; `catalog_tr_feature_save` guarda «Garaj yeri: aylık 150 €» y rechaza una característica con teléfono; anon/authenticated sin permiso; reversión (un precio vuelve a bloquear y desaparece el ayudante) y reaplicación.
  - **2zl:** 0229 sobre las pruebas de la traducción automática (0228) y del acabado (0227).
- Todas las suites de CI (salvo `npm run build`, que se hizo aislado), `tsc` y lint de migraciones.

## Efectos de la migración al fusionar

- Redefine tres funciones y añade una. **No toca datos**, instantáneas, huellas ni permisos (mismos `REVOKE`/`GRANT` a `service_role`).
- Un borrador que hoy esté bloqueado SOLO por precio pasa a publicable: se publica solo en la siguiente visita a ese idioma (o con «Guardar» en «Idiomas»).

## Reversión

`rollback-0229.sql` (psql, una transacción): restaura las definiciones de 0226 y borra `catalog_tr_text_blocker`. Con el código revertido, lo publicado entre medias se queda publicado (no se despublica nada); lo nuevo con «€» vuelve a bloquearse.

## QA en producción (Fabricio)

1. Abrir el catálogo de «Alquiler de piso en Calle de Padilla, 24» en turco (vista previa o el enlace). La vivienda se ve traducida, con «5.500 €/ay» y «150 €». En «Idiomas», ya no sale «Bloqueada: menciona un precio».
2. Si no aparece en la primera carga (la publicación va en segundo plano), recargar a los pocos segundos.
3. En «Idiomas», editar un bloque turco y añadir un precio que no esté en el español (p. ej. «aylık 9.999 €») → al guardar: bloqueado por precio. Deshacer.
4. Igual con un teléfono → bloqueado por contacto.
