"use client";

import { Check, ChevronDown, ChevronRight, MapPin, Minus, Phone, Search, TrendingUp, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  chipLabel,
  filterGroups,
  fold,
  groupIsMadrid,
  groupState,
  highlightParts,
  isFlat,
  parseValue,
  serialize,
  sortByTotal,
  toggleGroup,
  toggleZone,
  topKeys,
  zoneOn,
  type CheckState,
  type ZoneEntry,
  type ZoneGroup,
} from "./zone-filter-utils";

export type ZoneFilterEntry = ZoneEntry;
export type ZoneFilterGroup = ZoneGroup;

interface ZoneFilterProps {
  groups: ZoneFilterGroup[];
  /** "" | varias entradas "d:<distrito>" / "z:<zona>" separadas por "|". */
  value: string;
  onChange: (value: string) => void;
}

type Row =
  | { kind: "group"; id: string; group: ZoneGroup; flat: boolean }
  | { kind: "zone"; id: string; group: ZoneGroup; zone: ZoneEntry };

/**
 * Selector de zona de MULTI-selección para /admin/particulares.
 *
 * - Madrid capital (distritos → barrios) separado de los municipios.
 * - Dentro de cada bloque, ordenado por nº de anuncios.
 * - Buscador insensible a acentos con el texto coincidente resaltado.
 * - Chips con lo seleccionado arriba y «Limpiar».
 * - Casilla del distrito tri-estado (todo / algunos barrios / ninguno).
 * - Atajos: las 5 zonas con más anuncios y solo zonas con anuncios sin teléfono.
 * - Teclado: flechas, Inicio/Fin, → / ← para abrir o cerrar un distrito,
 *   Intro o espacio (con el buscador vacío) para marcar, Esc para cerrar.
 *
 * Mantiene el formato de valor "d:"/"z:" unidos por "|" que consume page.tsx.
 */
