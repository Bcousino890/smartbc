# BCP-01 · Plan de la corrección «Operación y precio del catálogo, criterios y coincidencias» (K1–K5)

**Estado: BORRADOR, pendiente de que Fabricio apruebe su ejecución.** Este documento no autoriza:
- preparar el entorno;
- instalar dependencias;
- arrancar servicios ni la base de datos temporal;
- ejecutar migraciones;
- cambiar la aplicación;
- hacer push ni abrir un PR.

Diagnóstico de origen: [`diagnostico-seleccion-auto.md`](diagnostico-seleccion-auto.md). Esta corrección va **separada de E3**, que tiene sus decisiones aprobadas (D-QA13) y el plan en pausa.

## 0. Aprobación y precisiones (D-QA14, 15 de octubre de 2026)

Fabricio aprueba **DS-1, DS-2 y el alcance de K1–K5, solo para planificar**. Lo que sigue manda sobre cualquier otro texto de este plan o del diagnóstico.

| | Lo aprobado |
| --- | --- |
| **DS-1 / DS-2** | En los catálogos de **una sola operación** (Venta o Alquiler), **automáticos y manuales**, el gestor y el lector público muestran **esa operación y su precio**. Ejemplo: una dual en un catálogo de alquiler se ve «Alquiler · 6.000 €/mes», no con la venta delante. **Excepción:** una inclusión deliberada de una operación **incompatible** conserva su operación y su precio **reales**. Nunca se presenta una vivienda solo de venta como si estuviera en alquiler, nunca se inventa un importe y nunca se oculta que no encaja. Los catálogos de **venta y alquiler** se quedan como hoy |
| **K1** | Esa presentación, aplicada en todos los sitios. En el gestor, las otras operaciones de la vivienda pueden quedar como dato secundario |
| **K2** | **Un solo cálculo canónico en TypeScript** del importe de cada operación, para el filtro de la referencia TS, las explicaciones y las etiquetas, igual que la convención SQL: solo alquiler → `price`; venta y alquiler pedida en alquiler → `rent_price`; venta → el precio de venta. Los precios ausentes o no positivos se tratan como hoy. Los datos de alquiler incoherentes **se avisan internamente sin tocar la ficha del CRM** |
| **K3** | «Coincidencias» usa los criterios **GUARDADOS**, los mismos que deciden la lista del catálogo. Con criterios sin guardar, un aviso claro. «Ver qué entraría» sigue siendo la vista previa del borrador. Lo escrito sin guardar se conserva |
| **K4** | El resumen de criterios hace explícito el solapamiento entre zona padre y zona hija («Salamanca (incluye Recoletos)»), **sin cambiar** la regla «o» aprobada ni ampliar o estrechar la selección |
| **K5** | Se **rechazan** las entradas de importe que parecen decimales en vez de quitar los puntos: «5.5» nunca puede dar 55. Se definen y prueban los formatos enteros aceptados (5000, 5.000, 1.200.000), con la misma validación **en todos los sitios que aceptan criterios en bruto**, no solo en el campo HTML. Los campos vacíos u opcionales se tratan como hoy, y no se amplían los formatos admitidos |

**Precisiones de Fabricio:**
- La causa de su caso real **sigue sin confirmar**. Lo sintético no demuestra qué pasó con sus datos.
- Cambiar solo las etiquetas proyectadas **no cambia necesariamente la huella del SQL**. No se promete una actualización automática al desplegar: se documenta la recarga, como en E1, y se conservan las actualizaciones en vivo tras guardar.
- **No se propone ninguna migración ni ningún cambio de reglas de selección.** Si la verificación SQL encontrara un defecto que pida otra corrección, el cambio de alcance se plantea **antes** de implementar.

## 1. Alcance

**Entra:**
- K1–K5;
- la verificación de las funciones SQL **reales** en un Postgres 16 temporal;
- las pruebas en las suites de la CI que ya existen;
- las fixtures sintéticas que hagan falta.

