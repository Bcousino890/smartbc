/**
 * Tests de la seguridad de la extensión de Chrome (lib/extension/token.ts).
 *
 * Lo que se vigila es lo que impide que una COPIA de la extensión, o un token
 * robado, sirvan para algo:
 *  · el formato del token por usuario y su hash (lo único que se guarda);
 *  · que el ID de la extensión salga del Origin que pone Chrome y de ningún
 *    otro sitio;
 *  · la lista de IDs admitidos.
 *
 * Ejecutar:  npm run test:extension-auth
 */
import {
  describeUserAgent,
  extensionIdFromOrigin,
  generateExtensionToken,
  hashExtensionToken,
  isSessionToken,
  originAllowed,
  sessionExpiry,
  SESSION_IDLE_DAYS,
  shouldTouch,
} from "../lib/extension/token.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const OFFICIAL = "eflkimchikdgagegggjnhdjomcicgepa";
const COPY = "cgilbdfknohaalhepoaoeanfhahmfjpe";

console.log("\nToken por usuario");
{
  const a = generateExtensionToken();
  const b = generateExtensionToken();
  check("formato sbx_<8>_<40>", /^sbx_[A-Za-z0-9]{8}_[A-Za-z0-9]{40}$/.test(a.token), a.token);
  check("el prefijo es el principio del token", a.token.startsWith(a.prefix + "_"));
  check("dos tokens nunca coinciden", a.token !== b.token && a.hash !== b.hash);
  check("se guarda el SHA-256, no el token", a.hash === hashExtensionToken(a.token) && a.hash.length === 64 && !a.hash.includes(a.token));
  check("lo reconoce como token por usuario", isSessionToken(a.token));
  check("el token compartido antiguo (base64) no pasa por uno por usuario", !isSessionToken("ZXh0LWxlYWRzLjE3OTk5OTk5OTk5OTkuYWJj"));
  check("un token con un carácter de más no vale", !isSessionToken(a.token + "x"));
  check("un token con caracteres raros no vale", !isSessionToken(a.token.slice(0, -1) + "-"));
}

console.log("\nEl ID de la extensión sale del Origin que pone Chrome");
check("Origin de la extensión → su ID", extensionIdFromOrigin(`chrome-extension://${OFFICIAL}`) === OFFICIAL);
check("Origin de una web → null", extensionIdFromOrigin("https://www.idealista.com") === null);
check("sin Origin (GET del service worker) → null", extensionIdFromOrigin(null) === null);
check("un ID con letras fuera de a-p no es un ID de Chrome", extensionIdFromOrigin("chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz") === null);
check("Origin con ruta detrás no cuela", extensionIdFromOrigin(`chrome-extension://${OFFICIAL}/x`) === null);
check("moz-extension no cuela", extensionIdFromOrigin(`moz-extension://${OFFICIAL}`) === null);

console.log("\nLista de IDs admitidos");
check("lista vacía: no se exige (antes de publicar)", originAllowed(null, []) && originAllowed("https://x.com", []));
check("con lista: la oficial pasa", originAllowed(`chrome-extension://${OFFICIAL}`, [OFFICIAL]));
check("con lista: una copia (otro ID) no pasa", !originAllowed(`chrome-extension://${COPY}`, [OFFICIAL]));
check("con lista: una web no pasa", !originAllowed("https://www.idealista.com", [OFFICIAL]));
check("con lista: sin Origin no pasa", !originAllowed(null, [OFFICIAL]));

console.log("\nCaducidad por no usarse");
{
  const now = new Date("2026-10-07T12:00:00Z");
  const exp = sessionExpiry(now);
  check(`caduca a los ${SESSION_IDLE_DAYS} días sin uso`, Math.round((exp.getTime() - now.getTime()) / 86_400_000) === SESSION_IDLE_DAYS);
  check("sin uso previo: se apunta", shouldTouch(null, now));
  check("usada hace 5 min: no se reescribe la fila", !shouldTouch("2026-10-07T11:55:00Z", now));
  check("usada hace 2 h: se apunta y se alarga", shouldTouch("2026-10-07T10:00:00Z", now));
}

console.log("\nDispositivo");
check("Chrome en macOS", describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36") === "Chrome en macOS");
check("Edge en Windows", describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0") === "Edge en Windows");
check("sin User-Agent", describeUserAgent(null) === "Navegador desconocido");

console.log(failures ? `\n✗ ${failures} fallo(s)` : "\n✓ Todo en verde");
process.exit(failures ? 1 : 0);
