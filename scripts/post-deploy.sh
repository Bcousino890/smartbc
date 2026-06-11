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

# Instalar dependencias si es necesario
if [ -f "package.json" ]; then
  echo "📦 Verificando dependencias..."
  npm ci --production 2>&1 | grep -E "^added|^up to date" || true
fi

# Build de Next.js
if [ -f "next.config.js" ] || [ -f "next.config.mjs" ]; then
  echo "🔨 Compilando Next.js..."
  if npm run build; then
    echo "✅ Build exitoso"
  else
    echo "❌ Error en build - revisa los logs arriba"
    exit 1
  fi
fi


# Directorio base del proyecto
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Tarea única: Verificación inicial de todos los particulares ──────────────
# Se ejecuta solo una vez la primera vez que se depliegue. Busca en TODOS los
# anuncios activos (sin límite en etapas) para detectar teléfonos que existen
# pero no fueron extraídos en el scrape inicial.
INITIAL_VERIFY_FLAG="$APP_DIR/.initial-phone-verify-done"

if [ ! -f "$INITIAL_VERIFY_FLAG" ]; then
  echo "🔍 Ejecutando verificación inicial de teléfonos en todos los particulares..."
  echo "   Esto puede tomar unos minutos (~1980 anuncios)..."

  # Esperar 10 segundos a que PM2 inicie el server después del build
  sleep 10

  # Llamar al endpoint con modo 'all' sin límite (batches de 100 internamente)
  # Repetir hasta que no queden más anuncios por verificar
  VERIFIED=0
  for batch in {1..30}; do
    RESPONSE=$(curl -s -X POST \
      -H "Authorization: Bearer ${CRON_SECRET:-placeholder}" \
      "http://localhost:3000/api/admin/particulares/verify-phones?mode=all&limit=100" 2>&1)

    CHECKED=$(echo "$RESPONSE" | grep -o '"checked":[0-9]*' | cut -d: -f2 || echo "0")
    VERIFIED=$((VERIFIED + CHECKED))

    if [ "$CHECKED" = "0" ] || [ "$CHECKED" -lt "100" ]; then
      break
    fi

    echo "   📊 Batch $batch: $CHECKED verificados (total: $VERIFIED)"
    sleep 2  # Pequeña pausa entre batches para no sobrecargar
  done

  echo "✅ Verificación inicial completada: $VERIFIED anuncios verificados"

  # Marcar que ya se hizo la verificación inicial
  touch "$INITIAL_VERIFY_FLAG"
else
  echo "ℹ️  Verificación inicial ya completada anteriormente (saltando)"
fi

# ─── Configurar cron de verificación de teléfonos (cada 2 días) ─────────────
# Se agrega automáticamente si no existe ya en el crontab.
# Requiere que CRON_SECRET esté definido en el entorno del cron de deploy.
echo "📅 Verificando cron de teléfonos de particulares..."

CRON_ENTRY="0 0 */2 * * CRON_SECRET=\$CRON_SECRET APP_URL=\${APP_URL:-http://localhost:3000} $APP_DIR/scripts/verify-particulares-phones.sh missing 100 >> $APP_DIR/logs/cron-verify-phones.log 2>&1"
CRON_MARKER="verify-particulares-phones.sh"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  echo "  ✅ Cron de teléfonos ya configurado (sin cambios)"
else
  # Agregar la nueva entrada al crontab existente
  (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
  echo "  ✅ Cron de teléfonos agregado (cada 2 días a las 00:00 UTC)"
fi

# Crear carpeta de logs si no existe
mkdir -p "$APP_DIR/logs"

echo ""
echo "✨ Post-deploy completado"
echo ""
echo "Sistema listo para:"
echo "  ✅ Crear usuarios admin/asesor"
echo "  ✅ Configurar SMTP"
echo "  ✅ Usar matriz de permisos"
echo "  ✅ Enviar emails de reset"
echo "  ✅ Verificación automática de teléfonos (cron cada 2 días)"