**No entra:**
- cambiar `catalog_candidates`, `catalog_select`, las zonas, la elegibilidad o cualquier otra función SQL;
- migraciones;
- tocar las fichas del CRM;
- E3, los grupos de la HOME y PDF;
- **el texto que redacta la IA:** `textSourceFor` sigue pasando la operación real de la ficha (`texts.ts`). Cambiarlo sería otra decisión;
- otras superficies (SmartLink, colecciones, portal), que no usan `lib/catalogs/format.ts`.

## 2. Base, rama y entorno

- **Base:** `origin/main` = `84538e7859bd694fa5e1f2954d9593d7c2be2457` (merge de E2), con la CI en verde y la última migración `0197`. Se vuelve a comprobar al empezar; si ha cambiado, se informa antes de seguir.
- **Rama y worktree:** `fabri/bcp-01-seleccion` en `/Users/fabriirguez/SMARTBC/wt/bcp-01-sel`, ya creados desde esa base y con commits solo locales de documentación.
  - El checkout original, su stash y los demás worktrees no se tocan.
  - La rama de E3 (`fabri/bcp-01-e3`) es aparte.

### 2.1 Qué tiene que autorizar la aprobación de ejecución

1. **`npm ci`** en el worktree, con el `package-lock.json` existente. Sin dependencias nuevas.
2. **Base de datos temporal sintética:** el Postgres 16 de Homebrew que ya está en el Mac (`/opt/homebrew/opt/postgresql@16`), con el lanzador del repo `scripts/sql/run-local.sh`.
   - Solo en `<scratchpad>/pg-bcp01`, en `127.0.0.1:54329`, con el usuario y la base `bcp_test`. El lanzador se niega a cualquier otro destino y limpia del entorno `DATABASE_URL*`, `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*` y `PG*`.
   - **Aplica las migraciones `0192`–`0197` solo en esa base**, más los datos sintéticos. Nada de producción.
3. **Copia aislada** para el servidor de fixtures y la compilación: el mismo procedimiento de E1 y E2 (`iso.sh`), sin ningún `.env*`, con `env -i` y variables ficticias, comprobado antes de cada arranque (los cuatro controles, con lista blanca de variables).
4. El **Chromium de Playwright en caché** (`chromium-1208`). Si faltara, se pregunta antes de descargarlo.
5. **Commits, push** de `fabri/bcp-01-seleccion`, **el PR y la CI**. **No** el merge, que es de Fabricio y puede desplegar.

**Política P-1 durante toda la ejecución:**
- sin VPS ni producción, ni de administración ni de base de datos;
- sin credenciales ni IA real;
- sin escribir en cachés compartidas ni en fichas reales.

## 3. Diseño técnico

### 3.1 El cálculo canónico (nuevo y puro: `lib/catalogs/operation-price.ts`)

```ts
export type CatalogOperation = "sale" | "rent" | "any";
export interface OperationPriceInput {
  operation: string;                 // properties.operation ('sale' | 'rent')
  operations: string[] | null;       // properties.operations
  price: number | string | null;
  rent_price: number | string | null;
}
/** ¿La vivienda tiene la operación del catálogo? Misma regla que catalog_candidates (0195). */
export function fitsOperation(p: OperationPriceInput, op: CatalogOperation): boolean;
/** Importe con el que se filtra y ordena (= `eff` de catalog_candidates y catalog_select). */
export function operationPrice(p: OperationPriceInput, op: CatalogOperation): number | null;
/** Aviso interno si una vivienda SOLO de alquiler trae un rent_price positivo distinto de price. */
export function rentDataWarning(p: OperationPriceInput, currency?: string | null): string | null;
export interface PriceDisplay { operation: string; price: string; also: string | null; contextual: boolean }
/** Etiquetas de operación y precio en un catálogo de operación `op` (DS-1/DS-2). */
export function priceDisplay(p: OperationPriceInput & { currency?: string | null }, op: CatalogOperation): PriceDisplay;
```

**Reglas** (las mismas que la SQL de producción, leídas en `0195`/`0196`):
- **`fitsOperation`:**
  - `sale` → `operation = 'sale'`;
  - `rent` → `operation = 'rent'` o `'rent'` en `operations`;
  - `any` → siempre.
