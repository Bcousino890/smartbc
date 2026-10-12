"use client";

import { ChevronLeft, ChevronRight, ExternalLink, FileText, ImageOff, Images, Loader2, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isTypingTarget, usePrefersReducedMotion } from "./hooks";

/** Un elemento del visor a pantalla completa: foto, plano o vídeo del anuncio. */
export type MediaItem =
  | { kind: "photo" | "plan"; url: string; alt?: string }
  | { kind: "video"; url: string };

export type Photo = { url: string; alt?: string };

// ─── Imagen del hero ────────────────────────────────────────────────────────

/**
 * Foto del hero con su fondo desenfocado. Se monta con `key={url}`, así que
 * cada foto arranca con su propio estado: esqueleto → fundido al cargar.
 *
 * `object-cover` llena el marco 16:10 y es lo que se ve bien con una foto
 * horizontal normal. Pero una foto vertical o panorámica recortada a 16:10 pierde
 * media habitación: en esos casos (se mide al cargar) se pasa a `object-contain`
 * y el hueco lo rellena la propia foto ampliada y desenfocada.
 */
function HeroImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [contain, setContain] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onLoaded = useCallback((img: HTMLImageElement) => {
    if (img.naturalWidth > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setContain(ratio < 1.25 || ratio > 2.1);
    }
    setLoaded(true);
  }, []);

  // Una foto ya en caché puede estar completa antes de que React enganche onLoad.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) onLoaded(el);
  }, [onLoaded]);

  return (
    <>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-2xl"
        />
      )}
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          onLoad={(e) => onLoaded(e.currentTarget)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full transition-opacity duration-300",
            contain ? "object-contain" : "object-cover",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {!loaded && !failed && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-cream-200 to-cream-300" />}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cream-200 text-ink/50">
          <ImageOff size={28} strokeWidth={1.5} />
          <span className="text-sm">No se pudo cargar esta foto</span>
        </div>
      )}
    </>
  );
}

// ─── Estado vacío ───────────────────────────────────────────────────────────

/** Anuncio sin fotos: nunca un hueco gris, sino una explicación y la salida al portal. */
function EmptyGallery({ sourceUrl, portal }: { sourceUrl: string; portal: string }) {
  return (
    <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gold/40 bg-gradient-to-br from-cream-100 via-cream-50 to-cream-200 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-gold-dark shadow-sm ring-1 ring-gold/30">
        <ImageOff size={24} strokeWidth={1.5} />
      </span>
      <div>
        <p className="text-base font-bold text-ink">Sin fotos en el anuncio</p>
        <p className="mt-1 text-sm text-ink/60">El anunciante no ha subido imágenes. Puedes comprobarlo en el portal.</p>
      </div>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-gold/50 hover:bg-gold/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <ExternalLink size={14} strokeWidth={1.75} />
        Abrir en {portal}
      </a>
    </div>
  );
}

// ─── Tira de miniaturas ─────────────────────────────────────────────────────

