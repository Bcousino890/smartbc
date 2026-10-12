import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  getParticularesIdsInPolygons,
  getParticularesPage,
  getParticularesStats,
  getParticularesZoneCounts,
  getStaffOptions,
  type ParticularesFilters,
} from "@/lib/db/queries/particulares";
import { decodeZonePolygons } from "@/lib/zone-polygon";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { ParticularesClient, type ParticularRow } from "./particulares-client";
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
const csv = (v: string | undefined): string[] | undefined => {
  const a = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return a.length ? a : undefined;
};

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
  // Zona dibujada a mano en el mapa (alternativa al desplegable de arriba —
  // ver el comentario de mutua exclusión en use-particulares-filters.ts).
  // Un JSON corrupto o manipulado a mano decodifica a [] sin romper la
  // página, simplemente sin filtro de zona dibujada.
  const drawnPolygons = decodeZonePolygons(one(sp.zonePoly));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // Anunciante: sin parámetro, la lista enseña SOLO particulares (es la
  // herramienta de captación; las agencias eran ≈78 % de lo que se veía y
  // tapaban lo que interesa). "all" es el valor EXPLÍCITO para verlo todo;
  // "professional" = agencias, "unknown" = sin clasificar. Ver el mismo
  // criterio en use-particulares-filters.ts (ahí vive el default en cliente).
  const advertiserScope =
    pick(one(sp.advertiser), ["all", "particular", "professional", "unknown"] as const) || "particular";
  const advertiserFilter = advertiserScope === "all" ? "" : advertiserScope;
  // Portal de origen: solo ids "seguros" (letras, cifras, punto/guion). El
  // valor llega a un .eq() parametrizado, pero un id raro no aporta nada.
  const portalParam = one(sp.portal);
  const portal = portalParam && /^[a-z0-9_.-]{1,30}$/i.test(portalParam) ? portalParam.toLowerCase() : undefined;

  // Arrancan ya, en paralelo — solo la query principal necesita esperar a
  // zoneCounts (para resolver "d:<distrito>", ver abajo) e idsInZone (para
  // resolver la zona dibujada), el resto no depende de nada de esto.
  // El desplegable de zonas cuenta lo mismo que enseña la lista (mismo tipo de
  // anunciante), si no, "Chamberí (900)" prometería agencias que no se ven.
  const zoneCountsPromise = getParticularesZoneCounts(showRetired, advertiserFilter);
  const statsPromise = getParticularesStats();
  const staffOptionsPromise = getStaffOptions().catch(() => []);
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
  // El desplegable de zona es MULTI-selección: el parámetro puede traer
  // varias entradas separadas por "|" ("d:Salamanca|z:Lista"). Se usa "|" y
  // no "," porque algún distrito lleva coma en el nombre. Un valor de una
  // sola entrada (o el legado sin prefijo) sigue funcionando igual: split
  // devuelve un array de uno.
  const zoneSelections = zoneParam.split("|").map((s) => s.trim()).filter(Boolean);
  const zoneNames = zoneSelections.length
    ? [
        ...new Set(
          zoneSelections.flatMap((sel) => {
            if (sel.startsWith("d:")) {
              // Distrito → todos sus barrios, con el mismo criterio que el desplegable.
              return zoneCounts.zoneGroups.find((g) => g.district === sel.slice(2))?.zones.map((z) => z.name) ?? [];
            }
            // "z:<barrio>" o valor legado sin prefijo: coincidencia exacta.
            return [sel.startsWith("z:") ? sel.slice(2) : sel];
          }),
        ),
      ]
    : undefined;
  const idsInZone = drawnPolygons.length > 0 ? await idsInZonePromise : undefined;

  const filters: ParticularesFilters = {
    search: one(sp.q),
    operation: pick(one(sp.operation), ["rent", "sale"] as const),
    zoneNames,
    idsInZone,
    priceMin: numOrUndef(one(sp.priceMin)),
    priceMax: numOrUndef(one(sp.priceMax)),
    bedroomsMin: numOrUndef(one(sp.bedrooms)),
    areaMin: numOrUndef(one(sp.areaMin)),
    last24h: one(sp.last24h) === "1",
    showDuplicates: one(sp.enlazados) === "1",
    phoneFilter: pick(one(sp.phone), ["no_phone", "with_phone"] as const),
    gestion: pick(one(sp.gestion), ["unmanaged", "contacted", "assigned", "mine"] as const),
    currentUserId: currentProfile?.id,
    advertiser: advertiserFilter,
    portal,
    sort: pick(one(sp.sort), ["oldest", "price_desc", "price_asc", "area_desc", "area_asc"] as const),
    pricePerM2Min: numOrUndef(one(sp.m2Min)),
    pricePerM2Max: numOrUndef(one(sp.m2Max)),
    // "0" es un valor VÁLIDO aquí ("cualquier bajada"), así que no vale el
    // `if (!v)` de numOrUndef… salvo que numOrUndef ya lo trata: "0" es
    // truthy como string, así que devuelve 0 correctamente.
    priceDropMinPct: numOrUndef(one(sp.drop)),
    minDaysListed: numOrUndef(one(sp.dias)),
    lift: pick(one(sp.ascensor), ["yes", "no"] as const),
    condition: csv(one(sp.estado)),
    yearBuiltMin: numOrUndef(one(sp.anioMin)),
    yearBuiltMax: numOrUndef(one(sp.anioMax)),
    bathroomsMin: numOrUndef(one(sp.banos)),
    floorMin: numOrUndef(one(sp.floorMin)),
    floorMax: numOrUndef(one(sp.plantaMax)),
    extras: csv(one(sp.extras)),
    types: csv(one(sp.tipo)),
    energy: csv(one(sp.energia)),
    orientation: one(sp.orientacion) || undefined,
    sinceDays: numOrUndef(one(sp.desde)),
    bedroomsExact: one(sp.dormExacto) === "1",
    bathroomsExact: one(sp.banosExacto) === "1",
    areaMax: numOrUndef(one(sp.areaMax)),
    maxDaysListed: numOrUndef(one(sp.diasMax)),
    plotMin: numOrUndef(one(sp.parcelaMin)),
    plotMax: numOrUndef(one(sp.parcelaMax)),
    exactLocation: one(sp.ubicExacta) === "1",
    furnished: pick(one(sp.amueblado), ["yes", "no"] as const),
    rentalKind: pick(one(sp.alquiler), ["larga", "temporada"] as const),
  };
  // El amueblado ya se filtra en servidor con las etiquetas de `attrs` (0183).

  const [{ rows: enrichedRows, total, failed }, stats, staffOptions, scraperConfig] = await Promise.all([
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
      />
    </div>
  );
}
