# Encargos múltiples por cliente con matching y avisos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un cliente puede tener N encargos; cada uno hace matching por separado (propiedades del CRM y particulares/captaciones de portales) y avisa en la campanita al asesor asignado y a los admins, con enlace directo al encargo y al elemento.

**Architecture:** `client_preferences` pasa a admitir varias filas por cliente (`id` PK, `is_primary`, `status`…); los lectores actuales filtran por la fila principal. Una tabla `encargo_matches` registra lo ya detectado (dedupe). Un cron evalúa lo nuevo con los motores existentes (`evaluateMatch`, `evaluateParticularRow`) y un pase inicial evalúa el stock actual al crear/reactivar/editar un encargo. Los avisos van a `crm_notifications` (`type = 'encargo_match'`).

**Tech Stack:** Next.js (App Router) + TypeScript, Postgres self-hosted (contenedor `supabase-db`), tests con `node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-*.mts`.

**Spec:** `docs/superpowers/specs/2026-11-06-encargos-matching-design.md` (rama `feat/encargos-matching`, worktree `/root/wt-encargos`).

## Global Constraints

- Nada se fusiona, empuja ni despliega sin OK del dueño. Todos los commits son locales en `feat/encargos-matching`.
- **Nunca** ejecutar migraciones ni escrituras contra la base `postgres` de producción: las pruebas de SQL van contra una base desechable `encargos_test` creada dentro de `supabase-db`.
- Migraciones: `supabase/migrations/0243_encargos_multiples.sql`, aditiva e idempotente, con rollback en `docs/changes/2026-11-06-encargos-matching/rollback-0243.sql` (convención de la 0242).
- **Solo España (`es`).** Chile no tiene nada que ver con esta función: sin encargos múltiples, sin avisos, sin adaptador de captaciones de Chile. El comportamiento actual de los clientes `cl` no cambia (siguen con su única preferencia principal). Un admin solo recibe avisos si tiene acceso a `es`.
- El motor de puntuación no cambia salvo el tope de precio por dormitorios (`max_price_by_bedrooms`).
- Un encargo principal no se puede pausar ni cerrar; los lectores existentes filtran solo por `is_primary`.
- Matching lee TÍTULO, DESCRIPCIÓN y CARACTERÍSTICAS (y `attrs`, `floor`, `condition` en particulares) con regex sobre texto sin tildes; descarta solo con evidencia explícita y avisa en `warnings` si falta el dato.
- Cron nuevo protegido con `cronAuthorized` (`lib/auth/cron-secret.ts`); instalación en el crontab del VPS a mano, la hace el dueño.
- Tests siempre con el patrón `scripts/test-*.mts` + script `npm run test:encargos`.

## Review Focus

1. Anuncio con precio 0 / «a consultar» o sin zona: no debe avisar ni romper (hoy `evaluateMatch` lo descarta por precio si el encargo tiene presupuesto).
2. Encargo con brief insuficiente (`briefSuggestMissing` ≠ vacío, p. ej. sin zonas): no evalúa ni avisa, y no se marca como visto.
3. Carga masiva (1.000 particulares nuevos en una pasada): como mucho 1 aviso agrupado por encargo y pasada, con tope de elementos en `data`.
4. Cliente sin asesor, asesor suspendido o sin admin del país: no crashea; no hay aviso y los matches quedan **sin** `notified_at` para avisar cuando haya destinatario.
5. Dos pasadas del cron solapadas o un encargo editado dos veces seguidas: nunca duplica avisos (clave única + `insert … on conflict do nothing returning`).

---

## File Structure

