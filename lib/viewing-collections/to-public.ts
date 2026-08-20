// ============================================================================
// Proyección interna → pública.
//
// Función PURA: sin acceso a base de datos, sin I/O, sin `server-only`. Es el
// único puente entre los datos internos y lo que ve el cliente, y por eso está
// aislada aquí — para poder testearla sin levantar nada.
// ============================================================================

import { getCountryConfig, isCountry } from "@/lib/country-config";
import {
  getCollectionDictionary,
  intlLocale,
  isCollectionLanguage,
  type CollectionLanguage,
} from "./i18n";
import { shareSlug } from "@/lib/share-slug";
import { compareStopsByDay } from "./order";
import type {
  PublicAgentContact,
  PublicAreaLocation,
  PublicAvailability,
  PublicStopStatus,
  PublicViewingCollection,
  PublicViewingStop,
} from "./public-contract";
import type { StopConfirmation } from "./types";

// ─── Entrada (lo que devuelve la query, ya con columnas explícitas) ──────────

export type RawPublicPhoto = {
  url: string;
  position: number;
  is_cover: boolean;
};

export type RawPublicProperty = {
  slug: string;
  title: string;
  title_rent: string | null;
  property_type: string | null;
  zone: string;
  subzone: string | null;
  address: string | null;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  price: number | string;
  rent_price: number | string | null;
  currency: string | null;
  operation: "rent" | "sale";
  operations: string[] | null;
  status: string;
  archived_at: string | null;
  bc_reference: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
  property_photos: RawPublicPhoto[] | null;
};

export type RawPublicStop = {
  id: string;
  /** Valoración que ya dejó el cliente en su enlace. */
  client_rating?: number | null;
  position: number;
  scheduled_at: string | null;
  time_pending?: boolean;
  duration_minutes: number | null;
  confirmation_status: StopConfirmation;
  address_visibility: "area_only" | "exact";
  exact_address_override?: string | null;
  hidden_from_client: boolean;
  created_at: string;
  smartLinkToken: string | null;
  property: RawPublicProperty;
};

export type RawPublicItinerary = {
  title: string | null;
  language?: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  timezone: string;
  country: string;
};

export type RawPublicAgent = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
} | null;

export type RawCollectionData = {
  itinerary: RawPublicItinerary;
  clientFullName: string | null;
  agent: RawPublicAgent;
  stops: RawPublicStop[];
  expiresAt: string;
};

// ─── Constantes de saneamiento ───────────────────────────────────────────────

/**
 * Tope de longitud para una dirección pública.
 *
 * Inspección de producción (2026-08-15, 251 direcciones no nulas): ninguna
 * contiene datos operativos (llaves, portería, teléfonos), pero 4 contienen la
 * descripción completa del anuncio volcada por el scraper — hasta 1.727
 * caracteres, con condiciones de alquiler y requisitos de documentación. Esas
 * no son direcciones y no deben publicarse, así que se degradan a `area_only`.
 */
const MAX_PUBLIC_ADDRESS_LEN = 120;
const MAX_PUBLIC_ADDRESS_SENTENCES = 3;

