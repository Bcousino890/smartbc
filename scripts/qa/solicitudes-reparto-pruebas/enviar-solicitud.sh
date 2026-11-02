#!/bin/sh
# SOLO ENTORNO DE PRUEBAS. Envía UNA solicitud sintética a la ingesta real
# (/api/extension/idealista-leads), como haría la extensión.
#
#   ENTORNO=pruebas BASE=https://<entorno-de-pruebas> TOKEN=<token de extensión de ESE entorno> \
#     sh enviar-solicitud.sh <paso>
#
# Pasos: L1 L2 L3 L4 L5 L6 (ver docs/changes/2026-11-02-solicitudes-reparto/validacion.md).
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
  # 2b · La MISMA persona que L1 (mismo nombre y teléfono) consulta OTRO anuncio (B).
  L3) LEAD='{"conversationId":"990237003","name":"QA Persona Uno","phone":"+34 600 990 001","message":"Mensaje sintético: también me interesa este otro piso.","propertyTitle":"QA · Piso en Goya","propertyPrice":"2.900.000 €","propertyRef":"QA-0237-B","idealistaCode":"990237002"}' ;;
  # 4 · Ref. válida + Cod. que aún no está en el catálogo.
  L4) LEAD='{"conversationId":"990237004","name":"QA Persona Dos","phone":"+34 600 990 004","message":"Mensaje sintético: ¿admite mascotas?","propertyTitle":"QA · Ático en Castelló","propertyPrice":"5.400 €/mes","propertyRef":"QA-0237-A","idealistaCode":"990237009"}' ;;
  # 4b · Anuncio C (sin regla todavía) con un Cod. aún no catalogado.
  L6) LEAD='{"conversationId":"990237006","name":"QA Persona Seis","phone":"+34 600 990 006","message":"Mensaje sintético: ¿cuándo se puede visitar?","propertyTitle":"QA · Piso en Lagasca","propertyPrice":"3.100 €/mes","propertyRef":"QA-0237-C","idealistaCode":"990237013"}' ;;
  # 4 · Consulta neutra (sin Ref. ni Cod.) solo para provocar un lote de ingesta.
  L5) LEAD='{"conversationId":"990237005","name":"QA Persona Cinco","phone":"+34 600 990 005","message":"Mensaje sintético para provocar un lote.","propertyTitle":"QA · Sin anuncio identificado"}' ;;
  *) echo "uso: $0 L1|L2|L3|L4|L5|L6" >&2; exit 2 ;;
esac

curl -sS -X POST "$BASE/api/extension/idealista-leads" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "{\"source\":\"detail\",\"leads\":[$LEAD]}"
echo
