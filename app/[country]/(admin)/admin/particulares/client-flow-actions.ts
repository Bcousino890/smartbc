"use server";

// ============================================================================
// Captaciones ↔ cliente (2026-10-28). Lo que necesita la pantalla de
// Captaciones para trabajar "para un cliente":
//   · su encargo y dónde está (ficha, enlaces, book);
//   · cómo encaja UN anuncio con ese encargo (y por qué no, si no encaja);
//   · qué anuncios ya están en su ficha / en su book;
//   · captar varios anuncios de la lista (sin exigir coordenadas, como el mapa).
//
// Devuelven { ok:false, error } en vez de lanzar (Next redacta las excepciones
// en producción y el agente no sabría si es un tema de permisos).
// ============================================================================

import { checkPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import { canAccessClientLinks } from "@/lib/db/queries/portal-links";
import { briefFromRow, briefGaps } from "@/lib/clients/brief";
import { describeBrief, type BriefItem } from "@/lib/captaciones-map/brief-view";
import { clientCountryError, normalizeUuid, validateClientAndPinIds } from "@/lib/captaciones-map/capture";
import { evaluateParticularForClient, type ParticularFit } from "@/lib/db/queries/suggested-particulares";
import { parsePortalUrl } from "@/lib/portal-links/portals";
import type { PortalLinkInput } from "@/lib/portal-links/types";
import { addPortalLinks } from "../clientes/portal-links-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

const MAX_IDS = 300;
const KEYS_CHUNK = 50;

type Fail = { ok: false; error: string };

/** Mismos gates que la ruta de sugerencias: clientes + particulares + alcance sobre ese cliente. */
async function gateClient(clientId: unknown): Promise<{ ok: true; clientId: string } | Fail> {
  const cid = normalizeUuid(clientId);
  if (!cid) return { ok: false, error: "Cliente no válido." };
  const a = await checkPermission("clientes", "view");
  if (!a.ok) return { ok: false, error: a.error };
  const b = await checkPermission("particulares", "view");
  if (!b.ok) return { ok: false, error: b.error };
  if (!(await canActOnClient(cid, "clientes", "view"))) return { ok: false, error: "No tienes acceso a este cliente." };
  return { ok: true, clientId: cid };
}

export type ClientContext = {
  id: string;
  name: string;
  email: string | null;
  /** false = cliente de fuera de España: los anuncios scrapeados no se le pueden cruzar. */
  available: boolean;
  hasBrief: boolean;
  items: BriefItem[];
  gaps: Array<{ label: string; level: "essential" | "recommended" }>;
  /** Anuncios en su lista para llamar (enlaces) y cuántos tienen ya ficha. */
  links: { total: number; withProperty: number };
  /** Su borrador de book más reciente (o publicado, si no hay borrador). */
  book: { itineraryId: string; status: string; stops: number } | null;
};

export async function getClientContext(clientId: string): Promise<{ ok: true; context: ClientContext } | Fail> {
  const g = await gateClient(clientId);
  if (!g.ok) return g;
  const d = db();
  const { data: profile } = await d
    .from("profiles")
    .select("id, full_name, email, role, country")
    .eq("id", g.clientId)
    .maybeSingle();
  if (!profile || profile.role !== "client") return { ok: false, error: "Cliente no válido." };

  const [{ data: prefs }, { data: links }, { data: its }] = await Promise.all([
    d.from("client_preferences").select("*").eq("client_id", g.clientId).maybeSingle(),
    d.from("client_portal_links").select("status, property_id").eq("client_id", g.clientId).limit(2000),
    d
      .from("viewing_itineraries")
      .select("id, status, created_at")
      .eq("client_id", g.clientId)
      .in("status", ["draft", "published"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const brief = prefs ? briefFromRow(prefs) : null;
  const linkRows = (links ?? []) as Array<{ status: string; property_id: string | null }>;
  const live = linkRows.filter((l) => l.status !== "discarded");

  // El borrador manda sobre un publicado más reciente: es donde entran los pisos nuevos.
  const itRows = (its ?? []) as Array<{ id: string; status: string }>;
  const it = itRows.find((r) => r.status === "draft") ?? itRows[0] ?? null;
  let book: ClientContext["book"] = null;
  if (it) {
    const { count } = await d.from("viewing_stops").select("id", { count: "exact", head: true }).eq("itinerary_id", it.id);
    book = { itineraryId: it.id, status: it.status, stops: count ?? 0 };
  }

  return {
    ok: true,
    context: {
      id: g.clientId,
      name: (profile.full_name as string | null)?.trim() || (profile.email as string | null) || "Cliente",
      email: profile.email ?? null,
      available: !profile.country || profile.country === "es",
      hasBrief: !!brief,
      items: brief ? describeBrief(brief) : [],
      gaps: brief ? briefGaps(brief).map((x) => ({ label: x.label, level: x.level })) : [],
      links: { total: live.length, withProperty: live.filter((l) => !!l.property_id).length },
      book,
    },
  };
}

/** Cómo encaja UN anuncio con el encargo del cliente, con el motivo si no encaja. */
export async function getParticularFit(
  clientId: string,
  particularId: string,
): Promise<{ ok: true; fit: ParticularFit } | Fail> {
  const g = await gateClient(clientId);
  if (!g.ok) return g;
  const pid = normalizeUuid(particularId);
  if (!pid) return { ok: false, error: "Anuncio no válido." };
  return { ok: true, fit: await evaluateParticularForClient(g.clientId, pid) };
}

/**
 * Dónde está cada anuncio respecto a la ficha del cliente:
 *   none     → no está en su ficha
 *   pending  → en su lista para llamar, la ficha propia aún no se ha creado
 *   property → ya es ficha nuestra (y entra en su selección)
 *   book     → además está en su book (borrador o publicado)
 */
export type FlowState = "none" | "pending" | "property" | "book";

export async function getParticularesFlowStates(
  clientId: string,
  particularIds: string[],
): Promise<{ ok: true; states: Record<string, FlowState> } | Fail> {
  const g = await gateClient(clientId);
  if (!g.ok) return g;
  const check = validateClientAndPinIds(g.clientId, particularIds, MAX_IDS);
  if (!check.ok) return { ok: false, error: check.error };
  const d = db();

  const { data: parts } = await d.from("particulares").select("id, source_url").in("id", check.ids);
  const keyOf = new Map<string, string>(); // particular id → url_key
  for (const p of (parts ?? []) as Array<{ id: string; source_url: string | null }>) {
    const k = p.source_url ? parsePortalUrl(p.source_url)?.urlKey : null;
    if (k) keyOf.set(p.id, k);
  }

  const states: Record<string, FlowState> = Object.fromEntries(check.ids.map((id) => [id, "none" as FlowState]));
  const keys = [...new Set(keyOf.values())];
  const linkByKey = new Map<string, { status: string; property_id: string | null }>();
  for (let i = 0; i < keys.length; i += KEYS_CHUNK) {
    const { data } = await d
      .from("client_portal_links")
      .select("url_key, status, property_id")
      .eq("client_id", g.clientId)
      .in("url_key", keys.slice(i, i + KEYS_CHUNK));
    for (const r of (data ?? []) as Array<{ url_key: string; status: string; property_id: string | null }>) {
      if (r.status !== "discarded") linkByKey.set(r.url_key, r);
    }
  }
  // Ficha propia creada desde la captación, aunque el enlace no exista (p. ej. «Crear propiedad» a mano).
  const { data: props } = await d
    .from("properties")
    .select("id, external_id")
    .in("external_id", check.ids.map((id) => `particular-${id}`));
  const propOf = new Map<string, string>(); // particular id → property id
  for (const r of (props ?? []) as Array<{ id: string; external_id: string }>) propOf.set(r.external_id.replace(/^particular-/, ""), r.id);

  const propertyIds = new Set<string>();
  for (const id of check.ids) {
    const link = keyOf.has(id) ? linkByKey.get(keyOf.get(id) as string) : undefined;
    const pid = link?.property_id ?? propOf.get(id) ?? null;
    if (pid) propertyIds.add(pid);
  }
  // Selección del cliente y paradas de su book para esas propiedades.
  const inBook = new Set<string>();
  if (propertyIds.size) {
    const { data: sels } = await d
      .from("client_property_selections")
      .select("id, property_id")
      .eq("client_id", g.clientId)
      .in("property_id", [...propertyIds]);
    const selByProp = new Map<string, string>(((sels ?? []) as Array<{ id: string; property_id: string }>).map((s) => [s.property_id, s.id]));
    const selIds = [...selByProp.values()];
    const stopSel = new Set<string>();
    if (selIds.length) {
      const { data: stops } = await d
        .from("viewing_stops")
        .select("selection_id, viewing_itineraries!inner(client_id, status)")
        .in("selection_id", selIds)
        .eq("viewing_itineraries.client_id", g.clientId)
        .in("viewing_itineraries.status", ["draft", "published"]);
      for (const s of (stops ?? []) as Array<{ selection_id: string }>) stopSel.add(s.selection_id);
    }
    for (const [prop, sel] of selByProp) if (stopSel.has(sel)) inBook.add(prop);
    for (const id of check.ids) {
      const link = keyOf.has(id) ? linkByKey.get(keyOf.get(id) as string) : undefined;
      const pid = link?.property_id ?? propOf.get(id) ?? null;
      if (pid && selByProp.has(pid)) states[id] = inBook.has(pid) ? "book" : "property";
    }
  }
  for (const id of check.ids) {
    if (states[id] !== "none") continue;
    const link = keyOf.has(id) ? linkByKey.get(keyOf.get(id) as string) : undefined;
    if (link) states[id] = link.property_id ? "property" : "pending";
  }
  return { ok: true, states };
}

/**
 * Capta anuncios de la lista para un cliente: cada uno entra en su ficha como
 * enlace y, en segundo plano, se crea la ficha propia, entra en su selección y
 * en el borrador de su book (lib/portal-links/auto-import.ts). Lee los datos
 * del servidor: el navegador solo manda ids.
 */
export async function captureParticularesForClient(
  clientId: string,
  particularIds: string[],
  scores?: Record<string, number>,
): Promise<{ ok: true; inserted: number; skipped: number } | Fail> {
  const check = validateClientAndPinIds(clientId, particularIds, MAX_IDS);
  if (!check.ok) return { ok: false, error: check.error };
  const a = await checkPermission("particulares", "view");
  if (!a.ok) return { ok: false, error: a.error };
  const b = await checkPermission("viewing_collections", "create");
  if (!b.ok) return { ok: false, error: b.error };
  if (!(await canAccessClientLinks(check.clientId, "view"))) return { ok: false, error: "No tienes acceso a este cliente." };

  const d = db();
  const { data: profile } = await d.from("profiles").select("role, country").eq("id", check.clientId).maybeSingle();
  const countryErr = clientCountryError(profile);
  if (countryErr) return { ok: false, error: countryErr };

  const { data: rows, error } = await d
    .from("particulares")
    .select("id, source_url, title, address, zone, price, operation, bedrooms, bathrooms, square_meters, cover_url")
    .in("id", check.ids)
    .eq("is_active", true);
  if (error) return { ok: false, error: "No se pudieron leer los anuncios. Inténtalo de nuevo." };

  const byId = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.id, r]));
  const links: PortalLinkInput[] = [];
  for (const id of check.ids) {
    const r = byId.get(id);
    if (!r?.source_url) continue;
    const s = scores?.[id];
    links.push({
      url: r.source_url,
      title: r.title || [r.address, r.zone].filter(Boolean).join(", ") || null,
      price: r.price ?? null,
      operation: r.operation === "sale" ? "sale" : r.operation === "rent" ? "rent" : null,
      zone: r.zone ?? null,
      bedrooms: r.bedrooms ?? null,
      bathrooms: r.bathrooms ?? null,
      squareMeters: r.square_meters ?? null,
      imageUrl: r.cover_url ?? null,
      notes: typeof s === "number" && Number.isFinite(s) ? `Captado desde Captaciones (${Math.round(s)}% de encaje)` : "Captado desde Captaciones",
    });
  }
  if (links.length === 0) return { ok: false, error: "Esos anuncios ya no están disponibles o no tienen enlace al portal." };

  const res = await addPortalLinks(check.clientId, links);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, inserted: res.inserted, skipped: res.skipped };
}
