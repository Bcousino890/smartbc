# BCP-01 · Diagnóstico de la selección automática

**Estado: DIAGNÓSTICO EN SOLO LECTURA (15 de octubre de 2026). La causa del caso real de Fabricio sigue SIN CONFIRMAR:** que las pruebas sintéticas pasen no demuestra qué pasó con sus datos (§6). El plan de corrección está en [`plan-seleccion.md`](plan-seleccion.md), en borrador.

**Aprobación (15 de octubre de 2026, D-QA14), solo para PLANIFICAR:** Fabricio aprueba DS-1 y DS-2 y el alcance de las correcciones K1–K5, con las precisiones del §0 del plan. No autoriza a implementar, instalar, preparar servicios, ejecutar migraciones, hacer push ni abrir un PR.

**Aprobación de ejecución condicionada (15 de octubre de 2026, D-QA15):**
- Fabricio autoriza la ejecución y el entorno del plan, con las correcciones de lectura coherente y de fallo seguro (plan §0 bis).
- El caso del alquiler sin precio principal queda como **prerrequisito sin resolver** (P-ALQ, [`alquiler-sin-precio.md`](alquiler-sin-precio.md)). Mientras no se decida, no se implementa la aplicación, no se hace push y no se abre el PR.
- T1 ya se ha ejecutado en el Postgres temporal. Confirma con las funciones SQL **reales** lo que este diagnóstico leía en el código (§1, «lo que esto NO demuestra», punto 2): 22 de 22 comprobaciones y la paridad en verde.

**P-ALQ decidido (15 de octubre de 2026, D-QA16):**
- Opción A + G-ALQ: la regla canónica `price`, con avisos internos y sin respaldo a `rent_price`.
- G-ALQ es una puerta antes del merge ([`plan-seleccion.md`](plan-seleccion.md) §0 ter).
- La causa del caso real **sigue sin confirmar**.

**Correcciones a este diagnóstico, pedidas por Fabricio:**
- La causa de su caso **no está confirmada** (ver arriba).
- **Error mío en §7:** decía que con K1 «la huella cambia una vez al desplegar». **No es así.** Cambiar solo cómo se proyectan la operación y el precio **no cambia la huella del SQL** (`md5` de la instantánea), porque la instantánea no lleva los criterios. Lo que pasa con los lectores abiertos y con los cambios de operación guardados se resuelve en el plan (§3.4), sin prometer una actualización automática al desplegar.
- Las consultas de producción **no hacen falta para preparar el plan**. Solo sirven para confirmar el caso real (§6).

**Caso de Fabricio:** un catálogo automático con «Recoletos · Alquiler · 5.000–7.000 €/mes» cuyas viviendas no parecen cumplir los filtros.

## 1. Base y método

- **Código:** `origin/main` = `84538e7`; la última migración es `0197`. Todo se ha leído en el worktree `wt/bcp-01-e3`, sin servidores ni instalaciones.
- **Definiciones SQL usadas:** las últimas de cada función.
  - `catalog_fold`, `catalog_zone_candidates`, `catalog_zone_match`, `catalog_criteria_normalize` y `catalog_candidates`: `0195`;
  - `catalog_select`, `catalog_set_criteria`, `catalog_property_search` y `catalog_effective_ids`: `0196`;
  - `catalog_internal_snapshot`: `0197`.
- **Comprobación ejecutada:** un guion sintético contra la **referencia de TypeScript** (`lib/catalogs/selection.ts`, `format.ts` y `explain.ts`), con Node 22 y el cargador del repo. Los resultados esperados se escribieron a mano antes de ejecutarlo. Guion: `scratchpad/diag-auto/ts-ref.mts`, fuera del repo. **18 de 18** conformes.
- **Lo que esto NO demuestra:** que la SQL de producción haga lo mismo hoy. La equivalencia se apoya en:
  1. la lectura línea a línea de la SQL (§3);
  2. la prueba de paridad TS ↔ SQL que ya existe (`scripts/sql/gen-catalog-parity.mts`, escenario 2d de `test-catalogs-core.sh`: 500 viviendas, 40 juegos de criterios con alquiler, venta, «cualquiera», duales con y sin `rent_price`, y ajustes). Pasó en verde en C1 y C2, pero **no se ha vuelto a ejecutar en este diagnóstico**, porque exige el Postgres temporal y aplicar migraciones en él. Queda como primer paso de la verificación propuesta (§7).
