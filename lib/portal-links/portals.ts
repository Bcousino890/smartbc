// ============================================================================
// Portales inmobiliarios · detección e identidad de un anuncio externo
// ============================================================================
// Módulo PURO (sin server-only, sin acceso a red): lo importan por igual las
// server actions, la ruta que recibe los envíos de la extensión de Chrome y
// los componentes de cliente del panel.
//
// Deliberadamente NO reutiliza `lib/sync/import-by-link/detect-portal.ts`: ese
// enumera los portales que sabemos *extraer* (tiene un extractor detrás), y
// aquí basta con reconocer de dónde viene un enlace para etiquetarlo. Un piso
// de un portal sin extractor sigue siendo perfectamente llamable.
// ============================================================================

export type PortalId =
  | "idealista"
  | "fotocasa"
  | "habitaclia"
  | "pisos"
  | "milanuncios"
  | "yaencontre"
  | "spotahome"
  | "badi"
  | "airbnb"
  | "ukio"
  | "inmoweb"
  | "clikalia"
  | "engelvoelkers"
  | "portalinmobiliario"
  | "toctoc"
  | "yapo"
  | "other";

type PortalRule = {
  id: PortalId;
  label: string;
  match: RegExp;
  /** Extrae la referencia del anuncio del path, si el portal la lleva ahí. */
  ref?: RegExp;
};

// El orden importa poco (los hosts no se solapan), pero se mantiene el de uso
// real: primero los portales con los que se trabaja a diario.
const RULES: PortalRule[] = [
  { id: "idealista",    label: "Idealista",       match: /(^|\.)idealista\.[a-z.]+$/i,      ref: /\/inmueble\/(\d+)/i },
  { id: "fotocasa",     label: "Fotocasa",        match: /(^|\.)fotocasa\.[a-z.]+$/i,       ref: /\/(\d{6,})\/?(?:d)?\/?$/i },
  { id: "habitaclia",   label: "Habitaclia",      match: /(^|\.)habitaclia\.[a-z.]+$/i,     ref: /\/i(\d{5,})\b/i },
  { id: "pisos",        label: "Pisos.com",       match: /(^|\.)pisos\.com$/i,              ref: /-(\d{6,})\/?$/i },
  { id: "milanuncios",  label: "Milanuncios",     match: /(^|\.)milanuncios\.com$/i,        ref: /-(\d{6,})\.htm/i },
  { id: "yaencontre",   label: "yaencontre",      match: /(^|\.)yaencontre\.[a-z.]+$/i },
  { id: "spotahome",    label: "Spotahome",       match: /(^|\.)spotahome\.com$/i,          ref: /\/(\d{4,})\/?$/i },
  { id: "badi",         label: "Badi",            match: /(^|\.)badi\.com$/i },
  { id: "airbnb",       label: "Airbnb",          match: /(^|\.)airbnb\.[a-z.]+$|(^|\.)abnb\.me$/i, ref: /\/rooms\/(\d+)/i },
  { id: "ukio",         label: "Ukio",            match: /(^|\.)ukio\.[a-z.]+$/i },
  { id: "inmoweb",      label: "Inmoweb",         match: /(^|\.)inmoweb\.(es|net|com)$/i },
  { id: "clikalia",     label: "Clikalia",        match: /(^|\.)clikalia\.[a-z.]+$/i },
  { id: "engelvoelkers",label: "Engel & Völkers", match: /(^|\.)engelvoelkers\.com$/i },
  // Chile
  { id: "portalinmobiliario", label: "Portal Inmobiliario", match: /(^|\.)portalinmobiliario\.com$/i },
  { id: "toctoc",       label: "TocToc",          match: /(^|\.)toctoc\.com$/i },
  { id: "yapo",         label: "Yapo",            match: /(^|\.)yapo\.cl$/i },
];

const PORTAL_LABELS: Record<PortalId, string> = {
  ...(Object.fromEntries(RULES.map((r) => [r.id, r.label])) as Record<PortalId, string>),
  other: "Otra web",
};

export function portalLabel(id: string): string {
  return PORTAL_LABELS[id as PortalId] ?? PORTAL_LABELS.other;
}

/**
 * Parámetros de tracking que se descartan al normalizar. Sin esto, el mismo
 * anuncio compartido por WhatsApp y abierto desde la app crearía dos filas.
 */
const TRACKING_PARAMS = [
  /^utm_/i, /^gclid$/i, /^fbclid$/i, /^msclkid$/i, /^mc_[ce]id$/i,
  /^xtor$/i, /^_ga$/i, /^ref$/i, /^referrer$/i, /^origin$/i,
  /^source$/i, /^shid$/i, /^cid$/i, /^gad_source$/i,
];

function isTracking(name: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(name));
}

export type ParsedPortalUrl = {
  /** URL saneada que se guarda y se abre (sin basura de tracking). */
  url: string;
  /** Clave de deduplicación: misma página → misma clave. */
  urlKey: string;
  portal: PortalId;
  /** Código del anuncio en el portal, cuando va en el path. */
  externalRef: string | null;
};

/**
 * Normaliza un enlace de anuncio. Devuelve `null` si no es http/https — el
 * único filtro duro, porque el CHECK `cpl_url_scheme` de la base rechazaría
 * cualquier otra cosa y preferimos un mensaje claro antes que un 500.
 */
export function parsePortalUrl(raw: string): ParsedPortalUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  const rule = RULES.find((r) => r.match.test(host));

  // Limpieza: fuera hash y parámetros de tracking; el resto se ordena para que
  // ?a=1&b=2 y ?b=2&a=1 sean la misma clave.
  u.hash = "";
  const params = [...u.searchParams.entries()].filter(([k]) => !isTracking(k));
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);

  const cleanPath = u.pathname.replace(/\/+$/, "") || "/";
  const bareHost = host.replace(/^www\./, "");
  const query = u.searchParams.toString();

  const url = `${u.protocol}//${host}${cleanPath}${query ? `?${query}` : ""}`;
  const externalRef = rule?.ref ? (u.pathname.match(rule.ref)?.[1] ?? null) : null;

  // Con referencia del anuncio la clave es host+ref: así el mismo piso alcanzado
  // por dos rutas distintas del portal (búsqueda, mapa, favoritos) es una fila.
  const urlKey = externalRef
    ? `${bareHost}#${externalRef}`
    : `${bareHost}${cleanPath.toLowerCase()}${query ? `?${query}` : ""}`;

  return { url, urlKey, portal: rule?.id ?? "other", externalRef };
}

/**
 * Extrae los enlaces de un pegote de texto: una lista pegada del portapapeles,
 * un WhatsApp reenviado o un correo. Uno por línea es lo normal, pero también
 * se acepta prosa con URLs entremedias.
 */
export function extractUrls(text: string, limit = 60): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    // Los signos de puntuación finales rara vez son parte del enlace.
    const cleaned = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}
