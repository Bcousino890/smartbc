# BCP-01 · Plan de E1 «Lector: correcciones y composición adaptativa»

**Estado: APROBADO PARA EJECUTARSE (14 de octubre de 2026) con tres correcciones obligatorias**, ya incorporadas: orden de commits en el que cada cambio de API llega con sus consumidores (§4), verificación independiente (§5) y aislamiento del entorno (§2.1). Registro: [enmienda §0, D-QA11](enmienda.md). Decisiones de origen: [enmienda §0](enmienda.md) (D-QA1–D-QA10, aprobadas el 14 de octubre de 2026). Evidencia: [informe](informe.md).

## 1. Alcance

**Entra en E1** (solo el lector público y su derivación; **sin migración**, sin SQL y sin cambiar la huella):

| | Qué | Origen |
| --- | --- | --- |
| L1 | Todos los capítulos aprobados y seguros de una historia, accesibles en escritorio (páginas y desplazamiento) y en móvil | D1 |
| L2 | Tamaños mínimos de letra en doble página | D2 |
| L3 | La señal de desplazamiento ocupa su propio espacio | D3 |
| L4 | Estados de carga y error de las fotos, sin bucles de reintento | D4 |
| DQ1 | Recorrido agrupado por extensión y espacio real, con el encaje comprobado renderizado | D-QA1 |
| DQ2 | Entrada larga fuera de la apertura, íntegra al principio del recorrido y con enlace | D-QA2 |
| DQ3 | Página de texto compuesta cuando no hay foto adecuada | D-QA3 |
| DQ4 | Saltar en el recorrido automático las fotos clasificadas como `floor_plan`, `street_context` u `other` | D-QA4 |
| DQ6 | Ficha breve: datos completos y mosaico de hasta 4 fotos elegibles | D-QA6 |

**No entra:**
- el gestor (E2), y por tanto los diagnósticos de DQ8;
- fotos por catálogo (E3);
- PDF;
- D13 en vivo y QA en dispositivos reales, que sigue haciendo Fabricio.

## 2. Base, rama y preparación del entorno

- **Base:** `origin/main` = `36aff9aab45e8d8479cca46c5a48aaf2f35c4771`, comprobado con `git ls-remote` al empezar. Respecto a `11f4bc1` solo añade un arreglo de particulares que no toca ningún archivo de E1.
- **Rama y worktree:** `fabri/bcp-01-e1` en `/Users/fabriirguez/SMARTBC/wt/bcp-01-e1`. El checkout original y el stash no se tocan.
- **Expediente:** los commits de documentación de `fabri/bcp-01-c2-qa` se trajeron con cherry-pick (T0).
- **Dependencias:** Node 22 y `npm ci` con el `package-lock.json` existente. Sin dependencias nuevas.
- **Navegador:** el Chromium de Playwright ya está en la caché local. Si faltara, se pediría permiso antes de descargarlo.
- **No hace falta:** Postgres, credenciales, VPS, producción ni IA real.

### 2.1 Aislamiento del servidor de fixtures y de la compilación

Next carga solo los `.env*` de la carpeta del proyecto, y el repo versiona `.env.production` y `.env.example`. Por eso el servidor de fixtures y la compilación **no se ejecutan en el worktree**, sino en una copia temporal sin esos archivos y con un entorno mínimo explícito:

1. **Copia aislada** en el scratchpad (`e1-iso/app`):
   - `rsync -a --delete` del worktree **excluyendo** `.git`, `node_modules`, `.next` y cualquier archivo `.env*`, en cualquier carpeta;
   - `node_modules` clonado del worktree con `cp -cR`, una copia APFS sin coste de espacio y sin descargar nada.
   - Ningún archivo `.env*` se abre, se imprime ni se copia.
