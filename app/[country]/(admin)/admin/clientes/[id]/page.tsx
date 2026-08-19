import { notFound } from "next/navigation";
import { clientRowToAdminClient } from "@/lib/db/adapters";
import { getClientById } from "@/lib/db/queries/clients";
import { checkPermission, guardPage } from "@/lib/auth/guard";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import {
  canAccessClient,
  getClientItineraries,
  getClientSelection,
  getViewingCollectionsSettings,
} from "@/lib/db/queries/viewing-collections";
import {
  getAssignableStaff,
  getClientPortalLinks,
} from "@/lib/db/queries/portal-links";
import { getClientShortlists } from "@/lib/db/queries/client-shortlists";
import {
  EMPTY_CLIENT_ENGAGEMENT,
  getClientAdvisor,
  getClientApplications,
  getClientEngagement,
  getClientPreferencesFull,
  getClientTags,
} from "@/lib/db/queries/client-command-center";
import {
  deriveClientStage,
  deriveLastActivity,
  deriveMetrics,
  deriveNextActions,
  type CommandCenterSnapshot,
} from "@/lib/client-command-center/derive";
import { buildTimeline } from "@/lib/client-command-center/timeline";
import { isCountry, type Country } from "@/lib/country-config";
import { ClientFichaView } from "./client-ficha-view";

export const dynamic = "force-dynamic";

/** Marca más reciente de una lista, ignorando nulos y fechas inválidas. */
function maxDate(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) continue;
    if (!best || t > new Date(best).getTime()) best = v;
  }
  return best;
}

