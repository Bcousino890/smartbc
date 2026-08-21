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

## AREA VS DISTANCE VALIDATION FIX — ENGINE V4.1
*(Aplicado 2026-08-21 tras autorización expresa. Único cambio del motor; el resto de v4 sigue congelado.)*

**Bug.** El validador marcaba conflicto de superficie comparando contra `square_meters` cifras que no eran superficie: `"a escasos 200 metros del Parque"`, `"parking a menos de 50 metros"` y también alturas de techo (`"techos de 2,73 metros"` → leído como 73 m²).

**Causa.** La detección usaba `(\d{2,4})\s*metros`, que casa cualquier "N metros" sin distinguir área, distancia ni altura.

**Fix (evidencia positiva de área, no lista de excepciones).** Nueva función exportada `extractArea()` en `validate.ts`: solo devuelve superficie con unidad inequívoca (`m²`, `m2`, `metros cuadrados`), con "metros" cualificado (`construidos`, `útiles`, `habitables`, `edificados`) o precedido de sustantivo de superficie (`superficie/vivienda/piso/ático… de N metros`). Además descarta la cifra si aparece en construcción de distancia (`a/hasta/escasos/menos de N metros`, `N metros de/del/andando`). **Ante un "N metros" ambiguo no se valida como área** — se prefiere no validar antes que bloquear por inferencia dudosa. Se usa en las tres rutas (conflicto por hecho, respaldo por frase y dedupe). Sin tocar extractor, compresor, structure, ownership, renderer ni SmartLinks.

**Versión.** `ENGINE_VERSION = 4.1`, incluida en la huella de caché → las stories afectadas no reutilizan la validación antigua.

**Tests (14 nuevos, suite total 52/52).** Detecta área: `200 m²`, `200 m2 construidos`, `200 metros cuadrados`, `180 metros útiles`, `superficie construida de 220 m²`. No detecta: `a 200 metros del Parque`, `parking a menos de 50 metros`, `a escasos 300 metros`, `la estación está a 150 metros`, `a 100 metros andando`. Mixtos: `"Vivienda de 180 m² situada a 200 metros del Retiro"` → 180; `"Piso de 150 metros cuadrados, a 50 metros del metro"` → 150. Más el caso real BC-1419 (sin conflicto) y la garantía de que un conflicto de superficie **real** (200 m² vs 88) se sigue detectando.

**Propiedades afectadas: 16** (el recuento previo de "18" contaba *claims*; varias propiedades tenían dos). Regeneradas **solo esas**, sin publicar ninguna:

| Resultado | Propiedades | |
|---|---:|---|
| **Sin conflicto tras el fix** | **10** | BC-0958, BC-1373, BC-1372, BC-1316, BC-1082, BC-0809, BC-0877, BC-0520, BC-1037, BC-1419 — todas con **gate verde**, listas para revisión y publicación manual |
| **Siguen bloqueadas por conflictos reales** | **6** | BC-1399, BC-0528, BC-0521, BC-0505, BC-0502 (dormitorios/baños que no cuadran) y BC-1376 (conflicto de superficie **legítimo**: 38 m² vs 46 m²) |
| Errores | 0 | |

**Verificación manual** (4 casos): BC-1419, BC-0877, BC-1316 y BC-1373 pasan de tener el falso positivo a **0 conflictos** en su versión vigente.

**Higiene de datos:** al regenerar, la versión anterior quedaba también en `generated`. Se marcaron 18 versiones antiguas como `rejected` con nota `[superseded por regeneración v4.1]` para que la cola muestre siempre la vigente.

**Sin efectos colaterales:** las 168 stories publicadas siguen intactas y las otras ~325 conflictivas no se han tocado ni regenerado. **Ninguna de las 10 recuperadas ha sido publicada** — pendiente de tu revisión.

## SAFE PARTIAL STORY PUBLISHING — política de publicación
*(2026-08-21 · cambio de POLÍTICA, no de motor. Engine v4.1 congelado: extract/validate/structure/compress sin tocar.)*

**Auditoría de la regla anterior.** El gate marcaba `conflict` como fallo de *story* (`gate.ts`, GATE 1), así que un solo conflicto retenía la propiedad entera aunque tuviera 5 capítulos limpios. La maquinaria de publicación parcial ya existía a medias: el publisher nunca aprobaba bloques en conflicto y la proyección pública (`getApprovedStoryPublic`) solo deja pasar bloques `approved`. Solo faltaba separar **estado de la versión** de **publicabilidad del bloque**.

