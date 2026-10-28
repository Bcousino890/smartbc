# Idealista API → CRM: resultado

[spec.md](spec.md) (revisión 4) · [plan.md](plan.md) · rama `fabri/idealista-api-crm-sync` · base `9356300a` · PR #380.

**Estado:** T1–T12 y el cierre del 2026-10-29 están hechos en local. **Parado antes del merge.** La sincronización sigue **apagada**. Ni producción, ni credenciales, ni llamadas a Idealista, ni revisión de Codex.

## Qué se ha ejecutado y qué salió (última pasada, 2026-10-29)

Todo en la **copia exportada aislada** (`rsync` sin `.git` ni `.env*`; `find … -name '.env*'` → 0; ningún archivo de entorno movido ni leído) y en el **Postgres temporal** de `scripts/sql/run-local.sh` (127.0.0.1, datos sintéticos).

| Comprobación | Comando | Resultado |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | exit 0, sin salida |
| Todos los pasos `npm run` de `ci.yml` salvo `build` (31) | bucle sobre `ci.yml` sin `build` | ✅ 31/31 |
| Suite nueva de la CI | `npm run test:idealista-crm-sync` | ✅ 92/92 |
| Payload contra los schemas | `npm run test:idealista` | ✅ 100/100 |
| SQL: comportamiento, concurrencia, frontera y recuperación con datos (0232 y 0233 aplicadas dos veces) | `scripts/sql/test-idealista-crm-sync.sh todo` | ✅ 165 comprobaciones, exit 0 |
| SQL: mutaciones | `scripts/sql/test-idealista-crm-mutations.sh` | ✅ 13/13 detectadas |
| Comprobaciones del operador (antes del merge y antes de encender) | `scripts/sql/test-idealista-crm-prechecks.sh` | ✅ APTO con el esquema esperado y fallo con cada una de 18 alteraciones |
| Código real de `crm-sync` contra 0233 real | `scripts/sql/test-idealista-crm-flow.sh` | ✅ 18/18 |
| Build de producción aislado | `env -i … NEXT_BUILD_DIR=.next.qa npx next build` (variables ficticias, sin `.env*`) | ✅ exit 0 |
| Rutas reales (`next start` + simulador de PostgREST, sin cookies) | `scripts/qa/idealista-crm-smartlink-routes.mts` | ✅ 18/18 |
| QA visual con el tema real del CRM | `scripts/qa/idealista-crm-sync-e2e.mts` | ✅ 8 capturas; con la preferencia «oscuro» el CRM pone `data-crm-theme="dark"` y el fondo pasa de `rgb(251, 248, 243)` a `rgb(26, 24, 21)`; sin desbordes ni errores JS |
| TS: mutaciones (a mano, en la copia, restauradas después) | `ok:false` ante fallo local · llamar sin registrar · proyectar `internal_notes` | las 3 detectadas |

## Cierre del 2026-10-29

1. **Comprobaciones del operador endurecidas.**
   - **Qué validan.** Cada política de la que depende la frontera, con todos sus atributos: comando, permisiva, roles, `USING` y `WITH CHECK`. Además:
     - que no haya otras políticas;
     - RLS;
     - `is_staff()`: cuerpo, `SECURITY DEFINER`, volatilidad y `search_path`;
     - `catalog_candidates`;
     - los CHECK, con su definición y con que estén validados;
     - los roles;
     - antes de encender, también los triggers activados, el `SECURITY DEFINER` de las protecciones y los privilegios de `anon`, `authenticated` y `service_role`.
   - **NULL o ausente falla.**
   - **Resultado.** El final es inequívoco: «APTO» y código 0, o un ERROR «NO FUSIONAR» / «NO ENCENDER» con código distinto de 0.
2. **Contención sin deshacer en bloque.**
   - Pedir `undo` ahora es un error.
   - La liberación va **ficha a ficha** (`idealista_crm_release_containment`, botón «Liberar contención»). Solo funciona con el código compatible en marcha y la sincronización encendida, y solo si el último estado del anuncio es publicado, cierto y aplicado.
   - Las retiradas y las inciertas siguen archivadas.
   - Hay pruebas sintéticas de cada caso en `test-idealista-crm-rollback.sql`.
3. **QA pendiente.**
   - El tema oscuro **real** del CRM queda comprobado: se fija la preferencia por usuario y se verifica el atributo y el color.
   - El rechazo de la base al añadir una ficha de referencia a catálogos, selecciones, colecciones, listas, enlaces de portal o de colaboración sale con un mensaje claro para el personal (`lib/properties/reference-only.ts`). La restricción sigue en la base.