2. **Entorno mínimo explícito** con `env -i`. Solo estas variables:
   - `PATH` (Node 22 y `/usr/bin:/bin`);
   - `HOME` y `TMPDIR` de una carpeta temporal propia;
   - `NEXT_TELEMETRY_DISABLED=1`;
   - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` (puerto cerrado);
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con valores ficticios;
   - en el servidor, `CATALOG_FIXTURES=1` y `PORT=3137`.

   No se hereda ninguna variable del terminal ni ninguna credencial.
3. **Comprobación antes de arrancar cualquier servidor o compilación**, que se repite tras cada sincronización:
   - (a) `find` sin `.env*` en la copia (fuera de `node_modules`): solo se listan nombres;
   - (b) con el mismo entorno, `node` lista las variables de `process.env`, y solo deben aparecer las permitidas;
   - (c) con el mismo entorno, el propio cargador de Next (`@next/env`, `loadEnvConfig`) se ejecuta sobre la copia para el modo `development` y el `production`, y debe informar de **0 archivos cargados**;
   - (d) el registro del servidor o de la compilación no contiene ninguna línea `Environments:`, que es la que imprime Next cuando carga un `.env`.

   Si alguna comprobación falla, no se arranca nada y se informa.
4. **Red:**
   - el servidor de fixtures solo escucha en `127.0.0.1`;
   - los navegadores de prueba usan un proxy a un puerto cerrado;
   - la compilación puede intentar llamadas públicas durante el prerender (la página `/web` pide un tipo de cambio); las de Supabase van al puerto cerrado;
   - no se conecta a servicios reales de la aplicación.
5. **Pruebas puras** (`npm run test:*`, `tsc`): Node no carga `.env`. También se ejecutan con `env -i` y el mismo entorno mínimo.

## 3. Diseño técnico: contratos y propiedad del estado

### 3.1 Contrato público (`lib/catalogs/public-contract.ts`)
Único cambio en `PublicItem`:

```ts
/** E1 · Hasta 4 fotos adicionales elegibles para la ficha breve (índices en
 *  photos, en su orden, sin la de apertura ni las clases excluidas). [] si no aplica. */
mosaic: number[];
```

- Solo se rellena cuando no hay ni texto ni capítulos que mostrar (nivel «solo datos y fotos»).
- **Literales tipados que hay que actualizar en el mismo commit:** `pubCatalog` de `scripts/test-catalogs-public.mts` y cualquier otro objeto `PublicItem` construido a mano (comprobado con `tsc`).
- No expone clases de foto, niveles ni diagnósticos.
- La instantánea SQL y la huella no cambian.

### 3.2 Derivación editorial (`lib/catalogs/editorial.ts`)
- `JOURNEY_EXCLUDED_CLASSES = ["floor_plan", "street_context", "other"]`.
  - `alternatePhotos` las salta (niveles texto y descripción limpia).
  - En el nivel historia no cambia nada: solo usa clases de capítulo.
  - La clase ya llega filtrada por la regla de confianza: `class_override`, o `ai_class` con `ai_confidence ≥ 0,75`, como hoy en 0197. Una foto sin clase sigue siendo elegible.
- `Editorial.mosaic`: hasta 4 índices elegibles con la misma exclusión, sin la portada.
- **Sin cambios:**
  - la prioridad de fuentes;
  - la vigencia por huella;
  - el filtro de privacidad (`isPublicSafe`, `noContact`);
  - los micro-capítulos que pasan a características;
  - la descripción completa: el texto del catálogo íntegro y la limpia íntegra.

### 3.3 Composición del recorrido (nuevo, puro: `lib/catalogs/journey-layout.ts`)
Lo usan `reader-state.ts` (partes, folios, D12) y las páginas. Es determinista: **no depende de mediciones en el navegador**, así que el índice, los folios y D12 son estables entre lectores y tras cada actualización. El encaje real se comprueba con pruebas renderizadas (T6) que calibran sus constantes.

```ts
export type JourneyBlock =
  | { kind: "intro"; text: string; words: number }                // D-QA2
  | { kind: "section"; index: number; words: number; heading: boolean; photo: number | null };
