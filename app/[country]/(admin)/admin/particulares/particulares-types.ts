import type { LinkSummaryLite } from "@/lib/particulares/links-types";

export type StaffOption = { id: string; name: string };

export type ParticularChangeRow = {
  id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_at: string;
};

export type ParticularRow = {
  id: string;
  portal: string;
  external_id: string;
  particular_reference: string | null;
  source_url: string;
  zone: string | null;
  price: number | null;
  operation: "rent" | "sale" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  /**
   * Portada del anuncio. Es lo único que trae el listado: la galería completa
   * la carga el modal al abrirse (ver /api/admin/particulares/detail), porque
   * mandar los 30+ `photos` de cada fila colgaba la página.
   */
  cover_url: string | null;
  /** Solo presente una vez el modal ha cargado el detalle. */
  photos?: Array<{ url: string; alt?: string }> | null;
  features: string[] | null;
  owner_name: string | null;
  phone: string | null;
  chat_only: boolean | null;
  latitude: number | null;
  /** 'exact' | 'approximate': lo dice el crawler (addressVisibility de Idealista); null en los antiguos. */
  location_precision?: string | null;
  longitude: number | null;
  // Campos de la migración 0035 — pueden venir undefined/null si aún no está aplicada
  address?: string | null;
  /** Título del anuncio (migración 0186); `address` es solo la dirección. */
  title?: string | null;
  phone_confidence?: "high" | "medium" | "low" | null;
  advertiser_type?: string | null;
  // Campos de la migración 0036 (plano + vídeo) — pueden venir undefined/null
  has_floor_plan?: boolean | null;
  floor_plan_url?: string | null;
  has_video?: boolean | null;
  video_url?: string | null;
  // Ficha técnica scrapeada de Idealista — NO viaja en el listado (para no
  // engordarlo); la carga el modal bajo demanda vía /api/admin/particulares/detail.
  price_per_m2?: number | null;
  previous_price?: number | null;
  price_drop_pct?: number | null;
  floor?: string | null;
  has_lift?: boolean | null;
  condition?: string | null;
  year_built?: number | null;
  orientation?: string | null;
  energy_consumption?: string | null;
  energy_emissions?: string | null;
  /** Distrito del bloque «Ubicación» (`scraper_extra.district`); llega con el detalle. */
  district?: string | null;
  advertiser_profile_url?: string | null;
  reference?: string | null;
  source_update_text?: string | null;
  detected_at?: string | null;
  /** Última vez que el crawler tocó la fila (si lleva días sin cambiar, el anuncio puede estar ya dado de baja). */
  updated_at?: string | null;
  created_at: string | null;
  taken_down_at: string | null;
  is_active: boolean;
  /** "true" si su zona ya no está marcada en Sindicación (el crawler dejó de rastrearlo). */
  fuera_de_zona?: string | null;
  // Gestión interna (enriquecido en el servidor — ver lib/db/queries/particulares.ts)
  assigned_to?: string | null;
  assigned_name?: string | null;
  last_contact_at?: string | null;
  last_contact_by?: string | null;
  last_contact_type?: string | null;
  contact_count?: number;
  // Enlace de anuncios del mismo inmueble (migración 0176). `link_summary` solo
  // viene en el anuncio PRINCIPAL de un grupo; `duplicate_of` en las copias.
  duplicate_of?: string | null;
  link_summary?: LinkSummaryLite | null;
  link_ops?: string[] | null;
};

// timeZone fijo a Madrid: sin él, el servidor (VPS en UTC) y el navegador
// (hora local) formatean la hora distinto y React lanza el error de
// hidratación #418 ("text content does not match").
