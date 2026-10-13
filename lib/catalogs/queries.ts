import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { catalogNumberLabel, editionLabel, operationLabel, priceLabel } from "./format";
import { DEFAULT_CRITERIA, normalizeCriteria, type CatalogCriteria } from "./criteria";
import { explainProperty, INCLUDED_UNAVAILABLE } from "./explain";
import { type AdjustmentKind, type CandidateProperty, type Via } from "./selection";
import { coverPhotoOf, type InternalSnapshot } from "./to-public";
import type { CatalogAdView, CatalogCoverState, CatalogDetail, CatalogItemView, CatalogSummary, CoverPhotoOption } from "./types";

// ============================================================================
// Lecturas de la HOME y de la gestión de catálogos (BCP-01). Siempre filtradas
// por el dueño (owner_id = id del perfil que ya pasó la guarda). Solo LEEN de
// properties: ninguna de estas funciones escribe fuera de las tablas del
// catálogo (y estas, ni eso: son lecturas).
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export function coverPhotoUrl(slug: string | null | undefined, width = 640): string | null {
  return slug ? `/p/${encodeURIComponent(slug)}/0.webp?w=${width}` : null;
}

export async function listOwnerCatalogs(ownerId: string): Promise<CatalogSummary[]> {
  const { data: cats, error } = await db()
    .from("catalogs")
    .select("id, title, intro, status, version, created_at, updated_at, contact_name, mode, criteria")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error || !cats?.length) return [];

  const ids = cats.map((c: any) => c.id);
  const { data: items } = await db()
    .from("catalog_items")
    .select("catalog_id, position, properties(slug)")
    .in("catalog_id", ids)
    .order("position", { ascending: true });

  const adsByCatalog = await listCatalogAds(ids);
  const count = new Map<string, number>();
  const firstSlug = new Map<string, string>();
  for (const it of (items ?? []) as any[]) {
    count.set(it.catalog_id, (count.get(it.catalog_id) ?? 0) + 1);
    if (!firstSlug.has(it.catalog_id) && it.properties?.slug) firstSlug.set(it.catalog_id, it.properties.slug);
  }
  // Portada (C1) y, en automático, el número de viviendas: de la MISMA
  // instantánea que lee el lector, para que la HOME enseñe la misma portada.
  // Uno por uno: son pocos y la consulta ya está medida (X6/Y5).
  const cover = new Map<string, string | null>();
  for (const c of cats as any[]) {
    const snap = await internalSnapshot(c.id);
    if (!snap) continue;
    const photo = coverPhotoOf(snap);
    cover.set(c.id, photo ? `${photo}?w=640` : null);
    if (c.mode === "auto") count.set(c.id, (snap.items ?? []).filter((it) => it && it.status !== "sold" && it.status !== "archived").length);
  }

  const summaries: CatalogSummary[] = cats.map((c: any, i: number) => ({
    id: c.id,
    title: c.title,
    intro: c.intro ?? null,
    status: c.status === "archived" ? "archived" : "active",
    version: Number(c.version),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    itemCount: count.get(c.id) ?? 0,
    numberLabel: catalogNumberLabel(i + 1),
    edition: editionLabel(new Date(c.created_at)),
    coverPhotoUrl: cover.has(c.id) ? cover.get(c.id) ?? null : coverPhotoUrl(firstSlug.get(c.id)),
    contactName: c.contact_name ?? null,
    mode: c.mode === "auto" ? "auto" : "manual",
    criteria: criteriaOf(c.criteria),
    ads: adsByCatalog.get(c.id) ?? [],
  }));

  // Activos primero, y dentro de cada grupo lo último que se tocó.
  return summaries.sort((a, b) =>
    a.status !== b.status ? (a.status === "active" ? -1 : 1) : b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** Instantánea interna de un catálogo (la del lector). Solo para catálogos
 *  que ya se han leído filtrando por el dueño. */
async function internalSnapshot(catalogId: string): Promise<InternalSnapshot | null> {
  const { data, error } = await db().rpc("catalog_internal_snapshot", { p_catalog: catalogId });
  if (error || !data) return null;
  return data as InternalSnapshot;
}

function criteriaOf(raw: unknown): CatalogCriteria {
  const n = normalizeCriteria(raw);
  return n.ok ? n.criteria : { ...DEFAULT_CRITERIA, zones: [] };
}

const PROPERTY_VIEW_COLUMNS =
  "id, slug, title, zone, subzone, bc_reference, status, archived_at, country, created_at, operation, operations, price, rent_price, currency, bedrooms, bathrooms, square_meters, property_photos(count)";

/** Los datos que usan la selección y la explicación (C1). */
function toCandidate(p: any): CandidateProperty {
  const photos = Array.isArray(p.property_photos) ? Number(p.property_photos[0]?.count ?? 0) : 0;
  return {
    id: p.id,
    country: p.country ?? "es",
    archived_at: p.archived_at ?? null,
    status: String(p.status ?? ""),
    operation: p.operation === "rent" ? "rent" : "sale",
    operations: Array.isArray(p.operations) ? p.operations : [],
    price: p.price === null || p.price === undefined ? null : Number(p.price),
    rent_price: p.rent_price === null || p.rent_price === undefined ? null : Number(p.rent_price),
    zone: p.zone ?? null,
    subzone: p.subzone ?? null,
    created_at: p.created_at ?? "",
    photo_count: photos,
    bc_reference: p.bc_reference ?? null,
    title: p.title ?? null,
  };
}

/** Explicación de gestión (C1) para una vivienda, con su ajuste. */
type ExplainCtx = { criteria: CatalogCriteria; adjustments: Map<string, AdjustmentKind>; via?: Map<string, Via> };

function toItemView(p: any, position: number): CatalogItemView {
  return {
    propertyId: p.id,
    position,
    slug: p.slug,
    bcReference: p.bc_reference ?? null,
    title: p.title,
    zone: [p.subzone, p.zone].filter(Boolean).join(", ") || null,
    status: p.archived_at ? "archived" : (p.status as CatalogItemView["status"]),
    operation: operationLabel(p.operation, p.operations),
    price: priceLabel({
      operation: p.operation,
      operations: p.operations,
      price: p.price,
      rentPrice: p.rent_price,
      currency: p.currency,
    }),
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    squareMeters: p.square_meters ?? null,
    photoUrl: coverPhotoUrl(p.slug, 320),
  };
}

/** Vistas de propiedades en el orden de `ids` (solo lectura). Con `ctx`,
 *  cada una lleva su explicación y su ajuste (solo gestión). */
export async function propertyViews(ids: string[], ctx?: ExplainCtx): Promise<CatalogItemView[]> {
  if (ids.length === 0) return [];
  const { data } = await db().from("properties").select(PROPERTY_VIEW_COLUMNS).in("id", ids);
  const byId = new Map(((data ?? []) as any[]).map((p) => [p.id, p]));
  return ids.flatMap((id, i) => {
    const p = byId.get(id);
    if (!p) return [];
    const view = toItemView(p, (i + 1) * 100);
    if (!ctx) return [view];
    const adjustment = ctx.adjustments.get(id) ?? null;
    return [{ ...view, adjustment, via: ctx.via?.get(id), explain: explainProperty(toCandidate(p), ctx.criteria, adjustment) }];
  });
}

/** Ajustes guardados de un catálogo (C1). */
async function catalogAdjustments(catalogId: string): Promise<Map<string, AdjustmentKind>> {
  const { data } = await db().from("catalog_adjustments").select("property_id, kind").eq("catalog_id", catalogId);
  return new Map(((data ?? []) as any[]).map((r) => [r.property_id as string, r.kind as AdjustmentKind]));
}

/** Resultado automático (con unos criterios dados o los guardados). Pasa por
 *  catalog_auto_preview, que comprueba el dueño en la base de datos. Cada
 *  vivienda lleva cómo entró (`via`) y su explicación (solo gestión). */
export async function autoSelection(
  ownerId: string,
  catalogId: string,
  criteria: CatalogCriteria | null,
): Promise<{ items: CatalogItemView[]; total: number; matched: number }> {
  const { data, error } = await db().rpc("catalog_auto_preview", {
    p_actor: ownerId,
    p_catalog: catalogId,
    p_criteria: criteria,
  });
  if (error) throw new Error(`catalog_auto_preview: ${error.message}`);
  const rows = ((data ?? []) as any[]).sort((a, b) => Number(a.ord) - Number(b.ord));
  let crit = criteria;
  if (!crit) {
    const { data: cat } = await db().from("catalogs").select("criteria").eq("id", catalogId).maybeSingle();
    crit = criteriaOf(cat?.criteria);
  }
  const ctx: ExplainCtx = {
    criteria: crit,
    adjustments: await catalogAdjustments(catalogId),
    via: new Map(rows.map((r) => [r.property_id as string, r.via as Via])),
  };
  return {
    items: await propertyViews(rows.map((r) => r.property_id), ctx),
    total: rows.length ? Number(rows[0].total) : 0,
    matched: rows.length ? Number(rows[0].matched ?? rows[0].total) : 0,
  };
}

/** Estado de la portada (C1): la elección guardada, la foto que ve hoy el
 *  lector (misma instantánea) y los avisos. */
async function coverState(catalogId: string, cat: any, snap: InternalSnapshot | null): Promise<CatalogCoverState> {
  const chosenPropertyId: string | null = cat.cover_property_id ?? null;
  const chosenPhotoId: string | null = cat.cover_photo_id ?? null;
  const photo = snap ? coverPhotoOf(snap) : null;
  const warnings: string[] = [];
  const items = (snap?.items ?? []).filter((it) => it && it.status !== "sold" && it.status !== "archived");
  if (items.length === 0) warnings.push("El catálogo está vacío: la portada sale sin foto.");
  if (chosenPropertyId && snap) {
    const key = snap.cover?.key ?? null;
    if (key === null) {
      warnings.push("La vivienda elegida para la portada ya no está en el catálogo: se usa la primera vivienda con foto.");
    } else {
      const it = items.find((x) => String(x.key) === key);
      if (it && (it.photos ?? []).length === 0) warnings.push("La vivienda elegida no tiene fotos: se usa la primera vivienda con foto.");
      else if (chosenPhotoId && !snap.cover?.photo) warnings.push("La foto elegida ya no existe: se usa la foto de portada de esa vivienda.");
    }
  }
  return { chosenPropertyId, chosenPhotoId, effectivePhotoUrl: photo ? `${photo}?w=640` : null, warnings };
}

/** Fotos de una vivienda para elegir portada, con la URL del proxy neutro
 *  (mismo índice que el lector: orden por posición, sin URL repetidas). */
export async function listCoverPhotos(catalogId: string, propertyId: string): Promise<CoverPhotoOption[]> {
  void catalogId;
  const { data: prop } = await db().from("properties").select("slug").eq("id", propertyId).maybeSingle();
  if (!prop?.slug) return [];
  const { data } = await db()
    .from("property_photos")
    .select("id, url, is_cover, position")
    .eq("property_id", propertyId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  const seen = new Set<string>();
  const out: CoverPhotoOption[] = [];
  for (const ph of (data ?? []) as any[]) {
    if (!ph?.url || seen.has(ph.url)) continue;
    seen.add(ph.url);
    out.push({ id: ph.id, url: `/p/${encodeURIComponent(prop.slug)}/${out.length}.webp?w=320`, isCover: ph.is_cover === true });
  }
  return out;
}

export async function getCatalogDetail(ownerId: string, catalogId: string): Promise<CatalogDetail | null> {
  const { data: cat, error } = await db()
    .from("catalogs")
    .select("id, title, intro, status, version, created_at, updated_at, owner_id, contact_name, contact_phone, contact_role, mode, criteria, cover_property_id, cover_photo_id")
    .eq("id", catalogId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !cat) return null;

  const { data: items } = await db()
    .from("catalog_items")
    .select(`property_id, position, properties(${PROPERTY_VIEW_COLUMNS})`)
    .eq("catalog_id", catalogId)
    .order("position", { ascending: true });

  const manual: CatalogItemView[] = ((items ?? []) as any[])
    .filter((it) => it.properties)
    .map((it) => toItemView(it.properties, it.position));

  const mode: "manual" | "auto" = cat.mode === "auto" ? "auto" : "manual";
  const criteria = criteriaOf(cat.criteria);
  const auto = mode === "auto" ? await autoSelection(ownerId, catalogId, null) : null;

  // Ajustes guardados (C1): las excluidas y las inclusiones que hoy no pueden
  // aparecer se enseñan aparte, con su explicación.
  const adj = await catalogAdjustments(catalogId);
  const ctx: ExplainCtx = { criteria, adjustments: adj };
  const excluded = await propertyViews([...adj].filter(([, k]) => k === "exclude").map(([id]) => id), ctx);
  const includedViews = await propertyViews([...adj].filter(([, k]) => k === "include").map(([id]) => id), ctx);
  const unavailable = includedViews.filter((v) => v.explain?.headline === INCLUDED_UNAVAILABLE);
  const included = includedViews.length - unavailable.length;
  const snap = await internalSnapshot(catalogId);

  return {
    id: cat.id,
    title: cat.title,
    intro: cat.intro ?? null,
    status: cat.status === "archived" ? "archived" : "active",
    version: Number(cat.version),
    createdAt: cat.created_at,
    updatedAt: cat.updated_at,
    edition: editionLabel(new Date(cat.created_at)),
    items: auto ? auto.items : manual,
    contact: {
      name: cat.contact_name ?? null,
      phone: cat.contact_phone ?? null,
      role: cat.contact_role === "asesora" ? "asesora" : "asesor",
    },
    mode,
    criteria,
    autoTotal: auto ? auto.total : null,
    manualCount: manual.length,
    ads: (await listCatalogAds([catalogId])).get(catalogId) ?? [],
    autoMatched: auto ? auto.matched : null,
    adjustments: { included, excluded, unavailable, overMax: included > criteria.max },
    cover: await coverState(catalogId, cat, snap),
  };
}

/** Búsqueda de la gestión: mismos filtros que el automático sin foto
 *  obligatoria ni máximo. Cada resultado lleva su ajuste y la explicación
 *  frente a los criterios GUARDADOS (los que deciden la lista). Solo lectura,
 *  comprobada en SQL. */
export async function searchCatalogProperties(
  ownerId: string,
  catalogId: string,
  criteria: CatalogCriteria,
  text: string | null,
  offset: number,
  limit = 20,
): Promise<{ items: Array<CatalogItemView & { inCatalog: boolean }>; total: number }> {
  const { data, error } = await db().rpc("catalog_property_search", {
    p_actor: ownerId,
    p_catalog: catalogId,
    p_criteria: criteria,
    p_text: text,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`catalog_property_search: ${error.message}`);
  const rows = (data ?? []) as any[];
  const { data: cat } = await db().from("catalogs").select("criteria").eq("id", catalogId).maybeSingle();
  const adjustments = new Map<string, AdjustmentKind>();
  for (const r of rows) if (r.adjustment === "include" || r.adjustment === "exclude") adjustments.set(r.property_id, r.adjustment);
  const views = await propertyViews(rows.map((r) => r.property_id), { criteria: criteriaOf(cat?.criteria), adjustments });
  const inCat = new Map(rows.map((r) => [r.property_id, r.in_catalog === true]));
  return {
    items: views.map((v) => ({ ...v, inCatalog: inCat.get(v.propertyId) ?? false })),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

/** Qué entra y qué sale al cambiar de modo (sin escribir nada). */
export async function modePreview(
  ownerId: string,
  catalogId: string,
  mode: "manual" | "auto",
): Promise<{ entering: CatalogItemView[]; leaving: CatalogItemView[]; autoTotal: number; manualCount: number }> {
  const { data, error } = await db().rpc("catalog_mode_preview", { p_actor: ownerId, p_catalog: catalogId, p_mode: mode });
  if (error) throw new Error(`catalog_mode_preview: ${error.message}`);
  const d = data as any;
  return {
    entering: await propertyViews((d?.entering ?? []) as string[]),
    leaving: await propertyViews((d?.leaving ?? []) as string[]),
    autoTotal: Number(d?.auto_total ?? 0),
    manualCount: Number(d?.manual_count ?? 0),
  };
}

/** Anuncios de origen de unos catálogos (interno; nunca llega al lector). */
export async function listCatalogAds(catalogIds: string[]): Promise<Map<string, CatalogAdView[]>> {
  const out = new Map<string, CatalogAdView[]>();
  if (catalogIds.length === 0) return out;
  const { data } = await db()
    .from("catalog_ads")
    .select("id, catalog_id, ad_code, note, created_at, idealista_listings(reference_code, inspo_title, properties(title))")
    .in("catalog_id", catalogIds)
    .order("created_at", { ascending: true });
  for (const r of (data ?? []) as any[]) {
    const l = r.idealista_listings;
    const list = out.get(r.catalog_id) ?? [];
    list.push({
      id: r.id,
      reference: l?.reference_code ?? null,
      title: l?.inspo_title ?? l?.properties?.title ?? null,
      code: r.ad_code ?? null,
      note: r.note ?? null,
    });
    out.set(r.catalog_id, list);
  }
  return out;
}

/** Busca en Fichas guardadas (solo lectura) por referencia, título o código. */
export async function searchSavedListings(
  text: string,
): Promise<Array<{ id: string; reference: string | null; title: string | null; code: string | null; state: string | null }>> {
  // Fuera lo que PostgREST interpreta dentro de or(): comas, paréntesis,
  // comillas, barras y comodines.
  const t = text.trim().replace(/[%_,()"\\*]/g, " ").trim();
  if (t.length < 2) return [];
  const like = `%${t}%`;
  const { data } = await db()
    .from("idealista_listings")
    .select("id, reference_code, inspo_title, idealista_property_id, idealista_state, properties(title)")
    .or(`reference_code.ilike.${like},inspo_title.ilike.${like},idealista_property_id.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((data ?? []) as any[]).map((l) => ({
    id: l.id,
    reference: l.reference_code ?? null,
    title: l.inspo_title ?? l.properties?.title ?? null,
    code: l.idealista_property_id ?? null,
    state: l.idealista_state ?? null,
  }));
}

/** Busca una propiedad EXISTENTE por referencia BC o slug. Solo lectura. */
export async function findPropertyId(
  ref: { kind: "bc"; reference: string } | { kind: "slug"; slug: string },
): Promise<string | null> {
  const q = db().from("properties").select("id").limit(2);
  const { data } =
    ref.kind === "bc" ? await q.ilike("bc_reference", ref.reference) : await q.eq("slug", ref.slug);
  const rows = (data ?? []) as Array<{ id: string }>;
  // Si una referencia casara con dos filas, no se elige ninguna.
  return rows.length === 1 ? rows[0].id : null;
}
