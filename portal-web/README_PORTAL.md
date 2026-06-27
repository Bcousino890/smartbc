# Portal Web Benjamín Cousiño Propiedades

Portal público de propiedades para Benjamín Cousiño Propiedades.

**URL:** https://portal.bcousinoprop.com/web/

## Stack Técnico

- **Framework:** TanStack Start (SSR con React + Vite)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui + Radix UI
- **Package Manager:** Bun

## Desarrollo Local

```bash
# Instalar dependencias
bun install

# Desarrollo
bun run dev

# Build para producción
bun run build

# Preview producción
bun run preview
```

## Despliegue

Esta aplicación se despliega automáticamente en el VPS como una aplicación PM2 independiente:

- App: `smartbc-portal-web`
- Puerto: 3138 (proxy nginx a `/web/`)
- Base path: `/web/`

El VPS automáticamente:
1. Ejecuta `git pull` cada 5 min
2. Instala dependencias: `cd portal-web && npm install`
3. Compila: `npm run build`
4. Reinicia PM2: `pm2 restart smartbc-portal-web`

## Variables de Entorno

Crear `.env.production` con:

```env
VITE_API_URL=https://portal.bcousinoprop.com
VITE_APP_BASE=/web/
```

## Nginx Configuration

El VPS debe tener esta configuración en nginx para proxy `/web/`:

```nginx
location /web/ {
    proxy_pass http://localhost:3138/web/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Estructura de Rutas

- `/` - Página de inicio
- `/propiedades` - Catálogo de propiedades
- Custom routes en `src/routes/`

## Notas

- Este es un TanStack Start, no Next.js
- Usa Bun, no npm/yarn
- Se sirve bajo `/web/` en producción
