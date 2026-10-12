"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AGENCY_SEP, splitAgencies } from "../use-particulares-filters";
import { FOCUS_RING } from "./controls";
import { fmtNum, portalName } from "./format";

type Agency = { key: string; name: string; active: number; total: number; portals: string[] };

/**
 * Combobox de agencias con selección múltiple (chips quitables). Busca en el
 * servidor (`/api/admin/particulares/agencies`) con un pequeño retardo y
 * enseña cuántos anuncios tiene cada agencia. Valor = claves separadas por «|».
 */
export function AgencyCombobox({
  label,
  description,
  value,
  onChange,
  names,
  remember,
  tone = "include",
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  names: Record<string, string>;
  remember: (key: string, name: string) => void;
  tone?: "include" | "exclude";
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = splitAgencies(value);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/particulares/agencies?q=${encodeURIComponent(text.trim())}&limit=12`, { signal: ctrl.signal });
        const data = await res.json();
        if (!res.ok || !data.ok || data.unavailable) throw new Error("agencies_failed");
        setItems(data.agencies as Agency[]);
        setFailed(false);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, text ? 200 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const options = items.filter((a) => !selected.includes(a.key));

  function pick(a: Agency) {
    remember(a.key, a.name);
    onChange([...selected, a.key].join(AGENCY_SEP));
    setText("");
    setActive(0);
  }
  const remove = (key: string) => onChange(selected.filter((k) => k !== key).join(AGENCY_SEP));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Backspace" && !text && selected.length) {
      remove(selected[selected.length - 1]);
    }
  }

  return (
    <div ref={wrapRef} className="space-y-1.5">
      <label htmlFor={`${id}-input`} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <p className="text-xs text-ink/65">{description}</p>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label}: elegidas`}>
          {selected.map((k) => (
            <li
              key={k}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-xs text-ink",
                tone === "exclude" ? "border-red-300 bg-red-50" : "border-gold-dark bg-gold/25",
              )}
            >
              {names[k] ?? k}
              <button type="button" onClick={() => remove(k)} aria-label={`Quitar ${names[k] ?? k}`} className={cn("rounded-full p-1 text-ink/60 hover:bg-ink/10", FOCUS_RING)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tone === "exclude" ? "Buscar agencia a excluir…" : "Buscar agencia…"}
          className={cn("h-10 w-full rounded-xl border border-ink/15 bg-white px-3 pr-9 text-sm text-ink placeholder:text-ink/50 focus:border-ink/40", FOCUS_RING)}
        />
        {loading && <Loader2 size={14} aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink/50" />}
        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-label={`Agencias (${label})`}
            className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-ink/10 bg-white p-1 shadow-lg"
          >
            {failed ? (
              <li className="px-3 py-2.5 text-sm text-red-700">No se pudieron cargar las agencias. Inténtalo de nuevo.</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-ink/65">{loading ? "Buscando…" : text ? "Ninguna agencia coincide." : "No hay más agencias."}</li>
            ) : (
              options.map((a, i) => (
                <li
                  key={a.key}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(a);
                  }}
                  className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm", i === active ? "bg-ink/5" : "")}
                >
                  <span className="min-w-0 truncate font-medium text-ink">{a.name}</span>
                  <span className="shrink-0 text-right text-xs text-ink/65">
                    {fmtNum(a.active)} {a.active === 1 ? "anuncio" : "anuncios"}
                    {a.total > a.active ? ` · ${fmtNum(a.total)} con retirados` : ""}
                    {a.portals.length > 0 && <span className="block">{a.portals.map(portalName).join(", ")}</span>}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
