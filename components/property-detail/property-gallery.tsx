"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PLACEHOLDER_GRADIENTS } from "@/lib/constants";
import { useT } from "@/lib/i18n/provider";
import type { Property, PropertyBadge } from "@/lib/types";
import { cn } from "@/lib/utils";

const BADGE_KEYS: Record<PropertyBadge, string> = {
  exclusiva: "card.badge.exclusive",
  destacada: "card.badge.featured",
  premium: "card.badge.premium",
};

export function PropertyGallery({
  property,
  onPhotoView,
  mode = "grid",
  forceOpenAt = null,
  onLightboxClose,
}: {
  property: Property;
  onPhotoView?: (index: number) => void;
  // SmartLink 2.0: "lightbox-only" no pinta el grid — la lightbox se abre
  // desde fuera (botón del hero) vía forceOpenAt. El portal cliente sigue
  // usando "grid" por defecto sin cambios.
  mode?: "grid" | "lightbox-only";
  forceOpenAt?: number | null;
  onLightboxClose?: () => void;
}) {
  const t = useT();
  const photos = property.photos ?? [];
  const main = photos[0];
  const thumbs = photos.slice(1, 4);
  const thumbCount = 3;
  const extraCount = Math.max(0, photos.length - 4);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (forceOpenAt != null && photos.length > 0) {
      setLightboxIndex(Math.min(forceOpenAt, photos.length - 1));
      onPhotoView?.(forceOpenAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpenAt]);

  const openAt = (i: number) => {
    if (photos.length === 0) return;
    setLightboxIndex(i);
    onPhotoView?.(i);
  };

  // photo_view también al NAVEGAR (antes solo al abrir → dato infrarreportado).
  const changeTo = (i: number) => {
    setLightboxIndex(i);
    onPhotoView?.(i);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    onLightboxClose?.();
  };

  if (mode === "lightbox-only") {
    return lightboxIndex !== null && photos.length > 0 ? (
      <Lightbox
        photos={photos}
        index={lightboxIndex}
        onClose={closeLightbox}
        onChange={changeTo}
      />
    ) : null;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.55fr_1fr]">
        <Tile
          photo={main}
          gradient={PLACEHOLDER_GRADIENTS[0]}
          className="aspect-[4/3] md:aspect-auto md:h-[520px]"
          onClick={main ? () => openAt(0) : undefined}
          // Foto principal = candidata a LCP: sin lazy, con prioridad — el
          // resto de fotos de la ficha se quedan en lazy (ver Tile abajo).
          priority
          sizes="(max-width: 768px) 100vw, 60vw"
        >
          {property.badge && (
            // Clases legacy (11px) para portal cliente; dentro de .smartlink-root
            // el token crm-badge las pisa por especificidad (12px, Lato 700).
            <span className="crm-badge absolute left-4 top-4 rounded-md bg-cream-50/95 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-gold-dark shadow-sm">
              {t(BADGE_KEYS[property.badge])}
            </span>
          )}
        </Tile>

        <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
          {Array.from({ length: thumbCount }).map((_, i) => {
            const thumb = thumbs[i];
            const isLast = i === thumbCount - 1;
            const showOverlay = isLast && extraCount > 0;
            return (
              <Tile
                key={i}
                photo={thumb}
                gradient={PLACEHOLDER_GRADIENTS[(i + 1) % PLACEHOLDER_GRADIENTS.length]}
                className="aspect-[4/3] md:aspect-auto md:h-[167px]"
                onClick={thumb ? () => openAt(i + 1) : undefined}
                // 3-en-fila en móvil (~33vw c/u); apiladas en una columna de
                // ~40% en desktop (grid-cols-[1.55fr_1fr] — ver el grid de arriba).
                sizes="(max-width: 768px) 33vw, 40vw"
              >
                {showOverlay && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Abre en la PRIMERA foto no visible del grid (antes
                      // abría en la 0, que ya estabas viendo).
                      openAt(4);
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-ink/55 text-cream-50 backdrop-blur-[2px] transition hover:bg-ink/70"
                    aria-label={t("detail.gallery.viewAll", {
                      count: photos.length,
                    })}
                  >
                    <span className="flex items-center gap-1.5 rounded-full bg-cream-50/15 px-3 py-1.5 text-sm font-medium">
                      <Plus size={14} strokeWidth={2} />
                      <span>
                        {t("detail.gallery.more", { count: extraCount })}
                      </span>
                    </span>
                  </button>
                )}
              </Tile>
            );
          })}
        </div>
      </div>

      {lightboxIndex !== null && photos.length > 0 && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onChange={changeTo}
        />
      )}
    </>
  );
}

