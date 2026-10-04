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
  MAX_ATTACHED_TOTAL_BYTES,
  planDelivery,
  storageSafeName,
  UPLOAD_CHUNK_BYTES,
} from "../lib/mailbox/attachments.ts";
import { resolveSpecialUses } from "../lib/mailbox/folders.ts";
import {
  isAllowedMailboxEmail,
  mailboxServerConfig,
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
  country: "es",
  email: "amelia.rivas@bcousinoprop.com",
};
const html = buildAutoSignatureHtml(amelia, "https://crm.bcousinoprop.com/");
check("lleva el nombre", html.includes("Amelia Rivas"));
check("cargo limpio, sin el nombre de la agencia pegado", html.includes(">Agente Inmobiliario<") && !/Agente Inmobiliario\s*·/.test(html));
check("teléfono de la agencia SIEMPRE", html.includes("+34 641 457 123") && html.includes("tel:+34641457123"));
check("lleva la dirección de Serrano", html.includes("Calle Serrano 19 · 28001 Madrid"));
check("logo por URL absoluta sin doble barra", html.includes("https://crm.bcousinoprop.com/logo.png"));
check("cargo personalizado manda", signatureTitle({ role: "owner", title: "Socio fundador" }) === "Socio fundador");
check("owner → Director", signatureTitle({ role: "owner", title: null }) === "Director");

const legacy = buildAutoSignatureText({ fullName: "viejo@bcousinoprop.com", role: "advisor", country: "es", email: "viejo@bcousinoprop.com" });
check("perfil antiguo sin nombre: no firma con su email como nombre", legacy.startsWith("Asesor Inmobiliario\nBenjamín Cousiño Propiedades"), legacy);
check("texto plano con el teléfono de la agencia", legacy.includes("+34 641 457 123"));

const chile = buildAutoSignatureText({ ...amelia, country: "cl" });
check("Chile: también +34 641 457 123 y sin dirección de Madrid", chile.includes("+34 641 457 123") && !chile.includes("Serrano"));
const chileHtml = buildAutoSignatureHtml({ ...amelia, country: "cl" }, "https://x");
check("Chile HTML: nunca el número chileno", !chileHtml.includes("+56"));

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

console.log("Servidor SMTP (Hetzner bloquea 25 y 465)");
const cfgDefault = mailboxServerConfig();
check("SMTP por el 587 con STARTTLS por defecto", cfgDefault.smtpPort === 587 && cfgDefault.smtpSecurity === "starttls", cfgDefault);
check("IMAP sigue en el 993", cfgDefault.imapPort === 993);
process.env.MAILBOX_SMTP_PORT = "465";
check("puerto 465 → SSL directo (si algún día se desbloquea)", mailboxServerConfig().smtpSecurity === "ssl");
process.env.MAILBOX_SMTP_PORT = "2525";
check("otro puerto → STARTTLS, nunca texto plano", mailboxServerConfig().smtpSecurity === "starttls");
process.env.MAILBOX_SMTP_SECURITY = "ssl";
check("MAILBOX_SMTP_SECURITY manda", mailboxServerConfig().smtpSecurity === "ssl");
delete process.env.MAILBOX_SMTP_PORT;
delete process.env.MAILBOX_SMTP_SECURITY;

console.log("Carpetas especiales");
const f = (path: string, name: string, specialUse?: string, specialUseSource?: "user" | "extension" | "name") => ({ path, name, specialUse, specialUseSource });
const cpanel = [
  f("INBOX", "INBOX"),
  f("INBOX.Junk", "Junk", "\\Junk", "extension"),
  f("INBOX.spam", "spam", "\\Junk", "name"),
  f("INBOX.Sent", "Sent", "\\Sent", "extension"),
  f("INBOX.Trash", "Trash", "\\Trash", "extension"),
  f("INBOX.Archive", "Archive"),
  f("INBOX.Clientes", "Clientes"),
];
const uses = resolveSpecialUses(cpanel);
check("dos carpetas compiten por SPAM: gana la que declara el servidor", uses.get("INBOX.Junk") === "\\Junk");
check("la otra queda sin uso especial (conserva su nombre real)", !uses.has("INBOX.spam"));
check("una sola carpeta por uso", [...uses.values()].filter((u) => u === "\\Junk").length === 1);
check("Archive deducido por nombre", uses.get("INBOX.Archive") === "\\Archive");
check("una carpeta de usuario no es especial", !uses.has("INBOX.Clientes"));
check("INBOX siempre Entrada", uses.get("INBOX") === "\\Inbox");
const onlyName = resolveSpecialUses([f("INBOX", "INBOX"), f("INBOX.spam", "spam")]);
check("sin SPECIAL-USE, 'spam' por nombre sirve de SPAM", onlyName.get("INBOX.spam") === "\\Junk");

console.log("Adjuntos");
const MB = 1024 * 1024;
check("todo cabe → todo adjunto", planDelivery([2 * MB, 5 * MB]).join() === "attach,attach");
check("uno enorme → enlace, los demás adjuntos", planDelivery([3 * MB, 40 * MB, 4 * MB]).join() === "attach,link,attach");
check("se llena el cupo → el resto enlace", planDelivery([10 * MB, 7 * MB, 2 * MB]).join() === "attach,attach,link");
check("justo en el límite → adjunto", planDelivery([MAX_ATTACHED_TOTAL_BYTES]).join() === "attach");
check("18 MB adjuntos ≈ 25 MB en base64 (lo que aceptan Gmail/Outlook)", (MAX_ATTACHED_TOTAL_BYTES * 4) / 3 <= 25 * MB);
check("trozo de subida < 10 MB del middleware de Next", UPLOAD_CHUNK_BYTES < 10 * MB);
check("nombre seguro para storage", storageSafeName("../Contrato arras ñ.pdf") === "Contrato_arras_n.pdf", storageSafeName("../Contrato arras ñ.pdf"));
const withLinks = buildOutgoingBody("Te paso el vídeo", null, null, {
  links: [{ filename: "visita<1>.mp4", size: 52 * MB, url: "https://crm.x/api/public/correo-archivo/abc" }],
  untilLabel: "3 de noviembre de 2026",
});
check("enlace de descarga en el HTML, escapado", withLinks.html.includes("https://crm.x/api/public/correo-archivo/abc") && withLinks.html.includes("visita&lt;1&gt;.mp4"));
check("enlace en el texto plano con tamaño y caducidad", withLinks.text.includes("- visita<1>.mp4 (52 MB): https://crm.x/") && withLinks.text.includes("3 de noviembre"));

if (failed) {
  console.log(`\n${failed} fallo(s)`);
  process.exit(1);
}
console.log("\nTodo OK");
