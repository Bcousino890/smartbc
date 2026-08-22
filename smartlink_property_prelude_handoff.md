# SMARTLINK 2.0 — PROPERTY PRELUDE · HANDOFF (v2 · EDITORIAL OPENING SPREAD)

Fecha: 2026-08-22 · Estado: desplegado en producción y verificado contra
páginas reales.

El Prelude es la apertura editorial del SmartLink, entre Identity/Key Facts y
los capítulos de la Property Story. Responde a "¿qué vivienda estoy a punto de
descubrir?". El Engine v4.1 sigue **congelado**: el Prelude es una capa
independiente que compone sobre evidencia que el engine ya produjo.

**v1 → v2**: la v1 era un párrafo suelto de 45-90 palabras. La v2 es una
**banda editorial completa** con titular propio, y el contenido cambió con
ella (más largo, en dos párrafos, con los años en cifra y sin recorrer la
casa). Todo el catálogo se regeneró: no queda ni un texto v1 en público.

---

## 1. El bug que sigue mandando sobre el contrato

BC-1420, publicado como ALQUILER, mostraba "se vende sin amueblar". La frase
no estaba ni en la descripción ni en ningún claim — la fabricó el compose del
engine, y ningún chequeo la cazó porque los verbos de operación no son
"entidades". Auditoría completa: 2 casos públicos (BC-1420, BC-1410),
corregidos a nivel de datos.

> **OPERATION CONTRADICTIONS PUBLIC: 0** — verificado por SQL sobre todo el
> catálogo activo, también tras la regeneración v2.

Codificado como regla dura del contrato y como test de regresión.

## 2. Composición visual (§1, §8, §9)

Banda de ~1136px sin card, sin borde, sin sombra, sobre el mismo lienzo ivory:

```
LA RESIDENCIA                    Este piso de 1924 en Almagro se presenta
                                 con la elegancia clásica de su época…
ELEGANCIA DE 1924
EN LA PLAZA DE                   La distribución actual se articula en
ALONSO MARTÍNEZ                  torno a un amplio salón de tres ambientes…
```

- **Izquierda 36%**: eyebrow `LA RESIDENCIA` (Lato 12px, tracking, oro) +
  titular en el stack de display (Optima, 400, versal, 1.65rem móvil →
  2.3rem en desktop). Es la voz tipográfica de la casa, no una nueva.
- **Derecha 64%**, medida de lectura ≤720px, cuerpo 1.1rem móvil / 1.22rem
  desktop con interlineado 1.8-1.85, dos párrafos con aire entre ellos.
- **Móvil**: stack vertical, mismo orden.
- Respiración extra bajo la banda (`padding-bottom: 2.5rem` en desktop) para
  separarla del capítulo 01 sin meter divisores gráficos.
- Con Prelude, el `overview` **calla** (§17 de la v1): nunca conviven.

Ficheros: [public-property-view.tsx](app/compartir/[slug]/public-property-view.tsx) (bloque `bcp-prelude-spread`)
y [globals.css](app/globals.css) (`.bcp-prelude-spread`, `.bcp-prelude-headline`, `.bcp-prelude`).

## 3. Contrato de contenido — [lib/services/story/prelude.ts](lib/services/story/prelude.ts)

`validatePrelude` y `validatePreludeHeadline` son **puros** (sin red ni BD) y
fail-closed: lo que no pasa, no se guarda ni se aprueba.

**Cuerpo (§3, §4)**: 70-110 palabras objetivo (máx 120, mínimo duro 55), 3-6
frases, 1-2 párrafos — y si pasa de 90 palabras, obligatoriamente 2, porque a
esa longitud un bloque único vuelve a ser el párrafo suelto que este sprint
eliminó. Máximo **3 estancias distintas** nombradas: el recorrido casa por
casa es trabajo de los capítulos.

