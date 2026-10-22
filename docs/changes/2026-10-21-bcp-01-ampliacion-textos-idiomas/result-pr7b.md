# BCP-01 · Ampliación — resultado del PR7b · Acabado visual

**Especificación:** [`spec.md`](spec.md) §5 (DA29; DA30 y N4 sustituidas, ver abajo) · **Plan:** [`plan.md`](plan.md) § PR7b. Los PR anteriores están en [`result.md`](result.md) y en los `result-pr*.md`.

> **La QA en producción y el merge son de Fabricio.** Todo se ha probado con datos sintéticos, fixtures y las dos fotografías del propio repositorio; sin producción, credenciales, fotos reales de catálogos, IA ni archivos `.env` (el `next build` se hizo con `.env.production` apartado fuera del worktree).

## Rama y base

- **Rama:** `fabri/bcp-01-acabado-visual`, desde `origin/main` = `0e59f839` (PR1–PR7a fusionados).
- **Migración 0227** (`0227_catalog_photo_finish.sql`) + [`rollback-0227.sql`](rollback-0227.sql). La 0225 queda sin usar.
- Sin dependencias nuevas (`sharp` ya estaba).

## Decisión de Fabricio que delega (22-10-2026)

Sustituye a DA30 y al requisito de N4 de esperar sus fotos y su aceptación visual: **delega la selección de fotos y el juicio visual del PR7b**. Fotos representativas dentro de los permisos existentes, criterio propio y un acabado **contenido**; cualquier foto oscura de ejemplo, rotulada «simulada»; sin más aprobación para decisiones estéticas rutinarias. Registrado en `spec.md` (DA30, N4, «Estado (N4)», AC14) y en `plan.md` (§ PR7b, ajustes y decisiones pendientes). Lo que sigue vigente de N4: **por catálogo, apagado por defecto en todos, opción por foto para quitarlo, nunca en bloque ni en silencio**.

## Fotos usadas (y cuál es simulada)

| Id | Foto | Real |
| --- | --- | --- |
| `exterior` | `public/portal-hero.jpg` (exterior con piscina, 1.920 px) | ✅ real |
| `salon` | `public/login-bg.jpg` (salón con ventanales, 2.400 px) | ✅ real |
| `medio` | recorte de `login-bg.jpg` (cuadrante inferior derecho, sofá; 1.200 px) | ✅ real (recortada) |
| `oscura` | `login-bg.jpg` oscurecida a propósito (×0,55 en sRGB ≈ −1,7 EV) | ❌ **SIMULADA** |

Las dos únicas fotografías del repositorio son luminosas; el recorte da un ejemplo real de tono medio y la oscura es una **simulación** (no hay ninguna foto oscura real accesible). Todas se prueban como se guardan (WebP 86, ≤ 2.560 px). En capturas y documentación la oscura va rotulada **SIMULADA**.

## Recetas (tono adaptativo por foto, receta v1)

`lib/catalogs/photo-tone.ts` (puro) decide la receta con las medidas de **la propia foto** (muestra de 512 px de lado mayor; luma media, P2/P50/P98, quemados = luma ≥ 250/255):

| Receta | Cuándo | Qué hace |
| --- | --- | --- |
| **luminosa** | media ≥ 0,50, o P98 ≥ 0,97, o quemados ≥ 0,5 % | **No sube el brillo.** Solo un hombro suave por encima de 0,55 con techo en 0,955–0,965: recupera altas luces. Saturación +4 %. |
| **media** | el resto | Contraste en S muy leve (0,12) alrededor de su mediana, techo 0,975. Saturación +3 %. Media ±2 %. |
| **oscura** | media < 0,36 **y** P98 < 0,93 (subexpuesta de verdad) | Abre sombras con f(x) = x + b·x·(1−x)² (el negro sigue negro), con `b` calculado para llevar la media a min(0,40; media + 0,08); techo 0,95 (P98 ≤ 0,95). Saturación +5 %. |

