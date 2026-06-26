# Configuración de Admins Multi-País

## Problema
Usuario `benjamincousino1@gmail.com` no puede logearse porque su perfil en la BD no existe (auth.users sí existe, pero falta el row en la tabla `profiles`).

## Solución Automática
La aplicación ahora auto-crea perfiles faltantes al login y asigna el rol correctamente basado en la variable de entorno `ADMIN_EMAILS`.

## Pasos de Setup en el VPS

### 1. Establecer Variable de Entorno
En el VPS, añade a tu archivo `.env.local` (o donde guardes env vars de producción):

```bash
ADMIN_EMAILS=benjamincousino1@gmail.com
```

**Para múltiples admins**, sepáralos con comas:
```bash
ADMIN_EMAILS=benjamincousino1@gmail.com,otro@portal.bcousinoprop.com,admin@example.com
```

### 2. Redeploy
El VPS hará auto-deploy en ~5 minutos (cron de git pull). Los cambios incluyen:
- Migración 0042: Crea perfil si es muy antiguo
- Actualización de signInAction: Auto-crea perfil con rol correcto

### 3. Test
1. Ir a login: https://portal.bcousinoprop.com/login
2. Entrar con `benjamincousino1@gmail.com`
3. Seleccionar "Admin" en el dropdown
4. Debería redirigir a `/es/admin`
5. Ver selector de banderas (🇪🇸 / 🇨🇱) para cambiar entre países

## Archivos Modificados
- `.env.example` - Documenta la nueva variable
- `app/(auth)/actions.ts` - Auto-crea perfiles faltantes
- `supabase/migrations/0042_fix_missing_profile.sql` - Fallback SQL si la app falla
- `app/api/admin/fix-profile/route.ts` - Endpoint de debug (opcional)

## Troubleshooting

### El usuario sigue sin poder logearse
1. Verificar que `ADMIN_EMAILS` está establecido en `.env.local`
2. Verificar que el PM2 hizo restart (revisar logs de PM2)
3. Revisar logs de Next.js: `pm2 logs smartbc`

### El usuario se logea pero con rol "client" en lugar de "admin"
- Verificar que el email en `ADMIN_EMAILS` coincide exactamente (case-insensitive, pero sin espacios extra)
- Ejemplo correcto: `benjamincousino1@gmail.com`
- Ejemplo incorrecto: `benjamincousino1@gmail.com ` (nota el espacio al final)

### El usuario se logea pero va a `/inicio` en lugar de `/es/admin`
- Significa que tiene rol "client", no "admin"
- Revisar paso anterior: ADMIN_EMAILS

## API de Debug (Opcional)
Si todo falla, puede llamar:
```bash
curl -X POST https://portal.bcousinoprop.com/api/admin/fix-profile
```

Esto intentará crear/verificar el perfil manualmente. (Requiere estar logueado como admin).
