"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";
import {
  assignedCounts,
  childGroups,
  GROUP_LIMIT,
  GROUP_NAME_MAX,
  groupById,
  moveTargets,
  normalizeGroupName,
  rootGroups,
  type CatalogGroup,
  type DeletePreview,
  type GroupsState,
} from "@/lib/catalogs/groups";
import { GroupsModal } from "./groups-modal";
import type { GroupActions } from "./types";

// «Organizar» (D3, D4, D6, D9, D12, D13). Crear grupos y subgrupos, renombrar,
// ordenar con ▲▼ (funcionan con teclado y en táctil, donde el arrastre nativo
// no existe), mover un subgrupo a otro grupo y borrar con confirmación
// explícita. Cada cambio se guarda al pulsar. Nada de esto toca los catálogos.

type Msg = { ok: boolean; text: string } | null;

export function OrganizePanel({
  state,
  actions,
  onState,
  onClose,
}: {
  state: GroupsState;
  actions: GroupActions;
  onState: (s: GroupsState) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [moving, setMoving] = useState<{ id: string; to: string } | null>(null);
  const [confirm, setConfirm] = useState<{ group: CatalogGroup; preview: DeletePreview | null; error?: string } | null>(null);
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const counts = assignedCounts(state);
  const roots = rootGroups(state.groups);
  const full = state.groups.length >= GROUP_LIMIT;

  // El menú «⋯» de una fila se cierra al pulsar fuera.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(`[data-menu="${menu}"]`)) setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu]);

  useEffect(() => {
    if (!focusAfter) return;
    boxRef.current?.querySelector<HTMLElement>(`[data-focus-key="${focusAfter}"]`)?.focus();
    setFocusAfter(null);
  }, [focusAfter, state]);

  async function run<T extends { ok: boolean }>(fn: () => Promise<T>, okText: string | ((r: T) => string), after?: (r: T) => void): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r.ok) {
        if ("groups" in r) onState((r as unknown as { groups: GroupsState }).groups);
        setMsg({ ok: true, text: typeof okText === "string" ? okText : okText(r) });
        after?.(r);
        return true;
      }
      setMsg({ ok: false, text: (r as unknown as { error: string }).error });
      const fresh = await actions.list();
      if (fresh.ok) onState(fresh.groups);
      return false;
    } catch {
      setMsg({ ok: false, text: "No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeGroupName(name);
    if (!n.ok) {
      setMsg({ ok: false, text: `El nombre del grupo tiene que tener entre 1 y ${GROUP_NAME_MAX} caracteres.` });
      return;
    }
    const where = parent ? groupById(state.groups, parent) : undefined;
    await run(() => actions.create({ parentId: parent || null, name: n.value }), where ? `Subgrupo «${n.value}» creado en «${where.name}».` : `Grupo «${n.value}» creado.`, () => {
      setName("");
      inputRef.current?.focus();
    });
  }

  function step(g: CatalogGroup, dir: -1 | 1) {
    const sib = g.parentId ? childGroups(state.groups, g.parentId) : roots;
    const i = sib.findIndex((x) => x.id === g.id);
    const j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const ids = sib.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(() => actions.reorder({ parentId: g.parentId, ids }), "Orden guardado.", () => {
      // El foco sigue en la flecha que se pulsó (o en la otra si llegó al extremo).
      const end = j === 0 || j === sib.length - 1;
      setFocusAfter(`${g.id}:${end ? (dir === -1 ? "down" : "up") : dir === -1 ? "up" : "down"}`);
    });
  }

  async function askDelete(g: CatalogGroup) {
    setMenu(null);
    setConfirm({ group: g, preview: null });
    const r = await actions.previewDelete({ groupId: g.id });
    setConfirm(r.ok ? { group: g, preview: r.preview } : { group: g, preview: null, error: r.error });
  }

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 bg-white text-ink/75 hover:bg-cream-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-35";
  const btn = "rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-sm text-ink/80 hover:bg-cream-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50";

  const row = (g: CatalogGroup, depth: 0 | 1, i: number, n: number) => {
    const kids = depth === 0 ? childGroups(state.groups, g.id) : [];
    const targets = depth === 1 ? moveTargets(state.groups, g.id) : [];
    const editing = renaming?.id === g.id;
    const mv = moving?.id === g.id ? moving : null;
    return (
      <li key={g.id} data-testid="organize-row" data-group={g.id} data-depth={depth}>
        <div className={`flex flex-wrap items-center gap-2 border-b border-gold/10 px-2 py-2 ${depth ? "bg-cream-50/70 pl-7" : "bg-white"}`}>
          {editing ? (
            <form
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => actions.rename({ groupId: g.id, name: renaming!.value }), "Nombre guardado.", () => {
                  setRenaming(null);
                  setFocusAfter(`${g.id}:menu`);
                });
              }}
            >
              <input
                autoFocus
                value={renaming!.value}
                maxLength={GROUP_NAME_MAX + 20}
                onChange={(e) => setRenaming({ id: g.id, value: e.target.value })}
                aria-label={`Nuevo nombre de «${g.name}»`}
                className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-gold"
              />
              <button type="submit" disabled={busy} className={btn}>
                Guardar
              </button>
              <button type="button" onClick={() => setRenaming(null)} className={btn}>
                Cancelar
              </button>
            </form>
          ) : (
            <span className="min-w-0 flex-1 text-sm text-ink">
              <span className={depth ? "" : "font-semibold"}>{g.name}</span>{" "}
              <span className="text-xs text-ink/50">
                {counts.get(g.id) ?? 0} catálogo{(counts.get(g.id) ?? 0) === 1 ? "" : "s"}
              </span>
            </span>
          )}
          {!editing ? (
            <span className="flex items-center gap-1">
              <button type="button" className={iconBtn} disabled={busy || i === 0} onClick={() => step(g, -1)} aria-label={`Subir «${g.name}»`} data-focus-key={`${g.id}:up`}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={iconBtn} disabled={busy || i === n - 1} onClick={() => step(g, 1)} aria-label={`Bajar «${g.name}»`} data-focus-key={`${g.id}:down`}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="relative" data-menu={g.id}>
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={`Más acciones de «${g.name}»`}
                  aria-haspopup="menu"
                  aria-expanded={menu === g.id}
                  onClick={() => setMenu((m) => (m === g.id ? null : g.id))}
                  data-focus-key={`${g.id}:menu`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                {menu === g.id ? (
                  <span
                    role="menu"
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      e.preventDefault();
                      setMenu(null);
                      setFocusAfter(`${g.id}:menu`);
                    }}
                    className="absolute right-0 top-full z-10 mt-1 flex min-w-[11rem] flex-col rounded-lg border border-gold/25 bg-white p-1 shadow-lg">
                    <button type="button" role="menuitem" autoFocus className="rounded-md px-3 py-2 text-left text-sm hover:bg-cream-50" onClick={() => { setMenu(null); setRenaming({ id: g.id, value: g.name }); }}>
                      Renombrar
                    </button>
                    {depth === 0 ? (
                      <button type="button" role="menuitem" className="rounded-md px-3 py-2 text-left text-sm hover:bg-cream-50" onClick={() => { setMenu(null); setParent(g.id); inputRef.current?.focus(); }}>
                        Añadir subgrupo
                      </button>
                    ) : (
                      <button type="button" role="menuitem" disabled={!targets.length} className="rounded-md px-3 py-2 text-left text-sm hover:bg-cream-50 disabled:opacity-50" onClick={() => { setMenu(null); setMoving({ id: g.id, to: targets[0]?.id ?? "" }); }}>
                        Mover a…
                      </button>
                    )}
                    <button type="button" role="menuitem" className="rounded-md px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50" onClick={() => void askDelete(g)}>
                      Borrar
                    </button>
                  </span>
                ) : null}
              </span>
            </span>
          ) : null}
          {mv ? (
            <form
              className="flex w-full flex-wrap items-center gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                const dest = groupById(state.groups, mv.to);
                void run(() => actions.move({ groupId: g.id, parentId: mv.to }), `«${g.name}» movido a «${dest?.name ?? ""}».`, () => {
                  setMoving(null);
                  setFocusAfter(`${g.id}:menu`);
                });
              }}
            >
              <label className="text-xs text-ink/60" htmlFor={`mv-${g.id}`}>
                Mover a
              </label>
              <select id={`mv-${g.id}`} value={mv.to} onChange={(e) => setMoving({ id: g.id, to: e.target.value })} className="min-w-0 rounded-lg border border-gold/30 bg-white px-2 py-1.5 text-sm">
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={busy || !mv.to} className={btn}>
                Mover
              </button>
              <button type="button" onClick={() => setMoving(null)} className={btn}>
                Cancelar
              </button>
            </form>
          ) : null}
        </div>
        {kids.length ? <ul>{kids.map((c, k) => row(c, 1, k, kids.length))}</ul> : null}
      </li>
    );
  };

  const message = (
    <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? "text-emerald-800" : "text-red-700") : ""}`} data-testid="organize-message">
      {msg?.text ?? ""}
    </p>
  );

  return (
    <GroupsModal title="Organizar catálogos" onClose={onClose} variant="panel" testId="organize" busy={busy} footer={message}>
      <div ref={boxRef} className="space-y-3">
        <p className="text-xs text-ink/60" data-testid="organize-note">
          Los grupos solo ordenan tu HOME: no cambian qué propiedades entran en cada catálogo ni lo que ve el cliente. Hasta dos niveles (grupo y subgrupo) y {GROUP_LIMIT} grupos.
        </p>
        <form onSubmit={create} className="space-y-2 rounded-lg border border-gold/20 bg-white/70 p-2">
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="og-name">
              Nombre del grupo nuevo
            </label>
            <input
              id="og-name"
              ref={inputRef}
              data-autofocus=""
              value={name}
              maxLength={GROUP_NAME_MAX + 20}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del grupo nuevo"
              className="min-w-0 flex-1 rounded-lg border border-gold/30 bg-white px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <button type="submit" disabled={busy || full} className="rounded-lg bg-gold/90 px-3 py-2 text-sm font-semibold text-white hover:bg-gold disabled:opacity-60">
              Crear
            </button>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-xs text-ink/65">
            Dónde
            <select value={parent} onChange={(e) => setParent(e.target.value)} className="min-w-0 rounded-lg border border-gold/30 bg-white px-2 py-1 text-sm text-ink" data-testid="organize-parent">
              <option value="">Grupo nuevo (primer nivel)</option>
              {roots.map((r) => (
                <option key={r.id} value={r.id}>
                  Subgrupo de «{r.name}»
                </option>
              ))}
            </select>
          </label>
          {full ? <p className="text-xs text-amber-900">Has llegado al máximo de {GROUP_LIMIT} grupos: borra alguno para crear otro.</p> : null}
        </form>
        {roots.length === 0 ? (
          <p className="text-sm text-ink/60">Todavía no hay grupos. Crea el primero arriba; por ejemplo, «Salamanca».</p>
        ) : (
          <ul className="overflow-visible rounded-lg border border-gold/25" aria-label="Grupos y subgrupos" data-testid="organize-tree">
            {roots.map((r, i) => row(r, 0, i, roots.length))}
          </ul>
        )}
      </div>
      {confirm ? (
        <GroupsModal
          title={`¿Borrar «${confirm.group.name}»?`}
          onClose={() => setConfirm(null)}
          variant="dialog"
          testId="delete-confirm"
          busy={busy}
          returnFocusTo={() => boxRef.current?.querySelector<HTMLElement>(`[data-focus-key="${confirm.group.id}:menu"]`) ?? inputRef.current}
        >
          {confirm.error ? (
            <p className="text-sm text-red-700">{confirm.error}</p>
          ) : !confirm.preview ? (
            <p className="text-sm text-ink/60">Calculando…</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="delete-summary">
                {confirm.preview.subgroups.length ? (
                  <p>
                    Se borrarán también sus {confirm.preview.subgroups.length} subgrupo{confirm.preview.subgroups.length === 1 ? "" : "s"}: {confirm.preview.subgroups.join(", ")}.
                  </p>
                ) : null}
                <p>
                  {confirm.preview.catalogs === 0
                    ? "Ningún catálogo pierde etiquetas."
                    : `${confirm.preview.catalogs} catálogo${confirm.preview.catalogs === 1 ? "" : "s"} perderá${confirm.preview.catalogs === 1 ? "" : "n"} ${confirm.preview.subgroups.length ? "estas etiquetas" : "esta etiqueta"}${confirm.preview.unorganized ? `; ${confirm.preview.unorganized} quedará${confirm.preview.unorganized === 1 ? "" : "n"} en «Sin organizar»` : ""}.`}
                </p>
                <p className="font-semibold">Ningún catálogo se borra ni cambia.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" data-autofocus="" onClick={() => setConfirm(null)} className={btn}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => actions.remove({ groupId: confirm.group.id }),
                      () => `«${confirm.group.name}» borrado${confirm.preview!.subgroups.length ? " con sus subgrupos" : ""}. Los catálogos siguen igual.`,
                      () => setConfirm(null),
                    ).then((ok) => {
                      if (!ok) setConfirm(null);
                    })
                  }
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50"
                  data-testid="delete-confirm-button"
                >
                  {confirm.preview.subgroups.length ? `Borrar «${confirm.group.name}» y sus subgrupos` : `Borrar «${confirm.group.name}»`}
                </button>
              </div>
            </div>
          )}
        </GroupsModal>
      ) : null}
    </GroupsModal>
  );
}