Común a las tres: corrección **ligera** de dominante solo si las superficies casi neutras (paredes, techos, blancos; ≥ 5 % de la foto) se desvían > 6 % del gris: un 30 % de la desviación, ±3 % por canal como mucho, sin cambiar la luma media (un cielo o un mar azules no cuentan). **Autocomprobación**: la receta se ensaya sobre la muestra y, si incumpliera sus límites, se suaviza a la mitad (hasta tres veces) o la foto queda sin cambio. Una foto oscura con ventanas quemadas (contraluz) va como luminosa: no se aclara. Sin nada generativo: curva por canal, ganancias y saturación; mismo píxel → mismo píxel.

**Determinista y versionada**: misma foto → mismos bytes (probado); la receta se decide con el original, así que todos los anchos de una foto llevan la misma; la versión va en la URL (`&t=1`) y en la cabecera (`X-Bcp-Tone: v1/luminosa`).

### Medidas por foto, antes → después (luma 0–1; foto entera)

| Foto | Receta | Media | P98 | Quemados | Dominante (R/G/B) | Contraste del título (modelo, 1440×900 · 390×844) |
| --- | --- | --- | --- | --- | --- | --- |
| exterior (real) | luminosa | 0,664 → **0,656** | 0,957 → **0,929** | 0 % → 0 % | sin corrección | 9,48 → 9,72 · 9,52 → 9,73 |
| salón (real) | luminosa | 0,578 → **0,570** | 0,984 → **0,941** | 2,40 % → **0 %** | 0,985 / 1,001 / 1,029 | 9,45 → 9,75 · 10,21 → 10,43 |
| medio (real, recorte) | media | 0,478 → **0,476** (−0,4 %) | 0,953 → 0,941 | 0,23 % → 0 % | 0,985 / 1,001 / 1,031 | 12,81 → 12,65 · 14,01 → 13,93 |
| oscura (**SIMULADA**) | oscura | 0,316 → **0,396** | 0,537 → **0,612** | 0 % → 0 % | 0,990 / 1,001 / 1,022 | 13,97 → 13,06 · 14,47 → 13,49 |

Contraste del título de portada medido en el peor 5 % del fondo (percentil 95 de la luminancia en la banda del título, crema `#fbf8f3`), con el velo de siempre. Con las fotos claras **sube**; con la oscura simulada baja un poco (abrir sombras aclara el fondo) y sigue en 13:1, el triple de AA. Medido además en Chromium sobre la portada real del lector con las fotos claras: ver «Verificación».

### Peso por foto (KB), variante sin tratar → tratada

| Foto | `w=640` | `w=1080` | `w=1600` | a su tamaño |
| --- | --- | --- | --- | --- |
| exterior | 25 → 25 | 64 → 63 | 117 → 116 | 196 → 183 |
| salón | 51 → 50 | 118 → 117 | 208 → 204 | 456 → 337 |
| medio | 53 → 54 | 110 → 114 | 165 → 161 (1.200 px) | 165 → 161 |
| oscura (simulada) | 33 → 36 | 74 → 81 | 134 → 149 | 294 → 225 |

Como mucho +11 % (la oscura: abrir sombras saca detalle que pesa); las luminosas, igual o menos. «A su tamaño» compara el original guardado con la variante tratada recodificada (WebP 86, o 78 por encima de 2.048 px, la misma escala del proxy). La variante tratada se genera en el proxy una vez por URL y queda en la caché de 24 h del CDN, como las de `?w=`.

## Qué hace

