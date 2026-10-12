import { decodeZonePolygons } from "@/lib/zone-polygon";
import { DEFAULT_ADVERTISER, type ParticularesFiltersApi } from "../use-particulares-filters";
import { fmtEur, fmtNum, portalName } from "./format";

// Etiquetas y chips de filtros activos. Un único sitio para los textos: los
// usan el panel (opciones), la barra y los chips quitables.

export const ZONE_SEP = "|";

export const GESTION_LABEL: Record<string, string> = {
  unmanaged: "Sin gestionar",
  contacted: "Ya contactados",
  assigned: "Asignados",
  mine: "Asignados a mí",
};
export const CONDITION_LABEL: Record<string, string> = {
  good: "Buen estado",
  renovated: "Reformado / nuevo",
  to_reform: "A reformar",
};
export const ADVERTISER_LABEL: Record<string, string> = {
  all: "Todos los anunciantes",
  particular: "Particulares",
  professional: "Agencias",
  unknown: "Sin clasificar",
};

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
  /** `scope` = el anunciante por defecto: se ve, pero no cuenta como filtro añadido. */
  tone?: "default" | "scope";
};

const money = (v: string) => fmtEur(Number(v));

/** Chips de todos los filtros activos, con su forma de quitarlos uno a uno. */
export function buildChips(f: ParticularesFiltersApi): FilterChip[] {
  const chips: FilterChip[] = [];
  const q = f.query.trim();

  if (q) chips.push({ id: "q", label: `«${q.length > 28 ? `${q.slice(0, 28)}…` : q}»`, onRemove: () => f.setQuery("") });

  if (f.operation) {
    chips.push({ id: "op", label: f.operation === "sale" ? "Venta" : "Alquiler", onRemove: () => f.setOperation("") });
  }

  if (f.advertiser !== "all") {
    chips.push({
      id: "adv",
      label: ADVERTISER_LABEL[f.advertiser] ?? f.advertiser,
      tone: f.advertiser === DEFAULT_ADVERTISER ? "scope" : "default",
      // Quitar «Particulares» (lo normal) abre a todos; quitar otro vuelve al normal.
      onRemove: () => f.setAdvertiser(f.advertiser === DEFAULT_ADVERTISER ? "all" : DEFAULT_ADVERTISER),
    });
  }

  if (f.portal) chips.push({ id: "portal", label: portalName(f.portal), onRemove: () => f.setPortal("") });

  // Zona: cada distrito/barrio elegido es su propio chip.
  const zones = f.zone.split(ZONE_SEP).map((s) => s.trim()).filter(Boolean);
  for (const z of zones) {
    const label = z.startsWith("d:") ? `Todo ${z.slice(2)}` : z.startsWith("z:") ? z.slice(2) : z;
    chips.push({
      id: `zone:${z}`,
      label,
      onRemove: () => f.setZone(zones.filter((x) => x !== z).join(ZONE_SEP)),
    });
  }
  const polys = decodeZonePolygons(f.drawnZone).length;
  if (polys > 0) {
    chips.push({
      id: "poly",
      label: polys === 1 ? "Zona dibujada" : `${polys} zonas dibujadas`,
      onRemove: () => f.setDrawnZone(""),
    });
  }

  if (f.priceMin || f.priceMax) {
    const label =
      f.priceMin && f.priceMax
        ? `${money(f.priceMin)} – ${money(f.priceMax)}`
        : f.priceMin
          ? `Desde ${money(f.priceMin)}`
          : `Hasta ${money(f.priceMax)}`;
    chips.push({
      id: "price",
      label,
      onRemove: () => {
        f.setPriceMin("");
        f.setPriceMax("");
      },
    });
  }
  if (f.bedrooms) chips.push({ id: "beds", label: `${f.bedrooms}+ hab.`, onRemove: () => f.setBedrooms("") });
  if (f.areaMin) chips.push({ id: "area", label: `Desde ${fmtNum(Number(f.areaMin))} m²`, onRemove: () => f.setAreaMin("") });
  if (f.floorMin) chips.push({ id: "floor", label: `Planta ${f.floorMin}.ª o más`, onRemove: () => f.setFloorMin("") });
  if (f.furnished) chips.push({ id: "furn", label: f.furnished === "yes" ? "Amueblado" : "Sin amueblar", onRemove: () => f.setFurnished("") });
  if (f.pricePerM2Min || f.pricePerM2Max) {
    const a = f.pricePerM2Min ? fmtNum(Number(f.pricePerM2Min)) : "";
    const b = f.pricePerM2Max ? fmtNum(Number(f.pricePerM2Max)) : "";
    chips.push({
      id: "m2price",
      label: a && b ? `${a} – ${b} €/m²` : a ? `Desde ${a} €/m²` : `Hasta ${b} €/m²`,
      onRemove: () => {
        f.setPricePerM2Min("");
        f.setPricePerM2Max("");
      },
    });
  }
  if (f.priceDrop !== "") {
    chips.push({
      id: "drop",
      label: f.priceDrop === "0" ? "Ha bajado de precio" : `Bajó ≥ ${f.priceDrop} %`,
      onRemove: () => f.setPriceDrop(""),
    });
  }
  if (f.daysListed) chips.push({ id: "days", label: `Más de ${f.daysListed} días en cartera`, onRemove: () => f.setDaysListed("") });
  if (f.last24h) chips.push({ id: "24h", label: "Últimas 24 h", onRemove: () => f.setLast24h(false) });
  if (f.phoneFilter) {
    chips.push({ id: "phone", label: f.phoneFilter === "with_phone" ? "Con teléfono" : "Sin teléfono", onRemove: () => f.setPhoneFilter("") });
  }
  if (f.gestion) chips.push({ id: "gestion", label: GESTION_LABEL[f.gestion] ?? f.gestion, onRemove: () => f.setGestion("") });
  if (f.lift) chips.push({ id: "lift", label: f.lift === "yes" ? "Con ascensor" : "Sin ascensor", onRemove: () => f.setLift("") });
  if (f.condition) chips.push({ id: "cond", label: CONDITION_LABEL[f.condition] ?? f.condition, onRemove: () => f.setCondition("") });
  if (f.yearMin || f.yearMax) {
    chips.push({
      id: "year",
      label: f.yearMin && f.yearMax ? `Construido ${f.yearMin}–${f.yearMax}` : f.yearMin ? `Construido desde ${f.yearMin}` : `Construido hasta ${f.yearMax}`,
      onRemove: () => {
        f.setYearMin("");
        f.setYearMax("");
      },
    });
  }
  if (f.showLinked) chips.push({ id: "linked", label: "Con anuncios enlazados", onRemove: () => f.setShowLinked(false) });

  return chips;
}

/**
 * Filtros activos que viven SOLO en el panel «Más filtros» (los de la barra —
 * búsqueda, operación, anunciante, zona, portal— ya se ven ahí): es el número
 * del botón.
 */
export function countPanelFilters(f: ParticularesFiltersApi): number {
  let n = 0;
  if (f.priceMin || f.priceMax) n++;
  if (f.bedrooms) n++;
  if (f.areaMin) n++;
  if (f.floorMin) n++;
  if (f.furnished) n++;
  if (f.pricePerM2Min || f.pricePerM2Max) n++;
  if (f.priceDrop !== "") n++;
  if (f.daysListed) n++;
  if (f.last24h) n++;
  if (f.phoneFilter) n++;
  if (f.gestion) n++;
  if (f.lift) n++;
  if (f.condition) n++;
  if (f.yearMin || f.yearMax) n++;
  if (f.showLinked) n++;
  if (decodeZonePolygons(f.drawnZone).length > 0) n++;
  return n;
}
