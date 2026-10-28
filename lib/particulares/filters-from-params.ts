/**
 * Los filtros de Captaciones como viajan en la URL → `ParticularesFilters` del
 * servidor. LA MISMA lectura para la lista (particulares-page.tsx) y para el
 * mapa (/api/admin/particulares/map): así un filtro nunca vale en una vista y
 * en la otra no. Módulo PURO (sin acceso a la base): lo que necesita la base
 * (distritos de la zona, ids de la zona dibujada) lo resuelve quien llama.
 *
 * Los valores aceptados son una RÉPLICA de los enums de
 * use-particulares-filters.ts (ese hook es "use client"): si cambias un valor
 * allí, cámbialo también aquí.
 */
import { decodeZonePolygons, type ZonePolygon } from "@/lib/zone-polygon";
import type { ParticularesFilters } from "@/lib/db/queries/particulares";

export type SP = Record<string, string | string[] | undefined>;

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const pipeList = (v: string | undefined): string[] => [...new Set((v ?? "").split("|").map((x) => x.trim()).filter(Boolean))].slice(0, 20);
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

export type ParsedParticularesParams = {
  showRetired: boolean;
  showOutOfZone: boolean;
  /** Entradas de la zona elegida ("d:<distrito>", "z:<barrio>") — se resuelven con `resolveZoneNames`. */
  zoneSelections: string[];
  /** Zona dibujada a mano (JSON corrupto o manipulado → [] sin romper nada). */
  drawnPolygons: ZonePolygon[];
  page: number;
  /** Anunciante efectivo: "" = todos. */
  advertiserFilter: "" | "particular" | "professional" | "unknown";
  agencyKeys: string[];
  excludeAgencyKeys: string[];
  searchAllStates: boolean;
  /** Todo lo demás, listo para `applyParticularesFilters`; faltan solo `zoneNames` e `idsInZone`. */
  filters: Omit<ParticularesFilters, "zoneNames" | "idsInZone">;
};

export function parseParticularesParams(sp: SP, currentUserId?: string): ParsedParticularesParams {
  const showRetired = one(sp.retired) === "1";
  // Anuncios fuera de zona (ya no se rastrean): ocultos salvo `?fuera_zona=1`.
  const showOutOfZone = one(sp.fuera_zona) === "1";
  const zoneSelections = (one(sp.zone) ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const drawnPolygons = decodeZonePolygons(one(sp.zonePoly));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // Anunciante: sin parámetro, la lista enseña SOLO particulares (es la
  // herramienta de captación). "all" es el valor EXPLÍCITO para verlo todo;
  // "professional" = agencias, "unknown" = sin clasificar.
  const advertiserParam = pick(one(sp.advertiser), ["all", "particular", "professional", "unknown"] as const);
  const advertiserScope = advertiserParam || "particular";
  const agencyKeys = pipeList(one(sp.agencia));
  const excludeAgencyKeys = pipeList(one(sp.sinAgencia));
  // Búsqueda de texto: mira en TODOS los estados y todos los anunciantes, salvo `soloFiltros=1`.
  const searchAllStates = Boolean(one(sp.q)?.trim()) && one(sp.soloFiltros) !== "1";
  // Con «Con esta agencia» (o buscando) y sin anunciante explícito, el default «particulares» no tiene sentido.
  const advertiserFilter = (
    advertiserScope === "all" || (!advertiserParam && (searchAllStates || agencyKeys.length > 0)) ? "" : advertiserScope
  ) as ParsedParticularesParams["advertiserFilter"];
  // Portal de origen: solo ids "seguros".
  const portalParam = one(sp.portal);
  const portal = portalParam && /^[a-z0-9_.-]{1,30}$/i.test(portalParam) ? portalParam.toLowerCase() : undefined;

  const filters: ParsedParticularesParams["filters"] = {
    search: one(sp.q),
    operation: pick(one(sp.operation), ["rent", "sale"] as const),
    priceMin: numOrUndef(one(sp.priceMin)),
    priceMax: numOrUndef(one(sp.priceMax)),
    bedroomsMin: numOrUndef(one(sp.bedrooms)),
    areaMin: numOrUndef(one(sp.areaMin)),
    last24h: one(sp.last24h) === "1",
    showDuplicates: one(sp.enlazados) === "1",
    showOutOfZone,
    phoneFilter: pick(one(sp.phone), ["no_phone", "with_phone"] as const),
    gestion: pick(one(sp.gestion), ["unmanaged", "contacted", "assigned", "mine"] as const),
    currentUserId,
    advertiser: advertiserFilter,
    agencyKeys: agencyKeys.length ? agencyKeys : undefined,
    excludeAgencyKeys: excludeAgencyKeys.length ? excludeAgencyKeys : undefined,
    searchAllStates,
    portal,
    sort: pick(one(sp.sort), ["oldest", "price_desc", "price_asc", "area_desc", "area_asc"] as const),
    pricePerM2Min: numOrUndef(one(sp.m2Min)),
    pricePerM2Max: numOrUndef(one(sp.m2Max)),
    // "0" es un valor VÁLIDO ("cualquier bajada"): numOrUndef lo devuelve como 0.
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

  return { showRetired, showOutOfZone, zoneSelections, drawnPolygons, page, advertiserFilter, agencyKeys, excludeAgencyKeys, searchAllStates, filters };
}

/**
 * El desplegable de zona es MULTI-selección: "d:Salamanca|z:Lista". Cada
 * distrito se expande a sus barrios con el mismo criterio que ve el
 * desplegable; "z:<barrio>" (o el valor legado sin prefijo) es coincidencia
 * exacta. `undefined` = sin filtro de zona; `[]` = zonas que no existen.
 */
export function resolveZoneNames(
  zoneSelections: string[],
  zoneGroups: Array<{ district: string; zones: Array<{ name: string }> }>,
): string[] | undefined {
  if (zoneSelections.length === 0) return undefined;
  return [
    ...new Set(
      zoneSelections.flatMap((sel) => {
        if (sel.startsWith("d:")) return zoneGroups.find((g) => g.district === sel.slice(2))?.zones.map((z) => z.name) ?? [];
        return [sel.startsWith("z:") ? sel.slice(2) : sel];
      }),
    ),
  ];
}
