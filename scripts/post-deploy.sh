#!/bin/bash

# Script de post-deploy que se ejecuta después de cada git pull en el VPS
# Se encarga de aplicar migraciones y otros cambios necesarios
# Uso: Se debe llamar automáticamente desde el cron de deploy

echo "🚀 Post-deploy: Aplicando cambios..."
echo ""

# Detectar si estamos en Docker o no
if command -v docker &> /dev/null && docker ps | grep -q supabase-db; then
  DB_CMD="docker exec -i supabase-db psql -U postgres -d postgres"
  echo "✅ Docker disponible - usando contenedor supabase-db"
elif command -v docker &> /dev/null; then
  echo "⚠️  Contenedor supabase-db no está corriendo. Intentando iniciar..."
  docker start supabase-db 2>/dev/null || echo "No se pudo iniciar. Usando psql local si está disponible."
  if docker ps | grep -q supabase-db; then
    DB_CMD="docker exec -i supabase-db psql -U postgres -d postgres"
  else
    DB_CMD="psql -U postgres -d postgres"
  fi
else
  DB_CMD="psql -U postgres -d postgres"
  echo "⚠️  Docker no disponible - usando psql local"
fi

# Aplicar migraciones
echo "📝 Aplicando migraciones SQL..."
MIGRATION_COUNT=0
ERROR_COUNT=0

for migration in supabase/migrations/*.sql; do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    echo "  • $filename"

    # Ejecutar migración con timeout de 30s
    if timeout 30 $DB_CMD < "$migration" 2>&1 | grep -q "ERROR\|error"; then
      echo "    ⚠️  (puede ser normal si ya está aplicada)"
      ((ERROR_COUNT++))
    elif timeout 30 $DB_CMD < "$migration" > /dev/null 2>&1; then
      ((MIGRATION_COUNT++))
    else
      echo "    ⚠️  (timeout o ya aplicada)"
    fi
  fi
done

echo "✅ $MIGRATION_COUNT migraciones procesadas ($ERROR_COUNT mensajes de advertencia)"
echo ""

# Recargar el schema cache de PostgREST: sin esto, la API de Supabase no "ve"
# tablas/columnas nuevas creadas por las migraciones hasta reiniciar el
# contenedor rest (error PGRST205 "Could not find the table ... in the schema
# cache" → 500 en las rutas que las usan).
echo "🔄 Recargando schema cache de PostgREST..."
if echo "NOTIFY pgrst, 'reload schema';" | $DB_CMD > /dev/null 2>&1; then
  echo "✅ Schema cache recargado"
else
  echo "⚠️  No se pudo recargar el schema — si la API no ve tablas nuevas, reinicia el contenedor rest: docker restart supabase-rest"
fi
echo ""

# Instalar dependencias si es necesario
if [ -f "package.json" ]; then
  echo "📦 Verificando dependencias..."
  npm ci --production 2>&1 | grep -E "^added|^up to date" || true
fi

# Instalar Chromium para Playwright (extracción de teléfonos de Idealista).
# playwright ahora está en dependencies, así que node_modules/.bin/playwright existe.
# La instalación es idempotente: si Chromium ya está en ~/.cache/ms-playwright, tarda < 1s.
if [ -f "node_modules/.bin/playwright" ]; then
  echo "🌐 Verificando Chromium para Playwright..."
  node_modules/.bin/playwright install chromium --with-deps 2>&1 | tail -3 || echo "⚠️  Chromium install falló (la extracción de teléfonos usará solo curl)"
fi

# ffmpeg: motor de los vídeos automáticos de propiedad. No se instala desde
# aquí (requiere root y el deploy no debería tocar paquetes del sistema), solo
# se avisa: sin él la generación de vídeos queda desactivada y el panel lo
# indica, pero el resto de la aplicación funciona igual.
echo "🎬 Verificando ffmpeg (vídeos de propiedad)..."
if command -v ffmpeg &> /dev/null && command -v ffprobe &> /dev/null; then
  echo "✅ $(ffmpeg -version 2>/dev/null | head -1 | cut -c1-60)"
else
  echo "⚠️  ffmpeg no está instalado — los vídeos automáticos no se generarán."
  echo "    Instálalo con: apt install ffmpeg"
  echo "    Y sube FILE_SIZE_LIMIT del contenedor 'storage' a 500MB (ver CLAUDE.md)."
fi
echo ""

# Rebuild de Next.js + reinicio de la app.
#
# Este bloque estaba MUERTO: comprobaba next.config.js/.mjs y el proyecto usa
# next.config.ts, así que nunca compilaba. El botón de /admin/configuracion solo
# aplicaba migraciones y no había forma de reconstruir producción sin SSH.
#
# Se lanza DESACOPLADO (setsid + nohup) por dos razones:
#  - el build tarda minutos y la petición HTTP del botón moriría antes;
#  - al terminar reinicia PM2, que mata al proceso Next desde el que se ejecuta
#    este script: si el build fuese hijo suyo, se cortaría a medias.
# Con SKIP_REBUILD=1 se salta (útil si solo quieres aplicar migraciones).
if [ -z "${SKIP_REBUILD:-}" ] && ls next.config.* >/dev/null 2>&1; then
  echo "🔨 Lanzando rebuild atómico + reinicio en segundo plano..."
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup bash scripts/rebuild-restart.sh >/dev/null 2>&1 &
  else
    nohup bash scripts/rebuild-restart.sh >/dev/null 2>&1 &
  fi
  disown 2>/dev/null || true
  echo "   Log del rebuild: /tmp/smartbc-rebuild.log"
  echo "   Tarda unos minutos. Al terminar la web se reinicia (dará error unos"
  echo "   segundos) y quedará con el código más reciente."
  echo "   Si el build falla, producción NO se toca: sigue como está."
fi


# NOTA: la verificación de teléfonos de particulares ya NO se hace aquí.
# Va integrada en el cron horario /api/cron/particulares/scrape, que cada
# hora revisa ~50 anuncios sin teléfono vía el endpoint AJAX de Idealista
# ("Ver teléfono"). No depende del crontab del VPS ni de este script.

echo ""
echo "✨ Post-deploy completado"
echo ""
echo "Sistema listo para:"
echo "  ✅ Crear usuarios admin/asesor"
echo "  ✅ Configurar SMTP"
echo "  ✅ Usar matriz de permisos"
echo "  ✅ Enviar emails de reset"
echo "  ✅ Verificación automática de teléfonos (en el cron horario)"
