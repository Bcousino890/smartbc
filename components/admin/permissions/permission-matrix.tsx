"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";
import {
  ACTION_DESCRIPTIONS,
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  RESOURCE_DESCRIPTIONS,
  RESOURCE_LABELS,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";
import {
  SCOPE_LABELS,
  isScopedResource,
  scopeCellDiffers,
  type ScopeKind,
  type ScopeMatrix,
  type ScopeValue,
  type ScopedResource,
} from "@/lib/permissions-scope";
import { cn } from "@/lib/utils";
import { Toggle } from "./toggle";
import { isIdlePermission, permissionDetail, scopeDetail } from "./permission-details";
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
  /** Alcance efectivo y del perfil; null si el API no lo devuelve (sin chips). */
  scopes: ScopeMatrix | null;
  scopeDefaults: ScopeMatrix | null;
  canEdit: boolean;
  /** Filtro de texto ya normalizado (minúsculas). */
  query: string;
  onlyModified: boolean;
  collapsed: ReadonlySet<string>;
  onToggleArea: (areaId: string) => void;
  onCell: (resource: PermissionResource, action: PermissionAction, value: boolean) => void;
  onRow: (resource: PermissionResource, value: boolean) => void;
  onArea: (area: PermissionArea, value: boolean) => void;
  onScope: (resource: ScopedResource, kind: ScopeKind, value: ScopeValue) => void;
}

const rowAllOn = (m: CellMatrix, r: PermissionResource) => PERMISSION_ACTIONS.every((a) => m[r][a]);

function rowIsModified(
  e: CellMatrix,
  d: CellMatrix,
  r: PermissionResource,
  scopes: ScopeMatrix | null,
  scopeDefaults: ScopeMatrix | null,
) {
  if (PERMISSION_ACTIONS.some((a) => e[r][a] !== d[r][a])) return true;
  return !!scopes && !!scopeDefaults && isScopedResource(r) && scopeCellDiffers(scopes, scopeDefaults, r);
}

/** Acción cuyo interruptor lleva debajo el chip de alcance. */
const SCOPE_KIND_BY_ACTION: Partial<Record<PermissionAction, ScopeKind>> = {
  view: "view",
  edit: "edit",
};

function matches(resource: PermissionResource, query: string) {
  if (!query) return true;
  return `${RESOURCE_LABELS[resource]} ${RESOURCE_DESCRIPTIONS[resource]}`.toLowerCase().includes(query);
}

function ModifiedDot({ was, title }: { was?: boolean; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? `Modificado: el perfil lo tiene ${was ? "permitido" : "denegado"}`}
      className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-cream-50"
    />
  );
}

/**
 * Chip «Todo» / «Solo lo suyo» bajo el interruptor Ver o Editar. «Solo lo
 * suyo» lleva un tinte dorado suave; el de Editar queda bloqueado mientras Ver
 * sea «Solo lo suyo» (no se edita lo que no se ve).
 */
