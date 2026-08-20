"use client";

// ============================================================================
// Las cinco pestañas del centro de trabajo.
//
// La ficha anterior era UNA columna con siete bloques largos: para llegar a
// las visitas había que pasar por delante de todo lo demás. Aquí cada pestaña
// es un trabajo distinto, y la cifra al lado dice si hay algo que mirar antes
// de entrar.
//
// El estado vive en la URL (`?tab=`), no en el componente: así se puede
// enlazar una pestaña concreta, recargar sin perder el sitio y volver con el
// botón de atrás. La navegación usa `replace` con `scroll: false` para que
// cambiar de pestaña no salte al principio de la página.
// ============================================================================

import { COMMAND_TABS, type CommandTab } from "@/lib/client-command-center/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function CommandTabs({
  active,
  counts,
  onChange,
}: {
  active: CommandTab;
  /** Cifra que acompaña a cada pestaña. `null` = no se pinta nada. */
  counts: Partial<Record<CommandTab, number | null>>;
  onChange: (tab: CommandTab) => void;
}) {
  const t = useT();

  return (
    <nav
      aria-label={t("cc.tabs.label")}
      className="sticky top-0 z-30 border-b border-ink/10 bg-cream-50/95 backdrop-blur-sm"
    >
      {/* Cinco pestañas no caben en 390px por mucho que se aprieten, así que
          la tira se desliza. Lo que no puede pasar es que no se NOTE: el velo
          del borde derecho existe para eso, y desaparece en cuanto sobra
          sitio. Recortar los rótulos sería peor: "Solicitud" y "Actividad"
          abreviados dejan de leerse de un vistazo. */}
      <div className="relative">
        <div className="mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4 lg:px-8 [&::-webkit-scrollbar]:hidden">
        {COMMAND_TABS.map((tab) => {
          const count = counts[tab];
          const on = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab)}
              className={cn(
                "relative shrink-0 px-2 py-2.5 text-xs font-medium transition-colors sm:px-3",
                on ? "text-ink" : "text-ink/45 hover:text-ink/75",
              )}
            >
              {t(`cc.tab.${tab}`)}
              {typeof count === "number" && count > 0 && (
                <span
                  className={cn(
                    "ms-1.5 rounded px-1 py-px text-xs font-semibold tabular-nums",
                    on ? "bg-gold/15 text-gold-dark" : "bg-ink/[0.06] text-ink/45",
                  )}
                >
                  {count}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-2 bottom-0 h-[2px] origin-left rounded-full bg-ink transition-transform duration-300",
                  on ? "scale-x-100" : "scale-x-0",
                )}
              />
            </button>
          );
        })}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-cream-50 to-transparent sm:hidden"
        />
      </div>
    </nav>
  );
}
