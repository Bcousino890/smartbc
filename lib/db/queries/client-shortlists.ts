import "server-only";

// ============================================================================
// Private Client Shortlist · lecturas de servidor.
//
// Dos superficies muy distintas conviven aquí:
//
//   · PÚBLICA  — se resuelve SIEMPRE desde el token, jamás desde un id que
//     venga del navegador, y devuelve un contrato proyectado.
//   · PANEL    — pasa por los permisos del agente, como el resto del CRM.
// ============================================================================

import { createAdminClient } from "../admin";
import { checkPermission } from "@/lib/auth/guard";
import type {
  PublicShortlistResult,
} from "@/lib/client-shortlist/public-contract";
import {
  toPublicClientShortlist,
  compareShortlistItems,
  shortlistZoneLabel,
  type RawShortlist,
} from "@/lib/client-shortlist/to-public";
import {
  linkStateOf,
  type ShortlistWithItems,
} from "@/lib/client-shortlist/types";
import { editorialResidenceTitle } from "@/lib/viewing-collections/to-public";
import { getCountryConfig, isCountry } from "@/lib/country-config";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** Columnas de propiedad que puede ver el cliente. Lo que no se pide, no se
 *  puede filtrar por descuido: aquí no hay owner_*, ni source_url, ni notas. */
const PUBLIC_PROPERTY_SELECT = `
  id, slug, title, zone, subzone, bedrooms, bathrooms, square_meters,
  price, currency, operation, status, archived_at, bc_reference,
  last_synced_at, updated_at,
  property_photos ( url, position )
`;

/** Lo que se puede enseñar de un anuncio que TODAVÍA no es ficha nuestra.
 *  Nunca la url ni el portal: el cliente no tiene por qué saber que esto sale
 *  de un anuncio ajeno, y menos aún poder ir a verlo por su cuenta. */
const PUBLIC_PORTAL_LINK_SELECT = `
  id, title, price, price_label, operation, zone,
  bedrooms, bathrooms, square_meters, image_url, portal, external_ref
`;

// ⚠️ `properties` va SIN `!inner`. Con el inner join, PostgREST descartaba en
// silencio todo item cuyo property_id fuera null — es decir, todos los que son
// un enlace de portal. El shortlist salía vacío o a medias sin un solo error.
const SHORTLIST_SELECT = `
  id, client_id, title, language, country, status, token,
  expires_at, revoked_at, submitted_at, client_updated_at, first_opened_at,
  revision, created_at,
  client:profiles!client_shortlists_client_id_fkey ( full_name ),
  client_shortlist_items (
    id, property_id, portal_link_id, origin, decision, rank, client_comment,
    position, decided_at,
    properties ( ${PUBLIC_PROPERTY_SELECT} ),
    client_portal_links ( ${PUBLIC_PORTAL_LINK_SELECT} )
  )
`;

/**
 * Un anuncio de portal disfrazado de propiedad, para que el proyector no tenga
 * que saber que existen dos fuentes. Lo que no tenemos va a null en vez de a
 * cero: "0 baños" en la tarjeta de un cliente parece un dato, y es un hueco.
 *
 * ⚠️ El título es la EXCEPCIÓN a esa regla: no puede ir a null. Un enlace
 * pegado a mano sin previsualizar (una URL suelta, sin scraping) no trae
 * título, y una tarjeta sin foto Y sin título es indistinguible de una
 * rota — el cliente ve un rectángulo gris con «BCP» y nada más. Con algo que
 * leer («Idealista · 111905585») sigue siendo una tarjeta pobre, pero se
 * entiende que es un anuncio pendiente de revisar, no un fallo.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function portalLinkAsProperty(link: any) {
  // ⚠️ NO se fabrica «Idealista · 111905585»: eso delata el portal de origen
  // al cliente, que es justo lo que el contrato público prohíbe. Sin título se
  // deja vacío y la proyección construye uno con la zona («Residencia en
  // Chamberí»), que se lee igual de bien y no cuenta de dónde salió.
  const title = (link.title as string | null)?.trim() || "";
  return {
    id: link.id,
    // Sin ficha no hay slug, y sin slug no hay proxy de fotos: por eso las
    // suyas viajan aparte, en externalPhotoUrls.
    slug: "",
    title,
    zone: link.zone ?? "",
    subzone: null,
    // bedrooms=0 es un dato real (estudio de un ambiente): se deja tal cual.
    bedrooms: link.bedrooms ?? null,
    // bathrooms=0 y square_meters=0 no existen en un piso real: es lo que la
    // extensión no capturó, guardado como 0 en vez de NULL. `??` no lo
    // convierte (0 no es nullish), así que aquí SÍ hace falta el `||` para
    // que "0 baños"/"0 m²" no se cuele como si fuera un dato de verdad.
    bathrooms: link.bathrooms || null,
    square_meters: link.square_meters || null,
    price: link.price == null ? null : Number(link.price),
    currency: null,
    operation: link.operation ?? "rent",
    status: "available",
    archived_at: null,
    // La referencia BC-#### solo existe cuando la propiedad es nuestra.
    bc_reference: null,
    property_photos: null,
  };
}

/**
 * Resuelve un shortlist por su token PARA ESCRITURA.
 *
 * Devuelve la fila cruda mínima, sin proyectar. Es el único punto por el que
 * entran las mutaciones públicas: si esto dice que no, no se escribe nada.
 * Caducado, revocado e inexistente devuelven lo mismo — null.
 */