4. **Entrega de la comprobación previa sin tocar el checkout y verificación del build en marcha:** ver «Pasos de Fabricio».

## Qué prueba cada cosa (corrección 7)

- **Rutas reales** (build de producción + simulador):
  - el enrutado y el acceso **anónimo**;
  - que el SmartLink de una ficha de referencia sirve contenido y fotos **sin** notas internas, propietario, contacto ni agencia técnica (textos centinela en el HTML y en los datos de React);
  - que **archivada** da 404 en `/compartir`, `/c`, `/og` y `/p`.

  El simulador **no** hace cumplir políticas, triggers ni CHECK.
- **SQL en el Postgres temporal:** las políticas, triggers y CHECK, el registro de solo añadir, la incertidumbre, la obsolescencia, la concurrencia y la recuperación con datos, con las consultas del build anterior transcritas con su `archivo:línea`.
- **Capturas:** cómo se ve el panel y el SmartLink. La página de fixtures usa acciones falsas, pero el tema es el mecanismo real del CRM.
- **I2.** Las llamadas a Idealista son idénticas a las de la versión base, según el fixture grabado con el `publish.ts` de `9356300a`. Además, hay un diff vacío en `mapper.ts`, `client.ts`, `endpoints.ts`, `config.ts`, `validate.ts` y `schemas/`.

## Lo que NO se ha podido demostrar (y su riesgo)

| Qué | Por qué | Riesgo / mitigación |
|---|---|---|
| Que producción tenga el esquema, las políticas y las funciones esperadas | Sin acceso a producción | **Lo cierra Fabricio** con la comprobación previa. Si no sale «APTO», no se fusiona. |
| Que exista «RESERVADO» en `es` | Ídem | Comprobación de activación. Sin ella, todo queda en `tag_missing` y no se crea nada. |
| El `state` real de cada respuesta de Idealista, si reordena fotos, la tasa de 5xx | Sin llamadas reales | Un 5xx o la falta de respuesta quedan como `unknown`, que bloquea y pide comprobar. |
| El tiempo real de copia de fotos | Almacenamiento en memoria | 45 s dentro de la publicación; si no basta, `media_timeout` y el reintento sigue desde la caché. |
| El script real del VPS (`/opt/vps-autodeploy.sh`) y sus rutas | Fuera del repo; los pasos de abajo usan las rutas de `scripts/vps-autodeploy.sh` | Si alguna ruta no coincide en el VPS, **parar** y avisar: no se enciende sin demostrar el build en marcha. |
| Red durante el build y en las capturas | `next build` usa Google Fonts y el tipo de cambio de `/web`; el SmartLink carga mosaicos del mapa en el navegador de prueba | No es Idealista ni una base. |

## Comportamientos conocidos (no son fallos)

- **«Reconciliar»** no lanza la sincronización por sí sola (D10). Tras reconciliar, «Sincronizar» o la siguiente operación la aplican.
- **`clone`** deja el estado incierto hasta pulsar «Comprobar en Idealista» (no tiene botón).
- **Los anuncios publicados antes de encender** no se rellenan (D10).
- **Activar «Publicar en la web»** en una ficha de referencia da un error de CHECK. Es el mismo bloqueo que en la base.

## Pasos de Fabricio, en orden

### 1. Comprobación previa al merge (solo lectura, sin tocar `/opt/smartbc-app`)

El archivo revisado es el del commit `40762bf7db4ae39e3da2d40deb9b7165ad553a87`. Se descarga a `/tmp`, **no** al checkout que vigila el autodeploy:

```bash
SHA=40762bf7db4ae39e3da2d40deb9b7165ad553a87
curl -fsSL "https://raw.githubusercontent.com/Bcousino890/smartbc/$SHA/scripts/sql/idealista-crm-sync-premerge.sql" \
  -o /tmp/idealista-crm-sync-premerge.sql
sha256sum /tmp/idealista-crm-sync-premerge.sql
#   tiene que ser: 4271d988d3199915ca18b1b7c59df44affd685aa33bce38ef4cf0a551e2a8a05
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/idealista-crm-sync-premerge.sql
echo "salida: $?"
```

- **Si sale «RESULTADO: APTO PARA FUSIONAR (n/n)» y `salida: 0`,** se puede seguir.
- **Si sale cualquier `✗` o «NO FUSIONAR», o la salida no es 0,** no se fusiona: pega la salida.