- **Por catálogo, apagado por defecto** (`catalogs.photo_finish`, 0227). En el gestor, pestaña **Diseño**: interruptor «**Acabado fotográfico**» con una línea de explicación. En el panel de fotos de cada vivienda (Contenido), con el acabado activo, cada foto en uso ofrece «**Sin acabado en esta foto**». Las marcas se conservan al apagarlo. Las miniaturas de ese panel se ven tratadas cuando aplica.
- **Variante tratada en el proxy** `/p/[slug]/[idx]` con `&t=1` (combinable con `?w=`): copia tratada, nunca se reescribe el original; misma caché de 24 h; cabeceras `X-Bcp-Variant` (tamaño) y `X-Bcp-Tone` (receta o `fallback`: si el tratamiento fallara se sirve la variante sin tratar, nunca un hueco). La ruta de fotos de las fixtures la honra igual. Sin `t`, el proxy hace exactamente lo de antes (también `Range` y el original en streaming).
- **El acabado viaja en la ruta de la foto**: solo cuando el catálogo lo tiene activo y la foto no está marcada, su ruta lleva `&t=1`. El contrato público **no gana campos**. Así lector, galería, miniaturas, portada, estantería de la HOME, vista previa de Diseño y PDF ven la misma foto.
- **Acabado decorativo contenido**: un filete interior de 1 px, blanco translúcido (portada 28 %, apertura 38 %) e inset uniforme (portada 0,9 em ≈ 2,4 % del ancho; apertura 14 px, 10 px en móvil) en la **foto de apertura** y en la **portada**, encima de la foto y sin eventos: no mueve nada. **Sin** esquinas doradas, sin degradados nuevos y **sin tocar el velo** de la portada. Miniaturas y galería: solo el tono. El filete acompaña a la foto tratada (una apertura o portada marcada «sin acabado» tampoco lo lleva).
- **PDF**: pide las mismas fotos tratadas (misma receta, aplicada tras reducir y antes del JPEG 76) y dibuja el filete equivalente en vectorial en la portada y en las aperturas. Como el hilo de maquetación no recibe rutas ni claves de fotos, la marca «tratada» viaja con la propia foto (`finish`).
- **Instantánea** (0227): con el acabado activo, `fin: true` y, en viviendas con fotos marcadas, `pp.n`; activarlo cambia la huella de los enlaces del catálogo y el vigilante actualiza los lectores abiertos. **Apagado, la instantánea y la huella son idénticas a las de antes de 0227.**

