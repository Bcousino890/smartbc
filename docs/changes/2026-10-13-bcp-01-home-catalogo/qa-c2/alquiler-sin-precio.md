# BCP-01 · Prerrequisito P-ALQ: alquiler sin precio principal

**Estado: DECIDIDO (D-QA16, 15 de octubre de 2026): opción A + puerta G-ALQ.** El texto que sigue es el análisis que llevó a la decisión. Lo que manda está aquí:
- En una vivienda **solo de alquiler**, el importe es el `price` principal positivo, igual que la selección SQL y el resto del CRM. **No hay respaldo a `rent_price`.**
- **Avisos internos** (solo en el gestor):
  - cuando falta el precio principal;
  - cuando hay dos importes de alquiler distintos.
  - Los dos llevan la cifra secundaria cuando la hay.
- **Lo que ve el cliente:**
  - con un precio principal válido, **ese precio**, aunque haya otro importe incoherente;
  - **«Precio · sin dato» solo cuando no hay precio principal válido**.
- **G-ALQ es una puerta antes del merge**, no antes de desarrollar ni de abrir el PR (§5.2). Los agentes no modifican fichas.
- La opción B (§4) **no** se adopta.
- La causa del caso real de Fabricio (Recoletos · Alquiler · 5.000–7.000) **sigue sin confirmar**.

**G-ALQ: PENDIENTE (registro corregido el 15 de octubre de 2026, D-QA18).**
- **El 15 de octubre, antes del merge**, Fabricio dijo que no tiene la clave SSH (la tiene la empresa) y que había que «ir directamente al funcionamiento».
  - Lo registré como D-QA17, «aceptación en bloque» de lo que ve el cliente.
  - **Eso fue una interpretación mía, no una decisión suya.** Fabricio **no** aceptó excepciones sin revisar **ni** renunció a la puerta.
- **Fabricio pedirá los recuentos a una persona autorizada de la empresa.** Ningún agente pide credenciales SSH ni ejecuta las consultas de producción.
- **G-ALQ sigue PENDIENTE aunque K1–K5 ya estén fusionados y desplegados.** El merge y el despliegue no la cumplen, y no se propone deshacerlos.
- **Para cerrarla hace falta:**
  - los resultados de las consultas de §5, que aporta la empresa;
  - la revisión de las fichas afectadas;
  - la aceptación expresa de Fabricio, ficha por ficha o por grupo, de las que se queden sin corregir, con lo que ve el cliente:
    - sin precio principal válido: «Precio · sin dato»;
    - con dos importes distintos: el precio principal.
- **Ni la corrección de la vista previa** (PR aparte) **ni las pruebas sintéticas** cumplen G-ALQ ni resuelven el caso original de Recoletos.

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
- El formulario de la ficha borra `rent_price` al guardar una vivienda que no es dual (`property-edit-view.tsx:615-617` → `actions.ts:599`). No he encontrado otro código que lo escriba. Así que estas filas vienen de datos antiguos o de escrituras fuera del formulario. **No sé cuántas hay:** la consulta del §5 lo dice.

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
| Z0R6 / NEG6 / Z0R8 | **sin cambios** (sin importe) | «Sin precio» + aviso: «La ficha no tiene precio principal; hay 6.000 €/mes en el campo secundario. Corrige el precio en la ficha» | gestor: «Precio · sin dato» **y** el aviso con la cifra; lector: «Precio · sin dato» (no hay precio principal válido) |
| X6R9 · Y9R6 | sin cambios | la de hoy + aviso de dato incoherente, con la cifra secundaria | **6.000** y **9.000**: el precio principal, el mismo con el que se selecciona. **Nunca** «sin dato»; el cliente no ve la cifra secundaria |
| Duales · ventas | sin cambios | sin cambios | DS-1/DS-2 del plan |

**Consecuencias:**
- **Sin SQL, sin migración y sin cambio de selección:** el plan sigue tal cual.
- **Para el dueño no es silencioso:** el gestor enseña la cifra y dice qué corregir. El lector **sí** perdería la cifra en las fichas que sigan sin corregir.
- **Corregir la ficha** (escribir en el formulario el alquiler **confirmado con la fuente**, no copiar el `rent_price` a ciegas; el formulario borra además el `rent_price`) es un proceso **humano y del dueño** (§5.1). Ningún agente toca fichas.
- **Una ficha corregida se propaga sola.** La instantánea lleva `price`, así que la huella cambia y el lector abierto se actualiza en vivo. La ficha también queda bien en SmartLink, PDF, colecciones y sugeridas, que ya usan `price`.
- **Para que ningún cliente vea un «sin dato» nuevo,** está la puerta G-ALQ (§5.2): contar → confirmar y corregir → desplegar K2. Si la consulta da 0, la decisión casi no tiene efecto.

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

