#!/bin/bash
# Enriquece los anuncios de particulares con lo que dice la DESCRIPCIÓN (teléfono, dirección exacta,
# responsable) — migración 0187, lib/particulares/enrich-*. Solo se aplica la confianza ALTA; lo dudoso queda
# como «Sugerido» en la ficha. Todo lo añadido queda auditado y se puede deshacer desde la ficha.
#
# ⚠️ La copia operativa vive FUERA del repo, en /opt/smartbc-particulares-enrich.sh (igual que
# /opt/smartbc-particulares-links.sh). Si editas una, copia la otra. Crontab del VPS (cada 10 min):
#     */10 * * * * /opt/smartbc-particulares-enrich.sh >> /opt/smartbc-particulares-enrich.log 2>&1
#
# La PRIMERA vez indexa las descripciones de toda la tabla (~88.000, unas 22 pasadas de 4.000 = 4 h a 10 min;
# acelera lanzándolo a mano en bucle) y no aplica nada hasta que acaba: el JSON trae `note`. Después cada
# pasada tarda 1-15 s (sube a ~15 s si hay direcciones que confirmar con Nominatim, ≤1 petición/s).
#
# Probar sin escribir nada:   /opt/smartbc-particulares-enrich.sh dry
# Una pasada más grande:      ENRICH_QS="limit=500&geo=30&index=20000" /opt/smartbc-particulares-enrich.sh
SECRET=$(grep "^CRON_SECRET=" /opt/smartbc-app/.env.local | cut -d= -f2-)
QS="${ENRICH_QS:-}"
if [ "$1" = "dry" ]; then QS="dry=1${QS:+&$QS}"; fi
echo "[$(date -u +%FT%TZ)] $(curl -s -m 115 -X POST "http://localhost:3000/api/cron/particulares/enrich${QS:+?$QS}" -H "Authorization: Bearer $SECRET")"
