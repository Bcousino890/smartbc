"use client";

import { ChevronDown, Minus, Plus, Tag as TagIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PropertyTag } from "@/lib/properties/tags";
import { cn } from "@/lib/utils";
import { TagChip } from "./tag-chip";

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

// Filtro multi por etiqueta (basta con tener una de las marcadas).
export function TagFilterMenu({
  tags,
  selected,
  onChange,
  onManage,
}: {
  tags: PropertyTag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onManage: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition",
          selected.length > 0
            ? "border-gold/50 bg-gold/10 text-gold-dark"
            : "border-ink/10 bg-white/85 text-ink/75 hover:border-gold/55",
        )}
      >
        <TagIcon size={12} strokeWidth={1.75} />
        <span>Etiquetas{selected.length > 0 ? ` (${selected.length})` : ""}</span>
        <ChevronDown size={12} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-gold/20 bg-cream-50 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]">
          <div className="max-h-64 overflow-auto py-1">
            {tags.length === 0 && (
              <p className="px-3.5 py-3 text-xs text-ink/55">Aún no hay etiquetas.</p>
            )}
            {tags.map((t) => {
              const on = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])
                  }
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition hover:bg-gold/10"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border text-[0px]",
                      on ? "border-gold bg-gold" : "border-ink/25 bg-white",
                    )}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-sm bg-ink" />}
                  </span>
                  <TagChip name={t.name} color={t.color} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="w-full border-t border-gold/10 px-3.5 py-2.5 text-left text-xs font-medium text-gold-dark transition hover:bg-gold/10"
          >
            Gestionar etiquetas…
          </button>
        </div>
      )}
    </div>
  );
}

// Acción en lote sobre la selección: añadir o quitar una etiqueta.
export function BatchTagMenu({
  tags,
  count,
  busy,
  onApply,
  onManage,
}: {
  tags: PropertyTag[];
  count: number;
  busy: boolean;
  onApply: (tagId: string, mode: "add" | "remove") => void;
  onManage: () => void;
}) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="crm-button inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-white px-3 py-1.5 text-gold-dark transition hover:bg-gold/10"
      >
        <TagIcon size={12} strokeWidth={1.75} />
        <span>Etiquetas</span>
        <ChevronDown size={12} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-gold/20 bg-cream-50 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]">
          <p className="border-b border-gold/10 px-3.5 py-2 text-xs text-ink/55">
            Aplicar a {count} propiedad{count === 1 ? "" : "es"} seleccionada{count === 1 ? "" : "s"}
          </p>
          <div className="max-h-64 overflow-auto py-1">
            {tags.length === 0 && (
              <p className="px-3.5 py-3 text-xs text-ink/55">Aún no hay etiquetas.</p>
            )}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3.5 py-1.5">
                <TagChip name={t.name} color={t.color} className="min-w-0" />
                <span className="ml-auto flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApply(t.id, "add")}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Plus size={11} /> Añadir
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApply(t.id, "remove")}
                    className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs text-ink/65 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                  >
                    <Minus size={11} /> Quitar
                  </button>
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="w-full border-t border-gold/10 px-3.5 py-2.5 text-left text-xs font-medium text-gold-dark transition hover:bg-gold/10"
          >
            Gestionar etiquetas…
          </button>
        </div>
      )}
    </div>
  );
}