export async function resolveShortlistByToken(
  token: string,
): Promise<{ id: string; clientId: string; country: string; revision: number } | null> {
  if (!token || token.length < 16 || token.length > 64) return null;

  const { data } = await db()
    .from("client_shortlists")
    .select("id, client_id, country, revision, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  if (linkStateOf(data) !== "active") return null;

  return {
    id: data.id,
    clientId: data.client_id,
    country: data.country,
    revision: data.revision,
  };
}

/** Lectura pública: el contrato proyectado, o un no rotundo. */
export async function getPublicShortlistByToken(
  token: string,
): Promise<PublicShortlistResult> {
  if (!token || token.length < 16 || token.length > 64) return { ok: false };

  const { data } = await db()
    .from("client_shortlists")
    .select(SHORTLIST_SELECT)
    .eq("token", token)
    .maybeSingle();

  if (!data) return { ok: false };
  if (linkStateOf(data) !== "active") return { ok: false };

  const raw: RawShortlist = {
    client: pickOne(data.client),
    language: data.language,
    country: data.country,
    status: data.status,
    submitted_at: data.submitted_at,
    revision: data.revision,
    items: (data.client_shortlist_items ?? [])
      .map((it: any) => {
        const link = pickOne<any>(it.client_portal_links);
        const prop = link
          ? portalLinkAsProperty(link)
          : pickOne<any>(it.properties);
        if (!prop) return null;
        // Una propiedad archivada deja de mostrarse: el cliente no debe
        // priorizar algo que ya no se puede visitar.
        if (prop.archived_at || prop.status === "archived") return null;
        return {
          id: it.id,
          origin: it.origin,
          decision: it.decision,
          rank: it.rank,
          client_comment: it.client_comment,
          position: it.position,
          property: prop,
          ...(link
            ? { externalPhotoUrls: link.image_url ? [link.image_url] : [] }
            : {}),
        };
      })
      .filter(Boolean),
  };

  return { ok: true, shortlist: toPublicClientShortlist(raw) };
}

/** Marca la primera apertura. Best-effort: nunca bloquea el render. */
export async function markShortlistOpened(token: string): Promise<void> {
  try {
    await db()
      .from("client_shortlists")
      .update({ first_opened_at: new Date().toISOString() })
      .eq("token", token)
      .is("first_opened_at", null);
  } catch {
    /* la apertura es un dato de apoyo, no una garantía */
  }
}

// ─── Panel ───────────────────────────────────────────────────────────────────

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Mismo versionado de portada que usa la superficie pública. */
function hashStrings(parts: string[]): string {
  let h = 5381;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h = ((h << 5) + h + part.charCodeAt(i)) | 0;
    }
  }
  return (h >>> 0).toString(36);
}

function coverUrl(prop: any): string | null {
  const photos = (prop.property_photos ?? [])
    .slice()
    .sort((a: any, b: any) => a.position - b.position);
  if (!photos.length || !prop.slug) return null;
  const v = hashStrings([
    ...photos.map((p: any) => p.url),
    prop.last_synced_at ?? prop.updated_at ?? "",
  ]);
  return `/p/${prop.slug}/0?v=${v}`;
}

/**
 * Los shortlists de un cliente, para su ficha. Ordenados del más reciente al
 * más antiguo: pueden existir varios a lo largo del tiempo.
 */
