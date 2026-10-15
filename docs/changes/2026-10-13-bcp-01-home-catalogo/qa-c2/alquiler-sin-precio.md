# BCP-01 · Prerrequisito P-ALQ: alquiler sin precio principal

**Estado: ANÁLISIS PARA DECISIÓN DE FABRICIO (15 de octubre de 2026).** Es el prerrequisito de D-QA15 ([`plan-seleccion.md`](plan-seleccion.md) §0 bis).
- Mientras no se decida, no se implementa la aplicación, no se hace push y no se abre el PR.
- El respaldo a `rent_price` del §4 es una **propuesta**, no una regla aprobada.
- La causa del caso real de Fabricio (Recoletos · Alquiler · 5.000–7.000) **sigue sin confirmar**.

## 1. El caso

Una vivienda **solo de alquiler** (`operation = 'rent'`) sin precio principal válido (`price` 0 o negativo), pero con un `rent_price` positivo:
- **Hoy**, la etiqueta enseña ese `rent_price`, pero la selección automática lo ignora y la trata como «sin precio».
- **Con K2 tal como estaba en el plan**, la etiqueta pasaría a «Precio · sin dato». Fabricio no lo acepta en silencio.

**Lo que dicen el esquema y el resto del CRM:**
- `properties.price` es `NOT NULL` (`0001_init.sql`). Por eso en la base el «precio ausente» es 0 o negativo, no `NULL`. El caso `NULL` solo se prueba en TS, por si acaso.
- **El resto del CRM ya usa `price` como el alquiler de una vivienda solo de alquiler:**
  - SmartLink: `lib/db/adapters.ts:376-379`;
  - colecciones: `lib/viewing-collections/to-public.ts:210-214`;
  - `/compartir` y el PDF de la ficha: `app/compartir/[slug]/page.tsx:71`, `app/api/admin/properties/[slug]/pdf/route.ts:98`;
  - propiedades sugeridas: `lib/db/queries/suggested-properties.ts:193-204`.
  - Todos usan `rent_price` **solo en las duales**. La etiqueta del catálogo (`priceLabel`, `rent ?? price`) es la única excepción.
- El formulario de la ficha borra `rent_price` al guardar una vivienda que no es dual (`property-edit-view.tsx:604-605` → `actions.ts:599`). No he encontrado otro código que lo escriba. Así que estas filas vienen de datos antiguos o de escrituras fuera del formulario. **No sé cuántas hay:** la consulta del §5 lo dice.

## 2. Comportamiento ACTUAL (verificado con datos sintéticos)

- **Selección y orden:** funciones SQL reales `0192`–`0197` en el Postgres temporal, `scripts/sql/test-catalog-operations.sql`, **22/22**.
- **Explicaciones y etiquetas:** módulos TS reales, guion fuera del repo, **46/46** junto con la propuesta.
- **Criterios de los catálogos de prueba:**
  - A: Alquiler · barrio Recoletos · 5.000–7.000 · de menor a mayor;
  - B: igual que A, sin rango de precio;
  - C: venta y alquiler.

| Vivienda | `price` / `rent_price` | Selección SQL en A | Puesto sin rango (B) | Explicación hoy (A) | Etiqueta hoy (gestor y lector) |
| --- | --- | --- | --- | --- | --- |
| **Z0R6** | 0 / 6.000 | **no entra** | **la última**, como «sin precio», detrás de una de 9.000 | «Sin precio (con un rango de precio no entra)» | **«Alquiler · 6.000 €/mes»** |
| NEG6 | −1 / 6.000 | no entra | entre las últimas | «Sin precio…» | «6.000 €/mes» |
| Z0R8 | 0 / 8.000 | no entra | entre las últimas | «Sin precio…» | «8.000 €/mes» |
| Z0N · Z0Z | 0 / nada o 0 | no entra | entre las últimas | «Sin precio…» | «Precio · sin dato» |
| X6R9 | 6.000 / 9.000 | **entra** por 6.000 | por 6.000 | «6.000 €/mes dentro de 5.000–7.000 €/mes» | **«9.000 €/mes»** |
| Y9R6 | 9.000 / 6.000 | **no entra** por 9.000 | por 9.000 | «Precio 9.000 €/mes, por encima de 7.000 €/mes» | **«6.000 €/mes»** |
| DS6 (dual) | venta 6.000 / nada | no entra (nunca usa su venta) | entre las últimas | «Sin precio…» | «Venta y alquiler · Venta 6.000 €» |
| DS0 (dual) | venta 0 / 6.000 | entra por 6.000 | por 6.000 | dentro | «Venta y alquiler · Alquiler 6.000 €/mes» |