**Nueva regla (`planPublication()` en el gate compartido).** Clasifica los fallos:
- **BLOCK-LOCAL** (excluyen el bloque, no la story): bloque en conflicto · bloque <5 palabras sin dato duro.
- **STORY-BLOCKING** (retienen la propiedad en fallback): <3 capítulos narrativos tras exclusiones · media insuficiente · propiedad no disponible · entidad sin respaldo · claim reutilizado · capítulo duplicado · >70 palabras · heading vacío · boilerplate · barrio incoherente · planta mal inferida.

Los gates restantes se **re-evalúan sobre el subconjunto publicable**, no sobre la story completa.

**Garantías de seguridad factual, verificadas en producción tras el rollout:**

| Invariante | Resultado |
|---|---|
| Bloques apoyados en un claim conflictivo que llegaron a `approved` | **0** |
| Bloques aprobados >70 palabras | **0** |
| Bloques aprobados vacíos | **0** |
| Propiedades publicadas con <3 capítulos narrativos | **0** |
| Bloques en conflicto que cruzan al DTO público | **0** (conservan `status='conflict'`; la proyección solo lee `approved`) |

Verificado además en el SmartLink real de BC-1356 (overview en conflicto + 2 bloques cortos rechazados): la página pública muestra Cocina, Zona privada y La finca, y **el capítulo conflictivo no aparece**. Los specs de la ficha superior siguen viniendo de datos estructurados.

**Dry-run completo de las 686 antes de ejecutar:** A ya publicadas 168 · B completas 11 · C parciales por conflicto 162 · D recuperables por bloque corto 76 · E ambas 64 · F <3 capítulos 155 · G media insuficiente 46 · H sin story 3.

**Rollout ejecutado: 313 nuevas publicaciones** (11 completas + 302 parciales). Se excluyeron **273 capítulos por conflicto** y **177 por ser demasiado cortos**; los cortos se marcan `rejected` (decisión automática segura) y los conflictivos conservan `conflict` para revisión humana.

### Resultado del catálogo

```text
ACTIVE PROPERTIES: 686

SMARTLINK 2.0 STRUCTURED: 481  (70,1%)
  - COMPLETE:      177
  - PARTIAL SAFE:  304

FALLBACK: 205  (29,9%)
  - <3 capítulos fiables:      154
  - media insuficiente (<8):    45
  - sin story (descripción pobre): 3
  - otros (invariante/no disponible): 3

HUMAN CONFLICTS STILL OPEN: 343 propiedades · 439 bloques
  (visibles en la cola, invisibles para el cliente)
```

**Cobertura estructurada: 70,1%**, frente al 24,5% anterior. Ninguna propiedad quedó en fallback por tener *un* dato en conflicto: solo quedan fuera las que no reúnen 3 capítulos fiables o carecen de media.

**Estados en la cola** (`story-review`): `PUBLICADA — COMPLETA`, `PUBLICADA — PARCIAL · N bloques pendientes de revisión`, `FALLBACK`, `BLOQUEADA`. Las parciales siguen apareciendo para poder enriquecerlas después sin bloquear al cliente.

### QA masiva (31 SmartLinks publicados, 3 escenarios cada uno)
Muestra auto-seleccionada por diversidad: completas, parciales con 1 bloque excluido, parciales con 3+, recuperadas por bloque corto, venta/alquiler, 8–60+ fotos, con vídeo, descripciones de 73 a 545 palabras, chalets y pisos.
**27/31 sin defectos** en 1440 / 390 / zoom 125%: 0 "Descripción" residual, 0 capítulos duplicados, 0 bloques >70 palabras, 0 boilerplate, 0 secciones vacías, 0 overflow, 0 errores JS; key facts, detalles y CTA correctos en todas; **la alternancia imagen/copy se recalcula bien al omitir capítulos** y no deja huecos.
Las **4 incidencias son el mismo hueco de datos, no un defecto**: propiedades cuyo barrio (Castellana, Goya, Colina) no está en la capa curada de 9 y cuyo bloque de barrio quedó excluido → no se renderiza el módulo (correcto: mejor omitirlo que mostrarlo vacío). Afecta a **10 publicadas**. Zonas sin curar con más volumen: Castellana (13), Lista (11), Goya (8), El Viso (8), Malasaña-Universidad (3). Se resuelve con un INSERT por barrio, sin migración.

## SAFE SPARSE + LOW-MEDIA ROLLOUT
*(2026-08-21 · segundo ajuste de POLÍTICA editorial. Engine v4.1 congelado.)*

**Policy añadida a `planPublication()`** (mismo gate compartido, sin segundo motor):

