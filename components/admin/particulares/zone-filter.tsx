"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ZoneFilterEntry = { name: string; total: number; missingPhone: number };
export type ZoneFilterGroup = {
  district: string;
  total: number;
  missingPhone: number;
  zones: ZoneFilterEntry[];
};

interface ZoneFilterProps {
  groups: ZoneFilterGroup[];
  /** "" | varias entradas "d:<distrito>" / "z:<zona>" separadas por "|". */
  value: string;
  onChange: (value: string) => void;
}

// Separador de selecciones en la URL. "|" y no "," porque algún distrito
// lleva coma en el nombre ("Moncloa - Aravaca" no, pero el criterio se
// mantiene por seguridad); page.tsx parte por el mismo carácter.
const SEP = "|";

function parse(value: string): string[] {
  return value.split(SEP).map((s) => s.trim()).filter(Boolean);
}

/**
 * Selector de zona buscable y de MULTI-selección: permite marcar varios
 * distritos y/o barrios a la vez (buscar en Salamanca + Chamberí en una
 * sola pasada, como la búsqueda multi-zona de Idealista) en vez de obligar
 * a repetir la búsqueda zona por zona. Mantiene el formato de valor
 * "d:"/"z:" que ya consumía el filtrado; lo único nuevo es que pueden ir
 * varios unidos por "|".
 */
export function ZoneFilter({ groups, value, onChange }: ZoneFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => new Set(parse(value)), [value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => {
        const districtMatches = g.district.toLowerCase().includes(q);
        const zones = districtMatches ? g.zones : g.zones.filter((z) => z.name.toLowerCase().includes(q));
        if (!districtMatches && zones.length === 0) return null;
        return { ...g, zones };
      })
      .filter((g): g is ZoneFilterGroup => g !== null);
  }, [groups, q]);

  const label = useMemo(() => {
    const items = parse(value);
    if (items.length === 0) return "Zona: todas";
    const pretty = (v: string) =>
      v.startsWith("d:") ? `Todo ${v.slice(2)}` : v.startsWith("z:") ? v.slice(2) : v;
    if (items.length === 1) return pretty(items[0]);
    // Con varias, el primero + contador: el botón tiene ancho acotado y
    // listarlas todas lo desbordaría.
    return `${pretty(items[0])} +${items.length - 1}`;
  }, [value]);

  // Marcar/desmarcar sin cerrar el desplegable: elegir varias zonas de una
  // sentada es justo el caso de uso, cerrar en cada clic lo haría inútil.
  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next].join(SEP));
  }

  function clearAll() {
    onChange("");
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[220px] items-center gap-1.5 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink transition focus:border-gold/55 focus:outline-none"
      >
        <MapPin size={13} strokeWidth={1.75} className="shrink-0 text-ink/45" />
        <span className="truncate">{label}</span>
        <ChevronDown size={13} strokeWidth={1.75} className="ml-auto shrink-0 text-ink/40" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-72 rounded-xl border border-gold/20 bg-cream-50 p-2 shadow-[0_20px_50px_-20px_rgba(40,28,10,0.4)]">
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-2.5 py-1.5">
            <Search size={13} strokeWidth={1.75} className="text-ink/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar distrito o barrio…"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
            />
            {selected.size > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-ink/40 transition hover:text-ink"
                aria-label="Quitar filtro de zona"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-ink/50">
                {selected.size} {selected.size === 1 ? "zona" : "zonas"} seleccionada
                {selected.size === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-ink/45 underline transition hover:text-ink"
              >
                Limpiar
              </button>
            </div>
          )}

          <div className="mt-2 max-h-72 overflow-y-auto">
            {filteredGroups.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-ink/45">Sin resultados</p>
            )}
            {filteredGroups.map((g) => {
              const districtKey = `d:${g.district}`;
              const districtOn = selected.has(districtKey);
              return (
                <div key={g.district} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggle(districtKey)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition hover:bg-gold/10 ${
                      districtOn ? "bg-gold/15 text-ink" : "text-ink/85"
                    }`}
                  >
                    <Box on={districtOn} />
                    <span className="truncate">{g.district}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal text-ink/45">
                      {g.total}
                      {g.missingPhone > 0 && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          {g.missingPhone} sin tel.
                        </span>
                      )}
                    </span>
                  </button>
                  {g.zones.length > 1 &&
                    g.zones.map((z) => {
                      const zoneKey = `z:${z.name}`;
                      // Si el distrito entero está marcado, sus barrios ya
                      // entran: se muestran marcados y en gris para que no
                      // parezca que hay que marcarlos uno a uno.
                      const zoneOn = selected.has(zoneKey) || districtOn;
                      return (
                        <button
                          key={z.name}
                          type="button"
                          onClick={() => toggle(zoneKey)}
                          disabled={districtOn}
                          className={`flex w-full items-center gap-2 rounded-md py-1 pl-4 pr-2 text-left text-xs transition hover:bg-gold/10 disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent ${
                            selected.has(zoneKey) ? "bg-gold/15 text-ink" : "text-ink/65"
                          }`}
                        >
                          <Box on={zoneOn} small />
                          <span className="truncate">{z.name}</span>
                          <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-ink/40">
                            {z.total}
                            {z.missingPhone > 0 && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                                {z.missingPhone}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Casilla de selección dibujada a mano (no un <input type="checkbox">): va
// dentro de un <button>, donde un input anidado no sería accesible por
// teclado de forma independiente y además rompería el click del botón.
function Box({ on, small }: { on: boolean; small?: boolean }) {
  const size = small ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      aria-hidden
      className={`flex ${size} shrink-0 items-center justify-center rounded border transition ${
        on ? "border-gold bg-gold text-ink" : "border-ink/25 bg-white"
      }`}
    >
      {on && <Check size={small ? 9 : 11} strokeWidth={3} />}
    </span>
  );
}
