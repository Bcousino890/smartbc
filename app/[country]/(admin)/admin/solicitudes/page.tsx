import { redirect } from "next/navigation";
import Link from "next/link";
import { checkPermission, checkRoles, guardPage } from "@/lib/auth/guard";
import {
  getInboxCounts,
  getInboxPage,
  getLeadDetail,
  getPriorityBoard,
} from "@/lib/db/queries/sales-inbox";
import { ADMIN_ROLES } from "@/lib/sales-inbox/routing";
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
  GROUP_PAGE_SIZE,
  isCommercialState,
  isInboxGrouping,
  isInboxLayout,
  isInboxView,
  isOperationFilter,
  type InboxFilters,
} from "@/lib/sales-inbox/types";
import { effectiveSort } from "@/lib/sales-inbox/views";
import { getExtensionCaptureStatus } from "@/lib/db/queries/extension-status";
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
  const [editGate, adminGate] = await Promise.all([
    checkPermission("solicitudes", "edit", { country }),
    checkRoles(ADMIN_ROLES, { country }),
  ]);

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
            className="text-xs text-ink/55 transition hover:text-ink"
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
  const groupParam = one(sp.group);
  const opParam = one(sp.op);
  const view = isInboxView(viewParam) ? viewParam : "needs-attention";
  // A · Tarjetas (por defecto) · B · Por inmueble · C · Prioridades. El viejo
  // `?group=property` sigue abriendo B: los enlaces guardados no se rompen.
  const modeParam = one(sp.mode);
  const layout = isInboxLayout(modeParam)
    ? modeParam
    : isInboxGrouping(groupParam) && groupParam === "property"
      ? "property"
      : "cards";
  const grouping = layout === "property" ? "property" : "none";

  // El orden por prioridad es lo que necesita la cola de atención; en el resto
  // de vistas lo que se espera es una bandeja: lo más reciente arriba.
  const sort = effectiveSort(sortParam, view);

  const filters: InboxFilters = {
    view,
    grouping,
    search: one(sp.q),
    assignedTo: one(sp.assigned),
    state: isCommercialState(stateParam) ? stateParam : undefined,
    leadType: one(sp.type),
    international: one(sp.intl) === "1" ? true : undefined,
    unmatchedProperty: one(sp.unmatched) === "1",
    operation: isOperationFilter(opParam) ? opParam : undefined,
    routing: one(sp.routing) === "conflict" ? "conflict" : undefined,
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    pageSize: grouping === "property" ? GROUP_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    sort,
  };

  const leadId = one(sp.lead) ?? null;

  const [counts, pageData, board, staff, selectedLead, extensionStatus] = await Promise.all([
    getInboxCounts(),
    // El tablero de prioridades recorre su propio conjunto; la lista paginada
    // no hace falta en ese modo.
    layout === "priorities"
      ? Promise.resolve({ items: [], groups: [], total: 0, page: 1, pageSize: filters.pageSize, attentionMode: false })
      : getInboxPage(filters),
    layout === "priorities" ? getPriorityBoard(filters) : Promise.resolve(null),
    getAssignableStaff(),
    leadId ? getLeadDetail(leadId) : Promise.resolve(null),
    // Aviso de extensión desactualizada: solo para quien trabaja la bandeja.
    editGate.ok ? getExtensionCaptureStatus() : Promise.resolve(null),
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
      groups={pageData.groups}
      grouping={grouping}
      total={pageData.total}
      page={pageData.page}
      pageSize={pageData.pageSize}
      selectedLead={selectedLead}
      staff={staff}
      country={country}
      canEdit={editGate.ok}
      isAdmin={adminGate.ok}
      layout={layout}
      sort={sort}
      board={board}
      extensionStatus={extensionStatus}
    />
  );
}
