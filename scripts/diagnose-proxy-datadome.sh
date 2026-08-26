#!/bin/bash
# Diagnóstico rápido: ¿Está DataDome bloqueando el pool Evomi residential?
# Ejecutar en la VPS: bash scripts/diagnose-proxy-datadome.sh
# Devuelve JSON con verdicts de los últimos 50 requests a Idealista

set -e

echo "🔍 Diagnosticando bloqueo DataDome en Evomi residential..."
echo ""

# Conectar a la BD Supabase (asume que corre en localhost:5432)
# El script extrae app_settings y comprueba los últimos diagnósticos

PSQL_CMD="psql -U postgres -h localhost -d postgres -p 5432"

# Obtener URL del proxy actual
PROXY_URL=$($PSQL_CMD -t -c "SELECT value FROM app_settings WHERE key = 'scraping.proxyUrl' LIMIT 1;" 2>/dev/null || echo "NO_PROXY")

if [ "$PROXY_URL" = "NO_PROXY" ]; then
  echo "❌ ERROR: No hay proxy configurado en app_settings['scraping.proxyUrl']"
  exit 1
fi

echo "📌 Proxy configurado: $PROXY_URL"
echo ""

# Extraer verdicts de los últimos 50 requests registrados
# (Asume tabla scrape_logs o similar que registre DataDome verdicts)
echo "📊 Últimos 50 requests a Idealista (mostrando verdict DataDome):"
echo ""

$PSQL_CMD -t -A -F',' -c "
  SELECT
    created_at,
    property_id,
    status,
    CASE
      WHEN response LIKE '%t=bv%' THEN 'HARDBLOCK (t=bv)'
      WHEN response LIKE '%t=fe%' THEN 'SOLVABLE CAPTCHA (t=fe)'
      WHEN response LIKE '%contact-phones%' THEN 'OK (sin CAPTCHA)'
      ELSE 'UNKNOWN'
    END as datadome_verdict
  FROM scrape_logs
  WHERE source = 'idealista'
    AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 50;
" 2>/dev/null || echo "⚠️  No se pudo conectar a scrape_logs (tabla no existe o BD no accesible)"

echo ""
echo "📈 Resumen de últimas 24h:"
echo ""

$PSQL_CMD -t -A -F':' -c "
  SELECT
    CASE
      WHEN response LIKE '%t=bv%' THEN 'HARDBLOCK (t=bv)'
      WHEN response LIKE '%t=fe%' THEN 'SOLVABLE (t=fe)'
      WHEN response LIKE '%contact-phones%' THEN 'OK'
      ELSE 'UNKNOWN'
    END as verdict,
    COUNT(*) as count
  FROM scrape_logs
  WHERE source = 'idealista'
    AND created_at > NOW() - INTERVAL '24 hours'
  GROUP BY verdict
  ORDER BY count DESC;
" 2>/dev/null || echo "⚠️  No se pudo generar resumen"

echo ""
echo "💡 Interpretación:"
echo "  • Si ves HARDBLOCK (t=bv) en >90% → Evomi residential está bloqueado"
echo "  • Si ves SOLVABLE (t=fe) en >0% → CapSolver puede resolver (funciona)"
echo "  • Si ves OK en >10% → Pool está parcialmente limpio"
echo ""
echo "✅ Solución si está bloqueado: Contratar Evomi Mobile Pool (4G/LTE)"
