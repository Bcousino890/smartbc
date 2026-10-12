# Expedientes de cambio

Esta carpeta guarda el registro de las tareas que siguen el flujo voluntario de
Fabricio ([docs/workflow/README.md](../workflow/README.md)). Un expediente
recoge qué se pidió, qué se decidió, cómo se planificó y qué se comprobó. Es la
única fuente de verdad de la tarea: no se duplica en tickets, memorias ni otros
documentos.

## Qué expediente lleva cada tamaño

| Tamaño | Registro | Dónde |
| --- | --- | --- |
| Pequeño | Sin carpeta. La descripción del PR recoge **Propósito**, **Cambio** y **Verificación**. | El PR |
| Medio | Un solo `change.md` con tres secciones: Especificación, Plan y Resultado. | `docs/changes/AAAA-MM-DD-nombre/change.md` |
| Grande o sensible | Tres archivos: `spec.md`, `plan.md` y `result.md`. | `docs/changes/AAAA-MM-DD-nombre/` |

El tamaño lo propone Claude y lo confirma Fabricio (ver la sección «Tamaños y
fases» de [docs/workflow/README.md](../workflow/README.md)). Todos los tamaños
trabajan en una rama propia y entran por PR.

## Nombre de la carpeta

`AAAA-MM-DD-nombre`, con la fecha en que empieza la implementación y un nombre
corto en minúsculas con guiones. Ejemplo: `2026-10-13-bcp-00a-workflow`.

La propia carpeta hace de índice: no se mantiene una lista aparte.

## Plantillas

Están en [plantillas/](plantillas/):

- [change.md](plantillas/change.md): tareas medianas.
- [spec.md](plantillas/spec.md), [plan.md](plantillas/plan.md) y
  [result.md](plantillas/result.md): tareas grandes o sensibles.

Se copian a la carpeta de la tarea y se rellenan los huecos marcados como
`<…>`. Cada encabezado explica qué va debajo; esa explicación se sustituye por
el contenido real.

## Reglas del expediente

- **Decisiones.** Cada decisión de Fabricio sobre producto, alcance,
  arquitectura o datos se anota como `D1`, `D2`… con su fecha y sus palabras o
  un resumen fiel. No se reabren las decisiones ya anotadas.
- **Aprobaciones.** Se anota qué se aprobó, cuándo y con qué palabras.
  Aprobar la especificación permite preparar el plan; implementar requiere un
  plan aprobado.
- **Cambios de alcance.** Si aparece una decisión nueva o una suposición del
  plan resulta falsa, se actualiza el expediente antes de seguir con esa parte.
- **Resultado.** Se anota lo que de verdad se ejecutó, con su comando y su
  salida. Lo que no se pudo demostrar se dice con su motivo y su riesgo; no se
  presenta como hecho.
- **Se conserva** después del merge.