- **`operationPrice`:**
  - si encaja y el catálogo es de alquiler: `price` cuando `operation = 'rent'`, y si no, `rent_price`;
  - en los demás casos (venta, «cualquiera» o una inclusión que no encaja): `price`.
  - Siempre con «positivo o nada», como `nullif(greatest(coalesce(x, 0), 0), 0)` en SQL y `positive()` en TS.
- **`priceDisplay`:**
  - **`any`:** «Venta y alquiler · Venta X · Alquiler Y» en las duales y su operación en las demás, como hoy. Con una sola corrección K2: una vivienda **solo de alquiler** muestra `price` (hoy enseña `rent_price ?? price`).
  - **`rent` o `sale` y encaja:** la operación del catálogo y `operationPrice`, por ejemplo «Alquiler» · «6.000 €/mes». Sin importe positivo: «Precio · sin dato» (nunca se inventa).
    - `also` (solo para el gestor): en una dual, la otra operación, por ejemplo «También en venta: 2.100.000 €».
  - **No encaja** (inclusión incompatible): la operación y el precio **reales**, por ejemplo «Venta» · «6.000 €», con `contextual: false`. Nunca se presenta como del catálogo.
- **`rentDataWarning`:** si `operation = 'rent'`, no tiene venta y `rent_price` es positivo y distinto de `price` → «Dato de alquiler incoherente en la ficha: se usa el precio (X €/mes); hay otro importe de alquiler (Y €/mes)». Solo para el gestor. **La ficha no se toca.**
- **Consecuencia que conviene ver antes de aprobar:** una vivienda solo de alquiler con `price` vacío y el importe en `rent_price` hoy enseña ese importe aunque el filtro no lo use. Con K2 enseñará «Precio · sin dato», con el aviso interno. Es coherente con «nunca inventar un importe», pero el cliente deja de ver ese número. La consulta B del diagnóstico (§6) dice cuántas hay.

**Consumidores** (cambian en el mismo commit que la función o en el de su tarea, §4):

| Archivo | Cambio |
| --- | --- |
| `lib/catalogs/selection.ts` | `candidates()` y `orderKeyOf()` usan `fitsOperation` y `operationPrice` (hoy cada uno lleva su copia). `fitsOperation` se vuelve a exportar desde aquí para no romper los `import` existentes (`explain.ts`) |
| `lib/catalogs/format.ts` | `priceLabel`: una vivienda solo de alquiler usa `price`, que es la regla canónica. Las demás salidas no cambian |
| `lib/catalogs/explain.ts` | Ya usa `orderKeyOf`, así que hereda el cálculo canónico. Sin cambio de textos |
| `lib/catalogs/types.ts` | `CatalogItemView` gana `priceAlso?: string \| null` y `priceWarning?: string \| null` (solo gestión) |
| `lib/catalogs/queries.ts` | `toItemView(p, position, op)` y `propertyViews(ids, op, ctx?)` con la operación **guardada** del catálogo. Todos los que los llaman, en el mismo commit: lista automática, lista manual, excluidas, inclusiones, búsqueda y vista previa del modo |
| `lib/catalogs/to-public.ts` | `toPublicItem(it, op = "any")` y `toPublicCatalog(snap, op = "any")` toman `operation` y `price` de `priceDisplay`, sin `also`. Los demás que llaman (portada, material) siguen con `any` porque solo leen fotos |
| `components/admin/catalogs/manager/homes-section.tsx` | El panel de la vivienda enseña `priceAlso` y `priceWarning`. La fila no cambia: ya pinta `it.price` |

### 3.2 La operación del catálogo, en el lector

- La instantánea SQL **no** lleva los criterios y **no se cambia**. `lib/catalogs/public-data.ts` lee la operación aparte, siempre con el cliente de servicio y después de validar el enlace:
  - `getPublicCatalogState(token)`: tras `get_public_catalog`, `catalog_shares` → `catalogs.criteria->operation` de ese token;
  - `getCatalogTokenStates(tokens)`: una sola consulta para todos los enlaces vigentes de la pasada;
  - `getCatalogFingerprint(owner, catalog)`: `catalogs.criteria` filtrando por el dueño.
