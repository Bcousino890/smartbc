# Idealista API → CRM: resultado

[spec.md](spec.md) (revisión 4) · [plan.md](plan.md) · rama `fabri/idealista-api-crm-sync` · base `9356300a`.

**Estado:** T1–T12 hechos en local. **Parado antes del merge**, como pide la aprobación. Ni producción, ni credenciales, ni llamadas a Idealista, ni revisión de Codex.

## Qué se ha ejecutado y qué salió

Todo en la **copia exportada aislada** (`rsync` sin `.git` ni `.env*`; `find … -name '.env*'` → 0; ningún archivo de entorno movido ni leído) y en el **Postgres temporal** de `scripts/sql/run-local.sh` (127.0.0.1, datos sintéticos).

| Comprobación | Comando | Resultado |
|---|---|---|
| Lint de migraciones | `python3 scripts/lint-migrations.py` | ✅ Migraciones OK |
| TypeScript | `npx tsc --noEmit` | exit 0, sin salida |
| Payload contra los schemas | `npm run test:idealista` | ✅ 100/100 |
| Suite nueva de la CI | `npm run test:idealista-crm-sync` | ✅ 77/77 |
| Suites existentes tocadas | `scripts/test-public-web.mts`, `npm run test:import-drafts` | ✅ en verde, ✅ 68 |
| SQL: comportamiento, concurrencia, frontera y recuperación con datos (0232 y 0233 aplicadas dos veces) | `scripts/sql/test-idealista-crm-sync.sh todo` | ✅ 155 comprobaciones, exit 0 |
| SQL: mutaciones | `scripts/sql/test-idealista-crm-mutations.sh` | ✅ 13/13 detectadas |
| Código real de `crm-sync` contra 0233 real | `scripts/sql/test-idealista-crm-flow.sh` | ✅ 18/18 |
| TS: mutaciones (a mano, en la copia, restauradas después) | `ok:false` ante fallo local · llamar sin registrar · proyectar `internal_notes` | las 3 detectadas (1, 2 y 1 fallos) |
| Build de producción aislado | `env -i … NEXT_BUILD_DIR=.next.qa npx next build` (variables ficticias, sin `.env*`) | ✅ exit 0 |
| Rutas reales (`next start` + simulador de PostgREST, sin cookies) | `scripts/qa/idealista-crm-smartlink-routes.mts` | ✅ 18/18 |
| QA visual (Chromium, 1440 y 390 px) | `scripts/qa/idealista-crm-sync-e2e.mts` | ✅ 8 capturas, sin desbordes ni errores JS |
| Comprobaciones previas de Fabricio, ensayadas en local | `idealista-crm-sync-premerge.sql` / `…-activation.sql` | «todo coincide» con el esquema esperado; «NO fusionar» con una política extra y con 0232 ya aplicada; activación falla sin «RESERVADO» y pasa con ella |

## Qué prueba cada cosa (corrección 7)

- **Rutas reales** (build de producción + simulador): el enrutado, el acceso **anónimo**, que el SmartLink de una ficha de referencia sirve contenido y fotos **sin** notas internas, propietario, contacto ni agencia técnica (textos centinela en el HTML y en los datos de React), y que **archivada** da 404 en `/compartir`, `/c`, `/og` y `/p`. El simulador **no** hace cumplir políticas, triggers ni CHECK.
- **SQL en el Postgres temporal:** las políticas, los triggers, los CHECK, el registro de solo añadir, la incertidumbre, la obsolescencia, la concurrencia y la recuperación con datos (consultas del build anterior transcritas con su `archivo:línea`).
- **Capturas:** solo cómo se ve. La página de fixtures usa acciones falsas. El modo oscuro del CRM es un ajuste por usuario (no la preferencia del sistema), así que las capturas «dark» son iguales a las claras: el tema oscuro del panel **no** queda comprobado aquí.
- **I2 (llamadas a Idealista sin cambios):** `scripts/fixtures/idealista-publish-calls-base.json` se grabó ejecutando el `publish.ts` **de la base** (idéntico en `3f8ad3b2` y `9356300a`) con endpoints falsos. La suite de la CI exige que el código nuevo haga exactamente las mismas llamadas, con los mismos cuerpos, en: alta, actualización, alta rechazada (400), baja, reactivación y comprobación de estado. Además: diff vacío en `mapper.ts`, `client.ts`, `endpoints.ts`, `config.ts`, `validate.ts` y `schemas/`.

## Ajustes hechos durante la ejecución

Todos reflejados en spec.md:

