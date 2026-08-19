"use client";

// ============================================================================
// PRÓXIMA ACCIÓN
//
// La pregunta con la que se abre una ficha no es "qué datos tiene este
// cliente", es "qué hago ahora". La ficha anterior no la contestaba: había que
// recorrer siete bloques y deducirlo.
//
// Las acciones se derivan (ver `deriveNextActions`) y llegan ya ordenadas. La
// primera se pinta grande con su botón; el resto quedan en una lista corta.
// Ninguna se inventa: si no hay nada derivable, se dice que no hay nada, que
// también es información.
// ============================================================================

import { ArrowRight } from "lucide-react";
import type { NextAction } from "@/lib/client-command-center/types";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "./plural";
import { cn } from "@/lib/utils";
import { Panel } from "./ui";

const DOT: Record<NextAction["urgency"], string> = {
  now: "bg-rose-500",
  soon: "bg-amber-500",
  later: "bg-ink/25",
};

export function NextActionCard({
  actions,
  onGo,
}: {
  actions: NextAction[];
  onGo: (action: NextAction) => void;
}) {
  const t = useT();
  const tn = useTn();
  const [head, ...rest] = actions;

  // Las acciones cuentan cosas ("3 paradas sin confirmar"), y en singular hay
  // que decirlo en singular. Si no hay contador, 2 = usa la forma plural.
  const say = (key: string, a: NextAction) =>
    tn(key, Number(a.vars?.count ?? a.vars?.days ?? 2), a.vars);

  return (
    <Panel title={t("cc.next.title")}>
      {!head ? (
        <p className="text-[13px] text-ink/50">{t("cc.next.empty")}</p>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn("mt-[7px] h-2 w-2 shrink-0 rounded-full", DOT[head.urgency])}
            />
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[17px] leading-snug text-ink">
                {say(head.titleKey, head)}
              </p>
              {head.detailKey && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink/55">
                  {say(head.detailKey, head)}
                </p>
              )}
              <button
                type="button"
                onClick={() => onGo(head)}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[11.5px] font-medium text-cream-50 transition hover:bg-ink-soft"
              >
                {t(`cc.next.cta.${head.tab}`)}
                <ArrowRight size={12} strokeWidth={2} className="text-gold" />
              </button>
            </div>
          </div>

          {rest.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-ink/8 pt-3">
              {rest.slice(0, 4).map((a) => (
                <li key={a.kind}>
                  <button
                    type="button"
                    onClick={() => onGo(a)}
                    className="flex w-full items-center gap-2 text-left text-[12px] text-ink/60 transition hover:text-ink"
                  >
                    <span
                      aria-hidden
                      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[a.urgency])}
                    />
                    <span className="truncate">{say(a.titleKey, a)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
