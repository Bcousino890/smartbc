"use client";

// "Ver residencia": la casa entera antes de decidir. Fotos, datos,
// características y descripción.
//
// Hasta 2026-10-08 este botón abría solo la galería de fotos, y de los
// anuncios de portal además una sola foto: el cliente tenía que decidir si
// quería visitar una casa sin poder leer nada de ella.
//
// La descripción llega aparte (getResidenceDetail) porque la primera apertura
// la limpia la IA: quita la inmobiliaria de origen, teléfonos y referencias.
// Las fotos y los datos ya están en la página y se ven al instante.
//
// Va por debajo de la galería (z-55 < z-60): tocar una foto abre la galería
// encima y, al cerrarla, se vuelve aquí.

import { useEffect, useState } from "react";
import type { PublicShortlistProperty } from "@/lib/client-shortlist/public-contract";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import { getResidenceDetail } from "../actions";

export function ResidenceSheet({
  t,
  property,
  token,
  previewShortlistId,
  onOpenGallery,
  onClose,
}: {
  t: ShortlistDictionary;
  property: PublicShortlistProperty;
  token: string;
  previewShortlistId?: string;
  onOpenGallery: (index: number) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<
    { description: string | null; features: string[] } | "loading" | null
  >("loading");

  useEffect(() => {
    let alive = true;
    setDetail("loading");
    getResidenceDetail({ token: token || undefined, previewShortlistId }, property.itemId)
      .then((res) => {
        if (!alive) return;
        setDetail(res.ok ? { description: res.description, features: res.features } : null);
      })
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [token, previewShortlistId, property.itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Con la galería abierta encima, Esc es suyo.
      if (e.key === "Escape" && !document.querySelector(".vc-gallery")) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const photos = property.photoUrls;
  const specs = [
    property.bedrooms ? `${property.bedrooms} ${t.bedrooms}` : null,
    property.bathrooms ? `${property.bathrooms} ${t.bathrooms}` : null,
    property.squareMeters ? `${property.squareMeters} m²` : null,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={property.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-ink/10 bg-cream-50 shadow-2xl sm:rounded-3xl"
      >
        {/* Cabecera fija */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/8 px-5 pb-4 pt-5 sm:px-7">
          <div className="min-w-0">
            <p className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40">
              {property.zoneLabel}
            </p>
            <h2 className="mt-1.5 font-serif text-[24px] font-normal leading-tight vc-tight text-ink sm:text-[28px]">
              {property.title}
            </h2>
            <p className="mt-1.5 font-serif text-[18px] vc-nums text-ink/80" dir="ltr">
              {property.priceLabel}
            </p>
            {specs.length > 0 && (
              <p className="mt-1 font-sans text-[12px] text-ink/45">{specs.join(" · ")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 font-display text-[10px] font-medium uppercase vc-tracked text-ink/50 transition hover:text-ink"
          >
            {t.closeResidence}
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-8 pt-5 sm:px-7">
          {/* Fotos: mosaico de las primeras; cualquiera abre la galería ahí. */}
          {photos.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => onOpenGallery(0)}
                className="block w-full overflow-hidden rounded-xl bg-ink/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[0]}
                  alt=""
                  className="aspect-[16/10] w-full object-cover transition duration-500 hover:scale-[1.02]"
                />
              </button>
              {photos.length > 1 && (
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {photos.slice(1, 6).map((src, i) => (
                    <button
                      key={src + i}
                      type="button"
                      onClick={() => onOpenGallery(i + 1)}
                      className="overflow-hidden rounded-lg bg-ink/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-500 hover:scale-[1.04]"
                      />
                    </button>
                  ))}
                </div>
              )}
              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={() => onOpenGallery(0)}
                  className="mt-3 font-display text-[10px] font-medium uppercase vc-tracked text-gold-dark transition hover:text-ink"
                >
                  {t.allPhotographs} ({photos.length})
                </button>
              )}
            </div>
          )}

          {detail === "loading" && (
            <p className="mt-7 font-sans text-[13px] text-ink/40">{t.loadingDetails}</p>
          )}

          {detail && detail !== "loading" && detail.features.length > 0 && (
            <section className="mt-7">
              <h3 className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/45">
                {t.features}
              </h3>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {detail.features.map((f, i) => (
                  <li key={i} className="flex gap-2 font-sans text-[13.5px] leading-snug text-ink/75">
                    <span aria-hidden className="mt-[7px] block h-px w-2.5 shrink-0 bg-gold" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail && detail !== "loading" && detail.description && (
            <section className="mt-7">
              <h3 className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/45">
                {t.aboutResidence}
              </h3>
              <div className="mt-3 space-y-3 font-sans text-[14px] leading-relaxed text-ink/75">
                {detail.description
                  .split(/\n{2,}|\n/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
