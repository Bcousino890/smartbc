import * as cheerio from "cheerio";

/**
 * Cita de un correo recibido dentro de una respuesta/reenvío, como hace Gmail:
 * se cita el HTML ORIGINAL (con su formato y sus citas anidadas) en vez de su
 * texto plano, que trae los `>` crudos y los `<enlace>` que algunos clientes
 * añaden al convertir HTML → texto.
 *
 * Ese HTML es de un tercero y va a salir en un correo nuestro (y a quedar en
 * nuestro "Enviados"), así que se limpia con un parser de verdad (no con
 * regex): fuera scripts, estilos, formularios, iframes, manejadores on*,
 * enlaces javascript: e imágenes incrustadas (data:/cid:, que además
 * engordarían el correo sin aportar nada a una cita).
 *
 * Sin `server-only`: lo usa la ruta de envío y `npm run test:mailbox`. No se
 * importa desde el cliente (cheerio no debe ir al bundle del navegador).
 */

const DROP =
  "script,style,iframe,frame,frameset,object,embed,applet,form,input,button,select,textarea,link,meta,base,title,noscript,svg,audio,video,source,track";

const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;
const URL_ATTRS = /^(href|src|action|formaction|xlink:href|background|poster)$/i;

/** Por encima de esto no se cita el HTML (newsletters enormes): se cae al texto. */
export const MAX_QUOTED_HTML_CHARS = 150_000;

export function sanitizeQuotedHtml(html: string): string {
  const $ = cheerio.load(html);
  $(DROP).remove();
  $("img[src^='data:'], img[src^='cid:']").remove();
  $("*").each((_, el) => {
    const attrs = $(el).attr() ?? {};
    for (const [name, value] of Object.entries(attrs)) {
      if (
        /^on/i.test(name) ||
        name === "srcdoc" ||
        name === "id" ||
        name === "name" ||
        (URL_ATTRS.test(name) && DANGEROUS_URL.test(String(value)))
      ) {
        $(el).removeAttr(name);
      }
    }
  });
  return ($("body").html() ?? "").trim();
}

/** HTML listo para citar, o null si no hay o es demasiado grande. */
export function quotableHtml(html: string | null | undefined): string | null {
  if (!html || !html.trim()) return null;
  const clean = sanitizeQuotedHtml(html);
  return clean && clean.length <= MAX_QUOTED_HTML_CHARS ? clean : null;
}
