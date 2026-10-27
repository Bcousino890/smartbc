/**
 * Resumen del encargo de un cliente para la cabecera del mapa de captaciones.
 * Módulo PURO (sin servidor ni Next): lo usan la query del servidor y las pruebas.
 */
import type { ZonePolygon } from "@/lib/zone-polygon";
import { formatThousandsEs } from "./pin-label";

export type MapBrief = {
  operation: "rent" | "sale" | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  polygons: ZonePolygon[];
  summary: string;
};

/** «Alquiler · hasta 1.400 € · 2 hab.»; las partes nulas se omiten. */
export function buildBriefSummary(b: {
  operation: "rent" | "sale" | null;
  maxPrice: number | null;
  minBedrooms: number | null;
}): string {
  const parts: string[] = [];
  if (b.operation) parts.push(b.operation === "rent" ? "Alquiler" : "Venta");
  // formatThousandsEs (y no Intl): "es-ES" omite el punto en 4 cifras ("1400").
  if (b.maxPrice !== null) parts.push(`hasta ${formatThousandsEs(b.maxPrice)} €`);
  if (b.minBedrooms !== null) parts.push(`${b.minBedrooms} hab.`);
  return parts.join(" · ");
}

/** Reduce el encargo completo de la query a lo que necesita el mapa. */
export function toMapBrief(b: {
  operation: "rent" | "sale" | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  polygons: ZonePolygon[];
}): MapBrief {
  return {
    operation: b.operation,
    maxPrice: b.maxPrice,
    minBedrooms: b.minBedrooms,
    polygons: b.polygons,
    summary: buildBriefSummary(b),
  };
}