function ScopeChip({
  resource,
  kind,
  value,
  profileValue,
  locked,
  canEdit,
  onScope,
}: {
  resource: ScopedResource;
  kind: ScopeKind;
  value: ScopeValue;
  profileValue: ScopeValue;
  locked: boolean;
  canEdit: boolean;
  onScope: PermissionMatrixProps["onScope"];
}) {
  const own = value === "own";
  const kindLabel = kind === "view" ? "Ver" : "Editar";
  const blocked = !canEdit || locked;
  const lockReason = "Si solo ve lo suyo, solo puede editar lo suyo";
  const reasonId = `scope-lock-${resource}-${kind}`;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        // aria-disabled (no `disabled`): sigue enfocable con teclado y lector de pantalla.
        aria-disabled={blocked || undefined}
        aria-describedby={locked ? reasonId : undefined}
        onClick={() => {
          if (blocked) return;
          onScope(resource, kind, own ? "all" : "own");
        }}
        title={locked ? lockReason : `Cambiar el alcance de ${kindLabel}`}
        aria-label={`Alcance de ${kindLabel} en ${RESOURCE_LABELS[resource]}: ${SCOPE_LABELS[value]}`}
        className={cn(
          // En móvil el área táctil se amplía a ~48px con un pseudo-elemento sin cambiar el aspecto compacto.
          "relative whitespace-nowrap rounded-full border px-1.5 py-0.5 text-xs font-medium leading-4 transition max-md:before:absolute max-md:before:-inset-x-2 max-md:before:-inset-y-3 max-md:before:content-['']",
          own ? "border-gold/50 bg-gold/15 text-ink" : "border-ink/15 bg-white/70 text-ink/60",
          locked ? "opacity-50" : !canEdit && "opacity-60",
          blocked ? "cursor-default" : "hover:border-ink/30 hover:text-ink",
        )}
      >
        {SCOPE_LABELS[value]}
      </button>
      {locked && (
        <span id={reasonId} className="sr-only">
          {lockReason}
        </span>
      )}
      {value !== profileValue && (
        <ModifiedDot title={`Modificado: el perfil lo tiene en «${SCOPE_LABELS[profileValue]}»`} />
      )}
    </span>
  );
}

function DetailList({
  resource,
  effective,
}: {
  resource: PermissionResource;
  effective: CellMatrix;
}) {
  return (
    <ul className="space-y-1.5">
      {PERMISSION_ACTIONS.map((a) => {
        const text = permissionDetail(resource, a);
        const idle = isIdlePermission(text);
        const on = effective[resource][a];
        return (
          <li key={a} className="flex items-start gap-2.5 text-xs leading-relaxed">
            <span className="w-[96px] shrink-0 pt-px">
              <span className={cn("font-semibold", isSensitiveAction(a) ? "text-rose-800" : "text-ink")}>
                {ACTION_LABELS[a]}
              </span>
              <span className={cn("block text-[11px]", on ? "text-emerald-700" : "text-ink/40")}>
                {on ? "Permitido" : "No permitido"}
              </span>
            </span>
            <span className={cn("min-w-0 flex-1", idle ? "italic text-ink/45" : "text-ink/70")}>{text}</span>
          </li>
        );
      })}
      {isScopedResource(resource) && (
        <li className="flex items-start gap-2.5 text-xs leading-relaxed">
          <span className="w-[96px] shrink-0 pt-px font-semibold text-ink">Alcance</span>
          <span className="min-w-0 flex-1 text-ink/70">{scopeDetail(resource)}</span>
        </li>
      )}
    </ul>
  );
}

