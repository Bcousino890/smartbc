import "server-only";
import { createAdminClient } from "../admin";
import { randomToken } from "@/lib/tokens";
import { COLLAB_LINK_TTL_DAYS } from "@/lib/collab/white-label";
import { sanitizeDescriptionForPdf } from "@/lib/pdf/sanitize-description";

/**
 * Enlaces temporales "en blanco" de UNA propiedad para empresas colaboradoras
 * (migración 0231). Ruta pública /colaboracion/{token}.
 *
 * Las tablas nuevas no están en database.types.ts (congelado), por eso se
 * castea a `any` como en el resto de módulos de enlaces.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type CollabOpen = {
  id: string;
  openedAt: string;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  isBot: boolean;
};

export type CollabLinkRow = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  openedCount: number;
  lastOpenedAt: string | null;
  opens: CollabOpen[];
};

export async function createCollabLink(params: {
  propertyId: string;
  createdBy: string | null;
  ttlDays?: number;
}): Promise<{ token: string; expiresAt: string }> {
  const { propertyId, createdBy, ttlDays = COLLAB_LINK_TTL_DAYS } = params;
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db().from("property_collab_links").insert({
    property_id: propertyId,
    token,
    created_by: createdBy,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  return { token, expiresAt };
}

export async function listCollabLinks(propertyId: string): Promise<CollabLinkRow[]> {
  const { data: links, error } = await db()
    .from("property_collab_links")
    .select("id, token, created_at, expires_at, revoked_at, opened_count, last_opened_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = (links ?? []) as any[];
  if (rows.length === 0) return [];

  const { data: opens } = await db()
    .from("property_collab_opens")
    .select("id, link_id, opened_at, ip, user_agent, referer, is_bot")
    .in("link_id", rows.map((l) => l.id))
    .order("opened_at", { ascending: false })
    .limit(300);
  const byLink = new Map<string, CollabOpen[]>();
  for (const o of (opens ?? []) as any[]) {
    const list = byLink.get(o.link_id) ?? [];
    list.push({
      id: o.id,
      openedAt: o.opened_at,
      ip: o.ip ?? null,
      userAgent: o.user_agent ?? null,
      referer: o.referer ?? null,
      isBot: Boolean(o.is_bot),
    });
    byLink.set(o.link_id, list);
  }

  return rows.map((l) => ({
    id: l.id,
    token: l.token,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at ?? null,
    openedCount: l.opened_count ?? 0,
    lastOpenedAt: l.last_opened_at ?? null,
    opens: byLink.get(l.id) ?? [],
  }));
}

export async function revokeCollabLink(linkId: string): Promise<void> {
  const { error } = await db()
    .from("property_collab_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

// Columnas públicas de la propiedad — LÍMITE DE PRIVACIDAD, no una lista de
// conveniencia. El destinatario es de OTRA empresa: nunca añadir aquí slug,
// title (lleva la calle), address*, owner*/contact*, agency_id, source_url,
// bc_reference (lleva las iniciales de BC) ni fotos con marca.
// Las coordenadas SÍ se comparten (decisión del equipo, 2026-10-26): el enlace
// enseña el pin exacto en el mapa.
const PUBLIC_COLUMNS =
  "id, property_reference, operation, price, zone, property_type, bedrooms, bathrooms, square_meters, description, features, latitude, longitude, cover_photo_url, archived_at, property_photos ( url, is_cover, position )";

// Las características que solo repiten un dato que ya sale en la cabecera
// ("125 m² construidos", "3 habitaciones", "2 baños") sobran en la lista.
const DUPLICATE_FEATURE = /^\s*\d+\s*(?:m²|m2|habitaci|dormitor|baño)/i;

export type CollabProperty = {
  reference: string | null;
  operation: "rent" | "sale";
  price: number | null;
  zone: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  description: string;
  features: string[];
  location: { lat: number; lng: number } | null;
  photos: string[];
};

/**
 * Resuelve un token a los datos públicos. null = no existe, caducado,
 * revocado o propiedad archivada (no se distingue el motivo).
 */
export async function getCollabByToken(
  token: string,
): Promise<{ linkId: string; property: CollabProperty } | null> {
  const { data: link, error } = await db()
    .from("property_collab_links")
    .select("id, property_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!link || link.revoked_at) return null;
  if (new Date(link.expires_at) < new Date()) return null;

  const { data: p } = await db()
    .from("properties")
    .select(PUBLIC_COLUMNS)
    .eq("id", link.property_id)
    .maybeSingle();
  if (!p || p.archived_at) return null;

  const photos = ((p.property_photos ?? []) as Array<{ url: string; is_cover: boolean; position: number }>)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((ph) => ph.url);
  const cover = p.cover_photo_url as string | null;
  const ordered = cover ? [cover, ...photos.filter((u) => u !== cover)] : photos;

  return {
    linkId: link.id,
    property: {
      reference: p.property_reference ?? null,
      operation: p.operation === "rent" ? "rent" : "sale",
      price: p.price != null ? Number(p.price) : null,
      zone: p.zone ?? null,
      propertyType: p.property_type ?? null,
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      squareMeters: p.square_meters ?? null,
      description: sanitizeDescriptionForPdf(p.description),
      features: Array.isArray(p.features)
        ? (p.features as string[]).filter((f) => typeof f === "string" && f.trim() && !DUPLICATE_FEATURE.test(f))
        : [],
      location:
        typeof p.latitude === "number" && typeof p.longitude === "number" &&
        Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180
          ? { lat: p.latitude, lng: p.longitude }
          : null,
      photos: ordered,
    },
  };
}

/**
 * Registra una apertura (IP, navegador, procedencia). Las vistas previas de
 * mensajería y los robots se guardan con `is_bot` pero no suben el contador.
 * Fire-and-forget desde la página: nunca debe bloquear el render.
 */
export async function recordCollabOpen(
  linkId: string,
  info: { ip: string | null; userAgent: string | null; referer: string | null; isBot: boolean },
): Promise<void> {
  const supabase = db();
  await supabase.from("property_collab_opens").insert({
    link_id: linkId,
    ip: info.ip,
    user_agent: info.userAgent?.slice(0, 400) ?? null,
    referer: info.referer?.slice(0, 400) ?? null,
    is_bot: info.isBot,
  });
  if (info.isBot) return;
  const { data } = await supabase
    .from("property_collab_links")
    .select("opened_count")
    .eq("id", linkId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("property_collab_links")
    .update({ opened_count: (data.opened_count ?? 0) + 1, last_opened_at: new Date().toISOString() })
    .eq("id", linkId);
}
