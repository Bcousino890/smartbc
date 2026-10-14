# BCP-01 · Plan de E1 «Lector: correcciones y composición adaptativa»

**Estado: BORRADOR — pendiente de aprobación para ejecutarse.** Este documento no autoriza implementar, instalar, hacer push ni abrir el PR. Decisiones de origen: [enmienda §0](enmienda.md) (D-QA1–D-QA10, aprobadas el 14 de octubre de 2026). Evidencia: [informe](informe.md).

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

Pasos de entorno que **la aprobación de este plan autorizaría** (§5 de `docs/workflow/README.md`). Nada más.

| # | Paso | Comando | Efecto |
| --- | --- | --- | --- |
| P1 | Fijar la base | `git fetch origin` y `git ls-remote origin refs/heads/main` | Red, lectura de GitHub. Si `main` ya no es `11f4bc1`, se anota el SHA nuevo y se comprueba que no toque los archivos de §4 (si los toca, se avisa antes de seguir). |
| P2 | Worktree aislado | `git worktree add -b fabri/bcp-01-e1 /Users/fabriirguez/SMARTBC/wt/bcp-01-e1 <SHA>` | Local. No toca el `main` local, el stash ni otras ramas. |
| P3 | Traer el expediente | `git cherry-pick` de los commits de documentación de `fabri/bcp-01-c2-qa` (informe, enmienda, maquetas y este plan) | Local. Así el PR de E1 lleva su registro de aprobación. |
| P4 | Dependencias | Node 22 (`/opt/homebrew/opt/node@22`) y `npm ci` | **Instalación:** descarga paquetes del registro npm y puede ejecutar sus scripts. Sin dependencias nuevas: el `package-lock.json` no cambia. |
| P5 | Navegador de pruebas | Chromium de Playwright que ya está en la caché local | Si faltara, `npx playwright install chromium` descargaría el navegador. **Se pediría permiso antes.** |
| P6 | Servidor de fixtures | `sh scripts/dev-fixtures.sh` (127.0.0.1:3137) | Local, datos sintéticos. Se niega a arrancar con `.env.local`/`.env.development*`; Supabase apunta a un puerto cerrado. No lee ni copia `.env*`. |
| P7 | Compilación de comprobación | `npm run build` con claves ficticias y `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` | Como la CI. **Puede usar la red** durante el prerender (páginas públicas `/web/*`, servicio público de tipo de cambio). Next carga el `.env.production` **versionado** del repo, igual que la CI; no se abre ni se imprime. |

**No hace falta:** Postgres temporal (E1 no toca SQL), credenciales, VPS, admin ni base de datos de producción, ni IA real. Nada escribe en cachés compartidas ni en fichas.

## 3. Diseño técnico: contratos y propiedad del estado

### 3.1 Contrato público (`lib/catalogs/public-contract.ts`)
Único cambio en `PublicItem`:

```ts
/** E1 · Hasta 4 fotos adicionales elegibles para la ficha breve (índices en
 *  photos, en su orden, sin la de apertura ni las clases excluidas). [] si no aplica. */
mosaic: number[];
```

- Solo se rellena cuando no hay ni texto ni capítulos que mostrar (nivel «solo datos y fotos»).
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
Lo usan `reader-state.ts` (partes, folios, D12) y las páginas. Es determinista: **no depende de mediciones en el navegador**, así que el índice, los folios y D12 son estables entre lectores y tras cada actualización. El encaje real se comprueba con pruebas renderizadas (T7) que calibran sus constantes.

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
   - Se calibran en T7 con el renderizado real y quedan anotados en el resultado.
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
- `itemParts()` pasa a leer `itemLayout()`. `journeyGroups`/`journeyTruncated`/`hasDetail` se sustituyen por la composición; se actualizan sus pruebas.
- `clampPage`, `applyUpdate` (D12), `setLayout`, `pagesOf` y `openingFolio` mantienen su contrato. Al reagrupar tras un cambio en vivo, se queda la parte anterior que exista.

### 3.5 Propiedad del estado en la interfaz
| Estado | Dueño | Notas |
| --- | --- | --- |
| Página actual, galería, aviso D12, composición | `catalog-reader.tsx` (reducer con `reader-state.ts`) | Sin cambios de forma |
| Desplazable / al final | `ScrollRegion` | La señal pasa de superpuesta a **banda propia** (L3) |
| Cargando / cargada / error de cada foto | Nuevo `components/catalogs/reader/reader-image.tsx` (estado local, una clave por `src`) | `onLoad`/`onError` y comprobación de `img.complete` al montar (foto ya en caché antes de hidratar). **Ningún reintento automático**: en error se queda en error. |
| Composición por vivienda | `itemLayout(item)` | Se calcula, no se guarda |