1. **STRUCTURED — SPARSE**: una story puede publicarse con **exactamente 2 capítulos narrativos limpios** si tiene **≥4 fotos** y al menos **2 elementos estructurales de apoyo** entre: barrio curado · Residence Details poblado (≥3 features) · vídeo · plano · localización válida · ≥8 fotos. Nunca se inventa un tercer capítulo para cumplir densidad.
2. **Gate fotográfico por tramos**: 0–3 fotos → fallback · **4–7 fotos + ≥3 capítulos limpios → admisible** (los capítulos sin foto de su clase quedan solo-texto; jamás se reutiliza una foto incorrecta) · 8+ → normal.

Ambos son umbrales **editoriales**. Los 14 invariantes de seguridad factual se evalúan igual que antes, sobre el subconjunto publicable.

**Rollout ejecutado: 114 nuevas** (103 SPARSE + 6 parciales + 5 completas). Ninguna propiedad fuera de esos criterios se publicó.

### Verificación SQL en producción

```text
ACTIVE PROPERTIES: 684        (eran 686: 2 archivadas durante el proceso)

SMARTLINK 2.0 STRUCTURED: 593  (86,7%)
  COMPLETE:      184
  PARTIAL SAFE:  308
  SPARSE:        103

FALLBACK: 91  (13,3%)
  - 0–3 fotos (media real insuficiente):     50
  - 1 capítulo limpio:                       29
  - 2 capítulos sin estructura de apoyo:      4
  - 0 capítulos limpios:                      2
  - sin story (descripción <25 palabras):     3
  - invariante estructural roto:              3

PUBLIC CONFLICT CLAIMS: 0
PUBLIC CONFLICT BLOCKS: 0
```

**Cobertura: 24,5% → 70,1% → 86,7%.** El fallback residual es irreducible por política: en 50 casos no hay fotos, en 31 no hay material narrativo y en 3 la descripción es demasiado pobre. Forzarlos exigiría inventar.

### QA post-rollout (30 SmartLinks × 3 escenarios)
Muestra: 10 SPARSE, 10 con 4–7 fotos, 10 mezcla de partial/complete; alquiler y venta, 9 barrios, con y sin vídeo, descripciones cortas y largas.
**30/30 correctos.** La primera pasada marcó 14 "fallos" que resultaron ser **el propio script arrastrando la regla vieja de 3 capítulos**; re-verificados con las reglas nuevas, los 14 son comportamiento correcto:
- 10 son publicaciones SPARSE legítimas (2 capítulos verificados, confirmado en `notes`);
- 3 no muestran "Detalles de la vivienda" porque la propiedad tiene **0 features** en BD → el módulo se omite en lugar de pintar un heading vacío (invariante funcionando);
- 1 muestra 2 key facts porque `square_meters` es NULL → no se inventa la superficie.

Sin "Descripción" residual, sin capítulos duplicados, sin bloques >70 palabras (máx. real 63), sin boilerplate, sin secciones vacías, sin overflow ni errores JS en 1440 / 390 / zoom 125%. La alternancia imagen/copy se recalcula correctamente con 2 capítulos y los text-only componen limpio.

## Limitaciones conocidas
1. **Bug corregido durante la implementación** (no en el engine): las consultas `.in()` con más de ~500 UUIDs superaban el límite de URL de PostgREST y devolvían vacío en silencio — la cola mostraba 0. Resuelto con troceado + paginación en `story-review.ts`.
2. La QA se ejecutó contra producción mediante las **mismas funciones que usa la UI** (`getEnrichmentQueue`, `evaluateGate`, acciones de bloque). La verificación visual del panel con sesión de agente sigue pendiente de credenciales, como en QA anteriores.
3. Los buckets "Pocos capítulos" y "Pocas fotos" son informativos: la cola explica que requieren mejor descripción o reportaje fotográfico, sin workflow avanzado (como se pidió).
4. El botón "Siguiente" recalcula la cola completa en cada salto (~1-2 s con 517 filas). Aceptable hoy; si el backlog creciera mucho, convendría cachear la lista por sesión.

## NEIGHBORHOOD KNOWLEDGE LAYER EXPANSION

Las zonas del catálogo que no casaban con ninguna fila de `neighborhoods`
dejaban el SmartLink sin bloque "Vivir en…": ni intro ni tiempos a puntos de
interés. Esta tanda cierra ese hueco. **Engine v4.1 no se ha tocado.**

### A · Universo recalculado desde producción

No se reutilizaron los conteos anteriores. Consulta directa sobre propiedades
activas agrupando `coalesce(subzone, zone)`: **25 valores distintos, 68
propiedades**. Clasificación uno a uno:

| Cat. | Qué es | Valores | Props |
|---|---|---|---|
| **A** | Barrio/subzona canónica válida | 17 | 55 |
| **B** | Alias o valor sucio normalizable | 4 | 6 |
| **C** | Distrito demasiado genérico (`zone = "Madrid"`) | 1 | 4 |
| **D** | Municipio fuera de la capital | 2 | 4 |
| **E** | No resoluble sin revisión humana | 1 | 2 |

**Dos hallazgos que cambiaron la clasificación de partida:**

1. **"Colina" NO es el barrio de Ciudad Lineal.** Las dos propiedades están en
   Ayres de Chicureo, comuna de **Colina, CHILE** (BC-1232: `-33.249, -70.623`).
   Seedear el barrio madrileño les habría puesto POIs de Madrid con minutos
   calculados sobre un continente equivocado. **Se deja sin resolver a
   propósito**, y hay un caso negativo en la QA que lo vigila.
2. **"Centro Comercial - Hospital" no era ambiguo:** es como el catálogo nombra
   el núcleo de **Los Bomberos, en Torrelodones** (salida 29 de la A-6, donde
   están Espacio Torrelodones y el hospital). Pasó de categoría E a D y entró
   como capa municipal.

### B · Normalización sin reescribir el catálogo

`neighborhoods.aliases text[]`: las variantes sucias resuelven al barrio bueno
**sin tocar una sola ficha de propiedad**. 12 barrios llevan alias hoy
(`lista-barrio-de-salamanca` → Lista, `bernabeu-hispanoamerica` →
Hispanoamérica, `barrio-de-salamanca` → Barrio de Salamanca,
`centro-comercial-hospital` → Torrelodones…).

La migración **aborta** si un alias apunta a dos barrios o pisa un `zone_key`
existente: un alias ambiguo mostraría al cliente el barrio equivocado, y eso
tiene que reventar en el despliegue, no en la ficha.

**Única excepción — 4 propiedades con `zone = "Madrid"`:** su barrio se obtuvo
por **geocodificación inversa de sus propias coordenadas** contra los límites
administrativos de OSM, y se escribió sólo en `subzone` (`zone` intacto). El
texto libre del anuncio no era fiable: BC-1209 decía "Bernabéu-Hispanoamérica"
y su punto cae en **El Viso**.

### C · 20 barrios nuevos (29 en total)

Priorizados por volumen de propiedades activas. Adscripción barrio→distrito
verificada contra el **Ayuntamiento de Madrid** (madrid.es); corrigió una
suposición de partida: **Castellana es barrio del distrito Salamanca**, no de
Chamartín.

- **Salamanca:** Castellana (14), Lista (12), Goya (9), Fuente del Berro (2), Guindalera (1)
- **Chamartín:** El Viso (9), Hispanoamérica (1), Nueva España (1)
- **Centro:** Malasaña (3), Chueca (2), Lavapiés (1)
- **Chamberí:** Trafalgar (1), Ríos Rosas (1)
- **Tetuán:** Castillejos (1)
- **Retiro:** Ibiza (1), Niño Jesús (1), Estrella (1)
- **Pozuelo de Alarcón:** Somosaguas (1), Prado de Somosaguas (2)
- **Torrelodones:** Torrelodones (1)

Intros de **35-70 palabras** (media 57), hechos urbanos y administrativos
comprobables — trama, época de edificación, equipamientos que existen. **Sin
minutos escritos**: el generador rechaza la migración si una intro los lleva,
porque los tiempos se calculan con las coordenadas reales de cada propiedad.

### D · 110 POIs, ninguna coordenada escrita a mano

El catálogo (`scripts/neighborhood-poi-catalog.mjs`) sólo declara nombre,
categoría, prioridad y modos. Las coordenadas las resuelve
`scripts/geocode-neighborhood-pois.mjs`:

- **Nominatim** para equipamientos, y **Overpass por nombre exacto de nodo OSM**
  para estaciones. La búsqueda difusa no las encuentra ("Lista, Metro de
  Madrid" → 0 resultados) y, cuando las encuentra, devuelve la calle homónima
  en vez del andén.
- Cada POI se **valida por radio** contra el centro de su barrio. Los que no
  pasan quedan fuera: se descartaron 2 (Club de Campo a 6,32 km de Prado de
  Somosaguas; estación de Torrelodones, ver más abajo).
- Un POI compartido por varios barrios debe resolver a las mismas coordenadas
  o el script aborta.
- 4 a 8 POIs por barrio (media 5,5), verificado por el generador.

`verified_source` guarda el id OSM concreto de cada POI, así que cualquier dato
es trazable hasta su origen.

**Dos correcciones factuales que salieron del proceso:** el WiZink Center es
hoy **Movistar Arena** (renombrado en 2024) y "Canal de Isabel II" resuelve al
**Depósito**, que es cultura y no deporte.

**La estación de Torrelodones se quedó fuera a propósito.** OSM no tiene un
nodo suyo etiquetado como estación y el único candidato de Nominatim es el
centroide del barrio de La Colonia, no el andén. Antes que publicar un tiempo
aproximado, no se publica.

### E · Defecto encontrado y corregido: parques medidos desde su centro

**BC-1390 está pegada a la verja sur del Retiro y el SmartLink decía "Parque
del Retiro ≈ 18 min a pie".** Un parque se geocodifica al *centroide* de su
polígono, y el del Retiro queda kilómetro y medio hacia dentro. Mismo problema
en la Casa de Campo, cuya envolvente mide 5,55 km.

Los POIs que ocupan superficie apreciable (>120 m) guardan ahora su bounding
box de OSM (`bbox_*`, 41 filas) y la distancia se mide contra el **rectángulo**,
cero si el punto cae dentro. Los puntuales — estaciones, museos pequeños — la
dejan a `null` y no cambia ni un minuto.

| Caso real | Antes | Después |
|---|---|---|
| BC-1390 → Parque del Retiro | 18 min a pie | **4 min a pie** |
| BC-1277 → Casa de Campo | 20 min en coche | **8 min en coche** |

Cubierto por 3 tests nuevos en `npm run test:smartlink` (56 en verde), incluido
el borde de "punto dentro del recinto → 1 min, nunca negativo".

### F · QA sobre 28 SmartLinks reales de producción — 28/28

`npm run test:neighborhoods` (`scripts/qa-neighborhood-layer.mjs`) pide los
SmartLinks públicos de verdad y comprueba sobre el HTML servido: el barrio
canónico esperado, la intro presente y sin minutos escritos, POIs con tiempo
sólo si la propiedad tiene coordenadas, y minutos plausibles (1-40, tope de 22
a pie). Cubre los 20 barrios nuevos, las 3 rutas de alias, 5 propiedades sin
coordenadas y **2 casos negativos** (las de Chile) que deben seguir sin
resolver.

⚠️ Al escribir el harness dio 0/28: React parte cada interpolación con un
comentario vacío (`Vivir en <!-- -->Castellana`) y el regex no casaba. **Era el
harness, no la capa** — se documenta porque el mismo error espera a quien
escriba la siguiente QA sobre HTML servido.

### G · Cobertura

| | Antes | Ahora |
|---|---|---|
| Propiedades activas que resuelven barrio | 616 / 684 (90,1%) | **682 / 684 (99,7%)** |
| Barrios curados | 9 | **29** |
| POIs | 33 | **143** (41 con envolvente) |

Las 2 que faltan son las de Chile, y es el comportamiento correcto.

### Limitaciones de esta capa
1. **BC-1017 muestra "Vivir en Centro Comercial - Hospital" como título** hasta
   el próximo redespliegue del caché de página; el contenido curado ya es el de
   Torrelodones. El título cae al valor crudo de `zone` sólo cuando el Engine
   generó capítulo de barrio pero no hay barrio resuelto — con 682/684 esto ya
   sólo afecta a las 2 de Chile.
2. **Casa de Campo y Club de Campo se miden contra su bounding box**, que para
   un polígono muy irregular sigue siendo una aproximación por exceso de
   cercanía en las esquinas. Aceptable con `≈` y modo coche; si algún día hay
   volumen real en Pozuelo, conviene sustituirlos por accesos concretos.
3. Los barrios nuevos **no tienen `facts`** (el jsonb sigue vacío, como los 9
   originales). No se usa hoy en el render.
4. Regenerar la capa es `node scripts/geocode-neighborhood-pois.mjs && node
   scripts/fetch-poi-bounds.mjs && node scripts/build-neighborhood-migration.mjs`.
   La migración 0145 es idempotente y se reaplica en cada despliegue.

# CATALOG PROPERTY STORY ENRICHMENT QUEUE — COMPLETE
**SmartLink 2.0 estructurado: 593/684 (86,7%)** · 184 completas · 308 parciales · 103 sparse · 91 en fallback · 0 conflictos en público · Engine v4.1 FROZEN
**Capa de barrio: 682/684 (99,7%)** · 29 barrios curados · 143 POIs verificados contra OSM · 0 coordenadas escritas a mano