**Lo que habría exigido** (no adoptado por D-QA16; era un **cambio de alcance**, de tamaño «grande o sensible» según el flujo):
1. **Especificación:** la regla de arriba, en «venta y alquiler» también, con el texto exacto de los avisos.
2. **Una migración nueva** (la `0198` ya la usa otro cambio de `main`):
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

## 5. Consultas de solo lectura para Fabricio

Las ejecuta **Fabricio**: ningún agente accede a producción (política P-1).
- Limitadas a viviendas **activas** (disponibles o reservadas), **sin archivar** y **en España**, que son las que pueden aparecer en un catálogo.
- Probadas en el Postgres temporal con los datos sintéticos de T1. Dieron 3, 2, 2 y 6 viviendas y las referencias y catálogos esperados.
- Dentro de una transacción, he añadido una vivienda archivada, una vendida, una de Chile y una dual con los mismos importes, y he deshecho la transacción al terminar. La consulta no contó ninguna de las cuatro.

**Dónde se ejecutan.** Por la vía que ya usa el repo para la base de producción: el terminal de Fabricio, SSH al VPS y `psql` dentro del contenedor `supabase-db` (igual que el encabezado de `scripts/apply-migrations.sh`).
- **Documentado, no verificado por ningún agente:**
  - el host `root@178.105.185.125` y la ruta `/opt/smartbc-app` («verificados en producción el 2026-08-11», según `CLAUDE.md`);
  - el contenedor `supabase-db` y el usuario `postgres`, según `scripts/apply-migrations.sh`.
- **Verificado:** nada del entorno de producción actual. Las consultas solo se han probado en el Postgres temporal con datos sintéticos.
- Si el comando falla (otro host, otro contenedor), se trae el mensaje de error; no se improvisa otra vía.
1. Abrir el **Terminal** del Mac.
2. Pegar el bloque entero de abajo, desde `ssh` hasta la última línea `SQL`, y pulsar Intro.
   - Si pide la frase de la clave SSH, es la tuya.
   - No compartas credenciales con nadie.
3. `BEGIN TRANSACTION READ ONLY` hace que la base rechace cualquier escritura, y `ROLLBACK` cierra sin cambiar nada.
4. Salen dos tablas: el recuento por caso y la lista de referencias con sus catálogos. Basta con traer los recuentos y las referencias BC.

```bash
ssh root@178.105.185.125 'docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres' <<'SQL'
BEGIN TRANSACTION READ ONLY;

-- 1) Recuento: viviendas de SOLO alquiler activas (disponibles o reservadas), sin archivar, en España.
SELECT
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
  AND p.country = 'es'
  AND p.archived_at IS NULL
  AND p.status::text IN ('available', 'reserved')
GROUP BY 1
ORDER BY 1;

-- 2) Referencias afectadas (casos 1 y 2) y catálogos en los que aparecen hoy.
WITH en_catalogo AS (
  SELECT c.title, unnest(catalog_effective_ids(c.id)) AS property_id
    FROM catalogs c
   WHERE c.archived_at IS NULL
)
SELECT p.bc_reference, p.slug, p.status::text AS estado, p.price, p.rent_price,
       CASE WHEN coalesce(p.price, 0) <= 0 THEN '1 sin precio principal' ELSE '2 dos importes distintos' END AS caso,
       (SELECT string_agg(e.title, ' · ' ORDER BY e.title) FROM en_catalogo e WHERE e.property_id = p.id) AS catalogos
  FROM properties p
 WHERE p.operation::text = 'rent'
   AND p.country = 'es'
   AND p.archived_at IS NULL
   AND p.status::text IN ('available', 'reserved')
   AND coalesce(p.rent_price, 0) > 0
   AND (coalesce(p.price, 0) <= 0 OR p.rent_price <> p.price)
 ORDER BY caso, p.bc_reference, p.slug;

ROLLBACK;
SQL
```

### 5.1 Cómo leer el resultado

- **Caso 1, sin precio principal con `rent_price`:**
  - Hoy el catálogo enseña el `rent_price`, pero no lo usa para seleccionar.
  - **Ese importe no es necesariamente el alquiler correcto.** Puede ser un resto de cuando la vivienda era dual, un dato importado o una cifra antigua.
  - **No se copia a ciegas al precio:** hay que confirmarlo con la fuente (el anuncio vigente, el encargo o el contrato, o el propietario).
- **Caso 2, dos importes distintos:**
  - La selección usa `price` y la etiqueta de hoy enseña `rent_price`. Uno de los dos sobra, y no se sabe cuál sin mirar la fuente.
  - Un `price` con forma de precio de venta (seis cifras o más) es sospechoso.
- **Caso 3, sin ningún importe:** hoy ya sale «Precio · sin dato» y K2 no lo cambia. Completarlo es opcional y no forma parte de P-ALQ.
- **`con_venta_en_operations` > 0:** fichas con `operation = 'rent'` y venta en `operations`. Es otra incoherencia, que K2 no resuelve. Se revisan aparte.
- **`catalogos`:** dónde aparece hoy cada referencia. Una vivienda activa sin catálogo puede entrar mañana por unos criterios nuevos, así que también cuenta para la puerta.

