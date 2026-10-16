import "server-only";
import { createAdminClient } from "../admin";
import type {
  AgencyMatchInfo,
  LinkedAd,
  LinkedChange,
  LinkInfo,
  ParticularLinksPayload,
} from "@/lib/particulares/links-types";
import { buildAgencyWebSources } from "@/lib/particulares/agency-web";
import { loadAgencyWebCache } from "@/lib/particulares/agency-web-runner";
import { isCollaboratingAgency } from "@/lib/particulares/source-kind";

/**
 * Datos de la ficha unificada de un particular (migración 0176): todos los
 * anuncios del MISMO inmueble (venta + alquiler + portales), los posibles
 * gemelos por confirmar y los otros anuncios del mismo contacto.
 *
 * Solo lectura. Si la migración aún no está aplicada devuelve null y el modal
 * simplemente no enseña la sección.
 */

const AD_COLUMNS =
  "id, portal, external_id, source_url, operation, price, is_active, taken_down_at, phone, owner_name, zone, address, bedrooms, bathrooms, square_meters, cover_url, photos, created_at, particular_reference, reference, advertiser_type, price_history:scraper_extra->price_history, agency_url:scraper_extra->>agency_url, agency_reference:scraper_extra->>agency_reference, portal_id:scraper_extra->>portal_id";

