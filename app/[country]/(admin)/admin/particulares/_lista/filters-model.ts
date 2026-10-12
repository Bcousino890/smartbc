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
  nuevo: "Nuevo",
  usado: "Usado",
  muy_bueno: "Muy buen estado",
  bueno: "Buen estado",
  reformar: "Para reformar",
  reformado: "Reformado",
  // valores de enlaces antiguos
  good: "Buen estado",
  renovated: "Reformado / nuevo",
  to_reform: "Para reformar",
};
export const CONDITION_OPTIONS = ["nuevo", "usado", "muy_bueno", "bueno", "reformar", "reformado"].map((value) => ({
  value,
  label: CONDITION_LABEL[value],
}));
export const RENTAL_KIND_LABEL: Record<string, string> = { larga: "Larga duración", temporada: "De temporada" };
export const ADVERTISER_LABEL: Record<string, string> = {
  all: "Todos los anunciantes",
  particular: "Particulares",
  professional: "Agencias",
  unknown: "Sin clasificar",
};

/** Tipos de inmueble en árbol (etiquetas `attrs`; basta con una de las marcadas). */
export const TYPE_GROUPS: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
  {
    label: "Pisos",
    options: [
      { value: "estudio", label: "Estudio" },
      { value: "atico", label: "Ático" },
      { value: "duplex", label: "Dúplex" },
      { value: "loft", label: "Loft" },
    ],
  },
  {
    label: "Casas",
    options: [
      { value: "chalet", label: "Chalet independiente" },
      { value: "adosado", label: "Chalet adosado" },
      { value: "pareado", label: "Chalet pareado" },
      { value: "rustica", label: "Casa rústica" },
    ],
  },
  { label: "Obra nueva", options: [{ value: "obra_nueva", label: "Obra nueva" }] },
];
export const TYPE_OPTIONS: Array<{ value: string; label: string }> = TYPE_GROUPS.flatMap((g) => g.options);

/** Vistas (etiquetas `attrs` deducidas de la descripción; el anuncio debe tener todas las marcadas). */
export const VIEW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "vistas", label: "Con vistas" },
  { value: "vistas_despejadas", label: "Vistas despejadas" },
  { value: "vistas_sierra", label: "Vistas a la sierra" },
  { value: "vistas_jardin", label: "Vistas a jardín o piscina" },
  { value: "vistas_mar", label: "Vistas al mar" },
];

/** Extras (etiquetas `attrs`, el anuncio debe tener TODAS las marcadas). */
export const EXTRA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "aire", label: "Aire acondicionado" },
  { value: "armarios", label: "Armarios empotrados" },
  { value: "ascensor", label: "Ascensor" },
  { value: "balcon", label: "Balcón" },
  { value: "terraza", label: "Terraza" },
  { value: "jardin", label: "Jardín" },
  { value: "piscina", label: "Piscina" },
  { value: "garaje", label: "Garaje" },
  { value: "trastero", label: "Trastero" },
  { value: "amueblado", label: "Amueblado" },
  { value: "calefaccion", label: "Calefacción" },
  { value: "calefaccion_central", label: "Calefacción central" },
  { value: "parquet", label: "Parquet" },
  { value: "videoportero", label: "Videoportero" },
  { value: "accesible", label: "Accesible (movilidad reducida)" },
  { value: "patio", label: "Patio" },
];
export const POSITION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "exterior", label: "Exterior" },
  { value: "interior", label: "Interior" },
];
export const ENERGY_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];
export const ORIENTATION_LABEL: Record<string, string> = { sur: "Sur", norte: "Norte", este: "Este", oeste: "Oeste" };
export const SINCE_LABEL: Record<string, string> = { "1": "Últimas 24 h", "2": "Últimos 2 días", "7": "Última semana", "30": "Último mes" };

export const splitCsv = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);
export const toggleCsv = (v: string, item: string): string => {
  const a = splitCsv(v);
  return (a.includes(item) ? a.filter((x) => x !== item) : [...a, item]).join(",");
};

export type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
  /** `scope` = el anunciante por defecto: se ve, pero no cuenta como filtro añadido. */
  tone?: "default" | "scope";
};