### 2. Merge del PR #380

Puede aplicar 0232 y 0233 y desplegar. La sincronización sale **apagada**, pero las protecciones de borrado y las políticas nuevas quedan activas desde ese momento.

### 3. Comprobar que el build EN MARCHA es el del merge

`origin/main` no lo demuestra. Rutas según `scripts/vps-autodeploy.sh`; la copia del VPS no está comprobada. `MERGE=<sha completo del merge en main>`.

```bash
cat /opt/smartbc-deploy/desplegado          # = $MERGE (solo se escribe tras pasar el health check)
test ! -e /opt/smartbc-deploy/fallido && echo "sin despliegue fallido"
grep -E '\[(ok|error|rollback)\]' /var/log/smartbc-autodeploy.log | tail -3
#   la última tiene que ser «[ok] deploy completado ($MERGE)», sin [rollback] detrás
test -f /opt/smartbc-app/.next/server/app/api/admin/idealista/crm-sync/route.js && echo "el .next servido incluye esta tarea"
pm2 describe smartbc-portal | grep -E 'status|uptime|restarts'   # online, reiniciado después del deploy
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 2xx o 3xx
```

**Si algo no cuadra** (otro SHA en `desplegado`, un `fallido`, un `[rollback]`, o falta `crm-sync/route.js` en `.next`), **no se enciende**: el build en marcha no es el de esta tarea.

### 4. Comprobación de activación (solo lectura)

Mismo método, con `scripts/sql/idealista-crm-sync-activation.sql` del mismo commit:

```bash
curl -fsSL "https://raw.githubusercontent.com/Bcousino890/smartbc/$SHA/scripts/sql/idealista-crm-sync-activation.sql" \
  -o /tmp/idealista-crm-sync-activation.sql
sha256sum /tmp/idealista-crm-sync-activation.sql
#   tiene que ser: 6e4b12bdbfb91372e5163bc9700d76eee6411c5f104ac476ac3b20d54a534515
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/idealista-crm-sync-activation.sql
```

Tiene que salir «RESULTADO: APTO PARA ENCENDER (n/n)» y el código 0. Antes de lanzarla, tiene que existir **una** «RESERVADO» en `es`.

### 5. Encender

```sql
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
```

### 6. Vigilar la primera semana

La insignia «CRM» del panel, y:

```sql
SELECT status, count(*) FROM idealista_crm_sync GROUP BY 1;
SELECT * FROM idealista_crm_sync WHERE status IN ('failed','needs_review','uncertain','uncertain_create');
```

**Apagar en cualquier momento:**

```sql
UPDATE app_settings SET value = '{"enabled": false}' WHERE key = 'idealista_crm_sync';
```

### Si alguna vez hubiera que revertir el código de esta tarea con fichas ya creadas

1. **Contener primero.** Archivo `scripts/sql/idealista-crm-sync-containment.sql` del commit `e3b669ce` (sha256 `6fdecac51200f383d4506e8e3d63f580e0e11a6953500b645d99464e36eea154`). Ensayo con `-v dry=1`; informe de solo lectura con `-v report=1`.
2. **Revertir.**
3. **Para volver:**
   1. despliega el código compatible;
   2. comprueba el build en marcha (paso 3);
   3. enciende la sincronización;
   4. libera **ficha a ficha** desde el panel («Liberar contención»).

No hay deshacer en bloque. Las retiradas o inciertas siguen archivadas hasta resolverlas.

## Commits

```
e431ecff especificación y plan aprobados (revisión 4)
8e1e3ed2 migraciones 0232 y 0233
39bbee7e pruebas SQL de comportamiento
003c29e7 pruebas de la frontera y de la recuperación con datos
68075586 0233: comprobaciones fallidas y fallos locales previos
36b67e9f registrar las operaciones y separar Idealista de los fallos locales
0885aa1f filtros de distribución y protecciones de borrado
7490dbe4 reintento, revisión y estado en el panel
51e12bf4 suites offline
97e3b90d rutas reales del SmartLink y QA visual
e92c3429 resultado y ajustes de la especificación
40762bf7 comprobaciones previas endurecidas
e3b669ce la contención se libera ficha a ficha, sin deshacer en bloque
f7bac55a mensajes claros al personal
403d93d8 QA visual con el tema oscuro real del CRM
```

Las observaciones de control de acceso que no dependen de esta tarea quedan fuera del repositorio, en el anexo privado.
