"use client";

import { useEffect, useRef, useState } from "react";
import { groupsOfCatalog, treeOrder, type GroupsState } from "@/lib/catalogs/groups";
import { GroupsModal } from "./groups-modal";
import type { GroupActions } from "./types";

// «Grupos» de un catálogo (D1, D2). Una casilla por grupo y subgrupo; se
// pueden marcar un grupo y uno de sus subgrupos a la vez. Cada casilla se
// guarda al pulsar; si falla, vuelve a como estaba y lo dice. Solo cambia la
// organización de la HOME: nunca el catálogo (ni sus criterios, ni su versión).

export const GROUPS_NOTE = "Los grupos solo ordenan tu HOME: no cambian qué propiedades entran en el catálogo.";

export function CatalogGroupsDialog({
  catalogId,
  catalogTitle,
  state,
  actions,
  onState,
  onClose,
  returnFocusTo,
  refreshOnOpen = false,
}: {
  catalogId: string;
  catalogTitle: string;
  state: GroupsState;
  actions: Pick<GroupActions, "setMember" | "list">;
  onState: (s: GroupsState) => void;
  onClose: () => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
  /** El gestor vuelve a leer al abrir (puede llevar rato abierto). */
  refreshOnOpen?: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = useRef(false);
  const mine = groupsOfCatalog(state, catalogId);
  const rows = treeOrder(state.groups);
  const listRef = useRef(actions.list);
  listRef.current = actions.list;
  const stateRef = useRef(onState);
  stateRef.current = onState;

  useEffect(() => {
    if (!refreshOnOpen) return;
    let alive = true;
    void listRef.current().then((r) => {
      if (alive && r.ok) stateRef.current(r.groups);
    });
    return () => {
      alive = false;
    };
  }, [refreshOnOpen]);

  async function toggle(groupId: string, name: string, member: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(groupId);
    setMsg(null);
    try {
      const r = await actions.setMember({ groupId, catalogId, member });
      if (r.ok) {
        onState(r.groups);
        setMsg({ ok: true, text: member ? `Añadido a «${name}».` : `Quitado de «${name}».` });
      } else {
        setMsg({ ok: false, text: r.error });
        const fresh = await actions.list();
        if (fresh.ok) onState(fresh.groups);
      }
    } catch {
      setMsg({ ok: false, text: "No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo." });
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return (
    <GroupsModal
      title={`Grupos de «${catalogTitle}»`}
      onClose={onClose}
      variant="dialog"
      testId="catalog-groups"
      returnFocusTo={returnFocusTo}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? "text-emerald-800" : "text-red-700") : ""}`} data-testid="catalog-groups-message">
            {msg?.text ?? ""}
          </p>
          <button type="button" onClick={onClose} className="rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-sm text-ink/80 hover:bg-cream-50">
            Hecho
          </button>
        </div>
      }
    >
      <p className="text-xs text-ink/60" data-testid="catalog-groups-note">
        {GROUPS_NOTE}
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink/60">Todavía no hay grupos. Créalos con «Organizar» en la estantería de la HOME.</p>
      ) : (
        <ul className="mt-3 space-y-0.5" aria-label="Grupos">
          {rows.map(({ group, depth }) => {
            const on = mine.has(group.id);
            return (
              <li key={group.id} className={depth ? "pl-6" : ""}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-sm text-ink hover:bg-white ${pending === group.id ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    // Sin «disabled» mientras guarda: el foco no sale del diálogo
                    // (toggle ya ignora un segundo cambio hasta terminar).
                    aria-disabled={pending !== null}
                    aria-busy={pending === group.id}
                    onChange={() => void toggle(group.id, group.name, !on)}
                    className="h-4 w-4 accent-[#c9a96e]"
                    data-testid="catalog-group-check"
                    data-group={group.id}
                  />
                  <span className="min-w-0 truncate">{group.name}</span>
                  {pending === group.id ? <span className="text-xs text-ink/50">Guardando…</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </GroupsModal>
  );
}