- **No se ha reproducido el caso de Fabricio:** no hay acceso a sus datos y no se usa ningún catálogo ni dato inventado como si fuera el suyo.

## 2. Recorrido completo

1. **Formulario** (`selection-panel.tsx`, desde E2 controlado por el almacén). Lo escrito se guarda en bruto (`CriteriaRaw`). `criteriaFromRaw` → `normalizeCriteria` (`lib/catalogs/criteria.ts`):
   - el precio se interpreta como `Number(texto sin puntos)`, así que «5.000» y «5000» dan 5000;
   - «5.000 €», «5,000», «5.000,00» o «5k» **no son válidos**: sale el mensaje de criterios no válidos y no se guarda;
   - **caso límite:** «5.5» da 55 sin aviso;
   - con «Venta y alquiler», el precio se anula.
2. **Guardar** → `setCatalogCriteriaAction` → SQL `catalog_set_criteria`, que vuelve a normalizar con las mismas reglas. **La lista automática usa siempre los criterios GUARDADOS.**
3. **Selección** (`catalog_select` → `catalog_candidates`):
   - **Operación «Alquiler»:** entran las de `operation = 'rent'` y las que tienen `'rent'` en `operations` (duales).
   - **Importe que se filtra y ordena:** el `price` si `operation = 'rent'`, y el `rent_price` si la vivienda es dual (`operation = 'sale'` con `'rent'`). `NULL` o 0 → sin importe, y con rango de precio **no entra**. Los bordes son inclusivos (`>=` y `<=`).
   - **Zona:** casa si el `zone` **o** el `subzone` de la vivienda se reconoce (`catalog_zone_match`: el **primer** término conocido de ese texto, con alias como Chueca → Justicia) como un distrito o barrio de los criterios. Varias zonas se unen con «o».
   - Solo España, sin archivar, disponible o reservada y **con al menos una foto**.
   - **Ajustes:** las excluidas salen; las incluidas entran aunque no cumplan (`via = include`), van primero en las plazas y se ordenan en su grupo.
   - **Orden:** grupo, importe (de menor a mayor por defecto), la más reciente y el `id`. Máximo de 1 a 24.
4. **Convención de datos** (`0085`): una vivienda **dual** tiene `operation = 'sale'`, `price` = venta y `rent_price` = alquiler. Una **solo de alquiler** tiene `operation = 'rent'` y `price` = alquiler. El formulario del CRM la respeta y limpia `rent_price` cuando la vivienda deja de ser dual.
5. **Lo que se muestra** (gestor y lector público): `operationLabel` y `priceLabel` (`lib/catalogs/format.ts`), **sin tener en cuenta la operación del catálogo**.
6. **Refresco en vivo:** cada guardado cambia la instantánea, con ella la huella, y el lector se actualiza (D12/D13).

## 3. Hallazgos

### Verificados

