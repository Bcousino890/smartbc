#!/bin/sh
# SOLO ENTORNO DE PRUEBAS. Envía UNA solicitud sintética a la ingesta real
# (/api/extension/idealista-leads), como haría la extensión.
#
#   ENTORNO=pruebas BASE=https://<entorno-de-pruebas> TOKEN=<token de extensión de ESE entorno> \
#     sh enviar-solicitud.sh <paso>
#
# Pasos: L1 L2 L4 L5 (ver docs/changes/2026-11-02-solicitudes-reparto/validacion.md).
# Se niega a enviar a los dominios de producción.
set -eu
[ "${ENTORNO:-}" = "pruebas" ] || { echo "Falta ENTORNO=pruebas. No se envía nada." >&2; exit 2; }
: "${BASE:?falta BASE}" "${TOKEN:?falta TOKEN}"
case "$BASE" in
  *://bcousinoprop.com*|*://www.bcousinoprop.com*|*://crm.bcousinoprop.com*)
    echo "BASE apunta a producción. No se envía nada." >&2; exit 2 ;;
esac

case "${1:-}" in
  # 1 · Reparto por inmueble: Ref. y Cod. exactos del anuncio A (Asesor QA 1).
  L1) LEAD='{"conversationId":"990237001","name":"QA Persona Uno","phone":"+34 600 990 001","message":"Mensaje sintético: ¿podemos visitar el piso el martes?","propertyTitle":"QA · Ático en Castelló","propertyPrice":"5.400 €/mes","propertyRef":"QA-0237-A","idealistaCode":"990237001"}' ;;
  # 2 · El cliente sintético «QA Cliente Dos» (asesor: QA 2) consulta el anuncio A.
  L2) LEAD='{"conversationId":"990237002","name":"QA Cliente Dos","phone":"+34 600 990 002","message":"Mensaje sintético: me interesa este piso.","propertyTitle":"QA · Ático en Castelló","propertyPrice":"5.400 €/mes","propertyRef":"QA-0237-A","idealistaCode":"990237001"}' ;;
  # 4 · Ref. válida + Cod. que aún no está en el catálogo.
  L4) LEAD='{"conversationId":"990237004","name":"QA Persona Dos","phone":"+34 600 990 004","message":"Mensaje sintético: ¿admite mascotas?","propertyTitle":"QA · Ático en Castelló","propertyPrice":"5.400 €/mes","propertyRef":"QA-0237-A","idealistaCode":"990237009"}' ;;
  # 4 · Consulta neutra (sin Ref. ni Cod.) solo para provocar un lote de ingesta.
  L5) LEAD='{"conversationId":"990237005","name":"QA Persona Cinco","phone":"+34 600 990 005","message":"Mensaje sintético para provocar un lote.","propertyTitle":"QA · Sin anuncio identificado"}' ;;
  *) echo "uso: $0 L1|L2|L4|L5" >&2; exit 2 ;;
esac

curl -sS -X POST "$BASE/api/extension/idealista-leads" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "{\"source\":\"detail\",\"leads\":[$LEAD]}"
echo