- Si la operación no se puede leer o no es válida, se usa `any`, es decir, lo de hoy.

### 3.3 Huella y lectores abiertos

- **Problema:** la huella pública es `md5(instantánea)`. En un catálogo **manual**, cambiar la operación de los criterios **no cambia la instantánea**. Sin más, un lector abierto no se enteraría y seguiría enseñando las etiquetas viejas, y la medición `?medir=1` lo contaría como «sin cambio público».
- **Solución sin migración:** una huella compuesta, en un módulo nuevo y puro (`lib/catalogs/public-fingerprint.ts`):
  - `composeFingerprint(fpSql, op)` = `fpSql` si `op = any`, y `` `${fpSql}:${op}` `` si es `sale` o `rent`;
  - se usa **en las tres lecturas** (estado público, vigilante y medición) y en el almacén sintético, para que siempre coincidan.
  - **Los catálogos de «venta y alquiler» conservan su huella exacta.**
- **Lo que se garantiza:** guardar unos criterios que cambian la operación pasa por `saved()` como siempre (aviso inmediato y vigilante). Como la huella compuesta cambia, el lector abierto se actualiza (D12) y la medición lo cuenta como cambio público.
- **Lo que NO se promete:**
  - Al desplegar, la huella compuesta de los catálogos de una sola operación cambia respecto a la que tienen los lectores abiertos. La pasada del vigilante **puede** mandarles la versión nueva, pero no se promete.
  - El documento de entrega dirá, como en E1: «para ver las etiquetas nuevas, recargad el enlace».
  - Una carrera entre leer la instantánea y leer la operación (dos consultas) se corrige en la pasada siguiente del vigilante; queda anotada.

### 3.4 K3: «Coincidencias» con los criterios guardados

- **`homes-section.tsx`** recibe `savedCriteria` (= `catalog.criteria`):
  - la vista **«Coincidencias»** busca con ellos;
  - si el borrador de los criterios tiene cambios (`criteriaForm.edited`), se ve encima: «Estás viendo las coincidencias de los criterios guardados. Guarda los criterios para aplicar tus cambios. Para ver qué entraría con ellos, usa «Ver qué entraría»».
- **«Ver qué entraría»** (en el editor de criterios) sigue con el **borrador**, como hoy.
- **La vista «Añadir» del modo manual** sigue con el borrador: los criterios de un catálogo manual solo filtran la búsqueda, como se aprobó en PR-B/C1. Queda anotado.
- **Salvaguardas de E2:** el almacén, lo escrito en bruto, los guardados en curso y los conflictos **no se tocan**. Solo cambia qué criterios recibe esa búsqueda.

### 3.5 K4: el resumen hace explícito el solapamiento

- `criteriaSummary` (`lib/catalogs/criteria.ts`) agrupa debajo de cada distrito elegido los barrios o textos que ya están dentro de él: «Salamanca (incluye Recoletos)». Si un texto libre cae dentro de un barrio elegido: «Recoletos (incluye «Paseo de Recoletos»)». Usa `catalogZoneMatch`, la misma tabla de zonas.
- Sin solapamiento, el resumen es **idéntico** al de hoy. La prueba de la HOME de PR-B («Salamanca · Justicia · Venta · 700.000–1.500.000 €») no cambia, porque Justicia es de Centro.
- La barra de Viviendas enseña, además, el aviso de redundancia que hoy solo sale dentro del editor.
- **La selección no cambia:** la regla «o» sigue igual. Es solo texto.

### 3.6 K5: importes enteros, y solo enteros

- **`normalizeCriteria`** (`lib/catalogs/criteria.ts`, que usan el formulario mediante `criteriaFromRaw`, las tres acciones del servidor que aceptan criterios —guardar, «Ver qué entraría» y buscar— y las fixtures):
  - **número:** entero, entre 0 y 1.000.000.000;
  - **texto** (ya recortado): `^\d+$` o `^[1-9]\d{0,2}(\.\d{3})+$`;
  - **se aceptan** «5000», «5.000», «1.200.000» y «0»;
  - **se rechazan** «5.5», «5.50», «5.0000», «12.0», «5,000», «5.000,00», «5 000», «5.000 €», «5k», «-5» y «0.500»;
  - **vacío o `null`:** sin límite, como hoy.
  - El **máximo de viviendas** en texto solo como `^\d+$` («12.0» se rechaza). El mensaje de error es el de siempre.