| | Hallazgo | Tipo | Evidencia |
| --- | --- | --- | --- |
| **H1** | Con los criterios del caso, la selección hace lo esperado: 5.000 y 7.000 dentro; 4.999 y 7.001 fuera; solo venta fuera aunque su precio esté en el rango; dual con alquiler 6.000 dentro; dual sin `rent_price` fuera; sin importe o a 0 fuera; otro barrio del mismo distrito fuera; otro distrito fuera; máximo; inclusiones y exclusiones | Funciona | Guion TS (18/18) y lectura de la SQL: mismas condiciones en `catalog_candidates` y `catalog_select`. Paridad previa incluida |
| **H2** | Una **dual** que entra con razón en un catálogo de alquiler **se muestra con la venta delante**: «Venta y alquiler · Venta 2.100.000 € · Alquiler 6.000 €/mes». En la lista compacta de E2 la línea del precio se corta, así que puede verse **solo «Venta 2.100.000 €…»**. El lector público enseña lo mismo al cliente | **2 · coincidencia correcta con un precio confuso** | `priceLabel` y `operationLabel` no reciben la operación del catálogo. El panel «Por qué» sí dice el importe usado («6.000 €/mes dentro de 5.000–7.000 €/mes») |
| **H3** | Una vivienda **solo de alquiler** con un `rent_price` que no es el suyo **se filtra con un importe y se muestra con otro** (se filtra por 6.000 y se ve «9.000 €/mes»). `priceLabel` usa `rent_price ?? price` y la SQL usa `price` | **5 · datos incoherentes**, con una diferencia de código que lo hace visible | Guion TS. El formulario limpia `rent_price` y no he encontrado otro camino que lo escriba, pero **no sé si hay filas antiguas así**: hay que mirarlo (§6, consulta B) |
| **H4** | **«Coincidencias» busca con los criterios SIN guardar** (`draftCriteria`, en `catalog-manager.tsx`), mientras que la lista «En el catálogo» usa los guardados. El plan de E2 decía «con los criterios guardados». Con cambios a medio guardar, las dos vistas hablan de criterios distintos | **4 · criterios guardados frente a los que se querían** (desvío de E2) | Código. La barra de criterios sí enseña los guardados y «cambios sin guardar» |
| **H5** | Elegir el **distrito padre** (Salamanca) junto a Recoletos amplía la selección a **todo Salamanca**: las zonas se unen con «o», como está aprobado. El editor avisa («no estrecha la búsqueda»), pero el resumen de la barra solo dice «Salamanca · Recoletos» | **4 · posible diferencia de intención** | Guion TS y SQL. El aviso de redundancia solo está dentro del editor |
| **H6** | Las viviendas **incluidas a mano** entran aunque no cumplan, como está aprobado (C1). En la fila salen como «Incluida a mano», y el motivo («fuera de criterios», con la razón) en el panel | **3 · aprobado** | Guion y código |

### Hipótesis sin confirmar y casos límite

- **«5.5» se guarda como 55 sin aviso** (caso límite de lectura del importe). Poco probable en este caso.
- **Zona con dos nombres conocidos en el mismo texto** («Castellana, Recoletos»): solo cuenta el primero, y la vivienda podría **no** entrar en Recoletos. Es un falso negativo, no explica viviendas de más.
- **Datos de zona mal cargados** (un piso de Chamberí con `subzone = 'Recoletos'`): entraría con razón según los datos. Sería el caso 5 y se ve con la consulta A.

## 4. Lo que puede explicar el caso de Fabricio, de más a menos probable

1. **H2:** viviendas duales que sí cumplen, con la venta delante y cortada en la lista.
2. **H5 o H4:** el distrito Salamanca seleccionado también, o criterios sin guardar mientras se miraba «Coincidencias».
3. **H6:** inclusiones manuales.
4. **H3 o datos de zona:** datos incoherentes.

**No he encontrado ninguna regla de la selección que meta viviendas que no cumplen los criterios guardados.** Lo tienen que confirmar los datos reales (§6).

## 5. Comparación con la búsqueda del CRM

- La búsqueda de propiedades para clientes (`lib/db/queries/suggested-properties.ts`, `lib/clients/brief-match.ts` → `effectivePrice`) usa **la misma convención**: alquiler → `price` si es solo alquiler y `rent_price` si es dual.
- `lib/db/adapters.ts` y `lib/viewing-collections/to-public.ts` muestran el alquiler de una dual solo cuando se pide esa variante (`?op=rent` o `operation = 'rent'`).
- **Conclusión:** no hay una abstracción del CRM más correcta por la que sustituir la selección. Lo que sí falta es **una sola función de «importe de esta operación»** compartida por el filtro, la explicación y la etiqueta. Hoy `priceLabel` se aparta en el caso H3.

## 6. Datos que necesito de Fabricio (mínimos, sin credenciales)

1. **Los criterios guardados** tal como los enseña la barra de Viviendas (o una captura) y si el catálogo está en automático.
2. **Dos o tres referencias BC** que esperaba ver y no salen, y **dos o tres que salen y no deberían**.
3. Si puede, que **él** ejecute en su terminal estas dos consultas de **solo lectura**, sustituyendo `<UUID_DEL_CATALOGO>` (está en la URL del gestor):

