#!/bin/bash
# PDF del catálogo (T7): rutas del dueño y del enlace contra un servidor de
# desarrollo AISLADO con CATALOG_FIXTURES=1 (PDF_BASE, por defecto :3141).
# Cabeceras, 404 uniforme, autorización separada, revocación y cambios a
# mitad, trabajo compartido, cola llena y límite por enlace.
B=${PDF_BASE:-http://127.0.0.1:3141}
O=${PDF_OUT:-$(mktemp -d)}; mkdir -p "$O"
mut() { curl -s -X POST -H 'content-type: application/json' -d "$1" $B/dev-fixtures/api/catalogo > /dev/null; }
get() { # url salida -> código
  curl -s -o "$2" -D "$2.h" -w "%{http_code}" "$1"; }
hdr() { grep -i "^$1:" "$2.h" | tr -d '\r' | cut -d' ' -f2-; }
ok=0; bad=0
chk() { if [ "$2" = "1" ]; then echo "  ✅ $1"; ok=$((ok+1)); else echo "  ❌ $1 ${3:-}"; bad=$((bad+1)); fi; }
T_PDF=fixturePdfToken0000000000013
mut '{"op":"reset"}'

echo "· Enlace válido"
c=$(get $B/api/seleccion/$T_PDF/pdf $O/a.pdf)
chk "200" $([ "$c" = 200 ] && echo 1) "$c"
chk "application/pdf y empieza por %PDF" $([ "$(hdr content-type $O/a.pdf)" = application/pdf ] && head -c4 $O/a.pdf | grep -q %PDF && echo 1)
chk "Content-Disposition adjunto con nombre UTF-8" $(hdr content-disposition $O/a.pdf | grep -q "attachment; filename=\"Catalogo - Seleccion para el PDF - .*\.pdf\"; filename\*=UTF-8''Cat%C3%A1logo%20%C2%B7%20Selecci%C3%B3n" && echo 1) "$(hdr content-disposition $O/a.pdf)"
chk "Cache-Control private, no-store" $(hdr cache-control $O/a.pdf | grep -q "private, no-store" && echo 1)
chk "X-Robots-Tag noindex" $(hdr x-robots-tag $O/a.pdf | grep -q noindex && echo 1)
chk "Referrer-Policy no-referrer" $([ "$(hdr referrer-policy $O/a.pdf)" = no-referrer ] && echo 1)
chk "Content-Length = bytes" $([ "$(hdr content-length $O/a.pdf)" = "$(wc -c < $O/a.pdf | tr -d ' ')" ] && echo 1)

echo "· 404 uniforme"
c1=$(get $B/api/seleccion/corto/pdf $O/n1); c2=$(get $B/api/seleccion/fixtureNoExisteToken000000099/pdf $O/n2)
chk "formato no válido y token inexistente → 404 con el mismo cuerpo" $([ "$c1$c2" = 404404 ] && cmp -s $O/n1 $O/n2 && echo 1) "$c1 $c2"
mut "{\"op\":\"revoke\",\"token\":\"fixtureOneToken0000000000004\"}"
c=$(get $B/api/seleccion/fixtureOneToken0000000000004/pdf $O/n3)
chk "enlace revocado → 404, mismo cuerpo" $([ "$c" = 404 ] && cmp -s $O/n1 $O/n3 && echo 1) "$c"
mut '{"op":"reset"}'
mut "{\"op\":\"expire\",\"token\":\"fixtureOneToken0000000000004\",\"inMs\":0}"
c=$(get $B/api/seleccion/fixtureOneToken0000000000004/pdf $O/n4)
chk "enlace caducado → 404" $([ "$c" = 404 ] && cmp -s $O/n1 $O/n4 && echo 1) "$c"
mut '{"op":"reset"}'

echo "· Dueño: archivado y sin enlace válido (P4); cliente no"
mut "{\"op\":\"archive\",\"token\":\"$T_PDF\"}"
c=$(get $B/api/admin/catalogos/f0000000-0000-0000-0000-0000000000a1/pdf $O/own.pdf)
chk "dueño, catálogo archivado → 200 PDF" $([ "$c" = 200 ] && head -c4 $O/own.pdf | grep -q %PDF && echo 1) "$c"
chk "dueño: mismas cabeceras" $(hdr cache-control $O/own.pdf | grep -q "private, no-store" && hdr content-disposition $O/own.pdf | grep -q attachment && echo 1)
c=$(get $B/api/seleccion/$T_PDF/pdf $O/n5)
chk "cliente, catálogo archivado → 404" $([ "$c" = 404 ] && echo 1) "$c"
mut '{"op":"reset"}'
c1=$(get $B/api/admin/catalogos/f0000000-0000-0000-0000-0000000000ff/pdf $O/n6); c2=$(get $B/api/admin/catalogos/no-es-uuid/pdf $O/n7)
chk "dueño: catálogo inexistente y id no válido → 404 igual" $([ "$c1$c2" = 404404 ] && cmp -s $O/n6 $O/n7 && cmp -s $O/n1 $O/n6 && echo 1) "$c1 $c2"
c=$(curl -s -o $O/n8 -w "%{http_code}" -H "Host: ejemplo.com" $B/api/admin/catalogos/f0000000-0000-0000-0000-0000000000a1/pdf)
chk "dueño sin sesión (no localhost: guardia real, sin BD) → 404" $([ "$c" = 404 ] && cmp -s $O/n1 $O/n8 && echo 1) "$c"

echo "· Revocado durante la generación → no entrega nada"
mut '{"op":"photo-delay","ms":150}'
( get $B/api/seleccion/$T_PDF/pdf $O/rv > $O/rv.code ) &
sleep 0.6; mut "{\"op\":\"revoke\",\"token\":\"$T_PDF\"}"; wait
c=$(cat $O/rv.code)
chk "→ 404 y sin bytes de PDF" $([ "$c" = 404 ] && ! head -c4 $O/rv | grep -q %PDF && echo 1) "$c"
mut '{"op":"reset"}'

echo "· Dueño: revocar el ENLACE a mitad no afecta al dueño (otro ámbito)"
mut '{"op":"photo-delay","ms":150}'
( get $B/api/admin/catalogos/f0000000-0000-0000-0000-0000000000a1/pdf $O/ow2.pdf > $O/ow2.code ) &
sleep 0.6; mut "{\"op\":\"revoke\",\"token\":\"$T_PDF\"}"; wait
chk "→ 200 para el dueño" $([ "$(cat $O/ow2.code)" = 200 ] && echo 1) "$(cat $O/ow2.code)"
mut '{"op":"reset"}'

echo "· Cambio a mitad: un PDF de una versión, o 409"
mut '{"op":"photo-delay","ms":150}'
( get $B/api/seleccion/fixtureMainToken000000000001/pdf $O/ch1.pdf > $O/ch1.code ) &
sleep 0.4; mut '{"op":"price","token":"fixtureMainToken000000000001","key":"fxMain00001","price":1234567"}' ; mut "{\"op\":\"price\",\"token\":\"fixtureMainToken000000000001\",\"key\":\"$(curl -s $B/api/seleccion/fixtureMainToken000000000001/estado | python3 -c 'import json,sys;print(json.load(sys.stdin)["catalog"]["items"][0]["key"])')\",\"price\":1234567}"; wait
c=$(cat $O/ch1.code)
chk "un cambio → se repite una vez → 200" $([ "$c" = 200 ] && echo 1) "$c"
echo "$c" > $O/ch1.result
( get $B/api/seleccion/fixtureLongToken000000000002/pdf $O/ch2 > $O/ch2.code ) &
K=$(curl -s $B/api/seleccion/fixtureLongToken000000000002/estado | python3 -c 'import json,sys;print(json.load(sys.stdin)["catalog"]["items"][0]["key"])')
for i in $(seq 1 60); do mut "{\"op\":\"price\",\"token\":\"fixtureLongToken000000000002\",\"key\":\"$K\",\"price\":$((500000+i))}"; sleep 0.25; [ -s $O/ch2.code ] && break; done; wait
chk "cambios continuos → 409" $([ "$(cat $O/ch2.code)" = 409 ] && echo 1) "$(cat $O/ch2.code)"
mut '{"op":"reset"}'

echo "· Dos peticiones a la vez del mismo enlace → mismo PDF"
mut '{"op":"photo-delay","ms":60}'
( get $B/api/seleccion/fixtureJourneyToken000000007/pdf $O/s1.pdf > $O/s1.code ) & ( sleep 0.2; get $B/api/seleccion/fixtureJourneyToken000000007/pdf $O/s2.pdf > $O/s2.code ) & wait
chk "200 y 200, bytes idénticos (trabajo compartido)" $([ "$(cat $O/s1.code)$(cat $O/s2.code)" = 200200 ] && cmp -s $O/s1.pdf $O/s2.pdf && echo 1) "$(cat $O/s1.code) $(cat $O/s2.code)"

echo "· Cola llena → 503 con Retry-After"
mut '{"op":"photo-delay","ms":200}'
i=0
for t in fixtureMainToken000000000001 fixtureLongToken000000000002 fixtureTwentyToken0000000005 fixtureMaxToken0000000000006 fixtureJourney12Token0000008 fixtureJourney24Token0000009 fixtureEmptyToken00000000003; do
  i=$((i+1)); ( curl -s -o $O/q$i -D $O/q$i.h -w "%{http_code}" $B/api/seleccion/$t/pdf > $O/q$i.code ) & sleep 0.05
done; wait
codes=$(for j in $(seq 1 $i); do cat $O/q$j.code; echo -n " "; done); echo "    códigos: $codes"
n503=$(echo "$codes" | tr ' ' '\n' | grep -c 503); n200=$(echo "$codes" | tr ' ' '\n' | grep -c 200)
ra=$(for j in $(seq 1 $i); do grep -q "^HTTP/1.1 503" $O/q$j.h && grep -i "^retry-after" $O/q$j.h; done | head -1 | tr -d '\r')
chk "1 en curso + 3 en cola = 4 PDF; el resto 503 con Retry-After" $([ "$n200" = 4 ] && [ "$n503" = 3 ] && [ -n "$ra" ] && echo 1) "200:$n200 503:$n503 $ra"
mut '{"op":"reset"}'

echo "· El navegador se va: el trabajo se cancela"
mut '{"op":"photo-delay","ms":300}'
curl -s -o /dev/null --max-time 0.8 $B/api/seleccion/fixtureJourney24Token0000009/pdf; sleep 1.5
mut '{"op":"reset"}'

echo "· Límite por enlace → 429"
codes=""; for j in 1 2 3 4 5 6 7 8; do codes="$codes $(curl -s -o /dev/null -D $O/rl.h -w "%{http_code}" $B/api/seleccion/fixtureEmptyToken00000000003/pdf)"; done
echo "    códigos:$codes"
chk "pasado el límite → 429 con Retry-After" $(echo "$codes" | grep -q 429 && grep -qi "^retry-after" $O/rl.h && echo 1)
echo "resultado: $ok bien, $bad mal"
