"use client";

import { ChevronLeft, ChevronRight, FileText, Play, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { detectVideoType, getVimeoEmbedUrl, getYoutubeEmbedUrl } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import type { MediaItem } from "./gallery";
import { isTypingTarget, useFocusTrap } from "./hooks";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type View = { scale: number; x: number; y: number };
const RESET: View = { scale: 1, x: 0, y: 0 };

function VideoPlayer({ url }: { url: string }) {
  const info = detectVideoType(url);
  if (info.type === "youtube" && info.id) {
    return <iframe src={getYoutubeEmbedUrl(info.id)} title="Vídeo del anuncio" allowFullScreen className="aspect-video w-full max-w-5xl rounded-xl bg-black" />;
  }
  if (info.type === "vimeo" && info.id) {
    return <iframe src={getVimeoEmbedUrl(info.id)} title="Vídeo del anuncio" allowFullScreen className="aspect-video w-full max-w-5xl rounded-xl bg-black" />;
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video controls autoPlay preload="metadata" src={url} className="max-h-full max-w-full rounded-xl bg-black" />
  );
}

/**
 * Visor a pantalla completa de fotos, plano y vídeo del anuncio.
 *
 * - ←/→ cambian de elemento, Esc cierra (solo el visor: la ficha de debajo no
 *   se entera, porque su manejador de Esc se apaga mientras esto está abierto).
 * - Zoom: rueda del ratón, doble clic / doble toque, botones +/−, y pellizco
 *   con dos dedos. Con zoom, arrastrar mueve la foto; sin zoom, deslizar
 *   cambia de foto.
 */
export function Lightbox({
  items,
  startIndex,
  title,
  onClose,
}: {
  items: MediaItem[];
  startIndex: number;
  title: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => clamp(startIndex, 0, Math.max(0, items.length - 1)));
  const [view, setView] = useState<View>(RESET);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef(0);
  const gesture = useRef<{
    kind: "pan" | "pinch" | "swipe";
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseScale: number;
    dist: number;
  } | null>(null);
  const n = items.length;
  const item = items[index];

  useFocusTrap(rootRef, true);

  const goTo = useCallback(
    (i: number) => {
      if (n === 0) return;
      setIndex(((i % n) + n) % n);
      setView(RESET);
    },
    [n],
  );

  // Teclado. Captura en `window` y detiene la propagación de Esc para que el
  // diálogo de la ficha (también escucha Esc) no se cierre a la vez.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === "+" || e.key === "=") {
        setView((v) => ({ ...v, scale: clamp(v.scale * 1.4, MIN_SCALE, MAX_SCALE) }));
      } else if (e.key === "-") {
        setView((v) => {
          const scale = clamp(v.scale / 1.4, MIN_SCALE, MAX_SCALE);
          return scale === 1 ? RESET : { ...v, scale };
        });
      } else if (e.key === "0") {
        setView(RESET);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [goTo, index, onClose]);

  // Precarga de la siguiente y la anterior.
  useEffect(() => {
    if (n < 2) return;
    for (const d of [1, -1]) {
      const it = items[(index + d + n) % n];
      if (it && it.kind !== "video") {
        const img = new window.Image();
        img.src = it.url;
      }
    }
  }, [index, items, n]);

  // La miniatura activa se mantiene a la vista en la tira inferior.
  useEffect(() => {
    const box = stripRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-vthumb="${index}"]`);
    if (!box || !el) return;
    box.scrollTo({ left: Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2), behavior: "smooth" });
  }, [index]);

  /** Limita el desplazamiento: no se puede arrastrar la foto fuera de la pantalla. */
  const bound = useCallback((v: View): View => {
    const el = stageRef.current;
    if (!el || v.scale <= 1) return RESET;
    const maxX = ((v.scale - 1) * el.clientWidth) / 2;
    const maxY = ((v.scale - 1) * el.clientHeight) / 2;
    return { scale: v.scale, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (item.kind === "video") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", startX: 0, startY: 0, baseX: view.x, baseY: view.y, baseScale: view.scale, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    } else if (pointers.current.size === 1) {
      gesture.current = {
        kind: view.scale > 1 ? "pan" : "swipe",
        startX: e.clientX,
        startY: e.clientY,
        baseX: view.x,
        baseY: view.y,
        baseScale: view.scale,
        dist: 0,
      };
      setDragging(view.scale > 1);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setView(bound({ scale: clamp(g.baseScale * (dist / g.dist), MIN_SCALE, MAX_SCALE), x: g.baseX, y: g.baseY }));
    } else if (g.kind === "pan") {
      setView(bound({ scale: g.baseScale, x: g.baseX + (e.clientX - g.startX), y: g.baseY + (e.clientY - g.startY) }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    setDragging(false);
    if (g?.kind === "swipe" && pointers.current.size === 0) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        goTo(index + (dx < 0 ? 1 : -1));
      } else if (e.pointerType !== "mouse" && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        // Doble toque = zoom. iOS no lanza `dblclick` con touch-action: none, así que se detecta a mano
        // (con ratón se encarga onDoubleClick).
        const now = Date.now();
        if (now - lastTap.current < 320) {
          lastTap.current = 0;
          toggleZoom();
        } else {
          lastTap.current = now;
        }
      }
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1 && g?.kind === "pinch") {
      // Al soltar un dedo tras pellizcar, el otro sigue como arrastre.
      const [p] = [...pointers.current.values()];
      gesture.current = { kind: view.scale > 1 ? "pan" : "swipe", startX: p.x, startY: p.y, baseX: view.x, baseY: view.y, baseScale: view.scale, dist: 0 };
    }
  }

  function toggleZoom() {
    setView((v) => (v.scale > 1 ? RESET : { scale: 2.5, x: 0, y: 0 }));
  }

  const zoomed = view.scale > 1;
  const kindLabel = item.kind === "plan" ? "Plano" : item.kind === "video" ? "Vídeo" : null;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Visor de fotos: ${title}`}
      tabIndex={-1}
      className="crm-root fixed inset-0 z-[70] flex flex-col bg-black/95 text-white outline-none"
    >
      {/* Barra superior */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-live="polite" className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
            <span className="crm-number">
              {index + 1} / {n}
            </span>
            <span className="sr-only"> elementos</span>
          </span>
          {kindLabel && <span className="rounded-full bg-gold px-3 py-1.5 crm-label-sm text-fixed-ink">{kindLabel}</span>}
          <span className="hidden min-w-0 truncate text-sm text-white/70 sm:block">{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.kind !== "video" && (
            <>
              <button type="button" aria-label="Alejar" disabled={!zoomed} onClick={() => setView((v) => { const s = clamp(v.scale / 1.5, 1, MAX_SCALE); return s === 1 ? RESET : bound({ ...v, scale: s }); })} className={iconBtn}>
                <ZoomOut size={18} />
              </button>
              <button type="button" aria-label="Acercar" disabled={view.scale >= MAX_SCALE} onClick={() => setView((v) => bound({ ...v, scale: clamp(v.scale * 1.5, 1, MAX_SCALE) }))} className={iconBtn}>
                <ZoomIn size={18} />
              </button>
              <button type="button" aria-label="Restablecer zoom" disabled={!zoomed} onClick={() => setView(RESET)} className={cn(iconBtn, "hidden sm:flex")}>
                <RotateCcw size={16} />
              </button>
            </>
          )}
          <button type="button" aria-label="Cerrar visor" onClick={onClose} className={cn(iconBtn, "bg-white text-ink hover:bg-white/90")}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Escenario */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          ref={stageRef}
          className={cn("flex h-full w-full items-center justify-center", item.kind !== "video" && (zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"))}
          style={{ touchAction: item.kind === "video" ? "auto" : "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={item.kind === "video" ? undefined : toggleZoom}
          onWheel={(e) => {
            if (item.kind === "video") return;
            setView((v) => bound({ ...v, scale: clamp(v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_SCALE, MAX_SCALE) }));
          }}
        >
          {item.kind === "video" ? (
            <div className="flex h-full w-full items-center justify-center p-4 sm:p-10">
              <VideoPlayer url={item.url} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.url}
              src={item.url}
              alt={item.alt || `${title} — ${item.kind === "plan" ? "plano" : `foto ${index + 1} de ${n}`}`}
              draggable={false}
              decoding="async"
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                transition: dragging || pointers.current.size > 0 ? "none" : "transform 180ms ease-out",
              }}
            />
          )}
        </div>

        {n > 1 && (
          <>
            <button type="button" aria-label="Anterior" onClick={() => goTo(index - 1)} className={cn(navBtn, "left-2 sm:left-5")}>
              <ChevronLeft size={26} />
            </button>
            <button type="button" aria-label="Siguiente" onClick={() => goTo(index + 1)} className={cn(navBtn, "right-2 sm:right-5")}>
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>

      {/* Tira inferior */}
      {n > 1 && (
        <div ref={stripRef} className="relative flex shrink-0 gap-2 overflow-x-auto px-4 pb-4 pt-3 [scrollbar-width:thin]" role="group" aria-label="Miniaturas">
          {items.map((it, i) => (
            <button
              key={`${it.url}-${i}`}
              type="button"
              data-vthumb={i}
              onClick={() => goTo(i)}
              aria-label={it.kind === "plan" ? "Ver el plano" : it.kind === "video" ? "Ver el vídeo" : `Ver foto ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-white/10 outline-none transition focus-visible:ring-2 focus-visible:ring-gold",
                i === index ? "opacity-100 ring-2 ring-gold" : "opacity-55 hover:opacity-100",
              )}
            >
              {it.kind === "video" ? (
                <span className="flex h-full w-full items-center justify-center text-white">
                  <Play size={18} />
                </span>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  {it.kind === "plan" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-white">
                      <FileText size={16} />
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

const iconBtn =
  "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

const navBtn =
  "absolute top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";
