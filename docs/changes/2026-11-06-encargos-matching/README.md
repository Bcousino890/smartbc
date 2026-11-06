# Encargos: varias búsquedas por cliente y matching (migraciones 0243-0246)

Parte de base de datos del cambio «encargos» (especificación en
`docs/superpowers/specs/2026-11-06-encargos-matching-design.md`). Solo España.

- **Rama:** `feat/encargos-matching`
- **Estado:** implementado y verificado en la rama (commits locales), sin desplegar ni aplicar en producción.

## Qué cambia

`supabase/migrations/0243_encargos_multiples.sql`, aditiva e idempotente:

- `client_preferences` pasa de 1 fila por cliente a varias («encargos»). La
  clave primaria pasa de `client_id` a un `id uuid` nuevo; `client_id` mantiene
  su FK a `profiles` y gana un índice normal. Índices, trigger `updated_at`, RLS
  y políticas no se tocan.
- Columnas nuevas: `label` (def. `'Encargo 1'`), `status` (`active|paused|closed`,
  def. `active`), `is_primary` (def. true), `position` (def. 0),
  `end_client_label`, `max_price_by_bedrooms` (jsonb), `baseline_at`.
- Índice único parcial `client_preferences_one_primary (client_id) WHERE is_primary`:
  un solo encargo principal por cliente. Las filas actuales quedan como principal
  y activo.
- Tabla nueva `encargo_matches` (vacía), única por `(encargo_id, source, canonical_id)`,
  con RLS solo para staff. La precarga del stock como «visto» la hará
  `scripts/seed-encargo-baseline.mts`, no la migración.

Efecto a vigilar: el código que haga `upsert(..., { onConflict: 'client_id' })`
sobre `client_preferences` deja de funcionar al desaparecer la PK/unique sobre
`client_id`. Se adapta en las tareas siguientes del plan; no debe desplegarse la
migración sin ellas.

Embed `client_preferences(*)` de PostgREST: mientras `client_id` era la PK
devolvía un objeto (to-one); tras 0243 es to-many y devuelve un ARRAY. Los dos
sitios (`getClients` y `getClientById`, lib/db/queries/clients.ts) lo normalizan
con `withPrimaryPreference` (lib/db/row-types.ts), que deja la fila principal
como objeto, así que `ClientWithRelations.client_preferences` y el adaptador no
cambian. `scripts/check-client-preferences-usage.mjs` (`npm run
test:encargos-usage`) falla si hay una consulta sin `is_primary` o un embed sin
normalizar. Las escrituras (update/insert/lookup) apuntan a la fila principal.

## Migración 0244 (cambio de principal atómico)

`supabase/migrations/0244_make_encargo_primary.sql`: función
`make_encargo_primary(p_encargo_id uuid) returns uuid` (plpgsql, una
transacción). Bloquea las filas del cliente, rechaza (`P0001`:
`ENCARGO_NO_EXISTE`, `ENCARGO_NO_ACTIVO`, `CLIENTE_NO_ES`) si el encargo no
existe, no está activo o el cliente no es de España, quita `is_primary` al
actual y lo pone al nuevo. `execute` solo para `service_role`. Reversión:
`rollback-0244.sql` (borra la función, sin pérdida de datos).

## Migración 0245 (aviso atómico)

`supabase/migrations/0245_encargo_notify_atomic.sql`: función
`claim_and_notify_encargo_matches(match_ids, recipients, title, body, link, data) returns int`:
en una transacción reclama las filas pendientes de `encargo_matches` y crea un aviso
`encargo_match` por destinatario (o nada si falla algo o no hay destinatarios). Añade
`encargo_matches.reasons jsonb`. `execute` solo para `service_role`. Reversión: `rollback-0245.sql`.

## Migración 0246 (RLS del cliente y consentimiento de las alertas)

`supabase/migrations/0246_encargos_rls_y_consentimiento.sql`, aditiva e idempotente:

- **RLS:** las políticas del propio cliente (portal) sobre `client_preferences` pasan a alcanzar SOLO su fila
  principal (`USING` y `WITH CHECK` con `auth.uid() = client_id AND is_primary`). Desde 0243, con la política de
  0001, un cliente podía por PostgREST crear encargos extra (el cron avisaría al equipo con la etiqueta que eligiera),
  pausar/borrar su principal (el borrado arrastra `encargo_matches`) y leer las notas internas de todos sus encargos.
  Las políticas del equipo no cambian; el portal del cliente ya apuntaba siempre al principal.
- **CHECK** `client_preferences_primary_active_check`: `NOT is_primary OR status = 'active'` (la app ya lo impedía;
  las filas existentes lo cumplen porque 0243 las deja activas).
- **`make_encargo_primary`** (mismos errores y permisos que 0244): el nuevo principal hereda del anterior
  `new_listing_alerts_enabled`, `_frequency` y `_last_sent_at`. Además, en la app, la baja / «recibir menos» del
  correo (`/api/public/property-alerts/unsubscribe`) y el interruptor de alertas de la ficha escriben en TODAS las filas
  del cliente: el consentimiento es del cliente, no de un encargo.

