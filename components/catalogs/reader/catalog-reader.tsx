"use client";

import { withWidth } from "@/lib/catalogs/photo-selection";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { BookNav, BookStage, useBookTurn, BOOK_COVER_TURN_MS } from "@/app/v/[token]/_components/book-stage";
import { PrivateGallery, type GalleryImageProps } from "@/app/v/[token]/_components/private-gallery";
import { MEASURE_CHANNEL, ReaderMeter, formatLatency, isMeasureMsg, sharedClock } from "@/lib/catalogs/measurement";
import type { PublicCatalogState } from "@/lib/catalogs/public-contract";
import {
  PAGE_TURN_MS,
  applyUpdate,
  closeGallery,
  goTo,
  initialState,
  openGallery,
  openingFolio,
  pageIndex,
  pagesOf,
  samePage,
  setLayout,
  step,
  updateDelay,
  type ItemPart,
  type PageRef,
  type ReaderLayout,
  type ReaderState,
} from "@/lib/catalogs/reader-state";
import { SyncClient, type Connectivity, type EventSourceLike, type FetchStateResult } from "@/lib/catalogs/sync-client";
import { cn } from "@/lib/utils";
import { useReaderPdf } from "./pdf-download";
import { ClosingPage, ColophonPage, CoverPage, DetailSpread, IndexPage, OpeningSpread, StatePage, type PhotoUrl } from "./pages";
import { FeedbackBox } from "./feedback-box";
import type { PersonalFeedbackView, SavedFeedback } from "@/lib/catalogs/feedback-rules";
import { ReaderImage } from "./reader-image";
import styles from "./reader.module.css";

// Lector del catálogo compartido (BCP-01 T8/T9/T10; C2 Z6; enmienda visual
// 2026-10-20). La publicación del itinerario como referencia: un libro a
// pantalla completa con el giro de página, la barra y la galería de
// app/v/[token] (DV12), o el modo desplazamiento. Teclado, deslizar, índice,
// «reducir movimiento», actualizaciones en vivo con D12/E4 y, con ?medir=1,
// la medición de D13. Cada vivienda tiene exactamente dos pantallas, apertura
// y detalle (expediente 2026-10-20-bcp-01-compacto-y-opiniones, DC1).

type Action =
  | { type: "goto"; page: PageRef }
  | { type: "step"; delta: 1 | -1 }
  | { type: "seen"; page: PageRef }
  | { type: "layout"; layout: ReaderLayout }
  | { type: "apply"; next: PublicCatalogState }
  | { type: "gallery"; key: string; photo: number }
  | { type: "closeGallery" }
  | { type: "dismiss" };

function reducer(state: ReaderState, a: Action): ReaderState {
  switch (a.type) {
    case "goto":
      return goTo(state, a.page);
    case "step":
      return step(state, a.delta);
    case "seen":
      return samePage(state.page, a.page) ? state : { ...state, page: a.page };
    case "layout":
      return setLayout(state, a.layout);
    case "apply":
      return applyUpdate(state, a.next);
    case "gallery":
      return openGallery(state, a.key, a.photo);
    case "closeGallery":
      return closeGallery(state);
    case "dismiss":
      return { ...state, notice: null };
  }
}

const MODE_KEY = "bcp-lector-modo";
/** La misma condición que la doble composición del CSS. */
const SPREAD_QUERY = "(min-width: 900px) and (min-height: 620px)";
/** El libro se sirve allí donde CABE una página entera (el mismo criterio
 *  que la referencia): por debajo, el recorrido vertical. */
const BOOK_QUERY = "(min-height: 620px)";

const NAV_LABELS = { previous: "Anterior", next: "Siguiente", contents: "Índice", pageOf: "de" };
const GALLERY_DICT = { closeGallery: "Cerrar galería", galleryAll: "Todas las fotografías", previous: "Anterior", next: "Siguiente" };

function pageRef(p: PageRef): string {
  return p.kind === "item" ? `item:${p.key}:${p.part}` : p.kind;
}

function pageId(p: PageRef): string {
  return p.kind === "item" ? `pg-item-${p.key}-${p.part}` : `pg-${p.kind}`;
}

function parsePageRef(raw: string): PageRef {
  if (raw.startsWith("item:")) {
    const rest = raw.slice(5);
    const at = rest.lastIndexOf(":");
    return { kind: "item", key: rest.slice(0, at), part: rest.slice(at + 1) as ItemPart };
  }
  return { kind: raw } as PageRef;
}