// Exportado: /a/[token] (enlace temporal de particulares, ver
// app/a/[token]/particular-hero.tsx) la reutiliza tal cual para que el
// visor de fotos sea idéntico al de un SmartLink real, en vez de duplicar
// el nav/teclado/swipe en una segunda implementación.
export function Lightbox({
  photos,
  index,
  onClose,
  onChange,
}: {
  photos: string[];
  index: number;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  const t = useT();
  // Bloquear scroll del body mientras la lightbox está abierta.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Atajos de teclado: ←/→ navegar, Esc cerrar.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onChange((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") onChange((index + 1) % photos.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, photos.length, onChange, onClose]);

  // Swipe táctil (Gallery 2.0): la ficha se ve sobre todo en móvil y el
  // arrastre horizontal es el gesto natural para pasar foto.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) onChange((index + 1) % photos.length);
    else onChange((index - 1 + photos.length) % photos.length);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="flex items-center justify-between px-4 py-3 text-cream-50">
        <span className="text-sm font-medium">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-50/10 transition hover:bg-cream-50/20"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </header>

      {/* min-h-0: sin esto las fotos verticales expanden el contenedor flex
          más allá del viewport y se ven cortadas (max-h-full no aplica). */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label={t("detail.gallery.prev")}
          onClick={() =>
            onChange((index - 1 + photos.length) % photos.length)
          }
          className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-cream-50/10 text-cream-50 transition hover:bg-cream-50/25"
        >
          <ChevronLeft size={24} strokeWidth={1.75} />
        </button>

        {/* Se queda en <img> a propósito: se apoya en su tamaño intrínseco
            (max-h-full/max-w-full + object-contain) para no recortar fotos
            verticales u horizontales, y next/image con `fill` forzaría a
            rellenar el contenedor — cambiaría el encuadre. Ya es lazy de
            facto: la lightbox no existe en el DOM hasta que se abre. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[index]}
          alt=""
          className="max-h-full max-w-full rounded-xl object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        />

        <button
          type="button"
          aria-label={t("detail.gallery.next")}
          onClick={() => onChange((index + 1) % photos.length)}
          className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-cream-50/10 text-cream-50 transition hover:bg-cream-50/25"
        >
          <ChevronRight size={24} strokeWidth={1.75} />
        </button>
      </div>

      <footer className="flex justify-center gap-2 overflow-x-auto px-4 pb-5">
        {photos.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(i);
            }}
            aria-label={t("detail.gallery.goTo", { n: i + 1 })}
            className={cn(
              "relative h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition",
              i === index
                ? "border-gold"
                : "border-transparent opacity-60 hover:opacity-100",
            )}
          >
            <SafeImage src={p} sizes="80px" className="object-cover" />
          </button>
        ))}
      </footer>
    </div>,
    document.body,
  );
}

// La galería completa (import-by-link) puede tardar en re-alojarse a nuestro
// storage: durante esa ventana `photo` puede venir del CDN de origen del
// portal, un host que no está en `images.remotePatterns` (next.config.ts) —
// ahí next/image devuelve 400. Se cae a <img> sin optimizar en vez de
// mostrar una foto rota; el resto del tiempo (el caso normal) usa
// next/image tal cual.
function SafeImage({
  src,
  sizes,
  priority,
  className,
}: {
  src: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading={priority ? "eager" : "lazy"}
        className={cn("h-full w-full", className)}
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setErrored(true)}
      className={className}
    />
  );
}

function Tile({
  photo,
  gradient,
  className,
  onClick,
  priority = false,
  sizes,
  children,
}: {
  photo?: string;
  gradient: string;
  className?: string;
  onClick?: () => void;
  /** Solo la foto principal del grid — es la candidata a LCP; el resto se
   *  queda en lazy (default de next/image sin `priority`). */
  priority?: boolean;
  sizes: string;
  children?: React.ReactNode;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-gold/20 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.40)]",
        interactive && "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      {photo ? (
        <SafeImage
          src={photo}
          priority={priority}
          sizes={sizes}
          className={cn(
            "object-cover transition",
            interactive && "group-hover:scale-[1.02]",
          )}
        />
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ backgroundImage: gradient }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(255,235,190,0.55),transparent_60%)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(40,28,10,0.35),transparent_60%)]"
          />
        </>
      )}
      {children}
    </div>
  );
}