Reversión: `rollback-0246.sql` (políticas de 0001, sin CHECK, función como en 0244).

`0243` lleva además `SET lock_timeout = '5s'` (y `RESET` al final): sus `ALTER TABLE` piden un bloqueo exclusivo;
mejor fallar a los 5 s (todo es idempotente, se relanza) que encolar detrás todas las lecturas de la app. El fichero no
va en una transacción (`apply-migrations.sh` lo pasa a psql sentencia a sentencia), así que es un `SET` de sesión, no
`SET LOCAL`.

## Orden de puesta en marcha (importante)

Todo en `/opt/smartbc-app`, en este orden; no saltarse ninguno:

1. **Merge** de `feat/encargos-matching` a `main` (lo decide el dueño). El autodeploy aplica 0243, 0244, 0245 y 0246
   (compila en `.next.new`, migra y solo después intercambia y reinicia). ⚠️ **No usar `scripts/deploy.sh` para esta
   versión**: reinicia PM2 ANTES de migrar, y el código nuevo no funciona sin 0243-0246.
2. `scripts/seed-encargo-baseline.mts` (empaquetado con esbuild, ver su cabecera): primero `--dry`, luego `--yes`.
   Precarga el stock como visto, sin avisos, y fija la marca del cron en «ahora − 15 min» si no existía.
3. **Instalar el crontab** (después del paso 2; si el cron arrancara antes, su primera ejecución solo inicializaría la
   marca y lo creado entre medias no se evaluaría). Con registro en un fichero, con fecha:
   ```
   */5 * * * * { date -u +\%FT\%TZ; curl -sS -X POST -w '\nHTTP \%{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/encargo-matches; } >> /var/log/encargo-matches.log 2>&1
   ```
   (en crontab los `%` van escapados; prueba previa sin escribir: `...encargo-matches?dry=1`). **Vigilar el log:** una
   pasada con fallos responde HTTP 500 con `ok:false` y la marca NO avanza (lo pendiente se reintenta en la siguiente);
   el JSON trae `cursorAgeMinutes` (lo normal es ~5-20) y, si pasa de 3 días, el servidor deja un `console.error` en
   `pm2 logs smartbc-portal`. Un encargo que falla siempre bloquea la marca de TODOS: la ventana crece hasta arreglarlo.
4. `scripts/seed-yeanette-encargos.mts`: `--dry` y, si el resumen es correcto, `--yes` (`--no-notify` para no lanzar pases
   iniciales; `--passes-only` reintenta solo los pases iniciales que fallaron).

## Cómo verificar

```bash
PATH=/opt/node22-standalone/bin:$PATH bash scripts/test-encargos-migration.sh
```

Levanta un Postgres desechable (`encargos-pg-test`, puerto 54999) con el esquema
volcado en solo lectura de `supabase-db`, aplica 0243, 0244 y 0245 dos veces cada una, comprueba
datos previos, PK, índice parcial, duplicados de `encargo_matches` y el
rollback, y borra el contenedor al terminar. Nunca escribe en `supabase-db`.

El runner `scripts/apply-migrations.sh` aplica solo los `.sql` nuevos de
`supabase/migrations/`; el fichero no necesita registro.

## Cómo revertir

Con psql, por una persona, **en este orden**: `rollback-0246.sql` → `rollback-0245.sql` → `rollback-0244.sql` →
`rollback-0243.sql` (todos en `docs/changes/2026-11-06-encargos-matching/`). Antes, quitar la línea de crontab.

⚠️ **El build anterior no convive con este esquema en cuanto algún cliente tiene más de un encargo**: el código viejo
lee `client_preferences` con `.maybeSingle()` por `client_id` (falla con 2+ filas) y los embeds `client_preferences(*)`
pasan a ser arrays. Esto vale también para la **vuelta atrás automática del autodeploy** a `.next.prev` (si el health
check falla tras desplegar): con encargos múltiples ya creados, esa versión anterior rompe fichas y alertas. Revertir
el código exige primero dejar una fila por cliente (cerrar/borrar los encargos extra) y aplicar los rollbacks.

- 0246: vuelve a las políticas de 0001 (el cliente podría otra vez tocar sus encargos por PostgREST), quita el CHECK y
  deja `make_encargo_primary` como en 0244.

- 0245: borra la función y la columna `encargo_matches.reasons`.
- 0244: borra `make_encargo_primary` (sin pérdida de datos).
- 0243: **solo es válido con una fila por cliente**: si algún cliente tiene más de un encargo (p. ej. Yeanette con 3)
  aborta con un mensaje y no cambia nada; hay que cerrar/borrar antes los encargos sobrantes a mano. Borra
  `encargo_matches` y las columnas nuevas (se pierde ese histórico) y devuelve la PK a `client_id`.