**Inclusiones a mano:**
- Z0R6 incluida en un catálogo de **alquiler** (E): entra solo por la inclusión, al final de su grupo y sin importe.
  - Con máximo 8 (F) ocupa una plaza asegurada.
  - Explicación: «Incluida a mano · fuera de criterios», por «Sin precio».
- Z0R6 incluida en un catálogo de **venta** (D): va al grupo final, **después** de una de 6.000, porque su `price` 0 es «sin importe».
- La instantánea pública lleva los dos importes sin tocar, y la etiqueta se decide en TS.

**Conclusión:** hoy la vivienda **se ve con un importe y se selecciona y explica con otro**, en los dos sentidos.
- Z0R6 aparece con 6.000 €/mes, pero no entra en 5.000–7.000.
- Y9R6 aparece con 6.000 €/mes y tampoco entra.
- X6R9 aparece con 9.000 €/mes y entra.

## 3. Opción A: mantener la regla canónica y corregir las fichas

**La regla:** la de K2, igual que el SQL y el resto del CRM. El alquiler de una vivienda solo de alquiler es `price`. Un `rent_price` distinto solo genera un aviso interno, y la ficha no se toca.

| Vivienda | Selección y orden | Explicación (gestor) | Etiqueta |
| --- | --- | --- | --- |
| Z0R6 / NEG6 / Z0R8 | **sin cambios** (sin importe) | «Sin precio» + aviso: «La ficha no tiene precio principal; hay 6.000 €/mes en el campo secundario. Corrige el precio en la ficha» | gestor: «Precio · sin dato» **y** el aviso con la cifra; lector: «Precio · sin dato» |
| X6R9 · Y9R6 | sin cambios | la de hoy + aviso de dato incoherente | **6.000** y **9.000**: ahora coincide con lo que se selecciona |
| Duales · ventas | sin cambios | sin cambios | DS-1/DS-2 del plan |

**Consecuencias:**
- **Sin SQL, sin migración y sin cambio de selección:** el plan sigue tal cual.
- **Para el dueño no es silencioso:** el gestor enseña la cifra y dice qué corregir. El lector **sí** perdería la cifra en las fichas que sigan sin corregir.
- **Corregir la ficha** (escribir el precio en el formulario, que además borra el `rent_price`) es un proceso **humano y del dueño**. Ningún agente toca fichas.
- **Una ficha corregida se propaga sola.** La instantánea lleva `price`, así que la huella cambia y el lector abierto se actualiza en vivo. La ficha también queda bien en SmartLink, PDF, colecciones y sugeridas, que ya usan `price`.
- **Para que ningún cliente vea un «sin dato» nuevo,** el orden sería: contar (§5) → corregir las fichas que salgan → desplegar K2. Si la consulta da 0, la decisión casi no tiene efecto.

## 4. Opción B: respaldo a `rent_price` (PROPUESTA, no aprobada)

**La regla:**
- En una vivienda **solo de alquiler**, el importe es el `price` válido. Si no lo hay, el `rent_price` válido, con aviso interno.
- En una **dual**, el alquiler es **solo** `rent_price`, **nunca** su precio de venta.
- Las ventas no cambian.
- Se aplica igual al filtro, al orden, a la explicación y a la etiqueta, en todo tipo de catálogo: de alquiler, de venta con inclusiones y de «venta y alquiler».

**Resultados del prototipo** (guion TS fuera del repo, resultados escritos a mano; **no** se ha tocado ninguna función SQL):

