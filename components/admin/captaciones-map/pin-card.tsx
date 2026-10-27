"use client";

import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import type { MapPin } from "@/lib/captaciones-map/pins";
import { formatListingPrice, formatPinMeta } from "@/lib/captaciones-map/panels";

type Props = {
  pin: MapPin;
  score: number | null;
  /** Motivos del encaje (etiquetas verdes). */
  reasons: string[];
  /** Avisos solo para el equipo (etiquetas doradas): esta vista es solo admin. */
  warnings: string[];
  clientName: string | null;
  onCapture?: () => void;
  capturing?: boolean;
  onWhatsApp?: () => void;
  onOpen?: () => void;
  onClose(): void;
  theme?: "light" | "dark";
  className?: string;
};

/** Ficha flotante del pin seleccionado (cristal sobre el mapa). */
export function PinCard({
  pin, score, reasons, warnings, clientName, onCapture, capturing, onWhatsApp, onOpen, onClose, theme = "light", className,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);

  // Esc cierra la ficha, pero solo si el foco está dentro o en el body: así no
  // roba la tecla a otros controles del mapa (p. ej. el editor de zonas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const a = document.activeElement;
      if (a && a !== document.body && !rootRef.current?.contains(a)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canCapture = clientName !== null && !!onCapture;
  return (
    <article
      ref={rootRef}
      className={`cmp-card font-crm-sans ${theme === "dark" ? "cmp-dark" : ""} ${className ?? ""}`}
      aria-label={`Ficha: ${pin.address ?? pin.title}`}
    >
      <button type="button" className="cmp-card-x" onClick={onClose} aria-label="Cerrar ficha">
        <X size={16} aria-hidden />
      </button>
      <div
        className="cmp-card-ph"
        style={pin.coverUrl ? { backgroundImage: `url("${pin.coverUrl}")` } : undefined}
        role="img"
        aria-label={pin.coverUrl ? "Foto del anuncio" : "Sin foto"}
      />
      <div className="cmp-card-body">
        <div className="cmp-card-price">
          <b className="cmp-num">{formatListingPrice(pin.price, pin.operation)}</b>
          {score !== null && <span className="cmp-tag cmp-tag-g cmp-num">{Math.round(score)} %</span>}
        </div>
        <small className="cmp-card-meta">{formatPinMeta(pin)}</small>
        {(reasons.length > 0 || warnings.length > 0) && (
          <div className="cmp-tags">
            {reasons.map((r) => <span key={`r-${r}`} className="cmp-tag">{r}</span>)}
            {warnings.map((w) => <span key={`w-${w}`} className="cmp-tag cmp-tag-g">{w}</span>)}
          </div>
        )}
        <div className="cmp-card-act">
          {canCapture && (
            <button type="button" className="cmp-btn cmp-btn-dark" onClick={onCapture} disabled={capturing} aria-busy={capturing || undefined}>
              {capturing && <Loader2 size={13} className="cmp-spin" aria-hidden />}
              Captar para {clientName}
            </button>
          )}
          {onWhatsApp && <button type="button" className="cmp-btn cmp-btn-mint" onClick={onWhatsApp}>WhatsApp</button>}
          {onOpen && <button type="button" className="cmp-btn cmp-btn-line" onClick={onOpen}>Ficha</button>}
        </div>
      </div>
      <style>{STYLES}</style>
    </article>
  );
}

const STYLES = `
.cmp-card{--g:rgba(255,255,255,.74);--gl:rgba(255,255,255,.7);--gi:#0a0a0a;--gm:#6f685d;
  position:relative;width:400px;max-width:100%;padding:10px;display:grid;grid-template-columns:92px 1fr;gap:12px;
  border-radius:14px;color:var(--gi);background:var(--g);backdrop-filter:blur(14px) saturate(1.4);
  -webkit-backdrop-filter:blur(14px) saturate(1.4);border:1px solid var(--gl);box-shadow:0 10px 30px rgba(40,30,10,.16);
  animation:cmp-rise .25s cubic-bezier(.2,.8,.2,1)}
.cmp-card.cmp-dark{--g:rgba(24,22,19,.66);--gl:rgba(255,255,255,.09);--gi:#f3eee6;--gm:#a39b8f}
.cmp-num{font-variant-numeric:tabular-nums}
.cmp-card-ph{border-radius:9px;min-height:92px;align-self:stretch;background:#ede5d5 center/cover no-repeat;
  background-image:linear-gradient(160deg,#e1d5bd,#cfc3a8)}
.cmp-dark .cmp-card-ph{background-color:#2a2622;background-image:linear-gradient(160deg,#3a352f,#26221d)}
.cmp-card-ph[style]{background-size:cover}
.cmp-card-body{min-width:0;padding-right:18px}
.cmp-card-price{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cmp-card-price b{font-size:18px}
.cmp-card-meta{display:block;color:var(--gm);margin-top:2px}
.cmp-tags{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
.cmp-tag{font:700 10.5px Lato,sans-serif;padding:2px 8px;border-radius:999px;background:#e6f5ef;color:#0f6b4f}
.cmp-tag-g{background:#f5f0e8;color:#856329}
.cmp-dark .cmp-tag{background:rgba(18,166,114,.18);color:#6fdcb5}
.cmp-dark .cmp-tag-g{background:rgba(201,169,110,.16);color:#e0c58f}
.cmp-card-act{display:flex;gap:6px;margin:8px 0 0;flex-wrap:wrap}
.cmp-btn{white-space:nowrap}
.cmp-btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:8px 11px;font:700 12px Lato,sans-serif;cursor:pointer}
.cmp-btn:disabled{opacity:.65;cursor:progress}
.cmp-btn-dark{background:#0a0a0a;color:#fff}.cmp-btn-dark:hover:not(:disabled){background:#1a1a1a}
.cmp-dark .cmp-btn-dark{background:#c9a96e;color:#0a0a0a}
.cmp-btn-line{background:#fff;border:1px solid #e8e0d0;color:#0a0a0a}
.cmp-dark .cmp-btn-line{background:transparent;border-color:rgba(255,255,255,.18);color:#f3eee6}
.cmp-btn-mint{background:#e6f5ef;color:#0f6b4f;border:1px solid #bfe6d6}
.cmp-dark .cmp-btn-mint{background:rgba(18,166,114,.18);color:#6fdcb5;border-color:rgba(111,220,181,.3)}
.cmp-card-x{position:absolute;right:8px;top:6px;border:0;background:none;color:var(--gm);cursor:pointer;padding:4px;border-radius:8px;line-height:0}
.cmp-card-x:hover{color:var(--gi)}
.cmp-card button:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cmp-spin{animation:cmp-spin .9s linear infinite}
@keyframes cmp-spin{to{transform:rotate(360deg)}}
@keyframes cmp-rise{from{transform:translateY(8px);opacity:0}}
@media (prefers-reduced-motion:reduce){.cmp-card,.cmp-spin{animation:none}}
@media (max-width:480px){.cmp-card{grid-template-columns:76px 1fr}}
`;
