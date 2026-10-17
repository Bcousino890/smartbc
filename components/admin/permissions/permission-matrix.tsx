"use client";

import { ChevronDown } from "lucide-react";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  RESOURCE_DESCRIPTIONS,
  RESOURCE_LABELS,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Toggle } from "./toggle";
import {
  areaCounts,
  isSensitiveAction,
  type CellMatrix,
  type PermissionArea,
} from "./permission-areas";

/**
 * Matriz de permisos de una persona: secciones en filas, acciones en columnas.
 *
 * Sustituye a la lista de 16 tarjetas × 6 filas con descripción repetida (96
 * interruptores en una columna interminable): en pantallas anchas se ve una
 * sección por fila y las seis acciones de un vistazo; en móvil cada sección es
 * una tarjeta con sus acciones en cuadrícula. Las celdas que difieren del perfil
 * llevan un punto dorado; las acciones sensibles (eliminar, exportar, publicar)
 * se señalan en la cabecera.
 */
export interface PermissionMatrixProps {
  areas: PermissionArea[];
  effective: CellMatrix;
  defaults: CellMatrix;
  canEdit: boolean;
  /** Filtro de texto ya normalizado (minúsculas). */
  query: string;
  onlyModified: boolean;
  collapsed: ReadonlySet<string>;
  onToggleArea: (areaId: string) => void;
  onCell: (resource: PermissionResource, action: PermissionAction, value: boolean) => void;
  onRow: (resource: PermissionResource, value: boolean) => void;
  onArea: (area: PermissionArea, value: boolean) => void;
}

const rowAllOn = (m: CellMatrix, r: PermissionResource) => PERMISSION_ACTIONS.every((a) => m[r][a]);

function rowIsModified(e: CellMatrix, d: CellMatrix, r: PermissionResource) {
  return PERMISSION_ACTIONS.some((a) => e[r][a] !== d[r][a]);
}

function matches(resource: PermissionResource, query: string) {
  if (!query) return true;
  return `${RESOURCE_LABELS[resource]} ${RESOURCE_DESCRIPTIONS[resource]}`.toLowerCase().includes(query);
}

function ModifiedDot({ was }: { was: boolean }) {
  return (
    <span
      aria-hidden
      title={`Modificado: el perfil lo tiene ${was ? "permitido" : "denegado"}`}
      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-cream-50"
    />
  );
}

