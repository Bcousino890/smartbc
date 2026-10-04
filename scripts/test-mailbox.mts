/**
 * Tests del correo corporativo dentro del CRM (/admin/correo).
 *
 * Lo que se vigila:
 *  · la firma automática sale para cualquier perfil (nuevo o antiguo, con o
 *    sin teléfono/nombre) y con los datos reales de la oficina;
 *  · solo se conectan buzones del dominio corporativo;
 *  · la copia oculta (Bcc) NUNCA viaja en las cabeceras que se envían;
 *  · el HTML recibido se muestra sin scripts.
 *
 * Funciones puras, sin servidor de correo.
 *
 * Ejecutar:
 *   npm run test:mailbox
 */
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import {
  isAllowedMailboxEmail,
  normalizeMailboxEmail,
  suggestedMailboxEmail,
} from "../lib/mailbox/config.ts";
import {
  buildOutgoingBody,
  buildViewerDocument,
  headerSafe,
  parseAddressList,
  plainTextToHtml,
  prefixSubject,
  stripBccHeader,
} from "../lib/mailbox/compose.ts";
import {
  buildAutoSignatureHtml,
  buildAutoSignatureText,
  resolveSignature,
  signatureTitle,
} from "../lib/mailbox/signature.ts";

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

console.log("Dominio");
check("acepta @bcousinoprop.com", isAllowedMailboxEmail("amelia.rivas@bcousinoprop.com"));
check("rechaza gmail", !isAllowedMailboxEmail("x@gmail.com"));
check("rechaza subdominio parecido", !isAllowedMailboxEmail("x@bcousinoprop.com.evil.io"));
check("normaliza mayúsculas", normalizeMailboxEmail("  Amelia.Rivas@BCousinoProp.com ") === "amelia.rivas@bcousinoprop.com");
check("propone el del perfil si es corporativo", suggestedMailboxEmail("ana@bcousinoprop.com") === "ana@bcousinoprop.com");
check("no propone uno personal", suggestedMailboxEmail("ana@gmail.com") === null);

console.log("Firma automática");
const amelia = {
  fullName: "Amelia Rivas",
  role: "agent_senior",
  phone: "+34 600 111 222",
  country: "es",
  email: "amelia.rivas@bcousinoprop.com",
};
const html = buildAutoSignatureHtml(amelia, "https://crm.bcousinoprop.com/");
check("lleva el nombre", html.includes("Amelia Rivas"));
check("lleva el cargo del rol", html.includes("Agente inmobiliario"));
check("lleva el móvil personal", html.includes("+34 600 111 222") && html.includes("tel:+34600111222"));
check("lleva el teléfono de la oficina", html.includes("+34 641 457 123"));
check("lleva la dirección de Serrano", html.includes("Calle Serrano 19, 28001 Madrid"));
check("logo por URL absoluta sin doble barra", html.includes("https://crm.bcousinoprop.com/logo.png"));
check("cargo personalizado manda", signatureTitle({ role: "owner", title: "Socio fundador" }) === "Socio fundador");
check("owner → Director", signatureTitle({ role: "owner", title: null }) === "Director");

const legacy = buildAutoSignatureText({ fullName: "viejo@bcousinoprop.com", role: "advisor", phone: null, country: "es", email: "viejo@bcousinoprop.com" });
check("perfil antiguo sin nombre firma con la agencia", legacy.startsWith("Benjamín Cousiño Propiedades"), legacy);
check("sin móvil no pinta línea M", !legacy.includes("\nM "));

const chile = buildAutoSignatureText({ ...amelia, country: "cl", phone: null });
check("Chile: teléfono de Chile y sin dirección de Madrid", chile.includes("+56 9 61791938") && !chile.includes("Serrano"));

const xss = buildAutoSignatureHtml({ ...amelia, fullName: "<script>alert(1)</script>" }, "https://x");
check("escapa el nombre", !xss.includes("<script>"));

check("modo none → sin firma", resolveSignature("none", null, amelia, "https://x") === null);
check("custom vacío → sin firma", resolveSignature("custom", "  ", amelia, "https://x") === null);
const custom = resolveSignature("custom", "<b>Ana</b><br>BC", amelia, "https://x");
check("custom → texto plano derivado", custom?.text === "Ana\nBC", custom);

console.log("Direcciones");
const parsed = parseAddressList("Ana <ana@x.com>, b@y.com; ana@x.com\nmalo");
check("parsea nombre <dir> y separadores", parsed.valid.join("|") === "ana@x.com|b@y.com", parsed);
check("deduplica", parsed.valid.length === 2);
check("reporta inválidas", parsed.invalid.join() === "malo");
check("headerSafe quita saltos (inyección de cabeceras)", headerSafe("<a@b>\r\nBcc: evil@x") === "<a@b> Bcc: evil@x");

console.log("Cuerpo");
check("texto → HTML escapado con enlaces", plainTextToHtml("Hola <b>\nhttps://bcousinoprop.com/x.") === 'Hola &lt;b&gt;<br><a href="https://bcousinoprop.com/x">https://bcousinoprop.com/x</a>.');
const body = buildOutgoingBody("Gracias", { html: "<b>FIRMA</b>", text: "FIRMA" }, {
  kind: "reply",
  from: "Cliente <c@x.com>",
  date: "4 de octubre",
  subject: "Piso",
  text: "¿Sigue disponible?",
});
check("firma antes de la cita", body.html.indexOf("FIRMA") < body.html.indexOf("Sigue disponible"));
check("texto plano con separador de firma y cita >", body.text.includes("\n-- \nFIRMA") && body.text.includes("> ¿Sigue disponible?"));
check("Re: no se acumula", prefixSubject("RE: Piso", "reply") === "RE: Piso" && prefixSubject("Piso", "reply") === "Re: Piso");
check("Fwd: no se acumula", prefixSubject("Fwd: Piso", "forward") === "Fwd: Piso");

console.log("Bcc");
const node = new MailComposer({
  from: "amelia.rivas@bcousinoprop.com",
  to: "a@x.com",
  bcc: ["oculto1@x.com", "oculto2@x.com"],
  subject: "Hola",
  text: "x",
}).compile();
(node as unknown as { keepBcc: boolean }).keepBcc = true;
const raw: Buffer = await new Promise((res, rej) => node.build((e: Error | null, out: Buffer) => (e ? rej(e) : res(out))));
check("la copia de Enviados conserva Bcc", /\r\nBcc: /i.test(raw.toString()));
const wire = stripBccHeader(raw).toString();
check("lo que se envía NO lleva Bcc", !/oculto/i.test(wire.split("\r\n\r\n")[0]), wire.slice(0, 400));
check("el resto de cabeceras sigue", /\r\nSubject: Hola/.test(wire) && /^From: /m.test(wire));

console.log("Visor");
const doc = buildViewerDocument('<p onclick="x">hola</p><script>alert(1)</script>', null);
check("sin <script>", !/<script/i.test(doc));
check("con CSP default-src 'none'", doc.includes("default-src 'none'"));
check("enlaces fuera del panel", doc.includes('<base target="_blank">'));
check("texto plano escapado", buildViewerDocument(null, "<b>x</b>").includes("&lt;b&gt;x&lt;/b&gt;"));

if (failed) {
  console.log(`\n${failed} fallo(s)`);
  process.exit(1);
}
console.log("\nTodo OK");