**Titular (§2)**: 4-10 palabras, sin punto final, específico de ESTA vivienda
y salido de la evidencia. Rechaza eslóganes de catálogo ("Una vivienda
única"). Si el modelo no produce un titular válido, se reintenta; nunca se
inventa uno genérico.

**Cifras (§6, §7)**: los **años van en cifra** ("1945") y **deben aparecer
literalmente en la evidencia** — permitir dígitos abre la puerta a
fabricarlos, y una fecha inventada es un error factual, no de estilo.
Cualquier otro número está prohibido (es un Key Fact impreso justo encima), y
también su versión en letra: "tres dormitorios", "una quinta planta".

**Alto riesgo, prohibido**: operación contraria (ambas en operación dual),
amueblado, precio/renta/fianza/coste/gastos, certificación energética,
disponibilidad, inventario de electrodomésticos, frases de portal.

**Léxico vacío (§5)**: adjetivos de relumbrón (exclusiva, espectacular,
única, lujo, selecta…) y colocaciones sin información ("distribución
elegante", "espacios excepcionales", "materiales de alta calidad", "calidad
de vida", "los mejores acabados"). Se veta la colocación, no el adjetivo
suelto: "luminosidad excepcional" informa, "espacios excepcionales" no.

**Entidades**: reutiliza `unsupportedEntities` del engine — todo nombre propio
debe existir en la evidencia.

## 4. Evidencia y composición

- `collectPreludeEvidence(claims)`: solo claims **sin conflicto, sin
  duplicado, sin boilerplate y sin barrio**. Los `claimIds` usados quedan en
  `prelude_evidence`.
- `MIN_EVIDENCE_CLAIMS = 4` y capítulos narrativos vivos; por debajo, sin
  Prelude.
- **La evidencia se entrega separada** en `preludeUserPrompt`: "CARÁCTER DE LA
  VIVIENDA (construye el texto con esto)" frente a "ESTANCIAS (contexto, no
  las enumeres)". El engine produce claims ordenados por estancia, y
  entregarlos en bruto hacía que el modelo escribiera inventarios: pasó en 96
  fichas del primer rollout. Separarlos recuperó la mayoría.
- `composePrelude` ([prelude-compose.ts](lib/services/story/prelude-compose.ts)) centraliza el bucle de 4
  intentos con feedback del fallo concreto, para que el panel de admin y el
  generador en lote se comporten igual, incluido el fail-closed.

## 5. Persistencia y proyección

- **0150**: `prelude`, `prelude_status`, `prelude_evidence`,
  `prelude_generated_at`. **0151**: `prelude_headline`.
- [story.ts](lib/db/queries/story.ts): `prelude` y `preludeHeadline` se proyectan solo con
  `prelude_status='approved'` **y** bloques visibles. En facts-led acompañan a
  capítulos limpios; **nunca** convierten un facts-led sin capítulos en story.

## 6. Workflow de admin

Panel en la review de story: ver / editar (titular + cuerpo, validados en el
servidor) / aprobar / rechazar / regenerar. Aprobar **re-valida** cuerpo y
titular: un texto que dejó de cumplir no se puede publicar.

## 7. Generador en lote — [scripts/generate-preludes.mts](scripts/generate-preludes.mts)

```
node scripts/preludes.bundle.cjs [pilot|all|sweep] [--slugs=a,b] [--refresh] [--approve] [--confirm]
```
- Sin `--confirm` es **dry-run**.
- `--refresh` es **idempotente**: revalida lo aprobado contra el contrato
  vigente y solo gasta una llamada si falla. Por eso se puede pasar varias
  veces sin re-tirar los dados sobre textos ya buenos.
- `sweep` **no llama a la IA**: revalida los aprobados y baja a `rejected` los
  que ya no cumplen. Es lo que garantiza que ningún texto de una versión
  anterior del contrato siga en público por inercia.

## 8. Piloto y rollout

**Piloto dirigido de 12** (3 period, 3 contemporary, 2 chalets, 2 sparse +
BC-1420 + el caso de Chamberí), con capturas reales. Reveló tres cosas:

1. el modelo **recorre la casa** si no se le pone un contraejemplo delante;
2. `"un dormitorio"` es **artículo**, no cuenta — la regla de cifras en letra
   rechazaba frases perfectamente correctas (falso positivo corregido);
3. la **planta** se colaba en cuerpo y titular, y es un Key Fact impreso justo
   encima.

Con eso se endureció el prompt (dos anti-ejemplos explícitos), el contrato
(planta, "de primer nivel", "los mejores acabados", "lista para ser
habitada", "selecta") y la entrega de evidencia (§4).

**Rollout**: 5 pasadas idempotentes sobre las 676 versiones candidatas
(434 → +118 → +56 → +28 → +14) y un `sweep` final que retiró 18 textos v1 que
ya no cumplían. Cada pasada solo tocó lo que fallaba.

## 9. Cifras finales

| Métrica | Valor |
|---|---|
| Propiedades ACTIVAS | 679 |
| Con versión de story (candidatas) | 676 |
| **CON PRELUDE EDITORIAL v2 APROBADO** | **653** |
| Sin prelude — evidencia insuficiente | 2 |
| Sin prelude — contrato fail-closed | 21 |
| Con titular editorial | 653 / 653 |
| Con dos párrafos | 653 / 653 |
| Con año en letra (estilo v1) | **0** |
| OPERATION CONTRADICTIONS PUBLIC | **0** |
| PRELUDE CLAIM CONFLICTS PUBLIC | **0** |

Distribución por estado (con prelude / total): COMPLETE 251/262 ·
PARTIAL 217/224 · SPARSE 103/107 · FACTS-LED 82/83.

Cobertura por encima de la v1 (610) **con un contrato mucho más estricto**.

## 10. QA ejecutado

- **Contrato**: 34 comprobaciones en [scripts/test-smartlink-story.mts](scripts/test-smartlink-story.mts)
  (BC-1420, dual, año en letra, año inventado, planta, enumeración, copy
  genérico, párrafos, titular ×6, parser, lecciones del piloto v1).
  `npm run test:smartlink` ✅ · `tsc --noEmit` ✅ · `next build` ✅.
- **QA real 20/20** páginas de producción: spread renderizado, titular
  presente, dos párrafos, cuerpo dentro de rango, cero cifras que no sean
  año, cero operación cruzada, cero mención de planta; las dos de control sin
  prelude no muestran nada.
- **QA visual 18 capturas** (1440 / 390 / 125%) sobre Chamberí, BC-1420, una
  contemporánea, una SPARSE, una de época y un chalet.
  *"¿Parece el prólogo editorial de una residencia o un párrafo de
  descripción?"* → prólogo, en los seis casos y en las tres vistas.

## 11. Limitaciones conocidas

- Los **21 fail-closed** son propiedades cuya evidencia segura es casi solo
  inventario de estancias: no hay material para una apertura de carácter sin
  inventar. Camino: mejorar la descripción origen, o escribir el Prelude a
  mano en el panel (se valida igual).
- Los **2 insuficientes** tienen menos de 4 claims seguros.
- El contrato es léxico, no semántico: una paráfrasis creativa de un concepto
  prohibido podría colarse. La barrera real es el prompt + la revisión humana;
  el contrato caza las clases de fallo ya observadas.
- La generación es estocástica: una pasada puede fallar donde la anterior
  acertó. Por eso `--refresh` es idempotente — nunca degrada un texto bueno.
- Sin analytics nuevos: el Prelude no añade eventos ni columnas de tracking.

# PROPERTY PRELUDE — PREMIUM EDITORIAL BASELINE
