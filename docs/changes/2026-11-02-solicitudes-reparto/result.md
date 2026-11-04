# Solicitudes: rediseño en tres vistas y reparto administrado por inmueble

- Fecha: 2026-11-02
- Rama: `fabri/solicitudes-reparto`
- Base: `origin/main` @ `4495331f`
- Tamaño: grande o sensible. Incluye una migración, permisos en servidor y la preparación de una integración (Zinto) que escribe.
- Especificación de partida: «Solicitudes · Especificación para validación» v0.3 (2 nov 2026), más el requisito de reparto del encargo.
- Referencia visual: el archivo de Figma enlazado no es accesible con la cuenta conectada. Se usó la exportación local `BCP · Solicitudes · Exploración UX/UI · 30 oct 2026.fig` (textos de las pantallas A01–A13, B01–B02, C01–C02 y D02).

**Aviso.** Fusionar este PR equivale a aplicar la migración `0237` en producción en el siguiente despliegue.

## 1. Qué hay hoy y qué cambia

### Antes de este cambio (leído en el código)

| Tema | Estado antes del cambio |
|---|---|
| Solicitud | Una fila de `idealista_leads` por conversación de Idealista. La única entrada es la extensión de Chrome (`/api/extension/idealista-leads`), con `conversation_id` como clave única. |
| Vínculo con el piso | Primero «Ref.», después «Cod.». Si faltan, se empareja por calle y precio ±8 %. No se guarda con qué método se emparejó, y el primer emparejamiento ya no se corregía aunque luego llegara la referencia exacta. |
| Responsable | `idealista_leads.assigned_to`. Cualquiera con «Editar» en Solicitudes podía asignar, también en lote y desde la bandeja anterior. No había reparto automático. |
| Asesor del cliente | `profiles.assigned_advisor_id`. Al convertir una solicitud, el cliente heredaba su asesor si no tenía uno. |
| Zinto | La integración viva es la v2, de empuje: contactos, mensajes, citas, deals, campañas y sync-jobs. No tiene ninguna ruta de asignación, no hay mapeo de asesor a usuario de Zinto y no se guarda id de conversación (se busca por teléfono). |

### Después de este cambio

| Pieza | Dónde |
|---|---|
| Migración aditiva: vínculo con evidencia, reglas por inmueble, auditoría append-only, cola de Zinto y funciones atómicas | `supabase/migrations/0237_solicitudes_reparto.sql` |
| Lecturas puras: vínculo, reparto, errores, vistas B y C, hora de Madrid | `lib/sales-inbox/routing.ts`, `views.ts`, `time.ts` |
| Acciones de servidor (solo administradores donde corresponde) | `solicitudes/inbox-actions.ts`, `reparto/actions.ts`, `checkRoles` en `lib/auth/guard.ts` |
| Ingesta: vínculo exacto y reparto tras guardar | `app/api/extension/idealista-leads/route.ts` (`route_leads`) |
| Ficha del cliente: el desplegable de asesor se sustituye por «Reasignar cliente», solo para administradores | `clientes/[id]/_components/command-header.tsx` y `clientes/[id]/actions.ts` |
| Historial de publicaciones: qué código tuvo cada anuncio y cuándo (trigger sobre `idealista_listings`) | `0237` (`idealista_listing_codes`, `listings_for_code`) |
| Unificación por teléfono solo de la MISMA consulta; otro anuncio = otra solicitud | `lib/sales-inbox/merge.ts` (`adsDiffer`), `auto-merge.ts`, `mergeSamePhoneLeads` |
| Pantalla «Reparto comercial» (Administración) | `app/[country]/(admin)/admin/reparto/` |
| Solicitudes: Tarjetas, Por inmueble, Prioridades, ficha nueva y diálogos | `solicitudes/_components/*` |

## 2. Decisiones tomadas en la implementación

Fabricio puede revocar cualquiera de estas decisiones. Para cada una se indica dónde se cambia.

| # | Decisión | Motivo |
|---|---|---|
| D1 | Un vínculo es exacto **solo** con «Ref.» o «Cod.» que resuelven a **una** vivienda, o con una corrección manual que lleva motivo. Calle y precio dejan el vínculo en «Por verificar». | Requisito: «No asocies por similitud de dirección». |
| D2 | El emparejamiento por calle y precio **se conserva** como pista visible («Por verificar»). Nunca reparte, nunca agrupa en la vista B y no permite preparar la visita. | Conserva lo que el equipo ve hoy sin darlo por cierto. Si se prefiere eliminarlo, se quita en la ingesta. |
| D3 | El **cliente verificado** es el que una persona vinculó (`client_id`). Un teléfono igual **no** basta para heredar asesor; deja la solicitud pendiente con el motivo «posible cliente existente». | La especificación exige identidad verificada y prohíbe fusionar por semejanza. |
| D4 | El inmueble repartible es la ficha propia (`properties`) o, si el anuncio no tiene ficha, el propio anuncio de Idealista. | La mayoría de los anuncios de esta cartera son «inspo» sin ficha. |
| D5 | Un cambio de regla vale para las solicitudes que llegan **después** de confirmarlo. Las anteriores que siguen pendientes las asigna un administrador. | Regla 5 de la especificación: el histórico no se reasigna de forma implícita. |
| D6 | **Asignar** (incluido «Asignarme» y el lote) pasa a ser solo de administradores (owner/admin, por rol efectivo en el país). | R02 y la política confirmada. **Es un cambio de flujo para quien se asignaba solicitudes sin ser administrador.** |
| D7 | Una solicitud con cliente vinculado no se asigna suelta: se usa «Reasignar cliente», que mueve también sus solicitudes abiertas y sus tareas. | Un único asesor por cliente. |
| D8 | Cuando una solicitud se vincula a un cliente que ya tiene **otro** asesor, hay dos casos. Si la había asignado el reparto automático (o se asignó antes de 0237), **hereda el asesor del cliente**, con auditoría del anterior y del nuevo. Si la asignó a mano un administrador, queda en **conflicto visible** y decide un administrador reasignando al cliente. *(Corregido tras la revisión de Codex; antes era conflicto en los dos casos. Ver §8.)* | Un cliente tiene un único asesor; una decisión explícita de un administrador no se deshace en silencio. |
| D9 | Zinto: el cambio de responsable se guarda en una cola recuperable (`zinto_owner_sync`, en estado «pendiente · falta contrato»). **No se envía nada.** | El repo no tiene contrato de asignación (ver §5). |
| D10 | Paleta y tipografía: se usan los tokens actuales del CRM (incluido el modo oscuro), no la paleta propuesta en Figma. | El propio diseño la marca «pendiente de validar con la marca». |
| D12 | El asesor de un cliente **existente** solo cambia con «Reasignar cliente»: administrador, motivo, versión, auditoría y traslado de sus solicitudes abiertas y tareas. Incluye la ficha del cliente, que antes lo cambiaba con un desplegable para cualquiera con «Editar» en Clientes. Las **altas** de clientes nuevos siguen fijando el asesor inicial como hasta ahora (al crearlo; no es una reasignación). | Política confirmada: solo administradores asignan o reasignan. |
| D13 | **Una solicitud por anuncio** (especificación D07). La unificación por teléfono, automática o con el botón, solo junta la **misma** consulta: mismo «Cod.», si no misma «Ref.», si no mismo título; o una consulta sin datos del anuncio, como una llamada perdida. Las de otros anuncios quedan como solicitudes separadas. Comparten cliente y asesor cuando una persona las vincula al cliente verificado; el teléfono solo no verifica (D3). | Que unificar no oculte consultas. |
| D14 | **Historial de publicaciones** con un trigger sobre `idealista_listings`, sin tocar el publicador: al cambiar el código se cierra el anterior y se abre el nuevo. Un código anterior sigue identificando su anuncio y su inmueble, y por tanto su reparto. Empieza con la migración: los códigos reescritos antes no se recuperan. | En el esquema actual una republicación reescribe el código de la misma fila. |
| D15 | Las pruebas SQL usan las **restricciones reales** (`property_id` único, 0017; referencia única solo entre no-inspo, 0062). La lógica para varios anuncios por inmueble se prueba aparte, en una base que quita esa unicidad, marcada como defensiva. | Una prueba con un esquema distinto no demuestra el flujo real. |
| D11 | Textos nuevos en español e inglés. Francés y alemán muestran el español hasta que se traduzcan. | Es el mecanismo que ya tiene el diccionario para cualquier clave sin traducir. |

