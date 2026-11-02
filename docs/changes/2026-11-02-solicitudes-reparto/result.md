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
| D8 | Si al vincular un cliente su asesor no coincide con el responsable de la solicitud, la solicitud queda en **conflicto visible**. No se elige ninguno en silencio. | Evita dos responsables y cambios silenciosos. |
| D9 | Zinto: el cambio de responsable se guarda en una cola recuperable (`zinto_owner_sync`, en estado «pendiente · falta contrato»). **No se envía nada.** | El repo no tiene contrato de asignación (ver §5). |
| D10 | Paleta y tipografía: se usan los tokens actuales del CRM (incluido el modo oscuro), no la paleta propuesta en Figma. | El propio diseño la marca «pendiente de validar con la marca». |
| D11 | Textos nuevos en español e inglés. Francés y alemán muestran el español hasta que se traduzcan. | Es el mecanismo que ya tiene el diccionario para cualquier clave sin traducir. |

## 3. Etapas y commits

1. `48528640`: migración `0237` y batería SQL local.
2. `76e1bcbc`: servidor del reparto, vínculo auditado y «Registrar contacto» atómico.
3. `1151315c`: pantalla «Reparto comercial» y `Modal` accesible (Escape, foco atrapado y foco devuelto).
4. `00923a8f`: las tres vistas y la ficha nueva.
5. Este commit: ajustes de la QA visual, generador de datos sintéticos, recorrido de QA y este expediente.

## 4. Verificación

Todo se ejecutó en local, con datos sintéticos. No se tocó producción ni ningún sistema externo.

| Comprobación | Comando | Resultado |
|---|---|---|
| Lint de migraciones | `python3 scripts/lint-migrations.py` | OK |
| Tipos | `npx tsc --noEmit` | OK |
| Pasos de la CI (todos salvo el build, que se hizo aislado) | cada `npm run test:*` de `ci.yml` | 34/34 OK |
| Reparto offline (nueva, en la CI) | `npm run test:solicitudes-reparto` | 13 bloques OK |
| Regla de reparto en Postgres 16 local, migración aplicada dos veces, concurrencia real (R12), reversión y reaplicación | `BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/test-solicitudes-reparto.sh` | 90 comprobaciones OK |
| Build de producción aislado (`.env.production` apartado sin leerse, variables ficticias) | `NEXT_BUILD_DIR=.next.qa npx next build` | OK |
| QA visual sobre `next start` + simulador, escritorio 1440 y móvil 390 | `scripts/qa/solicitudes-reparto-qa.mts` | 30/30 OK, sin errores de consola |

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
| R12 | SQL con dos sesiones simultáneas: una sola primera asignación; la segunda solicitud hereda. |
| D01–D05, D11, D12 | SQL: Cod. y Ref. exactos, sin asociación por dirección, ambiguo o en conflicto nunca elige el primero, la evidencia exacta corrige el enlace por dirección y la corrección manual no se pisa. |
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
- **Fuera de alcance.** No se ha implementado la relación «Propiedad propuesta» (alternativas) ni el registro histórico de publicaciones por anuncio. El vínculo usa los anuncios que existen hoy en `idealista_listings`.

## 6. Migración `0237`

- **Recuperación.** `rollback-0237.sql` en este expediente (lo ejecuta una persona). Restaura la vista de `0161` y elimina lo añadido. **No se pierde ningún responsable**, porque `assigned_to` y `assigned_advisor_id` son columnas anteriores. Sí se pierden las reglas, la auditoría y la cola creadas después. Probado en local: reversión y reaplicación.
- **Compatibilidad.** Todas las columnas nuevas tienen valor por defecto o admiten nulos, y la vista solo añade columnas al final. El código anterior funciona con el esquema nuevo. Si falla el health check y vuelve el build anterior, el esquema nuevo no le afecta.
- **Transacciones.** No hay `BEGIN`/`COMMIT` propio y todo es idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE`). La clasificación del histórico solo toca filas sin clasificar.
- **Acceso.** Tablas con RLS sin políticas y funciones con `REVOKE` a `PUBLIC`/`anon`/`authenticated`: solo `service_role` puede usarlas.

## 7. Cómo reproducir la QA visual

```sh
node --experimental-strip-types scripts/sim/fixtures/crm-01-admin.gen.mts <scratch>/base.json <scratch>/img
node --experimental-strip-types scripts/sim/fixtures/solicitudes-reparto.gen.mts <scratch>/base.json <scratch>/fixture.json
node --experimental-strip-types scripts/sim/postgrest-sim.mts 54381 <scratch>/fixture.json <scratch>/sim.jsonl <scratch>/img --auth
mv .env.production <scratch>/   # sin leerlo; se devuelve al terminar
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54381 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon \
  SUPABASE_SERVICE_ROLE_KEY=dummy-service NEXT_BUILD_DIR=.next.qa npx next build
# mismas variables + npx next start -H 127.0.0.1 -p 3281
BASE=http://127.0.0.1:3281 OUT_DIR=<scratch>/shots node --experimental-strip-types scripts/qa/solicitudes-reparto-qa.mts
```

## 8. Revisión

No se ha hecho la revisión de Codex ni la QA visual de Fabricio.
