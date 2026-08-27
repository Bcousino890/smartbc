"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type OperationFilter = "" | "rent" | "sale";
export type PhoneFilterValue = "" | "no_phone" | "with_phone";
export type GestionFilter = "" | "unmanaged" | "contacted" | "assigned" | "mine";
export type AdvertiserFilter = "" | "particular" | "professional" | "unknown";
export type FurnishedFilter = "" | "yes" | "no";
// Debe seguir a ParticularesSort en lib/db/queries/particulares.ts (ese
// módulo es server-only, no se puede importar desde este "use client").
export type SortFilter = "" | "oldest" | "price_desc" | "price_asc" | "area_desc" | "area_asc";

const OPERATION_VALUES = new Set(["rent", "sale"]);
const PHONE_VALUES = new Set(["no_phone", "with_phone"]);
const GESTION_VALUES = new Set(["unmanaged", "contacted", "assigned", "mine"]);
const ADVERTISER_VALUES = new Set(["particular", "professional", "unknown"]);
const FURNISHED_VALUES = new Set(["yes", "no"]);
const SORT_VALUES = new Set(["oldest", "price_desc", "price_asc", "area_desc", "area_asc"]);

function readEnum<T extends string>(
  value: string | null,
  allowed: Set<string>,
): T | "" {
  return value && allowed.has(value) ? (value as T) : "";
}

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
  phoneFilter: PhoneFilterValue;
  gestion: GestionFilter;
  advertiser: AdvertiserFilter;
  furnished: FurnishedFilter;
  sort: SortFilter;
  showRetired: boolean;
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
  phoneFilter: "phone",
  gestion: "gestion",
  advertiser: "advertiser",
  furnished: "amueblado",
  sort: "sort",
  showRetired: "retired",
};

const DEBOUNCED_FIELDS = new Set<keyof FilterValues>([
  "query",
  "priceMin",
  "priceMax",
  "bedrooms",
  "floorMin",
  "areaMin",
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
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilterValue>(() =>
    readEnum<PhoneFilterValue>(searchParams.get(PARAM_KEYS.phoneFilter), PHONE_VALUES),
  );
  const [gestion, setGestion] = useState<GestionFilter>(() =>
    readEnum<GestionFilter>(searchParams.get(PARAM_KEYS.gestion), GESTION_VALUES),
  );
  const [advertiser, setAdvertiser] = useState<AdvertiserFilter>(() =>
    readEnum<AdvertiserFilter>(searchParams.get(PARAM_KEYS.advertiser), ADVERTISER_VALUES),
  );
  const [furnished, setFurnished] = useState<FurnishedFilter>(() =>
    readEnum<FurnishedFilter>(searchParams.get(PARAM_KEYS.furnished), FURNISHED_VALUES),
  );
  const [sort, setSort] = useState<SortFilter>(() =>
    readEnum<SortFilter>(searchParams.get(PARAM_KEYS.sort), SORT_VALUES),
  );
  const [showRetired, setShowRetired] = useState(() => searchParams.get(PARAM_KEYS.showRetired) === "1");

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
    phoneFilter,
    gestion,
    advertiser,
    furnished,
    sort,
    showRetired,
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
        params.set(PARAM_KEYS[key], v === true ? "1" : String(v));
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
    phoneFilter,
    gestion,
    advertiser,
    furnished,
    sort,
    showRetired,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
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
    phoneFilter,
    setPhoneFilter,
    gestion,
    setGestion,
    advertiser,
    setAdvertiser,
    furnished,
    setFurnished,
    sort,
    setSort,
    showRetired,
    setShowRetired,
  };
}