Archivos principales: `lib/catalogs/photo-tone.ts` (nuevo), `photo-variant.ts`, `photo-selection.ts`, `to-public.ts`, `photo-data.ts`, `queries.ts`, `export/generate.ts`, `export/photos.ts`, `lib/pdf/catalog/{document,worker-protocol,render-in-worker,render-worker}.ts`, `app/p/[slug]/[idx]/route.ts`, `app/dev-fixtures/foto/[slug]/[idx]/route.ts`, `components/catalogs/catalog-cover.*`, `components/catalogs/reader/{pages.tsx,reader.module.css}`, `components/admin/catalogs/{catalog-manager.tsx,manager/design-section.tsx,manager/catalog-photos-block.tsx}`, acciones del gestor y fixtures.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| **SQL** · `test-catalog-finish.sql` (56), `test-rollback-0227.sql` (6) y reaplicación (2): photo_finish apagado en todos los catálogos existentes y nuevos, NOT NULL DEFAULT false; desplegar **no cambia** instantánea (byte a byte), huellas del enlace general, del personal, vigilante, medición ni instantánea interna; CHECK; permisos (ni anon ni authenticated; RLS; SECURITY INVOKER); guarda del dueño (otro dueño, staff, nulos); marcar con el acabado **apagado** no cambia instantánea ni huella; activar → `fin` y `pp.n`, cambian las huellas (el otro catálogo no); idempotencia; duplicados por URL; E3 intacto con marcas (exclusión, «última foto»); properties/property_photos intactas; foto borrada (su marca no llega y se limpia); apagar devuelve **exactamente** la instantánea previa y reactivar da la misma huella; borrar el catálogo borra sus marcas; reversión (columna, funciones y marcas fuera; exclusiones E3 conservadas; huella previa) y reaplicación | ✅ 64 |
| **Suite SQL completa** `test-catalogs-core.sh` con la sección nueva (2zg: 0227 dos veces, reversión y reaplicación; 2zh: regresiones de 0226, 0223, 0222, 0220, 0219, 0217, 0218, 0202 y selección con 0227 detrás) | ✅ todos los escenarios en verde |
| **`test:catalogs-finish`** (nuevo en la CI, «Catálogos (acabado fotográfico, offline)»): recetas y límites en las cuatro fotos, determinismo (también con `?w=`), original intacto, peso ≤ +12 %, curva monótona con negro intacto y techo < 250/255, alfa, `fallback`, fotos sintéticas, rutas (`&t=1`, `?w=`, parseo), contrato público idéntico apagado y solo rutas cambiadas encendido, `coverPhotoOf`, fotos del PDF (mismas fotos y anchos; tratadas si y solo si el lector las trata), contraste del título (≥ 4,5:1; no baja con fotos claras), y fuente (proxy, fixtures, CSS del filete, velo intacto, sin dorados, PDF) | ✅ 99 |
| **QA en Chromium** (`fin-qa`, fixtures en 3142, frente a una línea base tomada con el código de `main`): **apagado = idéntico a hoy**: 97/97 cajas (`getBoundingClientRect` de portada, apertura y detalle a 1440×1, 1440×2 y 390×3) y 51/51 URLs de foto (`src` y `srcset`); **encendido**: 97/97 cajas iguales, 51/51 URLs = las de siempre con `&t=1` y la foto marcada sin él (también en miniaturas), filete en portada y apertura (no en detalle ni miniaturas) de 1 px e inset uniforme, sin desbordes a 390, portada servida tratada (`X-Bcp-Tone: v1/luminosa`), retina sigue pidiendo `w=2560` (PR7a) ya tratada; lector abierto: activar cambia la huella y la portada pasa a tratada sin recargar; **contraste del título en el render real** con fotos claras reales: exterior 9,38 → 9,68 (1440) y 9,48 → 9,68 (390); salón 9,34 → 9,65 y 11,23 → 11,39; gestor de prueba: interruptor apagado por defecto, activarlo llega al lector, casillas «Sin acabado en esta foto» en cada foto en uso, apagarlo devuelve las fotos de siempre; **sin errores de consola** | ✅ 30 |
| **PDF real por el hilo** (`scripts/pdf/check-catalog-pdf-finish.mts`, fixtures `main` y `pdf`): **mismas páginas** (12/12, 16/16) y mismo número de fotos (15/15, 20/20); con acabado todas las fotos son otras (tratadas) salvo la marcada, que es idéntica byte a byte; filete vectorial solo con el acabado; peso 356 → 357 KB y 392 → 391 KB | ✅ 10 |
| PDF del catálogo sin acabado (regresión, `scripts/pdf/check-catalog-pdfs.mts`: texto, fotos por su código visual, índice, fuentes, cambios a mitad y 8 idiomas, por el hilo) | ✅ 1.909, 0 respaldos |
| QA anteriores repetidas en esta rama con `BASE` en 3142: idiomas (`lang-qa`, 218), traducciones (`tr-qa`, 58), resolución (`res-qa`, 24), zonas (`area-qa`, 19), plantillas (`tpl-qa`, 29), estructura (`st-qa`, 15), textos aprobados (`copy-qa`, 17), título (`title-qa`, 7), lector (`qa`, 24) y opiniones (`fb-qa`, 23) | ✅ 434, 0 fallos |
| Las 32 suites de la CI una a una (`grep "npm run" ci.yml`, sin `build`), `npx tsc --noEmit` y `python3 scripts/lint-migrations.py` | ✅ |
| `next build` aislado (`NEXT_BUILD_DIR=.next.qa`; servidores parados, `.next` borrado, `.env.production` y `tsconfig.json` apartados y restaurados; el log no carga ningún `.env`; `git status` limpio después) | ✅ «Compiled successfully» |

## Capturas

En [`capturas-pr7b/`](capturas-pr7b/) (JPEG pequeños; en el lector solo fotos **reales** servidas en lugar de las sintéticas de las fixtures, la tratada cuando la URL lleva `t`):

- `tono.jpg`: lámina de tono con las cuatro fotos antes/después y sus medidas; la oscura, rotulada **SIMULADA**.
- `portada-antes.jpg` / `portada-despues.jpg` (1440×900).
- `apertura-antes.jpg` / `apertura-despues.jpg` (1440×900) y `apertura-390-despues.jpg` (390×844).
- `pdf-portada-apertura.jpg`: portada y apertura del PDF sin y con acabado (fotos sintéticas de las fixtures; se ve el filete vectorial).
- `gestor-diseno-acabado.png` y `gestor-fotos-sin-acabado.png`: los dos controles del gestor.

## Efectos de la migración al fusionar

- **Ningún catálogo cambia.** `photo_finish` nace apagado en todos; ninguna instantánea ni huella cambia (probado byte a byte), así que los lectores abiertos no reciben ninguna actualización y los PDF salen igual.
- Las rutas de las fotos de todos los catálogos siguen siendo exactamente las de hoy hasta que alguien active el acabado en uno.
- Al activar el acabado en un catálogo: sus enlaces cambian de huella una vez (los lectores abiertos se actualizan solos), su portada y sus fotos se piden con `&t=1` y el proxy genera y cachea cada variante tratada la primera vez (un reencode por foto y ancho, como las variantes `?w=`).

