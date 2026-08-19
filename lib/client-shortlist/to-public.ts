// ============================================================================
// Proyección al contrato público del Shortlist.
//
// FUNCIÓN PURA, igual que la de Viewing Collections: entra una fila cruda,
// sale exactamente lo que el cliente puede ver. Que sea pura es lo que permite
// probar las garantías de privacidad sin levantar nada.
//
// Reutiliza las piezas ya probadas del Private Book —título editorial, fotos
// por proxy— en vez de reimplementarlas: si mañana se endurece el saneado de
// una, se endurece en las dos.
// ============================================================================

import {
  firstNameOnly,
  proxyPhotoUrls,
  safeResidenceTitle,
} from "@/lib/viewing-collections/to-public";
import {
  intlLocale,
  isCollectionLanguage,
  type CollectionLanguage,
} from "@/lib/viewing-collections/i18n";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import type {
  PublicClientShortlist,
  PublicShortlistProperty,
} from "./public-contract";
import type { ShortlistDecision, ShortlistItemOrigin } from "./types";

/** Fila cruda tal y como la devuelve la consulta. Deliberadamente mínima: lo
 *  que no se pide no se puede filtrar por descuido. */
export type RawShortlistProperty = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  subzone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  /** null en un anuncio de portal que no traía precio legible. */
  price: number | null;
  currency: string | null;
  operation: "rent" | "sale";
  status: string;
  archived_at: string | null;
  bc_reference: string | null;
  last_synced_at?: string | null;
  updated_at?: string | null;
  property_photos: Array<{ url: string; position: number }> | null;
};

export type RawShortlistItem = {
  id: string;
  origin: ShortlistItemOrigin;
  decision: ShortlistDecision;
  rank: number | null;
  client_comment: string | null;
  position: number;
  property: RawShortlistProperty;
  /**
   * Fotos ya resueltas, para los items que todavía NO son ficha nuestra (un
   * anuncio de portal). El proxy `/p/{slug}/{i}` no puede servirlas: no hay
   * slug ni fila en property_photos, la imagen vive en el CDN del portal.
   * Cuando está presente, manda sobre `proxyPhotoUrls`.
   */
  externalPhotoUrls?: string[];
};

export type RawShortlist = {
  client: { full_name: string | null } | null;
  language: string;
  country: string;
  status: string;
  submitted_at: string | null;
  revision: number;
  items: RawShortlistItem[];
};

/** Zona + subzona, que es toda la ubicación que se da en esta fase. */
export function shortlistZoneLabel(prop: RawShortlistProperty): string {
  const zone = (prop.zone ?? "").trim();
  const sub = (prop.subzone ?? "").trim();
  if (zone && sub && sub !== zone) return `${zone} · ${sub}`;
  return zone || sub || "";
}

/**
 * Orden de lectura: primero las prioritarias por su rank, luego las dudas,
 * luego las no decididas, y al final las descartadas. Dentro de cada grupo,
 * el orden en que BCP las mandó.
 *
 * Se calcula aquí y no en SQL para que el panel y el cliente compartan
 * exactamente el mismo criterio.
 */
/** «Residencia en Chamberí» cuando el título no sirve. Una palabra por idioma. */
const RESIDENCE_WORD: Record<string, string> = {
  es: "Residencia",
  en: "Residence",
  fr: "Résidence",
  it: "Residenza",
  de: "Residenz",
  ar: "مسكن",
  tr: "Konut",
  he: "נכס",
};

const DECISION_ORDER: Record<ShortlistDecision, number> = {
  must_visit: 0,
  undecided: 1,
  maybe: 2,
  not_for_me: 3,
};

export function compareShortlistItems(
  a: { decision: ShortlistDecision; rank: number | null; position: number },
  b: { decision: ShortlistDecision; rank: number | null; position: number },
): number {
  const d = DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision];
  if (d !== 0) return d;
  if (a.decision === "must_visit") {
    const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
    const br = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
  }
  return a.position - b.position;
}

export function toPublicClientShortlist(
  raw: RawShortlist,
): PublicClientShortlist {
  const language: CollectionLanguage = isCollectionLanguage(raw.language)
    ? raw.language
    : "es";
  const country = isCountry(raw.country) ? raw.country : "es";
  const cfg = getCountryConfig(country);

  const properties: PublicShortlistProperty[] = raw.items
    .slice()
    .sort(compareShortlistItems)
    .map((item) => {
      const prop = item.property;
      // Un anuncio sin ficha trae su foto del portal; una ficha nuestra pasa
      // SIEMPRE por el proxy, que es lo que impide que salga una ruta de
      // Storage al navegador del cliente.
      const photos = item.externalPhotoUrls ?? proxyPhotoUrls(prop as never);
      return {
        itemId: item.id,
        // Con red: un título genérico o que delate el portal se sustituye
        // por uno construido con la zona. Ver safeResidenceTitle.
        title: safeResidenceTitle(prop.title, prop.zone, RESIDENCE_WORD[language]),
        zoneLabel: shortlistZoneLabel(prop),
        priceLabel: cfg.formatPrice(
          prop.price == null ? null : Number(prop.price),
          prop.currency,
          prop.operation,
        ),
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        squareMeters: prop.square_meters ?? null,
        bcReference: prop.bc_reference ?? null,
        coverPhotoUrl: photos[0] ?? null,
        // Hasta 8: suficiente para recordar la casa, sin cargar 14 galerías
        // enteras en un móvil.
        photoUrls: photos.slice(0, 8),
        pendingProperty: Boolean(item.externalPhotoUrls),
        origin: item.origin,
        decision: item.decision,
        rank: item.rank,
        comment: item.client_comment,
      };
    });

  return {
    clientFirstName: firstNameOnly(raw.client?.full_name ?? null),
    language,
    submitted: raw.status === "submitted",
    submittedAtLabel: raw.submitted_at
      ? new Intl.DateTimeFormat(intlLocale(language), {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(raw.submitted_at))
      : null,
    revision: raw.revision,
    properties,
    agency: { name: "Benjamín Cousiño Propiedades" },
  };
}
