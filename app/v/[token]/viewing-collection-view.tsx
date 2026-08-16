"use client";

// ============================================================================
// Viewing Collection · superficie de cliente.
//
// Dos modos sobre el MISMO contrato (PublicViewingCollection):
//
//   · PRIVATE BOOK (escritorio y tablet horizontal, ≥1024px apaisado):
//     publicación paginada — portada, índice, un spread por residencia,
//     asesor y colofón. Ver book-mode.tsx.
//
//   · SCROLL EDITORIAL (móvil y tablet vertical): el recorrido vertical de
//     siempre, pensado para consultarse entre visita y visita.
//
// El servidor renderiza el modo scroll (mejor LCP: la portada es idéntica en
// ambos) y el cliente cambia a libro tras montar si el viewport lo pide. Como
// la portada ocupa el viewport completo en los dos modos, el cambio es
// invisible.
//
// Ningún componente de esta vista toca la base de datos: todo llega ya
// proyectado y traducido según collection.language. 'ar' y 'he' → RTL.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicViewingCollection } from "@/lib/viewing-collections/public-contract";
import {
  getCollectionDictionary,
  isRtl,
} from "@/lib/viewing-collections/i18n";
import { rememberCollectionReturn } from "@/lib/viewing-collections/return-link";
import { useAnalytics } from "@/hooks/use-analytics";
import { CollectionCover } from "./_components/collection-cover";
import { DayOverview } from "./_components/day-overview";
import { ResidenceChapter } from "./_components/residence-chapter";
import { ChapterRail, ProgressBar } from "./_components/chapter-nav";
import { AdvisorBlock, Colophon } from "./_components/closing";
import { BookMode } from "./_components/book-mode";

/**
 * El libro se sirve allí donde CABE una página entera: móvil vertical, tablet
 * y escritorio. El criterio es la altura, no el ancho — lo que rompe la
 * composición no es una pantalla estrecha (se apila en una columna) sino una
 * baja, donde la fotografía y el texto no entran juntos.
 *
 * Queda fuera el móvil apaisado (~390px de alto) y las ventanas de escritorio
 * muy achatadas: ahí sigue el recorrido vertical de siempre.
 */
const BOOK_MEDIA_QUERY = "(min-height: 620px)";

