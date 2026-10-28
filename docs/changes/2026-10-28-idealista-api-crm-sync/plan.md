# Idealista API → CRM: plan

- **Especificación:** [spec.md](spec.md), revisión 4. La ejecución se aprobó el 2026-10-28.
- **Rama:** `fabri/idealista-api-crm-sync`
- **Estado:** aprobado para ejecutar T1–T12 (2026-10-28). Se para antes del merge.

## Base

- **SHA de partida:** `origin/main` = `9356300a2be17dc509d72f974ee92eacfb787562` (antes `3f8ad3b2`; los dos commits nuevos no tocan migraciones ni piezas del alcance salvo `lib/portal-links/*`, cubierto por trigger). Se vuelve a comprobar con `git ls-remote` al crear la rama.
- **Si `main` avanza:**
  - se hace un merge de `origin/main` en la rama;
  - si la 0232 o la 0233 ya están ocupadas, se renumeran;
  - si alguna función de catálogo ha cambiado en `main`, se vuelve a partir de su definición vigente.
- **No se usan** el `main` local ni el checkout principal, que pertenecen a otra conversación.

## Pasos de entorno autorizados

| Paso | Comando | Efecto |
|---|---|---|
| E1 | `git -C ~/SMARTBC/smartbc fetch origin` y `git ls-remote origin refs/heads/main` | Lee GitHub. |
| E2 | `git -C ~/SMARTBC/smartbc worktree add -b fabri/idealista-api-crm-sync ~/SMARTBC/wt/idealista-crm-sync <SHA>` | El worktree de edición y commits. No se abre, no se mueve y no se lee ningún `.env*` suyo. |
| E3 | **Copia exportada aislada:** `rsync -a --delete --exclude=.git --exclude='.env*' --exclude=node_modules --exclude='.next*' ~/SMARTBC/wt/idealista-crm-sync/ <scratchpad>/export/`, y después `find <scratchpad>/export -name '.env*'`, que tiene que salir vacío | Una copia sin archivos `.env` ni credenciales. El build y todas las pruebas se ejecutan **solo aquí**. Se vuelve a sincronizar antes de cada ronda. |
| E4 | `npm ci` en `<scratchpad>/export` | Instala lo que fija `package-lock.json`, sin paquetes nuevos. |
| E5 | `npx playwright install chromium` en la copia, solo si hace falta | Descarga el navegador. |
| E6 | `BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/run-local.sh start\|reset\|sql\|stop\|clean` | El Postgres temporal (127.0.0.1:54329, base `bcp_test`), con su propia protección de destino y el entorno de conexión limpiado. Datos sintéticos. |
| E7 | En la copia: `env -i PATH=$PATH HOME=$HOME NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<sim> NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_PORTAL_URL=http://127.0.0.1:<app> NEXT_BUILD_DIR=.next.qa npx next build` | Build de producción aislado. Puede usar la red (Google Fonts). No conecta a ninguna base ni a Idealista. |
| E8 | En la copia: `node --experimental-strip-types scripts/sim/postgrest-sim.mts <puerto> <fixture> <registro> <imgs> --auth` y `next start -H 127.0.0.1` con el mismo entorno de E7 | Rutas reales contra el simulador. Todo en local. |
| E9 | En la copia: `NODE_ENV=development CATALOG_FIXTURES=1 next dev -H 127.0.0.1` con variables ficticias | Las páginas `/dev-fixtures/*`. |
| E10 | Los scripts E2E con Chromium contra E8 y E9 | Pruebas de rutas y capturas. |
| E11 | `git push -u origin fabri/idealista-api-crm-sync` y `gh pr create --base main` | El PR. |

**No se ejecuta nunca:**
- nada en el VPS ni en producción;
- `apply-migrations.sh`, `docker exec` ni `psql` fuera de E6;
- `idealista:smoke` ni los casos oficiales de Idealista;
- nada que lea, mueva o imprima un `.env*` o una credencial;
- `npm run build` en el worktree, ni un bucle sobre los `npm run` de la CI que incluya `build`;
- ninguna llamada a Idealista;
- **ninguna sonda contra un despliegue real, ni repetir la investigación de seguridad que se paró.** Las pruebas de políticas son pruebas unitarias de las políticas nuevas en la base sintética.

