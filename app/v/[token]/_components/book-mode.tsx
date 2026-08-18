"use client";

// ============================================================================
// PRIVATE BOOK MODE · móvil vertical, tablet y escritorio.
//
// La colección se comporta como una publicación paginada: portada, índice, un
// spread por residencia, asesor y colofón. Un viewport = una composición.
//
// La página de residencia se compone en DOS COLUMNAS a partir de 768px
// (texto | fotografía, alternando de lado) y en DOS FILAS por debajo
// (fotografía arriba, texto debajo). Es la misma página, no dos plantillas:
// en un teléfono el libro se hojea igual, con el mismo giro y el mismo swipe.
//
// El paso de página es un giro real sobre el lomo (rotateY + perspectiva +
// sombra de lomo, ver globals.css), ~700ms y la portada más marcada (~850ms).
// Sin librerías de flipbook. prefers-reduced-motion lo degrada a un fundido.
// Las páginas viven en nodos con key estable que sobreviven al giro: la
// fotografía nunca se remonta al aterrizar (sin pestañeo).
//
// Entradas: clic, teclado ←/→ (invertido en RTL), y swipe en tablet. No se
// secuestra el scroll del navegador: dentro de una página con poco alto, el
// contenido puede desplazarse verticalmente con normalidad.
//
// Dos numeraciones distintas a propósito:
//   · ChapterMark  "01 / 03" — la residencia dentro de la colección
//   · Paginación   "06 / 09" — la página dentro del libro
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type {
  PublicViewingCollection,
  PublicViewingStop,
} from "@/lib/viewing-collections/public-contract";
import {
  isRtl,
  type CollectionDictionary,
} from "@/lib/viewing-collections/i18n";
import { cn } from "@/lib/utils";
import { CollectionCover } from "./collection-cover";
import { AgentContactData } from "./closing";
import { statusWord } from "./day-overview";
import { PrivateGallery } from "./private-gallery";
import { ResidenceRating } from "./residence-rating";
import {
  ChapterMark,
  DataPoint,
  EditorialAction,
  Label,
  Ornament,
  Rule,
  StatusLine,
} from "./editorial";

type Page =
  | { kind: "cover" }
  | { kind: "index" }
  | { kind: "residence"; stop: PublicViewingStop }
  | { kind: "advisor" }
  | { kind: "colophon" };

