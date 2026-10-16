// ─────────────────────────────────────────────────────────────────────────────
// Taxonomía de fuentes de un inmueble (sin imports de servidor: la usan el
// enlazador, el listado y la ficha).
//
//   particular      Idealista · Fotocasa · pisos.com · Habitaclia  (propietario)
//                   → «Idealista · Particular»
//   agencia_portal  agencia normal anunciante en un portal         (advertiser_type
//                   = professional en `particulares`)
//                   → «Idealista · Agencia Acme»
//   agencia_web     web directa de una agencia colaboradora con sindicación
//                   (UrbantecHome, Housingo, TerraHomes, Level…): sus propiedades
//                   viven en el CRM (`properties` / `agency_feeds`)
//                   → «Web de Housingo»
//   crm_importada   propiedad del CRM de la agencia «Portales externos» (u otra SIN feed
//                   de sindicación): es el cajón donde el CRM importa propiedades de
//                   portales, NO la web de ninguna agencia
//                   → «Nuestra ficha en el CRM»
//   agencia_web_propia  la ficha en la web propia de la agencia anunciante (el «Enlace
//                   adicional» del anuncio del portal: Mobilia, Inmoweb…)
//                   → «Web de Domus Aurea Capital»
// ─────────────────────────────────────────────────────────────────────────────

export type SourceKind = "particular" | "agencia_portal" | "agencia_web" | "crm_importada" | "agencia_web_propia";

export const SOURCE_KINDS: SourceKind[] = ["particular", "agencia_portal", "agencia_web", "agencia_web_propia", "crm_importada"];

export const KIND_META: Record<SourceKind, { short: string; description: string; tone: string; icon: "user" | "building" | "globe" | "folder" | "link" }> = {
  particular: {
    short: "Particular",
    description: "Anuncio de un propietario en un portal",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-800",
    icon: "user",
  },
  agencia_portal: {
    short: "Agencia",
    description: "Agencia anunciante en un portal inmobiliario",
    tone: "border-sky-300 bg-sky-50 text-sky-800",
    icon: "building",
  },
  agencia_web: {
    short: "Web de agencia",
    description: "Web directa de una agencia colaboradora (propiedad del CRM)",
    tone: "border-gold/50 bg-gold/10 text-gold-dark",
    icon: "globe",
  },
  crm_importada: {
    short: "En el CRM",
    description: "Nuestra ficha en el CRM (importada desde un portal; no es la web de ninguna agencia)",
    tone: "border-ink/20 bg-ink/5 text-ink/80",
    icon: "folder",
  },
  agencia_web_propia: {
    short: "Web propia",
    description: "Ficha en la web propia de la agencia anunciante (enlace adicional del portal)",
    tone: "border-teal-300 bg-teal-50 text-teal-800",
    icon: "link",
  },
};

/** Agencias del CRM que son un cajón de importación y no una agencia colaboradora real (último recurso). */
export const IMPORT_BUCKET_SLUGS = ["portales-externos"];

/**
 * ¿Es la propiedad del CRM de una agencia colaboradora de sindicación? Lo decide `agency_feeds`
 * (una agencia con feed = colaboradora: UrbantecHome, Housingo, TerraHomes, Level…). «Portales
 * externos» no tiene feed. Sin dato de feeds (tabla ilegible) se cae al slug del cajón.
 */
export function isCollaboratingAgency(a: { hasFeed?: boolean | null; slug?: string | null }): boolean {
  if (a.hasFeed != null) return a.hasFeed;
  return !IMPORT_BUCKET_SLUGS.includes((a.slug ?? "").trim().toLowerCase());
}

/** Tipo de fuente de una propiedad del CRM. */
export function kindOfCrmProperty(collab: boolean | null | undefined): SourceKind {
  return collab === false ? "crm_importada" : "agencia_web";
}

export const PORTAL_NAMES: Record<string, string> = {
  idealista: "Idealista",
  fotocasa: "Fotocasa",
  pisos: "Pisos.com",
  "pisos.com": "Pisos.com",
  habitaclia: "Habitaclia",
  yaencontre: "Yaencontré",
  milanuncios: "Milanuncios",
};

export function portalLabel(portal: string | null | undefined): string {
  const p = (portal ?? "").trim().toLowerCase();
  if (!p) return "Portal";
  return PORTAL_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

/** `particulares.advertiser_type` → tipo de fuente (la web de agencia nunca es una fila de `particulares`). */
export function kindOfAdvertiser(advertiserType: string | null | undefined): SourceKind {
  return advertiserType === "professional" ? "agencia_portal" : "particular";
}

/**
 * Etiqueta completa de una fuente:
 *  «Idealista · Particular» · «Idealista · Agencia Acme» · «Web de Housingo».
 */
export function sourceLabel(src: { kind?: SourceKind | null; portal?: string | null; agency?: string | null }): string {
  const kind = src.kind ?? "particular";
  const agency = (src.agency ?? "").trim();
  if (kind === "crm_importada") return "Nuestra ficha en el CRM";
  if (kind === "agencia_web_propia") return agency ? `Web de ${agency}` : "Web de la agencia";
  if (kind === "agencia_web") return agency ? `Web de ${agency}` : "Web de agencia";
  if (kind === "agencia_portal") return `${portalLabel(src.portal)} · ${agency ? `Agencia ${agency}` : "Agencia"}`;
  return `${portalLabel(src.portal)} · Particular`;
}