- Create `supabase/migrations/0243_encargos_multiples.sql`, `docs/changes/2026-11-06-encargos-matching/{README.md,rollback-0243.sql}` — esquema.
- Create `lib/encargos/model.ts` — tipos y `encargoFromRow`, reglas de estado.
- Create `lib/encargos/links.ts` — `encargoLink`.
- Create `lib/encargos/recipients.ts` — destinatarios (puro + lectura).
- Create `lib/encargos/notice.ts` — `buildNotice` (puro).
- Create `lib/encargos/plan.ts` — `planEncargoRun` (puro: dedupe, línea base, agrupado).
- Create `lib/encargos/sources.ts` — adaptadores de fuente (propiedades y particulares).
- Create `lib/encargos/runner.ts` — IO: cron y pase inicial.
- Create `lib/db/queries/encargos.ts` y `app/[country]/(admin)/admin/clientes/[id]/encargos-actions.ts` — CRUD.
- Create `app/api/cron/encargo-matches/route.ts`.
- Modify `lib/clients/brief.ts`, `lib/clients/brief-match.ts` — tope por dormitorios.
- Modify los ~24 lectores de `client_preferences` (lista en Task 3) — filtro por principal.
- Modify `lib/db/queries/suggested-properties.ts`, `suggested-particulares.ts` — opción `encargoId`; particulares lee `description`.
- Modify `app/api/admin/notifications/route.ts` + componente de la campanita — tipo `encargo_match`.
- Create `app/[country]/(admin)/admin/clientes/[id]/_components/encargos-section.tsx` — UI; modify `client-ficha-view.tsx`, bloques de matching.
- Create `scripts/seed-yeanette-encargos.mts`; tests `scripts/test-encargos-*.mts`.

---

### Task 1: Migración 0243 — varias búsquedas por cliente y registro de matches

**Files:**
- Create: `supabase/migrations/0243_encargos_multiples.sql`, `docs/changes/2026-11-06-encargos-matching/rollback-0243.sql`, `docs/changes/2026-11-06-encargos-matching/README.md`
- Test: `scripts/test-encargos-migration.sh`

**Interfaces:**
- Produces: columnas de `client_preferences`: `id uuid` (PK), `label text not null default 'Encargo 1'`, `status text not null default 'active'` (`active|paused|closed`), `is_primary boolean not null default true`, `position int not null default 0`, `end_client_label text`, `max_price_by_bedrooms jsonb`, `baseline_at timestamptz not null default now()`. Índice único parcial `client_preferences_one_primary (client_id) where is_primary`. Tabla `encargo_matches(id uuid pk, encargo_id uuid fk client_preferences(id) on delete cascade, source text check in ('property','particular'), source_id text, canonical_id text, score int, first_seen_at timestamptz default now(), notified_at timestamptz, unique(encargo_id, source, canonical_id))`.

- [ ] **Step 1: Escribir `scripts/test-encargos-migration.sh`**: crea `encargos_test` en `supabase-db` (`createdb`), carga el esquema de `public` con `pg_dump --schema-only postgres`, inserta 2 clientes con preferencias, aplica 0243 **dos veces** (idempotencia), y comprueba con `psql` que: cada fila previa queda `is_primary=true, status='active'`; se puede insertar una segunda fila del mismo `client_id` con `is_primary=false`; una segunda `is_primary=true` falla; `encargo_matches` rechaza un duplicado `(encargo_id, source, canonical_id)`; ejecutar el rollback devuelve la PK a `client_id` (con una sola fila por cliente) y borra `encargo_matches`. Termina con `dropdb encargos_test`.
- [ ] **Step 2: Ejecutar `bash scripts/test-encargos-migration.sh`** — Esperado: FAIL (falta la migración).
- [ ] **Step 3: Escribir la migración** con `ADD COLUMN IF NOT EXISTS`, `id` con `gen_random_uuid()` rellenado para filas existentes, cambio de PK `client_id` → `id` y `client_id` pasa a índice normal + FK que ya existe; `encargo_matches` se crea vacía: la precarga del stock actual como «visto» de los encargos existentes la hace `scripts/seed-encargo-baseline.mts` (Task 7), no la migración. Rollback: solo válido con una fila por cliente (aborta con mensaje si hay más).
- [ ] **Step 4: Ejecutar el script de nuevo** — Esperado: PASS con todas las comprobaciones.
- [ ] **Step 5: Commit** `feat(encargos): migración 0243 (varios encargos por cliente + encargo_matches)`.

---

### Task 2: Modelo, reglas de estado y tope de precio por dormitorios

**Files:**
- Create: `lib/encargos/model.ts`, `lib/encargos/links.ts`
- Modify: `lib/clients/brief.ts` (`BriefInput`, `EMPTY_BRIEF`, `buildPreferencesPayload`, `briefFromRow`), `lib/clients/brief-match.ts` (precio en `evaluateMatch`)
- Test: `scripts/test-encargos-model.mts`, ampliar `scripts/test-client-brief.mts`