## Tareas

Cada tarea termina con la verificación indicada antes de hacer su commit.

### T1. Expediente en la rama

- **Acción:**
  - copiar `spec.md` y `plan.md` (revisión 4, con la aprobación);
  - escribir `definiciones-vigentes.md`, la tabla de cada función y política que se redefine, con su migración y su línea;
  - hacer un grep para comprobar que ningún documento del repositorio describe las observaciones del anexo privado.
- **Verificación:** el diff solo tiene documentación.
- **Commit:** `Idealista API → CRM: especificación y plan aprobados (revisión 4)`

### T2. Esqueleto SQL

- **Acción:** `scripts/sql/fixtures/idealista-crm-sync-schema.sql`, con la migración de origen en cada bloque. Contiene:
  - los roles, un esquema `auth` mínimo, `profiles`, `is_staff` e `is_admin`;
  - `properties`, `property_photos`, `property_media` y las etiquetas;
  - `agencies` y `app_settings`;
  - `idealista_listings`;
  - las tablas de catálogos, clientes, colaboraciones y favoritos que tocan los triggers;
  - las funciones de catálogo afectadas, **copiadas literalmente** de su definición vigente, con lo que necesitan para funcionar.
- **Verificación:** se aplica en E6.
- **Commit:** junto con T3.

### T3. Migraciones 0232 y 0233, reversiones, contención y comprobaciones previas

- **Acción:**
  - la 0232 y la 0233, según las secciones 1–10 de la especificación;
  - `rollback-0232.sql` y `rollback-0233.sql`, que abortan si hay datos;
  - `scripts/sql/idealista-crm-sync-containment.sql`, con ensayo y deshacer;
  - `scripts/sql/idealista-crm-sync-premerge.sql` y `…-activation.sql`, solo `SELECT`.
- **Verificación:**
  - `lint-migrations.py`;
  - en E6, cada migración se aplica dos veces;
  - la comparación de cada función de catálogo con su definición vigente solo admite el predicado `reference_only`;
  - las comprobaciones previas se ejecutan en E6 y dicen «coincide» con el esqueleto y «no coincide» con un esqueleto alterado a propósito.
- **Commit:** `Idealista API → CRM: migraciones 0232 (frontera y protecciones) y 0233 (registro y sincronización)`

### T4. Pruebas SQL de comportamiento

- **Acción:** `scripts/sql/test-idealista-crm-sync.sql`. Cubre:
  - la clasificación;
  - la inmutabilidad;
  - el registro de solo añadir y los solapes calculados;
  - los objetivos y la incertidumbre (todos los casos de la sección 3);
  - lo obsoleto;
  - la etiqueta;
  - el archivado y la reactivación;
  - las filas de multimedia;
  - las protecciones de borrado;
  - el interruptor y el sandbox;
  - los permisos;
  - la concurrencia, con dos sesiones `psql`.
- **Verificación:** todo en «ok». Después, mutaciones, comprobando que cada una rompe al menos una prueba:
  - quitar el bloqueo;
  - aceptar un `seq` menor;
  - clasificar por `property_id` antes que por la asociación;
  - aceptar otro país;
  - permitir borrar con el anuncio activo;
  - permitir un `UPDATE` del registro.
- **Cubre:** AC1–AC9, AC14, AC17.
- **Commit:** `Idealista API → CRM: pruebas SQL de comportamiento`

### T5. Pruebas de la frontera y de la recuperación con datos

- **Acción:**
  - **`test-idealista-crm-boundary.sql`**, con roles sintéticos:
    - las lecturas de un cliente;
    - los triggers de asociación;
    - las funciones de catálogo;
    - el CHECK;
    - los permisos.
  - **`test-idealista-crm-rollback.sql`**, con datos (fichas generadas y existentes, operaciones, objetos y asociaciones):
    - las consultas del build anterior transcritas literalmente, con su `archivo:línea` de `3f8ad3b2`, con la contención y sin ella;
    - que las reversiones se nieguen;
    - deshacer la contención;
    - con la base vacía, la reversión deja un `pg_dump -s` idéntico al de T2.
