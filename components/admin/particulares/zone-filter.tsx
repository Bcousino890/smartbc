"use client";

import { ChevronDown, MapPin, Search, X } from "lucide-react";
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
  /** "" | "d:<distrito>" | "z:<zona>" — mismo formato que ya usa el filtro. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Selector de zona buscable: reemplaza el <select> nativo (21 distritos ×
 * hasta 8 barrios, sin buscador, había que scrollear a ciegas) por un
 * combobox con filtro de texto y conteos por zona (total + sin teléfono,
 * para priorizar barridos como se hace hoy con el workflow de GitHub
 * Actions). Mantiene el mismo formato de valor "d:"/"z:" que ya consume
 * el resto del filtrado, así que no hace falta tocar esa lógica.
 */
export function ZoneFilter({ groups, value, onChange }: ZoneFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!value) return "Zona: todas";
    if (value.startsWith("d:")) return `Todo ${value.slice(2)}`;
    if (value.startsWith("z:")) return value.slice(2);
    return value;
  }, [value]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
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
            {value && (
              <button
                type="button"
                onClick={() => select("")}
                className="text-ink/40 transition hover:text-ink"
                aria-label="Quitar filtro de zona"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto">
            {filteredGroups.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-ink/45">Sin resultados</p>
            )}
            {filteredGroups.map((g) => (
              <div key={g.district} className="mb-1">
                <button
                  type="button"
                  onClick={() => select(`d:${g.district}`)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium transition hover:bg-gold/10 ${
                    value === `d:${g.district}` ? "bg-gold/15 text-ink" : "text-ink/85"
                  }`}
                >
                  <span className="truncate">{g.district}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 text-xs font-normal text-ink/45">
                    {g.total}
                    {g.missingPhone > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                        {g.missingPhone} sin tel.
                      </span>
                    )}
                  </span>
                </button>
                {g.zones.length > 1 &&
                  g.zones.map((z) => (
                    <button
                      key={z.name}
                      type="button"
                      onClick={() => select(`z:${z.name}`)}
                      className={`flex w-full items-center justify-between rounded-md py-1 pl-6 pr-2 text-left text-xs transition hover:bg-gold/10 ${
                        value === `z:${z.name}` ? "bg-gold/15 text-ink" : "text-ink/65"
                      }`}
                    >
                      <span className="truncate">{z.name}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-ink/40">
                        {z.total}
                        {z.missingPhone > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                            {z.missingPhone}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