**Interfaces:**
- Produces:
  - `type EncargoStatus = "active" | "paused" | "closed"`; `type EncargoSource = "property" | "particular"`.
  - `type Encargo = { id: string; clientId: string; label: string; endClientLabel: string | null; status: EncargoStatus; isPrimary: boolean; position: number; baselineAt: string; brief: BriefInput }`.
  - `encargoFromRow(row: Record<string, unknown>): Encargo`.
  - `validateStatusChange(e: Pick<Encargo, "isPrimary" | "status">, next: EncargoStatus): { ok: true } | { ok: false; error: string }` (error si `isPrimary && next !== "active"`).
  - `encargoLink(country: "es", clientId: string, encargoId: string, highlight?: { source: EncargoSource; id: string }): string` → `/{country}/admin/clientes/{clientId}?encargo={encargoId}[&destacar={source}:{id}]#matching`.
  - `BriefInput.maxPriceByBedrooms: Record<string, number> | null`.

- [ ] **Step 1: Tests (rojos)** en `test-encargos-model.mts`: `validateStatusChange({isPrimary:true,status:"active"},"paused")` → `ok:false`; `{isPrimary:false}` a `"closed"` → `ok:true`; `encargoLink("es","c1","e1",{source:"particular",id:"p9"})` === `"/es/admin/clientes/c1?encargo=e1&destacar=particular:p9#matching"`. En `test-client-brief.mts`: brief alquiler con `maxPrice: 6300` y `maxPriceByBedrooms: {"3":5200,"4":6300}`; propiedad de 3 dorm. a 5.500 € → `excluded:true, reason:"price"`; de 4 dorm. a 5.500 € → no excluida; de 3 dorm. a 5.200 € → no excluida; sin `maxPriceByBedrooms` el comportamiento actual no cambia (regresión). Y round-trip `briefFromRow(buildPreferencesPayload(b))` conserva `maxPriceByBedrooms`.
- [ ] **Step 2: Ejecutar `npm run test:client-brief` y `node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-encargos-model.mts`** — Esperado: FAIL.
- [ ] **Step 3: Implementar** lo anterior. En `evaluateMatch` el techo efectivo es `maxPriceByBedrooms[String(p.bedrooms)] ?? brief.maxPrice` aplicado antes del cálculo de `flex`.
- [ ] **Step 4: Repetir los tests y `npx tsc --noEmit`** — Esperado: PASS y sin errores de tipos.
- [ ] **Step 5: Commit** `feat(encargos): modelo, estado del principal y tope de precio por dormitorios`.

---

### Task 3: Los lectores y escritores actuales siguen viendo «la» preferencia (principal)

**Files:**
- Modify: los ficheros que leen `client_preferences`: `app/[country]/(admin)/admin/captaciones/captacion-actions.ts`, `app/[country]/(admin)/admin/particulares/client-flow-actions.ts`, `app/[country]/(admin)/admin/clientes/property-offer-actions.ts`, `app/[country]/(admin)/admin/clientes/[id]/actions.ts`, `app/api/public/property-alerts/unsubscribe/route.ts`, `app/api/cliente/preferences/route.ts`, `app/api/admin/clientes/[clientId]/suggested-properties/route.ts`, `app/api/cron/property-alerts/route.ts`, `app/(admin)/admin/clientes/actions.ts`, `app/(cliente)/actions.ts`, `app/(cliente)/perfil/page.tsx`, `app/(cliente)/inicio/page.tsx`, `lib/email/property-offer.ts`, `lib/clients/brief.ts`, `lib/viewing-collections/public-contract.ts`, `lib/db/queries/{suggested-particulares,client-command-center,clients,suggested-properties,client-preferences}.ts`
- Create: `scripts/check-client-preferences-usage.mjs`
- Test: el propio script (lint de uso)

**Interfaces:**
- Produces: convención «toda consulta a `client_preferences` por `client_id` añade `.eq("is_primary", true)`; todo `upsert(..., { onConflict: "client_id" })` pasa a `update(...).eq("client_id", id).eq("is_primary", true)` o `upsert` sobre la fila principal»; las filas nuevas de un cliente sin preferencias se insertan con `is_primary: true`.