const LEVEL_RANK: Record<string, number> = { cierto: 3, probable: 2, informativo: 1 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAd(row: any, link: LinkInfo | null, withPhotos: boolean): LinkedAd {
  const photos: Array<{ url: string }> = Array.isArray(row.photos)
    ? row.photos
        .map((p: unknown) => (typeof p === "string" ? { url: p } : (p as { url?: string })))
        .filter((p: { url?: string }) => !!p?.url)
        .map((p: { url?: string }) => ({ url: p.url as string }))
    : [];
  return {
    id: row.id,
    portal: row.portal,
    external_id: row.external_id,
    source_url: row.source_url,
    operation: row.operation ?? null,
    price: row.price ?? null,
    is_active: !!row.is_active,
    taken_down_at: row.taken_down_at ?? null,
    phone: row.phone ?? null,
    owner_name: row.owner_name ?? null,
    zone: row.zone ?? null,
    address: row.address ?? null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    square_meters: row.square_meters ?? null,
    cover_url: row.cover_url ?? photos[0]?.url ?? null,
    // Solo URLs (≈100 B cada una): el selector de fuente de fotos de la ficha necesita todas.
    photos: withPhotos ? photos.slice(0, 150) : [],
    n_photos: photos.length,
    created_at: row.created_at ?? null,
    particular_reference: row.particular_reference ?? null,
    reference: row.reference ?? null,
    agency_reference: row.agency_reference ?? null,
    agency_url: row.agency_url ?? null,
    portal_id: row.portal_id ?? null,
    advertiser_type: row.advertiser_type ?? null,
    price_history: Array.isArray(row.price_history)
      ? (row.price_history as unknown[]).flatMap((e) =>
          Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "number" ? [[e[0], e[1]] as [string, number]] : [],
        )
      : [],
    link,
  };
}

export async function getParticularLinks(id: string): Promise<ParticularLinksPayload | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const self = await db.from("particulares").select("id, duplicate_of").eq("id", id).maybeSingle();
  if (self.error) return null; // migración sin aplicar (columna inexistente)
  if (!self.data) return null;
  const rootId: string = self.data.duplicate_of ?? self.data.id;

  const grouped = await db
    .from("particulares")
    .select(AD_COLUMNS)
    .or(`id.eq.${rootId},duplicate_of.eq.${rootId}`);
  if (grouped.error) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = grouped.data ?? [];
  const memberIds = rows.map((r) => r.id as string);
  if (memberIds.length === 0) return null;
  const inGroup = new Set(memberIds);

  // Enlaces que tocan a cualquier miembro (el máximo en un grupo es 12).
  const idList = memberIds.join(",");
  const linksRes = await db
    .from("particulares_links")
    .select("id, a_id, b_id, relation, level, rule, status, evidence, score")
    .or(`a_id.in.(${idList}),b_id.in.(${idList})`)
    .neq("status", "descartado");
  if (linksRes.error) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links: any[] = linksRes.data ?? [];

  const info = (l: { id: string; level: string; relation: string; rule: string; status: string; evidence: unknown }): LinkInfo => ({
    id: l.id,
    level: l.level as LinkInfo["level"],
    relation: l.relation as LinkInfo["relation"],
    rule: l.rule,
    status: l.status as LinkInfo["status"],
    evidence: (l.evidence ?? {}) as Record<string, unknown>,
  });

  // El mejor enlace de cada miembro con OTRO miembro (para decir por qué está en la ficha).
  const best = new Map<string, LinkInfo>();
  for (const l of links) {
    if (l.relation !== "mismo_inmueble") continue;
    if (!(inGroup.has(l.a_id) && inGroup.has(l.b_id))) continue;
    for (const me of [l.a_id, l.b_id]) {
      const cur = best.get(me);
      if (!cur || (LEVEL_RANK[l.level] ?? 0) > (LEVEL_RANK[cur.level] ?? 0)) best.set(me, info(l));
    }
  }

  // Sugerencias y "mismo contacto": el otro extremo está FUERA del grupo.
  const outside = new Map<string, LinkInfo>();
  const sameContact = new Map<string, LinkInfo>();
  for (const l of links) {
    const aIn = inGroup.has(l.a_id);
    const bIn = inGroup.has(l.b_id);
    if (aIn === bIn) continue;
    const other: string = aIn ? l.b_id : l.a_id;
    if (l.relation === "mismo_inmueble" && l.level === "probable") outside.set(other, info(l));
    else if (l.relation === "mismo_contacto") sameContact.set(other, info(l));
  }
  const otherIds = [...new Set([...outside.keys(), ...sameContact.keys()])].slice(0, 30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let others: any[] = [];
  if (otherIds.length > 0) {
    const o = await db.from("particulares").select(AD_COLUMNS).in("id", otherIds);
    others = o.data ?? [];
  }

  const members = rows
    .map((r) => toAd(r, best.get(r.id) ?? null, true))
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        (a.operation ?? "").localeCompare(b.operation ?? "") ||
        a.portal.localeCompare(b.portal),
    );
  const suggestions = others
    .filter((r) => outside.has(r.id))
    .map((r) => toAd(r, outside.get(r.id) as LinkInfo, false));
  const same_contact = others
    .filter((r) => sameContact.has(r.id) && !outside.has(r.id))
    .map((r) => toAd(r, sameContact.get(r.id) as LinkInfo, false))
    .slice(0, 10);

  // Contactos distintos del inmueble (la pareja, otro teléfono, otro nombre…).
  const byContact = new Map<string, { phone: string | null; name: string | null; portals: Set<string> }>();
  for (const m of members) {
    const key = `${(m.phone ?? "").replace(/\D/g, "")}|${(m.owner_name ?? "").trim().toLowerCase()}`;
    if (key === "|") continue;
    const e = byContact.get(key) ?? { phone: m.phone, name: m.owner_name, portals: new Set<string>() };
    e.portals.add(m.portal);
    byContact.set(key, e);
  }
  const contacts = [...byContact.values()].map((c) => ({ phone: c.phone, name: c.name, portals: [...c.portals].sort() }));

  // Historial de todas las fuentes del inmueble (para la pestaña «Histórico»).
  let changes: LinkedChange[] = [];
  const ch = await db
    .from("particulares_changes")
    .select("particular_id, change_type, old_value, new_value, changed_at")
    .in("particular_id", memberIds)
    .in("change_type", ["new_listing", "price_up", "price_down", "price_change", "deleted", "reactivated"])
    .order("changed_at", { ascending: false })
    .limit(600);
  if (!ch.error) changes = (ch.data ?? []) as LinkedChange[];

  // Propiedades de agencias del CRM que son el mismo piso (migración 0199; si no existe, vacío).
  const agency_matches = await getAgencyMatches(db, memberIds);

  // Webs propias de las agencias anunciantes (enlace adicional del portal) + lo ya leído (0203; sin tabla, solo la URL).
  let agency_webs: ParticularLinksPayload["agency_webs"] = [];
  try {
    const cache = await loadAgencyWebCache(db, members.map((m) => m.agency_url));
    agency_webs = buildAgencyWebSources(members, cache ?? new Map());
  } catch {
    agency_webs = [];
  }

  return { root_id: rootId, members, suggestions, same_contact, contacts, changes, agency_matches, agency_webs };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAgencyMatches(db: any, memberIds: string[]): Promise<AgencyMatchInfo[]> {
  const res = await db
    .from("particulares_agency_matches")
    .select("id, particular_id, property_id, level, status, rule, evidence")
    .in("particular_id", memberIds)
    .neq("status", "descartado");
  if (res.error || !res.data?.length) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: any[] = res.data;
  const props = await db
    .from("properties")
    .select(
      "id, slug, title, operation, status, price, address, square_meters, bedrooms, bathrooms, external_id, property_reference, bc_reference, agency_id, agencies(name, slug)",
    )
    .in("id", [...new Set(matches.map((m) => m.property_id as string))]);
  if (props.error) return [];
  // Colaboradora = con feed de sindicación (`agency_feeds`); «Portales externos» no lo es.
  const feedRes = await db.from("agency_feeds").select("agency_id");
  const feeds: Set<string> | null = feedRes.error ? null : new Set((feedRes.data ?? []).map((r: { agency_id: string }) => r.agency_id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>((props.data ?? []).map((p: any) => [p.id, p]));
  return matches
    .flatMap((m): AgencyMatchInfo[] => {
      const p = byId.get(m.property_id);
      if (!p) return [];
      const ag = Array.isArray(p.agencies) ? p.agencies[0] : p.agencies;
      return [
        {
          id: m.id,
          particular_id: m.particular_id,
          property_id: m.property_id,
          level: m.level,
          status: m.status,
          rule: m.rule,
          evidence: m.evidence ?? {},
          property: {
            slug: p.slug ?? null,
            title: p.title ?? null,
            agency_name: ag?.name ?? null,
            agency_collab: isCollaboratingAgency({ hasFeed: feeds && p.agency_id ? feeds.has(p.agency_id) : null, slug: ag?.slug }),
            reference: p.property_reference ?? p.bc_reference ?? p.external_id ?? null,
            operation: p.operation ?? null,
            price: p.price == null ? null : Number(p.price),
            status: p.status ?? null,
            address: p.address ?? null,
            square_meters: p.square_meters ?? null,
            bedrooms: p.bedrooms ?? null,
            bathrooms: p.bathrooms ?? null,
          },
        },
      ];
    })
    .sort((a, b) => Number(b.level === "cierto") - Number(a.level === "cierto"));
}
