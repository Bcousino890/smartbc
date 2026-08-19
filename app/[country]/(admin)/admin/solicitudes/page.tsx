import { redirect } from "next/navigation";
import Link from "next/link";
import { checkPermission, guardPage } from "@/lib/auth/guard";
import { getInboxCounts, getInboxPage, getLeadDetail } from "@/lib/db/queries/sales-inbox";
import { getAssignableStaff } from "@/lib/db/queries/portal-links";
import {
  getVisitRequests,
  getContactRequests,
} from "@/lib/db/queries/clients";
import { getIdealistaLeads } from "@/lib/db/queries/idealista-leads";
import { getStaffOptions } from "@/lib/db/queries/particulares";
import { visitRequestRowToLegacy } from "@/lib/db/adapters";
import {
  DEFAULT_PAGE_SIZE,
  isCommercialState,
  isInboxSort,
  isInboxView,
  type InboxFilters,
} from "@/lib/sales-inbox/types";
import { getCountryConfig, isCountry, type Country } from "@/lib/country-config";
import { PageFooter } from "@/components/ui/page-footer";
import { InboxShell } from "./_components/inbox-shell";
import { SolicitudesAdminClient } from "./solicitudes-admin-client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function SalesInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<SP>;
}) {
  const { country: raw } = await params;
  const country: Country = isCountry(raw) ? raw : "es";
  const sp = await searchParams;

  // ⚠️ Antes esta página entraba por `canAccess(role, …)`, es decir por rol
  // puro: un override que quitara "solicitudes" no cerraba la puerta. Ahora
  // usa el mismo gate que el resto del panel (rol + overrides + rol
  // personalizado + país).
  await guardPage("solicitudes", country);
  const editGate = await checkPermission("solicitudes", "edit", { country });

  // ── Superficie heredada ──
  //
  // `visit_requests` (1 fila) y `contact_requests` (0) tienen flujos propios
  // que siguen funcionando. No se borran ni se tocan: se dejan aquí, a un clic,
  // en lugar de dedicarles cinco pestañas de la navegación principal.
  if (one(sp.legacy) === "1") {
    const config = getCountryConfig(country);
    const [rows, contactRows, idealistaLeads, staffOptions] = await Promise.all([
      getVisitRequests(country),
      getContactRequests(),
      getIdealistaLeads(),
      getStaffOptions("es"),
    ]);
    return (
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
        <div className="pt-6">
          <Link
            href={`${config.prefix}/solicitudes`}
            className="text-[12px] text-ink/55 transition hover:text-ink"
          >
            ← Sales Inbox
          </Link>
        </div>
        <SolicitudesAdminClient
          requests={rows.map(visitRequestRowToLegacy)}
          contactRequests={contactRows}
          idealistaLeads={idealistaLeads}
          staffOptions={staffOptions}
        />
        <PageFooter textKey="admin.realtime.footer" variant="inline" />
      </div>
    );
  }

  // ── Sales Inbox ──
  const viewParam = one(sp.view);
  const sortParam = one(sp.sort);
  const stateParam = one(sp.state);

  const filters: InboxFilters = {
    view: isInboxView(viewParam) ? viewParam : "needs-attention",
    search: one(sp.q),
    assignedTo: one(sp.assigned),
    state: isCommercialState(stateParam) ? stateParam : undefined,
    leadType: one(sp.type),
    international: one(sp.intl) === "1" ? true : undefined,
    unmatchedProperty: one(sp.unmatched) === "1",
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    pageSize: DEFAULT_PAGE_SIZE,
    sort: isInboxSort(sortParam) ? sortParam : "attention",
  };

  const leadId = one(sp.lead) ?? null;

  const [counts, pageData, staff, selectedLead] = await Promise.all([
    getInboxCounts(),
    getInboxPage(filters),
    getAssignableStaff(),
    leadId ? getLeadDetail(leadId) : Promise.resolve(null),
  ]);

  // Un lead que ya no existe (o que el alcance no permite ver) no puede dejar
  // la pantalla en un estado imposible: se limpia el parámetro.
  if (leadId && !selectedLead) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = one(v);
      if (k !== "lead" && val) qs.set(k, val);
    }
    redirect(`${getCountryConfig(country).prefix}/solicitudes?${qs.toString()}`);
  }

  return (
    <InboxShell
      view={filters.view}
      counts={counts}
      items={pageData.items}
      total={pageData.total}
      page={pageData.page}
      pageSize={pageData.pageSize}
      selectedLead={selectedLead}
      staff={staff}
      country={country}
      canEdit={editGate.ok}
    />
  );
}
