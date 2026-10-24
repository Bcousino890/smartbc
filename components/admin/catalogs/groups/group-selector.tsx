"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  childGroups,
  groupById,
  groupLabel,
  rootGroups,
  sameSelection,
  treeOrder,
  type GroupSelection,
  type GroupsState,
} from "@/lib/catalogs/groups";
import { GroupsModal } from "./groups-modal";
import st from "../studio/studio.module.css";

// Selector de grupo encima de la estantería (D1, D7). Escritorio: una fila de
// botones (Todas · Sin organizar · grupos) y, con un grupo que tiene
// subgrupos, una segunda fila; con más de 12 grupos de primer nivel, «Más
// grupos ▾» abre la lista completa. Móvil: un botón con el grupo actual que
// abre la misma lista, que funciona igual con 3 que con 100 grupos y nunca
// desplaza la página en horizontal.

export const ROOT_CHIPS_MAX = 12;

export function GroupSelector({
  state,
  selection,
  counts,
  onSelect,
}: {
  state: GroupsState;
  selection: GroupSelection;
  counts: { all: number; none: number; byGroup: Map<string, number> };
  onSelect: (sel: GroupSelection) => void;
}) {
  const [list, setList] = useState(false);
  const roots = rootGroups(state.groups);
  const selected = selection.kind === "group" ? groupById(state.groups, selection.id) : undefined;
  const activeRoot = selected ? (selected.parentId ? groupById(state.groups, selected.parentId) : selected) : undefined;
  const subs = activeRoot ? childGroups(state.groups, activeRoot.id) : [];
  const shownRoots = roots.slice(0, ROOT_CHIPS_MAX);
  if (activeRoot && !shownRoots.some((r) => r.id === activeRoot.id)) shownRoots.push(activeRoot);
  const currentLabel =
    selection.kind === "all" ? "Todas" : selection.kind === "none" ? "Sin organizar" : selected ? groupLabel(state.groups, selected.id) : "Todas";

  // Rediseño 2026-10-23: pestañas suaves de la referencia «Lista editorial».
  // El grupo padre de un subgrupo elegido se marca con un subrayado dorado.
  const chip = (on: boolean, soft = false) => `${st.pill} ${on ? st.pillOn : ""} ${soft ? "underline decoration-gold-text decoration-2 underline-offset-[6px]" : ""} text-sm`;

  const pick = (sel: GroupSelection) => {
    setList(false);
    onSelect(sel);
  };

  const chipEl = (sel: GroupSelection, label: string, n: number, soft = false) => {
    const on = sameSelection(sel, selection);
    return (
      <button key={sel.kind === "group" ? sel.id : sel.kind} type="button" aria-pressed={on} onClick={() => pick(sel)} className={chip(on, soft && !on)} data-testid="group-chip" data-group={sel.kind === "group" ? sel.id : sel.kind}>
        <span className="max-w-[16rem] truncate">{label}</span>
        <span className={st.pillCount}>{n}</span>
      </button>
    );
  };

  return (
    <div data-testid="group-selector">
      {/* Escritorio y tablet */}
      <div className="hidden sm:block">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Grupos de catálogos">
          {chipEl({ kind: "all" }, "Todas", counts.all)}
          {chipEl({ kind: "none" }, "Sin organizar", counts.none)}
          {shownRoots.map((r) => chipEl({ kind: "group", id: r.id }, r.name, counts.byGroup.get(r.id) ?? 0, !!activeRoot && activeRoot.id === r.id))}
          {roots.length > ROOT_CHIPS_MAX ? (
            <button type="button" onClick={() => setList(true)} className={chip(false)} data-testid="group-more">
              Más grupos <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {activeRoot && subs.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1 border-l-2 border-[color:var(--st-gold-soft)] pl-3" role="group" aria-label={`Subgrupos de ${activeRoot.name}`} data-testid="group-subrow">
            {chipEl({ kind: "group", id: activeRoot.id }, `Todo ${activeRoot.name}`, counts.byGroup.get(activeRoot.id) ?? 0)}
            {subs.map((c) => chipEl({ kind: "group", id: c.id }, c.name, counts.byGroup.get(c.id) ?? 0))}
          </div>
        ) : null}
      </div>
      {/* Móvil */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setList(true)}
          aria-haspopup="dialog"
          className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md border border-[color:var(--st-line)] bg-white px-3 py-2 text-left text-sm text-ink"
          data-testid="group-mobile-button"
        >
          <span className="min-w-0 truncate">Grupo: {currentLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink/60" aria-hidden="true" />
        </button>
      </div>
      {list ? (
        <GroupsModal title="Elegir grupo" onClose={() => setList(false)} variant="sheet" testId="group-list">
          <ul className="-mx-1 space-y-0.5" aria-label="Grupos">
            {[{ sel: { kind: "all" } as GroupSelection, label: "Todas", n: counts.all, depth: 0 }, { sel: { kind: "none" } as GroupSelection, label: "Sin organizar", n: counts.none, depth: 0 }]
              .concat(treeOrder(state.groups).map(({ group, depth }) => ({ sel: { kind: "group", id: group.id } as GroupSelection, label: group.name, n: counts.byGroup.get(group.id) ?? 0, depth })))
              .map((row) => {
                const on = sameSelection(row.sel, selection);
                return (
                  <li key={row.sel.kind === "group" ? row.sel.id : row.sel.kind}>
                    <button
                      type="button"
                      onClick={() => pick(row.sel)}
                      aria-current={on ? "true" : undefined}
                      data-autofocus={on ? "" : undefined}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${row.depth ? "pl-7 text-sm" : "text-base"} ${on ? "bg-gold/15 font-semibold text-ink" : "text-ink/85 hover:bg-white"}`}
                      data-testid="group-list-item"
                    >
                      <span className="min-w-0 truncate">{row.label}</span>
                      <span className="text-ink/45">{row.n}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </GroupsModal>
      ) : null}
    </div>
  );
}
