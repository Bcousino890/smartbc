"use client";

// ============================================================================
// Índice de la pestaña Propiedades.
//
// La pestaña tiene cinco bloques largos (anuncios de portales, selección,
// selección privada, sugeridas, favoritos). Sin índice, para saber si había
// algo en el cuarto había que bajar por delante de los otros tres. Aquí cada
// bloque es un salto con su cifra; el punto dorado marca lo recién llegado.
// ============================================================================

import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export type JumpItem = {
  id: string;
  label: string;
  /** null = el bloque no sabe contarse sin cargarse (p.ej. sugeridas). */
  count: number | null;
  highlight?: boolean;
};

export function PropertiesJumpBar({ items }: { items: JumpItem[] }) {
  const t = useT();
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Que el enlace se pueda copiar y que "atrás" vuelva al sitio.
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
  };

  return (
    <nav aria-label={t("cc.properties.jump.label")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => go(item.id)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
            item.highlight
              ? "border-gold/50 bg-gold/10 text-ink hover:border-gold"
              : "border-ink/10 bg-white text-ink/60 hover:border-ink/25 hover:text-ink",
          )}
        >
          {item.highlight && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
          )}
          {item.label}
          {typeof item.count === "number" && (
            <span
              className={cn(
                "tabular-nums",
                item.count > 0 ? "text-ink/70" : "text-ink/30",
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