export function BookMode({
  collection,
  dict,
  onStopView,
  onStopExpand,
  onSmartLinkClick,
  collectionToken = "",
}: {
  collection: PublicViewingCollection;
  dict: CollectionDictionary;
  onStopView: (order: number) => void;
  onStopExpand: (order: number) => void;
  onSmartLinkClick: (order: number) => void;
  /** Vacío en la previsualización del agente: entonces no se guarda nada. */
  collectionToken?: string;
}) {
  const rtl = isRtl(collection.language);

  const pages = useMemo<Page[]>(
    () => [
      { kind: "cover" },
      { kind: "index" },
      ...collection.stops.map((stop) => ({ kind: "residence" as const, stop })),
      { kind: "advisor" },
      { kind: "colophon" },
    ],
    [collection.stops],
  );

  const [current, setCurrent] = useState(0);
  // Giro en curso: mantiene la hoja saliente montada mientras la nueva página
  // se asienta debajo. La navegación queda BLOQUEADA durante el giro — pulsar
  // "siguiente" en ráfaga no apila animaciones ni salta páginas.
  const [turn, setTurn] = useState<{
    from: number;
    dir: 1 | -1;
    cover: boolean;
  } | null>(null);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La galería vive AQUÍ, no dentro de la página. Si viviera dentro, la hoja
  // saliente seguiría montada durante el giro y el lector vería las fotos del
  // capítulo anterior sobre la página nueva durante casi un segundo.
  const [gallery, setGallery] = useState<{
    order: number;
    startIndex: number | null;
  } | null>(null);
  const closeGallery = useCallback(() => setGallery(null), []);
  // El fundido de entrada solo aplica al primer montaje; tras el primer giro
  // la página aterrizada no debe volver a fundirse (pestañeo).
  const opened = useRef(false);

  const go = useCallback(
    (target: number) => {
      if (turn) return; // hoja en el aire: se ignora hasta que aterrice
      const next = Math.max(0, Math.min(pages.length - 1, target));
      if (next === current) return;
      // ANTES del giro, siempre: nada de fotografías del capítulo anterior
      // sobrevolando la página nueva. Vale para siguiente, anterior, salto
      // desde el índice y vuelta al índice — todos pasan por aquí.
      setGallery(null);
      opened.current = true;
      const dir: 1 | -1 = next > current ? 1 : -1;
      const cover = current === 0 && dir === 1;
      setTurn({ from: current, dir, cover });
      setCurrent(next);
      if (turnTimer.current) clearTimeout(turnTimer.current);
      turnTimer.current = setTimeout(
        () => setTurn(null),
        cover ? 870 : 720,
      );
    },
    [pages.length, current, turn, setGallery],
  );

  // Cinturón y tirantes: si por cualquier vía la página cambia con la galería
  // abierta, se cierra en el mismo commit, sin esperar a la animación.
  useEffect(() => {
    setGallery((g) => {
      const page = pages[current];
      if (!g) return g;
      return page.kind === "residence" && page.stop.order === g.order ? g : null;
    });
  }, [current, pages]);

  // Precarga de las fotografías de portada vecinas: cuando la hoja gire, la
  // página que se revela ya tiene su imagen decodificada — sin pop de carga.
  useEffect(() => {
    for (const i of [current - 1, current + 1]) {
      const p = pages[i];
      if (p?.kind === "residence" && p.stop.coverPhotoUrl) {
        const img = new window.Image();
        img.src = p.stop.coverPhotoUrl;
      }
    }
  }, [current, pages]);

  useEffect(
    () => () => {
      if (turnTimer.current) clearTimeout(turnTimer.current);
    },
    [],
  );

  const goToResidence = useCallback(
    (order: number) => {
      const idx = pages.findIndex(
        (p) => p.kind === "residence" && p.stop.order === order,
      );
      if (idx >= 0) go(idx);
    },
    [pages, go],
  );

  // Se avisa cuando la residencia pasa a ser la página ACTIVA — ni al iniciar
  // la animación de la hoja saliente, ni al abrir la galería. De que no se
  // cuente dos veces se encarga quien recibe el aviso (ViewingCollectionView),
  // que es lo único que sobrevive a un cambio de modo.
  useEffect(() => {
    const page = pages[current];
    if (page.kind === "residence") onStopView(page.stop.order);
  }, [current, pages, onStopView]);

  // Teclado. En RTL las flechas se invierten: → retrocede, ← avanza.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      // Con la galería abierta mandan sus flechas, no las del libro.
      if (gallery) return;
      const fwd = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === fwd) go(current + 1);
      else if (e.key === back) go(current - 1);
      else if (e.key === "Home") go(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, current, rtl, gallery]);

  // Swipe en tablet. Umbral alto (60px) para no interferir con el scroll
  // vertical interno de una página.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (gallery) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (gallery || !touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (gallery) return;
    const forward = rtl ? dx > 0 : dx < 0;
    go(current + (forward ? 1 : -1));
  };

  const page = pages[current];
  const isDark = page.kind === "cover" || page.kind === "colophon";
  const rtlClass = rtl ? "vc-rtl" : "";

  // La residencia de la galería se resuelve por `order`, no por índice de
  // página: si el orden cambiara, la galería no puede quedar apuntando a otra.
  const galleryStop = gallery
    ? (collection.stops.find((s) => s.order === gallery.order) ?? null)
    : null;

  const renderPage = (p: Page) => (
    <>
      {p.kind === "cover" && (
        <CollectionCover
          collection={collection}
          dict={dict}
          onBegin={() => go(1)}
        />
      )}
      {p.kind === "index" && (
        <BookIndexPage
          collection={collection}
          dict={dict}
          onSelect={goToResidence}
        />
      )}
      {p.kind === "residence" && (
        <BookResidencePage
          stop={p.stop}
          total={collection.stopCount}
          dict={dict}
          onOpenGallery={() => {
            // Se abre la fotografía que se acaba de tocar, no una rejilla de
            // miniaturas más pequeñas que la que ya estabas mirando.
            setGallery({ order: p.stop.order, startIndex: 0 });
            onStopExpand(p.stop.order);
          }}
          onSmartLinkClick={() => onSmartLinkClick(p.stop.order)}
          collectionToken={collectionToken}
        />
      )}
      {p.kind === "advisor" && (
        <BookAdvisorPage collection={collection} dict={dict} />
      )}
      {p.kind === "colophon" && (
        <BookColophonPage collection={collection} dict={dict} />
      )}
    </>
  );

  // Fondo de la hoja saliente: debe ser opaco (una hoja no es transparente),
  // del color de la página que se lleva.
  const sheetBg = (p: Page) =>
    p.kind === "cover" || p.kind === "colophon" ? "bg-ink" : "bg-cream-50";

  // Una capa del escenario. TODAS las capas comparten esta estructura exacta
  // (página + hueco de sombra, aunque sea null): si el número o la posición
  // de los hijos cambiara entre estados, React remontaría el contenido al
  // aterrizar — y la fotografía pestañearía.
  const pageLayer = (
    idx: number,
    cls: string,
    opts?: { shade?: "turn" | "under"; hidden?: boolean },
  ) => (
    <div
      key={`page-${idx}`}
      aria-hidden={opts?.hidden || undefined}
      className={cn("absolute inset-0", cls)}
    >
      {renderPage(pages[idx])}
      {opts?.shade ? (
        <div
          className={cn(
            opts.shade === "turn" ? "vc-turn-shade" : "vc-under-shade",
            rtlClass,
          )}
          aria-hidden
        />
      ) : null}
    </div>
  );

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className={cn(
        // h-[100dvh]: en iOS la barra del navegador se come el `inset-0` y
        // la navegación del libro quedaba debajo de ella.
        "fixed inset-0 h-[100dvh] flex flex-col overflow-hidden",
        isDark ? "bg-ink" : "bg-cream-50",
      )}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Las capas se renderizan como ARRAY con key por índice de página y
          estructura de hijos IDÉNTICA en todos los estados (página + hueco de
          sombra): React reconcilia por key y posición, así que una página que
          sobrevive al cambio de estado (girando ↔ reposo) conserva su nodo
          DOM — la fotografía no se remonta ni repinta al aterrizar la hoja.
          Solo cambian las clases. El orden del array es el orden de apilado
          (la última queda encima). */}
      <div className="vc-book-stage relative min-h-0 flex-1">
        {turn
          ? turn.dir === 1
            ? [
                // ── AVANZAR: la nueva página se asienta debajo; la hoja que
                //    dejamos (mismo nodo que tenía en reposo) gira encima.
                pageLayer(current, cn("vc-sheet-settle", rtlClass), {
                  shade: "turn",
                }),
                pageLayer(
                  turn.from,
                  cn(
                    "pointer-events-none vc-sheet-edge",
                    sheetBg(pages[turn.from]),
                    turn.cover ? "vc-sheet-out-cover" : "vc-sheet-out-next",
                    rtlClass,
                  ),
                  { hidden: true },
                ),
              ]
            : [
                // ── RETROCEDER: la página que dejamos (mismo nodo) queda
                //    quieta debajo; la hoja anterior vuelve a posarse encima.
                pageLayer(turn.from, "pointer-events-none", {
                  shade: "under",
                  hidden: true,
                }),
                pageLayer(
                  current,
                  cn(
                    "vc-sheet-in-prev vc-sheet-edge",
                    sheetBg(pages[current]),
                    rtlClass,
                  ),
                ),
              ]
          : [pageLayer(current, !opened.current ? "vc-page-in" : "")]}
      </div>

      {/* Navegación editorial. Oculta en la portada: allí manda "Comenzar". */}
      {current > 0 && (
        <nav
          aria-label="Book navigation"
          className={cn(
            "flex shrink-0 items-center justify-between border-t px-4 py-3 sm:px-8 sm:py-3.5 lg:px-12",
            isDark
              ? "border-cream-50/15 text-cream-50"
              : "border-ink/10 text-ink",
          )}
        >
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current === 0}
            className="vc-focus group flex items-center gap-2 px-2 py-1.5 font-display text-[10px] font-medium uppercase vc-tracked opacity-60 transition-opacity duration-300 hover:opacity-100 disabled:opacity-20 sm:gap-3"
          >
            <span
              aria-hidden
              className="inline-block transition-transform duration-300 group-hover:-translate-x-0.5 rtl:rotate-180"
            >
              &larr;
            </span>
            <span className="hidden sm:inline">{dict.previous}</span>
          </button>

          <div className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => go(1)}
              className={cn(
                "vc-focus font-display text-[10px] font-medium uppercase vc-tracked-sm transition-opacity duration-300",
                current === 1
                  ? "opacity-90"
                  : "opacity-45 hover:opacity-90",
              )}
            >
              {dict.contents}
            </button>
            <span
              className="font-display text-[10.5px] font-medium vc-nums opacity-70"
              aria-label={`${current + 1} ${dict.pageOf} ${pages.length}`}
            >
              {String(current + 1).padStart(2, "0")}
              <span className="mx-1.5 opacity-50">/</span>
              {String(pages.length).padStart(2, "0")}
            </span>
          </div>

          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current === pages.length - 1}
            className="vc-focus group flex items-center gap-2 px-2 py-1.5 font-display text-[10px] font-medium uppercase vc-tracked opacity-60 transition-opacity duration-300 hover:opacity-100 disabled:opacity-20 sm:gap-3"
          >
            <span className="hidden sm:inline">{dict.next}</span>
            <span
              aria-hidden
              className="inline-block transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180"
            >
              &rarr;
            </span>
          </button>
        </nav>
      )}

      {/* Private Gallery Mode, por encima de todo el libro (nunca dentro de una
          página): así una navegación la cierra en seco y no queda flotando. */}
      {galleryStop && (
        <PrivateGallery
          title={galleryStop.title}
          /* Portada + 12: el mismo conjunto que anuncia "ver N fotografías". */
          photos={galleryStop.photoUrls.slice(0, 13)}
          dict={dict}
          rtl={rtl}
          startIndex={gallery?.startIndex ?? null}
          onClose={closeGallery}
        />
      )}
    </div>
  );
}

