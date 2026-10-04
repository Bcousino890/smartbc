/**
 * Piezas puras del correo saliente y de la vista de lectura de /admin/correo.
 * Sin server-only: las usa la ruta de envío, el cliente y los tests.
 */
import { escapeHtml, type ResolvedSignature } from "./signature";

const ADDRESS_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/**
 * "Ana <ana@x.com>, b@y.com; c@z.com" → ["ana@x.com", "b@y.com", "c@z.com"].
 * Devuelve también lo que no se entendió para avisar en vez de tragárselo.
 */
export function parseAddressList(raw: string | null | undefined): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const chunk of (raw ?? "").split(/[,;\n]+/)) {
    const part = chunk.trim();
    if (!part) continue;
    const angle = part.match(/<([^<>]+)>\s*$/);
    const addr = (angle ? angle[1] : part).trim().replace(/^mailto:/i, "");
    if (ADDRESS_RE.test(addr)) {
      const key = addr.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        valid.push(addr);
      }
    } else {
      invalid.push(part);
    }
  }
  return { valid, invalid };
}

/** Texto escrito en el textarea → HTML seguro (enlaces clicables, saltos). */
export function plainTextToHtml(text: string): string {
  const escaped = escapeHtml(text.replace(/\r\n/g, "\n"));
  const linked = escaped.replace(
    /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,
    (url) => `<a href="${url}">${url}</a>`,
  );
  return linked.replace(/\n/g, "<br>");
}

/** Cabecera "El …, X escribió:" + texto citado (respuesta / reenvío). */
export type QuotedOriginal = {
  kind: "reply" | "forward";
  from: string;
  to?: string;
  date: string;
  subject: string;
  text: string;
};

function quoteHeaderLines(q: QuotedOriginal): string[] {
  if (q.kind === "reply") return [`El ${q.date}, ${q.from} escribió:`];
  return [
    "---------- Mensaje reenviado ----------",
    `De: ${q.from}`,
    `Fecha: ${q.date}`,
    `Asunto: ${q.subject}`,
    ...(q.to ? [`Para: ${q.to}`] : []),
  ];
}

/** Cuerpo final (HTML + texto) = lo escrito + firma + original citado. */
export function buildOutgoingBody(
  bodyText: string,
  signature: ResolvedSignature,
  quoted: QuotedOriginal | null,
): { html: string; text: string } {
  const htmlParts: string[] = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:#1c1a17;">${plainTextToHtml(bodyText)}</div>`,
  ];
  const textParts: string[] = [bodyText.replace(/\r\n/g, "\n")];

  if (signature) {
    htmlParts.push(`<br><div class="smartbc-signature">${signature.html}</div>`);
    textParts.push(`\n-- \n${signature.text}`);
  }

  if (quoted) {
    const header = quoteHeaderLines(quoted);
    const quotedHtml = plainTextToHtml(quoted.text);
    if (quoted.kind === "reply") {
      htmlParts.push(
        `<br><div style="font-family:Arial,sans-serif;font-size:13px;color:#6b6b6b;">${header.map(escapeHtml).join("<br>")}</div>` +
          `<blockquote style="margin:6px 0 0 0;padding:0 0 0 12px;border-left:2px solid #d9cdb8;color:#555;font-size:13px;">${quotedHtml}</blockquote>`,
      );
      textParts.push(
        `\n${header.join("\n")}\n${quoted.text
          .replace(/\r\n/g, "\n")
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n")}`,
      );
    } else {
      htmlParts.push(
        `<br><div style="font-family:Arial,sans-serif;font-size:13px;color:#333;">${header.map(escapeHtml).join("<br>")}<br><br>${quotedHtml}</div>`,
      );
      textParts.push(`\n${header.join("\n")}\n\n${quoted.text}`);
    }
  }

  return { html: htmlParts.join("\n"), text: textParts.join("\n") };
}

/** "Re: " / "Fwd: " sin acumular prefijos. */
export function prefixSubject(subject: string, kind: "reply" | "forward"): string {
  const clean = (subject || "").trim();
  if (kind === "reply") return /^re:/i.test(clean) ? clean : `Re: ${clean || "(sin asunto)"}`;
  return /^(fwd?|rv):/i.test(clean) ? clean : `Fwd: ${clean || "(sin asunto)"}`;
}

/** Quita saltos de línea de un valor que va a una cabecera (In-Reply-To…). */
export function headerSafe(value: string | null | undefined, max = 2000): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  return v || undefined;
}

/**
 * HTML de un correo recibido → documento para un <iframe sandbox srcdoc>.
 *
 * La seguridad la da el iframe (sin allow-scripts ni allow-same-origin: ni JS
 * ni acceso a la sesión del CRM); aquí solo se añade una CSP de refuerzo que
 * bloquea scripts/formularios/iframes, y <base target=_blank> para que los
 * enlaces abran fuera del panel.
 */
export function buildViewerDocument(html: string | null, text: string | null): string {
  const csp =
    "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https: http:; font-src https: http: data:; media-src https: http: data:";
  const head =
    `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank">` +
    `<style>html,body{margin:0;padding:0;}body{padding:4px 2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1c1a17;word-wrap:break-word;overflow-wrap:anywhere;}img{max-width:100%;height:auto;}blockquote{margin-left:0;padding-left:12px;border-left:2px solid #d9cdb8;color:#555;}pre{white-space:pre-wrap;}</style>`;
  if (html && html.trim()) {
    // Quitamos scripts por partida doble (la CSP ya los bloquea) y metemos
    // nuestro <head> delante del documento original.
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<meta[^>]+http-equiv[^>]*>/gi, "");
    return `<!doctype html><html><head>${head}</head><body>${cleaned}</body></html>`;
  }
  return `<!doctype html><html><head>${head}</head><body><pre style="font-family:inherit;margin:0;">${escapeHtml(text ?? "")}</pre></body></html>`;
}

/**
 * Quita la cabecera Bcc (con sus líneas de continuación) del MIME compuesto
 * en lib/mailbox/smtp.ts antes de mandarlo por la red. Vive aquí para poder
 * testearlo sin server-only.
 */
export function stripBccHeader(raw: Buffer): Buffer {
  const str = raw.toString("binary");
  const headerEnd = str.indexOf("\r\n\r\n");
  if (headerEnd === -1) return raw;
  const headers = str.slice(0, headerEnd).split("\r\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of headers) {
    if (/^bcc:/i.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^[ \t]/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return Buffer.from(kept.join("\r\n") + str.slice(headerEnd), "binary");
}
