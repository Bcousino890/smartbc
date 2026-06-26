# DIAGNÓSTICO Y SOLUCIÓN DEL SERVIDOR

Si el servidor está caído o responde lentamente, sigue estos pasos:

## 1. SSH al VPS
```bash
ssh root@tu-vps-ip
```

## 2. Revisar estado de PM2
```bash
pm2 status
# Si smartbc no está corriendo: pm2 start smartbc
# Si está en error: pm2 logs smartbc (últimas 50 líneas)
```

## 3. Revisar logs de Next.js
```bash
pm2 logs smartbc --lines 100
# Busca errores de "build failed", "ENOENT", "permission denied"
```

## 4. Si hay error de build, rebuild:
```bash
cd /path/to/smartbc
npm run build
pm2 restart smartbc
```

## 5. Revisar que la BD está accesible:
```bash
# En el contenedor docker
docker exec supabase-db psql -U postgres -d postgres -c "SELECT 1;"
# Debería responder "1"
```

## 6. Si nada funciona, restart completo:
```bash
cd /path/to/smartbc
git pull origin main
npm ci --production
npm run build
pm2 restart smartbc
```

## 7. Verificar que el sitio está corriendo:
```bash
curl -s https://portal.bcousino prop.com/login | head -20
# Debería ver HTML del login page
```

## SI SIGUE FALLANDO:

Ejecuta esto y comparte el output:
```bash
pm2 logs smartbc --lines 50
```

---

**ALTERNATIVA RÁPIDA (sin SSH):**

Si tienes acceso a la consola de Supabase, ejecuta:
```sql
-- Verifica que la tabla profiles está accesible
SELECT COUNT(*) FROM profiles;

-- Verifica que el usuario existe
SELECT id, email FROM auth.users WHERE email = 'benjamincousino1@gmail.com';
```

Si ambas queries devuelven resultados, la BD está bien.
El problema es con el servidor Next.js.