const money = (v: string) => fmtEur(Number(v));
/** «Desde 80 m²» / «Hasta 120 m²» / «80 – 120 m²». */
const rangeLabel = (min: string, max: string, unit: string) => {
  const a = min ? fmtNum(Number(min)) : "";
  const b = max ? fmtNum(Number(max)) : "";
  return a && b ? `${a} – ${b} ${unit}` : a ? `Desde ${a} ${unit}` : `Hasta ${b} ${unit}`;
};

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
  if (f.bedrooms) {
    const exact = f.bedroomsExact && Number(f.bedrooms) < 6;
    chips.push({
      id: "beds",
      label: exact ? (f.bedrooms === "0" ? "Estudio (0 dorm.)" : `${f.bedrooms} dorm.`) : `${f.bedrooms}+ dorm.`,
      onRemove: () => f.setBedrooms(""),
    });
  }
  if (f.areaMin || f.areaMax) {
    chips.push({ id: "area", label: rangeLabel(f.areaMin, f.areaMax, "m²"), onRemove: () => { f.setAreaMin(""); f.setAreaMax(""); } });
  }
  if (f.plotMin || f.plotMax) {
    chips.push({ id: "plot", label: `Parcela ${rangeLabel(f.plotMin, f.plotMax, "m²").toLowerCase()}`, onRemove: () => { f.setPlotMin(""); f.setPlotMax(""); } });
  }
  if (f.rentalKind) chips.push({ id: "rentalKind", label: `Alquiler ${RENTAL_KIND_LABEL[f.rentalKind].toLowerCase()}`, onRemove: () => f.setRentalKind("") });
  if (f.exactLocation) chips.push({ id: "exactLoc", label: "Ubicación exacta", onRemove: () => f.setExactLocation(false) });
  if (f.floorMin || f.floorMax) {
    const lo = f.floorMin, hi = f.floorMax;
    const label = hi === "0" && !lo ? "Solo bajos" : lo && hi ? (lo === hi ? `Planta ${lo}` : `Plantas ${lo}–${hi}`) : lo ? `Planta ${lo} o más` : `Hasta planta ${hi}`;
    chips.push({ id: "floor", label, onRemove: () => { f.setFloorMin(""); f.setFloorMax(""); } });
  }
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
  if (f.daysListed || f.daysMax) {
    chips.push({
      id: "days",
      label: f.daysListed && f.daysMax ? `${f.daysListed}–${f.daysMax} días en cartera` : f.daysListed ? `Más de ${f.daysListed} días en cartera` : `Menos de ${f.daysMax} días en cartera`,
      onRemove: () => { f.setDaysListed(""); f.setDaysMax(""); },
    });
  }
  if (f.last24h) chips.push({ id: "24h", label: "Últimas 24 h", onRemove: () => f.setLast24h(false) });
  if (f.phoneFilter) {
    chips.push({ id: "phone", label: f.phoneFilter === "with_phone" ? "Con teléfono" : "Sin teléfono", onRemove: () => f.setPhoneFilter("") });
  }
  if (f.gestion) chips.push({ id: "gestion", label: GESTION_LABEL[f.gestion] ?? f.gestion, onRemove: () => f.setGestion("") });
  if (f.lift) chips.push({ id: "lift", label: f.lift === "yes" ? "Con ascensor" : "Sin ascensor", onRemove: () => f.setLift("") });
  for (const c of splitCsv(f.condition)) {
    chips.push({ id: `cond:${c}`, label: CONDITION_LABEL[c] ?? c, onRemove: () => f.setCondition(toggleCsv(f.condition, c)) });
  }
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
  for (const t of splitCsv(f.types)) {
    chips.push({ id: `type:${t}`, label: TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t, onRemove: () => f.setTypes(toggleCsv(f.types, t)) });
  }
  for (const x of splitCsv(f.extras)) {
    chips.push({ id: `extra:${x}`, label: [...EXTRA_OPTIONS, ...POSITION_OPTIONS, ...VIEW_OPTIONS].find((o) => o.value === x)?.label ?? x, onRemove: () => f.setExtras(toggleCsv(f.extras, x)) });
  }
  if (f.energy) chips.push({ id: "energy", label: `Eficiencia ${splitCsv(f.energy).join(", ")}`, onRemove: () => f.setEnergy("") });
  if (f.orientation) chips.push({ id: "orient", label: `Orientación ${ORIENTATION_LABEL[f.orientation] ?? f.orientation}`, onRemove: () => f.setOrientation("") });
  if (f.bathrooms) {
    chips.push({
      id: "baths",
      label: f.bathroomsExact && Number(f.bathrooms) < 7 ? `${f.bathrooms} ${f.bathrooms === "1" ? "baño" : "baños"}` : `${f.bathrooms}+ baños`,
      onRemove: () => f.setBathrooms(""),
    });
  }
  if (f.since) chips.push({ id: "since", label: SINCE_LABEL[f.since] ?? `Últimos ${f.since} días`, onRemove: () => f.setSince("") });
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
  if (f.areaMin || f.areaMax) n++;
  if (f.plotMin || f.plotMax) n++;
  if (f.rentalKind) n++;
  if (f.exactLocation) n++;
  if (f.floorMin || f.floorMax) n++;
  if (f.furnished) n++;
  if (f.pricePerM2Min || f.pricePerM2Max) n++;
  if (f.priceDrop !== "") n++;
  if (f.daysListed || f.daysMax) n++;
  if (f.last24h) n++;
  if (f.phoneFilter) n++;
  if (f.gestion) n++;
  if (f.lift) n++;
  if (f.condition) n++;
  if (f.yearMin || f.yearMax) n++;
  if (f.showLinked) n++;
  if (splitCsv(f.types).length) n++;
  n += splitCsv(f.extras).length ? 1 : 0;
  if (f.energy) n++;
  if (f.orientation) n++;
  if (f.bathrooms) n++;
  if (f.since) n++;
  if (decodeZonePolygons(f.drawnZone).length > 0) n++;
  return n;
}
