#!/usr/bin/env python3
"""Linter de migraciones SQL: caza los errores que han roto deploys.

Comprueba TODAS las migraciones de supabase/migrations/ y FALLA (exit 1) si
encuentra alguno de los fallos que ya nos han tumbado el deploy:

  1. Referencia a `internal_users` — tabla que NO existe en este esquema.
     (El control de acceso va por is_admin()/is_staff() y la tabla `profiles`.)
  2. `UPDATE ... ORDER BY` a nivel superior — sintaxis inválida en PostgreSQL.
  3. Credenciales en texto plano (URL con user:pass@host, o el formato nativo
     host:puerto:usuario:password que usan los proxies tipo Evomi/Geonode) —
     ya pasó una vez con la migración 0108 (proxy Evomi commiteado en claro).
     Las migraciones son código versionado para siempre; los valores
     sensibles van en app_settings vía UPDATE manual (psql/panel), nunca en
     un archivo de migración nuevo. Una línea ya detectada y con la
     credencial ya rotada puede marcarse con un comentario `-- gitleaks:allow`
     al final para no romper el lint para siempre.

No revisa idempotencia (CREATE sin IF NOT EXISTS) para no dar falsos positivos
con el esquema inicial; el foco es bloquear lo que de verdad rompe.
"""
import sys, re, glob, os

errors: list[str] = []

# user:pass@host (URL con credenciales embebidas) — cualquier esquema.
CREDS_IN_URL = re.compile(r"[a-z][a-z0-9+.-]*://[^\s'\"@/]+:[^\s'\"@/]+@[^\s'\"/]+", re.I)
# Formato nativo de proxies residenciales (Evomi/Geonode/etc.):
# host.con.puntos:puerto:usuario:password-largo — el que se filtró en 0108.
CREDS_NATIVE_PROXY = re.compile(
    r"[a-z0-9][a-z0-9.-]*\.[a-z]{2,}:\d{2,5}:[a-z0-9_-]+:[a-z0-9_-]{12,}", re.I
)

for path in sorted(glob.glob("supabase/migrations/*.sql")):
    name = os.path.basename(path)
    sql = open(path, encoding="utf-8").read()
    # Quitar comentarios de línea y cuerpos dollar-quoted ($$...$$ de funciones),
    # para no analizar SQL de dentro de funciones plpgsql.
    nocomments = re.sub(r"--[^\n]*", "", sql)
    nobody = re.sub(r"\$(\w*)\$.*?\$\1\$", " BODY ", nocomments, flags=re.S)
    low = nobody.lower()

    lines = sql.splitlines()
    for lineno, line in enumerate(lines, start=1):
        # El marcador de allowlist puede ir en la misma línea o hasta 7 líneas
        # arriba (un comentario propio explicando por qué, justo encima del
        # INSERT/UPDATE ofensivo — no cabe en la misma línea sin romper la
        # sintaxis SQL cuando el valor sigue con una coma).
        window = lines[max(0, lineno - 8):lineno]
        if any("gitleaks:allow" in w for w in window):
            continue
        if CREDS_IN_URL.search(line) or CREDS_NATIVE_PROXY.search(line):
            errors.append(
                f"{name}:{lineno}: parece contener una credencial en texto plano "
                "(URL con user:pass@host, o formato host:puerto:usuario:password). "
                "Los valores sensibles van en app_settings vía UPDATE manual, no en "
                "una migración — o agregá `-- gitleaks:allow` en esta línea o hasta "
                "7 líneas arriba si ya está rotada."
            )

    if re.search(r"\binternal_users\b", low):
        errors.append(
            f"{name}: referencia a `internal_users` (tabla inexistente). "
            "Usa is_admin()/is_staff() y la tabla profiles."
        )

    # UPDATE ... ORDER BY al nivel superior (las subconsultas entre paréntesis sí
    # admiten ORDER BY, así que las quitamos antes de comprobar).
    for stmt in [s for s in nobody.split(";") if s.strip()]:
        l = stmt.lower()
        if not re.match(r"\s*update\b", l):
            continue
        stripped, prev = l, None
        while prev != stripped:
            prev = stripped
            stripped = re.sub(r"\([^()]*\)", " ", stripped)
        if re.search(r"\border\s+by\b", stripped):
            errors.append(
                f"{name}: `UPDATE ... ORDER BY` no es válido en PostgreSQL "
                "(usa una subconsulta con row_number() si necesitas orden)."
            )

if errors:
    print("❌ Migraciones con errores que romperían el deploy:")
    for e in errors:
        print("   -", e)
    sys.exit(1)

print("✅ Migraciones OK (sin internal_users, UPDATE...ORDER BY, ni credenciales en claro)")
