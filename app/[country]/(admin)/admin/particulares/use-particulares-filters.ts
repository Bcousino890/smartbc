"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

export type OperationFilter = "" | "rent" | "sale";
export type PhoneFilterValue = "" | "no_phone" | "with_phone";
export type GestionFilter = "" | "unmanaged" | "contacted" | "assigned" | "mine";
// "particular" es el valor POR DEFECTO (la lista es una herramienta de captación:
// sin parámetro solo se ven particulares) y no viaja en la URL; "all" es el
// valor explícito para ver todos los anunciantes. Ver page.tsx para el espejo
// en servidor.
export type AdvertiserFilter = "all" | "particular" | "professional" | "unknown";
export const DEFAULT_ADVERTISER: AdvertiserFilter = "particular";
export type FurnishedFilter = "" | "yes" | "no";
// Debe seguir a ParticularesSort en lib/db/queries/particulares.ts (ese
// módulo es server-only, no se puede importar desde este "use client").
export type SortFilter = "" | "oldest" | "price_desc" | "price_asc" | "area_desc" | "area_asc";
export type LiftFilter = "" | "yes" | "no";
export type ConditionFilter = "" | "good" | "to_reform" | "renovated";

const OPERATION_VALUES = new Set(["rent", "sale"]);
const PHONE_VALUES = new Set(["no_phone", "with_phone"]);
const GESTION_VALUES = new Set(["unmanaged", "contacted", "assigned", "mine"]);
const ADVERTISER_VALUES = new Set(["all", "particular", "professional", "unknown"]);
const FURNISHED_VALUES = new Set(["yes", "no"]);
const SORT_VALUES = new Set(["oldest", "price_desc", "price_asc", "area_desc", "area_asc"]);
const LIFT_VALUES = new Set(["yes", "no"]);
const CONDITION_VALUES = new Set(["good", "to_reform", "renovated"]);

function readEnum<T extends string>(
  value: string | null,
  allowed: Set<string>,
): T | "" {
  return value && allowed.has(value) ? (value as T) : "";
}

// Valores que NO se escriben en la URL porque son lo que se asume sin
// parámetro (el servidor aplica el mismo default). Todo lo demás que esté
// "" o false tampoco se escribe.
const URL_DEFAULTS: Partial<Record<keyof FilterValues, string>> = {
  advertiser: DEFAULT_ADVERTISER,
};

// Nombre de cada filtro en la URL (cortos, para que el link compartido no
// sea kilométrico) y si su escritura a la URL se debounced. Los campos de
// texto/número se debounced 250ms (no vale la pena reescribir la URL en
// cada tecla); los selects/checkboxes se escriben al instante.
const DEBOUNCE_MS = 250;

type FilterValues = {
  query: string;
  operation: OperationFilter;
  zone: string;
  /** JSON de ZonePolygon[] (o "") — ver lib/zone-polygon.ts. Alternativa al
   *  desplegable `zone`: dibujar una zona en el mapa y elegir distrito/barrio
   *  son dos formas de acotar por ubicación que NO se combinan (ver
   *  setZone/setDrawnZone abajo, que se limpian mutuamente). */
  drawnZone: string;
  priceMin: string;
  priceMax: string;
  bedrooms: string;
  floorMin: string;
  areaMin: string;
  last24h: boolean;
  /** Mostrar también los anuncios enlazados (copias del mismo inmueble). */
  showLinked: boolean;
  phoneFilter: PhoneFilterValue;
  gestion: GestionFilter;
  advertiser: AdvertiserFilter;
  /** Portal de origen ("idealista", "fotocasa", "pisos"…) o "". */
  portal: string;
  furnished: FurnishedFilter;
  sort: SortFilter;
  pricePerM2Min: string;
  pricePerM2Max: string;
  /** "" | "0" (cualquier bajada) | "5" | "10" | "15" — % mínimo. */
  priceDrop: string;
  /** "" | "7" | "15" | "30" | "60" | "90" — detectado hace más de N días. */
  daysListed: string;
  lift: LiftFilter;
  condition: ConditionFilter;
  yearMin: string;
  yearMax: string;
  showRetired: boolean;
  /** Baños mínimos. */
  bathrooms: string;
  /** Etiquetas separadas por coma que el anuncio debe tener (piscina,terraza…). */
  extras: string;
  /** Tipos de inmueble separados por coma (cualquiera). */
  types: string;
  /** Letras de eficiencia energética separadas por coma. */
  energy: string;
  /** sur | norte | este | oeste */
  orientation: string;
  /** Detectado en los últimos N días: "1" | "2" | "7" | "30". */
  since: string;
};

