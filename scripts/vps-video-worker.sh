#!/bin/bash
# ⚠️ COPIA DE REFERENCIA. La que corre vive en /opt/smartbc-video-worker.sh
# del VPS (fuera del repo, como el autodeploy): si editas una, copia la otra.
# ============================================================================
# SmartBC · worker del generador de vídeo (Ken Burns)
# ============================================================================
# El endpoint renderiza UN vídeo por pasada, a propósito: el render de ffmpeg
# comparte CPU con la web. Este cron corre SOLO de madrugada (1:00–7:59, cada
# 10 min → hasta 42 vídeos/noche): con 39 trabajos pendientes y ~630
# propiedades sin vídeo, la cola se vacía en unos días sin tocar las horas de
# trabajo. Instalado por el sprint Properties Workspace 2.0 (2026-08-20).
# ============================================================================
set -u
SECRET=$(grep -m1 "^CRON_SECRET=" /opt/smartbc-app/.env.local | cut -d= -f2- | tr -d "\"")
[ -z "$SECRET" ] && { echo "$(date -Is) [error] sin CRON_SECRET"; exit 1; }
# El backup de la base corre a las 4:00: se le deja el hueco entero.
H=$(date +%H)
[ "$H" = "04" ] && exit 0
curl -s -m 540 -X POST -H "Authorization: Bearer $SECRET" \
  http://localhost:3000/api/cron/property-videos \
  | head -c 400
echo " $(date -Is)"
