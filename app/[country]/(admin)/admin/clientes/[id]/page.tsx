import { notFound } from "next/navigation";
import { clientRowToAdminClient } from "@/lib/db/adapters";
import { getClientById } from "@/lib/db/queries/clients";
import { guardPage } from "@/lib/auth/guard";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import {
  canAccessClient,
  getClientItineraries,
  getClientSelection,
  getViewingCollectionsSettings,
} from "@/lib/db/queries/viewing-collections";
import type { Country } from "@/lib/country-config";
import { ClientFichaView } from "./client-ficha-view";

export const dynamic = "force-dynamic";

export default async function ClientFichaPage({
  params,
}: {
  params: Promise<{ id: string; country: Country }>;
}) {
  const { id, country } = await params;
  await guardPage("clientes", country);
  const rowData = await getClientById(id);
  if (!rowData) notFound();

  // Viewing Collections. El feature flag y los permisos deciden si el bloque
  // aparece; el scope (own/team/all) decide si este agente ve a este cliente.
  const [vcSettings, profile] = await Promise.all([
    getViewingCollectionsSettings(),
    getCurrentProfile(),
  ]);

  const perms = profile
    ? await getEffectivePermissions(profile.id, profile.role, country)
    : null;
  const vc = perms?.viewing_collections;
  const inScope = vcSettings.enabled && Boolean(vc?.view) && (await canAccessClient(id));

  const [selections, itineraries] = inScope
    ? await Promise.all([getClientSelection(id), getClientItineraries(id)])
    : [[], []];

  // getClientById retorna datos con count embebido distinto al getClients.
  // Adaptamos manualmente las relaciones para reusar el adaptador.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = rowData as any;
  const adapted = clientRowToAdminClient({
    ...row,
    favorites: row.favorites
      ? [{ count: (row.favorites as Array<{ property_id: string }>).length }]
      : [{ count: 0 }],
    visit_requests: row.visit_requests
      ? [{ count: (row.visit_requests as Array<unknown>).length }]
      : [{ count: 0 }],
    client_tag_assignments: row.client_tag_assignments ?? [],
  } as Parameters<typeof clientRowToAdminClient>[0]);

  // Datos raw para la ficha. Las rutas de admin de propiedades usan SLUG
  // (/admin/propiedades/[slug]), no el UUID, así que traemos el slug/título
  // de la propiedad embebidos en la query.
  type PropertyRef = { slug: string; title: string } | null;
  const rawFavorites = (
    row.favorites as Array<{ property_id: string; properties: PropertyRef }> | null
  ) ?? [];
  const rawVisits = (
    row.visit_requests as Array<{
      id: string;
      property_id: string;
      requested_at: string;
      status: string;
      properties: PropertyRef;
    }> | null
  ) ?? [];

  return (
    <ClientFichaView
      client={adapted}
      favorites={rawFavorites.map((f) => ({
        id: f.property_id,
        slug: f.properties?.slug ?? null,
        title: f.properties?.title ?? null,
      }))}
      visits={rawVisits.map((v) => ({
        id: v.id,
        property_id: v.property_id,
        requested_at: v.requested_at,
        status: v.status,
        propertyTitle: v.properties?.title ?? null,
        propertySlug: v.properties?.slug ?? null,
      }))}
      viewingCollections={
        inScope
          ? {
              selections,
              itineraries,
              canEdit: Boolean(vc?.edit),
              canCreate: Boolean(vc?.create),
              canDelete: Boolean(vc?.delete),
              canPublish: Boolean(vc?.publish),
            }
          : null
      }
    />
  );
}