## 3. Etapas y commits

1. `48528640`: migración `0237` y batería SQL local.
2. `76e1bcbc`: servidor del reparto, vínculo auditado y «Registrar contacto» atómico.
3. `1151315c`: pantalla «Reparto comercial» y `Modal` accesible (Escape, foco atrapado y foco devuelto).
4. `00923a8f`: las tres vistas y la ficha nueva.
5. `fe954e9f`: ajustes de la QA visual, generador de datos sintéticos, recorrido de QA y este expediente.
6. `41e53a99`, `4e3833de` y `9f77030b`: correcciones de las revisiones de Codex (H1, H2, H3, H1b, H1c).
7. `bc8a1aeb`: recorrido de validación y asesor del cliente solo por reasignación. Se abre el PR #386 en borrador.
8. `b215454e`: solicitudes separadas por anuncio, historial de publicaciones, escenario 4 corregido y pruebas con el esquema real (§9).
9. `951adb3d`: tres casos nuevos de Codex sobre la unificación y la evidencia (§10).

## 4. Verificación

Todo se ejecutó en local, con datos sintéticos. No se tocó producción ni ningún sistema externo.

| Comprobación | Comando | Resultado |
|---|---|---|
| Lint de migraciones | `python3 scripts/lint-migrations.py` | OK |
| Tipos | `npx tsc --noEmit` | OK |
| Pasos de la CI (todos salvo el build, que se hizo aislado) | cada `run:` de `ci.yml` | 35/35 OK |
| Reparto offline (nueva, en la CI) | `npm run test:solicitudes-reparto` | 15 bloques OK |
| Unificación por teléfono: D07 y los casos 1 y 2 de la quinta ronda, con capturas sucesivas (en la CI) | `npm run test:lead-merge` | OK |
| Regla de reparto en Postgres 16 local, migración aplicada dos veces, concurrencia real (R12), reversión y reaplicación | `BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/test-solicitudes-reparto.sh` | Con las **restricciones reales del esquema**: 127 comprobaciones (incluida la de concurrencia), más 5 **defensivas** en una base aparte; 3 ejecuciones seguidas en verde |
| Build de producción aislado (`.env.production` apartado sin leerse, variables ficticias) | `NEXT_BUILD_DIR=.next.qa npx next build` | OK |
| QA visual sobre `next start` + simulador, escritorio 1440 y móvil 390 (incluida la ficha del cliente) | `scripts/qa/solicitudes-reparto-qa.mts` | 37/37 OK, sin errores de consola |
| Recorrido de validación simulado a nivel de base contra el Postgres desechable, con los mismos scripts del entorno de pruebas | `scripts/qa/solicitudes-reparto-pruebas/simular-en-local.sh` | 12/12: escenarios 1, 2, 2b, 3, 4 y 4b, salvaguardas, siembra idempotente y limpieza |

### Criterios de aceptación de la especificación

| ID | Evidencia |
|---|---|
| R01 | SQL: tres reglas en una operación, auditadas; los clientes nuevos van a su asesor. QA: selección múltiple y confirmación. |
| R02 | SQL: `forbidden` para el ejecutivo (también con rol por país) y `anon`/`authenticated` sin EXECUTE. Test estático: toda acción de reparto llama al gate de administrador antes de la base. QA: el asesor no ve la tabla, ni el botón, ni el menú. |
| R03 | SQL: la asignación manual sobrevive a reintentos y a dos cambios de regla, con auditoría completa. |
| R04 | SQL: los nuevos siguen la regla nueva, los ya asignados no cambian y el histórico pendiente no se reasigna solo. |
| R05 | SQL: vínculo ambiguo, sin regla y asesor inactivo quedan pendientes; el administrador asigna a mano. |
| R06 | SQL: el segundo administrador recibe `version_conflict` y ve quién lo cambió. QA: resultado por elemento. |
| R07 | SQL: reprocesar no duplica asignación, actividad, auditoría ni cola. |
| R08, Z02, Z03 | SQL: un acuse antiguo da `stale` y no revierte; un error se reintenta sin duplicar fila; el CRM conserva el responsable. |
| R09, Z05 | SQL: conserva el asesor del cliente; con el mismo teléfono sin verificar no hereda ni crea un segundo asesor. |
| R10 | SQL: una nueva publicación del mismo piso se resuelve exacta y aplica su regla. |
| R11 | SQL: reasignar mueve las solicitudes abiertas y las tareas, encola la conversación y conserva el autor de lo anterior. QA: alcance visible antes de confirmar. |
| R12 | SQL con dos sesiones simultáneas: una sola primera asignación; la segunda solicitud hereda. Además, un reparto y una reasignación administrativa simultáneos del mismo cliente terminan sin interbloqueo (H2). |
| D01–D05, D11, D12 | SQL: Cod. y Ref. exactos, sin asociación por dirección, ambiguo o en conflicto nunca elige el primero, la evidencia exacta corrige el enlace por dirección y la corrección manual no se pisa. Con dos anuncios del mismo inmueble se enlaza el anuncio que identifica la evidencia (H1); con «Ref.» y «Cod.» juntos, el que casa con los dos, y conflicto si señalan anuncios distintos (H1b); un «Cod.» recibido que aún no está en el catálogo no se suple con la «Ref.» y se reprocesa cuando llega (H1c). |
| U01, U02 | SQL: contacto y tarea en una transacción; el doble envío con la misma clave no duplica; completar la tarea no cierra la solicitud. QA: fecha y hora de Madrid visibles antes de guardar. |
| U03 | La URL conserva filtros, vista y página (ya existía); se restaura el scroll al cerrar la ficha. |
| U07 | QA: Escape cierra y el foco vuelve; sin scroll horizontal a 390 px. **Lector de pantalla y zoom al 200 % sin probar.** |
| Z04 | Abrir Zinto o llamar no escribe actividad (ya era así) y la ficha lo dice. |

## 5. Lo que falta y por qué

### Zinto: datos necesarios para enviar el responsable

Sin ellos no se envía nada. Hacen falta estos siete datos:

1. La ruta y el cuerpo de la API v2 para asignar el responsable de una conversación o de un contacto. Ninguna de las 7 rutas conocidas de la v2 lo hace.
2. Si `PUT /contacts/{externalId}` o `POST /deals` aceptan un campo de responsable, con su nombre y su tipo.
3. Cómo se listan los usuarios o agentes de Zinto y el formato de su id.
4. La correspondencia entre un perfil del CRM y un usuario de Zinto. Hoy no existe ninguna tabla ni columna para ello.
5. Con qué se identifica la conversación para asignarla: el teléfono (externalId) o un id propio de Zinto. Hoy solo guardamos el teléfono.
6. Cómo confirma Zinto la asignación (200, o 202 más webhook), cómo funciona la idempotencia y si existe un webhook de asignación.
7. Si la clave v2 necesita un permiso adicional.

