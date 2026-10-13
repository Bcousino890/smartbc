import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { catalogNumberLabel, editionLabel, operationLabel, priceLabel } from "./format";
import type { CatalogDetail, CatalogItemView, CatalogSummary } from "./types";

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
    .select("id, title, intro, status, version, created_at, updated_at, contact_name")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error || !cats?.length) return [];

  const ids = cats.map((c: any) => c.id);
  const { data: items } = await db()
    .from("catalog_items")
    .select("catalog_id, position, properties(slug)")
    .in("catalog_id", ids)
    .order("position", { ascending: true });

  const count = new Map<string, number>();
  const firstSlug = new Map<string, string>();
  for (const it of (items ?? []) as any[]) {
    count.set(it.catalog_id, (count.get(it.catalog_id) ?? 0) + 1);
    if (!firstSlug.has(it.catalog_id) && it.properties?.slug) firstSlug.set(it.catalog_id, it.properties.slug);
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
    coverPhotoUrl: coverPhotoUrl(firstSlug.get(c.id)),
    contactName: c.contact_name ?? null,
  }));

  // Activos primero, y dentro de cada grupo lo último que se tocó.
  return summaries.sort((a, b) =>
    a.status !== b.status ? (a.status === "active" ? -1 : 1) : b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function getCatalogDetail(ownerId: string, catalogId: string): Promise<CatalogDetail | null> {
  const { data: cat, error } = await db()
    .from("catalogs")
    .select("id, title, intro, status, version, created_at, updated_at, owner_id, contact_name, contact_phone, contact_role")
    .eq("id", catalogId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !cat) return null;

  const { data: items } = await db()
    .from("catalog_items")
    .select(
      "property_id, position, properties(id, slug, title, zone, subzone, bc_reference, status, archived_at, operation, operations, price, rent_price, currency, bedrooms, bathrooms, square_meters)",
    )
    .eq("catalog_id", catalogId)
    .order("position", { ascending: true });

  const views: CatalogItemView[] = ((items ?? []) as any[])
    .filter((it) => it.properties)
    .map((it) => {
      const p = it.properties;
      return {
        propertyId: it.property_id,
        position: it.position,
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
    });

  return {
    id: cat.id,
    title: cat.title,
    intro: cat.intro ?? null,
    status: cat.status === "archived" ? "archived" : "active",
    version: Number(cat.version),
    createdAt: cat.created_at,
    updatedAt: cat.updated_at,
    edition: editionLabel(new Date(cat.created_at)),
    items: views,
    contact: {
      name: cat.contact_name ?? null,
      phone: cat.contact_phone ?? null,
      role: cat.contact_role === "asesora" ? "asesora" : "asesor",
    },
  };
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
