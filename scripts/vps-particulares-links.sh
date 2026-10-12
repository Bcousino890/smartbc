#!/bin/bash
# Enlaza los anuncios de particulares que son el MISMO inmueble (otro portal,
# otra operación, otro contacto) — migración 0176, lib/particulares/linking-*.
#
# ⚠️ La copia operativa vive FUERA del repo, en /opt/smartbc-particulares-links.sh
# (igual que el resto de scripts de cron: ver /opt/smartbc-portal-links-import.sh).
# Si editas una, copia la otra. Crontab del VPS (cada 10 min):
#     */10 * * * * /opt/smartbc-particulares-links.sh >> /opt/smartbc-particulares-links.log 2>&1
#
# Es idempotente y tarda ~1-3 s. Una pasada con ?dry=1 solo calcula y cuenta.
SECRET=$(grep "^CRON_SECRET=" /opt/smartbc-app/.env.local | cut -d= -f2-)
echo "[$(date -u +%FT%TZ)] $(curl -s -m 100 -X POST "http://localhost:3000/api/cron/particulares/link-twins${1:+?dry=1}" -H "Authorization: Bearer $SECRET")"
