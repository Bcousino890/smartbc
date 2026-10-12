// Tipos compartidos (servidor y cliente) del enlace de anuncios de particulares
// — migración 0176. Sin imports de servidor: los usa el listado y el modal.

export type LinkOffer = {
  op: "rent" | "sale" | null;
  portal: string;
  price: number | null;
  active: boolean;
};

/** Resumen ya calculado en el anuncio PRINCIPAL de un grupo (`particulares.link_summary`). */
export type LinkSummaryLite = {
  n: number;
  portals: string[];
  ops: string[];
  active_ops: string[];
  phones: number;
  names: string[];
  offers?: LinkOffer[];
};

export type LinkLevel = "cierto" | "probable" | "informativo";
export type LinkStatus = "auto" | "confirmado" | "descartado";

/** El enlace que une un anuncio con la ficha (o con el actual). */
export type LinkInfo = {
  id: string;
  level: LinkLevel;
  relation: "mismo_inmueble" | "mismo_contacto";
  rule: string;
  status: LinkStatus;
  evidence: Record<string, unknown>;
};

export type LinkedAd = {
  id: string;
  portal: string;
  external_id: string;
  source_url: string;
  /** "particular" | "professional" | "unknown": quién publica este anuncio. */
  advertiser_type?: string | null;
  operation: "rent" | "sale" | null;
  price: number | null;
  is_active: boolean;
  taken_down_at: string | null;
  phone: string | null;
  owner_name: string | null;
  zone: string | null;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  cover_url: string | null;
  photos: Array<{ url: string }>;
  n_photos: number;
  created_at: string | null;
  particular_reference: string | null;
  /** Observaciones de precio del scraper (`scraper_extra.price_history`): [fecha ISO, precio]. */
  price_history?: Array<[string, number]>;
  link: LinkInfo | null;
};

/** Un cambio registrado en `particulares_changes` de cualquier fuente del grupo. */
export type LinkedChange = {
  particular_id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_at: string;
};

export type ParticularLinksPayload = {
  /** Anuncio principal de la ficha (el que sale en el listado). */
  root_id: string;
  /** Todos los anuncios de ESTE inmueble (incluye el abierto y el principal). */
  members: LinkedAd[];
  /** Posibles gemelos por confirmar (nivel «probable»). */
  suggestions: LinkedAd[];
  /** Otros anuncios con el mismo teléfono pero OTRO inmueble. */
  same_contact: LinkedAd[];
  /** Contactos distintos asociados a este inmueble (teléfono + nombre + portales). */
  contacts: Array<{ phone: string | null; name: string | null; portals: string[] }>;
  /** Historial de cambios de todas las fuentes del inmueble (más reciente primero). */
  changes?: LinkedChange[];
};
