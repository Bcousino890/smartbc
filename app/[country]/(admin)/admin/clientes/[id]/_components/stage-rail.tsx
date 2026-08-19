"use client";

// ============================================================================
// La etapa del cliente, en una línea.
//
// No es un campo que alguien mantenga: sale de lo que las tablas ya dicen (ver
// `deriveClientStage`). Por eso puede pintarse con confianza — no puede quedar
// desfasada respecto al trabajo real.
//
// La forma es deliberada: ocho segmentos finos, y SOLO el actual lleva rótulo.
// Ocho etiquetas a la vez serían ruido; el resto se consulta al pasar por
// encima. En móvil el carril desaparece y queda el rótulo, que es el dato.
// ============================================================================

import { CLIENT_STAGES, stageIndex, type ClientStage } from "@/lib/client-command-center/types";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function StageRail({ stage }: { stage: ClientStage }) {
  const t = useT();
  const current = stageIndex(stage);

  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
        {t(`cc.stage.${stage}`)}
      </span>
      <div
        className="hidden min-w-0 flex-1 items-center gap-1 sm:flex"
        role="img"
        aria-label={t("cc.stage.progress", {
          step: current + 1,
          total: CLIENT_STAGES.length,
        })}
      >
        {CLIENT_STAGES.map((s, i) => (
          <span
            key={s}
            title={t(`cc.stage.${s}`)}
            className={cn(
              "h-[3px] flex-1 rounded-full transition-colors",
              i < current && "bg-gold/45",
              i === current && "bg-gold",
              i > current && "bg-ink/10",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-[10.5px] tabular-nums text-ink/35">
        {current + 1}/{CLIENT_STAGES.length}
      </span>
    </div>
  );
}
