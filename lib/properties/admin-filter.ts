// Predicado de filtros de la lista de Propiedades del admin.
//
// Sacado TAL CUAL de `properties-admin-client.tsx` (BCP-01, P1) para poder
// fijarlo con una prueba de caracterización (scripts/test-admin-properties-filter.mts)
// antes de compartir sus controles con el buscador del catálogo. NO cambia el
// comportamiento de Propiedades, incluidos sus defectos conocidos, que son un
// alcance aparte (O-B3 en docs/changes/2026-10-17-bcp-01-importar-y-buscar):
//   · con «Alquiler», una dual se compara con `price` (el de venta);
//   · distrito y subzona son igualdad exacta de texto;
//   · «Alquilado» (`rented`) nunca coincide con una fila real.
// El buscador del catálogo NO usa este predicado (ver lib/catalogs/search.ts).

import type { AdminProperty } from "@/lib/types";
import { matchesPropertySearch } from "./admin-search";
import { matchesTagFilter } from "./tags";

/** Valores tal como viven en la URL y en el estado de la página. */
export type AdminPropertyFilters = {
  query: string;
  tagIds: string[];
  operation: "" | "alquiler" | "venta";
  status: "" | "available" | "reserved" | "sold" | "rented" | "draft";
  zone: string;
  subzone: string;
  agency: string;
  stay: "" | "larga" | "corta";
  /** "3" = exactamente 3 · "3plus" = 3 o más */
  bedrooms: string;
  bathrooms: string;
  floor: string;
  minPrice: string;
  maxPrice: string;
  minM2: string;
  maxM2: string;
};

export function matchesAdminPropertyFilters(
  p: AdminProperty,
  f: AdminPropertyFilters,
  tagNameOf: (id: string) => string | undefined,
): boolean {
  if (
    !matchesPropertySearch(
      {
        ...p,
        tagNames: (p.tagIds ?? [])
          .map((id) => tagNameOf(id))
          .filter((n): n is string => Boolean(n)),
      },
      f.query,
    )
  )
    return false;
  if (!matchesTagFilter(p.tagIds, f.tagIds)) return false;
  if (
    f.operation &&
    p.operation !== f.operation &&
    !(p.isDualOperation && f.operation === "alquiler")
  ) {
    return false;
  }
  if (f.status && p.status !== f.status) return false;
  if (f.zone && p.zone !== f.zone) return false;
  if (f.subzone && p.subzone !== f.subzone) return false;
  if (f.agency && p.agencyId !== f.agency) return false;
  if (f.stay && p.stayType !== f.stay) return false;
  if (f.bedrooms) {
    // "3" = exactamente 3 · "3plus" = 3 o más
    if (f.bedrooms.endsWith("plus")) {
      if (p.bedrooms < Number(f.bedrooms.replace("plus", ""))) return false;
    } else if (p.bedrooms !== Number(f.bedrooms)) {
      return false;
    }
  }
  if (f.bathrooms && p.bathrooms < Number(f.bathrooms)) return false;
  // Planta mínima: sin dato de planta no se puede garantizar el mínimo
  // que exige el cliente, así que esos anuncios quedan fuera.
  if (f.floor && (p.floor == null || p.floor < Number(f.floor))) return false;
  if (f.minPrice && p.price < Number(f.minPrice)) return false;
  if (f.maxPrice && p.price > Number(f.maxPrice)) return false;
  if (f.minM2 && p.squareMeters < Number(f.minM2)) return false;
  if (f.maxM2 && p.squareMeters > Number(f.maxM2)) return false;
  return true;
}