// ─── Índice · "Tu día de visitas" como tabla de contenidos ───────────────────

function BookIndexPage({
  collection,
  dict,
  onSelect,
}: {
  collection: PublicViewingCollection;
  dict: CollectionDictionary;
  onSelect: (order: number) => void;
}) {
  const STATUS_WORD = statusWord(dict);
  return (
    <div className="flex h-full justify-center overflow-y-auto px-6 py-8 sm:px-10 sm:py-10 lg:px-16">
      <div className="my-auto w-full max-w-4xl">
        <div className="text-center">
          <Label tone="gold">{dict.dayLabel}</Label>
          <h2 className="mt-3 font-serif text-[26px] font-normal vc-tight text-ink sm:text-[32px] lg:text-[44px]">
            {dict.dayTitle}
          </h2>
          {(collection.dateLabel || collection.windowLabel) && (
            <p className="mt-3 font-sans text-[13px] text-ink/50">
              {collection.dateLabel}
              {collection.windowLabel ? ` · ${collection.windowLabel}` : ""}
            </p>
          )}
          <Ornament className="mt-6" />
        </div>

        <Rule className="mt-9" />
        <ol>
          {collection.stops.map((stop) => (
            <li key={stop.order}>
              <button
                type="button"
                onClick={() => onSelect(stop.order)}
                className={cn(
                  // Móvil: número + hora arriba, título debajo, estado al
                  // final de la primera línea. Desde sm, la tabla de siempre.
                  "vc-focus group grid w-full grid-cols-[2.2rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-3 text-start transition-colors duration-500 sm:grid-cols-[3rem_6.5rem_1fr_auto] sm:gap-x-6 sm:py-4 lg:py-5",
                  stop.status === "cancelled" && "opacity-45",
                )}
              >
                <span className="font-display text-[10.5px] font-medium uppercase vc-tracked vc-nums text-ink/30">
                  {String(stop.order).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "font-serif text-[20px] leading-none vc-nums text-ink sm:text-[24px] lg:text-[27px]",
                    !stop.timeLabel && "text-ink/25",
                    stop.status === "cancelled" &&
                      stop.timeLabel &&
                      "line-through decoration-ink/25",
                  )}
                >
                  {stop.timeLabel ??
                    (stop.timePending ? (
                      <span className="font-display text-[9.5px] uppercase vc-tracked-sm text-gold-dark">
                        {dict.timeToBeConfirmed}
                      </span>
                    ) : (
                      "—"
                    ))}
                </span>
                <span className="col-span-3 min-w-0 sm:col-span-1">
                  <span className="block truncate font-display text-[12px] font-medium uppercase vc-tracked-sm text-ink transition-colors duration-500 group-hover:text-gold-dark sm:text-[13.5px]">
                    {stop.title}
                  </span>
                  <span className="mt-0.5 block truncate font-sans text-[11.5px] text-ink/45">
                    {stop.zoneLabel}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-display text-[9.5px] font-medium uppercase vc-tracked-sm",
                    // En una columna el estado se coloca arriba a la derecha,
                    // en la fila de la hora: si no, caía solo a una línea y
                    // "por confirmar" se partía en dos.
                    "col-start-3 row-start-1 justify-self-end whitespace-nowrap sm:col-start-auto sm:row-start-auto",
                    stop.status === "pending" && "text-gold-dark",
                    stop.status === "cancelled" && "text-ink/35",
                  )}
                >
                  {STATUS_WORD[stop.status]}
                </span>
              </button>
              <Rule />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Spread de residencia · texto y fotografía a página ──────────────────────

function BookResidencePage({
  stop,
  total,
  dict,
  onOpenGallery,
  onSmartLinkClick,
  collectionToken,
}: {
  stop: PublicViewingStop;
  total: number;
  dict: CollectionDictionary;
  onOpenGallery: () => void;
  onSmartLinkClick: () => void;
  collectionToken: string;
}) {
  const flipped = stop.order % 2 === 0;
  const cancelled = stop.status === "cancelled";
  const unavailable = stop.availability === "unavailable";
  const extraPhotos = stop.photoUrls.slice(1, 13);

  const viewingText = cancelled
    ? `${dict.privateViewing} · ${dict.statusCancelled}`
    : stop.status === "confirmed"
      ? `${dict.privateViewing} · ${dict.statusConfirmed}`
      : `${dict.privateViewing} · ${dict.statusPending}`;
  const viewingTone = cancelled
    ? "muted"
    : stop.status === "confirmed"
      ? "confirmed"
      : "pending";

  if (unavailable) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <div className="max-w-lg text-center">
          <ChapterMark index={stop.order} total={total} />
          <h2 className="mt-6 font-serif text-[36px] font-normal vc-tight text-ink/70">
            {stop.title}
          </h2>
          <Ornament className="mt-8" />
          <p className="mt-8 font-sans text-[14px] text-ink/50">
            {dict.noLongerAvailable}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Móvil: fotografía arriba (40% del alto), texto debajo.
        // Desde md: las dos a página, alternando de lado por capítulo.
        "grid h-full grid-rows-[35%_minmax(0,1fr)] md:grid-cols-2 md:grid-rows-1",
        cancelled && "opacity-65",
      )}
    >
      {/* ── Panel editorial ── */}
      <div
        className={cn(
          // Sin `justify-center`: centrar un contenedor con scroll RECORTA por
          // arriba en cuanto el contenido no cabe (y el contenido varía con el
          // largo del título y de la dirección). El centrado lo hace el
          // `my-auto` de dentro: centra si cabe, y si no, desplaza desde
          // arriba sin cortar nada.
          "flex min-h-0 flex-col overflow-y-auto px-6 py-5 md:px-10 md:py-10 lg:px-14 xl:px-20",
          // En una sola columna el texto va SIEMPRE debajo de la fotografía;
          // alternar el lado solo tiene sentido con las dos a la vista.
          "order-2",
          flipped ? "md:order-2" : "md:order-1",
        )}
      >
       <div className="my-auto w-full">
        <div className="flex items-center gap-4 md:gap-5">
          <ChapterMark index={stop.order} total={total} />
          <span aria-hidden className="h-px flex-1 bg-ink/12" />
        </div>

        <Label tone="gold" className="mt-3.5 md:mt-7">
          {stop.zoneLabel}
        </Label>
        <h2 className="mt-2 max-w-[16ch] font-serif text-[26px] font-normal vc-tight text-ink sm:text-[30px] md:text-[34px] lg:text-[44px] xl:text-[50px]">
          {stop.title}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 md:mt-5 md:gap-y-2">
          {!stop.timeLabel && stop.timePending && !cancelled && (
            <span className="font-display text-[10px] font-medium uppercase vc-tracked text-gold-dark">
              {dict.timeToBeConfirmed}
            </span>
          )}
          {stop.timeLabel && !cancelled && (
            <span dir="ltr" className="inline-block font-serif text-[21px] leading-none vc-nums text-ink md:text-[24px] lg:text-[27px]">
              {stop.timeLabel}
              {stop.durationLabel && (
                <span className="ms-2 font-sans text-[11.5px] font-normal text-ink/40">
                  {stop.durationLabel}
                </span>
              )}
            </span>
          )}
          <StatusLine tone={viewingTone as "confirmed" | "pending" | "muted"}>
            {viewingText}
          </StatusLine>
        </div>

        <Rule className="my-3.5 md:my-6 lg:my-7" />

        <p dir="ltr" className="font-serif text-[23px] leading-none vc-nums text-ink md:text-[26px] lg:text-[30px] rtl:text-right">
          {stop.priceLabel}
        </p>

        <div className="mt-3.5 flex flex-wrap gap-x-8 gap-y-3.5 md:mt-6 md:gap-x-10 md:gap-y-5 lg:gap-x-12">
          <DataPoint label={dict.bedrooms} value={stop.bedrooms} />
          <DataPoint label={dict.bathrooms} value={stop.bathrooms} />
          {stop.squareMeters ? (
            <DataPoint
              label={dict.surface}
              value={
                <>
                  {stop.squareMeters}
                  <span className="ms-1 text-[13px] text-ink/45">m²</span>
                </>
              }
            />
          ) : null}
        </div>

        <div className="mt-3.5 md:mt-6">
          <Label>{dict.location}</Label>
          {stop.exactAddress ? (
            <p className="mt-1.5 font-sans text-[13.5px] leading-relaxed text-ink/80">
              {stop.exactAddress}
            </p>
          ) : (
            <>
              <p className="mt-1.5 font-sans text-[13.5px] leading-relaxed text-ink/80">
                {stop.zoneLabel}
              </p>
              <p className="mt-1 font-sans text-[11px] text-ink/40">
                {dict.addressOnConfirm}
              </p>
            </>
          )}
        </div>

        {stop.availability === "reserved" || stop.availability === "sold" ? (
          <StatusLine tone="alert" className="mt-5">
            {dict.residence} ·{" "}
            {stop.availability === "reserved" ? dict.reserved : dict.sold}
          </StatusLine>
        ) : null}

        {stop.smartLinkUrl && !cancelled && (
          <div className="mt-4 md:mt-8">
            <EditorialAction
              href={stop.smartLinkUrl}
              onClick={onSmartLinkClick}
              sameOrigin
            >
              {dict.explore}
            </EditorialAction>
            <p className="mt-3 font-sans text-[11px] text-ink/40">
              {dict.exploreHint}
            </p>
          </div>
        )}

        {stop.bcReference && (
          <p className="mt-4 font-display text-[9.5px] font-medium uppercase vc-tracked-sm text-ink/30 md:mt-7">
            Ref. {stop.bcReference}
          </p>
        )}

        {!cancelled && (
          <ResidenceRating
            order={stop.order}
            initialRating={stop.clientRating}
            collectionToken={collectionToken}
            dict={dict}
            compact
          />
        )}
       </div>
      </div>

      {/* ── Fotografía a página ── */}
      <div
        className={cn(
          "relative min-h-0 order-1",
          flipped ? "md:order-1" : "md:order-2",
        )}
      >
        {stop.coverPhotoUrl ? (
          <button
            type="button"
            onClick={onOpenGallery}
            aria-haspopup="dialog"
            className="vc-focus group block h-full w-full overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stop.coverPhotoUrl}
              alt={stop.title}
              className="h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.025]"
            />
            {extraPhotos.length > 0 && (
              <span className="pointer-events-none absolute bottom-6 border border-cream-50/45 bg-ink/55 px-4 py-2.5 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50 backdrop-blur-sm ltr:right-6 rtl:left-6">
                {dict.viewPhotos(extraPhotos.length)}
              </span>
            )}
          </button>
        ) : (
          <div className="h-full w-full bg-ink/5" />
        )}
      </div>
    </div>
  );
}

