"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { catalogFontVariables } from "@/lib/catalogs/fonts";
import { MEASURE_CHANNEL, ReaderMeter, formatLatency, isMeasureMsg, sharedClock } from "@/lib/catalogs/measurement";
import type { PublicCatalogState } from "@/lib/catalogs/public-contract";
import {
  applyUpdate,
  closeGallery,
  galleryStep,
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
import { itemLayout } from "@/lib/catalogs/journey-layout";
import { SyncClient, type Connectivity, type EventSourceLike, type FetchStateResult } from "@/lib/catalogs/sync-client";
import { Gallery } from "./gallery";
import {
  ClosingPage,
  CoverPage,
  DescriptionPage,
  DetailFactsPage,
  IndexPage,
  IntroPage,
  ItemSheetPage,
  JourneyPhotoPage,
  JourneyTextPage,
  OpeningPage,
  PhotoPage,
  StatePage,
  type PhotoUrl,
} from "./pages";
import styles from "./reader.module.css";

// Lector del catálogo compartido (BCP-01 T8/T9/T10; C2 Z6). Páginas o modo
// desplazamiento, teclado, deslizar, índice, galería, «reducir movimiento»,
// actualizaciones en vivo con D12 y, con ?medir=1, la medición de D13. En
// doble página cada vivienda tiene varias partes (apertura, recorrido,
// detalle); en una página, una hoja continua.

type Action =
  | { type: "goto"; page: PageRef }
  | { type: "step"; delta: 1 | -1 }
  | { type: "seen"; page: PageRef }
  | { type: "layout"; layout: ReaderLayout }
  | { type: "apply"; next: PublicCatalogState }
  | { type: "gallery"; key: string; photo: number }
  | { type: "galleryStep"; delta: 1 | -1 }
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
    case "galleryStep":
      return galleryStep(state, a.delta);
    case "closeGallery":
      return closeGallery(state);
    case "dismiss":
      return { ...state, notice: null };
  }
}

const MODE_KEY = "bcp-lector-modo";
/** La misma condición que la doble página del CSS. */
const SPREAD_QUERY = "(min-width: 900px) and (min-height: 620px)";

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
      return `${path}?w=${width}`;
    },
    [photoBase],
  );
}