function usePhotoUrl(photoBase: string): PhotoUrl {
  return useCallback(
    (src: string, width: number) => {
      const path = photoBase === "/p/" ? src : src.replace(/^\/p\//, photoBase);
      return withWidth(path, width);
    },
    [photoBase],
  );
}

/** La imagen de la galería con los estados de carga y error del lector (L4).
 *  Las miniaturas del mosaico llegan con `loading`; la lámina, sin él. */
function GalleryImage({ loading, ...p }: GalleryImageProps) {
  return <ReaderImage variant={loading ? "thumb" : "gallery"} loading={loading} {...p} />;
}

export function CatalogReader({
  token,
  initial,
  photoBase = "/p/",
  measure = false,
  feedback = null,
}: {
  token: string;
  initial: PublicCatalogState;
  /** 0218: opiniones del enlace PERSONAL (null o no personal: sin «Tu opinión»). */
  feedback?: PersonalFeedbackView | null;
  /** Desarrollo local: fotos sintéticas en lugar del proxy /p/. */
  photoBase?: string;
  measure?: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, initial, (s) => initialState(s));
  const [unavailable, setUnavailable] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>("connecting");
  // PDF: solo con conexión (el enlace no válido ya sustituye todo el lector).
  const readerPdf = useReaderPdf(token);
  const pdf = connectivity === "offline" ? null : readerPdf;
  const [userScroll, setUserScroll] = useState(false);
  // Opiniones guardadas de este enlace personal, por clave de vivienda.
  const personal = feedback?.personal === true;
  const [opinions, setOpinions] = useState<Record<string, SavedFeedback>>(() => feedback?.items ?? {});
  const onOpinionSaved = useCallback((key: string, value: SavedFeedback) => setOpinions((o) => ({ ...o, [key]: value })), []);
  const [bookFits, setBookFits] = useState(true);
  const scrollMode = userScroll || !bookFits;
  const [lowMotion, setLowMotion] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  /** Galería en mosaico (la lámina la decide el estado del lector, E3). */
  const [mosaic, setMosaic] = useState(false);
  const url = usePhotoUrl(photoBase);
  const { turn, begin, opened } = useBookTurn({ page: PAGE_TURN_MS, cover: BOOK_COVER_TURN_MS });

  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lowMotionRef = useRef(false);
  const scrollModeRef = useRef(false);
  scrollModeRef.current = scrollMode;
  const turnRef = useRef<number | null>(null);
  const pendingRef = useRef<PublicCatalogState | null>(null);
  const applyTimer = useRef<number | null>(null);
  const meterRef = useRef<ReaderMeter | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // La barra del modo desplazamiento va fija abajo: al enfocar un control o
  // desplazarse a un ancla, el navegador deja ese hueco libre.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = "calc(64px + env(safe-area-inset-bottom))";
    return () => {
      html.style.scrollPaddingBottom = before;
    };
  }, []);

  // Preferencias: modo desplazamiento recordado, «reducir movimiento»,
  // composición (doble o una columna) y si cabe el libro.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODE_KEY) === "scroll") setUserScroll(true);
    } catch {
      // sin almacenamiento: modo páginas
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      lowMotionRef.current = mq.matches;
      setLowMotion(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    const lq = window.matchMedia(SPREAD_QUERY);
    const syncLayout = () => dispatch({ type: "layout", layout: lq.matches ? "spread" : "single" });
    syncLayout();
    lq.addEventListener("change", syncLayout);
    const bq = window.matchMedia(BOOK_QUERY);
    const syncBook = () => setBookFits(bq.matches);
    syncBook();
    bq.addEventListener("change", syncBook);
    return () => {
      mq.removeEventListener("change", sync);
      lq.removeEventListener("change", syncLayout);
      bq.removeEventListener("change", syncBook);
    };
  }, []);

  // ── Actualizaciones en vivo: se aplican al terminar un paso de página en
  // curso (≤ PAGE_TURN_MS), al momento con la galería abierta o sin animaciones.
  const flushPending = useCallback(() => {
    applyTimer.current = null;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next) dispatch({ type: "apply", next });
  }, []);

  const schedule = useCallback(
    (next: PublicCatalogState) => {
      pendingRef.current = next;
      if (applyTimer.current !== null) return;
      const delay = updateDelay({
        now: performance.now(),
        turnStartedAt: scrollModeRef.current ? null : turnRef.current,
        reducedMotion: lowMotionRef.current,
        galleryOpen: !!stateRef.current.gallery,
      });
      if (delay === 0) flushPending();
      else applyTimer.current = window.setTimeout(flushPending, delay);
    },
    [flushPending],
  );

  useEffect(() => {
    const client = new SyncClient(
      {
        openEventSource: () => new EventSource(`/api/seleccion/${encodeURIComponent(token)}/eventos`) as unknown as EventSourceLike,
        fetchState: async (known): Promise<FetchStateResult> => {
          try {
            const q = known ? `?huella=${encodeURIComponent(known)}` : "";
            const res = await fetch(`/api/seleccion/${encodeURIComponent(token)}/estado${q}`, { cache: "no-store" });
            if (!res.ok) return { kind: "error" };
            const d = await res.json();
            if (d?.valid === false) return { kind: "invalid" };
            if (d?.valid === true && typeof d.fingerprint === "string") {
              return { kind: "ok", fingerprint: d.fingerprint, expiresAt: d.expiresAt, catalog: d.catalog };
            }
            return { kind: "error" };
          } catch {
            return { kind: "error" };
          }
        },
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (h) => window.clearTimeout(h as number),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (h) => window.clearInterval(h as number),
      },
      {
        onState: schedule,
        onUnavailable: () => setUnavailable(true),
        onConnectivity: setConnectivity,
      },
      initial,
    );
    client.start();
    return () => {
      client.stop();
      if (applyTimer.current !== null) window.clearTimeout(applyTimer.current);
      applyTimer.current = null;
    };
    // El estado inicial solo sirve para arrancar; no se reinicia por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, schedule]);

  // ── Medición (?medir=1): metadatos por BroadcastChannel, nunca contenido.
  useEffect(() => {
    if (!measure || typeof BroadcastChannel === "undefined") return;
    const reader = Math.random().toString(36).slice(2, 7);
    const meter = new ReaderMeter(reader, token);
    const ch = new BroadcastChannel(MEASURE_CHANNEL);
    meterRef.current = meter;
    chanRef.current = ch;
    const post = (msgs: ReturnType<ReaderMeter["onTrial"]>) => {
      for (const m of msgs) {
        ch.postMessage(m);
        setLastResult(formatLatency(m.latencyMs));
      }
    };
    ch.onmessage = (e) => {
      const m = e.data;
      if (isMeasureMsg(m) && m.type === "trial") post(meter.onTrial(m));
    };
    const presence = window.setInterval(() => {
      meter.expire(sharedClock());
      ch.postMessage(meter.presence());
    }, 1000);
    ch.postMessage(meter.presence());
    return () => {
      window.clearInterval(presence);
      ch.close();
      meterRef.current = null;
      chanRef.current = null;
    };
  }, [measure, token]);

  // Pintado comprobado: dos fotogramas después del commit y con la huella en
  // el DOM. Es el instante que cuenta para D13.
  useEffect(() => {
    if (!measure) return;
    const fp = state.fingerprint;
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        if (rootRef.current?.dataset.huella !== fp) return;
        const meter = meterRef.current;
        if (!meter) return;
        for (const m of meter.onPaint(fp, sharedClock())) {
          chanRef.current?.postMessage(m);
          setLastResult(formatLatency(m.latencyMs));
        }
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [measure, state.fingerprint]);

  // ── Navegación
  const pages = useMemo(() => pagesOf(state.catalog, state.layout), [state.catalog, state.layout]);
  const current = pageIndex(state.catalog, state.page, state.layout);

  const go = useCallback(
    (page: PageRef) => {
      const s = stateRef.current;
      if (scrollModeRef.current) {
        dispatch({ type: "seen", page });
        document.getElementById(pageId(page))?.scrollIntoView({ behavior: lowMotionRef.current ? "auto" : "smooth", block: "start" });
        return;
      }
      const from = pageIndex(s.catalog, s.page, s.layout);
      const to = pageIndex(s.catalog, page, s.layout);
      if (from === to) return;
      // Hoja en el aire: se ignora hasta que aterrice (pulsar en ráfaga no
      // apila giros ni salta páginas), como en la referencia.
      if (turnRef.current !== null && !lowMotionRef.current && performance.now() - turnRef.current < PAGE_TURN_MS) return;
      turnRef.current = performance.now();
      setMosaic(false);
      begin(from, to, from === 0 && to > from);
      dispatch({ type: "goto", page });
    },
    [begin],
  );

  const stepBy = useCallback(
    (delta: 1 | -1) => {
      const s = stateRef.current;
      const all = pagesOf(s.catalog, s.layout);
      const j = pageIndex(s.catalog, s.page, s.layout) + delta;
      if (j < 0 || j >= all.length) return;
      go(all[j]);
    },
    [go],
  );

  // Teclado. Con la galería abierta mandan sus teclas (PrivateGallery las
  // captura y detiene), no las del libro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const s = stateRef.current;
      if (s.gallery) return;
      if (scrollModeRef.current) return;
      // Dentro de un texto que se desplaza por dentro, Av/Re Pág desplazan el
      // texto (no pasan de página); las flechas ← → siguen pasando página.
      if ((e.key === "PageDown" || e.key === "PageUp") && t?.closest("[data-scroll-region]")) return;
      const all = pagesOf(s.catalog, s.layout);
      if (e.key === "ArrowRight" || e.key === "PageDown") stepBy(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") stepBy(-1);
      else if (e.key === "Home") go(all[0]);
      else if (e.key === "End") go(all[all.length - 1]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, stepBy]);

  // Modo desplazamiento: la página visible manda en el contador y en D12.
  useEffect(() => {
    if (!scrollMode) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-page-ref]"));
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((x) => x.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        dispatch({ type: "seen", page: parsePageRef((best.target as HTMLElement).dataset.pageRef ?? "") });
      },
      { threshold: [0.35, 0.6] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [scrollMode, state.catalog, state.layout]);

  // D12 en modo desplazamiento: lleva a la vivienda siguiente.
  useEffect(() => {
    if (scrollMode && state.notice) document.getElementById(pageId(state.page))?.scrollIntoView({ block: "start" });
  }, [scrollMode, state.notice, state.page]);

  function toggleMode() {
    const next = !scrollMode;
    setUserScroll(next);
    try {
      window.localStorage.setItem(MODE_KEY, next ? "scroll" : "pages");
    } catch {
      // sin almacenamiento
    }
    const page = state.page;
    window.setTimeout(() => {
      if (next) document.getElementById(pageId(page))?.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    }, 0);
  }

  // Deslizar (tablet y móvil). Umbral alto para no interferir con el
  // desplazamiento vertical interno de una página.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || stateRef.current.gallery) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) stepBy(dx < 0 ? 1 : -1);
  };

  // ── Páginas
  const openGalleryAt = useCallback(
    (key: string) => (photo: number) => {
      setMosaic(false);
      dispatch({ type: "gallery", key, photo });
    },
    [],
  );

  function renderPage(p: PageRef, inFlow: boolean) {
    const c = state.catalog;
    const common = { id: pageId(p), "data-page-ref": pageRef(p) };
    const wrap = (key: string, node: React.ReactNode, extra?: string) => (
      <div key={key} {...common} className={cn("h-full", extra)}>
        {node}
      </div>
    );
    if (p.kind === "cover") return wrap("cover", <CoverPage catalog={c} url={url} onBegin={inFlow ? undefined : () => go({ kind: "index" })} />);
    if (p.kind === "index") {
      return wrap(
        "index",
        <IndexPage catalog={c} folioOf={(key) => openingFolio(c, key, state.layout)} onOpen={(key) => go({ kind: "item", key, part: "open" })} pdf={pdf} />,
      );
    }
    if (p.kind === "closing") return wrap("closing", <ClosingPage catalog={c} expiresAt={state.expiresAt} pdf={pdf} />);
    if (p.kind === "colophon") return wrap("colophon", <ColophonPage catalog={c} expiresAt={state.expiresAt} />);
    const i = c.items.findIndex((it) => it.key === p.key);
    const item = c.items[i];
    if (!item) return null;
    const gallery = openGalleryAt(item.key);
    const key = `item-${p.key}-${p.part}-${state.layout}`;
    if (p.part === "detail") {
      const opinion = personal ? (
        <FeedbackBox token={token} itemKey={item.key} itemTitle={item.title} saved={opinions[item.key] ?? null} onSaved={onOpinionSaved} />
      ) : null;
      return wrap(key, <DetailSpread item={item} index={i} total={c.items.length} single={state.layout === "single"} onOpenGallery={gallery} extra={opinion} />);
    }
    // La fotografía alterna de lado por vivienda, como la referencia.
    return wrap(key, <OpeningSpread item={item} index={i} total={c.items.length} url={url} flipped={i % 2 === 1} onOpenGallery={gallery} />);
  }

  const rootClass = cn(styles.root, "font-sans text-ink", lowMotion && styles.lowMotion);

  if (unavailable) {
    return (
      <div className={cn(rootClass, styles.standalone, "min-h-screen bg-cream-50")} data-testid="reader-unavailable">
        <StatePage kicker="Enlace" title="Este enlace ya no está disponible">
          <p>Si necesitas volver a ver la selección, pide un enlace nuevo a tu asesor.</p>
        </StatePage>
      </div>
    );
  }

  const galleryItem = state.gallery ? state.catalog.items.find((it) => it.key === state.gallery!.key) : undefined;
  const page = pages[current];
  const isDark = page.kind === "cover" || page.kind === "colophon";
  const sheetBg = (idx: number) => {
    const k = pages[idx]?.kind;
    return k === "cover" || k === "colophon" ? "bg-ink" : "bg-cream-50";
  };

  const banners = (
    <>
      {connectivity === "offline" ? (
        <div className={styles.banner} role="status" data-testid="offline-banner">
          <span>Sin conexión. Lo que ves puede no estar al día; se actualizará en cuanto vuelva la conexión.</span>
        </div>
      ) : null}
      {state.notice ? (
        <div className={styles.banner} role="status" data-testid="notice">
          <span>{state.notice}</span>
          <button type="button" onClick={() => dispatch({ type: "dismiss" })} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ) : null}
    </>
  );

  const modeToggle = (
    <button
      type="button"
      onClick={toggleMode}
      aria-pressed={scrollMode}
      data-testid="mode-toggle"
      className="vc-focus font-display text-[10px] font-medium uppercase vc-tracked-sm opacity-45 transition-opacity duration-300 hover:opacity-90"
    >
      {scrollMode ? "Páginas" : "Desplazar"}
    </button>
  );

  return (
    <div ref={rootRef} className={rootClass} data-huella={state.fingerprint} data-testid="reader" data-page={current + 1} data-mode={scrollMode ? "scroll" : "pages"}>
      {scrollMode ? (
        <div className={styles.flow}>
          {banners}
          {pages.map((p) => renderPage(p, true))}
          <BookNav
            className={styles.navFlow}
            ariaLabel="Navegación de la selección"
            current={current}
            total={pages.length}
            isDark={false}
            labels={NAV_LABELS}
            arrows={false}
            onPrev={() => stepBy(-1)}
            onNext={() => stepBy(1)}
            onContents={() => go({ kind: "index" })}
            contentsActive={page.kind === "index"}
            extra={modeToggle}
          />
        </div>
      ) : (
        <div className={cn(styles.book, isDark && styles.dark)} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {banners}
          <BookStage count={pages.length} current={current} turn={turn} renderPage={(idx) => renderPage(pages[idx], false)} sheetBg={sheetBg} opened={opened.current} />
          {/* Navegación editorial. Oculta en la portada: allí manda «Comenzar». */}
          {current > 0 ? (
            <BookNav
              ariaLabel="Navegación de la selección"
              current={current}
              total={pages.length}
              isDark={isDark}
              labels={NAV_LABELS}
              onPrev={() => stepBy(-1)}
              onNext={() => stepBy(1)}
              onContents={() => go({ kind: "index" })}
              contentsActive={page.kind === "index"}
              extra={modeToggle}
            />
          ) : null}
        </div>
      )}

      {/* Galería de la referencia, por encima de todo el lector (portal). La
          lámina la decide el estado del lector (E3: misma foto por su clave
          tras una actualización; aviso si desaparece). */}
      {galleryItem && state.gallery ? (
        <PrivateGallery
          title={galleryItem.title}
          photos={galleryItem.photos.map((p) => url(p.src, 1600))}
          thumbs={galleryItem.photos.map((p) => url(p.src, 640))}
          dict={GALLERY_DICT}
          startIndex={state.gallery.photo}
          index={mosaic ? null : state.gallery.photo}
          onIndexChange={(i) => {
            if (i === null) setMosaic(true);
            else {
              setMosaic(false);
              dispatch({ type: "gallery", key: galleryItem.key, photo: i });
            }
          }}
          imageComponent={GalleryImage}
          notice={
            state.notice ? (
              <div className={styles.galleryNotice} role="status" data-testid="gallery-notice">
                <span>{state.notice}</span>
                <button type="button" onClick={() => dispatch({ type: "dismiss" })} aria-label="Cerrar aviso">
                  ×
                </button>
              </div>
            ) : null
          }
          onClose={() => {
            setMosaic(false);
            dispatch({ type: "closeGallery" });
          }}
        />
      ) : null}

      {measure ? (
        <div className={styles.measureBadge} data-testid="measure-badge">
          Medición D13 · lector activo
          <br />
          Último: {lastResult ?? "—"}
        </div>
      ) : null}
    </div>
  );
}
