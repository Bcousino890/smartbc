# SMARTLINK 2.0 — PROPERTY PRELUDE · HANDOFF

Fecha: 2026-08-22 · Estado: desplegado en producción (dfb4ae9) y verificado
contra páginas reales.

El Prelude es la apertura editorial del SmartLink: 2-3 frases que responden
"¿qué vivienda estoy a punto de descubrir?" justo después de Identity/Key
Facts. Es el comienzo de un libro, no el resumen de una ficha. El Engine v4.1
sigue **congelado**: el Prelude es una capa independiente que compone sobre
evidencia que el engine ya produjo.

---

## 1. El bug que mandó sobre el diseño (§7)

BC-1420, publicado como ALQUILER, mostraba "se vende sin amueblar". Trazado:
la frase no existía ni en la descripción ni en ningún claim — la fabricó el
compose del engine, y ningún chequeo la cazó porque los verbos de operación no
son "entidades". Auditoría de catálogo completo: exactamente **2 casos
públicos** (BC-1420 y BC-1410). Corrección a nivel de datos (bloques →
`conflict`, con nota en la versión), sin tocar el engine congelado:

> **OPERATION CONTRADICTIONS PUBLIC: 0** (verificado por SQL sobre todo el
> catálogo activo tras la corrección).

La lección quedó codificada como regla dura del contrato del Prelude y como
test de regresión ("REGRESIÓN BC-1420: 'se vende' en un alquiler → rechazado").

## 2. Contrato de contenido — [lib/services/story/prelude.ts](lib/services/story/prelude.ts)

`validatePrelude(text, ctx, evidenceTexts)` es **puro** (sin red ni BD) y
fail-closed: lo que no pasa, no se guarda.

- **Longitud**: 45-90 palabras objetivo, mínimo duro 30, 2-3 frases.
- **Cero cifras** (`/\d/`): elimina de raíz la clase entera de conflictos
  numéricos (m², planta, año, precio, consumo). La época se dice con palabras.
- **Operación (regla BC-1420)**: palabras de venta prohibidas en alquiler,
  de alquiler prohibidas en venta, **ambas** prohibidas en operación dual.
- **Alto riesgo estructurado, prohibido**: amueblado, precio/renta/fianza/
  coste/gastos, certificación energética, disponibilidad. "Structured
  property data wins": esos datos ya tienen su sitio en Key Facts/Detalles.
- **Lecciones del piloto** (ver §5): inventario de electrodomésticos
  (BC-1376), "coste de mantenimiento" (BC-0056), frases de portal tipo
  "listo para entrar a vivir" / "equipamiento completo" (BC-0917).
- **Adjetivos de portal vetados**: exclusiva, espectacular, impresionante,
  única, lujo, privilegiada, joya, oportunidad, soñada, increíble, inmejorable.
- **Entidades con respaldo**: reutiliza `unsupportedEntities` del engine (se
  importa, no se reescribe) — todo nombre propio debe existir en la evidencia.

## 3. Evidencia y composición

- `collectPreludeEvidence(claims)`: solo claims **sin conflicto, sin
  duplicado, sin boilerplate y sin barrio** (el marketing de zona no describe
  la vivienda). Guarda los `claimIds` usados en `prelude_evidence` —
  trazabilidad de cada afirmación.
- `MIN_EVIDENCE_CLAIMS = 4`: por debajo, la propiedad queda **sin Prelude**
  (mejor ninguno que uno inflado).
- Generación vía `aiComplete` con `preludeSystemPrompt` (COMPONER, no
  inventar) + `preludeUserPrompt` (los facts como única fuente). 3 intentos
  con feedback del fallo concreto; si el tercero incumple, sin Prelude.
- Además exige **capítulos narrativos visibles**: sin narrativa que abrir,
  no hay "libro" que empezar.

## 4. Persistencia y proyección pública

- **Migración 0150**: `property_story_versions` gana `prelude`,
  `prelude_status` (CHECK generated/approved/rejected), `prelude_evidence`
  jsonb y `prelude_generated_at`.
- **[lib/db/queries/story.ts](lib/db/queries/story.ts)**: `PublicStoryExperience.prelude` solo se
  proyecta si `prelude_status='approved'` **y** hay bloques proyectados. En
  facts-led acompaña a capítulos limpios visibles y **jamás convierte un
  facts-led sin capítulos en story**.
