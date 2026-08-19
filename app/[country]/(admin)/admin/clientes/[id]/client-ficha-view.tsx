"use client";

// ============================================================================
// CLIENT COMMAND CENTER
//
// La ficha era una columna de siete bloques largos: para llegar a las visitas
// había que pasar por delante de todo lo demás, y la primera pantalla no decía
// qué hacer. Aquí el trabajo se reparte en cinco pestañas y la primera
// pregunta —"¿qué toca ahora?"— se contesta arriba del todo.
//
// Lo que NO cambia: los bloques de enlaces de portales, selección, selección
// privada e itinerarios son EXACTAMENTE los mismos componentes de siempre, con
// sus acciones. Esto los reordena y les pone contexto alrededor; no los
// reescribe.
//
// La pestaña vive en la URL (`?tab=`) para poder enlazarla y para que "atrás"
// haga lo que uno espera.
// ============================================================================

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ClientMetrics,
  ClientStage,
  CommandTab,
  NextAction,
  TimelineEvent,
} from "@/lib/client-command-center/types";
import { isCommandTab } from "@/lib/client-command-center/types";
import type { LastActivity } from "@/lib/client-command-center/derive";
import type {
  AdvisorRef,
  ClientApplication,
  ClientEngagement,
  ClientPreferencesFull,
  ClientTagRef,
} from "@/lib/db/queries/client-command-center";
import type { PortalLinkWithNotes, StaffRef } from "@/lib/portal-links/types";
import type {
  ItineraryWithStops,
  SelectionWithProperty,
} from "@/lib/viewing-collections/types";
import type { ShortlistWithItems } from "@/lib/client-shortlist/types";
import type { AdminClient } from "@/lib/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "./_components/plural";
import { PageFooter } from "@/components/ui/page-footer";
import { SuggestedPropertiesBlock } from "@/components/admin/clientes/suggested-properties-block";
import { SelectedPropertiesBlock } from "@/components/admin/viewing-collections/selected-properties-block";
import { ViewingItinerariesBlock } from "@/components/admin/viewing-collections/viewing-itineraries-block";
import { PortalLinksBlock } from "@/components/admin/clientes/portal-links/portal-links-block";
import { ClientShortlistBlock } from "@/components/admin/client-shortlist/client-shortlist-block";
import { ActivityTimeline } from "./_components/activity-timeline";
import { ApplicationsBlock } from "./_components/applications-block";
import { ClientBrief } from "./_components/client-brief";
import { CommandHeader } from "./_components/command-header";
import { CommandTabs } from "./_components/command-tabs";
import { EditClientDialog } from "./_components/edit-client-dialog";
import { EditPreferencesDialog } from "./_components/edit-preferences-dialog";
import { NextActionCard } from "./_components/next-action-card";
import { ShortlistStatusCard, ViewingDayCard } from "./_components/overview-cards";
import {
  FavoritesBlock,
  VisitsBlock,
  type FavoriteRef,
  type RawVisit,
} from "./_components/simple-blocks";
import { Empty, Metric, Panel } from "./_components/ui";