- [ ] **Step 1: Escribir `scripts/check-client-preferences-usage.mjs`**: recorre `app/` y `lib/`, y por cada `.from("client_preferences")` exige en las ~6 líneas siguientes `is_primary` o un comentario `// encargo-ok: <motivo>`; falla listando fichero:línea. Excluye `lib/encargos/**` y `lib/db/queries/encargos.ts`.
- [ ] **Step 2: Ejecutar `node scripts/check-client-preferences-usage.mjs`** — Esperado: FAIL con la lista de lectores pendientes.
- [ ] **Step 3: Aplicar el filtro a cada fichero de la lista**, uno a uno; `getSuggestedProperties` y `getSuggestedParticulares` ganan `opts.encargoId?: string` (si viene, `.eq("id", encargoId)` en vez de `is_primary`) — se usa en Task 5. Las escrituras de preferencias (`saveClientPreferencesFull`, `createClientWithBrief`, `captacion-actions`, `unsubscribe`) actualizan la fila principal; `createClientWithBrief` inserta `is_primary: true`.
- [ ] **Step 4: Ejecutar el script, `npx tsc --noEmit`, `npm run test:client-brief` y `npm run test:captaciones-filters`** — Esperado: PASS (el script no lista nada).
- [ ] **Step 5: Commit** `refactor(encargos): lectores y escritores de client_preferences apuntan al principal`.

---

### Task 4: CRUD de encargos y reglas del principal

**Files:**
- Create: `lib/db/queries/encargos.ts`, `app/[country]/(admin)/admin/clientes/[id]/encargos-actions.ts`
- Test: `scripts/test-encargos-actions.mts` (con base de pruebas `encargos_test` y el cliente Postgres que usan los tests de import-drafts: `--import ./scripts/shims/test-loader-db-psql.mjs`)

**Interfaces:**
- Consumes: `Encargo`, `validateStatusChange`, `encargoFromRow` (Task 2); `buildPreferencesPayload` (`lib/clients/brief.ts`).
- Produces:
  - `listEncargos(clientId: string): Promise<Encargo[]>` (orden: principal primero, luego `position`).
  - `getEncargo(encargoId: string): Promise<Encargo | null>`.
  - `createEncargo(clientId: string, input: { label: string; endClientLabel?: string | null; brief: BriefInput }): Promise<{ ok: true; encargo: Encargo } | { ok: false; error: string }>` — `baseline_at = now()`, `is_primary` false salvo que el cliente no tenga ninguno.
  - `updateEncargo(encargoId: string, patch: { label?: string; endClientLabel?: string | null; brief?: BriefInput }): Promise<Result>` — si cambia `brief`, pone `baseline_at = now()` para disparar el pase inicial.
  - `setEncargoStatus(encargoId: string, next: EncargoStatus): Promise<Result>` (valida con `validateStatusChange`; reactivar pone `baseline_at = now()`).
  - `makePrimary(encargoId: string): Promise<Result>` (transacción: quita `is_primary` al actual y lo pone al nuevo).
  - Server actions con los mismos nombres + `Action` (`createEncargoAction`…) que comprueban sesión staff y el alcance del cliente (`view-scope`).

- [ ] **Step 1: Test (rojo)**: crear 2º encargo → `isPrimary:false`; pausar el principal → `ok:false`; `makePrimary` del 2º y luego pausar el 1º → `ok:true`; reactivar actualiza `baselineAt`; editar `brief` actualiza `baselineAt`; un asesor sin alcance sobre el cliente recibe `ok:false`.
- [ ] **Step 2: Ejecutar el test** — Esperado: FAIL.
- [ ] **Step 3: Implementar** consultas y acciones; las acciones llaman a `revalidatePath` de la ficha en `es`. Las acciones y el cron rechazan clientes con `country = 'cl'`.
- [ ] **Step 4: Ejecutar el test y `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): CRUD y reglas del encargo principal`.

---

### Task 5: Matching por encargo (propiedades y particulares), leyendo el texto

**Files:**
- Modify: `lib/db/queries/suggested-properties.ts`, `lib/db/queries/suggested-particulares.ts`
- Create: `lib/encargos/sources.ts`
- Test: `scripts/test-encargos-sources.mts`, ampliar `scripts/test-client-brief.mts`