- **0233:** las lecturas (`observe`) que fallan no crean incertidumbre; `idealista_crm_note_failure` deja en la fila un fallo de copia de multimedia; `already_applied` vuelve a `synced`; marcas de tiempo con `clock_timestamp()`.
- **0232:** funciones de protección `SECURITY DEFINER`. Sin eso, un cliente que no ve la ficha de referencia podía añadirla a favoritos, y un asesor que no ve `idealista_listings` se saltaba la protección de borrado. Lo detectan las pruebas y las mutaciones.
- **0232:** `idealista_property_ad_live` para que `deleteProperty` lo compruebe antes de desvincular captaciones.
- **C2:** la dirección sigue la regla del mapper, no la de la revisión 4.
- **La web pública no lleva filtro de aplicación:** lo garantiza el CHECK. Su prueba de contrato no se tocó.
- **Quitar los bloqueos** de `apply_idealista_crm_sync` no rompe ninguna prueba. Las otras capas lo impiden igual: el alta de la fila espera por su clave única, la ficha tiene el id reservado y `(agency_id, external_id)` es único. Se dejó constancia en el script de mutaciones.

## Lo que NO se ha podido demostrar (y su riesgo)

| Qué | Por qué | Riesgo / mitigación |
|---|---|---|
| Que producción tenga el esquema, las políticas y las funciones que esperan las migraciones | Sin acceso a producción | **Lo cierra Fabricio** con `idealista-crm-sync-premerge.sql` antes de fusionar. Si algo no coincide, no se fusiona. |
| Que exista «RESERVADO» en `es` | Ídem | `…-activation.sql`. Sin ella, todo queda en `tag_missing` y no se crea nada. |
| El `state` real de cada respuesta de Idealista, si reordena fotos, la tasa de 5xx | Sin llamadas reales | Un 5xx o la falta de respuesta quedan como `unknown`, que bloquea y pide comprobar. |
| El tiempo real de copia de fotos | Almacenamiento en memoria | 45 s dentro de la publicación; si no basta, `media_timeout` y el reintento (300 s) sigue desde la caché. |
| El script real del VPS (`/opt/vps-autodeploy.sh`) | Fuera del repo | La protección del primer despliegue no depende de él: el interruptor sale apagado y no hay fichas de referencia. |
| DNS y TLS reales de `safeFetch` para fotos externas | Sin red | Mismo módulo que ya usa la importación por enlace. |
| Red durante el build | `next build` usa Google Fonts y el tipo de cambio de `/web` | No es Idealista ni una base. Las capturas cargan mosaicos del mapa desde el navegador de prueba. |

## Comportamientos conocidos (no son fallos)

- **Selectores del personal:** al añadir una ficha de referencia a un catálogo, una selección o una colección, el rechazo de la base sale como error de la acción (`reference_only_property`); no hay un mensaje traducido.
- **Panel:** activar «Publicar en la web» en una ficha de referencia da un error de CHECK.
- **«Reconciliar»** no lanza la sincronización por sí sola (D10, sin pasadas en bloque). Tras reconciliar, «Sincronizar» o la siguiente operación la aplican.
- **`clone`** deja el estado incierto hasta «Comprobar en Idealista» (no tiene botón).
- **Anuncios publicados antes de encender:** no se rellenan (D10). Entran con su siguiente operación confirmada.

## Pasos de Fabricio, en orden

1. **Antes de fusionar (solo lectura):**
   `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/idealista-crm-sync-premerge.sql`
   La última fila tiene que decir «todo coincide; se puede fusionar». Si no, **no fusionar** y avisar.
2. **Fusionar** el PR. Eso puede aplicar 0232 y 0233 y desplegar. El interruptor sale **apagado**. Las protecciones de borrado y las políticas nuevas quedan activas desde ese momento.
3. **Comprobar el despliegue:** que el commit en marcha es el del merge (`git fetch && git rev-parse origin/main` y el log del autodeploy).
4. **Antes de encender (solo lectura):**
   `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/idealista-crm-sync-activation.sql`
   Todas las filas `t`. En el informe aparece si el entorno es sandbox (que no toca el CRM) y cuántos anuncios previos hay (no se rellenan).
5. **Encender:**
   `UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';`
6. **Vigilar la primera semana:** la insignia «CRM» del panel, y
   `SELECT status, count(*) FROM idealista_crm_sync GROUP BY 1;`
   `SELECT * FROM idealista_crm_sync WHERE status IN ('failed','needs_review','uncertain','uncertain_create');`

**Apagar en cualquier momento:** `UPDATE app_settings SET value = '{"enabled": false}' WHERE key = 'idealista_crm_sync';`. Se sigue registrando y no se aplica nada.

**Si alguna vez hubiera que revertir el código de esta tarea con fichas de referencia ya creadas:** primero `scripts/sql/idealista-crm-sync-containment.sql` (ensayo con `-v dry=1`), y después revertir. Sin la contención, **no** se revierte (spec, «Recuperación»).

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
```

Las observaciones de control de acceso que no dependen de esta tarea quedan fuera del repositorio, en el anexo privado.
