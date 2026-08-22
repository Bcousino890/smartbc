"use client";

import { Maximize2 } from "lucide-react";
import { useState } from "react";
import { Lightbox } from "@/components/property-detail/property-gallery";

// Hero + lightbox del enlace temporal de un particular — mismo tratamiento
// visual que el hero de un SmartLink real (PublicPropertyView.HeroMedia:
// full-bleed, gradiente inferior, botón "Ver todas las fotos") y la MISMA
// Lightbox (nav teclado/swipe), para que el enlace se sienta como un
// SmartLink y no como una página aparte. Sin `next/image`: estas fotos
// vienen siempre del CDN del portal de origen (Idealista/Fotocasa/pisos.com),
// nunca de nuestro storage, así que next/image no tendría nada que optimizar.
export function ParticularHero({
  photos,
  title,
}: {
  photos: string[];
  title: string;
}) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const cover = photos[0];
  if (!cover) return null;

  return (
    <div className="relative w-full bg-ink">
      <div className="relative h-[46vh] min-h-[300px] w-full md:h-[62vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={title}
          className="h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink/55 to-transparent" />
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => setOpenAt(0)}
            className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-lg bg-cream-50/95 px-4 py-2.5 crm-button text-ink shadow-lg transition hover:bg-cream-50"
          >
            <Maximize2 size={14} strokeWidth={1.75} />
            <span>Ver todas las fotos · {photos.length}</span>
          </button>
        )}
      </div>

      {openAt !== null && (
        <Lightbox
          photos={photos}
          index={openAt}
          onClose={() => setOpenAt(null)}
          onChange={setOpenAt}
        />
      )}
    </div>
  );
}
