/**
 * Test del parser del reto DataDome (extractDatadomeChallengeUrl).
 *
 * Cuando /contact-phones está protegido, DataDome devuelve el reto en el cuerpo
 * del 403 en dos formatos (ambos capturados en real de idealista.com):
 *   1) JSON: {"url":"https://geo.captcha-delivery.com/captcha/?...&t=fe"}
 *   2) HTML interstitial con  var dd={'cid':...,'hsh':...,'t':'fe',...}
 * De ambos hay que reconstruir la captchaUrl que CapSolver necesita. Solo t=fe
 * es resoluble (slider); t=bv es bloqueo duro (IP baneada).
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-datadome-challenge.mts
 */
import { extractDatadomeChallengeUrl } from "../lib/sync/particulares/idealista-advertiser-detector.ts";

const jsonBody =
  '{"url":"https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMAxsBcJCh3Dq0AoE9qRw==&cid=oPHOZYnrUUq&referer=https%3A%2F%2Fwww.idealista.com&hash=AC81AADC3279CA4C7B968B717FBB30&t=fe&s=17156&e=e6d2ee12&b=29883"}';

const htmlBody =
  `<html><script>var dd={'rt':'c','cid':'AHrlqAAAAAMAK7L4K58v6BUAoE9qEw==','hsh':'AC81AADC3279CA4C7B968B717FBB30','t':'fe','qp':'','s':17156,'e':'639c073fbaa60','host':'geo.captcha-delivery.com','cookie':'VtgygxOf3CKJ'}</script></html>`;

const bvBody =
  `<html><script>var dd={'rt':'c','cid':'XYZ==','hsh':'ABC','t':'bv','s':100,'e':'ee','host':'geo.captcha-delivery.com','cookie':'CK'}</script></html>`;

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const r1 = extractDatadomeChallengeUrl(jsonBody);
check("JSON → t=fe + url captcha-delivery", r1.type === "fe" && !!r1.url?.includes("geo.captcha-delivery.com/captcha/"), r1);

const r2 = extractDatadomeChallengeUrl(htmlBody);
check("HTML var dd → reconstruye initialCid", r2.type === "fe" && !!r2.url?.includes("initialCid=AHrlqAAAAAMAK7L4K58v6BUAoE9qEw"), r2);
check("HTML var dd → incluye hash + t=fe", !!r2.url?.includes("hash=AC81") && !!r2.url?.includes("t=fe"), r2);

const r3 = extractDatadomeChallengeUrl(bvBody);
check("t=bv detectado (bloqueo duro, no gastar CapSolver)", r3.type === "bv", r3);

const r4 = extractDatadomeChallengeUrl("respuesta normal sin reto");
check("sin reto → null", r4.url === null && r4.type === null, r4);

const r5 = extractDatadomeChallengeUrl("");
check("cuerpo vacío → null", r5.url === null, r5);

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
