"use client";

import type { Funnel } from "@/lib/captaciones-map/pins";
import { formatAreaKm2, formatEuro, funnelRows } from "@/lib/captaciones-map/panels";

type Props = {
  funnel: Funnel;
  areaKm2: number | null;
  /** Sin cliente se muestra solo «en zona», nuevos y precio medio. */
  clientName: string | null;
  /** «Ya captados» (null = dato no disponible → se oculta, nunca se inventa un 0). */
  captured: number | null;
  theme?: "light" | "dark";
  /** Para que quien lo monte lo coloque (el panel no se posiciona solo). */
  className?: string;
};

/**
 * Embudo de la zona dibujada. Panel de cristal que flota sobre el mapa:
 * tres barras proporcionales a «en zona» y tres cifras grandes.
 */
export function FunnelPanel({ funnel, areaKm2, clientName, captured, theme = "light", className }: Props) {
  const hasClient = clientName !== null;
  const rows = funnelRows(funnel, hasClient);
  return (
    <section
      className={`cmp-fun font-crm-sans ${theme === "dark" ? "cmp-dark" : ""} ${className ?? ""}`}
      aria-label="Embudo de la zona"
    >
      <h3 className="cmp-fun-h">
        <span>Embudo de la zona</span>
        <b className="cmp-num">{formatAreaKm2(areaKm2)}</b>
      </h3>
      <div className="cmp-fun-rows">
        {rows.map((r) => (
          <div key={r.key} className={`cmp-fun-row cmp-fun-${r.key}`}>
            <span>{r.label}</span>
            <div className="cmp-fun-track" role="presentation">
              <i style={{ width: `${r.pct}%` }} />
            </div>
            <b className="cmp-num">{r.value}</b>
          </div>
        ))}
      </div>
      {funnel.withoutLocation > 0 && (
        <p className="cmp-fun-note">
          {funnel.withoutLocation} sin ubicación (no se pueden situar en el mapa)
        </p>
      )}
      <div className="cmp-fun-big">
        <div>
          <b className="cmp-num crm-number">{funnel.newIn24h}</b>
          <small>nuevos en 24 h</small>
        </div>
        {hasClient && captured !== null && (
          <div>
            <b className="cmp-num crm-number">{captured}</b>
            <small>ya captados</small>
          </div>
        )}
        <div>
          <b className="cmp-num crm-number">{funnel.avgPrice !== null ? formatEuro(funnel.avgPrice) : "—"}</b>
          <small>precio medio</small>
        </div>
      </div>
      <style>{STYLES}</style>
    </section>
  );
}

const STYLES = `
.cmp-fun{--g:rgba(255,255,255,.74);--gl:rgba(255,255,255,.7);--gi:#0a0a0a;--gm:#6f685d;--gold:#c9a96e;--gold-d:#a88a52;
  width:350px;max-width:100%;padding:14px 16px;border-radius:14px;color:var(--gi);
  background:var(--g);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);
  border:1px solid var(--gl);box-shadow:0 10px 30px rgba(40,30,10,.16)}
.cmp-fun.cmp-dark{--g:rgba(24,22,19,.66);--gl:rgba(255,255,255,.09);--gi:#f3eee6;--gm:#a39b8f}
.cmp-num{font-variant-numeric:tabular-nums}
.cmp-fun-h{margin:0 0 10px;font:600 12px Lato,sans-serif;color:var(--gm);display:flex;justify-content:space-between}
.cmp-fun-h b{color:var(--gi)}
.cmp-fun-rows{display:grid;gap:8px}
.cmp-fun-row{display:grid;grid-template-columns:96px 1fr 34px;gap:10px;align-items:center;font-size:12.5px}
.cmp-fun-row>span{color:var(--gm)}
.cmp-fun-track{height:8px;border-radius:99px;background:rgba(127,118,100,.2);overflow:hidden}
.cmp-fun-track i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--gold-d),var(--gold));
  transition:width .5s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 10px rgba(201,169,110,.7)}
.cmp-fun-matches .cmp-fun-track i{background:linear-gradient(90deg,#0a0a0a,#3a352f);box-shadow:none}
.cmp-dark .cmp-fun-matches .cmp-fun-track i{background:linear-gradient(90deg,#f3eee6,#c9a96e)}
.cmp-fun-row b{text-align:right;font:700 14px Lato,sans-serif}
.cmp-fun-note{margin:8px 0 0;font-size:11.5px;color:var(--gm)}
.cmp-fun-big{display:flex;gap:18px;margin-top:12px;padding-top:12px;border-top:1px solid var(--gl)}
.cmp-fun-big b{display:block;font-size:26px;line-height:1}
.cmp-fun-big small{font-size:11.5px;color:var(--gm)}
@media (prefers-reduced-motion:reduce){.cmp-fun-track i{transition:none}}
`;