**Interfaces:**
- Consumes: `evaluateMatch`, `evaluateParticularRow` (en `suggested-particulares.ts`, exportarla si no lo está), `Encargo`.
- Produces:
  - `type SourceItem = { source: EncargoSource; id: string; canonicalId: string; title: string; zone: string | null; price: number; createdAt: string }`.
  - `type ItemMatch = { item: SourceItem; score: number; reasons: string[]; warnings: string[] }`.
  - `matchStockForEncargo(encargo: Encargo): Promise<ItemMatch[]>` — todo el stock actual.
  - `matchNewForEncargo(encargo: Encargo, sinceIso: string, notYoungerThanMin: number): Promise<ItemMatch[]>` — creado después de `sinceIso` y con al menos `notYoungerThanMin` minutos, sin `duplicate_of`, sin `fraud_status = 'confirmed'`; `canonicalId` = id del anuncio principal (resolviendo `duplicate_of`).
  - `COLUMNS` de particulares incluye `description` y `features` para que `evaluateMatch` lea la descripción; `description` se pasa a `MatchProperty`.

- [ ] **Step 1: Tests (rojos)** con casos del motor puro: encargo «exterior + terraza + reformado, no bajo»: (a) evidencia solo en descripción («exterior», «terraza») → encaja con motivos; (b) solo en `features`/`attrs` → encaja; (c) descripción dice «bajo interior» → excluido por `floor`; (d) la ficha no menciona nada → no se descarta y `warnings` pide confirmar. Para particulares: una fila con `description` que dice «reformado» y `condition` vacío suma el motivo «reformado».
- [ ] **Step 2: Ejecutar los tests** — Esperado: FAIL.
- [ ] **Step 3: Implementar** adaptadores reutilizando los cruces existentes (`opts.encargoId` de Task 3); particulares trae también `description`; se normaliza `canonicalId` con `duplicate_of ?? id`.
- [ ] **Step 4: Ejecutar tests y `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): matching por encargo con lectura de descripción y características`.

---

### Task 6: Destinatarios y construcción del aviso

**Files:**
- Create: `lib/encargos/recipients.ts`, `lib/encargos/notice.ts`
- Test: `scripts/test-encargos-notice.mts`

**Interfaces:**
- Consumes: `encargoLink` (Task 2), `ItemMatch` (Task 5).
- Produces:
  - `type Person = { id: string; role: string; suspendedAt: string | null; country: string; countries: string[]; multiCountry: boolean }`.
  - `pickRecipients(input: { advisor: Person | null; admins: Person[] }): string[]` — asesor si no está suspendido y accede a `es`; admins con rol `admin|owner|agent_admin` no suspendidos y con acceso; sin duplicados.
  - `resolveRecipients(clientId: string): Promise<string[]>` (service role, lee `profiles`).
  - `type Notice = { type: "encargo_match"; title: string; body: string; link: string; data: { clientId: string; encargoId: string; kind: "initial" | "new"; items: Array<{ source: EncargoSource; id: string; title: string }>; totalItems: number } }`.
  - `buildNotice(input: { kind: "initial" | "new"; client: { id: string; name: string }; encargo: { id: string; label: string }; matches: ItemMatch[] }): Notice` — un solo elemento: título «Propiedad nueva para el encargo {label} de {name}» y enlace con `destacar`; varios: «{n} propiedades nuevas…» o, `kind:"initial"`, «{n} propiedades actuales encajan con el encargo…»; `data.items` con tope 5, `totalItems` el real; el cuerpo enseña los motivos del texto («exterior, terraza, reformado») del mejor.

- [ ] **Step 1: Tests (rojos)**: asesor suspendido → no recibe; asesor que además es admin → un solo id; admin sin acceso a `es` no recibe nada; sin asesor y sin admins → `[]`; 1 match → enlace con `destacar=particular:p9`; 1.000 matches → `data.items.length === 5` y `totalItems === 1000`.
- [ ] **Step 2: Ejecutar** — Esperado: FAIL.
- [ ] **Step 3: Implementar.** Reutilizar los helpers de `lib/db/queries/view-scope.ts` si exponen el acceso por país; si no, comparar `country`/`countries`/`multi_country`.
- [ ] **Step 4: Ejecutar tests y `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): destinatarios y aviso agrupado`.

---

### Task 7: Plan de pasada, runner, cron y pase inicial

**Files:**
- Create: `lib/encargos/plan.ts`, `lib/encargos/runner.ts`, `app/api/cron/encargo-matches/route.ts`, `scripts/seed-encargo-baseline.mts`
- Modify: `lib/db/queries/encargos.ts` (llamar al pase inicial tras crear/reactivar/editar)
- Test: `scripts/test-encargos-plan.mts`, `scripts/test-encargos-runner.mts` (contra `encargos_test`)