**Cómo se corrige una ficha** (lo hacen Fabricio o su equipo, nunca un agente):
- En el formulario de la ficha, se escribe el alquiler **confirmado** en el precio y se guarda.
- Al guardar una vivienda que no es dual, el formulario borra `rent_price` (`property-edit-view.tsx:615-617`). Así la ficha queda con un solo importe.
- El cambio llega solo a los lectores abiertos (la instantánea lleva `price`) y a SmartLink, PDF, colecciones y sugeridas.

### 5.2 Puerta de despliegue propuesta (G-ALQ)

Antes de fusionar y desplegar K2:
1. Fabricio ejecuta las consultas del §5.
2. Revisa **cada** referencia de los casos 1 y 2: todas pueden aparecer en un catálogo, estén hoy en uno o no.
3. Confirma con la fuente el alquiler correcto de cada una y lo corrige en la ficha. Si alguna no se puede confirmar, **acepta expresamente** dejarla así, con lo que verá el cliente:
   - **caso 1** (sin precio principal): el lector dice «Precio · sin dato» y el gestor avisa, con la cifra secundaria;
   - **caso 2** (dos importes): el lector enseña el **precio principal** y el gestor avisa, con la cifra secundaria.
4. Vuelve a ejecutar la consulta 1. El PR recoge la evidencia **que aporta Fabricio o su equipo**: fecha, recuentos antes y después, referencias revisadas y excepciones aceptadas con su comportamiento visible.
5. Hasta que llegue esa evidencia, el PR marca **G-ALQ: PENDIENTE**.
   - **No** se da por cumplida por las pruebas sintéticas ni suponiendo que las fichas reales están bien.
   - Sin G-ALQ cumplida, el PR no se fusiona.
   - Se puede desarrollar y abrir el PR antes: es una puerta **antes del merge**.

**Orden de cierre (corregido el 15 de octubre de 2026, a petición de Fabricio):**
1. **G-ALQ**, con la evidencia que aportan Fabricio o su equipo y la aceptación expresa de cada excepción sin resolver.
2. **Merge**, que decide y hace Fabricio.
3. **Después del despliegue**, Fabricio hace la QA en producción del comportamiento nuevo.

La QA en producción de este PR no puede ir antes del despliegue. Ni la CI ni las pruebas sintéticas cumplen G-ALQ ni confirman el caso original de Recoletos.

**Los agentes no modifican esas fichas ni ninguna otra.**

## 6. Recomendación y decisión que falta

**Recomiendo la opción A con la puerta G-ALQ:**
- se mantiene la regla canónica `price`;
- el gestor enseña la cifra secundaria y pide corregir la ficha, sin cambiarla;
- el lector dice «Precio · sin dato» **solo** cuando no hay precio principal válido (caso 1 sin corregir). Con dos importes (caso 2), enseña el precio principal.

**La decisión (P-ALQ):** Fabricio eligió **1 (A + G-ALQ)** el 15 de octubre de 2026 (D-QA16). Las opciones eran:
1. **A + G-ALQ.** → Sigo con T2, añadiendo el aviso, y la puerta queda en el plan y en el PR.
2. **B (respaldo a `rent_price`).** → Cambio de alcance: preparo la especificación y el plan de la migración `0198` (§4) para su aprobación. No implemento nada hasta entonces.
3. **A con otra puerta** (por ejemplo, ninguna ficha sin corregir) **u otra regla.**

## 7. Evidencia

- **Entorno:**
  - `npm ci` con Node 22.23.3 y el lockfile existente (386 paquetes; `package-lock.json` sin cambios);
  - Postgres 16 temporal (`run-local.sh`, `127.0.0.1:54329`, base `bcp_test`), solo con datos sintéticos.
- **SQL, en el repo:** `scripts/sql/test-catalog-operations.sql`, escenario «2k», con 31 comprobaciones escritas a mano, todas a la primera:
  - 22 de selección, orden, búsqueda, instantánea y criterios;
  - 9 de `catalogs.version`: qué escrituras la suben, A→B→A, cambios repetidos, catálogo manual y permisos de la tabla.
  - Además: `gen-catalog-parity.mts` ampliado y `test-catalogs-core.sh` entero en verde.
- **TS, fuera del repo:**
  - `scratchpad/alq/eval.mts`: 46/46.
  - Una expectativa mía estaba mal escrita (en una inclusión fuera de criterios, `details` lista los incumplimientos, no la zona). La corregí después de la primera ejecución. No afecta al caso.
- **Consultas:** `scratchpad/alq/consultas-v2.sql` y la prueba de alcance `consultas-alcance.sql`, sobre los datos de T1.
