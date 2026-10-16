// Tipos compartidos (servidor y cliente) del enlace de anuncios de particulares
// — migración 0176. Sin imports de servidor: los usa el listado y el modal.

import type { SourceKind } from "./source-kind";

export type LinkOffer = {
  op: "rent" | "sale" | null;
  portal: string;
  price: number | null;
  active: boolean;
  /** Tipo de fuente (source-kind.ts). Sin él: «particular» (anuncios anteriores a 0200). */
  kind?: SourceKind;
  /** Nombre de la agencia (agencia_portal / agencia_web). */
  agency?: string;
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
  /** Agencias del CRM (`properties`) que tienen este mismo inmueble (fuente «Agencia»). */
  agencies?: string[];
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
  /** Referencia del anunciante/portal (`particulares.reference`): «BC-1746» en agencias de Idealista, «6994» en Fotocasa. */
  reference?: string | null;
  /** `scraper_extra->>agency_reference`, `agency_url` (enlace adicional de la agencia) y `portal_id`. */
  agency_reference?: string | null;
  agency_url?: string | null;
  portal_id?: string | null;
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
  /** Propiedades de agencias del CRM que coinciden con este inmueble (migración 0199). */
  agency_matches?: AgencyMatchInfo[];
  /** Webs propias de las agencias anunciantes (enlace adicional del portal), con lo leído si ya está en caché (0203). */
  agency_webs?: AgencyWebSource[];
};

/** Propiedad de una agencia del CRM que es (o podría ser) el mismo inmueble que el anuncio. */
export type AgencyMatchInfo = {
  id: string;
  property_id: string;
  level: LinkLevel;
  status: LinkStatus;
  rule: string;
  evidence: Record<string, unknown>;
  particular_id: string;
  property: {
    slug: string | null;
    title: string | null;
    agency_name: string | null;
    /** true = agencia colaboradora de sindicación (feed); false = propiedad importada de portal («Portales externos»). */
    agency_collab?: boolean;
    reference: string | null;
    operation: "rent" | "sale" | null;
    price: number | null;
    status: string | null;
    address: string | null;
    square_meters: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
  };
};

/** Resultado de comprobar que la ficha de la web de la agencia es la de este anuncio. */
export type WebVerdict = {
  /** `verificada`: misma referencia y sin contradicciones · `no_coincide` · `sin_leer` (solo hay URL). */
  state: "verificada" | "no_coincide" | "sin_leer";
  reasons: string[];
};

export type AgencyWebCms = "mobilia" | "inmoweb" | "generico" | null;

/** Fuente «web propia de la agencia» (agencia_web_propia): la ficha del piso en la web de la agencia anunciante. */
export type AgencyWebSource = {
  /** Clave estable (URL normalizada). */
  key: string;
  url: string;
  /** URL canónica (la bonita) si se pudo resolver; si no, null y solo hay `url`. */
  canonical_url: string | null;
  domain: string;
  cms: AgencyWebCms;
  ref: string | null;
  /** Nombre de la agencia anunciante (el de los anuncios que la enlazan). */
  agency_name: string | null;
  /** Anuncios del grupo que enlazan esta web. */
  member_ids: string[];
  verdict: WebVerdict;
  /** ¿Se ha leído la ficha? */
  read: boolean;
  /** robots.txt de la web prohíbe la ruta: no se lee. */
  blocked: boolean;
  /** Aviso bajo el estado (bloqueada, error de lectura, ficha retirada). */
  note: string | null;
  /** Estado de la ficha: activa / no disponible / sin leer. */
  live: boolean | null;
  price: number | null;
  square_meters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  address: string | null;
  fetched_at: string | null;
  /** Fotos originales sin marca de agua. */
  photos: Array<{ url: string }>;
};