export function PermissionMatrix({
  areas,
  effective,
  defaults,
  scopes,
  scopeDefaults,
  canEdit,
  query,
  onlyModified,
  collapsed,
  onToggleArea,
  onCell,
  onRow,
  onArea,
  onScope,
}: PermissionMatrixProps) {
  // Chip de una celda (Ver/Editar) de una sección escalable, solo con el interruptor encendido.
  const scopeChipFor = (resource: PermissionResource, action: PermissionAction) => {
    const kind = SCOPE_KIND_BY_ACTION[action];
    if (!kind || !scopes || !scopeDefaults || !isScopedResource(resource)) return null;
    if (!effective[resource][action]) return null;
    return (
      <ScopeChip
        resource={resource}
        kind={kind}
        value={scopes[resource][kind]}
        profileValue={scopeDefaults[resource][kind]}
        locked={kind === "edit" && scopes[resource].view === "own"}
        canEdit={canEdit}
        onScope={onScope}
      />
    );
  };
  const [detailOpen, setDetailOpen] = useState<ReadonlySet<string>>(new Set());
  const toggleDetail = (r: string) =>
    setDetailOpen((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  const visibleAreas = areas
    .map((area) => ({
      area,
      rows: area.resources.filter(
        (r) => matches(r, query) && (!onlyModified || rowIsModified(effective, defaults, r, scopes, scopeDefaults)),
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
                          <Fragment key={resource}>
                          <tr className="transition hover:bg-cream-50/60">
                            <th scope="row" className="px-4 py-2.5 text-left font-normal">
                              <button
                                type="button"
                                onClick={() => toggleDetail(resource)}
                                aria-expanded={detailOpen.has(resource)}
                                className="group flex items-start gap-1.5 text-left"
                              >
                                <ChevronDown
                                  size={14}
                                  className={cn(
                                    "mt-0.5 shrink-0 text-ink/35 transition-transform group-hover:text-ink/70",
                                    !detailOpen.has(resource) && "-rotate-90",
                                  )}
                                />
                                <span>
                                  <span className="block text-sm font-semibold text-ink">{RESOURCE_LABELS[resource]}</span>
                                  <span className="block max-w-[180px] truncate text-xs text-ink/50" title={RESOURCE_DESCRIPTIONS[resource]}>
                                    {RESOURCE_DESCRIPTIONS[resource]}
                                  </span>
                                </span>
                              </button>
                            </th>
                            {PERMISSION_ACTIONS.map((action) => {
                              const on = effective[resource][action];
                              const def = defaults[resource][action];
                              const chip = scopeChipFor(resource, action);
                              // Filas escalables: todas las celdas reservan el hueco del chip para que los interruptores queden alineados.
                              const scopedRow = !!scopes && isScopedResource(resource);
                              return (
                                <td key={action} className="px-1 py-2.5 text-center">
                                  <span className="relative inline-flex" title={permissionDetail(resource, action)}>
                                    <Toggle
                                      size="sm"
                                      checked={on}
                                      onChange={(v) => onCell(resource, action, v)}
                                      disabled={!canEdit}
                                      aria-label={`${ACTION_LABELS[action]} ${RESOURCE_LABELS[resource]}`}
                                    />
                                    {on !== def && <ModifiedDot was={def} />}
                                  </span>
                                  {scopedRow && <div className="mt-1.5 flex h-6 justify-center">{chip}</div>}
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
                          {detailOpen.has(resource) && (
                            <tr className="bg-cream-50/60">
                              <td colSpan={PERMISSION_ACTIONS.length + 2} className="px-4 pb-3 pt-1">
                                <p className="mb-2 text-xs font-medium text-ink/60">
                                  Qué permite cada interruptor en {RESOURCE_LABELS[resource]}
                                </p>
                                <DetailList resource={resource} effective={effective} />
                              </td>
                            </tr>
                          )}
                          </Fragment>
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
                          <button
                            type="button"
                            onClick={() => toggleDetail(resource)}
                            aria-expanded={detailOpen.has(resource)}
                            className="flex min-w-0 items-start gap-1.5 text-left"
                          >
                            <ChevronDown
                              size={14}
                              className={cn("mt-1 shrink-0 text-ink/35 transition-transform", !detailOpen.has(resource) && "-rotate-90")}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-ink">{RESOURCE_LABELS[resource]}</span>
                              <span className="block text-xs text-ink/50">{RESOURCE_DESCRIPTIONS[resource]}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRow(resource, !allOn)}
                            disabled={!canEdit}
                            className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-ink/55 transition hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                          >
                            {allOn ? "Quitar todo" : "Todo"}
                          </button>
                        </div>
                        {detailOpen.has(resource) && (
                          <div className="mt-2.5 rounded-xl bg-cream-50/70 p-3">
                            <DetailList resource={resource} effective={effective} />
                          </div>
                        )}
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          {PERMISSION_ACTIONS.map((action) => {
                            const on = effective[resource][action];
                            const def = defaults[resource][action];
                            const chip = scopeChipFor(resource, action);
                            return (
                              <div key={action} className="flex flex-col gap-1.5">
                              <label
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
                              {chip && <div className="px-1">{chip}</div>}
                              </div>
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
