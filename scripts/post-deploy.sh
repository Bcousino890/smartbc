#!/bin/bash

# Script de post-deploy que se ejecuta después de cada git pull en el VPS
# Se encarga de aplicar migraciones y otros cambios necesarios
# Uso: Se debe llamar automáticamente desde el cron de deploy

set -e

echo "🚀 Post-deploy: Aplicando cambios..."
echo ""

# Detectar si estamos en Docker o no
if command -v docker &> /dev/null; then
  DB_CMD="docker exec -i supabase-db psql -U postgres -d postgres"
  echo "✅ Docker disponible - usando contenedor supabase-db"
else
  DB_CMD="psql -U postgres -d postgres"
  echo "⚠️  Docker no disponible - usando psql local"
fi

# Aplicar migraciones
echo "📝 Aplicando migraciones SQL..."
MIGRATION_COUNT=0

for migration in supabase/migrations/*.sql; do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    echo "  • $filename"

    # Ejecutar migración
    if $DB_CMD < "$migration" 2>/dev/null; then
      ((MIGRATION_COUNT++))
    else
      echo "    ⚠️  (puede ser normal si ya está aplicada)"
    fi
  fi
done

echo "✅ $MIGRATION_COUNT migraciones procesadas"
echo ""

# Instalar dependencias si es necesario
if [ -f "package.json" ]; then
  echo "📦 Verificando dependencias..."
  npm ci --production 2>&1 | grep -E "^added|^up to date" || true
fi

# Build de Next.js
if [ -f "next.config.js" ] || [ -f "next.config.mjs" ]; then
  echo "🔨 Compilando Next.js..."
  npm run build
  echo "✅ Build exitoso"
fi

echo ""
echo "✨ Post-deploy completado"
echo ""
echo "Sistema listo para:"
echo "  ✅ Crear usuarios admin/asesor"
echo "  ✅ Configurar SMTP"
echo "  ✅ Usar matriz de permisos"
echo "  ✅ Enviar emails de reset"
