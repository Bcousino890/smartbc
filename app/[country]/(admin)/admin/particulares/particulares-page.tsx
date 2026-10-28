import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  getParticularesAgencyNames,
  getParticularesIdsInPolygons,
  getParticularesPage,
  getParticularesStats,
  getParticularesZoneCounts,
  getStaffOptionsCached,
  type ParticularesFilters,
} from "@/lib/db/queries/particulares";
import { one, parseParticularesParams, resolveZoneNames, type SP } from "@/lib/particulares/filters-from-params";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { ParticularesClient, type ParticularRow } from "./particulares-client";
import { ANUNCIOS_POR_PAGINA } from "./constants";
import { getIdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { polygonBounds } from "@/lib/geo/zone-geometry";

export const dynamic = "force-dynamic";

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
  // Enlaces antiguos al diálogo «Configuración de scrapers»: ahora vive en Sindicación.
  if (one(sp.scrapers) || one(sp.scraper)) {
    redirect(`${getCountryConfig(country).prefix}/sindicacion?tab=portales`);
  }
  // Los filtros de la URL se leen con la MISMA función que el mapa (lib/particulares/filters-from-params.ts).
  const parsed = parseParticularesParams(sp, currentProfile?.id);
  const { showRetired, showOutOfZone, drawnPolygons, page, advertiserFilter, agencyKeys, excludeAgencyKeys } = parsed;

  // Arrancan ya, en paralelo — solo la query principal necesita esperar a
  // zoneCounts (para resolver "d:<distrito>", ver abajo) e idsInZone (para
  // resolver la zona dibujada), el resto no depende de nada de esto.
  // El desplegable de zonas cuenta lo mismo que enseña la lista (mismo tipo de
  // anunciante), si no, "Chamberí (900)" prometería agencias que no se ven.
  const zoneCountsPromise = getParticularesZoneCounts(showRetired, advertiserFilter, showOutOfZone);
  const statsPromise = getParticularesStats();
  const staffOptionsPromise = getStaffOptionsCached().catch(() => []);
  const scraperConfigPromise = getIdealistaScraperConfig();
  // Mismo criterio que getParticularesZoneCounts: solo 3 columnas cortas
  // (id/latitude/longitude) recorridas una vez, nunca la fila enriquecida
  // completa — ver el comentario de getParticularesIdsInPolygons().
  const idsInZonePromise = getParticularesIdsInPolygons(drawnPolygons, showRetired);

  // Conteos de zona para el desplegable — antes salían de recorrer las 10.7k
  // filas enriquecidas en el cliente; ahora es un fetch aparte, ligero (ver
  // getParticularesZoneCounts). De paso resuelve "d:<distrito>" a la lista
  // EXACTA de `zone` crudos de ese distrito, para que el filtro principal use
  // el mismo criterio que ve el desplegable en vez de reimplementar
  // normalizeZone() en SQL.
  const zoneCounts = await zoneCountsPromise;
  const zoneNames = resolveZoneNames(parsed.zoneSelections, zoneCounts.zoneGroups);
  const idsInZone = drawnPolygons.length > 0 ? await idsInZonePromise : undefined;

  const zoneBbox = drawnPolygons.length > 0 ? (polygonBounds(drawnPolygons) ?? undefined) : undefined;
  const filters: ParticularesFilters = { ...parsed.filters, zoneNames, idsInZone, zoneBbox };
  // El amueblado ya se filtra en servidor con las etiquetas de `attrs` (0183).

  const agencyNamesPromise = getParticularesAgencyNames([...agencyKeys, ...excludeAgencyKeys]).catch(() => ({}));
  const [{ rows: enrichedRows, total, failed }, stats, staffOptions, scraperConfig, agencyNames] = await Promise.all([
    getParticularesPage({
      offset: (page - 1) * ANUNCIOS_POR_PAGINA,
      pageSize: ANUNCIOS_POR_PAGINA,
      showRetired,
      filters,
    }),
    statsPromise,
    staffOptionsPromise,
    scraperConfigPromise,
    agencyNamesPromise,
  ]);

  const rows = enrichedRows as unknown as ParticularRow[];

  return (
    // Sin `min-h-screen` ni pie: tras la paginación solo queda el margen
    // inferior. El layout del CRM ya da la altura mínima de la página.
    <div className="mx-auto max-w-[1400px] px-4 pb-8 sm:px-6 lg:px-10">
      <AdminPageHeader
        titleKey="adminParticulares.title"
        subtitleKey="adminParticulares.subtitle"
      />

      <ParticularesClient
        rows={rows}
        total={total}
        page={page}
        activeTotal={stats.total}
        retiredTotal={stats.retiredTotal}
        withPhoneTotal={stats.withPhone}
        stats={stats}
        portalCounts={zoneCounts.portalCounts}
        loadFailed={failed}
        scraperConfig={scraperConfig}
        zoneGroups={zoneCounts.zoneGroups}
        currentRole={currentProfile?.role}
        currentUserId={currentProfile?.id}
        staffOptions={staffOptions}
        agencyNames={agencyNames}
      />
    </div>
  );
}
