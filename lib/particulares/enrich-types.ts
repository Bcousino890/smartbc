// Tipos compartidos (cliente y servidor) del bloque «Dato añadido desde la descripción» de la ficha.

export type EnrichmentField = "phone" | "phone2" | "address" | "owner_name" | "location";

export type AppliedEnrichment = {
  id: string;
  campo: EnrichmentField;
  /** Lo que se escribió, ya legible («+34 600 12 34 56», «Calle Mayor, 5», «María»). */
  value: string;
  regla: string;
  confianza: "alta" | "media";
  evidencia: string | null;
  applied_at: string;
  origen: "auto" | "manual";
};

export type EnrichmentCandidate = {
  key: string;
  field: "phone" | "phone2" | "address" | "owner_name";
  value: string;
  confidence: "media" | "baja";
  rule: string;
  evidence: string;
  reason: string | null;
};

export type EnrichmentsPayload = {
  /** Datos añadidos que siguen vigentes (el campo aún vale lo que puso el enriquecimiento). */
  applied: AppliedEnrichment[];
  /** Candidatos de confianza media pendientes de que una persona los acepte o descarte. */
  candidates: EnrichmentCandidate[];
};

export const ENRICH_FIELD_LABEL: Record<EnrichmentField, string> = {
  phone: "Teléfono",
  phone2: "Segundo teléfono",
  address: "Dirección",
  owner_name: "Responsable",
  location: "Ubicación exacta",
};

/** Texto corto de la regla para la persona (no el código interno). */
export function ruleLabel(rule: string): string {
  if (rule.startsWith("phone.junto_al_telefono_del_registro")) return "al lado del teléfono que ya teníamos";
  if (rule.startsWith("phone.etiquetado")) return "número de contacto en el texto";
  if (rule.startsWith("phone.nombre_pegado")) return "número con nombre pegado";
  if (rule.startsWith("phone.")) return "número en el texto";
  if (rule.startsWith("address.titulo_del_portal")) return "título del anuncio en la descripción";
  if (rule.startsWith("address.nominatim")) return "confirmada en el mapa";
  if (rule.startsWith("address.")) return "calle del texto = calle de la ficha";
  if (rule.startsWith("location.")) return "portal confirmado en el mapa";
  if (rule.startsWith("name.formula_personal")) return "se presenta en el texto";
  if (rule.startsWith("name.")) return "nombre de contacto en el texto";
  return rule;
}
