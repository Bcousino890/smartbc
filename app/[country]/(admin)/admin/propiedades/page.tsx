import { checkPermission, guardPage } from "@/lib/auth/guard";
import {
  getPropertyWorkspaceDetail,
  getWorkspaceCounts,
  getWorkspaceFilterOptions,
  getWorkspacePage,
} from "@/lib/db/queries/properties-workspace";
import {
  WORKSPACE_PAGE_SIZE,
  isWorkspaceSort,
  isWorkspaceTab,
  isWorkspaceView,
  type WorkspaceFilters,
} from "@/lib/properties-workspace/types";
import { isCountry, type Country } from "@/lib/country-config";
import { WorkspaceShell } from "./_components/workspace-shell";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
const num = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export default async function PropertiesWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<SP>;
}) {
  const { country: raw } = await params;
  const country: Country = isCountry(raw) ? raw : "es";
  const sp = await searchParams;

  // ⚠️ Antes esta página entraba por `canAccess(role, …)` — rol puro. Ahora usa
  // el mismo gate que el resto del panel: rol + overrides + rol personalizado.
  await guardPage("properties", country);
  const [editGate, publishGate, createGate] = await Promise.all([
    checkPermission("properties", "edit", { country }),
    checkPermission("properties", "publish", { country }),
    checkPermission("properties", "create", { country }),
  ]);

  const viewParam = one(sp.view);
  const sortParam = one(sp.sort);
  const view = isWorkspaceView(viewParam) ? viewParam : "all";

  const filters: WorkspaceFilters = {
    view,
    search: one(sp.q),
    operation: one(sp.operation),
    zone: one(sp.zona),
    agencyId: one(sp.agencia),
    bedrooms: num(one(sp.dormitorios)),
    bathrooms: num(one(sp.banos)),
    priceMin: num(one(sp.precioMin)),
    priceMax: num(one(sp.precioMax)),
    sqmMin: num(one(sp.m2Min)),
    sqmMax: num(one(sp.m2Max)),
    publishedWeb: one(sp.pub) === "1" ? true : undefined,
    hasPhotos: one(sp.fotos) === "0" ? false : one(sp.fotos) === "1" ? true : undefined,
    hasVideo: one(sp.video) === "1" ? true : undefined,
    hasPlan: one(sp.plano) === "1" ? true : undefined,
    missingAddress: one(sp.sinDireccion) === "1",
    missingCoords: one(sp.sinCoords) === "1",
    staleSync: one(sp.rancias) === "1",
    source: one(sp.origen),
    page: Math.max(1, Number(one(sp.page) ?? 1) || 1),
    pageSize: WORKSPACE_PAGE_SIZE,
    sort: isWorkspaceSort(sortParam)
      ? sortParam
      : view === "needs-attention"
        ? "attention"
        : view === "upcoming-viewings"
          ? "viewing"
          : "newest",
  };

  const selectedId = one(sp.p) ?? null;
  const tabParam = one(sp.t);
  const tab = isWorkspaceTab(tabParam) ? tabParam : "overview";

  const [counts, pageData, options, detail] = await Promise.all([
    getWorkspaceCounts(country),
    getWorkspacePage(filters, country),
    getWorkspaceFilterOptions(country),
    selectedId ? getPropertyWorkspaceDetail(selectedId) : Promise.resolve(null),
  ]);

  return (
    <WorkspaceShell
      view={view}
      tab={tab}
      counts={counts}
      items={pageData.items}
      total={pageData.total}
      page={pageData.page}
      pageSize={pageData.pageSize}
      detail={detail}
      zones={options.zones}
      agencies={options.agencies}
      country={country}
      canCreate={createGate.ok}
      canEdit={editGate.ok}
      canPublish={publishGate.ok}
    />
  );
}
