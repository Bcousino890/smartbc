// SOLO DESARROLLO LOCAL (BCP-01, P1): propiedades sintéticas para la lista de
// Propiedades en /dev-fixtures/propiedades. Deterministas (sin Math.random),
// para comparar la lista antes y después de sacar sus controles compartidos.
import type { PropertyTag } from "@/lib/properties/tags";
import type { AdminProperty, AdminPropertyStatus } from "@/lib/types";

const ZONES: [string, string | null][] = [
  ["Salamanca", "Goya"], ["Salamanca", "Recoletos"], ["Chamberí", "Almagro"], ["Chamberi", null],
  ["Centro", "Justicia"], ["Retiro", "Ibiza"], ["Goya", null], ["Tetuán", "Cuatro Caminos"],
];
const AGENCIES: [string, string][] = [["level", "Level"], ["housingo", "Housingo"], ["portales-externos", "Portales externos"]];
const STATUSES: AdminPropertyStatus[] = ["available", "available", "reserved", "sold", "draft"];

export const FIXTURE_TAGS: PropertyTag[] = [
  { id: "tag-exclusiva", name: "Exclusiva", color: "#C9A227" },
  { id: "tag-reformado", name: "Reformado", color: "#10B981" },
];

export function fixtureAdminProperties(): AdminProperty[] {
  return Array.from({ length: 60 }, (_, i) => {
    const [zone, subzone] = ZONES[i % ZONES.length];
    const [agencyId, agencyName] = AGENCIES[i % AGENCIES.length];
    const sale = i % 3 === 0;
    const n = String(i + 1).padStart(4, "0");
    return {
      id: `fx-prop-${n}`,
      reference: `idealista-9${n}`,
      bcReference: `BC-${n}`,
      propertyReference: `PROP-2026-${n}`,
      title: `${sale ? "Piso en venta" : "Piso en alquiler"} ${i + 1} · ${subzone ?? zone}`,
      zone,
      subzone,
      agencyId,
      agencyName,
      operation: sale ? "venta" : "alquiler",
      isDualOperation: i % 7 === 0,
      stayType: sale ? null : i % 2 === 0 ? "larga" : "corta",
      status: STATUSES[i % STATUSES.length],
      bedrooms: (i % 5) + 1,
      bathrooms: (i % 3) + 1,
      squareMeters: 40 + ((i * 13) % 160),
      price: sale ? 300000 + i * 25000 : 1200 + i * 75,
      floor: i % 6 === 5 ? null : i % 9,
      publishedLabel: `${(i % 28) + 1} oct 2026`,
      coverPhotoUrl: null,
      photoCount: 0,
      tagIds: i % 4 === 0 ? ["tag-exclusiva"] : i % 5 === 0 ? ["tag-reformado"] : [],
    } satisfies AdminProperty;
  });
}