## Reversión

1. Apagar el acabado en los catálogos que lo tengan (o directamente el paso 2).
2. `rollback-0227.sql` (una transacción): vuelve `catalog_internal_snapshot` a la de 0222, borra las funciones nuevas, las marcas «Sin acabado en esta foto» y la columna `photo_finish`, y devuelve el CHECK de `catalog_photo_prefs` a (`exclude`, `opening`). Las exclusiones y aperturas de E3 se conservan. **Se pierde** qué catálogos lo tenían y qué fotos lo quitaban (la cabecera del archivo dice cómo copiarlo antes).
3. `git revert` del merge. Las variantes tratadas ya cacheadas caducan solas (24 h); ninguna foto original cambió nunca.

## QA en producción (Fabricio)

1. Tras el despliegue, abre cualquier catálogo ya compartido: debe verse **exactamente igual** que antes (en Red, ninguna foto lleva `t=1`).
2. En el gestor, abre un catálogo de prueba → **Diseño**: «Acabado fotográfico» aparece **apagado**. Actívalo.
3. Abre su enlace: misma composición, mismas posiciones y tipografía. En Red, las fotos de `/p/` llevan `&t=1` y la cabecera `X-Bcp-Tone` dice `v1/luminosa`, `v1/media` u `v1/oscura`. Compara a simple vista: las luminosas no se aclaran (altas luces más contenidas), las oscuras abren sombras sin quemar. Hay un filete fino en la portada y en la foto de apertura; ni esquinas ni dorados.
4. Si tenías el lector abierto en otra pestaña al activarlo, debe actualizarse solo.
5. En **Contenido**, abre una vivienda: en «Fotos en este catálogo» marca «Sin acabado en esta foto» en una foto. En el lector esa foto vuelve a la original (sin `t=1`); si es la de apertura, también desaparece su filete.
6. Descarga el PDF: mismo número de páginas que sin acabado, fotos tratadas y el filete en la portada y las aperturas.
7. Mira la estantería de la HOME y la vista previa de Diseño: la portada de ese catálogo sale tratada; la de los demás, igual que siempre.
8. Desactiva el acabado: todo vuelve a ser como en el paso 1. Si algo de la receta no te convence con fotos reales (sobre todo con una foto realmente oscura, que aquí solo se ha podido **simular**), dímelo: los ajustes son números de `photo-tone.ts` y cambiar la receta sube la versión (`t=2`), así que la caché no mezcla recetas.

## Ajustes al plan

Anotados también en `plan.md` (§ PR7b, «Ajustes al implementar el PR7b»):

- Migración **0227** (no 0225). Reutiliza `catalog_photo_prefs` con el tipo `no_finish`; por eso **redefine `catalog_internal_snapshot`** (la de 0222), cuya lectura de ajustes agrupaba todas las filas: ahora filtra por tipo, y `fin`/`pp.n` solo aparecen con el acabado activo.
- El acabado va en la **ruta** de la foto (`&t=<versión>`) y no en un campo nuevo del contrato público; en el PDF, en la propia foto leída.
- Acabado **contenido**: del acabado propuesto se descartan las esquinas doradas, el degradado inferior y la rebaja del velo plano.
- Test nuevo `test:catalogs-finish` en la CI, verificación del PDF `scripts/pdf/check-catalog-pdf-finish.mts` y QA `fin-qa` (en `node_modules/.cache/visual-qa/`, como las anteriores).

## Dudas y obstáculos (DA21: nada se reduce en silencio)

- **Ninguna foto oscura real**: la receta oscura solo se ha probado con una simulación (y en los límites con fotos sintéticas). Es la parte que más conviene mirar en producción (paso 8).
- **Contraste con fotos oscuras**: abrir sombras aclara el fondo de la portada, así que con una foto oscura el contraste del título baja algo (13,97 → 13,06 en la simulada), siempre muy por encima de AA. Con fotos claras —el caso que importa para AA— sube.
- La «dominante» se corrige poco a propósito: los interiores cálidos con luz natural son una elección del fotógrafo y no se neutralizan.
