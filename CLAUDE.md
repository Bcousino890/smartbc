# smartbc — Notas de infraestructura

## Stack real
- **Todo en VPS propio (Hetzner)**
- **NO usa Supabase** — la base de datos (PostgreSQL) corre en el VPS
- **NO usa Vercel** — el servidor Next.js corre en el VPS con PM2
- Deploy: push a `main` → SSH al VPS → `git pull && npm run build && pm2 restart`

## Ramas
- Desarrollo: `claude/adoring-pasteur-3OgFB`
- Producción: `main`