// ─── Asesor ──────────────────────────────────────────────────────────────────

function BookAdvisorPage({
  collection,
  dict,
}: {
  collection: PublicViewingCollection;
  dict: CollectionDictionary;
}) {
  const agent = collection.agent;
  const initials = agent.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full justify-center overflow-y-auto px-10 py-10">
      <div className="my-auto flex max-w-md flex-col items-center text-center">
        <Label tone="gold">{dict.atYourService}</Label>
        <h2 className="mt-3 font-serif text-[32px] font-normal vc-tight text-ink lg:text-[40px]">
          {dict.yourAdvisor}
        </h2>
        <Ornament className="mt-7" />

        <span className="mt-10 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-ink font-serif text-[26px] text-cream-50">
          {agent.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <p className="mt-5 font-serif text-[25px] text-ink">{agent.displayName}</p>
        <p className="mt-2 font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40">
          Benjamín Cousiño · Private Client Services
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-2.5">
          {agent.whatsappUrl && (
            <a
              href={agent.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vc-focus border border-ink bg-ink px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:bg-ink-soft"
            >
              WhatsApp
            </a>
          )}
          {agent.phone && (
            <a
              href={`tel:${agent.phone.replace(/\s/g, "")}`}
              className="vc-focus border border-ink/25 px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-ink transition-colors duration-500 hover:border-ink"
            >
              {dict.call}
            </a>
          )}
          {agent.email && (
            <a
              href={`mailto:${agent.email}`}
              className="vc-focus border border-ink/25 px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-ink transition-colors duration-500 hover:border-ink"
            >
              {dict.write}
            </a>
          )}
        </div>

        <AgentContactData agent={agent} />
      </div>
    </div>
  );
}

// ─── Colofón ─────────────────────────────────────────────────────────────────

function BookColophonPage({
  collection,
  dict,
}: {
  collection: PublicViewingCollection;
  dict: CollectionDictionary;
}) {
  return (
    <div className="flex h-full justify-center overflow-y-auto bg-ink px-10 py-10 text-center text-cream-50">
      <div className="my-auto max-w-xl">
        <Image
          src="/logo.png"
          alt="Benjamín Cousiño Propiedades"
          width={130}
          height={Math.round(130 * (519 / 3282))}
          className="mx-auto h-auto w-[120px] select-none brightness-0 invert"
        />
        <p className="mt-3 font-display text-[9px] font-medium uppercase vc-tracked text-cream-50/50">
          Private Client Services
        </p>
        <Ornament tone="cream" className="mt-9" />
        <p className="mt-9 font-serif text-[20px] italic leading-relaxed text-cream-50/90 lg:text-[23px]">
          {dict.preparedExclusively(collection.clientFirstName)}
        </p>
        {collection.dateLabel && (
          <p className="mt-4 font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50/45">
            Madrid · {collection.dateLabel}
          </p>
        )}
        <p className="mt-12 font-sans text-[11px] leading-relaxed text-cream-50/30">
          {dict.validUntil(collection.expiresAtLabel)}
        </p>
      </div>
    </div>
  );
}
