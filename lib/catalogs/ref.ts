// ============================================================================
// Qué ha escrito Fabricio para añadir una propiedad EXISTENTE (BCP-01 T4).
// Puro: se prueba en scripts/test-catalogs.mts.
//
// Acepta:
//   · referencia BC («BC-1234», «bc 42», «BC0042») → «BC-0042»;
//   · slug de la ficha («atico-con-terraza-3291»);
//   · URL de una ficha propia: /compartir/<slug>, /{es|cl}/admin/propiedades/
//     <slug>, /admin/propiedades/<slug>, /propiedades/<slug>,
//     /web/propiedades/<slug> (en bcousinoprop.com o relativa).
// Rechaza las URL de portales y de otros dominios: importar desde un portal
// crea propiedades nuevas y llega en la fase 3 (T16b), detrás de G3.
// ============================================================================

export type PropertyRef =
  | { kind: "bc"; reference: string }
  | { kind: "slug"; slug: string }
  | { kind: "invalid"; reason: "empty" | "portal" | "foreign_host" | "unrecognized" };

const OWN_HOST = /(^|\.)bcousinoprop\.com$|^localhost$|^127\.0\.0\.1$/i;
const PORTAL_HOST =
  /(^|\.)(idealista|fotocasa|habitaclia|pisos|yaencontre|milanuncios|airbnb|sothebysrealty|inmoweb|mobilia|clikalia|urbantechome|ukio|portalinmobiliario|kyero|thinkspain)\./i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/i;
const PATHS = [
  /^\/compartir\/([^/?#]+)\/?$/i,
  /^\/(?:(?:es|cl)\/)?admin\/propiedades\/([^/?#]+)\/?$/i,
  /^\/(?:web\/)?propiedades\/([^/?#]+)\/?$/i,
];

function asSlug(raw: string): string | null {
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return SLUG.test(s) ? s.toLowerCase() : null;
}

export function parsePropertyRef(input: unknown): PropertyRef {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return { kind: "invalid", reason: "empty" };
  if (s.length > 500) return { kind: "invalid", reason: "unrecognized" };

  const bc = /^bc[\s-]?0*(\d{1,6})$/i.exec(s);
  if (bc) return { kind: "bc", reference: `BC-${bc[1].padStart(4, "0")}` };

  const looksUrl = /^https?:\/\//i.test(s) || s.startsWith("/") || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(s);
  if (looksUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(s) || s.startsWith("/") ? s : `https://${s}`, "https://portal.bcousinoprop.com");
    } catch {
      return { kind: "invalid", reason: "unrecognized" };
    }
    if (!OWN_HOST.test(url.hostname)) {
      return { kind: "invalid", reason: PORTAL_HOST.test(url.hostname) ? "portal" : "foreign_host" };
    }
    for (const re of PATHS) {
      const m = re.exec(url.pathname);
      if (m) {
        const slug = asSlug(m[1]);
        return slug ? { kind: "slug", slug } : { kind: "invalid", reason: "unrecognized" };
      }
    }
    return { kind: "invalid", reason: "unrecognized" };
  }

  const slug = /-/.test(s) ? asSlug(s) : null;
  return slug ? { kind: "slug", slug } : { kind: "invalid", reason: "unrecognized" };
}

export function refErrorMessage(reason: Extract<PropertyRef, { kind: "invalid" }>["reason"]): string {
  switch (reason) {
    case "empty":
      return "Escribe una referencia BC, el slug o la URL de la ficha.";
    case "portal":
      return "Las URL de portales crean propiedades nuevas: eso llega con la importación (fase 3). Aquí solo se añaden propiedades que ya están en el CRM.";
    case "foreign_host":
      return "Esa URL no es de una ficha del CRM.";
    default:
      return "No reconozco esa referencia. Usa «BC-1234», el slug o la URL de la ficha.";
  }
}
