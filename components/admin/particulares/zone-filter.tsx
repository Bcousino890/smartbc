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
  /** Lo que cuenta cada número ("anuncios" en particulares, "fichas" en el encargo). */
  unit?: string;
  /** false = sin «sin teléfono» ni su atajo (fuera de particulares no aplica). */
  phone?: boolean;
  /** false = sin números (cuando no hay recuentos que mostrar). */
  counts?: boolean;
  /** Texto del botón cuando no hay nada elegido. */
  emptyLabel?: string;
  /** El botón ocupa todo el ancho (dentro de un formulario). */
  block?: boolean;
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
export function ZoneFilter({
  groups,
  value,
  onChange,
  unit = "anuncios",
  phone = true,
  counts = true,
  emptyLabel = "Zona: todas",
  block = false,
}: ZoneFilterProps) {
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

  const sorted = useMemo(() => counts ? sortByTotal(groups, (g) => g.district) : [...groups].sort((a, b) => a.district.localeCompare(b.district, "es")), [groups, counts]);
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
    if (items.length === 0) return emptyLabel;
    if (items.length === 1) return chipLabel(items[0]);
    return `${items.length} zonas`;
  }, [value, emptyLabel]);

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
      <div role="group" aria-label={title} className="pb-2">
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-cream-50 px-3 pb-1.5 pt-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink/55">{title}</span>
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
          <span className="text-xs tabular-nums text-ink/40">{total.toLocaleString("es-ES")} {unit}</span>
        </div>
        <div className="px-1.5">
          {list.map((g) => {
            const idx = rows.findIndex((r) => r.kind === "group" && r.group.district === g.district);
            const flat = isFlat(g);
            const st = groupState(g, selected);
            const openG = !flat && isOpenGroup(g);
            const zoneRows = rows.filter((r) => r.kind === "zone" && r.group.district === g.district);
            return (
              <div key={g.district} className="mb-px">
                <div
                  id={`${uid}-${idx}`}
                  role="option"
                  aria-selected={st === "on"}
                  aria-checked={st === "some" ? "mixed" : st === "on"}
                  aria-expanded={flat ? undefined : openG}
                  onMouseEnter={() => setActive(idx)}
                  className={`flex items-center rounded-xl transition-colors ${
                    active === idx ? "bg-gold/15" : st !== "off" ? "bg-gold/[0.07]" : ""
                  }`}
                >
                  {flat ? (
                    <span className="w-8 shrink-0" />
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={openG ? `Ocultar barrios de ${g.district}` : `Ver barrios de ${g.district}`}
                      disabled={searching || onlyMissing}
                      onClick={() => toggleExpanded(g.district)}
                      className="flex h-10 w-8 shrink-0 items-center justify-center text-ink/40 transition hover:text-ink disabled:opacity-30"
                    >
                      <ChevronRight
                        size={15}
                        strokeWidth={2}
                        className={`transition-transform duration-200 ${openG ? "rotate-90" : ""}`}
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setActive(idx);
                      commit(toggleGroup(groups, selected, g.district));
                    }}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-3 py-1.5 pr-2.5 text-left"
                  >
                    <Box state={st} />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-ink">
                      <Highlight text={flat ? g.district : `Todo ${g.district}`} query={query} />
                    </span>
                    {counts && <Counts total={g.total} missing={phone ? g.missingPhone : 0} />}
                  </button>
                </div>
                {openG && (
                  <div className="ml-[2.1rem] animate-[zfIn_.18s_ease-out] border-l border-gold/30 pb-1 pl-1.5">
                    {zoneRows.map((r) => {
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
                          className={`rounded-lg transition-colors ${active === zi ? "bg-gold/15" : on ? "bg-gold/[0.07]" : ""}`}
                        >
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => {
                              setActive(zi);
                              commit(toggleZone(groups, selected, g.district, r.zone.name));
                            }}
                            className="flex min-h-9 w-full items-center gap-2.5 px-2.5 py-1 text-left"
                          >
                            <Box state={on ? "on" : "off"} small />
                            <span className="min-w-0 flex-1 break-words text-sm leading-snug text-ink/80">
                              <Highlight text={r.zone.name} query={query} />
                            </span>
                            {counts && <Counts total={r.zone.total} missing={phone ? r.zone.missingPhone : 0} small />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const chipKeys = [...selected];
  const nSel = chipKeys.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={nSel > 1 ? chipKeys.map(chipLabel).join(", ") : undefined}
        className={`inline-flex h-10 ${block ? "w-full" : "max-w-[260px] shrink-0"} items-center gap-2 rounded-xl border px-3.5 text-sm font-medium text-ink transition hover:border-ink/30 hover:bg-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
          nSel > 0 ? "border-gold-dark bg-gold/20" : "border-ink/15 bg-white"
        }`}
      >
        <MapPin size={14} strokeWidth={1.75} className="shrink-0 text-ink/50" />
        <span className="truncate">{label}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={`ml-0.5 shrink-0 text-ink/45 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          <div className={`fixed inset-0 bg-ink/40 ${block ? "z-[90]" : "z-40 sm:hidden"}`} onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Filtrar por zona"
            onKeyDown={(e) => {
              if (e.key === "Escape" && e.target !== inputRef.current) closeAndFocus();
            }}
            className={
              block
                ? // Dentro de un formulario/modal se centra en pantalla: así no lo recorta el modal que lo contiene.
                  "fixed inset-x-3 bottom-3 top-auto z-[100] flex max-h-[88vh] animate-[zfIn_.2s_ease-out] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-cream-50 shadow-[0_24px_60px_-20px_rgba(40,28,10,0.55)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2"
                : "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] animate-[zfIn_.2s_ease-out] flex-col overflow-hidden rounded-t-2xl border border-ink/10 bg-cream-50 shadow-[0_-12px_40px_-12px_rgba(10,10,10,0.35)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-[calc(100%+8px)] sm:z-30 sm:max-h-none sm:w-[27rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:shadow-[0_24px_60px_-20px_rgba(40,28,10,0.45)]"
            }
          >
            <span aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-3 sm:pt-4">
              <div>
                <h2 className="crm-section-title leading-tight text-ink">Zona</h2>
                <p className="mt-0.5 text-xs text-ink/50">Elige distritos, barrios o municipios.</p>
              </div>
              <button
                type="button"
                onClick={closeAndFocus}
                aria-label="Cerrar selector de zona"
                className="-mr-1 rounded-lg p-1.5 text-ink/50 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
              >
                <X size={17} />
              </button>
            </header>

            <div className="px-4">
              <div className="flex h-11 items-center gap-2.5 rounded-xl border border-ink/15 bg-white px-3 shadow-[inset_0_1px_2px_rgba(10,10,10,0.04)] transition focus-within:border-gold-dark focus-within:ring-2 focus-within:ring-gold/30">
                <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink/40" />
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
                    className="rounded-full p-0.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
                    aria-label="Borrar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {counts && (
                  <Shortcut
                    icon={<TrendingUp size={12} />}
                    onClick={() => commit(new Set(topKeys(sorted, 5)))}
                    label={`Top 5 con más ${unit}`}
                  />
                )}
                {phone && (
                  <Shortcut
                    icon={<Phone size={12} />}
                    pressed={onlyMissing}
                    onClick={() => setOnlyMissing((v) => !v)}
                    label="Solo sin teléfono"
                  />
                )}
              </div>
            </div>

            {nSel > 0 && (
              <div className="mx-4 mt-3 rounded-xl border border-gold/30 bg-gold/10 px-2.5 py-2">
                <ul className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-y-auto" aria-label="Zonas seleccionadas">
                  {chipKeys.map((k) => (
                    <li key={k} className="max-w-full">
                      <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-ink/10 bg-white py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink shadow-sm">
                        <span className="break-words">{k.startsWith("d:") ? `Todo ${chipLabel(k)}` : chipLabel(k)}</span>
                        <button
                          type="button"
                          onClick={() => removeChip(k)}
                          aria-label={`Quitar ${chipLabel(k)}`}
                          className="rounded-full p-0.5 text-ink/45 transition hover:bg-ink hover:text-cream-50"
                        >
                          <X size={11} strokeWidth={2.25} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              id={`${uid}-list`}
              ref={listRef}
              role="listbox"
              aria-multiselectable
              aria-label="Zonas"
              className={`mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-ink/10 ${block ? "sm:max-h-[26rem]" : "sm:max-h-[22rem]"}`}
            >
              {rows.length === 0 && (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
                    <Search size={18} strokeWidth={1.75} />
                  </span>
                  <p className="mt-3 text-base font-semibold text-ink">
                    {onlyMissing && !searching ? "Todo con teléfono" : "Sin resultados"}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink/55">
                    {onlyMissing && !searching
                      ? "No hay zonas con anuncios sin teléfono."
                      : `No encontramos «${query.trim()}». Prueba con otro nombre; no hace falta escribir tildes.`}
                  </p>
                  {searching && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="mt-3 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-medium text-ink transition hover:border-ink/30"
                    >
                      Borrar búsqueda
                    </button>
                  )}
                </div>
              )}
              {renderSection("Madrid capital", madrid)}
              {renderSection("Municipios", munis)}
            </div>

            <footer className="flex items-center gap-3 border-t border-ink/10 bg-white/70 px-4 py-3">
              <span className="text-xs text-ink/55" aria-live="polite">
                {nSel === 0 ? "Ninguna seleccionada" : `${nSel} ${nSel === 1 ? "seleccionada" : "seleccionadas"}`}
              </span>
              <button
                type="button"
                onClick={clearAll}
                disabled={nSel === 0}
                className="ml-auto text-xs font-medium text-ink/60 underline-offset-2 transition hover:text-ink hover:underline disabled:opacity-35 disabled:no-underline"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={closeAndFocus}
                className="h-9 rounded-xl bg-ink px-5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
              >
                Aplicar
              </button>
            </footer>
          </div>
        </>
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
    <span className="ml-auto flex shrink-0 items-center gap-1.5">
      {missing > 0 && (
        <span
          title={`${missing} sin teléfono`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-amber-700/85"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500/80" />
          {missing} sin tel.
        </span>
      )}
      <span
        className={`min-w-[2rem] rounded-full bg-ink/[0.06] px-2 text-center tabular-nums text-ink/65 ${
          small ? "py-px text-xs" : "py-0.5 text-xs font-medium"
        }`}
      >
        {total.toLocaleString("es-ES")}
      </span>
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        pressed
          ? "border-gold-dark bg-gold/30 text-ink"
          : "border-ink/15 bg-white text-ink/70 hover:border-gold-dark/60 hover:text-ink"
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
  const size = small ? "h-4 w-4 rounded-[5px]" : "h-[18px] w-[18px] rounded-md";
  const filled = state !== "off";
  return (
    <span
      aria-hidden
      className={`flex ${size} shrink-0 items-center justify-center border transition ${
        filled ? "border-ink bg-ink text-gold-light" : "border-ink/25 bg-white"
      }`}
    >
      {state === "on" && <Check size={small ? 10 : 12} strokeWidth={3} />}
      {state === "some" && <Minus size={small ? 10 : 12} strokeWidth={3} />}
    </span>
  );
}
