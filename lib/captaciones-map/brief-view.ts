/**
 * El encargo de un cliente como lista «etiqueta · valor» para enseñarlo en
 * Captaciones (no hace falta abrir su ficha para saber qué busca). Módulo PURO.
 */
import {
  FEATURE_LABEL,
  FURNISHED,
  PROPERTY_TYPES,
  STAY,
  URGENCY,
  labelOf,
  type BriefInput,
  type FeatureKey,
} from "@/lib/clients/brief";
import { formatThousandsEs } from "./pin-label";

export type BriefItem = { label: string; value: string };

const eur = (n: number, rent: boolean) => `${formatThousandsEs(n)} €${rent ? "/mes" : ""}`;

function range(min: number | null, max: number | null, unit: string): string | null {
  if (min !== null && max !== null) return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
  if (min !== null) return `${min} o más ${unit}`;
  if (max !== null) return `hasta ${max} ${unit}`;
  return null;
}

export function describeBrief(b: BriefInput): BriefItem[] {
  const rent = b.operation === "rent";
  const out: BriefItem[] = [{ label: "Operación", value: rent ? "Alquiler" : "Venta" }];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) out.push({ label, value: value.trim() });
  };

  if (b.minPrice !== null || b.maxPrice !== null) {
    const base =
      b.minPrice !== null && b.maxPrice !== null
        ? `${eur(b.minPrice, rent)} – ${eur(b.maxPrice, rent)}`
        : b.maxPrice !== null
          ? `hasta ${eur(b.maxPrice, rent)}`
          : `desde ${eur(b.minPrice as number, rent)}`;
    add("Presupuesto", b.maxPriceFlexPct ? `${base} (con un ${b.maxPriceFlexPct} % de margen)` : base);
  }
  add("Dormitorios", range(b.minBedrooms, b.maxBedrooms, "dorm."));
  add("Baños", b.minBathrooms !== null ? `${b.minBathrooms} o más` : null);
  add("Superficie", range(b.minSquareMeters, b.maxSquareMeters, "m²"));

  const places = [...b.zones, ...b.subzones];
  const where = [
    places.length ? places.join(", ") : null,
    b.polygons.length ? `${b.polygons.length} zona${b.polygons.length === 1 ? "" : "s"} dibujada${b.polygons.length === 1 ? "" : "s"} en el mapa` : null,
  ].filter(Boolean);
  add("Zonas", where.join(" + ") || null);

  add("Tipo", b.propertyTypes.map((t) => labelOf(PROPERTY_TYPES, t) ?? t).join(", "));
  add("Planta", b.minFloor !== null ? `desde la ${b.minFloor}ª` : null);
  add("Orientación", b.orientations.join(", "));
  add("Imprescindible", b.mustHave.map((k) => FEATURE_LABEL[k as FeatureKey] ?? k).join(", "));
  add("Deseable", b.niceToHave.map((k) => FEATURE_LABEL[k as FeatureKey] ?? k).join(", "));
  if (rent) {
    add("Estancia", b.stay ? (STAY.find((s) => s.key === b.stay)?.label ?? b.stay) : null);
    add("Amueblado", labelOf(FURNISHED, b.furnished));
  }
  add("Urgencia", labelOf(URGENCY, b.urgency));
  add("Entrada", b.availableFrom);
  add("Descartes", b.dealbreakers);
  add("Notas", b.notes);
  return out;
}