export function ZoneFilter({ groups, value, onChange }: ZoneFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const selected = useMemo(() => new Set(parseValue(value)), [value]);
  const searching = query.trim().length > 0;

  const sorted = useMemo(() => sortByTotal(groups, (g) => g.district), [groups]);
  const visible = useMemo(() => filterGroups(sorted, query, onlyMissing), [sorted, query, onlyMissing]);
  const madrid = useMemo(() => visible.filter(groupIsMadrid), [visible]);
  const munis = useMemo(() => visible.filter((g) => !groupIsMadrid(g)), [visible]);

  const isOpenGroup = (g: ZoneGroup) =>
    searching || onlyMissing || expanded.has(g.district) || groupState(g, selected) === "some";

  // Lista plana de filas navegables, en el mismo orden en que se pintan.
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const g of [...madrid, ...munis]) {
      const flat = isFlat(g);
      out.push({ kind: "group", id: `g:${g.district}`, group: g, flat });
      if (!flat && isOpenGroup(g)) {
        for (const z of sortByTotal(g.zones, (x) => x.name)) {
          out.push({ kind: "zone", id: `z:${g.district}:${z.name}`, group: g, zone: z });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [madrid, munis, expanded, searching, onlyMissing, selected]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    inputRef.current?.focus();
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Mantener visible la fila activa al navegar con el teclado.
  useEffect(() => {
    if (!open || !rows[active]) return;
    document.getElementById(`${uid}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, rows, uid]);

  const totalSelected = selected.size;
  const label = useMemo(() => {
    const items = parseValue(value);
    if (items.length === 0) return "Zona: todas";
    if (items.length === 1) return chipLabel(items[0]);
    return `${items.length} zonas`;
  }, [value]);

  function commit(next: Set<string>) {
    onChange(serialize(next));
  }
  function clearAll() {
    onChange("");
    setQuery("");
    setOnlyMissing(false);
  }
  function closeAndFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function toggleExpanded(district: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(district)) n.delete(district);
      else n.add(district);
      return n;
    });
  }
  function activate(r: Row) {
    if (r.kind === "group") commit(toggleGroup(groups, selected, r.group.district));
    else commit(toggleZone(groups, selected, r.group.district, r.zone.name));
  }
  function removeChip(key: string) {
    const next = new Set(selected);
    next.delete(key);
    commit(next);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const r = rows[active];
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        if (query) setQuery("");
        else closeAndFocus();
        break;
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, rows.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        if (!query) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (!query) {
          e.preventDefault();
          setActive(rows.length - 1);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (r) activate(r);
        break;
      case " ":
        if (!query && r) {
          e.preventDefault();
          activate(r);
        }
        break;
      case "ArrowRight":
        if (r?.kind === "group" && !r.flat && !isOpenGroup(r.group) && e.currentTarget.selectionStart === query.length) {
          e.preventDefault();
          toggleExpanded(r.group.district);
        }
        break;
      case "ArrowLeft":
        if (!query && r) {
          const district = r.group.district;
          if (r.kind === "zone") {
            e.preventDefault();
            const gi = rows.findIndex((x) => x.kind === "group" && x.group.district === district);
            setActive(gi);
          } else if (!r.flat && expanded.has(district)) {
            e.preventDefault();
            toggleExpanded(district);
          }
        }
        break;
    }
  }

  const renderSection = (title: string, list: ZoneGroup[]) => {
    if (list.length === 0) return null;
    const total = list.reduce((n, g) => n + g.total, 0);
    return (
      <div role="group" aria-label={title} className="mb-1">
        <div className="sticky top-0 z-10 flex items-baseline justify-between bg-cream-50 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/50">
          <span>{title}</span>
          <span className="font-normal normal-case tracking-normal text-ink/40">
            {total.toLocaleString("es-ES")} anuncios
          </span>
        </div>
        {list.map((g) => {
          const idx = rows.findIndex((r) => r.kind === "group" && r.group.district === g.district);
          const flat = isFlat(g);
          const st = groupState(g, selected);
          const openG = !flat && isOpenGroup(g);
          const zoneRows = rows.filter((r) => r.kind === "zone" && r.group.district === g.district);
          return (
            <div key={g.district}>
              <div
                id={`${uid}-${idx}`}
                role="option"
                aria-selected={st === "on"}
                aria-checked={st === "some" ? "mixed" : st === "on"}
                aria-expanded={flat ? undefined : openG}
                onMouseEnter={() => setActive(idx)}
                className={`flex items-start gap-1 rounded-md pr-1 transition ${
                  active === idx ? "bg-gold/15 ring-1 ring-gold/40" : "hover:bg-gold/10"
                }`}
              >
                {flat ? (
                  <span className="w-6 shrink-0" />
                ) : (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={openG ? `Ocultar barrios de ${g.district}` : `Ver barrios de ${g.district}`}
                    disabled={searching || onlyMissing}
                    onClick={() => toggleExpanded(g.district)}
                    className="flex h-8 w-6 shrink-0 items-center justify-center text-ink/45 hover:text-ink disabled:opacity-40"
                  >
                    {openG ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setActive(idx);
                    commit(toggleGroup(groups, selected, g.district));
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 py-1.5 text-left"
                >
                  <Box state={st} />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">
                    <Highlight text={flat ? g.district : `Todo ${g.district}`} query={query} />
                  </span>
                  <Counts total={g.total} missing={g.missingPhone} />
                </button>
              </div>
              {openG &&
                zoneRows.map((r) => {
                  if (r.kind !== "zone") return null;
                  const zi = rows.indexOf(r);
                  const on = zoneOn(g, r.zone, selected);
                  return (
                    <div
                      key={r.id}
                      id={`${uid}-${zi}`}
                      role="option"
                      aria-selected={on}
                      onMouseEnter={() => setActive(zi)}
                      className={`ml-6 rounded-md transition ${
                        active === zi ? "bg-gold/15 ring-1 ring-gold/40" : "hover:bg-gold/10"
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setActive(zi);
                          commit(toggleZone(groups, selected, g.district, r.zone.name));
                        }}
                        className="flex w-full items-start gap-2 px-2 py-1 text-left"
                      >
                        <Box state={on ? "on" : "off"} small />
                        <span className="min-w-0 flex-1 break-words text-[13px] text-ink/80">
                          <Highlight text={r.zone.name} query={query} />
                        </span>
                        <Counts total={r.zone.total} missing={r.zone.missingPhone} small />
                      </button>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    );
  };

  const chipKeys = [...selected];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={totalSelected > 1 ? chipKeys.map(chipLabel).join(", ") : undefined}
        className={`flex max-w-[260px] items-center gap-1.5 rounded-lg border bg-white/85 px-3 py-2 text-sm text-ink transition focus:border-gold/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 ${
          totalSelected > 0 ? "border-gold/50" : "border-ink/10"
        }`}
      >
        <MapPin size={13} strokeWidth={1.75} className="shrink-0 text-ink/45" />
        <span className="truncate">{label}</span>
        {totalSelected > 1 && (
          <span className="shrink-0 rounded-full bg-ink px-1.5 text-[10px] font-medium leading-4 text-cream-50">
            {totalSelected}
          </span>
        )}
        <ChevronDown size={13} strokeWidth={1.75} className="ml-auto shrink-0 text-ink/40" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filtrar por zona"
          onKeyDown={(e) => {
            if (e.key === "Escape" && e.target !== inputRef.current) closeAndFocus();
          }}
          className="fixed inset-x-3 bottom-3 z-40 flex max-h-[80vh] flex-col rounded-xl border border-gold/20 bg-cream-50 p-2 shadow-[0_20px_50px_-20px_rgba(40,28,10,0.5)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+4px)] sm:z-30 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5 focus-within:border-gold/55">
            <Search size={13} strokeWidth={1.75} className="shrink-0 text-ink/40" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={rows[active] ? `${uid}-${active}` : undefined}
              aria-autocomplete="list"
              aria-label="Buscar distrito, barrio o municipio"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Buscar distrito, barrio o municipio…"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="text-ink/40 transition hover:text-ink"
                aria-label="Borrar búsqueda"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
            <Shortcut
              icon={<TrendingUp size={12} />}
              onClick={() => commit(new Set(topKeys(sorted, 5)))}
              label="Top 5 con más anuncios"
            />
            <Shortcut
              icon={<Phone size={12} />}
              pressed={onlyMissing}
              onClick={() => setOnlyMissing((v) => !v)}
              label="Solo con anuncios sin teléfono"
            />
          </div>

          {chipKeys.length > 0 && (
            <div className="mt-2 flex items-start gap-2 border-t border-ink/10 px-0.5 pt-2">
              <ul className="flex max-h-20 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto" aria-label="Zonas seleccionadas">
                {chipKeys.map((k) => (
                  <li key={k}>
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink py-0.5 pl-2.5 pr-1 text-xs text-cream-50">
                      <span className="break-words">{k.startsWith("d:") ? `Todo ${chipLabel(k)}` : chipLabel(k)}</span>
                      <button
                        type="button"
                        onClick={() => removeChip(k)}
                        aria-label={`Quitar ${chipLabel(k)}`}
                        className="rounded-full p-0.5 text-cream-50/70 transition hover:bg-white/15 hover:text-cream-50"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 py-0.5 text-xs text-ink/55 underline transition hover:text-ink"
              >
                Limpiar
              </button>
            </div>
          )}

          <div
            id={`${uid}-list`}
            ref={listRef}
            role="listbox"
            aria-multiselectable
            aria-label="Zonas"
            className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain sm:max-h-80"
          >
            {rows.length === 0 && (
              <p className="px-2 py-4 text-center text-sm text-ink/50">
                {onlyMissing && !searching
                  ? "No hay zonas con anuncios sin teléfono."
                  : `Sin resultados para «${query.trim()}»`}
              </p>
            )}
            {renderSection("Madrid capital", madrid)}
            {renderSection("Municipios", munis)}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-ink/10 px-0.5 pt-2">
            <span className="hidden text-[11px] text-ink/40 sm:inline">↑↓ navegar · Intro marcar · Esc cerrar</span>
            <button
              type="button"
              onClick={closeAndFocus}
              className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 transition hover:bg-ink/85"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-gold/35 px-0 text-ink">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Counts({ total, missing, small }: { total: number; missing: number; small?: boolean }) {
  return (
    <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
      <span className={`tabular-nums ${small ? "text-[11px] text-ink/45" : "text-xs text-ink/50"}`}>
        {total.toLocaleString("es-ES")}
      </span>
      {missing > 0 && (
        <span
          title={`${missing} sin teléfono`}
          className="whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-700"
        >
          {missing} sin tel.
        </span>
      )}
    </span>
  );
}

function Shortcut({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition focus-visible:ring-2 focus-visible:ring-gold/40 ${
        pressed ? "border-ink bg-ink text-cream-50" : "border-ink/15 bg-white text-ink/70 hover:border-gold/50 hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Casilla dibujada a mano (no <input>): vive dentro de un botón, que ya es
// el control accesible; así el estado intermedio ("algunos barrios") es posible.
function Box({ state, small }: { state: CheckState; small?: boolean }) {
  const size = small ? "h-3.5 w-3.5" : "h-4 w-4";
  const filled = state !== "off";
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex ${size} shrink-0 items-center justify-center rounded border transition ${
        filled ? "border-gold bg-gold text-ink" : "border-ink/25 bg-white"
      }`}
    >
      {state === "on" && <Check size={small ? 9 : 11} strokeWidth={3} />}
      {state === "some" && <Minus size={small ? 9 : 11} strokeWidth={3} />}
    </span>
  );
}
