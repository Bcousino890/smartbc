"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bloque colapsable de la ficha del cliente. El estado no se persiste entre
 * sesiones (decisión de producto para V1): solo dura mientras la página vive.
 */
export function CollapsibleBlock({
  title,
  count,
  defaultOpen = true,
  actions,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={cn(
              "shrink-0 text-gold transition-transform",
              !open && "-rotate-90",
            )}
          />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            {title}
          </h2>
          {count != null && count > 0 && (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold-dark">
              {count}
            </span>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}