- **Relación con el overview (§17)**: el renderer
  ([public-property-view.tsx](app/compartir/[slug]/public-property-view.tsx)) muestra el Prelude y
  **calla el overview** — nunca los dos. Overview = capa de evidencia/admin;
  Prelude = presentación editorial pública.

## 5. Piloto controlado → rollout (§19)

1. **Piloto 5+5+5+5** (COMPLETE/PARTIAL/SPARSE/FACTS-LED) con status
   `generated`: 12 ok / 8 rechazos de contrato.
2. **Revisión editorial humana de los 12**: tres defectos de tono que el
   contrato v1 no cazaba (inventario de electrodomésticos, "coste de
   mantenimiento", "equipamiento completo… lista para habitar").
3. Contrato **endurecido** con esas tres lecciones + 3 tests de regresión;
   intentos 2→3; prompt actualizado; piloto borrado.
4. **Rollout uniforme** con el contrato final: `all --confirm --approve`
   (532) + segunda pasada (78) = **610 aprobados**.

Generador: [scripts/generate-preludes.mts](scripts/generate-preludes.mts) (bundle CJS en el VPS).
Guardrail: sin `--confirm` es dry-run; `--approve` solo para el rollout
posvalidación. Nunca guarda un texto que no pase el contrato.

## 6. Workflow de admin

Panel compacto en la review de story
([story-client.tsx](app/[country]/(admin)/admin/propiedades/[slug]/story/story-client.tsx)):
ver / editar (el server valida el contrato otra vez) / aprobar / rechazar /
generar-regenerar (3 intentos con feedback). Acciones en
[actions.ts](app/[country]/(admin)/admin/propiedades/[slug]/story/actions.ts):
`updatePreludeAction`, `setPreludeStatusAction`, `regeneratePreludeAction`.
Aprobar re-valida: un texto que dejó de cumplir no se puede aprobar.

## 7. Diseño visual

Sin card, sin borde, sin heading: solo texto grande y sereno.
`.bcp-prelude` en [globals.css](app/globals.css): 1.22rem/1.85 (md:
1.32rem/1.9), contenedor `max-w-[50rem]` centrado. El objetivo del QA visual
fue literal: *"¿parece que estoy empezando a descubrir una residencia o
leyendo una ficha de Idealista?"* — respuesta: residencia, en los 5 estados.

## 8. QA ejecutado

- **Contrato**: 16 tests en [scripts/test-smartlink-story.mts](scripts/test-smartlink-story.mts)
  (BC-1420, dual, piloto ×3, evidencia, umbral). `npm run test:smartlink` ✅.
- **QA real 20/20 páginas de producción** (aleatorias, venta+alquiler+2 sin
  prelude): el prelude renderiza, cero cifras, cero operación cruzada, los
  sin-prelude no muestran nada.
- **QA visual 15 capturas** (1440 / 390 / 125%) sobre COMPLETE, PARTIAL,
  SPARSE, FACTS-LED y BC-1420 específicamente.
- **SQL de seguridad final**: 0 preludes con palabra de operación contraria,
  0 con cifras, 0 conflict claims públicos.

## 9. Cifras finales (§24)

| Métrica | Valor |
|---|---|
| Propiedades ACTIVAS | 679 |
| CON PRELUDE EDITORIAL APROBADO | **610** |
| Sin prelude — evidencia insuficiente | 2 |
| Sin prelude — contrato fail-closed (3 intentos) | 65 |
| Sin versión de story | 2 |
| OPERATION CONTRADICTIONS PUBLIC | **0** |
| PRELUDE CLAIM CONFLICTS PUBLIC | **0** |

Distribución por estado de experiencia (con prelude / total del estado):
COMPLETE 239/263 · PARTIAL 207/225 · SPARSE 96/107 · FACTS-LED 68/82.

## 10. Limitaciones conocidas

- Los **65 fail-closed** son deliberados: su evidencia empuja al modelo hacia
  léxico prohibido y 3 intentos no bastaron. Camino: mejorar la descripción
  origen o escribir el prelude a mano en el panel (el contrato valida igual).
- Los **2 insuficientes** tienen <4 claims seguros: primero mejorar la ficha.
- El contrato es léxico, no semántico: una paráfrasis creativa de un concepto
  prohibido podría colarse. La barrera real es el prompt + revisión humana
  del panel; el contrato caza las clases de fallo ya observadas.
- Sin analytics nuevos (§23): el prelude no añade eventos ni columnas de
  tracking.

# PROPERTY PRELUDE — PREMIUM EDITORIAL BASELINE