- **La SQL ya es estricta:** `catalog_criteria_normalize` exige número entero. Se comprueba en la base temporal (T1) **sin cambiarla**.

## 4. Tareas (en orden de dependencias; un commit por tarea, cada una compila con sus consumidores)

Cada tarea pasa `npx tsc --noEmit`, `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager`, más su propia verificación.

| Tarea | Contenido | Archivos | Depende de | Verificación |
| --- | --- | --- | --- | --- |
| **T0** | Registro de la aprobación (D-QA14 en la enmienda §0) y este plan aprobado | `qa-c2/enmienda.md`, `qa-c2/plan-seleccion.md` | — | `git log` |
| **T1** | **Verificación SQL de la base, sin cambiar código.** En el Postgres temporal: `0192`–`0197` y los datos sintéticos de §6, con la tabla de resultados **escrita a mano antes de ejecutar**: `catalog_select` (orden, `via`, `total`, `matched`), `catalog_property_search` con los criterios guardados, `catalog_criteria_normalize` con «5.5», «5000», `5.5` y `5000`. Más la paridad TS ↔ SQL de siempre (2d). **Si algo no cuadra, me paro y planteo el cambio de alcance antes de seguir** | `scripts/sql/test-catalog-operations.sql` (nuevo), `scripts/sql/test-catalogs-core.sh` (escenario «2k») | T0 | La base temporal y `test-catalogs-core.sh` entero en verde |
| **T2** | **K2:** `operation-price.ts`; `selection.ts` y `format.ts` lo usan; pruebas puras con la tabla de §6 | `lib/catalogs/operation-price.ts` (nuevo), `selection.ts`, `format.ts`, `scripts/test-catalogs.mts` (`priceLabel` solo alquiler), `scripts/test-catalogs-public.mts` (sección «Operación y precio») | T1 | Resultados escritos a mano. La **paridad TS ↔ SQL** se vuelve a ejecutar, con el generador ampliado para que algunas viviendas solo de alquiler lleven un `rent_price` incoherente: `scripts/sql/gen-catalog-parity.mts` |
| **T3** | **K5:** los importes en `normalizeCriteria` | `lib/catalogs/criteria.ts`, `scripts/test-catalogs-public.mts` (aceptados y rechazados, uno a uno), `scripts/test-catalogs-manager.mts` («5.5» es un cambio no válido y se conserva en bruto) | T0 | Casos escritos a mano |
| **T4** | **K4:** el resumen con el solapamiento y el aviso en la barra | `lib/catalogs/criteria.ts`, `components/admin/catalogs/manager/homes-section.tsx`, `scripts/test-catalogs-public.mts` | T3 | Casos a mano: con y sin solapamiento, barrio dentro de distrito, texto libre dentro de barrio y alias (Chueca → Justicia) |
| **T5** | **K1 en el gestor:** `priceDisplay` en las vistas, `priceAlso` y `priceWarning`; las fixtures del gestor | `lib/catalogs/types.ts`, `queries.ts`, `fixtures-selection.ts` (`fixtureView(p, pos, op)`), `fixtures.ts`, `app/dev-fixtures/…/fixture-manager.tsx` (recalcula las etiquetas al cambiar la operación, también en la lista manual), `homes-section.tsx` (panel) | T2 | `tsc` y pruebas puras de `priceDisplay` (en T2) |
| **T6** | **K1 en el lector, con la huella compuesta** | `lib/catalogs/to-public.ts`, `public-fingerprint.ts` (nuevo), `public-data.ts`, `fixture-store.ts` (`Share.operation` con `any` por defecto, enlaces nuevos `fixtureRentToken000000000011` y `fixtureSaleToken000000000012`, y `FixtureOp { op: "operation" }`), `scripts/test-catalogs-public.mts` | T2 | El contrato sin claves nuevas ni prohibidas; las etiquetas en alquiler, venta y «cualquiera»; la huella de «cualquiera» **idéntica**; la compuesta igual en las tres lecturas |
| **T7** | **K3:** «Coincidencias» con los criterios guardados, con el aviso | `components/admin/catalogs/manager/homes-section.tsx`, `catalog-manager.tsx` | T5 | `tsc`. Navegador en T8 |
| **T8** | Navegador, regresiones, compilación aislada y capturas | Solo los arreglos que salgan, cada uno con su motivo | T4, T6, T7 | §5 y §7 |
| **T9** | Resultado y entrega | `result.md` (sección propia), `qa-c2/capturas-sel/` | T8 | Push de `fabri/bcp-01-seleccion`, PR y CI en verde en el último commit. **Se para antes del merge** |