| Catálogo | Hoy | Con el respaldo |
| --- | --- | --- |
| A (5.000–7.000) | R5000, DS0, D6000, E6R6, X6R9, R6000, R7000 · 7 | R5000, DS0, D6000, E6R6, X6R9, **NEG6, Z0R6**, R6000, R7000 · **9** |
| B (sin rango) | … Y9R6, DS6, Z0Z, Z0N, NEG6, Z0R8, Z0R6 | … **NEG6, Z0R6** entre las de 6.000; **Z0R8** a 8.000; **DS6** sigue al final (no usa su venta) |
| D (venta, con Z0R6 y R6000 incluidas) | S2M, D6000, R6000, Z0R6 | S2M, D6000, **Z0R6, R6000** (por su propio importe de 6.000) |
| E (A con 3 inclusiones) | 10 · 7 coincidencias · Z0R6 «include» | 11 · 9 coincidencias · Z0R6 **«both»** |
| Etiqueta Z0R6 | «6.000 €/mes» (sin coherencia) | «6.000 €/mes» + aviso «sin precio principal: se usa el importe secundario» |
| Explicación Z0R6 en A | «Sin precio» | «6.000 €/mes dentro de 5.000–7.000 €/mes» + el mismo aviso |
| DS6 (dual sin alquiler) | sin importe | **sin importe** («Precio · sin dato» en alquiler; nunca 6.000 de venta) |
| X6R9 · Y9R6 | etiqueta distinta de la selección | igual que la opción A: `price` + aviso |

**Lo que exigiría** (no está implementado ni entra en el plan actual: es un **cambio de alcance**, de tamaño «grande o sensible» según el flujo):
1. **Especificación:** la regla de arriba, en «venta y alquiler» también, con el texto exacto de los avisos.
2. **Migración `0198`:**
   - `CREATE OR REPLACE` de `catalog_candidates`, en la expresión `eff` de `base`;
   - y de `catalog_select`, en la expresión `eff` de las inclusiones (`i`).
   - Para `operation = 'rent'`: `coalesce(nullif(greatest(coalesce(price, 0), 0), 0), nullif(greatest(coalesce(rent_price, 0), 0), 0))`.
   - Las firmas no cambian. `catalog_property_search` y `catalog_effective_ids` lo heredan.
3. **TS:** el mismo cambio en `operation-price.ts` / `selection.ts`.
4. **Pruebas:**
   - `test-catalog-operations.sql` con las listas «con el respaldo»;
   - la paridad, cuyo generador ya tiene 35 alquileres con `rent_price` (19 sin precio principal);
   - las pruebas de la migración aplicada dos veces.
5. **Recuperación:** `rollback-0198.sql`, que repone los cuerpos de `0195`/`0196`, y `test-rollback-0198.sql`, en el mismo escenario.
6. **Efecto en producción:**
   - Al desplegar, en los catálogos automáticos **entran o se reordenan solas** viviendas que hoy no están, sin que el dueño haga nada.
   - Sus huellas cambian y los lectores abiertos lo reciben en vivo.
   - Revertir las vuelve a sacar.
7. **Divergencia:** el catálogo enseñaría 6.000 €/mes y SmartLink, PDF, colecciones y sugeridas seguirían usando `price` (0) para la misma vivienda, salvo que se ampliaran. Eso queda fuera de este trabajo.

## 5. Consulta de solo lectura para Fabricio

La ejecuta **Fabricio**: ningún agente accede a producción. Comprobada en el Postgres temporal con los datos sintéticos de T1. Dio 3, 2, 2 y 6 viviendas, y los catálogos esperados.

