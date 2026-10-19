# Vigilancia de enlaces de Idealista: archivar y desarchivar solas las propiedades importadas por link

- **Fecha:** 2026-10-19. **Rama:** `feat/idealista-link-watch` (sin subir, sin fusionar).
- **Estado:** construido y probado en copia. **Nada se ha ejecutado en producción.** La primera pasada necesita el OK del dueño.

## Qué se pidió (literal, resumido)

Cuando el anuncio de Idealista de una propiedad importada por link (`Importar propiedad por link`) se da de baja, que la
propiedad se **archive sola**, incluidas las que ya cayeron antes; y que cuando el anuncio **reaparezca**, se vuelva a mostrar.

## Por qué el diseño no es el obvio

Lo obvio era fiarse de `particulares.taken_down_at` (el crawler ya detecta bajas). Se comprobó abriendo en Idealista las
84 fichas implicadas (168 créditos, libro: tarea `link-probe`) y **el crawler falla en los dos sentidos**:

| Grupo | Fichas | Caídas de verdad | Vivas |
|---|---|---|---|
| Activas en el CRM que el crawler da por caídas | 61 | 55 | **6** |
| Archivadas en el CRM que el crawler da por vivas | 19 | **13** | 6 |
| Activas que el crawler no conoce | 4 | 1 | 3 |

Una ficha marcada OFF_MARKET no se vuelve a mirar nunca, así que un anuncio que vuelve no se detecta; y hay filas heredadas
que figuran vivas estando caídas. Además, el cron que ya existía (`/opt/smartbc-check-bajas.sh`, a los :15 de las 00 y las
12 h) abre cada enlace con `curl`, Idealista lo bloquea (`uncertain: 30` en cada pasada desde, al menos, el 13-10), repite
siempre las mismas 30 y nunca llega al resto.

## Qué hace ahora

El crawler (`link-watch`) **abre el anuncio** por Crawio con el mismo clasificador que `verify-stale` y manda el veredicto
(`live` / `gone`) a **una función SQL** que decide. Las reglas viven en el CRM para que el crawler no pueda saltárselas:

1. Solo se archiva una propiedad en estado **`available`**. Reservada o vendida solo anota el veredicto.
2. Una baja necesita **dos veredictos `gone` seguidos separados ≥ 6 h** (un 404 pasajero no archiva: BC-1191 y BC-1248 se
   archivaron 10-16 días antes de la baja real). Excepción: si el crawler ya tenía su propia baja (OFF_MARKET o un 404 de
   ficha registrado), un solo 404 directo basta (`p_prior_gone`).
3. Lo archivado por el vigilante queda marcado `archived_reason = 'portal_down'`. **Solo eso** se desarchiva cuando el
   anuncio vuelve. Lo archivado a mano **no se toca nunca**.
4. Para desarchivar hace falta una **ficha real** (canonical = el propio anuncio). Una tarjeta de búsqueda no basta: las
   tarjetas de agencia perduran tras la baja.
5. Si una pasada intenta archivar **más de 10 a la vez**, no archiva ninguna y sale con código 3 (`--allow-bulk` lo levanta,
   solo para la primera pasada revisada).

**Gasto de créditos** (2 por anuncio abierto): un anuncio activo que el crawler vio en una búsqueda en las últimas 48 h se da
por vivo gratis. Activas: cada 24 h. Archivadas por el vigilante: cada 3 días durante 30 días y cada 7 después. Tope diario
400 anuncios; freno de 8 respuestas no concluyentes seguidas. **Estimación: 100-150 créditos al día (≈0,5 % del plan).**
Simulación sobre los datos reales del 2026-10-19: la primera pasada abre 196 anuncios (**392 créditos, una sola vez**), da
137 por vivos gratis y deja 23 sin tocar (archivados a mano).

## Piezas

| Pieza | Dónde | Notas |
|---|---|---|
| Migración 0215 | `supabase/migrations/0215_portal_link_watch.sql` | 6 columnas, 2 CHECK, índice parcial, función `apply_portal_link_verdict` solo para `service_role`. Idempotente. |
| Reimportar limpia la marca | `lib/sync/import-by-link/insert.ts` | Al reimportar: borra `archived_reason` y reinicia el veredicto. No lo da por vivo (el HTML puede venir de Wayback o pegado). |
| Cron antiguo, solo no-Idealista | `app/api/cron/import-by-link/check-bajas/route.ts` | Un `.not("source_url","ilike","%idealista.com%")`: deja de atascarse en las 30 de Idealista. |
| Marcar lo que archivó el cron antiguo | `scripts/sql/portal-link-backfill.sql` | Ensayo con `-v dry=1`. Reversible. |
| Pruebas SQL | `scripts/sql/test-portal-link-watch.sql` | 25 comprobaciones. |
| Crawler | `/opt/idealista-dev/idealista/linkwatch.py` + `cli.py` + `costs.py` | **Fuera de este repo** (el crawler no tiene git). Solo LEE el SQLite. |
| Instalador del crawler | `/opt/idealista-dev/hotfix/install_linkwatch.sh` | Con copia de seguridad, guard y `--rollback`. No activa el temporizador sin `--enable`. |
| Unidades systemd | `/opt/idealista-dev/deploy/linkwatch/` | Cada 3 h a los :50. |
| Tests del crawler | `/opt/idealista-dev/tests/test_linkwatch.py` | 42 tests offline. |