export function CatalogReader({
  token,
  initial,
  photoBase = "/p/",
  measure = false,
}: {
  token: string;
  initial: PublicCatalogState;
  /** Desarrollo local: fotos sintéticas en lugar del proxy /p/. */
  photoBase?: string;
  measure?: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, initial, (s) => initialState(s));
  const [unavailable, setUnavailable] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>("connecting");
  const [scrollMode, setScrollMode] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [lowMotion, setLowMotion] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const url = usePhotoUrl(photoBase);

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

  // La barra de navegación de una página va fija abajo: al enfocar un control
  // o desplazarse a un ancla, el navegador deja ese hueco libre.
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.scrollPaddingBottom;
    html.style.scrollPaddingBottom = "calc(64px + env(safe-area-inset-bottom))";
    return () => {
      html.style.scrollPaddingBottom = before;
    };
  }, []);

  // Preferencias: modo desplazamiento recordado y «reducir movimiento».
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODE_KEY) === "scroll") setScrollMode(true);
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
    // Composición: doble página o una página (girar, redimensionar).
    const lq = window.matchMedia(SPREAD_QUERY);
    const syncLayout = () => dispatch({ type: "layout", layout: lq.matches ? "spread" : "single" });
    syncLayout();
    lq.addEventListener("change", syncLayout);
    return () => {
      mq.removeEventListener("change", sync);
      lq.removeEventListener("change", syncLayout);
    };
  }, []);

  // ── Actualizaciones en vivo: se aplican al terminar un paso de página en
  // curso (≤ 0,38 s), al momento con la galería abierta o sin animaciones.
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
  const markTurn = useCallback((d: 1 | -1) => {
    setDir(d);
    // updateDelay() ya devuelve 0 cuando han pasado PAGE_TURN_MS.
    turnRef.current = performance.now();
  }, []);

  const go = useCallback(
    (page: PageRef) => {
      const s = stateRef.current;
      if (scrollModeRef.current) {
        dispatch({ type: "seen", page });
        document.getElementById(pageId(page))?.scrollIntoView({ behavior: lowMotionRef.current ? "auto" : "smooth", block: "start" });
        return;
      }
      markTurn(pageIndex(s.catalog, page, s.layout) >= pageIndex(s.catalog, s.page, s.layout) ? 1 : -1);
      dispatch({ type: "goto", page });
      window.scrollTo({ top: 0 });
    },
    [markTurn],
  );

  const stepBy = useCallback(
    (delta: 1 | -1) => {
      const s = stateRef.current;
      const pages = pagesOf(s.catalog, s.layout);
      const j = pageIndex(s.catalog, s.page, s.layout) + delta;
      if (j < 0 || j >= pages.length) return;
      go(pages[j]);
    },
    [go],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const s = stateRef.current;
      if (s.gallery) {
        if (e.key === "Escape") dispatch({ type: "closeGallery" });
        else if (e.key === "ArrowRight") dispatch({ type: "galleryStep", delta: 1 });
        else if (e.key === "ArrowLeft") dispatch({ type: "galleryStep", delta: -1 });
        else return;
        e.preventDefault();
        return;
      }
      if (scrollModeRef.current) return;
      // Dentro de un texto que se desplaza por dentro, Av/Re Pág desplazan el
      // texto (no pasan de página); las flechas ← → siguen pasando página.
      if ((e.key === "PageDown" || e.key === "PageUp") && t?.closest("[data-scroll-region]")) return;
      const pages = pagesOf(s.catalog, s.layout);
      if (e.key === "ArrowRight" || e.key === "PageDown") stepBy(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") stepBy(-1);
      else if (e.key === "Home") go(pages[0]);
      else if (e.key === "End") go(pages[pages.length - 1]);
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
    setScrollMode(next);
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

  const pages = useMemo(() => pagesOf(state.catalog, state.layout), [state.catalog, state.layout]);
  const current = pageIndex(state.catalog, state.page, state.layout);
  const folioOf = (p: PageRef) => pageIndex(state.catalog, p, state.layout) + 1;

  function renderSpread(p: PageRef, animate: boolean) {
    const c = state.catalog;
    const anim = animate ? (dir === 1 ? styles.anim : styles.animBack) : "";
    const common = { id: pageId(p), "data-page-ref": pageRef(p) };
    if (p.kind === "cover") {
      return (
        <div key={`cover-${animate}`} {...common} className={`${styles.spread} ${anim}`}>
          <CoverPage catalog={c} url={url} />
        </div>
      );
    }
    if (p.kind === "index") {
      return (
        <div key={`index-${animate}`} {...common} className={`${styles.spread} ${c.intro ? styles.two : ""} ${anim}`}>
          {c.intro ? <IntroPage catalog={c} /> : null}
          <IndexPage
            catalog={c}
            folioOf={(key) => openingFolio(c, key, state.layout)}
            onOpen={(key) => go({ kind: "item", key, part: "open" })}
          />
        </div>
      );
    }
    if (p.kind === "closing") {
      return (
        <div key={`closing-${animate}`} {...common} className={`${styles.spread} ${anim}`}>
          <ClosingPage catalog={c} expiresAt={state.expiresAt} />
        </div>
      );
    }
    const i = c.items.findIndex((it) => it.key === p.key);
    const item = c.items[i];
    if (!item) return null;
    const gallery = (photo: number) => dispatch({ type: "gallery", key: item.key, photo });
    const folio = folioOf(p);
    const key = `item-${p.key}-${p.part}-${state.layout}-${animate}`;
    const photoSizes = "(min-width: 900px) and (min-height: 620px) 45vh, 100vw";

    const lay = itemLayout(item);
    if (state.layout === "single") {
      return (
        <div key={key} {...common} className={`${styles.spread} ${styles.two} ${anim}`} data-part="sheet">
          <PhotoPage item={item} index={i} url={url} sizes={photoSizes} onOpenGallery={gallery} />
          <ItemSheetPage catalog={c} item={item} index={i} folio={folio} url={url} layout={lay} onOpenGallery={gallery} />
        </div>
      );
    }
    if (p.part === "open") {
      return (
        <div key={key} {...common} className={`${styles.spread} ${styles.two} ${anim}`} data-part="open">
          <PhotoPage item={item} index={i} url={url} sizes={photoSizes} onOpenGallery={gallery} />
          <OpeningPage
            catalog={c}
            item={item}
            index={i}
            folio={folio}
            url={url}
            layout={lay}
            onOpenGallery={gallery}
            onContinue={lay.spreads.length ? () => go({ kind: "item", key: item.key, part: "j1" }) : null}
          />
        </div>
      );
    }
    if (p.part === "detail") {
      const right = !!item.description || !!lay.detail?.story;
      return (
        <div key={key} {...common} className={`${styles.spread} ${right ? styles.two : ""} ${anim}`} data-part="detail">
          <DetailFactsPage item={item} index={i} folio={right ? null : folio} url={url} onOpenGallery={gallery} />
          {right ? <DescriptionPage item={item} folio={folio} story={!!lay.detail?.story} /> : null}
        </div>
      );
    }
    // Recorrido (E1): la doble página n de la composición pura.
    const n = Number(p.part.slice(1));
    const spread = lay.spreads[n - 1];
    if (!spread) return null;
    const last = n === lay.spreads.length;
    const more =
      last && lay.truncated && lay.detail
        ? {
            label: lay.detail.story ? "Sigue en la historia completa →" : "Sigue en la descripción completa →",
            onClick: () => go({ kind: "item", key: item.key, part: "detail" }),
          }
        : null;
    const composed = spread.slots.length === 1;
    return (
      <div key={key} {...common} className={`${styles.spread} ${composed ? "" : styles.two} ${anim}`} data-part={p.part}>
        {spread.slots.map((slot, k) =>
          slot.kind === "photo" ? (
            <JourneyPhotoPage key={`ph${k}`} item={item} photo={slot.photo} url={url} onOpenGallery={gallery} />
          ) : (
            <JourneyTextPage
              key={`tx${k}`}
              item={item}
              page={slot.page}
              inlinePhoto={slot.inlinePhoto}
              composed={composed}
              folio={k === spread.slots.length - 1 ? folio : null}
              more={k === spread.slots.length - 1 ? more : null}
              url={url}
              onOpenGallery={gallery}
            />
          ),
        )}
      </div>
    );
  }

  const rootClass = `${catalogFontVariables} ${styles.root} ${lowMotion ? styles.lowMotion : ""}`;

  if (unavailable) {
    return (
      <div className={rootClass} data-testid="reader-unavailable">
        <div className={styles.stage}>
          <div className={styles.spread}>
            <StatePage kicker="Enlace" title="Este enlace ya no está disponible">
              <p className={styles.lede}>Si necesitas volver a ver la selección, pide un enlace nuevo a tu asesor.</p>
            </StatePage>
          </div>
        </div>
      </div>
    );
  }

  const galleryItem = state.gallery ? state.catalog.items.find((it) => it.key === state.gallery!.key) : undefined;

  return (
    <div
      ref={rootRef}
      className={rootClass}
      data-huella={state.fingerprint}
      data-testid="reader"
      data-page={current + 1}
      data-mode={scrollMode ? "scroll" : "pages"}
    >
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

      {scrollMode ? (
        <div className={styles.scrollFlow}>{pages.map((p) => renderSpread(p, false))}</div>
      ) : (
        <div
          className={styles.stage}
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) stepBy(dx < 0 ? 1 : -1);
          }}
        >
          {renderSpread(state.page, true)}
        </div>
      )}

      <nav className={styles.capsule} aria-label="Navegación de la selección">
        {!scrollMode ? (
          <button type="button" onClick={() => stepBy(-1)} disabled={current === 0} aria-label="Página anterior">
            ←
          </button>
        ) : null}
        <span className={styles.counter} aria-live="polite" data-testid="counter">
          {current + 1} / {pages.length}
        </span>
        {!scrollMode ? (
          <button type="button" onClick={() => stepBy(1)} disabled={current === pages.length - 1} aria-label="Página siguiente">
            →
          </button>
        ) : null}
        <span className={styles.capsuleSep} aria-hidden="true" />
        <button type="button" onClick={() => go({ kind: "index" })}>
          Índice
        </button>
        <button type="button" onClick={toggleMode} aria-pressed={scrollMode} data-testid="mode-toggle">
          {scrollMode ? "Páginas" : "Desplazar"}
        </button>
      </nav>

      {galleryItem && state.gallery ? (
        <Gallery
          item={galleryItem}
          photo={state.gallery.photo}
          url={url}
          onStep={(delta) => dispatch({ type: "galleryStep", delta })}
          onClose={() => dispatch({ type: "closeGallery" })}
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
