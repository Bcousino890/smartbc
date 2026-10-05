import { Check } from "lucide-react";
import { summarizeActions, type PermissionTableRow } from "@/lib/onboarding/guide";
import { ACTION_LABELS, PERMISSION_ACTIONS } from "@/lib/permissions";

/**
 * Tabla módulo × acción de los permisos EFECTIVOS de un usuario (los que
 * comprueba el servidor). Las filas salen de `buildPermissionTable`
 * (lib/onboarding/guide.ts). Un punto dorado marca las excepciones de su
 * cuenta: celdas distintas del valor por defecto de su rol.
 */
export function PermissionsTable({ rows }: { rows: PermissionTableRow[] }) {
  const hasExceptions = rows.some((row) => PERMISSION_ACTIONS.some((a) => row.cells[a].exception));

  return (
    <div>
      {/* Móvil: una fila por módulo con lo que tiene, sin tabla de 7 columnas. */}
      <ul className="divide-y divide-gold/10 rounded-2xl border border-gold/15 bg-cream-50/85 md:hidden">
        {rows.map((row) => {
          const summary = summarizeActions(row.resource, (a) => row.cells[a].allowed);
          const exceptions = PERMISSION_ACTIONS.filter((a) => row.cells[a].exception);
          return (
            <li key={row.resource} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={summary === "—" ? "font-medium text-ink/45" : "font-medium text-ink"}>{row.label}</p>
                <p className="text-xs text-ink/45">{row.where}</p>
                {exceptions.length > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink/55">
                    <span className="h-2 w-2 rounded-full bg-gold" />
                    Excepción: {exceptions.map((a) => ACTION_LABELS[a]).join(", ")}
                  </p>
                )}
              </div>
              <span
                className={
                  summary === "—"
                    ? "shrink-0 text-sm text-ink/25"
                    : summary === "Todo"
                      ? "shrink-0 text-right text-sm font-medium text-emerald-700"
                      : "shrink-0 text-right text-sm text-ink/80"
                }
              >
                {summary}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-gold/15 bg-cream-50/85 md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gold/15 text-left">
              <th className="crm-table-header px-4 py-3 text-ink/60">Módulo</th>
              {PERMISSION_ACTIONS.map((a) => (
                <th key={a} className="crm-table-header px-2 py-3 text-center text-ink/60">
                  {ACTION_LABELS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const none = PERMISSION_ACTIONS.every((a) => !row.cells[a].allowed);
              return (
                <tr key={row.resource} className="border-b border-gold/10 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className={none ? "font-medium text-ink/45" : "font-medium text-ink"}>{row.label}</p>
                    <p className="text-xs text-ink/45">{row.where}</p>
                  </td>
                  {PERMISSION_ACTIONS.map((a) => {
                    const cell = row.cells[a];
                    if (!cell.applies) {
                      return <td key={a} className="bg-ink/[0.04] px-2 py-2.5" aria-label="No aplica" />;
                    }
                    const label = cell.allowed ? "Lo tienes" : "No lo tienes";
                    const exception = cell.exception
                      ? cell.allowed
                        ? "Excepción de tu cuenta: tu rol no lo trae, te lo han dado a ti"
                        : "Excepción de tu cuenta: tu rol lo trae, pero a ti te lo han quitado"
                      : undefined;
                    return (
                      <td key={a} className="px-2 py-2.5 text-center" title={exception ?? label}>
                        <span className="relative inline-flex items-center justify-center" aria-label={exception ?? label}>
                          {cell.allowed ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <Check size={14} strokeWidth={2.5} />
                            </span>
                          ) : (
                            <span className="text-ink/25">—</span>
                          )}
                          {cell.exception && (
                            <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-gold" />
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 hidden flex-wrap gap-x-5 gap-y-1 text-xs text-ink/55 md:flex">
        <span className="flex items-center gap-1.5">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check size={10} strokeWidth={3} />
          </span>
          Lo tienes
        </span>
        <span>— No lo tienes</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-ink/[0.08]" /> No aplica
        </span>
        {hasExceptions && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gold" /> Excepción de tu cuenta (distinta de tu rol)
          </span>
        )}
      </div>
    </div>
  );
}
