import { redirect } from "next/navigation";
import { UserSearch, Home, Tag, Clock } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import {
  getParticularesPage,
  getParticularesStats,
  getParticularesZoneCounts,
  getStaffOptions,
  type ParticularesFilters,
} from "@/lib/db/queries/particulares";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { ParticularesClient, type ParticularRow } from "./particulares-client";
import { ParticularesScraperSection } from "./scraper-section";
import { ANUNCIOS_POR_PAGINA } from "./constants";
import { getIdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { getCountryConfig, type Country } from "@/lib/country-config";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

// Réplica MÍNIMA de los enums de use-particulares-filters.ts: ese hook es
// "use client" y esta página es un Server Component, así que no se puede
// importar directo de ahí. Si cambias un valor allí, cámbialo también aquí.
function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | "" {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : "";
}

function numOrUndef(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default async function AdminParticularesPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<SP>;
}) {
  const { country } = await params;
  // "Particulares" lista anuncios scrapeados de Idealista (España). El flujo
  // equivalente en Chile es el módulo de Captaciones (Portal Inmobiliario).
  if (country !== "es") redirect(`${getCountryConfig(country).prefix}/captaciones`);

  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "particulares", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  const sp = await searchParams;
  const showRetired = one(sp.retired) === "1";
  const zoneParam = one(sp.zone) ?? "";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // Arrancan ya, en paralelo — solo la query principal necesita esperar a
  // zoneCounts (para resolver "d:<distrito>", ver abajo), el resto no depende
  // de nada de esto.
  const zoneCountsPromise = getParticularesZoneCounts(showRetired);
  const statsPromise = getParticularesStats();
  const staffOptionsPromise = getStaffOptions().catch(() => []);
  const scraperConfigPromise = getIdealistaScraperConfig();

  // Conteos de zona para el desplegable — antes salían de recorrer las 10.7k
  // filas enriquecidas en el cliente; ahora es un fetch aparte, ligero (ver
  // getParticularesZoneCounts). De paso resuelve "d:<distrito>" a la lista
  // EXACTA de `zone` crudos de ese distrito, para que el filtro principal use
  // el mismo criterio que ve el desplegable en vez de reimplementar
  // normalizeZone() en SQL.
  const zoneCounts = await zoneCountsPromise;
  const zoneDistrictRaw = zoneParam.startsWith("d:")
    ? (zoneCounts.zoneGroups.find((g) => g.district === zoneParam.slice(2))?.zones.map((z) => z.name) ?? [])
    : undefined;

  const filters: ParticularesFilters = {
    search: one(sp.q),
    operation: pick(one(sp.operation), ["rent", "sale"] as const),
    zone: zoneParam,
    zoneDistrictRaw,
    priceMin: numOrUndef(one(sp.priceMin)),
    priceMax: numOrUndef(one(sp.priceMax)),
    bedroomsMin: numOrUndef(one(sp.bedrooms)),
    areaMin: numOrUndef(one(sp.areaMin)),
    last24h: one(sp.last24h) === "1",
    phoneFilter: pick(one(sp.phone), ["no_phone", "with_phone"] as const),
    gestion: pick(one(sp.gestion), ["unmanaged", "contacted", "assigned", "mine"] as const),
    currentUserId: currentProfile?.id,
    advertiser: pick(one(sp.advertiser), ["particular", "professional", "unknown"] as const),
  };
  // `floorMin`/`amueblado` NO entran aquí a propósito — ver el comentario de
  // ParticularesFilters en lib/db/queries/particulares.ts.

  const [{ rows: enrichedRows, total }, stats, staffOptions, scraperConfig] = await Promise.all([
    getParticularesPage({
      offset: (page - 1) * ANUNCIOS_POR_PAGINA,
      pageSize: ANUNCIOS_POR_PAGINA,
      showRetired,
      filters,
    }),
    statsPromise,
    staffOptionsPromise,
    scraperConfigPromise,
  ]);

  const rows = enrichedRows as unknown as ParticularRow[];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminParticulares.title"
        subtitleKey="adminParticulares.subtitle"
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<UserSearch size={20} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.total"
          helpKey="adminParticulares.stats.help"
          value={stats.total}
          footer={
            Object.keys(zoneCounts.portalCounts).length > 0 ? (
              <p className="text-xs text-ink/50">
                {Object.entries(zoneCounts.portalCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([portal, count]) => `${portal}: ${count}`)
                  .join(" · ")}
              </p>
            ) : undefined
          }
        />
        <StatCard
          icon={<Home size={20} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.rent"
          helpKey="adminParticulares.stats.help"
          value={stats.rent}
        />
        <StatCard
          icon={<Tag size={19} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.sale"
          helpKey="adminParticulares.stats.help"
          value={stats.sale}
        />
        <StatCard
          icon={<Clock size={19} strokeWidth={1.75} />}
          labelKey="adminParticulares.stats.last24h"
          helpKey="adminParticulares.stats.help"
          value={stats.last24h}
        />
      </div>

      <ParticularesScraperSection config={scraperConfig} />

      <ParticularesClient
        rows={rows}
        total={total}
        page={page}
        activeTotal={stats.total}
        retiredTotal={stats.retiredTotal}
        zoneGroups={zoneCounts.zoneGroups}
        currentRole={currentProfile?.role}
        currentUserId={currentProfile?.id}
        staffOptions={staffOptions}
      />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