const FALLBACK_AGENT: PublicAgentContact = {
  displayName: "Benjamín Cousiño Propiedades",
  email: "contacto@bcousinoprop.com",
  phone: "+34 694 20 97 63",
  whatsappUrl: "https://wa.me/34694209763",
  avatarUrl: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 6 estados internos → 3 públicos. `proposed` vs `pending` es proceso interno
 *  del agente; `declined` (rechazó el propietario) es información comercial. */
export function collapseStopStatus(s: StopConfirmation): PublicStopStatus {
  if (s === "confirmed" || s === "completed") return "confirmed";
  if (s === "cancelled" || s === "declined") return "cancelled";
  return "pending";
}

export function deriveAvailability(
  prop: Pick<RawPublicProperty, "status" | "archived_at">,
): PublicAvailability {
  if (prop.archived_at || prop.status === "archived") return "unavailable";
  if (prop.status === "reserved") return "reserved";
  if (prop.status === "sold") return "sold";
  return "available";
}

function hashStrings(parts: string[]): string {
  const s = parts.join("|");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** SIEMPRE el proxy. `property_photos.url` apunta a Storage y delata el portal
 *  de origen (…/synced/level/…). */
export function proxyPhotoUrls(prop: RawPublicProperty): string[] {
  const seen = new Set<string>();
  const sorted = (prop.property_photos ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((p) => {
      if (!p.url || seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  const freshness = prop.last_synced_at ?? prop.updated_at ?? "";
  const v = hashStrings([...sorted.map((p) => p.url), freshness]);
  return sorted.map((_, i) => `/p/${prop.slug}/${i}?v=${v}`);
}

/** Degradación segura: lo que no parece una dirección, no se publica. */
export function sanitizePublicAddress(address: string | null): string | null {
  if (!address) return null;
  const clean = address.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  if (clean.length > MAX_PUBLIC_ADDRESS_LEN) return null;
  if ((clean.match(/\./g) ?? []).length > MAX_PUBLIC_ADDRESS_SENTENCES) {
    return null;
  }
  return clean;
}

/**
 * Centroide de la zona para el mapa aproximado.
 *
 * V1 devuelve siempre null: no hay ninguna fuente fiable. Deliberadamente NO
 * se reutiliza el ZONE_COORDS de components/property-detail — para una zona
 * desconocida devuelve Puerta del Sol, y un mapa que señala un sitio
 * equivocado es peor que no tener mapa.
 */
export function resolveAreaLocation(
  _zone: string,
  _subzone: string | null,
): PublicAreaLocation | null {
  return null;
}

export function firstNameOnly(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first && !first.includes("@") ? first : "Cliente";
}

function isDual(prop: RawPublicProperty): boolean {
  return (
    Array.isArray(prop.operations) &&
    prop.operations.includes("sale") &&
    prop.operations.includes("rent")
  );
}

function effectivePrice(prop: RawPublicProperty): number {
  if (isDual(prop) && prop.operation === "rent" && prop.rent_price != null) {
    return Number(prop.rent_price);
  }
  return Number(prop.price);
}

/**
 * Título editorial de la residencia.
 *
 * Los títulos del catálogo son operativos ("Alquiler de piso en Calle de
 * Jorge Juan") y en una publicación privada leen a portal inmobiliario. Si el
 * título contiene una vía reconocible, la colección muestra solo su nombre
 * ("Jorge Juan") — la operación, el tipo y la zona ya están en la página.
 *
 * Transformación de PRESENTACIÓN, conservadora a propósito: no toca
 * properties.title, no inventa nada, y ante cualquier duda (sin vía
 * reconocible, resultado corto o con dígitos) devuelve el título original.
 */
const STREET_NAME_RE =
  /(?:calle|c\/|avenida|avda\.?|paseo|plaza|glorieta|camino|ronda|traves[ií]a|bulevar|costanilla|cuesta|v[ií]a|carrer|r[úu]a)\s+(?:de\s+(?:la|los|las|el)\s+|del\s+|de\s+|la\s+|el\s+)?([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s.''-]{2,40}?)(?=\s*[,\dº(]|\s*$)/iu;

export function editorialResidenceTitle(rawTitle: string): string {
  const m = rawTitle.match(STREET_NAME_RE);
  if (!m) return rawTitle;
  const name = m[1].trim().replace(/\s+/g, " ");
  // Con dígitos o demasiado corto no es un nombre de vía fiable.
  if (name.length < 3 || /\d/.test(name)) return rawTitle;
  // Capitalización de título respetando partículas.
  const MINOR = new Set(["de", "del", "la", "las", "los", "el", "y"]);
  return name
    .toLocaleLowerCase("es")
    .split(" ")
    .map((w, i) =>
      MINOR.has(w) && i > 0 ? w : w.charAt(0).toLocaleUpperCase("es") + w.slice(1),
    )
    .join(" ");
}

/**
 * Títulos que NO pueden llegar al cliente porque delatan de dónde salió el
 * anuncio: «Idealista · 111905585», «Fotocasa 4471», una ristra de dígitos que
 * es el id del portal. El contrato prohíbe exponer el origen, y un título es
 * tan público como cualquier otro campo.
 */
const PORTAL_TITLE_RE =
  /(idealista|fotocasa|habitaclia|pisos\.com|milanuncios|kyero|thinkspain)|(^|\s)\d{6,}(\s|$)/i;

/**
 * El título que ve el cliente, con red de seguridad.
 *
 * Devuelve el nombre de la vía cuando se puede extraer; si el original es
 * genérico («Titulo»), está vacío o delata el portal, construye uno con datos
 * seguros: «Residencia en Chamberí». Nunca devuelve el crudo en esos casos.
 */
export function safeResidenceTitle(
  rawTitle: string | null | undefined,
  zone: string | null | undefined,
  residenceWord = "Residencia",
): string {
  const raw = (rawTitle ?? "").trim();
  const zoneName = (zone ?? "").trim();
  const unusable =
    !raw || GENERIC_TITLE_RE.test(raw) || PORTAL_TITLE_RE.test(raw);
  if (unusable) {
    return zoneName ? `${residenceWord} en ${zoneName}` : residenceWord;
  }
  return editorialResidenceTitle(raw);
}

const GENERIC_TITLE_RE =
  /^(t[ií]tulos?|titles?|propiedad|sin t[ií]tulo|untitled|—|-)$/i;

function displayTitle(prop: RawPublicProperty): string {
  const raw = (
    isDual(prop) && prop.operation === "rent" && prop.title_rent
      ? prop.title_rent
      : prop.title
  )?.trim();
  if (raw && !GENERIC_TITLE_RE.test(raw)) return editorialResidenceTitle(raw);
  const typ = prop.property_type?.trim();
  const label =
    typ && typ.length > 0
      ? typ.charAt(0).toUpperCase() + typ.slice(1).toLowerCase()
      : "Vivienda";
  return `${label} en ${prop.zone}`;
}

function formatTimeLabel(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
}

function formatDateLong(date: string | null, locale: string): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const s = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateShort(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatWindow(
  start: string | null,
  end: string | null,
): string | null {
  if (!start && !end) return null;
  const trim = (t: string | null) => (t ? t.slice(0, 5) : null);
  const a = trim(start);
  const b = trim(end);
  if (a && b) return `${a} – ${b}`;
  return a ?? b;
}

function toPublicAgent(agent: RawPublicAgent): PublicAgentContact {
  if (!agent || !agent.full_name?.trim()) return FALLBACK_AGENT;
  const digits = (agent.phone ?? "").replace(/[^\d]/g, "");
  return {
    displayName: agent.full_name.trim(),
    email: agent.email,
    phone: agent.phone,
    whatsappUrl: digits.length >= 9 ? `https://wa.me/${digits}` : null,
    avatarUrl: agent.avatar_url,
  };
}

/** Cascada de fallback del enlace por residencia. */
function resolveSmartLinkUrl(stop: RawPublicStop): {
  url: string | null;
  tracked: boolean;
} {
  const prop = stop.property;
  if (prop.archived_at || prop.status === "archived") {
    return { url: null, tracked: false };
  }
  if (stop.smartLinkToken) {
    return { url: `/c/${stop.smartLinkToken}`, tracked: true };
  }
  // Enlace estable: funciona, pero es indexable y no atribuye la visita a la
  // colección. Red de seguridad, no camino habitual.
  return {
    url: `/compartir/${shareSlug(prop.slug, prop.bc_reference)}`,
    tracked: false,
  };
}

// ─── Proyección ──────────────────────────────────────────────────────────────

export function toPublicViewingCollection(
  input: RawCollectionData,
): PublicViewingCollection {
  const country = isCountry(input.itinerary.country)
    ? input.itinerary.country
    : "es";
  const cfg = getCountryConfig(country);
  const tz = input.itinerary.timezone || "Europe/Madrid";
  const language: CollectionLanguage = isCollectionLanguage(
    input.itinerary.language,
  )
    ? input.itinerary.language
    : "es";
  const dict = getCollectionDictionary(language);
  // Fechas en el idioma del cliente; la moneda sigue la lógica del país.
  const locale = intlLocale(language);

  // 1 · Filtrar paradas ocultas.
  //     La query ya las excluye; esto es la SEGUNDA barrera, a propósito: si
  //     el filtro de la query se rompiera (o el embedded filter de PostgREST
  //     no se aplicara), esto lo detiene antes de llegar al HTML.
  const visible = input.stops
    .filter((s) => s.hidden_from_client === false)
    // Orden de jornada: por hora, y las que aún no la tienen, al final.
    .sort(compareStopsByDay);

  // 2 · Proyectar renumerando 1..N sobre las visibles: sin huecos aunque haya
  //     paradas ocultas en medio.
  const stops: PublicViewingStop[] = visible.map((stop, i) => {
    const prop = stop.property;
    const showExact = stop.address_visibility === "exact";
    const photos = proxyPhotoUrls(prop);
    const link = resolveSmartLinkUrl(stop);

    return {
      order: i + 1,
      clientRating:
        typeof stop.client_rating === "number" ? stop.client_rating : 0,
      timeLabel: formatTimeLabel(stop.scheduled_at, tz),
      // Solo se anuncia como pendiente si de verdad no hay hora: una parada
      // con hora nunca debe leerse "por confirmar".
      timePending: !!stop.time_pending && !stop.scheduled_at,
      durationLabel: stop.duration_minutes
        ? `${stop.duration_minutes} ${dict.minutesShort}`
        : null,
      status: collapseStopStatus(stop.confirmation_status),

      title: displayTitle(prop),
      propertyTypeLabel: prop.property_type,
      zoneLabel: [prop.zone, prop.subzone].filter(Boolean).join(" · "),
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      squareMeters: prop.square_meters,
      // La moneda la decide el país (EUR/CLP/UF); solo el sufijo de alquiler
      // cambia de idioma.
      priceLabel: cfg
        .formatPrice(effectivePrice(prop), prop.currency, prop.operation)
        .replace(/\/mes$/, dict.perMonthSuffix),
      bcReference: prop.bc_reference,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analyticsRef: (prop as any).analytics_token ?? null,
      availability: deriveAvailability(prop),

      // Dirección y coordenadas se deciden JUNTAS: ocultar la dirección y
      // enviar la coordenada real sería no ocultar nada.
      // La escrita a mano gana sobre la de la ficha (que llega del portal y
      // a veces viene incompleta). Ambas pasan por el mismo saneado, y ambas
      // solo salen si la visibilidad es 'exact'.
      exactAddress: showExact
        ? (sanitizePublicAddress(stop.exact_address_override ?? null) ??
          sanitizePublicAddress(prop.address))
        : null,
      exactLat: showExact ? prop.latitude : null,
      exactLng: showExact ? prop.longitude : null,
      areaLocation: showExact
        ? null
        : resolveAreaLocation(prop.zone, prop.subzone),

      coverPhotoUrl: photos[0] ?? null,
      photoUrls: photos,

      smartLinkUrl: link.url,
      smartLinkTracked: link.tracked,
    };
  });

  const dateLabel = formatDateLong(input.itinerary.scheduled_date, locale);

  return {
    language,
    title:
      input.itinerary.title?.trim() || dateLabel || "Private Viewing Collection",
    dateLabel,
    windowLabel: formatWindow(
      input.itinerary.window_start,
      input.itinerary.window_end,
    ),
    clientFirstName: firstNameOnly(input.clientFullName),
    stopCount: stops.length,
    expiresAtLabel: formatDateShort(input.expiresAt, locale),
    stops,
    agent: toPublicAgent(input.agent),
  };
}