**CI:** las pruebas nuevas van en `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager`, que ya corren en la CI. La SQL (T1 y la paridad) corre en el Postgres temporal, como en las fases anteriores. **La CI no tiene Postgres**, así que esa parte queda en el resultado con su salida.

**Recuperación:**
- Solo código: `git revert` del merge, en una rama y PR, que fusiona Fabricio.
- Sin migración, sin cambios de datos y sin tocar fichas.
- Tras revertir, las huellas de los catálogos de una sola operación vuelven a ser las del SQL: los lectores abiertos pueden recibir una actualización, o recargar.

## 5. Criterios de aceptación y su prueba

**Verificación independiente:**
- todos los resultados esperados se escriben a mano a partir de §0 y de la convención de `0085`, **antes** de ejecutar, nunca derivados del código que se prueba;
- la SQL se prueba **ejecutándola** en la base temporal;
- los mensajes se comparan con los literales de antes del cambio.

| Criterio | Cómo se demuestra |
| --- | --- |
| **AC-S1 (SQL real)** | T1: con los datos de §6, `catalog_select` da exactamente la lista, el orden, el `via` y los recuentos esperados; la búsqueda guardada da sus coincidencias; la normalización SQL rechaza «5.5» y `5.5`; la paridad TS ↔ SQL en verde, antes y después de T2 |
| **AC-S2 (K2)** | T2: `operationPrice` y `fitsOperation` dan la tabla de §6 (bordes, dual, dual sin alquiler, sin precio, 0, solo venta, `rent_price` incoherente, inclusiones incompatibles). `priceLabel` de una vivienda solo de alquiler usa `price`. `rentDataWarning` solo salta en el caso incoherente |
| **AC-S3 (K1 gestor)** | T5 y T8: en un catálogo de **alquiler**, la dual se ve «Alquiler» · «6.000 €/mes», con «También en venta: 2.100.000 €» en el panel; una solo de venta incluida a mano se ve «Venta» · «6.000 €» y «Incluida a mano» con su motivo; la de `rent_price` incoherente lleva su aviso en el panel. Lo mismo en **manual** y en **venta**. En **«venta y alquiler»**, como hoy |
| **AC-S4 (K1 lector)** | T6 y T8: el lector de los enlaces de alquiler y de venta enseña la operación y el precio del catálogo (portada interior, índice, apertura y ficha), y las incompatibles con lo suyo real. El enlace `main` («cualquiera») queda como hoy: la expectativa de `lector.mjs` («Venta 2.100.000 € · Alquiler 6.800 €/mes») no cambia. **Nunca** sale «Alquiler» en una vivienda solo de venta |
| **AC-S5 (huella)** | T6 y T8: la de «cualquiera» es idéntica a la del SQL; la compuesta coincide en el estado público, el vigilante y la medición. Cambiar la operación de un catálogo **manual** con el lector abierto (`fixtureMutate { op: "operation" }`) actualiza el lector sin recargar (D12), y la medición lo cuenta como cambio público |
| **AC-S6 (K3)** | T8: con criterios sin guardar, «Coincidencias» enseña las de los guardados (el recuento cuadra con «Coincidencias · N») y el aviso; «Ver qué entraría» enseña las del borrador; lo escrito se conserva exacto; guardar quita el aviso. «Añadir» (manual) sigue con el borrador |
| **AC-S7 (K4)** | T4 y T8: «Salamanca (incluye Recoletos)» en la barra, en la vista previa y en la tarjeta de la HOME, con el aviso de redundancia en la barra. La selección es idéntica con y sin el texto (mismos recuentos) |
| **AC-S8 (K5)** | T3 y T8: aceptados y rechazados de §3.6, uno a uno, en `normalizeCriteria`. En el navegador, «5.5» da el mensaje de criterios no válidos y no se guarda; se conserva escrito tal cual; «1.200.000» se guarda como 1200000 |
| **AC-S9 (E2 intacto)** | T8: las pruebas de E2 de D-QA9, guardados con retraso y conflictos, IA (A3), Viviendas, Contenido, Diseño y Compartir y barras fijas, en verde sin cambiar expectativas |
| **P-1 y aislamiento** | Comprobaciones de §2.1 antes de cada arranque. La base temporal solo en `pg-bcp01` |