- **Verificación:** todo en «ok». Mutaciones: quitar una política, un trigger o un predicado rompe al menos una prueba.
- **Cubre:** AC11, AC15.
- **Commit:** `Idealista API → CRM: pruebas de la frontera y de la recuperación con datos`

### T6. Módulo `crm-sync`

- **Acción:**
  - **Partes puras:** `outcome.ts`, `content.ts` (C2), `manifest.ts` (mismo orden que `buildImageList`) y `slug.ts` (C5).
  - **`media.ts`:**
    - copia por contenido con `upsert: false`;
    - `storage.download` para el bucket propio y `safeFetch` para lo externo;
    - los límites de tipo, tamaño, cantidad, concurrencia y presupuesto;
    - la caché de orígenes y la limpieza segura.
  - **`sync.ts`:** `begin`, `finish`, `step`, `applyLatest`, `resolveReview`, `recoverApiId` y `recordReconcileObservation`.

  No importa `partner-api/client` ni `partner-api/endpoints`.
- **Verificación:** `tsc`.
- **Commit:** junto con T7.

### T7. Enganche en `publish.ts` y `reconcile.ts`

- **Acción:**
  - publicar, dar de baja, reactivar y `refresh-state` siguen este orden: `begin` (si falla, no se llama), la llamada de siempre, `finish`, las escrituras de siempre registradas como `step` y `applyLatest`;
  - `ok` significa solo Idealista, y los pasos van en `steps_result`;
  - los bloqueos del alta;
  - `reactivate` deja su `logCall`;
  - `reconcile.ts` registra `observe_reconcile` en los emparejamientos sin ambigüedad;
  - un punto de inyección de dependencias opcional, con las reales por defecto.
- **Verificación:**
  - `tsc` y `test:idealista`;
  - un diff vacío en `mapper`, `client`, `endpoints`, `config`, `validate` y `schemas`;
  - con un cliente falso (T10), la secuencia de método, ruta y cuerpo es idéntica a la de antes.
- **Cubre:** AC7, AC13, AC16.
- **Commit:** `Idealista API → CRM: registrar las operaciones y separar el resultado de Idealista de los fallos locales`

### T8. Filtros de la aplicación y ajustes

- **Acción:**
  - los filtros `reference_only` de la sección 6, incluido `getPropertyForOffer` (D22);
  - el orden de los planos por `position`;
  - los mensajes de las protecciones;
  - comprobar si `updateProperty` cambia el slug **(sin comprobar)** y, si lo hace, conservarlo en las fichas de referencia.
- **Verificación:** `tsc` y las pruebas de fuente de T10.
- **Cubre:** AC11.
- **Commit:** `Idealista API → CRM: fichas de referencia fuera de la web, el portal, las sugerencias, los catálogos, las colecciones y el correo de oferta`

### T9. Rutas y panel

- **Acción:**
  - la ruta `POST /api/admin/idealista/crm-sync`;
  - «Comprobar en Idealista» (`refresh-state`, registrado);
  - el panel: insignias, SmartLink, revisión, reintento, comprobación, «Recuperar id» y pasos separados;
  - el aviso de la papelera;
  - `/dev-fixtures/idealista-crm`, protegida por `isCatalogFixtureMode()`.
- **Verificación:** `tsc` y T11.
- **Commit:** `Idealista API → CRM: reintento, revisión y estado en el panel`

### T10. Suites TypeScript

- **Acción:**
  - **`test-idealista-crm-sync.mts`** (CI, sin base): las partes puras, `publish.ts` con un cliente falso (AC13 y la secuencia idéntica), el adaptador del SmartLink con centinelas y las pruebas de fuente.
  - **`test-idealista-crm-flow.mts`** (local, con el adaptador psql y el almacenamiento en memoria): el código real de `crm-sync`, `getPropertyBySlugPublic`, el resolvedor de `/c` y el de fotos de `/p` contra las funciones reales en E6.
    - AC1, AC10 y AC12 en la parte de datos;
    - un proceso atrasado frente a uno nuevo;
    - los límites con `safeFetch` mediante sus ganchos de prueba.

    Si hace falta, se amplía `supabase-on-psql.mts` con relaciones anidadas y `or`.
  - Añadir los scripts a `package.json`, y el de CI a `ci.yml`.