export function PermissionMatrix({
  areas,
  effective,
  defaults,
  canEdit,
  query,
  onlyModified,
  collapsed,
  onToggleArea,
  onCell,
  onRow,
  onArea,
}: PermissionMatrixProps) {
  const visibleAreas = areas
    .map((area) => ({
      area,
      rows: area.resources.filter(
        (r) => matches(r, query) && (!onlyModified || rowIsModified(effective, defaults, r)),
      ),
    }))
    .filter((x) => x.rows.length > 0);

  if (visibleAreas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-ink/15 bg-white/50 px-4 py-10 text-center text-sm text-ink/55">
        {onlyModified
          ? "Esta persona no tiene excepciones: todo coincide con su perfil."
          : "Ninguna sección coincide con la búsqueda."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {visibleAreas.map(({ area, rows }) => {
        const counts = areaCounts(area, effective);
        const open = !collapsed.has(area.id) || query !== "" || onlyModified;
        const areaAllOn = counts.on === counts.total;
        const pct = counts.total ? Math.round((counts.on / counts.total) * 100) : 0;
        return (
          <section key={area.id} className="overflow-hidden rounded-2xl border border-ink/10 bg-white/60">
            <div className="flex items-center gap-3 border-b border-ink/8 bg-cream-50/70 px-4 py-3">
              <button
                type="button"
                onClick={() => onToggleArea(area.id)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <ChevronDown
                  size={16}
                  strokeWidth={2}
                  className={cn("shrink-0 text-ink/40 transition-transform", !open && "-rotate-90")}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink">{area.label}</span>
                  {area.hint && <span className="block truncate text-xs text-ink/50">{area.hint}</span>}
                </span>
              </button>
              <div className="hidden w-28 shrink-0 sm:block" aria-hidden>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink/55">
                {counts.on} de {counts.total}
              </span>
              <Toggle
                size="sm"
                checked={areaAllOn}
                onChange={(v) => onArea(area, v)}
                disabled={!canEdit}
                aria-label={`${areaAllOn ? "Quitar" : "Dar"} todos los permisos de ${area.label}`}
              />
            </div>

            {open && (
              <>
                {/* Escritorio / tableta: una fila por sección */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left">
                        <th scope="col" className="px-4 py-2 text-xs font-medium text-ink/50">
                          Sección
                        </th>
                        {PERMISSION_ACTIONS.map((a) => (
                          <th
                            key={a}
                            scope="col"
                            title={ACTION_DESCRIPTIONS[a]}
                            className={cn(
                              "w-[68px] px-1 py-2 text-center text-xs font-medium",
                              isSensitiveAction(a) ? "text-rose-700/80" : "text-ink/50",
                            )}
                          >
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                        <th scope="col" className="w-[72px] px-3 py-2 text-right text-xs font-medium text-ink/50">
                          Fila
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/8">
                      {rows.map((resource) => {
                        const allOn = rowAllOn(effective, resource);
                        return (
                          <tr key={resource} className="transition hover:bg-cream-50/60">
                            <th scope="row" className="px-4 py-2.5 text-left font-normal">
                              <span className="block text-sm font-semibold text-ink">{RESOURCE_LABELS[resource]}</span>
                              <span className="block max-w-[230px] truncate text-xs text-ink/50" title={RESOURCE_DESCRIPTIONS[resource]}>
                                {RESOURCE_DESCRIPTIONS[resource]}
                              </span>
                            </th>
                            {PERMISSION_ACTIONS.map((action) => {
                              const on = effective[resource][action];
                              const def = defaults[resource][action];
                              return (
                                <td key={action} className="px-1 py-2.5 text-center">
                                  <span className="relative inline-flex">
                                    <Toggle
                                      size="sm"
                                      checked={on}
                                      onChange={(v) => onCell(resource, action, v)}
                                      disabled={!canEdit}
                                      aria-label={`${ACTION_LABELS[action]} ${RESOURCE_LABELS[resource]}`}
                                    />
                                    {on !== def && <ModifiedDot was={def} />}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => onRow(resource, !allOn)}
                                disabled={!canEdit}
                                className="rounded-md px-1.5 py-1 text-xs font-medium text-ink/55 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                                aria-label={`${allOn ? "Quitar" : "Dar"} todos los permisos de ${RESOURCE_LABELS[resource]}`}
                              >
                                {allOn ? "Quitar" : "Todo"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Móvil: una tarjeta por sección con sus acciones en cuadrícula */}
                <ul className="divide-y divide-ink/8 md:hidden">
                  {rows.map((resource) => {
                    const allOn = rowAllOn(effective, resource);
                    return (
                      <li key={resource} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{RESOURCE_LABELS[resource]}</p>
                            <p className="text-xs text-ink/50">{RESOURCE_DESCRIPTIONS[resource]}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRow(resource, !allOn)}
                            disabled={!canEdit}
                            className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-ink/55 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                          >
                            {allOn ? "Quitar todo" : "Todo"}
                          </button>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          {PERMISSION_ACTIONS.map((action) => {
                            const on = effective[resource][action];
                            const def = defaults[resource][action];
                            return (
                              <label
                                key={action}
                                className={cn(
                                  "flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2",
                                  on !== def ? "border-gold/50 bg-gold/10" : "border-ink/10 bg-white/70",
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-sm",
                                    isSensitiveAction(action) ? "font-medium text-rose-800" : "text-ink/80",
                                  )}
                                >
                                  {ACTION_LABELS[action]}
                                </span>
                                <Toggle
                                  size="sm"
                                  checked={on}
                                  onChange={(v) => onCell(resource, action, v)}
                                  disabled={!canEdit}
                                  aria-label={`${ACTION_LABELS[action]} ${RESOURCE_LABELS[resource]}`}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
