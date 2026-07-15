/**
 * Test de parseProxyUrl() en lib/sync/particulares/solve-datadome-with-capsolver.ts.
 *
 * Bug real detectado en producción (proxy-health + extract-phone con Evomi):
 * un t=fe (slider resoluble) llegaba a CapSolver, pero fallaba con
 * "Poll error 1: load captcha page error: userAgent does not match or your
 * proxy ip has been blocked". Causa: parseProxyUrl() era un no-op que
 * reenviaba `http://usuario:password@host:puerto` tal cual — CapSolver
 * documenta el formato `host:puerto:usuario:password` para DatadomeSliderTask
 * (docs.capsolver.com/en/guide/captcha/datadome/, ejemplo
 * "158.120.100.23:334:user:pass"), así que terminaba resolviendo el slider
 * desde una IP distinta a la que emitió el reto → mismatch.
 *
 * Copia local de la lógica (sin imports "server-only") para poder testear
 * standalone con node, igual que el resto de scripts de test de este repo.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-capsolver-proxy-format.mts
 */

function parseProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username) return `${u.hostname}:${u.port}`;
    return `${u.hostname}:${u.port}:${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
  } catch {
    return proxyUrl;
  }
}

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

// Credenciales de EJEMPLO (no reales): solo se valida el formato de la URL generada.
const evomiSticky =
  "http://testuser:testpass_country-ES_session-abc12345_lifetime-3@core-residential.evomi.com:1000";
check(
  "evomi sticky: host:puerto:usuario:password (formato CapSolver)",
  parseProxyUrl(evomiSticky) ===
    "core-residential.evomi.com:1000:testuser:testpass_country-ES_session-abc12345_lifetime-3",
  parseProxyUrl(evomiSticky),
);

const geonodeSticky =
  "http://geonode_x-type-residential-session-abc12345-lifetime-180:pass-word-uuid@148.72.141.11:10123";
check(
  "geonode sticky: host:puerto:usuario:password (formato CapSolver)",
  parseProxyUrl(geonodeSticky) ===
    "148.72.141.11:10123:geonode_x-type-residential-session-abc12345-lifetime-180:pass-word-uuid",
  parseProxyUrl(geonodeSticky),
);

const noAuth = "http://core-residential.evomi.com:1000";
check("sin auth: host:puerto (sin arrastrar ':' vacíos)", parseProxyUrl(noAuth) === "core-residential.evomi.com:1000", parseProxyUrl(noAuth));

const invalid = "no-es-una-url";
check("URL inválida: se devuelve tal cual (no revienta)", parseProxyUrl(invalid) === invalid, parseProxyUrl(invalid));

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
