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
// ─────────────────────────────────────────────────────────────────────────────

export type SourceKind = "particular" | "agencia_portal" | "agencia_web";

export const SOURCE_KINDS: SourceKind[] = ["particular", "agencia_portal", "agencia_web"];

export const KIND_META: Record<SourceKind, { short: string; description: string; tone: string; icon: "user" | "building" | "globe" }> = {
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
};

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
  if (kind === "agencia_web") return agency ? `Web de ${agency}` : "Web de agencia";
  if (kind === "agencia_portal") return `${portalLabel(src.portal)} · ${agency ? `Agencia ${agency}` : "Agencia"}`;
  return `${portalLabel(src.portal)} · Particular`;
}