Cuando estén, falta un trabajador que lea `zinto_owner_sync` (pendientes), llame a Zinto y registre el acuse con `zinto_owner_sync_ack(id, versión, ok, error)`. La función ya descarta los acuses antiguos.

### Otros puntos pendientes

- **Impacto en el día a día.** La mayoría de las solicitudes llegan sin «Ref.» ni «Cod.», así que se verán como «Por verificar» y **no se repartirán solas**: irán a «Pendiente de reparto». Es lo que exige la regla, pero puede llenar esa cola. Para mejorarlo hay que capturar el identificador del anuncio en la extensión (lee la referencia de toda la página, una sola por hilo, y nunca el enlace del anuncio). No se ha tocado.
- **Histórico.** La migración solo **clasifica** el vínculo de las solicitudes existentes y no cambia ningún enlace ni ningún responsable. Donde la evidencia contradice lo guardado, el vínculo queda en «conflicto». La especificación pide revisar una muestra de solicitudes reales antes de confiar en la nueva lectura; no se ha hecho con datos reales.
- **Accesibilidad.** No se han probado lector de pantalla, zoom al 200 % ni contraste medido.
- **Fase 0 del plan.** No se ha hecho la prueba con ejecutivos ni la validación de dirección. Este trabajo implementa la propuesta tal como está especificada.
- **Historial de publicaciones: desde la migración.** Los códigos que el CRM reescribió antes de `0237` no se pueden recuperar. Las consultas que llegaron con esos códigos y se reprocesen quedarán «sin resolver» («Por verificar»).
  - Una republicación que cree **otra fila** «inspo», en vez de reescribir la misma, es otro inmueble y no hereda reparto. En el esquema actual el CRM reescribe la misma fila.
  - El trigger corre en cada escritura del código de un anuncio. Si fallara, fallaría esa escritura. Está probado en local, no en el VPS.
- **Unificaciones antiguas.** Las solicitudes que se unificaron **antes** de este cambio siendo de otro anuncio siguen ocultas. No se separan solas: el historial ya se movió a la superviviente.
  - `diagnostico-unificadas-otro-anuncio.sql` (solo lectura) las lista para decidir.
  - Separar una es poner `merged_into_id` a NULL, con su historial ya en la otra. Es una decisión pendiente.
- **Versión de Postgres del VPS.** No está comprobada. El repositorio apunta a la 15.8 (imagen de `scripts/sql-tests`). La revisión estática no encuentra nada exclusivo de la 16, y la batería se puede repetir con otra versión (`BCP_PGBIN`, ver `validacion.md` §A).
- **Fuera de alcance.** No se ha implementado la relación «Propiedad propuesta» (alternativas).

## 6. Migración `0237`

- **Recuperación.** `rollback-0237.sql` en este expediente (lo ejecuta una persona). Restaura la vista de `0161` y elimina lo añadido. **No se pierde ningún responsable**, porque `assigned_to` y `assigned_advisor_id` son columnas anteriores. Sí se pierden las reglas, la auditoría, la cola y el historial de publicaciones creados después. También se quita el trigger del historial. Probado en local: reversión y reaplicación.
- **Compatibilidad.** Todas las columnas nuevas tienen valor por defecto o admiten nulos, y la vista solo añade columnas al final. El código anterior funciona con el esquema nuevo. Si falla el health check y vuelve el build anterior, el esquema nuevo no le afecta.
- **Transacciones.** No hay `BEGIN`/`COMMIT` propio y todo es idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE`). La clasificación del histórico solo toca filas sin clasificar.
- **Acceso.** Tablas con RLS sin políticas y funciones con `REVOKE` a `PUBLIC`/`anon`/`authenticated`: solo `service_role` puede usarlas.

## 7. Recorrido de validación en un entorno de pruebas

Está en `validacion.md`: compatibilidad con la versión de Postgres del VPS, reparto por inmueble, cliente que conserva su asesor, reasignación administrativa, anuncio pendiente que se resuelve al catalogarse, limpieza y una tabla para registrar los resultados. Usa solo datos sintéticos y los scripts de `scripts/qa/solicitudes-reparto-pruebas/`, que se niegan a correr sin `entorno=pruebas` o contra los dominios de producción.

## 7b. Cómo reproducir la QA visual

```sh
node --experimental-strip-types scripts/sim/fixtures/crm-01-admin.gen.mts <scratch>/base.json <scratch>/img
node --experimental-strip-types scripts/sim/fixtures/solicitudes-reparto.gen.mts <scratch>/base.json <scratch>/fixture.json
node --experimental-strip-types scripts/sim/postgrest-sim.mts 54381 <scratch>/fixture.json <scratch>/sim.jsonl <scratch>/img --auth --persist
mv .env.production <scratch>/   # sin leerlo; se devuelve al terminar
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54381 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon \
  SUPABASE_SERVICE_ROLE_KEY=dummy-service NEXT_BUILD_DIR=.next.qa npx next build