- El código de la rama asume 0243-0245: revertir la BD implica revertir también el despliegue.

## Verificación realizada (2026-11-06, sin navegador)

`npm run test:encargos` (agregado, falla al primer error): lint de uso (OK), modelo, ui-state + schedule (69 OK),
fuentes puras (30), acciones (53, BD), fuentes (30 + 39 BD), aviso (36 + 6 BD), runner (6 + 63 BD), seed Yeanette (75 BD),
Captaciones (67 + 30 BD) y migración 0243-0245 con rollbacks: todo verde. Además: `test:client-brief`,
`test:captaciones-filters` (33/33), `test:notifications-bell` (15), `test:crm-appearance`, `test:import-drafts` (68),
`scripts/test-api-guards.mjs` (227 handlers), `tsc --noEmit` y `next build` sobre una copia limpia de HEAD: OK.
`test:typography` falla igual que en `main` (27 violaciones en ambos; ficheros ajenos). Los tests con BD usan contenedores
Postgres desechables con volcado de solo lectura del esquema; no se escribió en `supabase-db`.

## Verificación tras la revisión final (2026-11-06, F1-F9, sin navegador)

`npm run test:encargos` verde: ui-state + schedule (81), fuentes puras (30), acciones (53, BD con 0246), fuentes (30 + 49 BD:
propiedades que nacen de un anuncio, fraude sospechoso, páginas cortas), aviso (36 + 6 BD), runner (6 + 74 BD: páginas de
2 filas, marca atascada, herencia de alertas y baja en todas las filas), seed Yeanette (75 BD), Captaciones (67 + 30 BD) y
migración 0243-0246 con rollbacks (68 comprobaciones, RLS con rol `authenticated` + JWT simulado). Además
`test:client-brief`, `test:captaciones-filters` (33/33), `test:notifications-bell` (15), `test:crm-appearance` (15),
`test-api-guards` (227 handlers), `tsc --noEmit` y `next build` en copia limpia de HEAD: OK. `test:typography`: las mismas
27 violaciones previas.

## Checklist de verificación MANUAL del dueño (nada se probó en un navegador)

1. **Ficha del cliente (España):** sección Encargos del Resumen. Crear, editar, pausar, cerrar un encargo. El principal no se
   puede pausar/cerrar sin «Hacer principal» otro (bloqueo visible); «Hacer principal» cambia el principal. El editor de tope
   de precio por nº de dormitorios guarda y se respeta en el matching.
2. **Campana:** un aviso de encargo (`encargo_match`) lleva a la ficha en `#matching` con el encargo elegido y el anuncio
   resaltado y fijado el primero (o «ya no encaja: motivo»); el aviso se marca como leído.
3. **Captaciones:** el selector de encargo del cliente rellena los filtros automáticos (zona, precio, dormitorios, tipo…;
   NO baños, m² ni estancia, a propósito); «Limpiar» los quita; elegir un cliente dentro de la ficha de un anuncio no la cierra.
4. **Ficha del anuncio:** tarjeta «Para el encargo de X» con el encaje y la acción de captar.
5. **Cliente de Chile:** ficha y formulario exactamente como antes (sin sección Encargos ni editor por dormitorios).
6. **Yeanette tras el seed:** una sola ficha con sus 3 encargos (Demanda 1-3), barrios/precios correctos, cada uno con su
   matching y un aviso agrupado por encargo para su **asesor asignado y los administradores** (ella no recibe nada: es la
   cliente). **Confirmar:** la Demanda 2 es alquiler de temporada (`stay: 'short'`): deja fuera las propiedades del CRM
   marcadas de larga estancia; si se quieren ver también, quitar la estancia del encargo.
7. **Cron:** `?dry=1` devuelve informe sin escribir; tras unos minutos con la línea instalada, `app_settings.encargo_matching_cursor`
   avanza.
8. Los cargadores paginan hasta recibir una página vacía, así que un `db-max-rows` de PostgREST menor que 1000 ya no
   trunca nada (solo hace más peticiones).
9. **Portal del cliente (RLS de 0246):** un cliente con varios encargos entra en su portal: ve y edita sus preferencias
   (la fila principal) como siempre.
10. **Alertas por correo:** con las alertas activas, «Hacer principal» otro encargo → siguen activas (misma frecuencia);
    darse de baja desde el correo → apagadas en todos los encargos, también si se vuelve al principal anterior.
11. **Propiedad captada de un anuncio** («Captar para X»): el anuncio avisa una vez; la propiedad que se crea a partir de
    él NO genera un segundo aviso «Propiedad nueva». Un anuncio «Posible fraude» (sospechoso) tampoco avisa.

## Despliegue

Nada de esto se despliega ni se aplica en producción hasta que el dueño lo
apruebe. Un merge a `main` aplica las migraciones (`apply-migrations.sh`),
así que el merge lo decide el dueño.
