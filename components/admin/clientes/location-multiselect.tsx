"use client";

import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Datos de Chile hardcodeados para MVP (se complementará con DB cuando esté poblada)
export const CHILE_REGIONS: { code: string; name: string }[] = [
  { code: "RM", name: "Región Metropolitana" },
  { code: "V", name: "Valparaíso" },
  { code: "VIII", name: "Biobío" },
  { code: "IX", name: "La Araucanía" },
  { code: "X", name: "Los Lagos" },
  { code: "I", name: "Tarapacá" },
  { code: "II", name: "Antofagasta" },
  { code: "III", name: "Atacama" },
  { code: "IV", name: "Coquimbo" },
  { code: "VI", name: "O'Higgins" },
  { code: "VII", name: "Maule" },
  { code: "XI", name: "Aysén" },
  { code: "XII", name: "Magallanes" },
  { code: "XIV", name: "Los Ríos" },
  { code: "XV", name: "Arica y Parinacota" },
  { code: "XVI", name: "Ñuble" },
];

export const COMMUNES_BY_REGION: Record<string, string[]> = {
  RM: [
    "Barnechea", "Buin", "Calera de Tango", "Cerrillos", "Cerro Navia",
    "Colina", "Conchalí", "El Bosque", "El Monte", "Estación Central",
    "Huechuraba", "Independencia", "Isla de Maipo", "La Cisterna",
    "La Florida", "La Granja", "La Pintana", "La Reina", "Lampa",
    "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Maipú",
    "María Pinto", "Melipilla", "Paine", "Pedro Aguirre Cerda",
    "Peñaflor", "Peñalolén", "Pirque", "Providencia", "Pudahuel",
    "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta", "Renca",
    "San Bernardo", "San Joaquín", "San José de Maipo", "San Miguel",
    "San Ramón", "Santiago", "Talagante", "Vitacura",
  ],
  V: [
    "Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana",
    "San Antonio", "Quillota", "Los Andes", "San Felipe", "Casablanca",
    "Concón", "Olmué", "Limache",
  ],
  VIII: [
    "Concepción", "Talcahuano", "Hualpén", "San Pedro de la Paz",
    "Coronel", "Los Ángeles", "Chiguayante", "Lota", "Arauco",
  ],
  IX: [
    "Temuco", "Padre Las Casas", "Villarrica", "Pucón",
    "Angol", "Nueva Imperial",
  ],
  X: [
    "Puerto Montt", "Osorno", "Puerto Varas", "Castro",
    "Ancud", "Calbuco",
  ],
};

export const SECTORS_BY_COMMUNE: Record<string, string[]> = {
  Santiago: ["Barrio Italia", "Barrio Lastarria", "Barrio Yungay", "Centro", "Barrio República"],
  Providencia: ["Barrio Suecia", "Pedro de Valdivia", "Manuel Montt", "Ñuñoa", "Salvador"],
  "Las Condes": ["El Golf", "Apoquindo", "Tobalaba", "Manquehue", "El Arrayán"],
  "Lo Barnechea": ["La Dehesa", "Los Dominicos", "El Arrayán", "Chicureo"],
  Vitacura: ["Vitacura Centro", "El Bosque", "Los Leones", "Camino El Alba"],
  "La Reina": ["La Reina Centro", "La Cañada", "Tobalaba Sur"],
  Ñuñoa: ["Irarrázaval", "Macul", "Estadio Nacional", "Villa Frei"],
  Maipú: ["Maipú Centro", "Rinconada", "Las Américas", "Villa Euskadi"],
  "Puente Alto": ["Puente Alto Centro", "Bajos de Mena", "El Bosque"],
  "La Florida": ["La Florida Centro", "Vicuña Mackenna", "Rojas Magallanes"],
  Quilicura: ["Quilicura Centro", "Renca Norte"],
  Huechuraba: ["Huechuraba Centro", "Ciudad Empresarial"],
  Peñalolén: ["Lo Hermida", "San Luis", "La Faena"],
  "San Miguel": ["San Miguel Centro", "Lo Ovalle", "La Cisterna"],
};

interface LocationMultiselectProps {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

export function LocationMultiselect({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: LocationMultiselectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const removeTag = (val: string) => {
    onChange(selected.filter((s) => s !== val));
  };

  return (
    <div ref={ref} className="relative">
      <p className="mb-1 text-xs font-medium text-ink/45">{label}</p>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-[38px] w-full flex-wrap items-center gap-1 rounded-lg border border-ink/10 bg-white/70 px-2.5 py-1.5 text-left text-xs transition focus:outline-none",
          open ? "border-gold/55" : "hover:border-ink/20",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-ink/35">{placeholder}</span>
        ) : (
          selected.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 rounded-md border border-gold/25 bg-gold/12 px-2 py-0.5 text-xs font-medium text-gold-dark"
            >
              {val}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(val); }}
                className="opacity-60 hover:opacity-100"
              >
                <X size={10} strokeWidth={2} />
              </button>
            </span>
          ))
        )}
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn("ml-auto shrink-0 text-ink/40 transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-gold/20 bg-white shadow-xl">
          {/* Buscador */}
          <div className="flex items-center gap-2 border-b border-gold/10 px-3 py-2">
            <Search size={13} strokeWidth={1.75} className="shrink-0 text-ink/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              autoFocus
              className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink/35"
            />
          </div>

          {/* Opciones */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-ink/45">Sin resultados</li>
            ) : (
              filtered.map((option) => {
                const active = selected.includes(option);
                return (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => toggle(option)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition",
                        active ? "bg-gold/8 text-ink" : "text-ink/75 hover:bg-cream-100/70 hover:text-ink",
                      )}
                    >
                      <span className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                        active ? "border-gold bg-gold text-white" : "border-ink/20",
                      )}>
                        {active && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {option}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer */}
          {selected.length > 0 && (
            <div className="border-t border-gold/10 px-3 py-2">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-xs text-ink/45 hover:text-ink"
              >
                Limpiar selección ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