```sql
-- 1) Recuento de las viviendas de SOLO alquiler según sus dos importes.
SELECT
  (p.country = 'es' AND p.archived_at IS NULL AND p.status::text IN ('available', 'reserved')) AS en_alcance,
  CASE
    WHEN coalesce(p.price, 0) <= 0 AND coalesce(p.rent_price, 0) > 0                            THEN '1 sin precio principal, con rent_price'
    WHEN coalesce(p.price, 0) > 0  AND coalesce(p.rent_price, 0) > 0 AND p.rent_price <> p.price THEN '2 dos importes distintos'
    WHEN coalesce(p.price, 0) <= 0 AND coalesce(p.rent_price, 0) <= 0                           THEN '3 sin ningún importe'
    ELSE '4 coherente'
  END AS caso,
  count(*) AS viviendas,
  count(*) FILTER (WHERE 'sale' = ANY (coalesce(p.operations, '{}'))) AS con_venta_en_operations
FROM properties p
WHERE p.operation::text = 'rent'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 2) Detalle de los casos 1 y 2 que pueden aparecer, y en qué catálogos están hoy.
WITH en_catalogo AS (
  SELECT c.title, unnest(catalog_effective_ids(c.id)) AS property_id
    FROM catalogs c
   WHERE c.archived_at IS NULL
)
SELECT p.bc_reference, p.status::text AS estado, p.price, p.rent_price,
       (SELECT string_agg(e.title, ' · ' ORDER BY e.title) FROM en_catalogo e WHERE e.property_id = p.id) AS catalogos
  FROM properties p
 WHERE p.operation::text = 'rent'
   AND p.country = 'es' AND p.archived_at IS NULL AND p.status::text IN ('available', 'reserved')
   AND coalesce(p.rent_price, 0) > 0
   AND (coalesce(p.price, 0) <= 0 OR p.rent_price <> p.price)
 ORDER BY p.bc_reference;
```

**Cómo leer el resultado:**
- `con_venta_en_operations` > 0 señala fichas con `operation = 'rent'` y venta en `operations`. Es otra incoherencia, que no se trata aquí.
- La consulta B del diagnóstico queda **sustituida** por esta, que agrupa bien las condiciones y cuenta el 0 y los negativos.

## 6. Recomendación y decisión que necesito

**Recomiendo la opción A, sin el «sin dato» silencioso:**
- el gestor enseña la cifra secundaria y pide corregir la ficha;
- Fabricio ejecuta la consulta 1;
- si hay casos «1» en alcance, los corrige en las fichas **antes** de desplegar K2.

**Por qué:**
- mantiene una sola regla en todo el CRM;
- no cambia la selección de catálogos ya compartidos sin que su dueño haga nada;
- la corrección se propaga sola en vivo.

El respaldo (B) es coherente dentro del catálogo, pero cambia la selección en producción y crea una divergencia con el resto del CRM.

**La decisión exacta (P-ALQ), una de estas:**
1. **A (recomendada).** Regla canónica `price`. En el gestor, aviso con la cifra secundaria y «corrige la ficha». En el lector, «Precio · sin dato» **solo** en las fichas que sigan sin corregir. Despliegue después de la consulta 1 y de las correcciones que decidas.
   - → Sigo con T2 tal como está el plan, más el aviso.
2. **B.** Aprobar el respaldo como **cambio de alcance**.
   - → Preparo la especificación y el plan de la migración `0198` (§4) para su revisión y aprobación. Hasta entonces no implemento nada, ni SQL ni aplicación.
3. **Otra regla** que prefieras, por ejemplo A pero sin desplegar hasta corregir todas las fichas.

## 7. Evidencia

- **Entorno:**
  - `npm ci` con Node 22.23.3 y el lockfile existente (386 paquetes; `package-lock.json` sin cambios);
  - Postgres 16 temporal (`run-local.sh`, `127.0.0.1:54329`, base `bcp_test`), solo con datos sintéticos.
- **SQL, en el repo:**
  - `scripts/sql/test-catalog-operations.sql`: escenario «2k», 22 comprobaciones escritas a mano, todas a la primera;
  - `gen-catalog-parity.mts` ampliado;
  - `test-catalogs-core.sh` entero en verde: **706** comprobaciones `ok` (683 antes de T1).
- **TS, fuera del repo:**
  - `scratchpad/alq/eval.mts`: 46/46.
  - Una expectativa mía estaba mal escrita (en una inclusión fuera de criterios, `details` lista los incumplimientos, no la zona). La corregí después de la primera ejecución. No afecta al caso.
- **Consultas:** `scratchpad/alq/consultas.sql`, comprobadas sobre los datos de T1.
