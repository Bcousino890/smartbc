"use client";

// "Añadir otra residencia".
//
// No es el catálogo público: es una búsqueda corta y controlada sobre una
// proyección client-safe (ver searchShortlistProperties). Devuelve como mucho
// ocho resultados, solo disponibles y del país del shortlist, y lo que ya está
// aparece marcado en vez de dejar añadir dos veces.

import { useEffect, useState, useTransition } from "react";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import { searchShortlistProperties, type ShortlistSearchHit } from "../actions";

export function AddResidenceSheet({
  t,
  token,
  onAdd,
  onClose,
}: {
  t: ShortlistDictionary;
  token: string;
  onAdd: (propertyId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ShortlistSearchHit[]>([]);
  const [searching, startSearch] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => setHits(await searchShortlistProperties(token, q)));
    }, 280);
    return () => clearTimeout(timer);
  }, [q, token]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-start sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.addResidence}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl border border-ink/10 bg-cream-50 shadow-2xl sm:mt-10 sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-ink/10 p-5">
          <h3 className="font-serif text-[20px] text-ink">{t.addResidence}</h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            autoFocus
            className="mt-3 w-full rounded-xl border border-ink/12 bg-white px-3.5 py-3 font-sans text-[13.5px] text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {q.trim().length >= 2 && !searching && hits.length === 0 && (
            <p className="py-8 text-center font-sans text-[12.5px] text-ink/40">
              {t.noResults}
            </p>
          )}
          <ul className="space-y-2">
            {hits.map((h) => {
              const already = h.alreadyIn || added.has(h.propertyId);
              return (
                <li
                  key={h.propertyId}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white/70 p-2.5"
                >
                  <span className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                    {h.coverPhotoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={h.coverPhotoUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[15px] text-ink">
                      {h.title}
                    </span>
                    <span className="block truncate font-sans text-[11px] text-ink/50">
                      {h.zoneLabel} · {h.priceLabel}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => {
                      setAdded((prev) => new Set(prev).add(h.propertyId));
                      onAdd(h.propertyId);
                    }}
                    className="vc-focus shrink-0 rounded-full border border-ink/15 bg-white px-3.5 py-2 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/70 transition hover:border-gold/55 disabled:opacity-40"
                  >
                    {already ? t.alreadyAdded : t.add}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-ink/10 p-4 text-end">
          <button
            type="button"
            onClick={onClose}
            className="vc-focus rounded-full px-5 py-2.5 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/55 transition hover:text-ink"
          >
            {t.closeResidence}
          </button>
        </div>
      </div>
    </div>
  );
}
