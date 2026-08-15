"use client";

// ============================================================================
// Viewing Collection · superficie de cliente.
//
// Consume EXCLUSIVAMENTE PublicViewingCollection. No accede a base de datos ni
// carga el cliente de Supabase: todo lo que se ve aquí ya pasó por la
// proyección del servidor.
//
// Estructura, como una publicación:
//   Portada (tinta)  →  La jornada  →  Capítulos  →  Asesor  →  Colofón (tinta)
//
// La instrumentación de analytics es la misma de Sprint 3: collection_open,
// stop_view, stop_expand y share_click.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicViewingCollection } from "@/lib/viewing-collections/public-contract";
import { useAnalytics } from "@/hooks/use-analytics";
import { CollectionCover } from "./_components/collection-cover";
import { DayOverview } from "./_components/day-overview";
import { ResidenceChapter } from "./_components/residence-chapter";
import { ChapterRail, ProgressBar } from "./_components/chapter-nav";
import { AdvisorBlock, Colophon } from "./_components/closing";

export function ViewingCollectionView({
  collection,
  collectionToken,
}: {
  collection: PublicViewingCollection;
  /** Token público de la colección. Vacío en previsualizaciones internas. */
  collectionToken: string;
}) {
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

  // ── Navegación ────────────────────────────────────────────────────────────
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

        // Capítulo activo: el último cuya apertura ya ha pasado el tercio
        // superior de la ventana.
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
  }, []);

  // El scroll suave se hace por JS para poder respetar reduced-motion sin
  // imponer `scroll-behavior: smooth` a todo el documento.
  const scrollTo = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, []);

  const goToChapter = useCallback(
    (order: number) => scrollTo(chapterRefs.current.get(order) ?? null),
    [scrollTo],
  );
  const goToOverview = useCallback(
    () => scrollTo(overviewRef.current),
    [scrollTo],
  );

  return (
    <div className="min-h-screen bg-cream-50">
      <a
        href="#viewing-day"
        className="vc-focus sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:font-display focus:text-[11px] focus:uppercase focus:text-cream-50"
      >
        Saltar a la jornada
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

      <CollectionCover collection={collection} onBegin={goToOverview} />

      <main>
        <div ref={overviewRef}>
          <DayOverview
            stops={collection.stops}
            dateLabel={collection.dateLabel}
            windowLabel={collection.windowLabel}
            onSelect={goToChapter}
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
                onView={() => track("stop_view", { order: stop.order })}
                onExpand={() => track("stop_expand", { order: stop.order })}
                onSmartLinkClick={() => track("share_click", { order: stop.order })}
              />
            ))}
          </div>
        )}

        <div className="border-t border-ink/10">
          <AdvisorBlock agent={collection.agent} />
        </div>
      </main>

      <Colophon
        clientFirstName={collection.clientFirstName}
        dateLabel={collection.dateLabel}
        expiresAtLabel={collection.expiresAtLabel}
      />
    </div>
  );
}
