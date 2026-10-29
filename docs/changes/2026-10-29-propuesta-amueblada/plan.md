# Propuesta amueblada en «Propiedades»: plan

Por D4 se implementa directamente y se revisa en el PR. Este plan registra los pasos ejecutados y los límites que se respetaron.

## Base

- Worktree `~/SMARTBC/wt/propuesta-amueblada`, rama `fabri/propuesta-amueblada`, desde `origin/main` `53714f22` (comprobado con `git ls-remote`).
- `node_modules` enlazado al del checkout principal. No se instaló nada.

## Tareas

| Id | Tarea | Archivos |
| --- | --- | --- |
| T1 | Migración 0235 y su reversión | `supabase/migrations/0235_…`, `rollback-0235.sql` |
| T2 | Lógica pura y test | `lib/furnishing/proposal.ts`, `lib/furnishing/facts.ts`, `scripts/test-furnishing-proposal.mts`, `package.json`, `ci.yml` |
| T3 | Lecturas admin y pública | `lib/db/queries/furnishing.ts` |
| T4 | Acciones y subida | `app/(admin)/admin/propiedades/furnishing-actions.ts`, `upload/[kind]/route.ts`, `api-guards-allowlist.json` (solo el motivo) |
| T5 | Visor | `components/furnishing/furnishing-viewer.tsx` y `.module.css` |
| T6 | Sección del admin | `components/admin/property-furnishing-panel.tsx`, ficha `[slug]/page.tsx` y `property-edit-view.tsx` |
| T7 | Superficie pública | `app/compartir/[slug]/propuesta`, `app/c/[token]/propuesta`, las dos `page.tsx` y `public-property-view.tsx` |
| T8 | QA local | `scripts/qa/furnishing-fixture.mts`, `furnishing-routes.mts`, `furnishing-e2e.mts`, `app/dev-fixtures/propuesta-amueblada` |

## Pasos de entorno

| Id | Comando | Efecto |
| --- | --- | --- |
| E1 | `rsync -a --delete --exclude=.git --exclude='.env*' --exclude=node_modules --exclude='.next*' <worktree>/ <scratchpad>/export/` y `find … -name '.env*'` (vacío) | Copia sin `.env` ni credenciales. El build y la QA se ejecutan solo allí. |
| E2 | `env -i PATH HOME NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3187 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_PORTAL_URL=http://127.0.0.1:3188 NEXT_BUILD_DIR=.next.qa npx next build` | Build de producción aislado. Puede usar la red (Google Fonts). |
| E3 | `scripts/qa/furnishing-fixture.mts <dir> 3187 <carpeta de la entrega>` | Fixture sintético. Copia las 30 imágenes de la entrega **solo** al scratchpad; no se versionan, porque el repo es público. |
| E4 | `scripts/sim/postgrest-sim.mts 3187 …` y `next start -H 127.0.0.1 -p 3188` con el entorno de E2 | Rutas reales contra el simulador, todo en 127.0.0.1. |
| E5 | `NODE_ENV=development CATALOG_FIXTURES=1 FURNISHING_FIXTURE=… next dev -H 127.0.0.1 -p 3189` | `/dev-fixtures/propuesta-amueblada`. |
| E6 | `scripts/qa/furnishing-routes.mts` y `furnishing-e2e.mts` (Chromium) | Rutas, interacciones y capturas. |

**No se ejecutó:** nada en el VPS ni en producción; ni `psql`, `docker exec` o `apply-migrations.sh`; nada que lea un `.env*`; ni `npm run build` en el worktree.
