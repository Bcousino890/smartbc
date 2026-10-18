"use client";

import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// Botón «Más filtros (n)» que abre el panel de filtros avanzados (BCP-01, P1).
export function MoreFiltersToggle({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "crm-button inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition",
        open || count > 0
          ? "border-gold/50 bg-gold/10 text-gold-dark"
          : "border-ink/10 bg-white/85 text-ink/70 hover:border-gold/55",
      )}
    >
      <SlidersHorizontal size={12} strokeWidth={1.75} />
      <span>Más filtros{count > 0 ? ` (${count})` : ""}</span>
    </button>
  );
}