**Interfaces:**
- Consumes: `matchStockForEncargo`, `matchNewForEncargo` (Task 5); `buildNotice`, `resolveRecipients` (Task 6); `briefSuggestMissing`.
- Produces:
  - `planEncargoRun(input: { found: ItemMatch[]; alreadySeen: Set<string>; kind: "initial" | "new" }): { toInsert: ItemMatch[] }` — `alreadySeen` contiene `"{source}:{canonicalId}"`; excluye lo visto y duplicados dentro del mismo lote.
  - `runEncargoInitialPass(encargoId: string): Promise<{ inserted: number; notified: number }>` — evalúa TODO el stock, inserta en `encargo_matches` con `on conflict do nothing returning`, y manda un solo aviso `kind:"initial"` si hay destinatarios.
  - `runEncargoMatching(opts?: { now?: Date; dryRun?: boolean }): Promise<{ encargos: number; inserted: number; notices: number; skipped: Record<string, number> }>` — para cada encargo `active` con brief suficiente, evalúa lo nuevo desde `max(baseline_at, última pasada)`; un aviso por encargo y pasada.
  - `POST /api/cron/encargo-matches?dry=1` (Bearer `CRON_SECRET`), devuelve el JSON del informe.
  - Regla: los matches **sin destinatarios** no ponen `notified_at`; se reintentan en la siguiente pasada.
  - La migración de los 15 clientes actuales precarga su stock como visto con `scripts/seed-encargo-baseline.mts` (idempotente, `notified_at = now()`, sin avisos), que ejecuta el dueño tras el despliegue.

- [ ] **Step 1: Tests (rojos)**: `planEncargoRun` con un id ya visto y un duplicado en el lote → una sola inserción; runner contra `encargos_test` con 3 particulares que encajan → `inserted:3, notices:1`; segunda pasada idéntica → `inserted:0, notices:0`; dos pasadas en paralelo (`Promise.all`) → total de avisos 1; encargo con brief insuficiente → `skipped.brief_insuficiente = 1` y nada insertado; sin destinatarios → `notified_at` nulo y, al añadir un admin, la siguiente pasada avisa.
- [ ] **Step 2: Ejecutar** — Esperado: FAIL.
- [ ] **Step 3: Implementar.** Cada aviso se inserta en `crm_notifications` con service role (`user_id`, `type:"encargo_match"`, `title`, `body`, `link`, `data`). `dry=1` calcula y devuelve el informe sin escribir.
- [ ] **Step 4: Ejecutar tests, `npx tsc --noEmit` y una pasada `dry` manual contra la base de pruebas** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): detección periódica, pase inicial y cron`.

---

### Task 8: Campanita — mostrar el aviso y llevar al encargo

**Files:**
- Modify: `app/api/admin/notifications/route.ts` (tipo `NotificationItem.type` suma `"encargo_match"`; GET lee `crm_notifications` con `type in ('catalog_feedback','encargo_match')`; PATCH marca leídas ambas), el componente de la campanita que pinta `NotificationItem` (localizarlo con `grep -rn "catalog_feedback" components app`), `lib/notifications/bell-store.ts` si filtra por tipo.
- Test: ampliar `scripts/test-notifications-bell-store.mts`

**Interfaces:**
- Consumes: `Notice` (Task 6).
- Produces: ítem de campanita con `title`, `subtitle = body`, `href = link`, y al pincharlo se marca leído (`noticeId`).

- [ ] **Step 1: Test (rojo)**: el store acepta y ordena un ítem `encargo_match`; marcarlo leído lo quita de la lista.
- [ ] **Step 2: Ejecutar `npm run test:notifications-bell`** — Esperado: FAIL.
- [ ] **Step 3: Implementar** (icono propio y etiqueta «Encargo»).
- [ ] **Step 4: Ejecutar `npm run test:notifications-bell` y `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): avisos de encargo en la campanita`.

---

### Task 9: Ficha del cliente — sección Encargos y matching por encargo

**Files:**
- Create: `app/[country]/(admin)/admin/clientes/[id]/_components/encargos-section.tsx`
- Modify: `app/[country]/(admin)/admin/clientes/[id]/page.tsx`, `client-ficha-view.tsx`, `components/admin/clientes/suggested-properties-block.tsx`, `suggested-particulares-block.tsx`, `components/admin/clientes/encargo/encargo-form.tsx` (campos `label`, `endClientLabel`, tope por dormitorios)
- Test: `scripts/test-encargos-ui-state.mts` (lógica pura de selección de encargo y destacado) + comprobación manual en navegador

**Interfaces:**
- Consumes: `listEncargos`, acciones (Task 4); `getSuggestedProperties/Particulares(..., { encargoId })` (Task 5); `encargoLink` (Task 2).
- Produces: `resolveSelectedEncargo(encargos: Encargo[], param: string | null): Encargo | null` (el `?encargo=` si existe y es del cliente; si no, el principal) y `parseHighlight(param: string | null): { source: EncargoSource; id: string } | null` para `?destacar=`.

- [ ] **Step 1: Tests (rojos)**: `resolveSelectedEncargo` con id ajeno → principal; `parseHighlight("particular:p9")` → `{source:"particular", id:"p9"}`; `parseHighlight("x")` → `null`.
- [ ] **Step 2: Ejecutar** — Esperado: FAIL.
- [ ] **Step 3: Implementar** la sección (lista con estado, crear/editar/pausar/cerrar/«hacer principal», el principal sin pausa/cierre) y que los bloques de matching reciban el encargo seleccionado, resalten el elemento de `destacar` y hagan scroll a `#matching`. Aplicar las skills `frontend-design` y `design:accessibility-review` al revisar la UI.
- [ ] **Step 4: Tests, `npx tsc --noEmit`, `npm run build` y prueba manual**: entrar por un enlace de aviso (`?encargo=…&destacar=…#matching`) abre ese encargo con el elemento destacado — Esperado: build verde y comportamiento correcto.
- [ ] **Step 5: Commit** `feat(encargos): sección Encargos y matching por encargo en la ficha`.

