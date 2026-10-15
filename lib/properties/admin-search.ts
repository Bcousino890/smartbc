// Búsqueda de la lista de propiedades del admin.
//
// La referencia visible es SIEMPRE la BC (BC-1766). Aun así el buscador sigue
// encontrando por: título, zona, ref. BC (con o sin guion: "bc1766", "1766"),
// ref. del portal de origen (idealista-111959166, "111959166") y la referencia
// técnica PROP-YYYY-NNNN, que ya no se muestra en la lista.

export type SearchableProperty = {
  title: string;
  zone?: string | null;
  subzone?: string | null;
  agencyName?: string | null;
  reference?: string | null; // ref. del portal de origen (external_id)
  bcReference?: string | null;
  propertyReference?: string | null; // PROP-YYYY-NNNN (dato técnico)
  tagNames?: string[]; // nombres de las etiquetas asignadas
};

const compact = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");

export function matchesPropertySearch(
  p: SearchableProperty,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const qc = compact(q);

  const text = [p.title, p.zone, p.subzone, p.agencyName, ...(p.tagNames ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes(q)) return true;

  const refs = [p.bcReference, p.reference, p.propertyReference].filter(
    (r): r is string => Boolean(r),
  );
  return refs.some((r) => r.toLowerCase().includes(q) || (qc && compact(r).includes(qc)));
}