## 6. Casos sintéticos y resultados esperados (escritos a mano)

**Criterios:** Alquiler · barrio Recoletos · 5.000–7.000 €/mes, de menor a mayor, máximo 24. Todas en Salamanca / Recoletos, disponibles, en España y con foto, salvo que se diga otra cosa.

| Vivienda | Datos | ¿Entra? | `operationPrice` (rent) | Etiqueta en catálogo de **alquiler** | En **«cualquiera»** |
| --- | --- | --- | --- | --- | --- |
| R4999 / R5000 / R6000 / R7000 / R7001 | solo alquiler, `price` 4.999…7.001 | no / sí / sí / sí / no | el `price` | «Alquiler» · «N €/mes» | igual |
| S6000 | solo venta, 6.000 | no | — | — | «Venta» · «6.000 €» |
| S6000 **incluida a mano** | ídem | sí (`include`) | 6.000 (real) | «Venta» · «6.000 €» (**real**) | igual |
| D6000 | dual, venta 2.100.000, alquiler 6.000 | sí | 6.000 | «Alquiler» · «6.000 €/mes» (+ «También en venta: 2.100.000 €» en el gestor) | «Venta y alquiler» · «Venta 2.100.000 € · Alquiler 6.000 €/mes» |
| Dnull | dual, venta 6.000, sin alquiler | no | — | (incluida a mano) «Alquiler» · «Precio · sin dato» | «Venta y alquiler» · «Venta 6.000 €» |
| Mnull / M0 | solo alquiler, sin precio o a 0 | no | — | «Precio · sin dato» | igual |
| G6000 | Salamanca / Goya | no (sí con el distrito Salamanca) | 6.000 | «Alquiler» · «6.000 €/mes» | igual |
| C6000 | Chamberí / Almagro | no (sí incluida a mano) | 6.000 | «Alquiler» · «6.000 €/mes» | igual |
| Xstale | solo alquiler, `price` 6.000, `rent_price` 9.000 | sí | 6.000 | «Alquiler» · «6.000 €/mes» + aviso interno | «Alquiler» · «6.000 €/mes» (**hoy «9.000»**) |
| Ystale | solo alquiler, `price` 9.000, `rent_price` 6.000 | no | 9.000 | «9.000 €/mes» + aviso | «9.000 €/mes» (**hoy «6.000»**) |

**Orden esperado:** R5000, Xstale, D6000, R6000 (las de 6.000, de la más reciente a la más antigua) y R7000. Con máximo 2: R5000 y Xstale. Con «Salamanca + Recoletos», entra también G6000. Con C6000 incluida y R6000 excluida: C6000 entra con `via = include` y R6000 sale.

**Catálogo de venta, en espejo:** la dual se ve «Venta» · «2.100.000 €» (+ «También en alquiler: 6.000 €/mes» en el gestor), y una solo de alquiler incluida a mano se ve con su alquiler **real**.

## 7. Regresiones

