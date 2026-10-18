"use client";

import { Search } from "lucide-react";

// Caja de búsqueda de texto de los listados de propiedades (BCP-01, P1).
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/90 px-3.5 py-2.5 text-sm transition focus-within:border-gold/55">
      <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink/45" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="crm-input w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
      />
    </label>
  );
}