export type PortalLinksProps = {
  links: PortalLinkWithNotes[];
  staff: StaffRef[];
  currentUserId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type ViewingCollectionsProps = {
  selections: SelectionWithProperty[];
  itineraries: ItineraryWithStops[];
  shortlists: ShortlistWithItems[];
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canPublish: boolean;
};

export type CommandCenterProps = {
  stage: ClientStage;
  nextActions: NextAction[];
  metrics: ClientMetrics;
  lastActivity: LastActivity;
  timeline: TimelineEvent[];
  prefs: ClientPreferencesFull | null;
  advisor: AdvisorRef | null;
  staff: StaffRef[];
  tags: ClientTagRef[];
  applications: ClientApplication[];
  engagement: ClientEngagement;
  canEditClient: boolean;
};

export function ClientFichaView({
  client,
  country,
  favorites,
  visits,
  portalLinks,
  viewingCollections,
  cc,
}: {
  client: AdminClient;
  country: Country;
  favorites: FavoriteRef[];
  visits: RawVisit[];
  /** null cuando el módulo está apagado o el agente no tiene acceso. */
  portalLinks: PortalLinksProps | null;
  /** null cuando el módulo está apagado o el agente no tiene acceso. */
  viewingCollections: ViewingCollectionsProps | null;
  cc: CommandCenterProps;
}) {
  const t = useT();
  const tn = useTn();
  const router = useRouter();
  const params = useSearchParams();
  const config = getCountryConfig(country);

  const urlTab = params?.get("tab");
  const tab: CommandTab = isCommandTab(urlTab) ? urlTab : "overview";

  const [editClient, setEditClient] = useState(false);
  const [editPrefs, setEditPrefs] = useState(false);

  const goTab = useCallback(
    (next: CommandTab, anchor?: string) => {
      const qs = new URLSearchParams(params?.toString() ?? "");
      if (next === "overview") qs.delete("tab");
      else qs.set("tab", next);
      const q = qs.toString();
      // `scroll: false`: cambiar de pestaña no debe saltar al principio.
      router.replace(q ? `?${q}` : "?", { scroll: false });
      if (anchor) {
        // El panel destino puede no estar montado todavía: se busca en el
        // siguiente fotograma, y si no aparece no pasa nada.
        requestAnimationFrame(() => {
          document.getElementById(anchor)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    },
    [params, router],
  );

  const selections = viewingCollections?.selections ?? [];
  const itineraries = viewingCollections?.itineraries ?? [];
  const shortlists = viewingCollections?.shortlists ?? [];
  const links = portalLinks?.links ?? [];

  const selectedPropertyIds = useMemo(
    () => new Set(selections.map((s) => s.property_id)),
    [selections],
  );

  const clientName = `${client.firstName} ${client.lastName}`.trim();

  const counts: Partial<Record<CommandTab, number | null>> = {
    overview: cc.nextActions.length,
    properties: selections.length + links.length,
    viewings: itineraries.length + visits.length,
    application: cc.applications.length,
    activity: null,
  };

  return (
    <div className="min-h-screen bg-cream-100/40">
      <CommandHeader
        client={client}
        country={country}
        stage={cc.stage}
        tags={cc.tags}
        advisor={cc.advisor}
        staff={cc.staff}
        lastActivity={cc.lastActivity}
        canEdit={cc.canEditClient}
        onEditClient={() => setEditClient(true)}
        onEditPreferences={() => setEditPrefs(true)}
      />

      <CommandTabs active={tab} counts={counts} onChange={(x) => goTab(x)} />

      <main className="mx-auto max-w-[1320px] px-4 py-5 lg:px-8">
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Las cuatro cifras que sí significan algo. */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label={t("cc.metric.selected")}
                value={cc.metrics.selected}
                onClick={() => goTab("properties")}
              />
              <Metric
                label={t("cc.metric.priorities")}
                value={cc.metrics.clientPriorities}
                hint={
                  cc.metrics.clientPriorities === null
                    ? t("cc.metric.prioritiesNone")
                    : null
                }
                emphasis={Boolean(cc.metrics.clientPriorities)}
                onClick={() => goTab("properties")}
              />
              <Metric
                label={t("cc.metric.viewings")}
                value={cc.metrics.viewings}
                onClick={() => goTab("viewings")}
              />
              <Metric
                label={t("cc.metric.views")}
                value={cc.metrics.views}
                hint={
                  cc.metrics.views === null
                    ? t("cc.metric.viewsNone")
                    : tn("cc.metric.viewsHint", cc.engagement.sessions, {
                        sessions: cc.engagement.sessions,
                      })
                }
                onClick={() => goTab("activity")}
              />
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_1fr]">
              <div className="space-y-5">
                <NextActionCard
                  actions={cc.nextActions}
                  onGo={(a) => goTab(a.tab, a.anchor)}
                />
                <ClientBrief
                  prefs={cc.prefs}
                  country={country}
                  canEdit={cc.canEditClient}
                  onEdit={() => setEditPrefs(true)}
                />
              </div>

              <div className="space-y-5">
                <ShortlistStatusCard
                  shortlists={shortlists}
                  locale={config.locale}
                  onGo={() => goTab("properties")}
                />
                <ViewingDayCard
                  itineraries={itineraries}
                  locale={config.locale}
                  onGo={() => goTab("viewings")}
                />
              </div>
            </div>

            <ActivityTimeline
              events={cc.timeline}
              locale={config.locale}
              initial={8}
              compact
              title={t("cc.overview.recent")}
            />
          </div>
        )}

        {tab === "properties" && (
          <div className="space-y-5">
            {!viewingCollections && !portalLinks ? (
              <Panel title={t("cc.tab.properties")}>
                <Empty>{t("cc.locked")}</Empty>
              </Panel>
            ) : null}

            {viewingCollections && (
              <>
                <SelectedPropertiesBlock
                  clientId={client.id}
                  clientName={clientName}
                  country={country}
                  selections={selections}
                  canEdit={viewingCollections.canEdit}
                  canDelete={viewingCollections.canDelete}
                  canCreateItinerary={viewingCollections.canCreate}
                />
                <ClientShortlistBlock
                  clientId={client.id}
                  country={country}
                  shortlists={shortlists}
                  selections={selections}
                  portalLinks={links}
                  canEdit={viewingCollections.canEdit}
                  canCreate={viewingCollections.canCreate}
                />
              </>
            )}

            {portalLinks && (
              <PortalLinksBlock
                clientId={client.id}
                clientName={client.firstName}
                country={country}
                currentUserId={portalLinks.currentUserId}
                links={portalLinks.links}
                staff={portalLinks.staff}
                canCreate={portalLinks.canCreate}
                canEdit={portalLinks.canEdit}
                canDelete={portalLinks.canDelete}
              />
            )}

            <SuggestedPropertiesBlock
              clientId={client.id}
              clientName={clientName}
              selectedPropertyIds={selectedPropertyIds}
              canAddToSelection={Boolean(viewingCollections?.canCreate)}
            />

            <FavoritesBlock
              favorites={favorites}
              clientId={client.id}
              country={country}
              selectedPropertyIds={selectedPropertyIds}
              canAddToSelection={Boolean(viewingCollections?.canCreate)}
            />
          </div>
        )}

        {tab === "viewings" && (
          <div className="space-y-5">
            {viewingCollections ? (
              <ViewingItinerariesBlock
                clientId={client.id}
                clientName={clientName}
                country={country}
                itineraries={itineraries}
                selections={selections}
                canEdit={viewingCollections.canEdit}
                canDelete={viewingCollections.canDelete}
                canPublish={viewingCollections.canPublish}
              />
            ) : (
              <Panel title={t("cc.tab.viewings")}>
                <Empty>{t("cc.locked")}</Empty>
              </Panel>
            )}
            <VisitsBlock visits={visits} country={country} />
          </div>
        )}

        {tab === "application" && (
          <ApplicationsBlock applications={cc.applications} country={country} />
        )}

        {tab === "activity" && (
          <div className="space-y-5">
            <EngagementPanel engagement={cc.engagement} />
            <ActivityTimeline events={cc.timeline} locale={config.locale} />
          </div>
        )}
      </main>

      <div className="mx-auto max-w-[1320px] px-4 lg:px-8">
        <PageFooter textKey="admin.realtime.footer" variant="inline" />
      </div>

      {cc.canEditClient && (
        <>
          <EditClientDialog
            open={editClient}
            onClose={() => setEditClient(false)}
            client={client}
            country={country}
          />
          <EditPreferencesDialog
            open={editPrefs}
            onClose={() => setEditPrefs(false)}
            clientId={client.id}
            country={country}
            prefs={cc.prefs}
          />
        </>
      )}
    </div>
  );
}

/**
 * Qué ha mirado el cliente en SUS enlaces privados. La atribución es por id de
 * selección privada, de enlace de colección o de SmartLink de una parada suya
 * — nunca por sesión ni por IP.
 */
function EngagementPanel({ engagement }: { engagement: ClientEngagement }) {
  const t = useT();
  const entries = Object.entries(engagement.events).sort((a, b) => b[1] - a[1]);

  return (
    <Panel title={t("cc.engagement.title")}>
      {engagement.totalLinks === 0 ? (
        <Empty>{t("cc.engagement.noLinks")}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={t("cc.engagement.views")} value={engagement.views} />
            <Metric label={t("cc.engagement.sessions")} value={engagement.sessions} />
            <Metric
              label={t("cc.engagement.opened")}
              value={`${engagement.openedLinks}/${engagement.totalLinks}`}
            />
            <Metric
              label={t("cc.engagement.actions")}
              value={entries.reduce((n, [, v]) => n + v, 0)}
            />
          </div>

          {entries.length > 0 && (
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              {entries.map(([type, count]) => (
                <li
                  key={type}
                  className="flex items-baseline justify-between gap-2 border-b border-ink/6 pb-1 text-[12px]"
                >
                  <span className="truncate text-ink/55">
                    {t(`cc.event.${type}`)}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-ink">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