---

### Task 10: Script de los encargos de Yeanette

**Files:**
- Create: `scripts/seed-yeanette-encargos.mts`
- Test: `scripts/test-encargos-seed.mts`

**Interfaces:**
- Produces: `seedYeanetteEncargos(clientId = "c2177533-4513-4a67-9e2a-94221ad84232", opts?: { dryRun?: boolean }): Promise<{ created: string[]; skipped: string[] }>` — idempotente por `label`; no hace nada si el cliente no existe. Encargo 2 = `«Demanda 2 · estudiantes»`: alquiler, zonas Recoletos y Justicia, amueblado, `stayMonths: 6`, `availableFrom: 2027-01-01`, `maxPrice: 6300`, `maxPriceByBedrooms: {"3":5200,"4":6300}`, 3–4 dorm. Encargo 3 = `«Demanda 3»`: alquiler larga estancia, Recoletos/Jerónimos/Castellana, 3–4 dorm., amueblado, `maxPrice: 5900`. El encargo 1 (principal) se renombra a `«Demanda 1»` y recibe `endClientLabel`.

- [ ] **Step 1: Tests (rojos)**: el seed con la base de pruebas crea 2 encargos nuevos, una segunda ejecución crea 0, y con cliente inexistente no hace nada.
- [ ] **Step 2: Ejecutar** — Esperado: FAIL.
- [ ] **Step 3: Implementar** y el modo `--dry` del script.
- [ ] **Step 4: Ejecutar tests y `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): script de los encargos de Yeanette`.

---

### Task 11: Captaciones — selector de encargo del cliente

> Añadida el 2026-11-06 a petición del dueño (captura de pantalla de `/es/admin/captaciones?cliente=…`): en Captaciones la barra «Captando para {cliente}» solo mostraba el encargo principal; debe poder elegirse CUALQUIERA de los encargos del cliente y todo lo que depende del encargo debe seguir al elegido.

**Files:**
- Modify: la barra de cliente de Captaciones (`ClientBar`) y la página `particulares-page.tsx` bajo `app/[country]/(admin)/admin/captaciones/` y/o `components/admin/particulares/**` (localizar con `grep -rn "Captando para\|ClientBar" app components`), `captacion-actions.ts` (guardar zona dibujada), `lib/captaciones-map/*` (`toMapBrief`, `describeBrief`, `getClientContext`), `lib/db/queries/suggested-particulares.ts` (`evaluateParticularForClient`), la tarjeta «Para el encargo de X» de la ficha del anuncio (`_ficha/client-fit-card.tsx`) y el hook de filtros (`lib/particulares/filters-from-params.ts`, parámetro `cliente`).
- Create/Modify: `lib/encargos/ui-state.ts` (reutilizar `resolveSelectedEncargo`), tests `scripts/test-encargos-captaciones.mts`.