function ThumbStrip({
  photos,
  index,
  onSelect,
  loadingMore,
}: {
  photos: Photo[];
  index: number;
  onSelect: (i: number) => void;
  loadingMore: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  // La miniatura activa se centra en la tira (scroll horizontal suave). Se
  // calcula a mano: `scrollIntoView` también desplazaría el scroll vertical de
  // la ficha y la pantalla «saltaría» al cambiar de foto.
  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-thumb="${index}"]`);
    if (!box || !el) return;
    const left = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
  }, [index, reduced, photos.length]);

  useEffect(() => {
    measure();
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, photos.length]);

  function page(dir: 1 | -1) {
    const el = boxRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? "auto" : "smooth" });
  }

  const edgeBtn =
    "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink shadow-md ring-1 ring-ink/10 transition hover:bg-white md:flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

  return (
    <div className="relative">
      <div
        ref={boxRef}
        onScroll={measure}
        className="relative flex snap-x gap-2 overflow-x-auto scroll-smooth pb-2 pt-0.5 [scrollbar-width:thin]"
        role="group"
        aria-label="Miniaturas de las fotos"
      >
        {photos.map((p, i) => (
          <button
            key={`${p.url}-${i}`}
            type="button"
            data-thumb={i}
            onClick={() => onSelect(i)}
            aria-label={`Ver foto ${i + 1} de ${photos.length}`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "relative h-[60px] w-[88px] shrink-0 snap-center overflow-hidden rounded-lg bg-cream-200 outline-none transition duration-200 sm:h-[68px] sm:w-24",
              "focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
              i === index ? "opacity-100 ring-2 ring-gold ring-offset-2" : "opacity-65 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt=""
              loading={i < 6 ? "eager" : "lazy"}
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
        {loadingMore &&
          Array.from({ length: 6 }).map((_, i) => (
            <span key={`sk-${i}`} aria-hidden="true" className="h-[60px] w-[88px] shrink-0 animate-pulse rounded-lg bg-ink/10 sm:h-[68px] sm:w-24" />
          ))}
      </div>
      {edges.left && (
        <button type="button" aria-label="Miniaturas anteriores" onClick={() => page(-1)} className={cn(edgeBtn, "left-1")}>
          <ChevronLeft size={18} />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Más miniaturas" onClick={() => page(1)} className={cn(edgeBtn, "right-1")}>
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

// ─── Galería ────────────────────────────────────────────────────────────────

const arrowBtn =
  "pointer-events-auto absolute top-1/2 z-[3] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-ink/10 backdrop-blur transition hover:bg-white focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold " +
  // Con ratón solo aparecen al pasar por encima; en táctil siempre (no hay hover).
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100";

const pillBtn =
  "pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white/92 px-3.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-ink/10 backdrop-blur transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

export function Gallery({
  photos,
  index,
  onIndexChange,
  loadingMore,
  title,
  operationLabel,
  portalLabel,
  retired,
  sourceUrl,
  hasPlan,
  hasVideo,
  onOpenViewer,
  keyboardActive,
}: {
  photos: Photo[];
  index: number;
  onIndexChange: (i: number) => void;
  /** El detalle (galería completa) aún se está pidiendo: solo hay la portada. */
  loadingMore: boolean;
  title: string;
  operationLabel: string;
  portalLabel: string;
  retired: boolean;
  sourceUrl: string;
  hasPlan: boolean;
  hasVideo: boolean;
  onOpenViewer: (what: "photos" | "plan" | "video") => void;
  /** ←/→ cambian de foto (se apaga mientras hay otro visor o diálogo encima). */
  keyboardActive: boolean;
}) {
  const n = photos.length;
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (d: 1 | -1) => {
      if (n > 1) onIndexChange((index + d + n) % n);
    },
    [index, n, onIndexChange],
  );

  useEffect(() => {
    if (!keyboardActive || n < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardActive, n, go]);

  // Precarga de la siguiente (y la anterior): el listado solo trae la portada y
  // sin esto cada foto esperaría a su propia descarga al pasar.
  useEffect(() => {
    if (n < 2) return;
    for (const d of [1, -1]) {
      const u = photos[(index + d + n) % n]?.url;
      if (u) {
        const img = new window.Image();
        img.src = u;
      }
    }
  }, [index, n, photos]);

  if (n === 0) {
    // Mientras llega el detalle y no hay ni portada: esqueleto, no «sin fotos».
    if (loadingMore) {
      return <div className="aspect-[16/10] w-full animate-pulse rounded-2xl bg-gradient-to-br from-cream-200 to-cream-300" aria-label="Cargando fotos" />;
    }
    return <EmptyGallery sourceUrl={sourceUrl} portal={portalLabel} />;
  }

  const current = photos[Math.min(index, n - 1)];

  return (
    <section aria-roledescription="carrusel" aria-label={`Fotos del anuncio: ${title}`}>
      <div
        className="group relative aspect-[16/10] w-full select-none overflow-hidden rounded-2xl bg-ink/90 shadow-[0_18px_40px_-26px_rgba(10,10,10,0.6)] ring-1 ring-ink/10"
        // `pan-y`: el scroll vertical de la ficha sigue funcionando y el gesto horizontal es nuestro.
        style={{ touchAction: "pan-y" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
        }}
      >
        <HeroImage key={current.url} src={current.url} alt={current.alt || `${title} — foto ${index + 1} de ${n}`} eager={index === 0} />

        {/* El clic sobre la foto abre el visor. Es un botón hermano (no padre) de las
            flechas para no anidar botones, y queda por debajo de ellas. */}
        <button
          type="button"
          aria-label="Ampliar foto a pantalla completa"
          onClick={() => onOpenViewer("photos")}
          className="absolute inset-0 z-[1] cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-gold"
        />

        {/* Degradado inferior: da lectura al contador y a los botones sobre cualquier foto. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-28 bg-gradient-to-t from-ink/65 via-ink/20 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-20 bg-gradient-to-b from-ink/35 to-transparent" />

        {/* Etiquetas */}
        <div className="pointer-events-none absolute left-3 top-3 z-[3] flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-ink/85 px-2.5 py-1 crm-label-sm text-cream-50 backdrop-blur">{operationLabel}</span>
          <span className="rounded-md bg-gold px-2.5 py-1 crm-label-sm text-ink">{portalLabel}</span>
          {retired && <span className="rounded-md bg-red-600 px-2.5 py-1 crm-label-sm text-white">Retirado</span>}
        </div>

        {n > 1 && (
          <>
            <button type="button" aria-label="Foto anterior" onClick={() => go(-1)} className={cn(arrowBtn, "left-3")}>
              <ChevronLeft size={22} />
            </button>
            <button type="button" aria-label="Foto siguiente" onClick={() => go(1)} className={cn(arrowBtn, "right-3")}>
              <ChevronRight size={22} />
            </button>
          </>
        )}

        {/* Pie: accesos (todas las fotos, plano, vídeo) y contador */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[3] flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {n > 1 && (
              <button type="button" onClick={() => onOpenViewer("photos")} className={pillBtn}>
                <Images size={15} strokeWidth={1.75} />
                Ver todas las fotos
                <span className="text-ink/55">({n})</span>
              </button>
            )}
            {hasPlan && (
              <button type="button" onClick={() => onOpenViewer("plan")} className={pillBtn}>
                <FileText size={15} strokeWidth={1.75} />
                Plano
              </button>
            )}
            {hasVideo && (
              <button type="button" onClick={() => onOpenViewer("video")} className={pillBtn}>
                <Play size={14} strokeWidth={2} />
                Vídeo
              </button>
            )}
          </div>
          <div aria-live="polite" className="pointer-events-none flex items-center gap-1.5 rounded-full bg-ink/65 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
            {loadingMore ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                <span>Cargando fotos…</span>
              </>
            ) : (
              <>
                <span className="crm-number">
                  {index + 1} / {n}
                </span>
                <span className="sr-only">fotos</span>
              </>
            )}
          </div>
        </div>
      </div>

      {(n > 1 || loadingMore) && (
        <div className="mt-3">
          <ThumbStrip photos={photos} index={Math.min(index, n - 1)} onSelect={onIndexChange} loadingMore={loadingMore} />
        </div>
      )}
    </section>
  );
}