## 4. Tareas (en orden de dependencias)

Cada tarea es un commit. Ninguna se considera hecha sin su verificación en verde.

### T0 · Expediente
- **Archivos:** `qa-c2/*` traídos por cherry-pick (P3).
- **Verificación:** `git log` muestra los commits de documentación sobre la base.
- **Commit:** los de origen, sin cambios.

### T1 · Clases excluidas y mosaico (servidor, puro)
- **Archivos:**
  - `lib/catalogs/editorial.ts` (exclusión en `alternatePhotos`, `mosaic`);
  - `lib/catalogs/public-contract.ts` (`mosaic`);
  - `lib/catalogs/to-public.ts` (pasar `mosaic`);
  - `scripts/test-catalogs-public.mts` (sección «E1 · fotos»).
- **Pruebas:**
  - las tres clases nunca entran en el recorrido de texto ni de limpia y siguen en `photos` (galería);
  - una foto sin clase sí entra;
  - el nivel historia no cambia;
  - mosaico ≤ 4, en orden, sin portada ni clases excluidas, y vacío cuando hay texto;
  - el contrato no gana claves prohibidas (`FORBIDDEN_PUBLIC_KEYS`).
- **Verificación:** `npm run test:catalogs-public`, `npx tsc --noEmit`.

### T2 · Composición del recorrido y partes del lector (puro)
- **Depende de** T1.
- **Archivos:**
  - `lib/catalogs/journey-layout.ts` (nuevo);
  - `lib/catalogs/reader-state.ts`;
  - `scripts/test-catalogs-public.mts`: sección «E1 · composición». Incluye la reproducción [`reproduccion-integridad.mts`](reproduccion-integridad.mts) convertida en prueba, y se adaptan las de Z6 que usaban `journeyGroups`.
- **Pruebas:**
  - **L1** con historias de 6, 7, 8 y 9 capítulos, sin limpia, con limpia distinta y con o sin características: cada capítulo aprobado y seguro es accesible en `spread` (recorrido o detalle) y en `single`;
  - las reglas 1–9 de §3.3;
  - en 300 viviendas aleatorias: orden conservado, cada bloque una vez, como mucho 3 dobles páginas y ninguna página escasa salvo que sea todo el contenido;
  - casos Reforma y Peñalver sintéticos (§3 de la enmienda);
  - folios e índice;
  - D12 desde cada parte;
  - reagrupar tras un cambio en vivo: la entrada crece o encoge, aparece o desaparece una foto, se retira un texto;
  - cambio de composición.
- **Verificación:** `npm run test:catalogs-public`, `npx tsc --noEmit`.

### T3 · Señal en banda propia y letra mínima (CSS)
- **Archivos:**
  - `components/catalogs/reader/scroll-region.tsx` (la señal va en una fila propia bajo la zona desplazable y solo existe si hay más contenido);
  - `components/catalogs/reader/reader.module.css`.
- **Suelos de letra** en doble página, con `max()` sobre el tamaño de cada pieza:
  - recorrido y descripción ≥ 15 px;
  - entrada ≥ 16 px;
  - datos clave ≥ 13 px;
  - auxiliares ≥ 12 px: título corrido, kicker, folio, pie de lámina, enlaces de galería, características, ficha completa e índice.
- **Sin cambios:** la escala de títulos y la composición de una página.
- **Verificación:** `npx tsc --noEmit`. La medición en el navegador va en T7.

### T4 · Estados de las fotos
- **Archivos:**
  - `components/catalogs/reader/reader-image.tsx` (nuevo);
  - `components/catalogs/reader/pages.tsx` (`FramedPhoto`, miniaturas y mosaico);
  - `components/catalogs/reader/gallery.tsx`;
  - `reader.module.css`.
- **Comportamiento:**
  - **cargando:** tono del papel y «Cargando foto…» en marcos grandes; solo el tono en miniaturas. Animación suave solo sin «reducir movimiento» (`prefers-reduced-motion` y `.lowMotion`);
  - **error:** «Foto no disponible» y, en la galería, «Esta foto no se puede mostrar»; las flechas siguen pasando a las demás. Sin reintentos.
- **Verificación:** `npx tsc --noEmit`. Los estados se prueban en el navegador en T7.

