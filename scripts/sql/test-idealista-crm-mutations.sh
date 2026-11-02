#!/bin/sh
# SOLO PRUEBAS LOCALES (Idealista API → CRM). Mutaciones: cada una estropea a
# propósito una regla de 0232/0233 en una COPIA (carpeta temporal) y exige que
# alguna prueba SQL falle. Necesita BCP_PG_DIR (y BCP_PG_PORT) como run-local.sh.
set -eu
cd "$(dirname "$0")/../.."
TMPD=$(mktemp -d "${TMPDIR:-/tmp}/crm-mut.XXXXXX")
trap 'rm -rf "$TMPD"' EXIT
fails=0
mutate() {  # nombre, archivo, suite, script de python que recibe el texto en s
  name="$1"; file="$2"; suite="$3"; py="$4"
  rm -rf "$TMPD/m"; mkdir -p "$TMPD/m"
  cp supabase/migrations/019[2-6]_*.sql supabase/migrations/0232_*.sql supabase/migrations/0233_*.sql supabase/migrations/0234_*.sql supabase/migrations/0236_*.sql "$TMPD/m/"
  python3 - "$TMPD/m/$file" "$py" <<'PY'
import sys
p, code = sys.argv[1], sys.argv[2]
s = open(p).read()
before = s
exec(code)
if s == before:
    sys.exit("la mutación no cambió nada: " + code)
open(p, 'w').write(s)
PY
  if CRM_MIG_DIR="$TMPD/m" scripts/sql/test-idealista-crm-sync.sh "$suite" 2>&1 | grep -q -E "TEST FAIL|ERROR"; then
    echo "ok · mutación detectada: $name"
  else
    echo "MUTACIÓN NO DETECTADA: $name"; fails=$((fails + 1))
  fi
}
A=0233_idealista_crm_sync.sql
B=0232_idealista_reference_boundary.sql
# idealista_crm_target vive ahora en 0236 (redefinida sobre la de 0233).
T=0236_idealista_crm_target_sin_decisiva.sql
mutate "aceptar un seq ya superado (sin comprobar el esperado)" $A comportamiento \
  "s = s.replace(\"IF p_expected_seq IS DISTINCT FROM v_seq THEN\", \"IF false THEN\")"
mutate "clasificar por property_id antes que por la asociación" $A comportamiento \
  "s = s.replace(\"  IF p_sync.property_origin IS NOT NULL THEN\n    IF p_sync.property_id IS NULL THEN\", \"  IF false THEN\n    IF p_sync.property_id IS NULL THEN\")"
mutate "aceptar la etiqueta de otro país" $A comportamiento \
  "s = s.replace(\"WHERE country = v_country AND lower(btrim(name)) = 'reservado'\", \"WHERE lower(btrim(name)) = 'reservado'\")"
mutate "archivar también las existentes" $A comportamiento \
  "s = s.replace(\"ELSIF v_c->>'kind' = 'existing' THEN\n        v_note := 'existing_untouched';\", \"ELSIF false THEN\n        v_note := 'existing_untouched';\")"
mutate "aplicar aunque haya una operación abierta" $T comportamiento \
  "s = s.replace(\"RETURN jsonb_build_object('state', 'uncertain', 'reason', 'open_operation');\", \"NULL;\")"
mutate "ignorar los solapes" $T comportamiento \
  "s = s.replace(\"RETURN jsonb_build_object('state', 'uncertain', 'reason', 'overlap', 'seq', v_dec.seq);\", \"NULL;\")"
mutate "volver a leer v_dec.seq sin decisiva (fallo de 0233)" $T comportamiento \
  "s = s.replace(\"AND (v_dec_seq IS NULL OR t.seq > v_dec_seq)) THEN\", \"AND (NOT v_has_dec OR t.seq > v_dec.seq)) THEN\")"
mutate "permitir UPDATE del registro" $A comportamiento \
  "s = s.replace(\"BEFORE UPDATE OR DELETE ON %I\", \"BEFORE DELETE ON %I\")"
# (Quitar los bloqueos de apply_idealista_crm_sync NO rompe ninguna prueba: el
# alta de la fila de sincronización espera por su clave única y la ficha tiene
# id reservado y (agency_id, external_id) único. Ver result.md.)
mutate "limpieza sin plazo de gracia" $A comportamiento \
  "s = s.replace(\"AND m.staged_at < clock_timestamp() - p_grace\", \"\")"
mutate "permitir borrar con el anuncio activo" $B comportamiento \
  "s = s.replace(\"IF l.api_property_id IS NOT NULL AND coalesce(l.api_state, 'unknown') NOT IN ('inactive', 'deleted') THEN\n    RETURN true;\", \"IF false THEN\n    RETURN true;\")"
mutate "quitar el predicado de la política de clientes" $B frontera \
  "s = s.replace(\"USING (archived_at IS NULL AND NOT reference_only);\", \"USING (archived_at IS NULL);\")"
mutate "quitar el predicado del catálogo automático" $B frontera \
  "s = s.replace(\"       AND NOT p.reference_only\n\", \"\")"
mutate "trigger de asociación sin SECURITY DEFINER" $B frontera \
  "s = s.replace(\"LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS \$\$\nBEGIN\n  IF NEW.property_id IS NULL THEN\", \"LANGUAGE plpgsql\nSET search_path = public\nAS \$\$\nBEGIN\n  IF NEW.property_id IS NULL THEN\")"
mutate "sin trigger en client_shortlist_items" $B frontera \
  "s = s.replace(\"'client_shortlist_items', 'client_portal_links'\", \"'client_portal_links'\")"
C=0234_idealista_crm_switch.sql
mutate "encender aunque haya comprobaciones en rojo" $C interruptor \
  "s = s.replace(\"IF p_enabled AND (v_total = 0 OR v_failing IS NOT NULL) THEN\", \"IF false THEN\")"
mutate "el informe da por buena una comprobación NULL" $C interruptor \
  "s = s.replace(\"btrim(regexp_replace(encontrado, '\\\\s+', ' ', 'g')), false)\", \"btrim(regexp_replace(encontrado, '\\\\s+', ' ', 'g')), true)\")"
[ "$fails" -eq 0 ] && echo "mutaciones: todas detectadas" || { echo "mutaciones: $fails sin detectar"; exit 1; }