export default async function ClientCommandCenterPage({
  params,
}: {
  params: Promise<{ id: string; country: Country }>;
}) {
  const { id, country: rawCountry } = await params;
  const country: Country = isCountry(rawCountry) ? rawCountry : "es";
  await guardPage("clientes", country);

  const rowData = await getClientById(id);
  if (!rowData) notFound();

  // Viewing Collections. El feature flag y los permisos deciden si los bloques
  // aparecen; el scope (own/team/all) decide si este agente ve a este cliente.
  const [vcSettings, profile, editGate] = await Promise.all([
    getViewingCollectionsSettings(),
    getCurrentProfile(),
    checkPermission("clientes", "edit", { country }),
  ]);

  const perms = profile
    ? await getEffectivePermissions(profile.id, profile.role, country)
    : null;
  const vc = perms?.viewing_collections;
  const inScope =
    vcSettings.enabled && Boolean(vc?.view) && (await canAccessClient(id));

  const [selections, itineraries, shortlists] = inScope
    ? await Promise.all([
        getClientSelection(id),
        getClientItineraries(id),
        getClientShortlists(id),
      ])
    : [[], [], []];

  const [portalLinks, staff] = inScope
    ? await Promise.all([getClientPortalLinks(id), getAssignableStaff()])
    : [[], await getAssignableStaff()];

  // Lo que la ficha nunca había traído. Cada una devuelve algo vacío si falla:
  // que no haya analítica no puede impedir abrir la ficha de un cliente.
  const [prefs, tags, applications, engagement] = await Promise.all([
    getClientPreferencesFull(id),
    getClientTags(id),
    getClientApplications(id),
    inScope ? getClientEngagement(id) : Promise.resolve(EMPTY_CLIENT_ENGAGEMENT),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = rowData as any;
  const advisor = await getClientAdvisor(row.assigned_advisor_id ?? null);

  type PropertyRef = { slug: string; title: string } | null;
  const rawFavorites =
    (row.favorites as Array<{ property_id: string; properties: PropertyRef }> | null) ??
    [];
  const rawVisits =
    (row.visit_requests as Array<{
      id: string;
      property_id: string;
      requested_at: string;
      status: string;
      properties: PropertyRef;
    }> | null) ?? [];

  const visits = rawVisits.map((v) => ({
    id: v.id,
    property_id: v.property_id,
    requested_at: v.requested_at,
    status: v.status,
    propertyTitle: v.properties?.title ?? null,
    propertySlug: v.properties?.slug ?? null,
  }));

  // ── Derivaciones ───────────────────────────────────────────────────────────

  const lastFeedbackAt = maxDate(selections.map((s) => s.client_feedback_at));
  const lastDecisionAt = maxDate(
    shortlists.flatMap((s) => s.items.map((i) => i.decided_at)),
  );
  const lastPortalNoteAt = maxDate(
    portalLinks.flatMap((l) => l.notes_thread.map((n) => n.created_at)),
  );

  const snapshot: CommandCenterSnapshot = {
    hasPreferences: Boolean(prefs),
    hasAdvisor: Boolean(advisor),
    selections: selections.map((s) => ({ status: s.status })),
    portalLinks: portalLinks.map((l) => ({
      status: l.status,
      last_called_at: l.last_called_at,
    })),
    shortlists: shortlists.map((s) => ({
      id: s.id,
      status: s.status,
      linkState: s.linkState,
      created_at: s.created_at,
      first_opened_at: s.first_opened_at,
      submitted_at: s.submitted_at,
      client_updated_at: s.client_updated_at,
      expires_at: s.expires_at,
      updatedAfterSubmit: s.updatedAfterSubmit,
      counts: {
        total: s.counts.total,
        decided: s.counts.decided,
        mustVisit: s.counts.mustVisit,
      },
    })),
    itineraries: itineraries.map((i) => ({
      id: i.id,
      status: i.status,
      scheduled_date: i.scheduled_date,
      blockers: i.readiness.blockers.length,
      stopsPendingConfirmation: i.stops.filter(
        (s) =>
          !s.hidden_from_client &&
          (s.confirmation_status === "pending" || s.confirmation_status === "proposed"),
      ).length,
      hasActiveShare: Boolean(i.activeShare),
    })),
    visits: visits.map((v) => ({ status: v.status, requested_at: v.requested_at })),
    applications: applications.map((a) => ({
      id: a.id,
      status: a.status,
      submitted_at: a.submittedAt,
      updated_at: a.updatedAt,
      documentsPending: a.documentsPending,
    })),
    engagement: {
      views: engagement.views,
      lastViewAt: engagement.lastViewAt,
      totalLinks: engagement.totalLinks,
    },
    lastFeedbackAt,
    lastDecisionAt,
    lastPortalNoteAt,
  };

  const stage = deriveClientStage(snapshot);
  const nextActions = deriveNextActions(snapshot);
  const metrics = deriveMetrics(snapshot);
  const lastActivity = deriveLastActivity(snapshot);

  const timeline = buildTimeline({
    client: { createdAt: row.created_at ?? null },
    preferencesUpdatedAt: prefs?.updated_at ?? null,
    portalLinks: portalLinks.map((l) => ({
      id: l.id,
      title: l.title,
      created_at: l.created_at,
      last_called_at: l.last_called_at,
      status: l.status,
      notes_thread: l.notes_thread,
    })),
    selections: selections.map((s) => ({
      id: s.id,
      added_at: s.added_at,
      client_feedback_at: s.client_feedback_at,
      client_rating: s.client_rating,
      property: { title: s.property.title },
    })),
    shortlists: shortlists.map((s) => ({
      id: s.id,
      title: s.title,
      created_at: s.created_at,
      first_opened_at: s.first_opened_at,
      submitted_at: s.submitted_at,
      counts: { total: s.counts.total, mustVisit: s.counts.mustVisit },
      items: s.items.map((i) => ({
        id: i.id,
        decision: i.decision,
        decided_at: i.decided_at,
        property: { title: i.property.displayTitle || i.property.title },
      })),
    })),
    itineraries: itineraries.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      created_at: i.created_at,
      scheduled_date: i.scheduled_date,
      shareCreatedAt: i.activeShare?.created_at ?? null,
      stops: i.stops.length,
    })),
    visits: visits.map((v) => ({
      id: v.id,
      status: v.status,
      requested_at: v.requested_at,
      propertyTitle: v.propertyTitle,
    })),
    applications: applications.map((a) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt,
      submittedAt: a.submittedAt,
      reviewedAt: a.reviewedAt,
      property: a.property ? { title: a.property.title } : null,
      documents: a.documents.map((d) => ({
        id: d.id,
        fileName: d.documentTypeName ?? d.fileName,
        createdAt: d.createdAt,
      })),
    })),
    sessions: engagement.sessionList,
  });

  // El adaptador ya no inventa: las señales que la fila de `profiles` no lleva
  // encima se le pasan explícitamente, y las que no sabemos siguen sin saberse.
  const adapted = clientRowToAdminClient(
    {
      ...row,
      favorites: [{ count: rawFavorites.length }],
      visit_requests: [{ count: rawVisits.length }],
      client_tag_assignments: row.client_tag_assignments ?? [],
    } as Parameters<typeof clientRowToAdminClient>[0],
    {
      advisorName: advisor?.name ?? null,
      propertiesViewed: engagement.events.property_view ?? null,
      lastActivityAt: lastActivity?.at ?? null,
    },
  );

  return (
    <ClientFichaView
      client={adapted}
      country={country}
      favorites={rawFavorites.map((f) => ({
        id: f.property_id,
        slug: f.properties?.slug ?? null,
        title: f.properties?.title ?? null,
      }))}
      visits={visits}
      portalLinks={
        inScope
          ? {
              links: portalLinks,
              staff,
              currentUserId: profile?.id ?? null,
              canCreate: Boolean(vc?.create),
              canEdit: Boolean(vc?.edit),
              canDelete: Boolean(vc?.delete),
            }
          : null
      }
      viewingCollections={
        inScope
          ? {
              selections,
              itineraries,
              shortlists,
              canEdit: Boolean(vc?.edit),
              canCreate: Boolean(vc?.create),
              canDelete: Boolean(vc?.delete),
              canPublish: Boolean(vc?.publish),
            }
          : null
      }
      cc={{
        stage,
        nextActions,
        metrics,
        lastActivity,
        timeline,
        prefs,
        advisor,
        staff,
        tags,
        applications,
        engagement,
        canEditClient: editGate.ok,
      }}
    />
  );
}