# mismas variables + npx next start -H 127.0.0.1 -p 3281
BASE=http://127.0.0.1:3281 OUT_DIR=<scratch>/shots node --experimental-strip-types scripts/qa/solicitudes-reparto-qa.mts
```

## 8. Revisión de Codex (2026-11-02, solo lectura)

Codex señaló tres problemas en `0237`. Se comprobó cada uno en el código y con una prueba que **falló antes de corregir**. Esas pruebas se ejecutaron contra la migración sin cambios, con una copia temporal de la batería fuera del repositorio. Las tres proceden.

| # | Hallazgo | Reproducción antes de corregir | Corrección | Pruebas nuevas, ahora en verde |
|---|---|---|---|---|
| H1 | **Anuncio exacto.** `resolve_lead_link` conservaba el anuncio guardado si era del mismo inmueble, aunque el «Cod.» recibido fuera de otro anuncio de ese inmueble. | `TEST FAIL: H1 · llega el Cod. del otro anuncio del mismo inmueble` | El anuncio lo decide la evidencia: el único anuncio del inmueble que casa con «Ref.» o «Cod.». Si casan varios, se conserva el guardado solo si es uno de ellos; si no, ninguno. Si la evidencia es la referencia de la ficha (identifica el inmueble, no un anuncio), se conserva el guardado de ese inmueble. Completar un anuncio que faltaba no se trata como corrección ni como conflicto. | Se enlaza el anuncio del «Cod.» recibido, con auditoría del anterior. En el histórico, un anuncio guardado distinto del «Cod.» queda en conflicto sin reescribirse. Con solo la referencia de la ficha se conserva el anuncio. |
| H2 | **Orden de bloqueo.** `route_lead` llamaba a `resolve_lead_link` (que bloquea la solicitud) antes de bloquear al cliente; `reassign_client_admin` bloquea cliente → solicitudes. | Sesión A: `ERROR: deadlock detected` | `route_lead` bloquea el cliente **antes** de resolver el vínculo. Orden único en 0237: cliente → solicitud; ninguna función bloquea un cliente después de una solicitud (documentado en la migración). | `test-solicitudes-reparto-lock-*.sql`: un trigger **solo de prueba** pausa 2 s la sesión A dentro de `route_lead` mientras la sesión B reasigna al mismo cliente. Las dos terminan, gana la reasignación y cliente y solicitud quedan con el mismo asesor. |
| H3 | **Asesor único.** Una solicitud repartida por la regla a A y vinculada después a un cliente de B quedaba en conflicto con dos responsables posibles. | `TEST FAIL: H3 · asignada por regla y vinculada a un cliente con otro asesor` | Si el origen es la regla, una herencia o una asignación anterior a 0237, la solicitud **hereda** el asesor del cliente: auditoría `lead_inherited` con el anterior y el nuevo, nota en el hilo, y la cola de Zinto deja de tener al anterior pendiente. Solo una asignación **manual de un administrador** sigue en conflicto visible. | Regla → hereda B con auditoría; el asesor del cliente no cambia; la cola de Zinto no conserva a A pendiente; la asignación anterior a 0237 también hereda; la asignación manual de un administrador sigue en conflicto (prueba existente, renombrada). |

### Segunda revisión de Codex: H1b, «Ref.» y «Cod.» juntos

La corrección de H1 seguía incompleta cuando llegan las dos evidencias. La selección del anuncio usaba `ref OR code` dentro del inmueble, así que:

- con una referencia repetida entre dos anuncios y un código único, casaban los dos anuncios y se conservaba el guardado (o, sin guardado, no se completaba ninguno);
- con una referencia y un código de anuncios distintos, se daba por exacto el guardado.

**Antes de corregir.** Se ejecutó una copia temporal de la batería, con aserciones que no se detienen, contra la migración sin cambiar. Fallaron cinco comprobaciones: referencia compartida con código único, referencia y código distintos, ese conflicto repartía, sin guardado no se completaba, y el histórico no marcaba conflicto. La de «solo referencia compartida» ya pasaba.

**Corrección.** Cada evidencia se evalúa por separado dentro del inmueble:

- con las dos, el anuncio es el que casa con ambas;
- si su intersección está vacía, el vínculo queda en `conflict`, no se reescribe y no reparte;
- con una sola evidencia que casa con varios anuncios, se conserva el guardado solo si es uno de ellos;
- si la evidencia es la referencia de la ficha, el inmueble es exacto y el anuncio no se afirma.

**Pruebas nuevas** (inmueble con L51 y L52, que comparten BC-500, y L53 con BC-503), todas en verde:

| Caso | Resultado |
|---|---|
| Referencia compartida + código único, con otro anuncio guardado | Se elige el anuncio del código |
| Referencia y código de anuncios distintos | Conflicto: no reescribe, no da por exacto el guardado y no reparte aunque el inmueble tenga regla |
| Sin anuncio guardado, referencia compartida + código único | Se completa el anuncio del código |
| Solo la referencia compartida | Inmueble exacto, ningún anuncio afirmado |
| Histórico (solo clasificar) con el guardado contradiciendo Ref. + Cod. | Conflicto, sin reescribir |

### Tercera revisión de Codex: H1c, «Cod.» recibido que aún no está en el catálogo

Con una «Ref.» válida y un «Cod.» que todavía no existe en `idealista_listings`, el código sin resultados se ignoraba y la referencia bastaba para confirmar el anuncio y repartir. Eso podía confirmar un anuncio distinto del consultado; por ejemplo, una republicación aún no catalogada con la misma referencia.

**Antes de corregir.** Con la copia temporal de la batería sobre la migración sin cambiar, la consulta con Ref. y un Cod. desconocido se confirmaba y se repartía por la regla del inmueble de la referencia. Fallaron 8 de las 10 comprobaciones nuevas; las 2 que pasaban no demostraban la corrección.

**Corrección:**

- **Nuevo método `code_unresolved`.** Distingue «código recibido sin resolver» de «código no recibido». Si llega un «Cod.» que no está en el catálogo, no se confirma ningún anuncio ni inmueble, no se reescribe el enlace guardado y se muestra como «Por verificar».
- **Motivo de reparto pendiente `link_code_unresolved`.** Tiene su texto en la ficha, en español e inglés.
- **Reprocesado.** `reconcile_unresolved_code_leads(p_limit)` reprocesa solo las consultas en `code_unresolved` cuyo código ya está en el catálogo, con un índice parcial propio. La ingesta la llama al terminar cada lote (máximo 50; si falla, la ingesta no se interrumpe). Es idempotente.
- **Reversión y permisos.** El script de reversión y la lista de permisos (solo `service_role`) incluyen la función y el índice nuevos.

**Pruebas nuevas.** Inmueble Almagro con regla a Jaime y anuncio L61 (BC-600, Cod. 661). Llega «BC-600 + Cod. 669» y el 669 no existe. Todas en verde:

| Caso | Resultado |
|---|---|
| Sin anuncio guardado | `code_unresolved`, sin anuncio ni inmueble confirmados y **sin reparto** (`link_code_unresolved`) aunque el inmueble de la referencia tenga regla |
| Con el anuncio de la referencia guardado (L61) | No se confirma, no se reescribe y no se reparte |
| Solo el «Cod.» sin resolver | `code_unresolved`, distinto de «sin datos» |
| Histórico (solo clasificar) | `code_unresolved`, no exacto |
| Se cataloga L62 (BC-600, Cod. 669) y se reprocesa | Solo se procesan las consultas cuyo código ya existe (3) |
| Reprocesado sin guardado | Se resuelve a L62 y se reparte a Jaime |
| Reprocesado con guardado | Se corrige de L61 a L62, auditado, y se reparte |
| Un código que sigue sin catalogar | Sigue pendiente |
| Repetir el reprocesado | No procesa nada ni duplica auditoría ni actividad |

**Límite.** El reprocesado automático corre cuando la extensión envía un lote. Si se cataloga un anuncio y no llegan capturas, las consultas pendientes esperan al siguiente lote. También puede lanzarlo una persona con `select reconcile_unresolved_code_leads();`; nunca un agente. No hay cron propio.

**Pruebas repetidas tras corregir** (local, datos sintéticos):

- `scripts/sql/test-solicitudes-reparto.sh`: 119 comprobaciones y la de concurrencia, en verde tres veces seguidas (tras H1b y tras H1c).
- `npm run test:solicitudes-reparto`, `npx tsc --noEmit` y `scripts/lint-migrations.py`: en verde.
- No se repitió la QA visual: los cambios son de SQL y de un comentario, y el simulador de la QA visual no ejecuta funciones SQL.

**Límites de estas pruebas:**

- H2 demuestra la intercalación concreta que causaba el interbloqueo (reparto dentro, reasignación entrando). No es una prueba exhaustiva de todas las intercalaciones posibles. La regla de orden es lo que la generaliza.
- El trigger de pausa existe solo en la base temporal de prueba y se borra al terminar.
- Postgres local 16 frente a la versión real del VPS, sin comprobar.

### Ajuste antes del PR: el asesor del cliente desde su ficha

La ficha del cliente tenía su propio selector de asesor (`assignClientAdvisor`), anterior a esta política, ligado al permiso «Editar» de Clientes. Para que haya un único camino coherente con la regla confirmada (un único asesor por cliente, que solo cambia un administrador), ahora delega en `reassignClient`: administrador (por rol en el país del cliente), motivo, versión, auditoría y traslado de solicitudes abiertas, tareas y cola de Zinto. La ficha muestra el nombre del asesor y, a los administradores, «Reasignar cliente» con el mismo diálogo de alcance.

Pruebas:

- Una prueba estática comprueba que `assignClientAdvisor` delega en la reasignación y que `assigned_advisor_id` solo se escribe en las altas de clientes.
- La QA visual comprueba que la administradora ve «Reasignar cliente» con su alcance y que el asesor ve la ficha sin el control.

La revisión de Codex se hizo en solo lectura. No se ha hecho la QA visual de Fabricio. Zinto sigue **pendiente**: la cola guarda el responsable vigente, pero no se envía nada hasta tener el contrato (§5).

## 9. Cuarta ronda (2026-11-02): solicitudes separadas, historial de publicaciones, escenario 4 y esquema real

### 1 · Solicitudes separadas por anuncio

- **Antes.** La unificación por teléfono (automática al ingerir y el botón «Unir») juntaba consultas de **anuncios distintos** de la misma persona y escondía todas menos una.
- **Ahora.** `adsDiffer()` bloquea la unificación cuando las dos consultas traen datos del anuncio y no coinciden. Compara el código; si no hay, la referencia; si no, el título. Una llamada sin anuncio sigue uniéndose a su consulta.
- **Cliente y asesor.** Las solicitudes separadas comparten cliente verificado y asesor al vincularlas, sin reparto por la regla del otro piso mientras tanto: quedan pendientes como «posible cliente existente».
- **Pruebas:**
  - `test:lead-merge`, con 8 casos D07;
  - SQL D07: dos solicitudes visibles, mismo cliente verificado y mismo asesor;
  - recorrido 2b (simulado): otra solicitud visible, y tras vincularla comparte cliente y asesor.

### 2 · Historial de publicaciones

- **Tabla y trigger.** `idealista_listing_codes` y su trigger.
- **Resolución.** El vínculo y el reprocesado buscan el código en el anuncio y en su historial (`listings_for_code`).
- **Evidencia en la ficha.** Si la consulta llegó por un código anterior, «Evidencia del origen» dice «Publicación anterior: el anuncio se republicó con el código X».
- **Prueba de control.** Con `listings_for_code` limitado al código vigente (sin historial), fallan exactamente las 3 pruebas de republicación: R10 «un código anterior sigue resolviendo», D11 «la consulta anterior conserva su código y su origen» y H1 «un código de una publicación anterior identifica su anuncio».

### 3 · Escenario 4 del recorrido

- **El defecto.** La versión anterior del recorrido creaba la regla del anuncio **después** de la consulta y esperaba que se repartiera. La simulación local lo ocultaba adelantando `effective_from`.
- **Lo correcto.** Esa consulta queda «anterior a la regla», sin reparto automático; ya lo hacía `route_lead`.
- **Recorrido nuevo.**
  - Paso 4: la consulta se resuelve por una **republicación real** del mismo anuncio, cuya regla existía antes, y hereda su reparto.
  - Paso 4b: regla creada después de la consulta, que queda «anterior a la regla» y la asigna un administrador.
- **Sin atajos.** Ni las pruebas ni la simulación tocan `effective_from`. Prueba SQL H4.

### 4 · Pruebas con las restricciones reales

- **Stub.** `stub-solicitudes-reparto.sql` aplica `property_id` único (0017) y la referencia única entre no-inspo (0062). Las pruebas lo comprueban: un segundo anuncio para el mismo inmueble y una referencia no-inspo repetida se rechazan.
- **Pruebas rehechas sobre ese esquema:**
  - R10/D11: republicación en la misma fila;
  - H1: códigos de otro inmueble y de publicaciones anteriores;
  - H1b: referencia compartida entre anuncios «inspo»;
  - H1c: se resuelve por republicación real.
- **Batería defensiva.** Las pruebas que necesitan varios anuncios por inmueble están en `test-solicitudes-reparto-multianuncio.sql`. Se ejecutan en una base aparte que quita la unicidad y están marcadas como **no representativas** del esquema actual.

### Pendientes que siguen explícitos

- **Zinto.** Contrato de asignación sin confirmar (§5); no se envía nada.
- **Captura del identificador exacto en la extensión.** Sin ella, la mayoría de las consultas irán a «Por verificar» y «Pendiente de reparto».
- **Reprocesado.** Corre al terminar cada lote de ingesta. Sin lotes, las pendientes esperan.

## 10. Quinta ronda (2026-11-02): tres casos nuevos de Codex sobre la unificación y la evidencia

Las correcciones anteriores no cambian. Los tres casos proceden; cada uno tiene una prueba que **falló antes** de corregir y pasa después.

| # | Caso | Reproducción antes de corregir | Corrección | Pruebas |
|---|---|---|---|---|
| 1 | La solicitud más antigua es una **llamada sin anuncio**; después llegan consultas por los códigos 111 y 222. `planGroupMerge` comparaba cada una solo con la superviviente (la llamada), que no contradice a nadie: absorbía las dos, y un lead escondía dos anuncios distintos. | `✗ Caso 1: llamada antigua + 111 + 222 → absorbe solo la primera consulta` | El planificador fija el anuncio de la consulta unificada con el **primer absorbido que trae anuncio** y compara cada candidato también con ese anuncio. Además, en la unión automática, si el superviviente no traía anuncio **toma el de lo que absorbió** («Cod.», «Ref.» y título): en la siguiente captura ya no es una llamada vacía que acepte cualquier cosa. Lo mismo vale para el botón «Unir», que ahora usa el mismo planificador. | `test:lead-merge`: llamada + 111 + 222 absorbe solo 111; capturas sucesivas (tanda 1: llamada + 111 se unen; tanda 2: 222 no se une al superviviente que ya es de 111); dos llamadas y una consulta se unen en una. |
| 2 | Solicitud antigua del anuncio **A** y dos posteriores del **B**. «Unir» desde una de B tomaba como superviviente la **más antigua del teléfono**, que era A. | `✗ Caso 2: unir desde B → sobrevive b1, absorbe b2, A se queda a la vista` | `planGroupMerge` acepta la solicitud desde la que se pulsa («pivote»): el grupo es el de **esa** consulta, sobrevive la más antigua que es el mismo anuncio y lo demás se queda a la vista. `mergeSamePhoneLeads` lo usa con el lead pulsado. | `test:lead-merge`: desde B sobrevive b1 y absorbe b2, A sigue visible; desde A solo se une la llamada sin anuncio; desde una llamada, se une a la consulta más antigua y a nada más. |
| 3 | «Cod.» **desconocido** (no está en ningún historial) con **otro anuncio guardado**. La ficha mostraba «Publicación anterior» porque el código recibido era distinto del vigente del anuncio guardado, sin mirar el historial. | `previousPublicationCode` frente a la regla anterior («distinto del vigente»), que para el código 900777 devolvía «900210». | La decisión pasa al servidor (`getPreviousPublicationCode`) y a una función pura (`previousPublicationCode`): solo se muestra si el código recibido figura **cerrado** en el historial (`idealista_listing_codes`) de **ese** anuncio. Un código desconocido no lo muestra. | `test:solicitudes-reparto` (función pura, incluida la reproducción de la regla anterior) y QA visual: la solicitud sintética con 900777 y el anuncio de Castelló guardado no muestra «Publicación anterior»; la que llegó por 900199, que sí está en el historial, la sigue mostrando. |

**Pruebas repetidas tras corregir:** `test:lead-merge`, `test:solicitudes-reparto` (15 bloques), `tsc`, los 35 pasos de la CI en local y la QA visual (ver §4, cifras actualizadas). La batería SQL no cambia: ninguna de las tres correcciones toca SQL.

**Límite.** La unión automática solo «dona» el anuncio al superviviente cuando este no tenía ni «Cod.» ni «Ref.»; una llamada antigua a la que ya se le hubiera unido algo **antes** de este cambio sigue sin anuncio hasta que se le una otra consulta o alguien revise el vínculo.


## 11. Estética del Figma (2026-11-02)

Fabricio decidió adoptar la estética del Figma en Solicitudes y Reparto comercial, adaptada al CRM. El detalle (cómo está hecho, qué cambia por pantalla, qué se conserva y qué diferencias quedan) está en [comparacion-figma.md §6](comparacion-figma.md), y las capturas en `comparacion-figma/despues/`. Es un cambio de presentación: no toca la migración, las funciones SQL ni las acciones del servidor, salvo `listingRef`, un campo de solo lectura (Ref. o Cod.) que se añade a la fila de la lista para enseñarlo en la tarjeta.

Verificación: `tsc` limpio; `test:solicitudes-reparto` (18 bloques), `test:lead-merge`, `test:sales-inbox`, `test:crm-appearance` y `test:lead-scope-identity` en verde; `test:typography` sin violaciones en estas pantallas (falla por 27 casos previos de otras pantallas y no está en CI); QA visual 46/46 sobre `next start` + simulador, con la comprobación de «volver» en móvil adaptada a «Volver a tarjetas»; sin desbordamiento horizontal a 390 px en las tres vistas ni en la ficha; sin errores de consola.

### Revisión de Codex del cambio visual (3 hallazgos, corregidos)

| # | Hallazgo | Causa | Corrección | Comprobación |
|---|---|---|---|---|
| 1 | «Registrar contacto» desaparecía en las solicitudes con cliente vinculado | La ficha nueva lo condicionaba a que no estuviera cerrada, y una solicitud con cliente cuenta como «converted». Antes dependía solo del permiso de edición. | `fichaActions` (`lib/sales-inbox/views.ts`): depende solo de `canEdit`, también en las descartadas, como antes. | Prueba unitaria por estado; QA: ficha con cliente en escritorio y barra fija en móvil. |
| 2 | En móvil no había Zinto en las convertidas ni en las descartadas | La barra fija solo salía si se podía editar y no estaba cerrada, y el botón de la cabecera está oculto en móvil. | La barra sale si hay alguna acción: Zinto siempre que haya teléfono, igual que en escritorio. El permiso de mensajes lo sigue comprobando el servidor al abrir la conversación. | Prueba unitaria; QA en móvil con la solicitud con cliente y con la descartada. |
| 3 | El texto de orden no seguía al filtro | Solo distinguía «atención» de «el resto», así que «Más antiguas» seguía diciendo «más recientes». | `effectiveSort` lo usan la página y la bandeja, y `orderLabelKey` da un texto por orden (es/en). | Prueba unitaria; QA con el orden por defecto, «Más antiguas» y «Última actividad». |

Las siete comprobaciones nuevas del QA fallaban contra el build anterior (39/46) y pasan con la corrección (46/46).

## 12. Fusión y despliegue (2026-11-02)

- Fabricio validó la estética en local y confirmó la fusión. PR #386 fusionado en `main` a las 20:40 UTC (commit de fusión `e04e8400`); la CI de `main` sobre ese commit, en verde.
- A los 30 minutos producción seguía sirviendo el build anterior: su CSS no contenía la capa `.sol-root`. Desde fuera del VPS no se puede saber la causa. Lo más probable es el fallo intermitente de Google Fonts al compilar, el mismo que tumbó la CI de `main` en `4495331f`; tras un build fallido, el cron no reintenta porque `main` ya no trae nada nuevo. Este commit, solo de documentación, relanza el despliegue, como hizo #384.
- Cómo comprobarlo sin tocar el VPS: la hoja de estilos que sirve `/login` debe contener `--sol-ink`.

## 13. Vínculo exacto con lo publicado por API, caducidad y fotos (0238, 2026-11-02)

Tras ver Solicitudes en producción, Fabricio señaló cuatro cosas: «Por piso» no agrupaba; el flujo tiene que venir de lo publicado por API; el anuncio consultado tiene que ser exactamente el que contactó el cliente (la ficha enseñaba otros pisos); y las fotos se veían mal. Decisiones: solo caducan las solicitudes sin cliente; a los 30 días se ocultan y a los 60 se borran.

**Causa raíz de lo primero y lo tercero.** La extensión solo capturaba el «Cod.» del anuncio si el modal del inmueble estaba abierto en el hilo, y casi nunca lo está. Sin código no hay vínculo exacto; «Por piso» lo manda todo a «Por verificar» (por regla no se agrupa por dirección) y la ficha enseñaba el emparejamiento antiguo por calle y precio, con su aviso. Estaba en los pendientes del PR («captura del identificador exacto en la extensión»).

**Qué cambia**

| Pieza | Cambio |
|---|---|
| Extensión 1.14.0 | Al capturar un hilo busca el código en el enlace de la tarjeta del anuncio y, si no está, abre el modal del anuncio, lee «Cod.» y «Ref.» y lo cierra con Escape. Si el modal no aparece en 3 s, la solicitud llega sin código (y se enseña «Por verificar»). No se ha podido probar contra idealista.com desde aquí: **Fabricio debe probarla** (recorrido en `validacion.md`, parte G). |
| Migración 0238 | `listings_for_code` cruza el «Cod.» también con `api_property_id` y `api_clone_property_id` (Partner API). Columna `idealista_leads.expired_at`; `lead_retention_sweep(30, 60)`: oculta a los 30 días desde la llegada las solicitudes sin cliente y sin seguimiento futuro, y borra a los 60 (con su actividad y sus donantes unificadas; nunca con cliente). La vista `lead_inbox_facts` excluye las caducadas y expone `listing_cover_url` y `listing_ad_code`. Aditiva e idempotente; reversión en `rollback-0238.sql`. |
| Recepción | Ya no empareja por dirección + precio: sin Ref. ni Cod., la solicitud queda sin inmueble. El «Cod.» se cruza también con los ids de la API. Lanza el barrido de caducidad en cada recepción (no hace falta tocar el crontab del VPS); `/api/cron/api-cleanup` también lo lanza. Una caducada solo revive si el contacto vuelve a escribir (el texto del hilo cambia en una captura de detalle); recapturar el inbox no la revive. |
| Ficha | Sin vínculo exacto: «Anuncio sin identificar», lo recibido de Idealista como texto, sin foto ni ficha de un piso parecido, y las acciones para identificarlo (vincular con motivo, importar). Con vínculo exacto: «Ver anuncio en Idealista» va a `idealista.com/inmueble/<Cod.>/` (el anuncio exacto); la conversación, aparte. |
| Fotos | Solo con vínculo exacto, y la portada de nuestra ficha (nítida) antes que la miniatura del inbox, que era lo que se veía borroso y estirado. Sin vínculo exacto, la tarjeta va sin foto. |

**Pendiente de confirmar por Fabricio:** que el `propertyId` que devuelve la Partner API es el mismo número que el «Cod.» del inbox y el de la URL pública (`idealista.com/inmueble/<id>/`). Se comprueba abriendo un anuncio nuestro publicado por API y comparando. Si no coincidiera, el cruce con `api_property_id` no emparejaría y habría que pedir ese dato a la API.

**Verificación.** SQL (`scripts/sql/test-solicitudes-reparto.sh`): 0238 aplicada dos veces, `test-solicitudes-retencion.sql` (cruce con API y clon, portada y código en la vista, barrido: oculta/borra/conserva con cliente o seguimiento futuro, donantes, idempotencia, argumentos inválidos, permisos) y reversión de 0238 y de las dos migraciones con reaplicación. Unitarias: `idealistaAdUrl`. QA visual: seis comprobaciones nuevas (sin vínculo exacto no hay inmueble ni foto; enlace al anuncio exacto por código; anuncio publicado por API con vínculo exacto y grupo propio en «Por piso»; caducada invisible).

## 14. Estética: vuelta al lenguaje del CRM (2026-11-02)

Con las funciones ya validadas, Fabricio pidió que Solicitudes y Reparto se vean como el resto del CRM. Se mantiene la composición del Figma y se cambia el lenguaje visual (Lato y Optima en mayúsculas, tinta, crema y oro, esquinas del CRM). Detalle en [comparacion-figma.md §7](comparacion-figma.md). Cambio solo de presentación: la capa `.sol-root` pasa a beber de los tokens del CRM y los componentes solo cambian radios. Guarda tipográfica sin fallos en estas pantallas; `test:crm-appearance` en verde.

## 15. Aviso de extensión desactualizada y paquete descargable (2026-11-03)

Tras el despliegue de 0238, producción seguía enseñando todo «Por verificar»: las 604 solicitudes se capturaron con la extensión anterior, que no leía el código del anuncio, y la extensión está instalada en el Chrome de quien captura el inbox (no en el Mac de Fabricio; las capturas no van firmadas por usuario). Para que la actualización no dependa de explicaciones:

- La extensión (1.14.1) manda su versión en cada envío; la recepción guarda la última captura en `app_settings` (`idealista.extension_capture`: versión, fecha, cuántas llegaron y cuántas con código).
- Solicitudes muestra un aviso, a quien trabaja la bandeja, cuando la última captura viene de una versión anterior a la 1.14.0 (o sin versión), con los tres pasos y, para administradores, el botón «Descargar extensión» (`GET /api/admin/idealista/extension-download`: zip construido en el momento desde `chrome-extension/` del propio despliegue, sin dependencias). El aviso desaparece solo con la primera captura de la versión exigida.
- El cajón «Por verificar» de «Por piso» pasa a ser una fila sencilla que explica por qué están ahí esas solicitudes, sin foto ni precio.

Verificación: unitarias (comparación de versiones; el zip se lista y se comprueba con `unzip`), guarda tipográfica sin fallos, QA visual con la comprobación del aviso y su enlace de descarga.

### Despliegue de #389 (2026-11-02, 23:16 UTC)

Fusionado como `8ef00f80`. Trece minutos después, producción seguía sirviendo el build anterior (los chunks compartidos de `/login` no cambiaron); como con #386, lo más probable es el fallo intermitente de Google Fonts al compilar, tras el cual el cron no reintenta. Este commit relanza el despliegue. Nota: las rutas bajo `/api/admin` responden 401 sin sesión aunque no existan, así que no sirven como señal de build nuevo.

## 16. Anuncios retirados y republicados, y respuesta inmediata (0241, 2026-11-03)

Con la extensión ya actualizada (las solicitudes nuevas llegan con «Vínculo exacto»), Fabricio planteó: los anuncios se suben y se bajan a menudo; lo nuevo debe verse como nuevo, lo de anuncios retirados aparte mientras dure su plazo, y el origen de cada cliente siempre. Además, los botones se notaban lentos.

**Qué es «Anuncio sin identificar».** Dos casos: (1) llamadas perdidas, que la extensión anterior a la 1.15 capturaba sin leer el código del anuncio (lo arregla la 1.15.0 del PR #392, que abre el modal de la tarjeta también en las llamadas); (2) solicitudes capturadas antes de la 1.14, sin código. Las dos caducan a los 30 días sin cliente.

**El origen no se pierde.** Un anuncio publicado nunca se borra de la base: se archiva (`/api/admin/idealista/delete-listing`). La solicitud guarda además el título, el precio y el código con que llegó. Faltaba un caso: un anuncio borrado y vuelto a publicar por la API cambia de `api_property_id`, y el historial de códigos (0237) solo seguía `idealista_property_id`.

| Pieza | Cambio |
|---|---|
| Migración 0241 | Trigger `idealista_listing_api_code_history`: el historial guarda también `api_property_id` y `api_clone_property_id` (`source = 'api'`), cerrando el anterior al cambiar. La vista añade `listing_retired`: archivado en el CRM, dado de baja por la API (`api_state` inactive/deleted) o despublicado; si solo hay ficha propia, su archivo. Aditiva e idempotente; reversión en `rollback-0241.sql`. |
| «Por piso» | Primero los anuncios publicados; después, bajo «Anuncios retirados», los que ya no lo están (foto en gris, «Anuncio retirado»); al final «Por verificar». |
| Tarjeta y ficha | «Anuncio retirado» junto a la referencia y el vínculo; en la ficha, la nota de que la solicitud conserva de qué piso venía. |
| Botones | El segmento, la vista, los filtros y la solicitud pulsada se reflejan al instante (estado optimista de la URL) y una barra fina indica que llega la página; la ficha se abre en el acto con «Cargando la solicitud…». |

Verificación: SQL (0241 aplicada dos veces; el id antiguo de la API sigue llevando al anuncio; clon; retirado por API, por archivo y por ficha propia; vuelta a publicar; reversión de 0241 y de la cadena 0237→0241 con reaplicación), unitarias en verde, guarda tipográfica sin fallos, QA visual con tres comprobaciones nuevas (sección de retirados, marca en la tarjeta con su origen, y botón marcado antes de que responda un servidor lento a propósito).

## 17. Menos ruido, asesor del piso a la vista, anuncios retirados fuera y sugerencia confirmable (2026-11-03)

Fabricio y su jefe, con la bandeja ya funcionando: menos ruido («Atención» se aplaza), ver desde Solicitudes qué asesor tiene cada piso, que al reemplazar anuncios la bandeja «se limpie» sola y lo nuevo entre limpio, y que un «Anuncio sin identificar» cuyo texto dice claramente el piso no se quede sin salida.

| Pieza | Cambio |
|---|---|
| «Atención» | Sin segmento (sigue por URL `?view=needs-attention` y como orden por prioridad). La vista por defecto pasa a «Todas»; su orden, las más recientes. |
| «Retirados» | Vista nueva. Las solicitudes de anuncios retirados (0241) salen SOLO ahí: en cuanto se baja un anuncio desaparecen de «Todas», «Nuevas», «Por piso» y «Prioridades», y lo que llegue por los anuncios nuevos entra limpio. Conservan su origen y caducan a los 30 días sin cliente. Los contadores siguen la misma regla. |
| Asesor del piso | Cada anuncio de «Por piso» dice a quién manda Reparto comercial sus consultas nuevas («Asesor del piso: …» o «Sin asesor en Reparto comercial»). |
| Sugerencia | Sin anuncio identificado, la ficha ofrece el que coincide por calle y precio (el emparejamiento antiguo, ahora como pregunta): «¿Es este anuncio?» con «Sí, es este» (vínculo manual auditado, con motivo fijo) o «No es este». Nunca se vincula solo. |

**Sincronización al subir y bajar anuncios.** Una baja hecha desde el CRM o por la API (archivar, dar de baja) se refleja al momento en Solicitudes. Una baja hecha a mano en el panel de Idealista solo se refleja cuando el CRM se entera (sincronización API → CRM); por eso conviene bajar y subir siempre desde el CRM.

Verificación: unitarias y guarda tipográfica; QA visual con comprobaciones nuevas (sin «Atención», «Retirados» aparte y excluidos de «Todas», asesor del piso, sugerencia ofrecida y retirable) y las de orden adaptadas a la vista por defecto nueva.

## 18. Cabecera ligera (maqueta del 3 de noviembre; pendiente de aprobación del jefe)

Solo presentación de la cabecera de Solicitudes; los controles se comportan igual, con foco visible de teclado y zonas de 44 px en móvil.

- **Estados** (Nuevas, Seguimiento, Mías, Pendiente de reparto, Todas, Retirados): pestañas sin recuadro, texto normal, contador en gris discreto, la activa con una línea fina en dorado apagado sobre el filete del grupo. «Atención» sigue oculta (decisión del 3 de noviembre).
- **Fila de controles:** desaparece la línea «N solicitudes · Primero …» en todas las vistas; «Todas / Venta / Alquiler / Sin determinar» va a la izquierda, alineado con las tarjetas, y «Seleccionar» a su lado. El orden sigue en Filtros, cuyo selector refleja el aplicado.
- **Vistas:** «Tarjetas / Por piso / Prioridades» en un selector compacto a la derecha, con un solo borde exterior y fondo tenue para la activa.
- **Filtros:** borde fino junto al buscador y contador pequeño redondo cuando hay filtros activos.

Capturas para el jefe, en claro y en oscuro, con Nuevas, Venta y Tarjetas seleccionadas: `comparacion-figma/despues/A01_Cabecera_claro.png` y `A01_Cabecera_oscuro.png`. Verificación: guarda tipográfica sin fallos y QA visual con las comprobaciones de la cabecera (sin línea de resultados, orden visible en Filtros, pestaña activa con `aria-selected`).

**Corrección posterior (4 de noviembre).** El color `sol-accent` no estaba registrado en `tailwind.config.ts`, así que las clases `*-sol-accent` de esta cabecera no generaban CSS: la línea dorada de la pestaña activa y el borde de «Filtros» abierto no se pintaban. Queda registrado en §19, y la QA mide ahora el color real de la línea.

## 19. Ficha de la solicitud por pestañas (maquetas del 4 de noviembre)

Rediseño de la ficha con tres maquetas: «Resumen», «Actividad» y «Cliente y datos». Los datos de ejemplo de las maquetas se sustituyen por los reales de cada solicitud.

**Cabecera común.** Nombre, estado (recuadro pequeño en versalitas) y origen («Idealista · referencia · hace…»). A la derecha, «Volver a tarjetas» (o a la vista de la que se vino) y una línea discreta «● Responsable · nombre» o «Por asignar». El motivo del reparto, el estado de Zinto (con «Reintentar» para administradores) y los cambios de responsable quedan en su desplegable, que se cierra con Escape o al pulsar fuera. «Asignar asesor» (sin responsable) o «Cambiar» (con responsable) solo para administradores. Con cliente vinculado, «Cambiar» abre la reasignación del cliente completo, con su alcance, como antes.

**Pestañas.** Ligeras, con una línea fina dorada bajo la activa; las flechas izquierda y derecha pasan de una a otra.

| Pestaña | Columna izquierda | Columna derecha |
|---|---|---|
| Resumen | «Anuncio consultado»: foto, título, precio, referencia y vínculo; «Ver anuncio original» (solo con vínculo verificado), «Ficha interna», «Preparar visitas» y «Revisar vínculo». Debajo, «Lo que preguntó»: mensaje, presentación y viñetas recortados, con «Ver mensaje completo», «Traducir» y «Abrir conversación en Idealista». | «Siguiente paso»: «Registrar contacto» como acción principal (dorado apagado), «Abrir Zinto» y «Llamar» como secundarias, el estado de WhatsApp y «Descartar». Debajo, «Actividad reciente» (los dos últimos eventos) con «Ver actividad». |
| Actividad | «Historial de la solicitud»: fecha, autor y contenido; los cuatro últimos a la vista y «Ver historial completo» bajo demanda. | «Próximo seguimiento»: fecha, hora y acción; «Editar» (cambiar o quitar) y «Marcar como hecho», que abre «Registrar contacto» con la tarea ya marcada: resultado y próxima tarea se guardan juntos, el historial se conserva y la solicitud sigue abierta. Debajo, «Añadir nota». |
| Cliente y datos | «Contacto»: «WhatsApp · Zinto» y «Llamadas», dos campos independientes con su acción al lado y un solo «Guardar teléfonos»; el correo del cliente vinculado; el teléfono recibido de Idealista como evidencia. | «Cliente en el CRM» (vinculado con acceso a su ficha, o buscar, vincular y crear como antes) y «Anuncio de origen» con miniatura, referencia y «Ver evidencia» (en un diálogo). |

Se mantienen las condiciones de antes: sin vínculo exacto no hay foto ni ficha de un piso «parecido» y no se prepara visita; la sugerencia «¿Es este anuncio?» se ofrece y no se afirma; la asignación es solo de administradores y el cliente conserva su único asesor. Abrir Zinto o llamar siguen sin registrar un contacto.

**Dos teléfonos (migración 0242).** `idealista_leads.zinto_phone` y `call_phone`, aditivas. NULL significa «usa el recibido» (`phone`), así que las solicitudes existentes empiezan con su teléfono de siempre en los dos campos. `phone` no se modifica nunca desde la ficha: es la evidencia del origen y de él salen los duplicados y la fusión. «Abrir Zinto» usa el de WhatsApp y «Llamar» el de llamadas en toda la ficha (también en la barra fija del móvil). `saveLeadPhones` comprueba el permiso de edición y el alcance, admite solo cifras, espacios y «+» (7 a 15 cifras), guarda NULL si el número coincide con el recibido y deja el cambio en el historial («Teléfonos actualizados», con autor). El estado de WhatsApp se sigue leyendo por `lead_id`, así que funciona igual con un número de Zinto distinto. Reversión: `rollback-0242.sql`.

De paso, la ficha lee por fin `extra_phones` (0239): la consulta del detalle no lo pedía y la lista «En su mensaje» salía siempre vacía.

**Encaje.** A 1440 × 900 el contenido inicial de cada pestaña cabe sin desplazamiento vertical, en claro y en oscuro (la QA mide la altura de la página y el borde del último panel). En móvil las secciones se apilan, sin scroll lateral, con pestañas de 48 px y la acción principal fija abajo.

**Capturas para revisar** (1440 × 900, oscuro): `comparacion-figma/despues/A02_Ficha_resumen_oscuro.png`, `A02_Ficha_actividad_oscuro.png` y `A02_Ficha_cliente_oscuro.png`.

**Verificación.**

- SQL (Postgres 16 desechable): 0242 aplicada dos veces, dos números distintos sin tocar el recibido ni sus dígitos, un número demasiado corto rechazado; reversión y reaplicación.
- QA visual: 100/100. Entre las nuevas: encaje de las tres pestañas en claro y oscuro; línea dorada pintada (bandeja y ficha); pestañas con teclado; «Ver anuncio original» distinto de la conversación; dos teléfonos distintos que persisten tras recargar, «Llamar» con el de llamadas en las dos pestañas y «Abrir Zinto» con el de WhatsApp; el cambio en el historial sin registrar contacto; número imposible rechazado por el servidor; solicitud antigua con su teléfono en los dos campos; cliente vinculado con su ficha y correo; usuaria sin permiso de edición (agent_junior) sin guardar, registrar, seguimiento, nota ni asignación; «Marcar como hecho» con la tarea marcada; móvil apilado.
- Para que «persiste tras recargar» se pueda comprobar, el simulador tiene una opción `--persist` (escrituras en memoria mientras dura el proceso; sin ella, todo sigue igual) y entiende el filtro `like`, con el que la ficha busca duplicados.
- El build local usa las fuentes de Google descargadas (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` de Next, fuera del repositorio): Google devolvía a veces una URL de fuente sin extensión y `next/font` tumbaba el build, el mismo fallo intermitente que ha parado la CI y los despliegues.

**Despliegue (4 de noviembre).** #396 se fusionó a las 00:01 UTC, pero a las 00:15 producción seguía con la versión anterior: el build del VPS no salió, con toda probabilidad por el fallo intermitente de Google Fonts en `next/font`. Se relanza con este cambio de documentación.
