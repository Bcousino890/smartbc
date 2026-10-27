"use client";

import { useEffect, useMemo, useRef } from "react";
import { Check } from "lucide-react";
import type { MapPin } from "@/lib/captaciones-map/pins";
import { filterAndSortPins, formatEuro, formatPinMeta, type ListFilter } from "@/lib/captaciones-map/panels";

type Props = {
  pins: MapPin[];
  scores: Map<string, number>;
  selectedId: string | null;
  filter: ListFilter;
  onFilter(f: ListFilter): void;
  onSelect(id: string): void;
  /** Etiquetas extra por anuncio (p. ej. «Precio ok»); por defecto ninguna. */
  badges?: Map<string, string[]>;
  /** Anuncios ya en la ficha del cliente: llevan la marca «Captado». */
  captured?: Set<string>;
  /** Coincidencias de la búsqueda con IA: llevan «✦ IA». */
  aiIds?: Set<string>;
  /** Texto cuando no hay anuncios (lo decide la vista: sin zona, cargando…). */
  emptyText?: string;
  className?: string;
};

const TABS: { id: ListFilter; label: string }[] = [
  { id: "match", label: "Encajan" },
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
];

/** Lista lateral de anuncios de la zona: tarjeta blanca normal (no es cristal). */
export function MapResultsList({
  pins, scores, selectedId, filter, onFilter, onSelect, badges, captured, aiIds, emptyText, className,
}: Props) {
  const items = useMemo(() => filterAndSortPins(pins, scores, filter), [pins, scores, filter]);
  const listRef = useRef<HTMLDivElement>(null);

  // Al seleccionar un pin en el mapa, su fila se trae a la vista DENTRO de la
  // lista. Solo depende de `selectedId`: si dependiera de `items`, cada
  // recarga de pines devolvería la lista a la fila elegida mientras el
  // usuario hace scroll. Se desplaza el contenedor a mano (no
  // scrollIntoView) para no mover también la página en móvil.
  useEffect(() => {
    const box = listRef.current;
    if (!selectedId || !box) return;
    const el = box.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    if (!el) return;
    // .cmp-list-body es position:relative → offsetTop ya es relativo a la caja.
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 10;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <section className={`cmp-list font-crm-sans ${className ?? ""}`} aria-label="Anuncios en la zona">
      <header className="cmp-list-hd">
        <h2>
          Anuncios en la zona
          <span className="cmp-live"><i aria-hidden />En vivo</span>
        </h2>
        <div className="cmp-seg" role="tablist" aria-label="Filtro de anuncios">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              className={filter === t.id ? "on" : ""}
              onClick={() => onFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="cmp-list-body" ref={listRef}>
        {items.length === 0 ? (
          <p className="cmp-empty">
            {pins.length === 0
              ? (emptyText ?? "Dibuja una zona en el mapa para ver los anuncios que caen dentro.")
              : "No hay anuncios con este filtro."}
          </p>
        ) : (
          items.map((p) => {
            const score = scores.get(p.id);
            const extra = badges?.get(p.id) ?? [];
            return (
              <button
                key={p.id}
                type="button"
                data-id={p.id}
                className={`cmp-it ${selectedId === p.id ? "sel" : ""} ${score === undefined ? "noscore" : ""}`}
                aria-pressed={selectedId === p.id}
                onClick={() => onSelect(p.id)}
              >
                <span className="cmp-it-ph" aria-hidden>
                  {/* <img> perezosa: con cientos de filas, solo se descargan las visibles. */}
                  {p.coverUrl && <img src={p.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
                  {p.isNew && <i>Nuevo</i>}
                </span>
                <span className="cmp-it-main">
                  <b className="cmp-num">{formatEuro(p.price)}</b>
                  {p.operation === "rent" && <small> /mes</small>}
                  <small className="cmp-it-meta">{formatPinMeta(p)}</small>
                  <span className="cmp-tags">
                    <span className="cmp-tag">{p.isAgency ? "Agencia" : "Particular"}</span>
                    {captured?.has(p.id) && (
                      <span className="cmp-tag cmp-tag-cap">
                        <Check size={11} aria-hidden /> Captado
                      </span>
                    )}
                    {aiIds?.has(p.id) && <span className="cmp-tag cmp-tag-ai">✦ IA</span>}
                    {extra.map((b) => <span key={b} className="cmp-tag cmp-tag-g">{b}</span>)}
                  </span>
                </span>
                {score !== undefined && (
                  <span
                    className="cmp-ring"
                    style={{ ["--v" as string]: Math.max(0, Math.min(100, Math.round(score))) }}
                    role="img"
                    aria-label={`Encaje ${Math.round(score)} %`}
                  >
                    <span>{Math.round(score)}</span>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <style>{STYLES}</style>
    </section>
  );
}

const STYLES = `
.cmp-list{display:flex;flex-direction:column;overflow:hidden;min-height:0;background:#fff;border:1px solid #e8e0d0;border-radius:14px;color:#0a0a0a}
.cmp-num{font-variant-numeric:tabular-nums}
.cmp-list-hd{padding:14px 16px;border-bottom:1px solid #e8e0d0}
.cmp-list-hd h2{margin:0 0 8px;font-size:17px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
.cmp-live{font:700 11px Lato,sans-serif;color:#0f6b4f;background:#e6f5ef;padding:3px 9px;border-radius:99px;display:flex;gap:6px;align-items:center}
.cmp-live i{width:6px;height:6px;border-radius:50%;background:#12a672;animation:cmp-pulse 1.6s infinite}
.cmp-seg{display:inline-flex;border:1px solid #e8e0d0;border-radius:10px;padding:3px;background:#fff}
.cmp-seg button{border:1px solid transparent;background:none;padding:7px 13px;border-radius:8px;font:500 13px Lato,sans-serif;color:#7d766c;cursor:pointer;white-space:nowrap}
.cmp-seg button.on{background:#f5f0e8;border-color:#e1d5bd;color:#0a0a0a;font-weight:700}
.cmp-list-body{position:relative;overflow:auto;flex:1;min-height:0;padding:10px;display:grid;gap:10px;align-content:start;background:#fbf8f3}
.cmp-it{all:unset;box-sizing:border-box;display:grid;grid-template-columns:84px 1fr auto;gap:12px;padding:8px;border:1px solid #e8e0d0;
  border-radius:14px;background:#fff;cursor:pointer;align-items:center;transition:box-shadow .2s,border-color .2s}
.cmp-it.noscore{grid-template-columns:84px 1fr}
.cmp-it:hover{box-shadow:0 6px 18px rgba(80,60,20,.1)}
.cmp-it.sel{border-color:#c9a96e;box-shadow:0 0 0 3px rgba(201,169,110,.28)}
.cmp-it:focus-visible{outline:2px solid #c9a96e;outline-offset:2px}
.cmp-it-ph{border-radius:9px;min-height:76px;position:relative;overflow:hidden;align-self:stretch;background:linear-gradient(160deg,#e1d5bd,#cfc3a8)}
.cmp-it-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.cmp-it-ph i{z-index:1;position:absolute;left:5px;bottom:5px;background:#ede5d5;color:#856329;font:700 10px Lato,sans-serif;padding:1px 6px;border-radius:5px;font-style:normal}
.cmp-it-main{min-width:0;display:block}
.cmp-it-main b{font-size:16px}
.cmp-it-main small{color:#7d766c;font-size:12.5px}
.cmp-it-meta{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmp-tags{display:flex;gap:5px;margin-top:5px;flex-wrap:wrap}
.cmp-tag{font:700 10.5px Lato,sans-serif;padding:2px 8px;border-radius:999px;background:#e6f5ef;color:#0f6b4f}
.cmp-tag-g{background:#f5f0e8;color:#856329}
.cmp-tag-ai{background:#0a0a0a;color:#e0c58f}
.cmp-tag-cap{display:inline-flex;align-items:center;gap:3px;background:#1b2a4a;color:#fff}
.cmp-ring{--v:80;width:44px;height:44px;border-radius:50%;background:conic-gradient(#c9a96e calc(var(--v)*1%),#ede5d5 0);display:grid;place-items:center}
.cmp-ring span{width:34px;height:34px;border-radius:50%;background:#fff;display:grid;place-items:center;font:700 11px Lato,sans-serif;font-variant-numeric:tabular-nums}
.cmp-empty{margin:0;padding:30px 14px;text-align:center;color:#7d766c}
.cmp-seg button:focus-visible{outline:2px solid #c9a96e;outline-offset:1px}
@keyframes cmp-pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.cmp-live i{animation:none}.cmp-it{transition:none}}
`;
