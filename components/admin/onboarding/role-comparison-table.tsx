import { COMPARED_ROLES, type RoleComparisonRow } from "@/lib/onboarding/guide";

/**
 * Qué puede hacer cada rol POR DEFECTO (sin excepciones por usuario), módulo
 * a módulo. Filas de `buildRoleComparison` (lib/onboarding/guide.ts). La usan
 * la Guía de inicio y la página de Usuarios (para elegir el rol al crear o
 * editar una cuenta).
 */
export function RoleComparisonTable({
  rows,
  highlightColumn = -1,
}: {
  rows: RoleComparisonRow[];
  /** Columna a resaltar (el rol del usuario), o -1. */
  highlightColumn?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gold/15 text-left">
            <th className="crm-table-header px-4 py-3 text-ink/60">Módulo</th>
            {COMPARED_ROLES.map(({ label }, i) => (
              <th
                key={label}
                className={
                  i === highlightColumn
                    ? "crm-table-header bg-gold/15 px-3 py-3 text-ink"
                    : "crm-table-header px-3 py-3 text-ink/60"
                }
              >
                {label}
                {i === highlightColumn && <span className="block text-xs font-normal text-gold">Tu rol</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.resource} className="border-b border-gold/10 last:border-0">
              <td className="px-4 py-2.5 font-medium text-ink">{row.label}</td>
              {row.values.map((v, i) => (
                <td
                  key={COMPARED_ROLES[i].label}
                  className={[
                    "px-3 py-2.5",
                    i === highlightColumn ? "bg-gold/10" : "",
                    v === "—" ? "text-ink/25" : v === "Todo" ? "font-medium text-emerald-700" : "text-ink/75",
                  ].join(" ")}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