```sql
-- A · Qué selecciona hoy el catálogo y por qué (solo lectura: SELECT y funciones STABLE).
SELECT c.mode, c.criteria FROM catalogs c WHERE c.id = '<UUID_DEL_CATALOGO>';

SELECT s.ord, p.bc_reference, p.operation, p.operations, p.price, p.rent_price,
       p.zone, p.subzone,
       catalog_zone_match(p.zone)    AS zona_reconocida,
       catalog_zone_match(p.subzone) AS subzona_reconocida,
       s.via, a.kind AS ajuste
  FROM catalogs c
  CROSS JOIN LATERAL catalog_select(c.id, c.criteria) s
  JOIN properties p ON p.id = s.property_id
  LEFT JOIN catalog_adjustments a ON a.catalog_id = c.id AND a.property_id = p.id
 WHERE c.id = '<UUID_DEL_CATALOGO>'
 ORDER BY s.ord;

-- B · ¿Hay viviendas solo de alquiler con un rent_price que no es el suyo? (H3)
SELECT count(*) AS total FROM properties
 WHERE operation = 'rent' AND NOT ('sale' = ANY (operations))
   AND rent_price IS NOT NULL AND rent_price <> coalesce(price, -1);
SELECT bc_reference, price, rent_price FROM properties
 WHERE operation = 'rent' AND NOT ('sale' = ANY (operations))
   AND rent_price IS NOT NULL AND rent_price <> coalesce(price, -1)
 ORDER BY bc_reference LIMIT 20;
```

No escriben nada: solo `SELECT` y funciones `STABLE` que ya usa el lector. No hace falta ninguna exportación. Con A sale, vivienda por vivienda, si cada una entró por los criterios (`match`), a mano (`include`/`both`), con qué importe y con qué zona reconocida.

## 7. Corrección propuesta (pendiente de aprobación)

No toca las reglas de selección aprobadas. Hay **dos decisiones** que tomar antes:

| | Corrección | Arregla | Decisión |
| --- | --- | --- | --- |
| **K1** | **Precio y operación del catálogo.** En un catálogo de **Alquiler** (o de **Venta**), el gestor y el lector muestran **el importe y la operación de esa operación**: una dual sale como «Alquiler · 6.000 €/mes». El panel del gestor añade «También en venta: 2.100.000 €». En «Venta y alquiler» todo queda como hoy | H2 | **DS-1:** ¿el cliente ve **solo** la operación del catálogo? Recomiendo **sí** en los catálogos de una sola operación. **DS-2:** ¿y en **manual**, donde la operación de los criterios solo filtra la búsqueda? Recomiendo usarla también si es Venta o Alquiler, y dejar «Venta y alquiler» como hoy |
| **K2** | **Una sola función del importe** (`operationPrice(propiedad, operación)`) para el filtro de TS, la explicación y la etiqueta, idéntica a la SQL. En una vivienda solo de alquiler se muestra `price`, que es con lo que se filtra. Si tiene un `rent_price` distinto, el gestor lo avisa («dato de alquiler incoherente en la ficha») sin tocar la ficha | H3 | No (es alinear con la convención de 0085), salvo que la consulta B muestre muchos casos |
| **K3** | **«Coincidencias» con los criterios GUARDADOS**, como decía el plan de E2. Con cambios sin guardar, un aviso: «Estás viendo los criterios guardados: guarda para aplicar los cambios» | H4 | No (corrige un desvío de E2) |
| **K4** | **Resumen de criterios explícito:** «Salamanca (incluye Recoletos)» cuando hay redundancia, y el aviso también en la barra, no solo dentro del editor | H5 | No |
| **K5** | Caso límite «5.5» → 55: pedir un número entero de euros y rechazar decimales con punto («5.5» o «5.50»). Solo cambia la interfaz; la SQL ya exige enteros | 3, límite | No |

