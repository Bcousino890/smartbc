"use client";

// Filtro de zona del listado de Propiedades: buscador, agrupado por distrito de
// Madrid y con el nº de propiedades de cada zona. El valor que devuelve es el
// nombre de zona tal cual está en la ficha, así que el filtrado no cambia.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";
import { cn } from "@/lib/utils";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ZoneFilterMenu({
  label = "Distrito",
  zones,
  value,
  onChange,
}: {
  label?: string;
  /** Zona tal cual está en las fichas + cuántas propiedades tiene. */
  zones: readonly { name: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const total = useMemo(() => zones.reduce((n, z) => n + z.count, 0), [zones]);

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const map = new Map<string, { name: string; count: number }[]>();
    for (const z of zones) {
      if (q && !fold(z.name).includes(q)) continue;
      const g = normalizeZone(z.name).district;
      (map.get(g) ?? map.set(g, []).get(g)!).push(z);
    }
    return [...map.entries()]
      .map(([district, items]) => ({
        district,
        count: items.reduce((n, z) => n + z.count, 0),
        items: items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es")),
      }))
      .sort((a, b) =>
        a.district === OTHER_ZONE_LABEL ? 1 : b.district === OTHER_ZONE_LABEL ? -1 : b.count - a.count,
      );
  }, [zones, query]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
          value ? "border-gold/50 bg-gold/10 text-gold-dark" : "border-ink/10 bg-white/85 text-ink/75 hover:border-gold/55",
        )}
      >
        <span className="crm-label-sm text-ink/45">{label}</span>
        <span className="max-w-[10rem] truncate text-ink">{value || "Todos"}</span>
        <ChevronDown size={12} strokeWidth={1.75} className={cn("transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-gold/20 bg-cream-50 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]">
          <div className="relative border-b border-gold/10 p-2">
            <Search size={13} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar zona…"
              className="h-8 w-full rounded-md border border-ink/10 bg-white ps-7 pe-7 text-xs text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Borrar búsqueda"
                className="absolute end-3.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink/40 hover:text-ink"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div role="listbox" className="max-h-80 overflow-auto py-1">
            {!query && (
              <Row selected={!value} onClick={() => pick("")} count={total}>
                <MapPin size={12} className="text-ink/40" /> Todas las zonas
              </Row>
            )}
            {groups.length === 0 && <p className="px-3.5 py-4 text-center text-xs text-ink/50">Ninguna zona coincide.</p>}
            {groups.map((g) => (
              <div key={g.district}>
                <p className="sticky top-0 flex items-center justify-between bg-cream-50/95 px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink/40 backdrop-blur">
                  {g.district}
                  <span className="font-normal tabular-nums">{g.count}</span>
                </p>
                {g.items.map((z) => (
                  <Row key={z.name} selected={value === z.name} onClick={() => pick(z.name)} count={z.count}>
                    {z.name}
                  </Row>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  selected,
  count,
  onClick,
  children,
}: {
  selected: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3.5 py-1.5 text-start text-xs transition hover:bg-gold/10",
        selected ? "font-medium text-ink" : "text-ink/75",
      )}
    >
      <span className="flex items-center gap-1.5">
        {selected && <Check size={12} className="text-gold-dark" />}
        {children}
      </span>
      <span className="tabular-nums text-ink/35">{count}</span>
    </button>
  );
}