## Pruebas hechas (todas en copia)

- **SQL:** `tmp-pg` con el esquema real de producción (sin datos) volcado con `pg_dump -s`. Migración aplicada **dos veces**
  sin error; 25/25 comprobaciones: camino feliz, dos bajas, 6 h, reaparición, archivada a mano intocable, reservada y
  vendida, `p_prior_gone`, racha cortada por un «vivo», marca huérfana, reimportación, id inexistente, veredicto inválido y
  permisos (**`anon` y `authenticated` no pueden ejecutar la función; `service_role` sí**).
- **Marcado del cron antiguo:** 8 filas sintéticas; ensayo deshace todo, marca solo las 3 de ventana :15 (no la de otro
  portal, ni las «a mano», ni la de las 12:40), idempotente y reversible.
- **Crawler:** 42 tests nuevos. **Mutaciones:** quitar el freno de archivados rompe 3 tests; dejar que una tarjeta restaure
  rompe 1. Suite completa: 441 de 442 pasan; el que falla (`test_control.DailyStats.test_cli_stats_daily_command`) **ya
  fallaba antes** (idéntico con los `cli.py`/`costs.py` originales).
- **Instalador:** en un árbol aislado: instalar, reinstalar, `--enable`, `--rollback` (checksums idénticos) y el guard
  que aborta si producción cambió.
- **TypeScript:** `tsc --noEmit` sobre todo el proyecto, 0 errores.
- **No probado:** la llamada real a PostgREST (no hay uno en copia) ni los 196 anuncios en vivo. El contrato se vigila con un
  test de formas (URL, cabeceras, nombres de argumentos = los de la función SQL) y el event trigger `pgrst_ddl_watch` de
  producción recarga el esquema solo.

## Despliegue, en este orden (cada paso con el OK del dueño)

1. **Fusionar la rama** a `main`: el autodeploy aplica la 0215 (antes del swap) y despliega `insert.ts` y `check-bajas`.
   Hasta aquí nada archiva ni desarchiva nada.
2. **Marcar lo que archivó el cron antiguo** (127 propiedades esperadas):
   `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v dry=1 < scripts/sql/portal-link-backfill.sql`
   y, si cuadra, sin `-v dry=1`.
3. **Instalar el crawler:** `sudo /opt/idealista-dev/hotfix/install_linkwatch.sh`
4. **Plan sin gasto:** `cd /opt/idealista && runuser -u idealista -- venv/bin/python -m idealista link-watch`
5. **Primera pasada** (392 créditos, archiva ≈56 y restaura las que hayan vuelto):
   `cd /opt/idealista && runuser -u idealista -- venv/bin/python -m idealista --log-file data/link-watch.log link-watch --apply --allow-bulk --limit 250 --max-per-day 400`
6. **Activar el temporizador:** `sudo /opt/idealista-dev/hotfix/install_linkwatch.sh --enable`
7. Vigilar la primera semana: `journalctl -u idealista-link-watch`, `python -m idealista cost-report` (componente «Verificación
   de bajas») y los créditos reales frente a la estimación.

## Deshacer

- **Crawler:** `sudo /opt/idealista-dev/hotfix/install_linkwatch.sh --rollback` (y `systemctl disable --now idealista-link-watch.timer`).
- **Lo ya archivado por el vigilante** (reversible, solo lo marcado):
  `UPDATE properties SET archived_at = NULL, archived_reason = NULL, archived_auto_at = NULL, status = 'available' WHERE archived_reason = 'portal_down' AND archived_auto_at > '<fecha de la primera pasada>';`
- **Marcas del cron antiguo:** la sentencia de deshacer está en la cabecera de `portal-link-backfill.sql`.
- **Migración:** no se revierte (columnas y función inertes sin el crawler); `DROP FUNCTION public.apply_portal_link_verdict(uuid, text, timestamptz, boolean, interval);` la quita.

## Decisiones del dueño y mías

- **Del dueño (2026-10-19):** archivar solas las caídas, incluidas las anteriores; mostrar de nuevo las que reaparezcan;
  diseño con comprobación directa de cada enlace (≈3-4,5 mil créditos al mes); no ejecutar nada en producción hasta su OK a
  la primera pasada; ver antes las listas de las 61 y las 19 (`/root/archivado-idealista-listas-2026-10-19.md`).
- **Mías (corregibles):** solo propiedades `available`; dos bajas ≥ 6 h; tope de 10 archivados por pasada; cadencias
  24 h / 3 d / 7 d; tarjeta de búsqueda como prueba gratis de vida solo para activas; el cron antiguo sigue para otros
  portales; sin etiqueta visible en el listado de Propiedades.

## Fuera de alcance / pendiente

- Etiqueta en el CRM que explique por qué una propiedad está archivada («anuncio dado de baja en Idealista»). Las columnas
  ya están (`archived_reason`, `archived_auto_at`, `portal_link_gone_at`).
- Otros portales (Fotocasa, pisos.com, Habitaclia): el cron antiguo los sigue cubriendo.
- Las 3 archivadas con anuncio vivo que parecen hechas a mano (BC-0893, BC-0991, BC-1499) no se tocan: decide el equipo.