const PARAM_KEYS: Record<keyof FilterValues, string> = {
  query: "q",
  operation: "operation",
  zone: "zone",
  drawnZone: "zonePoly",
  priceMin: "priceMin",
  priceMax: "priceMax",
  bedrooms: "bedrooms",
  floorMin: "floorMin",
  areaMin: "areaMin",
  last24h: "last24h",
  showLinked: "enlazados",
  phoneFilter: "phone",
  gestion: "gestion",
  advertiser: "advertiser",
  portal: "portal",
  furnished: "amueblado",
  sort: "sort",
  pricePerM2Min: "m2Min",
  pricePerM2Max: "m2Max",
  priceDrop: "drop",
  daysListed: "dias",
  lift: "ascensor",
  condition: "estado",
  yearMin: "anioMin",
  yearMax: "anioMax",
  showRetired: "retired",
  bathrooms: "banos",
  extras: "extras",
  types: "tipo",
  energy: "energia",
  orientation: "orientacion",
  since: "desde",
};

const DEBOUNCED_FIELDS = new Set<keyof FilterValues>([
  "query",
  "priceMin",
  "priceMax",
  "bedrooms",
  "floorMin",
  "areaMin",
  "pricePerM2Min",
  "pricePerM2Max",
  "yearMin",
  "yearMax",
  "bathrooms",
]);

/**
 * Filtros del listado de particulares, sincronizados con la URL
 * (`useSearchParams`/`router.replace`) para que se conserven al refrescar,
 * se puedan compartir por link, y el botón "atrás" del navegador los
 * recorra. La URL se lee una sola vez al montar como valor inicial de cada
 * `useState`; cambios posteriores de la URL (ej. "atrás") no re-sincronizan
 * el estado en caliente, para no pelear con lo que el usuario está
 * tecleando.
 */