### T5 · Fixtures sintéticas de E1
- **Archivos:** `lib/catalogs/fixture-store.ts`, con el token nuevo `fixtureQaToken00000000000010`. Viviendas:
  - (a) tipo Reforma: entrada de 96 palabras y capítulos de 9, 8 y 16 palabras, uno con foto de su clase;
  - (b) tipo Peñalver: 11, 20 y 45 palabras, una foto de clase;
  - (c) historia de 8 capítulos sin limpia ni características;
  - (d) historia de 7 con una limpia distinta;
  - (e) historia de 9 capítulos (un capítulo repetido, solo para probar el límite);
  - (f) descripción limpia con fotos `floor_plan`, `street_context` y `other` delante de una sin clase;
  - (g)–(i) solo datos con 1, 3 y 34 fotos (algunas de clases excluidas);
  - (j) un capítulo más largo que una página.
- **Sin cambios:** las fixtures existentes (`journey`, `journey12`, `journey24`, `one`…). Las de 12 y 24 ya traen un texto de 6.000 caracteres.
- **Verificación:** `npx tsc --noEmit`; el estado público del token nuevo cumple las pruebas de T1 y T2 (comprobación rápida con `fetch`).

### T6 · Páginas del lector con la composición nueva
- **Depende de** T2, T3 y T4.
- **Archivos:** `components/catalogs/reader/pages.tsx` y `components/catalogs/reader/catalog-reader.tsx` (`renderSpread` a partir de `itemLayout`).
  - **Apertura:** con la entrada larga fuera, lleva el enlace «Sigue · La vivienda →».
  - **Recorrido:** dobles páginas `[texto | texto]`, `[foto | texto]` y página de texto compuesta.
  - **Detalle:** «La historia completa» y «Descripción de la ficha».
  - **Ficha breve** en doble página y en una página.
- **Sin cambios:** teclado, deslizar, galería, modo desplazamiento, «reducir movimiento», `data-page-ref`, identificadores de página y avisos.
- **Verificación:** `npx tsc --noEmit`, `npm run test:catalogs-public`, `npm run test:catalogs`.

### T7 · Verificación en el navegador, calibración y regresiones
- **Depende de** T5 y T6.
- **Archivos:** `lib/catalogs/journey-layout.ts`, solo si la calibración ajusta `C_TEXT`/`C_PHOTO`, en el mismo commit y con el motivo.
- **Navegador:** Playwright contra `/dev-fixtures` y el lector (P6), con Chrome sin red externa (proxy a un puerto cerrado), como en C1/C2. Matriz de §6.
- **Regresiones del lector y de la gestión:** fase 2, PR-A, PR-B, índice, enlace, C1, C2 y mediciones 20 × 2 sintéticas de fase 2, C1 y C2. Los cambios de expectativa previstos están en §7; cada uno se justifica en el resultado.
- **Verificación completa:**
  - `npm run test:catalogs-public`, `test:catalogs` y `test:smartlink`;
  - las demás regresiones de la CI (`test:particulares`, `test:idealista`, `test:lead-merge`, `test:zinto-v2`) y `test:viewing-collections`, `test:client-shortlist`, `test:portal-links`;
  - `npx tsc --noEmit`, `npm run build` (P7), `python3 scripts/lint-migrations.py` y `npm run test:typography` (mismas 15 infracciones que la base).

### T8 · Resultado
- **Archivos:**
  - `docs/changes/2026-10-13-bcp-01-home-catalogo/result.md`: sección «E1», con commits, criterios y evidencia, constantes calibradas, cambios de expectativa y lo no demostrado;
  - capturas en `qa-c2/capturas-e1/` (JPEG).
- **Después, solo con la aprobación de este plan:** push de `fabri/bcp-01-e1`, PR con el aviso de posible despliegue y CI en verde en el último commit. **El merge lo hace Fabricio.**

## 5. Criterios de aceptación y su prueba