- **Las de siempre:** lector, índice, PR-A, PR-B, enlace, C1, C2, las mediciones (fase 2, C1 y C2), las de E1 y toda la matriz de E2. También `test:typography` (ningún hallazgo nuevo respecto a la base) y la compilación aislada. Lint: **no disponible** (sin configuración de ESLint en el repo; no se añade).
- **Cambios de expectativa previstos,** calculados a mano:
  - **Fixture por defecto del gestor** (catálogo **manual de Venta**, DS-2):
    - el «Piso señorial» dual pasa de «Venta y alquiler · Venta 2.100.000 € · Alquiler 6.800 €/mes» a «Venta» · «2.100.000 €», con «También en alquiler: 6.800 €/mes» en el panel;
    - el «Estudio de diseño» (solo alquiler, incompatible) se ve con su alquiler real («Alquiler» · «2.100 €/mes»), igual que hoy;
    - el «Dúplex con patio» (alquiler, sin precio) y el «Ático» (venta) no cambian: el primero es incompatible y conserva lo suyo real, y el segundo ya enseñaba la venta.
    - Cada prueba que lo mire se lista en el resultado con su motivo.
  - **Lector `main`** («cualquiera»): **sin cambios**.
  - **Una vivienda solo de alquiler con `rent_price`:** ninguna fixture actual la tiene, así que no hay expectativas que cambien.
- **Ninguna expectativa se relaja.**

## 8. Decisiones de implementación (las tomo yo y quedan anotadas)

- La operación del catálogo se lee en TS (§3.2) y la huella se compone (§3.3) **sin migración**. Los catálogos de «venta y alquiler» conservan su huella exacta.
- `also` (la otra operación) solo en el gestor. El lector enseña **solo** la operación del catálogo, salvo en las inclusiones incompatibles, que enseñan la suya real.
- En un catálogo de alquiler, una dual sin `rent_price` incluida a mano se ve «Alquiler · Precio · sin dato», sin inventar.
- «Añadir» del modo manual sigue con el borrador de los criterios (aprobado en PR-B/C1). Solo «Coincidencias» cambia (K3).
- El texto de la IA (`textSourceFor`) queda fuera.

## 9. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La SQL real no hace lo que dice la lectura | T1 va **primero** y se para si algo no cuadra |
| Las tres huellas se desincronizan | Una sola función (`composeFingerprint`) con pruebas, y la medición sintética 20 × 2 en verde |
| Lectores abiertos durante el despliegue | No se promete nada: recarga documentada |
| Una vivienda solo de alquiler pierde el importe que se veía (estaba en `rent_price`) | Aviso interno. La consulta B dice cuántas hay. Es la regla aprobada en K2 |
| Una consulta más por pasada del vigilante (la operación de los enlaces) | Una sola consulta por pasada para todos los enlaces; se mide en la prueba de carga de la HOME de siempre (D13 sintética) |

## 10. Evidencia que falta para confirmar el caso real de Fabricio

No hace falta para preparar ni ejecutar este plan. Sirve para saber qué le pasó a su catálogo:
1. Los **criterios guardados**: una captura de la barra de Viviendas.
2. **Dos o tres referencias BC** que esperaba y no salen, y dos o tres que salen y no deberían.
3. Si quiere, la **consulta A** del diagnóstico (§6), que ejecuta él en solo lectura y dice vivienda por vivienda por qué entró y con qué importe. La **consulta B**, para saber cuántas viviendas solo de alquiler tienen un `rent_price` incoherente. Si además quiere contar las que tienen `price` vacío y `rent_price` lleno, añadir `OR (price IS NULL AND rent_price IS NOT NULL)`.

## 11. Fase y siguiente paso

- **Fase actual:** plan de la corrección en **BORRADOR**, a la espera de la aprobación de ejecución. La causa del caso real **sigue sin confirmar**. No se ha cambiado la aplicación, no se ha instalado nada, no se ha arrancado ninguna base de datos ni servidor y no hay push ni PR. Los documentos están en commits locales de `fabri/bcp-01-seleccion`.
- **Siguiente paso:** Fabricio aprueba (o corrige) este plan y las autorizaciones de §2.1. Solo entonces: preparación (`npm ci`, base temporal, copia aislada), T0–T9 y parada antes del merge. Si T1 encuentra un defecto en la SQL, me paro y planteo el cambio de alcance.
- **En pausa:** el plan de E3 (decisiones aprobadas), los grupos de la HOME y PDF.