export interface JourneyPage { blocks: JourneyBlock[]; photo: number | null }
export type JourneySlot = { kind: "photo"; photo: number } | { kind: "text"; page: JourneyPage };
export interface JourneySpread { slots: [JourneySlot] | [JourneySlot, JourneySlot] }
export interface ItemLayout {
  introInOpening: boolean;       // entrada ≤ ~45 palabras
  spreads: JourneySpread[];      // como mucho MAX_JOURNEY_SPREADS (3)
  truncated: boolean;            // queda contenido para el detalle
  detail: { story: boolean; description: boolean; features: boolean } | null;
  brief: boolean;                // ficha breve (D-QA6)
}
export function itemLayout(item: PublicItem): ItemLayout;
```

Reglas, cada una con prueba propia:

1. **Orden y completitud.** Los bloques conservan su orden, ningún bloque se parte y cada bloque aparece **una sola vez** en el recorrido. Lo que no cabe en las 3 dobles páginas va al detalle (L1).
2. **Peso.** Peso de un bloque = palabras + coste de su título. Capacidad de una página de texto = `C_TEXT`, o `C_PHOTO` si la página lleva su foto pequeña.
   - Valores iniciales tomados de las maquetas a 15 px: `C_TEXT ≈ 165` y `C_PHOTO ≈ 100`.
   - Se calibran en T6 con el renderizado real y quedan anotados en el resultado.
3. **Llenado.** Las páginas se llenan en orden. La foto de una página es la primera foto de sus bloques; cada foto se usa una vez.
4. **Nada escaso.** Una página de menos de unas 25 palabras se une a la vecina si cabe. Si no cabe y es todo el contenido, se queda.
5. **Bloque largo.** Un bloque más largo que una página ocupa su página y **se desplaza dentro** de ella (L3). Nada se recorta.
6. **Dobles páginas.** Las páginas se emparejan de dos en dos. Una página suelta:
   - con foto → `[foto grande | texto]`;
   - sin foto → **página de texto compuesta** sola (D-QA3).
7. **Entrada larga.** Más de ~45 palabras: `introInOpening = false` y es el primer bloque del recorrido. La apertura enlaza a él con «Sigue · La vivienda →».
8. **Detalle.** Existe si hay descripción, características o capítulos de historia.
   - Con historia, la página derecha muestra **«La historia completa»**: todas las secciones con su título.
   - Si además hay una descripción limpia vigente, va después como «Descripción de la ficha».
9. **Ficha breve.** Sin texto ni secciones: `brief = true`. La apertura lleva datos completos, características, mosaico y «Ver las N fotos», y **no hay detalle**.

Una página (móvil): una hoja por vivienda como hoy, con el recorrido entero. La ficha breve va con la ficha desplegada y el mosaico.

### 3.4 Estado del lector (`lib/catalogs/reader-state.ts`)
- `ItemPart` sigue siendo `open | j1 | j2 | j3 | detail`.
- `itemParts()` pasa a leer `itemLayout()`. `journeyGroups`/`journeyTruncated`/`hasDetail` desaparecen **en el mismo commit** en el que `catalog-reader.tsx`, `pages.tsx` y las pruebas pasan a usar `itemLayout()` (T4).
- `clampPage`, `applyUpdate` (D12), `setLayout`, `pagesOf` y `openingFolio` mantienen su contrato. Al reagrupar tras un cambio en vivo, se queda la parte anterior que exista.

### 3.5 Propiedad del estado en la interfaz
| Estado | Dueño | Notas |
| --- | --- | --- |
| Página actual, galería, aviso D12, composición | `catalog-reader.tsx` (reducer con `reader-state.ts`) | Sin cambios de forma |
| Desplazable / al final | `ScrollRegion` | La señal pasa de superpuesta a **banda propia** (L3) |
| Cargando / cargada / error de cada foto | Nuevo `components/catalogs/reader/reader-image.tsx` (estado local, una clave por `src`) | `onLoad`/`onError` y comprobación de `img.complete` al montar (foto ya en caché antes de hidratar). **Ningún reintento automático**: en error se queda en error. |
| Composición por vivienda | `itemLayout(item)` | Se calcula, no se guarda |

## 4. Tareas (secuencia revisada, correcta en dependencias)

Cada tarea es un commit que compila y pasa sus pruebas: `npx tsc --noEmit` y `npm run test:catalogs-public`, más lo indicado en cada una. **Un cambio de API llega siempre en el mismo commit que sus consumidores.** Ninguna tarea se da por hecha sin su verificación.

| Tarea | Contenido | Archivos | Depende de | Verificación propia |
| --- | --- | --- | --- | --- |
| **T0** | Expediente y este plan corregido | `qa-c2/*`, `ampliacion-c-enmienda.md`, `result.md` | — | `git log` |
| **T1** | Clases excluidas del recorrido automático y `mosaic` (servidor), con todos sus literales tipados | `lib/catalogs/editorial.ts`, `public-contract.ts`, `to-public.ts`, `scripts/test-catalogs-public.mts` (sección «E1 · fotos» y `mosaic: []` en `pubCatalog`) | T0 | Pruebas con **resultados explícitos**: índices exactos del recorrido y del mosaico en casos escritos a mano; clases sin confianza siguen entrando; la galería conserva todas; sin claves prohibidas |
| **T2** | Señal en banda propia y letra mínima en doble página | `components/catalogs/reader/scroll-region.tsx`, `reader.module.css` | T0 | `tsc`; las medidas se toman en T6 |
| **T3** | Estados de las fotos (marcos, miniaturas, mosaico y galería; caché antes de hidratar; «reducir movimiento»; sin reintentos) | `components/catalogs/reader/reader-image.tsx` (nuevo), `pages.tsx`, `gallery.tsx`, `reader.module.css` | T0 | `tsc`; los estados se prueban en el navegador en T6 |
| **T4** | **Composición y sus consumidores, juntos:** `journey-layout.ts`, partes y D12 en `reader-state.ts`, páginas (apertura con enlace, recorrido, página de texto compuesta, detalle con «La historia completa», ficha breve en doble y una página) y `renderSpread` | `lib/catalogs/journey-layout.ts` (nuevo), `lib/catalogs/reader-state.ts`, `components/catalogs/reader/pages.tsx`, `catalog-reader.tsx`, `reader.module.css`, `scripts/test-catalogs-public.mts` (secciones Z6 adaptadas y «E1 · composición») | T1, T2, T3 | `tsc`, `test:catalogs-public`, `test:catalogs`; pruebas con **partes, folios y D12 explícitos** para viviendas sintéticas escritas a mano; completitud contra los capítulos de origen (§5); invariantes aleatorias como complemento |
| **T5** | Fixtures sintéticas de E1 (token `fixtureQaToken00000000000010`, viviendas a–j de abajo) | `lib/catalogs/fixture-store.ts` | T4 | `tsc`; el estado público del token responde en la copia aislada (§2.1) |
| **T6** | Navegador, calibración y regresiones | `lib/catalogs/journey-layout.ts` (solo si la calibración cambia constantes, con el motivo) | T5 | Matriz de §6; regresiones de §7; suites, `tsc`, compilación aislada, lint de migraciones y tipografía |
| **T7** | Resultado y entrega | `result.md`, `qa-c2/capturas-e1/` | T6 | Push de `fabri/bcp-01-e1`, PR, CI en verde en el último commit |

Fixtures de T5:
- (a) tipo Reforma: entrada de 96 palabras y capítulos de 9, 8 y 16 palabras, uno con foto de su clase;
- (b) tipo Peñalver: 11, 20 y 45 palabras, una foto de clase;
- (c) historia de 8 capítulos sin limpia ni características;
- (d) 7 capítulos con una limpia distinta;
- (e) 9 capítulos (uno repetido, solo para el límite) con un micro-capítulo;
- (f) descripción limpia con fotos `floor_plan`, `street_context` y `other` (corregidas a mano) delante de una sin clase y de otra `other` con confianza 0,6;
- (g)–(i) solo datos con 1, 3 y 34 fotos;
- (j) un capítulo más largo que una página.

**No cambian:** `journey`, `journey12`, `journey24`, `one` y demás.

## 5. Criterios de aceptación y su prueba

**Verificación independiente (corrección 2).** Los números esperados **no** se calculan con `itemLayout`:
- las pruebas puras y las de navegador usan **resultados explícitos escritos a mano** para viviendas representativas: partes de cada vivienda (`open`, `j1`…, `detail`), total de páginas, folios del índice y parte a la que lleva D12;
- la completitud se comprueba **contra los capítulos de origen**: el texto de cada capítulo aprobado y seguro tal como está definido en la fixture, escrito también en la prueba, nunca contra las secciones ya derivadas;
- si la calibración de T6 cambia las constantes, los valores explícitos se recalculan a mano y el cambio se anota en el resultado;
- las comprobaciones aleatorias de invariantes (orden, una vez, como mucho 3 dobles páginas, sin páginas escasas) solo complementan.

| Criterio | Cómo se demuestra |
| --- | --- |
| **L1** Ningún capítulo aprobado y seguro sin acceso (6–9 capítulos, sin limpia o con una distinta) en páginas, desplazamiento de escritorio y móvil | T4 (puro) y T6: en el navegador se recogen todos los textos visibles o desplazables de cada vivienda (c, d, e) y se comparan con los capítulos del estado público |
| Prioridad de fuentes, fuente cambiada, privacidad, micro-capítulos y descripción del catálogo íntegra | Pruebas Z3/Z5/Z6 existentes sin cambios de expectativa, más las de T1 y T4 |
| **L2** A 1280 × 720 y 1440 × 900 en doble página: recorrido y descripción ≥ 15 px, entrada ≥ 16 px, datos clave ≥ 13 px, auxiliares ≥ 12 px | T6: `getComputedStyle` sobre cada clase de texto en todas las páginas de `qa`, `journey`, `journey12` y `journey24` |
| **L3** La señal nunca se cruza con un control ni con texto visible | T6: cajas de la señal frente a botones, enlaces y líneas de texto, en la apertura de (a) y en el detalle de 6.000 caracteres |
| **L4** Cargando, error, «reducir movimiento» y sin bucles | T6: retraso de 3 s en las fotos de una vivienda (`page.route`) → «Cargando foto…»; respuesta 404 → «Foto no disponible», galería navegable y **una sola petición** por foto fallida; con `reducedMotion: "reduce"`, `animation-name: none`; sin errores de JS |
| **DQ1** Agrupación y encaje renderizado | T4 (reglas) y T6: en los viewports de L2, ninguna página de recorrido de (a), (b), (c) y `journey` necesita desplazarse salvo el bloque largo (j), que se desplaza con su banda; ninguna página escasa; Reforma → 1 doble página de recorrido |
| **DQ2** Entrada larga íntegra al inicio del recorrido, con enlace | T4 y T6: la entrada de (a) no está en la apertura, aparece entera en j1 y «Sigue · La vivienda →» lleva a j1 |
| **DQ3** Página de texto compuesta, sin foto sustituta | T6: los grupos sin foto de clase no muestran ninguna imagen; composición centrada |
| **DQ4** Clases excluidas fuera del recorrido y dentro de la galería | T1 y T6 con (f) |
| **DQ6** Ficha breve con 1, 3 y 34 fotos y acceso a la galería; nunca «Sin descripción» ni diagnósticos | T6 con (g)–(i), en doble página y en una página; el texto visible no contiene «Sin descripción», «nivel» ni «diagnóstico» |
| Índice, folios, teclado, deslizar, galería y D12 tras reagrupar o con cambios en vivo | T4 (puro) y T6: recorrido completo, D12 desde recorrido y detalle, entrada que se acorta o crece en vivo (operación `text` de las fixtures) |
| Sin desbordes con 1, 12 y 24 viviendas y 6.000 caracteres, a 1280 × 720, 1440 × 900, 362 y 320 px | T6: recorrido de todas las páginas, como en C2 |
| Seguridad entre 900 × 620 y 1280 × 720 (doble página fuera de los viewports aprobados) | T6 a 1024 × 640: nada recortado; lo que no cabe se desplaza con su banda |

## 6. Matriz de navegador (T6)

| Viewport | Fixtures | Comprobaciones |
| --- | --- | --- |
| 1280 × 720, 1440 × 900 | `qa`, `journey`, `journey12`, `journey24`, `one`, `main` | Letra mínima, desbordes, encaje, señal, L1, DQ2–DQ4, DQ6, índice y folios, teclado, galería, modo desplazamiento, «reducir movimiento», D12 en vivo |
| 1024 × 640 | `qa`, `journey24` | Nada recortado; desplazamiento con banda |
| 362, 320 (móvil) | `qa`, `journey`, `journey12`, `journey24`, `one` | Desbordes, L1 en la hoja, ficha breve, plegables, barra que no tapa, deslizar |
| 1280 × 720 con red lenta / 404 | `qa` | L4 |

Las capturas para la QA de Fabricio salen de esta matriz.

## 7. Regresiones: cambios de expectativa previstos

Cambiará el número de páginas en doble página de algunas fixtures, porque cambian la agrupación (DQ1), la entrada larga (DQ2), el detalle de las historias (L1) y la ficha breve (DQ6). Los valores nuevos se calculan **a mano** desde las reglas de §3.3 y el contenido de cada fixture (no con `itemLayout`), se escriben de forma explícita en la prueba y se comprueba además que el índice dice lo mismo que el contador. Afecta a:
- el lector de fase 2, PR-A y C2, en sus recuentos y folios;
- C2, en las pruebas que buscaban `j3` o el enlace «Sigue en la descripción completa».

Ninguna regresión se debilita: cada número o selector cambiado se lista en el resultado con su motivo. En una página, los recuentos no deberían cambiar; si cambian, se explica.

## 8. Decisiones de implementación (las toma Claude y quedan anotadas)

- La composición es **determinista y pura**: el índice y D12 no pueden depender de mediciones del navegador de cada lector. El «espacio real» se respeta calibrando sus constantes con renderizado real y dejando el desplazamiento dentro de la página como red de seguridad.
- Se mantienen 3 dobles páginas de recorrido como máximo: lo demás está entero en el detalle. No se promete un número fijo de páginas.
- `mosaic` se calcula en el servidor porque el contrato público no lleva clases de foto (privacidad de C2).
- No se toca SQL: la clase de foto ya llega al servidor con la regla de confianza desde 0197.

## 9. Recuperación

- E1 es solo código: sin migración, sin cambios de datos y sin cambio de huella. Fusionar el PR puede desplegar (como cualquier merge a `main`).
- **Revertir:** `git revert` del merge en una rama y PR, que fusiona Fabricio. Vuelve el lector de C2 tal cual. No se pierde ningún dato. El campo `mosaic` deja de enviarse y el lector anterior no lo usa.
- **Lectores abiertos durante el despliegue:** siguen con su versión hasta recargar. Los campos de más en el contrato no les afectan.

## 10. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Constantes de capacidad mal calibradas con textos reales | Calibración renderizada en T6 con los casos más largos; el desplazamiento dentro de la página evita recortes; las constantes y su motivo quedan en el resultado |
| Cambio de recuentos que confunda a lectores con el enlace abierto | Igual que en C2: una actualización al desplegar; D12 conserva la vivienda |
| Una foto sin clasificar (mapa o aviso) sigue entrando | Límite aprobado de D-QA4; lo resuelve E3 |
| Estado de imagen con fotos ya en caché antes de hidratar | Comprobación de `img.complete` al montar; prueba con navegación de vuelta a una página ya vista |

## 11. Fase y siguiente paso

- **Fase actual:** E1 aprobado para ejecutarse; implementación en curso según §4.
- **Siguiente paso:** al terminar T7, revisión del PR por Fabricio, merge (suyo), QA en vivo y D13. E2, E3 y PDF no empiezan.