export function useParticularesFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // La navegación a la URL nueva va en una transición: `pending` es true
  // mientras el servidor resuelve la consulta, para que la lista pueda enseñar
  // esqueletos en vez de seguir mostrando datos que ya no corresponden.
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState(() => searchParams.get(PARAM_KEYS.query) ?? "");
  const [operation, setOperation] = useState<OperationFilter>(() =>
    readEnum<OperationFilter>(searchParams.get(PARAM_KEYS.operation), OPERATION_VALUES),
  );
  const [zone, setZoneRaw] = useState(() => searchParams.get(PARAM_KEYS.zone) ?? "");
  const [drawnZone, setDrawnZoneRaw] = useState(() => searchParams.get(PARAM_KEYS.drawnZone) ?? "");
  const [priceMin, setPriceMin] = useState(() => searchParams.get(PARAM_KEYS.priceMin) ?? "");
  const [priceMax, setPriceMax] = useState(() => searchParams.get(PARAM_KEYS.priceMax) ?? "");
  const [bedrooms, setBedrooms] = useState(() => searchParams.get(PARAM_KEYS.bedrooms) ?? "");
  const [floorMin, setFloorMin] = useState(() => searchParams.get(PARAM_KEYS.floorMin) ?? "");
  const [areaMin, setAreaMin] = useState(() => searchParams.get(PARAM_KEYS.areaMin) ?? "");
  const [last24h, setLast24h] = useState(() => searchParams.get(PARAM_KEYS.last24h) === "1");
  const [showLinked, setShowLinked] = useState(() => searchParams.get(PARAM_KEYS.showLinked) === "1");
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilterValue>(() =>
    readEnum<PhoneFilterValue>(searchParams.get(PARAM_KEYS.phoneFilter), PHONE_VALUES),
  );
  const [gestion, setGestion] = useState<GestionFilter>(() =>
    readEnum<GestionFilter>(searchParams.get(PARAM_KEYS.gestion), GESTION_VALUES),
  );
  const [advertiser, setAdvertiser] = useState<AdvertiserFilter>(
    () => readEnum<AdvertiserFilter>(searchParams.get(PARAM_KEYS.advertiser), ADVERTISER_VALUES) || DEFAULT_ADVERTISER,
  );
  const [portal, setPortal] = useState(() => searchParams.get(PARAM_KEYS.portal) ?? "");
  const [furnished, setFurnished] = useState<FurnishedFilter>(() =>
    readEnum<FurnishedFilter>(searchParams.get(PARAM_KEYS.furnished), FURNISHED_VALUES),
  );
  const [sort, setSort] = useState<SortFilter>(() =>
    readEnum<SortFilter>(searchParams.get(PARAM_KEYS.sort), SORT_VALUES),
  );
  const [pricePerM2Min, setPricePerM2Min] = useState(() => searchParams.get(PARAM_KEYS.pricePerM2Min) ?? "");
  const [pricePerM2Max, setPricePerM2Max] = useState(() => searchParams.get(PARAM_KEYS.pricePerM2Max) ?? "");
  const [priceDrop, setPriceDrop] = useState(() => searchParams.get(PARAM_KEYS.priceDrop) ?? "");
  const [daysListed, setDaysListed] = useState(() => searchParams.get(PARAM_KEYS.daysListed) ?? "");
  const [lift, setLift] = useState<LiftFilter>(() =>
    readEnum<LiftFilter>(searchParams.get(PARAM_KEYS.lift), LIFT_VALUES),
  );
  const [condition, setCondition] = useState<ConditionFilter>(() =>
    readEnum<ConditionFilter>(searchParams.get(PARAM_KEYS.condition), CONDITION_VALUES),
  );
  const [yearMin, setYearMin] = useState(() => searchParams.get(PARAM_KEYS.yearMin) ?? "");
  const [yearMax, setYearMax] = useState(() => searchParams.get(PARAM_KEYS.yearMax) ?? "");
  const [showRetired, setShowRetired] = useState(() => searchParams.get(PARAM_KEYS.showRetired) === "1");
  const [bathrooms, setBathrooms] = useState(() => searchParams.get(PARAM_KEYS.bathrooms) ?? "");
  const [extras, setExtras] = useState(() => searchParams.get(PARAM_KEYS.extras) ?? "");
  const [types, setTypes] = useState(() => searchParams.get(PARAM_KEYS.types) ?? "");
  const [energy, setEnergy] = useState(() => searchParams.get(PARAM_KEYS.energy) ?? "");
  const [orientation, setOrientation] = useState(() => searchParams.get(PARAM_KEYS.orientation) ?? "");
  const [since, setSince] = useState(() => searchParams.get(PARAM_KEYS.since) ?? "");

  // Dibujar una zona y elegir distrito/barrio son dos formas ALTERNATIVAS de
  // acotar por ubicación, no combinables (ver el comentario de FilterValues):
  // activar una limpia la otra en vez de dejarlas apilarse como AND, que
  // confundiría más de lo que ayuda en una primera versión.
  function setZone(v: string) {
    setZoneRaw(v);
    if (v) setDrawnZoneRaw("");
  }
  function setDrawnZone(v: string) {
    setDrawnZoneRaw(v);
    if (v) setZoneRaw("");
  }

  const values: FilterValues = {
    query,
    operation,
    zone,
    drawnZone,
    priceMin,
    priceMax,
    bedrooms,
    floorMin,
    areaMin,
    last24h,
    showLinked,
    phoneFilter,
    gestion,
    advertiser,
    portal,
    furnished,
    sort,
    pricePerM2Min,
    pricePerM2Max,
    priceDrop,
    daysListed,
    lift,
    condition,
    yearMin,
    yearMax,
    showRetired,
    bathrooms,
    extras,
    types,
    energy,
    orientation,
    since,
  };

  const prevValuesRef = useRef(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevValuesRef.current;
    const changedKeys = (Object.keys(values) as (keyof FilterValues)[]).filter(
      (k) => values[k] !== prev[k],
    );
    prevValuesRef.current = values;
    if (changedKeys.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    function flush() {
      const params = new URLSearchParams();
      for (const key of Object.keys(PARAM_KEYS) as (keyof FilterValues)[]) {
        const v = values[key];
        if (v === "" || v === false) continue;
        if (URL_DEFAULTS[key] !== undefined && v === URL_DEFAULTS[key]) continue;
        params.set(PARAM_KEYS[key], v === true ? "1" : String(v));
      }
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }

    const needsImmediate = changedKeys.some((k) => !DEBOUNCED_FIELDS.has(k));
    if (needsImmediate) {
      flush();
    } else {
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    operation,
    zone,
    drawnZone,
    priceMin,
    priceMax,
    bedrooms,
    floorMin,
    areaMin,
    last24h,
    showLinked,
    phoneFilter,
    gestion,
    advertiser,
    portal,
    furnished,
    sort,
    pricePerM2Min,
    pricePerM2Max,
    priceDrop,
    daysListed,
    lift,
    condition,
    yearMin,
    yearMax,
    showRetired,
    bathrooms,
    extras,
    types,
    energy,
    orientation,
    since,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // "Limpiar todo": deja los filtros como al entrar (anunciante = particulares)
  // pero conserva la pestaña Activos/Retirados y el orden, que no son filtros
  // sino la vista que el usuario ha elegido.
  const clearAll = useCallback(() => {
    setQuery("");
    setOperation("");
    setZoneRaw("");
    setDrawnZoneRaw("");
    setPriceMin("");
    setPriceMax("");
    setBedrooms("");
    setFloorMin("");
    setAreaMin("");
    setLast24h(false);
    setShowLinked(false);
    setPhoneFilter("");
    setGestion("");
    setAdvertiser(DEFAULT_ADVERTISER);
    setPortal("");
    setFurnished("");
    setPricePerM2Min("");
    setPricePerM2Max("");
    setPriceDrop("");
    setDaysListed("");
    setLift("");
    setCondition("");
    setYearMin("");
    setYearMax("");
    setBathrooms("");
    setExtras("");
    setTypes("");
    setEnergy("");
    setOrientation("");
    setSince("");
  }, []);

  return {
    pending,
    clearAll,
    query,
    setQuery,
    operation,
    setOperation,
    zone,
    setZone,
    drawnZone,
    setDrawnZone,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    bedrooms,
    setBedrooms,
    floorMin,
    setFloorMin,
    areaMin,
    setAreaMin,
    last24h,
    setLast24h,
    showLinked,
    setShowLinked,
    phoneFilter,
    setPhoneFilter,
    gestion,
    setGestion,
    advertiser,
    setAdvertiser,
    portal,
    setPortal,
    furnished,
    setFurnished,
    sort,
    setSort,
    pricePerM2Min,
    setPricePerM2Min,
    pricePerM2Max,
    setPricePerM2Max,
    priceDrop,
    setPriceDrop,
    daysListed,
    setDaysListed,
    lift,
    setLift,
    condition,
    setCondition,
    yearMin,
    setYearMin,
    yearMax,
    setYearMax,
    showRetired,
    setShowRetired,
    bathrooms,
    setBathrooms,
    extras,
    setExtras,
    types,
    setTypes,
    energy,
    setEnergy,
    orientation,
    setOrientation,
    since,
    setSince,
  };
}

/** Lo que devuelve el hook: se pasa tal cual a la barra, el panel y los chips. */
export type ParticularesFiltersApi = ReturnType<typeof useParticularesFilters>;
