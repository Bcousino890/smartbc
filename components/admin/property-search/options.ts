// Opciones de los filtros de propiedades, compartidas por Propiedades y el
// buscador del catálogo (BCP-01, P1). Mismos valores y etiquetas que tenía
// properties-admin-client.tsx; los valores son los de la URL.

export type FilterOption = { readonly value: string; readonly label: string };

export const OPERATION_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todas" },
  { value: "alquiler", label: "Alquiler" },
  { value: "venta", label: "Venta" },
];

/** Estados de la lista de Propiedades (con sus defectos conocidos: «Alquilado»
 *  no existe en BD y «Borrador» es archivada). El catálogo usa los suyos. */
export const ADMIN_STATUS_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todos" },
  { value: "available", label: "Disponible" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
  { value: "rented", label: "Alquilado" },
  { value: "draft", label: "Borrador" },
];

export const STAY_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todas" },
  { value: "larga", label: "Larga" },
  { value: "corta", label: "Corta" },
];

export const BEDROOM_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todos" },
  { value: "1", label: "Exacto 1" },
  { value: "2", label: "Exacto 2" },
  { value: "3", label: "Exacto 3" },
  { value: "4", label: "Exacto 4" },
  { value: "1plus", label: "1 o más" },
  { value: "2plus", label: "2 o más" },
  { value: "3plus", label: "3 o más" },
  { value: "4plus", label: "4 o más" },
  { value: "5plus", label: "5 o más" },
];

export const BATHROOM_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todos" },
  { value: "1", label: "1+" },
  { value: "2", label: "2+" },
  { value: "3", label: "3+" },
];

export const FLOOR_OPTIONS: readonly FilterOption[] = [
  { value: "", label: "Todas" },
  { value: "1", label: "1ª o más" },
  { value: "2", label: "2ª o más" },
  { value: "3", label: "3ª o más" },
  { value: "4", label: "4ª o más" },
  { value: "5", label: "5ª o más" },
  { value: "6", label: "6ª o más" },
];

/** Texto de los chips de dormitorios: «3+ dormitorios» o «2 dormitorios». */
export function bedroomsChipLabel(v: string): string {
  return v.endsWith("plus")
    ? `${v.replace("plus", "")}+ dormitorios`
    : `${v} dormitorio${v === "1" ? "" : "s"}`;
}