- **Verificación:** las dos en verde. Mutaciones: reintentar llamando a publicar, `ok:false` en un fallo local, aplicar sin `begin`, proyectar `internal_notes` y `upsert:true` en la copia.
- **Cubre:** AC1, AC10, AC12, AC13, AC16, AC17.
- **Commit:** `Idealista API → CRM: suites offline`

### T11. Build aislado, rutas reales y QA visual

- **Acción:**
  - **El build de E7.**
  - **`scripts/qa/idealista-crm-smartlink-routes.mts`:** un fixture del simulador con una ficha de referencia viva, la misma archivada, una normal y textos centinela. Contra `next start` (E8):
    - `/compartir/{shareSlug}` responde 200 **sin cookies** y con fotos;
    - los centinelas no aparecen en el HTML ni en la carga de React;
    - `/c/[token]`, `/og/property/[slug]` y `/p/[slug]/0` funcionan;
    - archivada, las cuatro dan 404;
    - `/web/propiedades` y la API del portal no la incluyen;
    - se revisa el registro del simulador.
  - **`scripts/qa/idealista-crm-sync-e2e.mts`:** capturas de `/dev-fixtures/idealista-crm` a 1440 px y 390 px, en tema claro y oscuro (E9).
  - En `result.md` se separa lo que prueba cada una. Las capturas son **visuales**. Las rutas reales prueban el enrutado, el acceso anónimo y el 404. Ninguna de las dos prueba las políticas: eso lo hace T5.
- **Verificación:** el build termina, los dos scripts dan verde y Fabricio revisa las capturas.
- **Cubre:** AC12, AC18.
- **Commit:** `Idealista API → CRM: rutas reales del SmartLink y QA visual`

### T12. Resultado, PR y CI

- **Acción:**
  - **`result.md`:** cada comando con su salida, lo que no se pudo demostrar, los pasos de Fabricio en orden y la contención.
  - **Pasos de Fabricio, en orden:**
    1. la comprobación previa al merge;
    2. el merge;
    3. el despliegue;
    4. la comprobación de activación;
    5. encender el interruptor;
    6. la vigilancia.
  - Push, PR y CI.
- **Verificación:** la CI del PR en verde.
- **Commit:** `Idealista API → CRM: resultado`

## Verificación final

En la copia exportada:
- `lint-migrations.py`, `tsc` y `test:idealista`;
- las suites nuevas;
- T4 y T5 con sus mutaciones;
- el build aislado y los dos E2E.

Además, la CI del PR en verde y el diff vacío de I2. **Se para antes del merge.**

## Riesgos y suposiciones

- **El esquema de producción puede no coincidir.** Lo cierra la comprobación previa al merge que ejecuta Fabricio. Si no coincide, no se fusiona.
- **Las funciones de catálogo redefinidas.** Lo cubren la comparación de T3 y las suites de catálogos de la CI.
- **El simulador no hace cumplir la base de datos.** Lo cubren T4 y T5.
- **«RESERVADO» en `es`.** Lo comprueba Fabricio antes de encender.
- **El script del VPS (sin comprobar).** La protección del despliegue (interruptor apagado y sin fichas de referencia) no depende de él. La de las vueltas atrás posteriores sí.
- **Los vídeos referenciados.** Desaparecen del SmartLink si se borra el original (D23).
- **Lo que no tiene arreglo dentro del alcance** se para y se informa.

## Aprobación

- **2026-10-28.** Fabricio aprueba ejecutar T1–T12 con D17–D24 y las correcciones obligatorias 1–7, que incorpora esta revisión.
- **Autorizado:** E1–E11.
- **No autorizado:** producción, credenciales, llamadas reales a Idealista por parte de agentes, una revisión adicional de Codex y repetir la investigación de seguridad que se paró.
- Se para antes del merge y en cualquier obstáculo sin resolver.