**Qué cambia y qué no:**
- K1 cambia el **texto** del precio y la operación en el contrato público, no su forma. **Corregido:** eso, por sí solo, **no** cambia la huella del SQL; ver el plan (§3.4).
- Sin migración: K1 y K2 se calculan en TS con la operación del catálogo, que ya está en la instantánea.
- **Sin cambios en `catalog_select`, `catalog_candidates`, las reglas de zona ni la elegibilidad.**

**Verificación prevista** (necesita aprobación de ejecución):
1. **SQL de producción en el Postgres 16 temporal** (`postgresql@16` de Homebrew, ya en el Mac, con `scripts/sql/run-local.sh` en una carpeta del scratchpad, aplicando `0192`–`0197` **solo ahí**):
   - un escenario nuevo con las viviendas de §8 y la tabla de resultados **escrita a mano**;
   - más la paridad TS ↔ SQL de siempre.
   - Es lo que demuestra la SQL, y lo que este diagnóstico no ha podido ejecutar.
2. **Pruebas puras:** `operationPrice`, `priceLabel` con la operación del catálogo, la explicación y el contrato público (sin campos nuevos ni claves prohibidas).
3. **Navegador**, con fixtures sintéticas en la copia aislada:
   - catálogo de alquiler con una dual, una solo de alquiler con `rent_price` incoherente, una incluida a mano y el distrito padre;
   - lo que se ve en el gestor (fila, panel, Coincidencias con y sin cambios sin guardar) y en el lector;
   - escritorio y móvil;
   - regresiones de C1, C2, E1 y E2.
4. **Con los datos de Fabricio (§6):** comparar su consulta A con lo que muestra el gestor.

## 8. Casos sintéticos (resultados esperados escritos a mano)

**Criterios:** Alquiler, barrio Recoletos, 5.000–7.000 €/mes, de menor a mayor, máximo 24. Todas en «Salamanca / Recoletos» salvo que se diga otra cosa, disponibles, con fotos y en España.

| Vivienda | Datos | ¿Entra? | Importe usado | Se muestra hoy |
| --- | --- | --- | --- | --- |
| R4999 / R5000 / R6000 / R7000 / R7001 | solo alquiler, `price` 4.999…7.001 | no / sí / sí / sí / no | `price` | «N €/mes» |
| S6000 | solo venta, `price` 6.000 | no | — | — |
| D6000 | dual, venta 2.100.000, alquiler 6.000 | **sí** | `rent_price` 6.000 | «Venta 2.100.000 € · Alquiler 6.000 €/mes» (**H2**) |
| Dnull | dual, venta 6.000, sin alquiler | no | — | — |
| Mnull / M0 | solo alquiler sin precio / a 0 | no | — | — |
| G6000 | Salamanca / **Goya**, 6.000 | no (sí si se añade el distrito Salamanca: **H5**) | `price` | — |
| C6000 | Chamberí / Almagro, 6.000 | no (sí si se incluye a mano: **H6**) | `price` | «Incluida a mano» |
| Xstale | solo alquiler, `price` 6.000, `rent_price` 9.000 | sí | `price` 6.000 | «9.000 €/mes» (**H3**) |
| Ystale | solo alquiler, `price` 9.000, `rent_price` 6.000 | no | `price` 9.000 | — |

**Orden esperado:** R5000, y luego las tres de 6.000 de la más reciente a la más antigua (Xstale, D6000, R6000), y R7000. Con máximo 2: R5000 y Xstale.

## 9. Fase y siguiente paso

- **Fase actual:** diagnóstico en solo lectura terminado. La causa del caso **no está confirmada**. H2, H4 y H5 son las explicaciones más probables, y H3 depende de los datos. No he encontrado reglas de selección incorrectas.
- **Siguiente paso:**
  1. Fabricio aporta los datos de §6 (y ejecuta él, si quiere, las consultas A y B);
  2. decide DS-1 y DS-2;
  3. aprueba la corrección K1–K5 con su verificación (incluido arrancar el Postgres temporal y aplicar las migraciones solo en él).
  - Solo entonces se prepara el plan corto y se implementa.
- **Sigue en pausa:** el plan de E3 (decisiones ya registradas), la organización de la HOME ([`futuro-home-grupos.md`](futuro-home-grupos.md)) y PDF.