| Criterio | Cómo se demuestra |
| --- | --- |
| **L1** Ningún capítulo aprobado y seguro sin acceso (6–9 capítulos, sin limpia o con una distinta) en páginas, desplazamiento de escritorio y móvil | T2 (puro) y T7: en el navegador se recogen todos los textos visibles o desplazables de cada vivienda (c, d, e) y se comparan con los capítulos del estado público |
| Prioridad de fuentes, fuente cambiada, privacidad, micro-capítulos y descripción del catálogo íntegra | Pruebas Z3/Z5/Z6 existentes sin cambios de expectativa, más las de T1 y T2 |
| **L2** A 1280 × 720 y 1440 × 900 en doble página: recorrido y descripción ≥ 15 px, entrada ≥ 16 px, datos clave ≥ 13 px, auxiliares ≥ 12 px | T7: `getComputedStyle` sobre cada clase de texto en todas las páginas de `qa`, `journey`, `journey12` y `journey24` |
| **L3** La señal nunca se cruza con un control ni con texto visible | T7: cajas de la señal frente a botones, enlaces y líneas de texto, en la apertura de (a) y en el detalle de 6.000 caracteres |
| **L4** Cargando, error, «reducir movimiento» y sin bucles | T7: retraso de 3 s en las fotos de una vivienda (`page.route`) → «Cargando foto…»; respuesta 404 → «Foto no disponible», galería navegable y **una sola petición** por foto fallida; con `reducedMotion: "reduce"`, `animation-name: none`; sin errores de JS |
| **DQ1** Agrupación y encaje renderizado | T2 (reglas) y T7: en los viewports de L2, ninguna página de recorrido de (a), (b), (c) y `journey` necesita desplazarse salvo el bloque largo (j), que se desplaza con su banda; ninguna página escasa; Reforma → 1 doble página de recorrido |
| **DQ2** Entrada larga íntegra al inicio del recorrido, con enlace | T2 y T7: la entrada de (a) no está en la apertura, aparece entera en j1 y «Sigue · La vivienda →» lleva a j1 |
| **DQ3** Página de texto compuesta, sin foto sustituta | T7: los grupos sin foto de clase no muestran ninguna imagen; composición centrada |
| **DQ4** Clases excluidas fuera del recorrido y dentro de la galería | T1 y T7 con (f) |
| **DQ6** Ficha breve con 1, 3 y 34 fotos y acceso a la galería; nunca «Sin descripción» ni diagnósticos | T7 con (g)–(i), en doble página y en una página; el texto visible no contiene «Sin descripción», «nivel» ni «diagnóstico» |
| Índice, folios, teclado, deslizar, galería y D12 tras reagrupar o con cambios en vivo | T2 (puro) y T7: recorrido completo, D12 desde recorrido y detalle, entrada que se acorta o crece en vivo (operación `text` de las fixtures) |
| Sin desbordes con 1, 12 y 24 viviendas y 6.000 caracteres, a 1280 × 720, 1440 × 900, 362 y 320 px | T7: recorrido de todas las páginas, como en C2 |
| Seguridad entre 900 × 620 y 1280 × 720 (doble página fuera de los viewports aprobados) | T7 a 1024 × 640: nada recortado; lo que no cabe se desplaza con su banda |

## 6. Matriz de navegador (T7)

| Viewport | Fixtures | Comprobaciones |
| --- | --- | --- |
| 1280 × 720, 1440 × 900 | `qa`, `journey`, `journey12`, `journey24`, `one`, `main` | Letra mínima, desbordes, encaje, señal, L1, DQ2–DQ4, DQ6, índice y folios, teclado, galería, modo desplazamiento, «reducir movimiento», D12 en vivo |
| 1024 × 640 | `qa`, `journey24` | Nada recortado; desplazamiento con banda |
| 362, 320 (móvil) | `qa`, `journey`, `journey12`, `journey24`, `one` | Desbordes, L1 en la hoja, ficha breve, plegables, barra que no tapa, deslizar |
| 1280 × 720 con red lenta / 404 | `qa` | L4 |

Las capturas para la QA de Fabricio salen de esta matriz.

## 7. Regresiones: cambios de expectativa previstos

Cambiará el número de páginas en doble página de algunas fixtures, porque cambian la agrupación (DQ1), la entrada larga (DQ2), el detalle de las historias (L1) y la ficha breve (DQ6). Se recalcularán **de forma independiente** desde el estado público con `itemLayout` (como en C2) y se comprobará que el índice dice lo mismo que el contador. Afecta a:
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
| Constantes de capacidad mal calibradas con textos reales | Calibración renderizada en T7 con los casos más largos; el desplazamiento dentro de la página evita recortes; las constantes y su motivo quedan en el resultado |
| Cambio de recuentos que confunda a lectores con el enlace abierto | Igual que en C2: una actualización al desplegar; D12 conserva la vivienda |
| Una foto sin clasificar (mapa o aviso) sigue entrando | Límite aprobado de D-QA4; lo resuelve E3 |
| Estado de imagen con fotos ya en caché antes de hidratar | Comprobación de `img.complete` al montar; prueba con navegación de vuelta a una página ya vista |

## 11. Fase y siguiente paso

- **Fase actual:** decisiones DQ1–DQ8 aprobadas y registradas ([enmienda §0](enmienda.md)). Este plan de E1 está en **borrador, pendiente de aprobación para ejecutarse**. No se ha cambiado la aplicación, no hay push ni PR, y E2/E3/PDF no han empezado.
- **Siguiente paso:** Fabricio aprueba o corrige este plan. Con la aprobación se ejecutan P1–P7 y las tareas T0–T8 en orden; después, push de la rama, PR y CI. El merge, la QA en vivo y D13 los hace Fabricio.