**Interfaces:**
- Consumes: `listEncargos(clientId)`, `Encargo`, `resolveSelectedEncargo(encargos, param)` (Task 9), `getSuggestedParticulares(clientId, { encargoId })`, `evaluateParticularForClient`.
- Produces: parámetro de URL `?cliente=<uuid>&encargo=<uuid>` en Captaciones (`encargo` opcional: por defecto el principal; un id ajeno al cliente cae al principal); `evaluateParticularForClient(clientId, particularId, opts?: { encargoId?: string })`; `getClientContext(clientId, opts?: { encargoId?: string })`; la acción de guardar zona dibujada recibe `encargoId?` y actualiza **ese** encargo (hoy actualiza la fila principal).

- [ ] **Step 1: Tests (rojos)**: función pura de selección (`?encargo=` válido / ajeno / ausente / cerrado); `evaluateParticularForClient` con `encargoId` de un encargo secundario usa SU brief (un anuncio que encaja con la Demanda 3 y no con la 1 da `fits:true` solo con el encargo 3); guardar zona dibujada con `encargoId` modifica ese encargo y no el principal (BD real desechable, patrón de `test-encargos-actions`); `?encargo=` con basura se ignora; un cliente `cl` no muestra selector.
- [ ] **Step 2: Ejecutar** — Esperado: FAIL.
- [ ] **Step 3: Implementar**: la barra «Captando para» muestra un **selector con TODOS los encargos del cliente** (nombre, «Principal», estado Activo/En pausa/Cerrado, resumen de una línea); al elegir uno se actualiza la URL (`?encargo=`) y todo lo que depende del encargo usa el elegido: resumen y panel «Ver encargo», «Editar encargo» (abre la edición de ESE encargo), etiquetas «Encaja N» y puntuaciones de la lista/cuadrícula/mapa, brief del mapa y zona dibujada (se guarda en ese encargo), tarjeta «Para el encargo de X» de la ficha del anuncio (mantener `encargo` al navegar a ella). Un encargo en pausa o cerrado muestra un aviso claro («Encargo en pausa: no hace matching») y no pinta «Encaja». «Captar para X y añadir a su book» sigue siendo del **cliente** (no del encargo). Solo España: sin selector para clientes `cl`. Un cliente con un único encargo no cambia de aspecto (selector oculto o deshabilitado).
- [ ] **Step 4: Ejecutar tests, `npm run test:captaciones-filters`, `npm run test:encargos-ui-state`, `npx tsc --noEmit`** — Esperado: PASS.
- [ ] **Step 5: Commit** `feat(encargos): selector de encargo en Captaciones`.

---

### Task 12: Verificación final y entrega

**Files:**
- Modify: `CLAUDE.md` (sección breve «Encargos múltiples»: cron a instalar, scripts a ejecutar, regla del principal), `docs/changes/2026-11-06-encargos-matching/README.md`
- Test: todo lo anterior

- [ ] **Step 1: Ejecutar** `npm run test:encargos` (alias que lanza todos los `test-encargos-*`), `npm run test:client-brief`, `npm run test:notifications-bell`, `npm run test:captaciones-filters`, `node scripts/check-client-preferences-usage.mjs`, `npx tsc --noEmit`, `npm run build` — Esperado: todo verde.
- [ ] **Step 2: Aplicar `superpowers:verification-before-completion`** y solicitar revisión con `superpowers:requesting-code-review` sobre la rama completa.
- [ ] **Step 3: Escribir el README del expediente** con orden de despliegue: 1) merge (decide el dueño), 2) autodeploy aplica 0243, 3) `scripts/seed-encargo-baseline.mts`, 4) `scripts/seed-yeanette-encargos.mts`, 5) línea de crontab `*/10 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/encargo-matches`, y el rollback.
- [ ] **Step 4: Commit** `docs(encargos): despliegue y rollback`. No hacer push ni merge.
