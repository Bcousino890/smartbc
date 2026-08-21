# CATALOG PROPERTY STORY ENRICHMENT QUEUE — COMPLETE
## Handoff · 2026-08-21 · Engine v4 intacto · SmartLinks públicos intactos

## Ruta
`/{country}/admin/propiedades/story-review` — acceso desde el botón **"Enriquecimiento de stories"** en la cabecera de Propiedades. La pantalla de resolución reutiliza la existente: `/{country}/admin/propiedades/{slug}/story?from=queue&bucket=…`. No se ha creado ningún CMS nuevo.

## Arquitectura
- **`lib/services/story/gate.ts` — implementación ÚNICA del quality gate (16 criterios).** Se extrajo del script de publicación y ahora la consumen los dos: el batch publisher (`scripts/publish-story-batch.mts`) y el panel. No pueden divergir. Es pura y devuelve, además del veredicto, **qué bloque concreto provoca cada fallo** (`blockIds`) — lo que permite señalar al culpable en la UI.
- **`lib/db/queries/story-review.ts`** — construye la cola: evalúa el gate sobre todas las stories en borrador de propiedades activas y agrega contadores. Carga en bloque paginada.
- **UI**: `story-review/page.tsx` (server, permisos) + `queue-client.tsx` (lista + filtros). Patrones del CRM actual: tabla legible, chips de estado, botones obvios. Nada experimental, nada tipo Property Workspace.

## Filtros y contadores
Contadores **siempre derivados de producción** en cada carga (nunca hardcodeados ni cacheados). Estado real al cerrar:

| Bucket | Propiedades |
|---|---:|
| **Todas pendientes** | **517** |
| Bloque corto | 352 |
| Conflicto factual | 343 |
| Pocos capítulos | 28 |
| Pocas fotos | 69 |
| Otros | 181 |

Las categorías **no son excluyentes**: una propiedad con conflicto y bloque corto aparece en ambos filtros (`buckets[]` conserva todos los fallos; `bucket` marca el prioritario). Por eso la suma supera el total.
Filtros secundarios: búsqueda por referencia/título/barrio, venta/alquiler, barrio, y "solo disponibles" (activo por defecto).

## Workflow
Cada fila muestra referencia, título, barrio, operación, disponibilidad, nº de fotos, nº de capítulos narrativos y **el motivo exacto del gate con el bloque y su recuento de palabras**. Al abrir "Resolver":
1. **Veredicto del gate en vivo** en cabecera (verde o lista de bloqueos).
2. Cada bloque señalado lleva su aviso ⚠ con el motivo.
3. Acciones existentes: editar copy (límite 70 palabras), rechazar bloque, aprobar bloque, ver evidencia (claims + frase origen), Ver SmartLink, Publicar story.
4. **Publicar re-ejecuta el quality gate real**; si falla, muestra exactamente qué gate sigue bloqueando. Nunca hay auto-publicación.
5. **Siguiente →** carga la próxima propiedad del mismo filtro (pensado para tandas de 20-30 seguidas).

**Garantías de Engine v4 intactas**: la edición sigue pasando por `updateBlockCopyAction` (techo de 70 palabras); los conflictos siguen bloqueando su bloque; la trazabilidad claim→bloque no se toca; no se ha añadido ninguna vía para introducir claims sin evidencia.

## Permisos y country scope
Mismo contrato que el resto del módulo: `getEffectivePermissions(profile, country)` con recurso `properties` y acción `edit`; sin permiso, redirect a Propiedades. La ruta vive bajo `[country]`, así que el aislamiento por país se mantiene. Trazabilidad reutilizada (`edited_by`/`edited_at`, `reviewed_by`/`reviewed_at`); sin PII nueva.

## QA real (producción)
- **Muestra por bucket**: 5 bloque corto (BC-0909, BC-1189, BC-0559, BC-0656, BC-0749), 3 conflicto (BC-1419, BC-0909, BC-0965), 2 pocos capítulos (BC-0616, BC-1044), 2 pocas fotos (BC-1075…). Todas con su diagnóstico correcto y el bloque culpable identificado.
- **Workflow A · rechazar → verde**: BC-1189 (bloque `building` de 3 palabras) → rechazado → **gate verde** → **publicada** (única publicación de esta QA: `alquiler-de-piso-en-bernabeu-hispanoamerica-rp2c`).
- **Workflow B · editar → verde**: BC-0834 — `living` "Excelente iluminación natural." (3 palabras) → editado con su frase de evidencia (9 palabras); el gate detectó entonces un segundo bloque corto (`building` "Finca clásica.") → editado también → **gate verde**. Demuestra que el gate se recalcula tras cada cambio.
- **Workflow C · sigue bloqueada**: BC-0909 — tras mirar el bloque corto, sigue retenida por conflicto factual + heading vacío, con los tres motivos listados.
- **Inspección de conflictos**: evidencia visible (motivo, claim y frase origen); sin resolución automática ni bulk, como se pidió.
- **Regresiones** ✅: `test:smartlink` 38/38, typography guardrail (252 archivos), portal-links, viewing-collections, client-shortlist, command-center. Build de producción 149/149.

## Incidencia encontrada — reportada, NO corregida
**Falso positivo del validador de conflictos: distancias leídas como superficie.**
El validador interpreta `"a escasos 200 metros del Parque"` o `"parking a menos de 50 metros"` como una superficie de 200/50 m² y la contrasta contra los m² de la ficha → marca conflicto y bloquea el bloque.

- **Alcance medido**: 153 conflictos de m² en el backlog, de los cuales **18 responden a este patrón de distancia** (≈12% de los conflictos de superficie, ≈5% del total de 343).
- **Ejemplos**: BC-1419 ("Parking a 50 metros" vs 427 m²), Ibiza ("200 metros del Parque" vs 125 m²), Quevedo ("100 metros de la Plaza" vs 85 m²).
- **Naturaleza**: sistémico y repetible, no editorial. Es un defecto de la regex de `validate.ts`, que no distingue superficie de distancia.
- **Estado**: **no lo he corregido.** Engine v4 está congelado y la instrucción es detener y reportar antes de tocar código. El arreglo sería acotado (exigir `m²`/`m2`/`metros cuadrados` o descartar cuando la frase lleva preposición de distancia) y obligaría a regenerar solo las ~18 afectadas. **Pendiente de tu decisión.**

## Limitaciones conocidas
1. **Bug corregido durante la implementación** (no en el engine): las consultas `.in()` con más de ~500 UUIDs superaban el límite de URL de PostgREST y devolvían vacío en silencio — la cola mostraba 0. Resuelto con troceado + paginación en `story-review.ts`.
2. La QA se ejecutó contra producción mediante las **mismas funciones que usa la UI** (`getEnrichmentQueue`, `evaluateGate`, acciones de bloque). La verificación visual del panel con sesión de agente sigue pendiente de credenciales, como en QA anteriores.
3. Los buckets "Pocos capítulos" y "Pocas fotos" son informativos: la cola explica que requieren mejor descripción o reportaje fotográfico, sin workflow avanzado (como se pidió).
4. El botón "Siguiente" recalcula la cola completa en cada salto (~1-2 s con 517 filas). Aceptable hoy; si el backlog creciera mucho, convendría cachear la lista por sesión.

# CATALOG PROPERTY STORY ENRICHMENT QUEUE — COMPLETE