export async function getClientShortlists(
  clientId: string,
): Promise<ShortlistWithItems[]> {
  const gate = await checkPermission("viewing_collections", "view");
  if (!gate.ok) return [];

  const { data } = await db()
    .from("client_shortlists")
    .select(SHORTLIST_SELECT)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  // ¿Cuáles están ya en la selección de BCP? Se resuelve de una vez para no
  // consultar por item.
  const { data: sel } = await db()
    .from("client_property_selections")
    .select("property_id")
    .eq("client_id", clientId);
  const inSelection = new Set((sel ?? []).map((s: any) => s.property_id));

  return rows.map((row) => {
    const country = isCountry(row.country) ? row.country : "es";
    const cfg = getCountryConfig(country);

    const items = (row.client_shortlist_items ?? [])
      .map((it: any) => {
        // Dos fuentes posibles: ficha nuestra o anuncio de portal todavía sin
        // ficha. El panel las muestra igual; lo que cambia es que del enlace
        // no hay slug al que enlazar ni referencia BC-####.
        const link = pickOne<any>(it.client_portal_links);
        const prop = link
          ? portalLinkAsProperty(link)
          : pickOne<any>(it.properties);
        if (!prop) return null;
        return {
          id: it.id,
          property_id: it.property_id,
          portal_link_id: it.portal_link_id ?? null,
          origin: it.origin,
          decision: it.decision,
          rank: it.rank,
          client_comment: it.client_comment,
          position: it.position,
          decided_at: it.decided_at,
          property: {
            id: prop.id,
            slug: prop.slug,
            title: prop.title,
            displayTitle: editorialResidenceTitle(prop.title),
            zoneLabel: shortlistZoneLabel(prop),
            priceLabel: link
              ? (link.price_label ??
                cfg.formatPrice(prop.price, null, prop.operation))
              : cfg.formatPrice(Number(prop.price), prop.currency, prop.operation),
            bcReference: prop.bc_reference ?? null,
            coverPhotoUrl: link ? (link.image_url ?? null) : coverUrl(prop),
            isArchived: Boolean(prop.archived_at) || prop.status === "archived",
            /** Sin ficha todavía: el panel lo dice y no ofrece "Ver ficha". */
            pendingProperty: Boolean(link),
          },
          inSelection: it.property_id
            ? inSelection.has(it.property_id)
            : false,
        };
      })
      .filter(Boolean)
      .sort(compareShortlistItems);

    const counts = {
      total: items.length,
      decided: items.filter((i: any) => i.decision !== "undecided").length,
      mustVisit: items.filter((i: any) => i.decision === "must_visit").length,
      maybe: items.filter((i: any) => i.decision === "maybe").length,
      notForMe: items.filter((i: any) => i.decision === "not_for_me").length,
    };

    return {
      id: row.id,
      client_id: row.client_id,
      title: row.title,
      language: row.language,
      country,
      status: row.status,
      token: row.token,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at,
      submitted_at: row.submitted_at,
      client_updated_at: row.client_updated_at,
      first_opened_at: row.first_opened_at,
      revision: row.revision,
      created_at: row.created_at,
      linkState: linkStateOf(row),
      updatedAfterSubmit: Boolean(
        row.submitted_at &&
          row.client_updated_at &&
          new Date(row.client_updated_at) > new Date(row.submitted_at),
      ),
      counts,
      items,
    } as ShortlistWithItems;
  });
}

/** Previsualización del agente: lo mismo que verá el cliente, sin instrumentar. */
export async function getShortlistPreview(
  shortlistId: string,
): Promise<PublicShortlistResult> {
  const gate = await checkPermission("viewing_collections", "view");
  if (!gate.ok) return { ok: false };

  const { data } = await db()
    .from("client_shortlists")
    .select(SHORTLIST_SELECT)
    .eq("id", shortlistId)
    .maybeSingle();
  if (!data) return { ok: false };

  const raw: RawShortlist = {
    client: pickOne(data.client),
    language: data.language,
    country: data.country,
    status: data.status,
    submitted_at: data.submitted_at,
    revision: data.revision,
    items: (data.client_shortlist_items ?? [])
      .map((it: any) => {
        // La previsualización del agente tiene que enseñar EXACTAMENTE lo
        // mismo que verá el cliente, enlaces de portal incluidos.
        const link = pickOne<any>(it.client_portal_links);
        const prop = link
          ? portalLinkAsProperty(link)
          : pickOne<any>(it.properties);
        if (!prop) return null;
        if (prop.archived_at || prop.status === "archived") return null;
        return {
          id: it.id,
          origin: it.origin,
          decision: it.decision,
          rank: it.rank,
          client_comment: it.client_comment,
          position: it.position,
          property: prop,
          ...(link
            ? { externalPhotoUrls: link.image_url ? [link.image_url] : [] }
            : {}),
        };
      })
      .filter(Boolean),
  };
  return { ok: true, shortlist: toPublicClientShortlist(raw) };
}
