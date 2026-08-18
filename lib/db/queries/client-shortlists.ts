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

const SHORTLIST_SELECT = `
  id, client_id, title, language, country, status, token,
  expires_at, revoked_at, submitted_at, client_updated_at, first_opened_at,
  revision, created_at,
  client:profiles!client_shortlists_client_id_fkey ( full_name ),
  client_shortlist_items (
    id, property_id, origin, decision, rank, client_comment, position,
    decided_at,
    properties!inner ( ${PUBLIC_PROPERTY_SELECT} )
  )
`;

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
        const prop = pickOne<any>(it.properties);
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
        const prop = pickOne<any>(it.properties);
        if (!prop) return null;
        return {
          id: it.id,
          property_id: it.property_id,
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
            priceLabel: cfg.formatPrice(
              Number(prop.price),
              prop.currency,
              prop.operation,
            ),
            bcReference: prop.bc_reference ?? null,
            coverPhotoUrl: coverUrl(prop),
            isArchived: Boolean(prop.archived_at) || prop.status === "archived",
          },
          inSelection: inSelection.has(it.property_id),
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
        const prop = pickOne<any>(it.properties);
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
        };
      })
      .filter(Boolean),
  };
  return { ok: true, shortlist: toPublicClientShortlist(raw) };
}