export function ViewingCollectionView({
  collection,
  collectionToken,
}: {
  collection: PublicViewingCollection;
  /** Token público de la colección. Vacío en previsualizaciones internas. */
  collectionToken: string;
}) {
  const dict = useMemo(
    () => getCollectionDictionary(collection.language),
    [collection.language],
  );
  const rtl = isRtl(collection.language);

  // Token vacío = previsualización del agente: no se instrumenta nada.
  const isPreview = !collectionToken;
  const trackerRef = useAnalytics({
    pageType: "viewing_collection",
    collectionToken: collectionToken || undefined,
    disabled: isPreview,
  });

  useEffect(() => {
    if (isPreview) return;
    trackerRef.current?.trackEvent?.("collection_open", {
      stops: collection.stopCount,
    });
  }, [trackerRef, collection.stopCount, isPreview]);

  const track = useCallback(
    (event: string, data?: unknown) => {
      if (isPreview) return;
      trackerRef.current?.trackEvent?.(event, data);
    },
    [trackerRef, isPreview],
  );

  /**
   * Al salir hacia la ficha de una propiedad se deja apuntada la vuelta. Se
   * guarda en el navegador del cliente, NO en la URL de la propiedad: reenviar
   * "mira este piso" no debe entregar la colección privada entera.
   */
  const onLeaveToProperty = useCallback(
    (order: number) => {
      track("share_click", { order });
      if (isPreview || !collectionToken) return;
      rememberCollectionReturn(`/v/${collectionToken}`, dict.backToCollection);
    },
    [track, isPreview, collectionToken, dict.backToCollection],
  );

  // Una residencia se cuenta como vista UNA vez por sesión. El registro vive
  // aquí, no dentro de cada modo: al girar una tablet se cruza el media query,
  // se desmonta un modo y monta el otro, y un registro por modo volvía a
  // contar la residencia que ya estaba en pantalla.
  const viewedStops = useRef(new Set<number>());
  const trackStopView = useCallback(
    (order: number) => {
      if (viewedStops.current.has(order)) return;
      viewedStops.current.add(order);
      track("stop_view", { order });
    },
    [track],
  );

  // ── Detección de modo ──────────────────────────────────────────────────────
  const [bookMode, setBookMode] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(BOOK_MEDIA_QUERY);
    const apply = () => setBookMode(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── Navegación del modo scroll ─────────────────────────────────────────────
  const chapterRefs = useRef(new Map<number, HTMLElement>());
  const overviewRef = useRef<HTMLDivElement | null>(null);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [pastCover, setPastCover] = useState(false);
  const [progress, setProgress] = useState(0);

  const registerRef = useCallback((order: number, el: HTMLElement | null) => {
    if (el) chapterRefs.current.set(order, el);
    else chapterRefs.current.delete(order);
  }, []);

  useEffect(() => {
    if (bookMode) return; // el libro no usa scroll de documento
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setPastCover(y > window.innerHeight * 0.7);
        const doc = document.documentElement;
        const scrollable = doc.scrollHeight - window.innerHeight;
        setProgress(scrollable > 0 ? y / scrollable : 0);
        const marker = window.innerHeight * 0.33;
        let current: number | null = null;
        for (const [order, el] of chapterRefs.current) {
          if (el.getBoundingClientRect().top <= marker) current = order;
        }
        setActiveOrder(current);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [bookMode]);

  const scrollTo = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  const goToChapter = useCallback(
    (order: number) => scrollTo(chapterRefs.current.get(order) ?? null),
    [scrollTo],
  );
  const goToOverview = useCallback(
    () => scrollTo(overviewRef.current),
    [scrollTo],
  );

  // ── PRIVATE BOOK ───────────────────────────────────────────────────────────
  if (bookMode) {
    return (
      <BookMode
        collection={collection}
        dict={dict}
        onStopView={trackStopView}
        onStopExpand={(order) => track("stop_expand", { order })}
        onSmartLinkClick={onLeaveToProperty}
      />
    );
  }

  // ── SCROLL EDITORIAL ───────────────────────────────────────────────────────
  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-screen bg-cream-50">
      <a
        href="#viewing-day"
        className="vc-focus sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:font-display focus:text-[11px] focus:uppercase focus:text-cream-50"
      >
        {dict.dayTitle}
      </a>

      <ProgressBar
        progress={progress}
        activeOrder={activeOrder}
        total={collection.stopCount}
        visible={pastCover}
      />

      <ChapterRail
        stops={collection.stops}
        activeOrder={activeOrder}
        visible={pastCover}
        onSelect={goToChapter}
        onOverview={goToOverview}
      />

      <CollectionCover
        collection={collection}
        dict={dict}
        onBegin={goToOverview}
      />

      <main>
        <div ref={overviewRef}>
          <DayOverview
            stops={collection.stops}
            dateLabel={collection.dateLabel}
            windowLabel={collection.windowLabel}
            onSelect={goToChapter}
            dict={dict}
          />
        </div>

        {collection.stops.length > 0 && (
          <div className="border-t border-ink/10">
            {collection.stops.map((stop) => (
              <ResidenceChapter
                key={stop.order}
                stop={stop}
                total={collection.stopCount}
                registerRef={registerRef}
                dict={dict}
                rtl={rtl}
                onView={() => trackStopView(stop.order)}
                onExpand={() => track("stop_expand", { order: stop.order })}
                onSmartLinkClick={() => onLeaveToProperty(stop.order)}
              />
            ))}
          </div>
        )}

        <div className="border-t border-ink/10">
          <AdvisorBlock agent={collection.agent} dict={dict} />
        </div>
      </main>

      <Colophon
        clientFirstName={collection.clientFirstName}
        dateLabel={collection.dateLabel}
        expiresAtLabel={collection.expiresAtLabel}
        dict={dict}
      />
    </div>
  );
}
