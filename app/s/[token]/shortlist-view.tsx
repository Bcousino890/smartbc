"use client";

// ============================================================================
// Private Client Shortlist · la superficie del cliente.
//
// No es otro Private Book. El libro es una publicación que se lee; esto es un
// tablero que se usa: el cliente mueve residencias entre tres grupos, las
// ordena, escribe notas y las manda.
//
// ── Cómo se guarda ──────────────────────────────────────────────────────────
// Optimista: la tarjeta se mueve en el momento y la escritura va detrás. Si
// el servidor dice que no, se DESHACE el cambio en pantalla y se avisa — nunca
// se enseña "Guardado" sobre algo que no se guardó. Es la diferencia entre una
// conexión de móvil que va y viene y perder el trabajo de media hora.
//
// El servidor devuelve una `revision` que sube con cada escritura. Si vuelve
// una revisión anterior a la que ya teníamos, es que otra pestaña iba por
// delante: se recarga en vez de pisarla.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PublicClientShortlist,
  PublicShortlistProperty,
} from "@/lib/client-shortlist/public-contract";
import {
  getShortlistDictionary,
  type ShortlistDictionary,
} from "@/lib/client-shortlist/i18n";
import { isRtl } from "@/lib/viewing-collections/i18n";
import type { ShortlistDecision } from "@/lib/client-shortlist/types";
import { useAnalytics } from "@/hooks/use-analytics";
import { useFlipLayout } from "@/hooks/use-flip-layout";
import { useReorderList } from "@/hooks/use-reorder-list";
import { PrivateGallery } from "@/app/v/[token]/_components/private-gallery";
import { cn } from "@/lib/utils";
import { ShortlistNav, type ShortlistMode } from "./_components/shortlist-nav";
import { ReviewStage } from "./_components/review-stage";
import { PriorityRow } from "./_components/priority-row";
import { NoteSheet } from "./_components/note-sheet";
import { AddResidenceSheet } from "./_components/add-residence-sheet";
import { SubmitBar } from "./_components/submit-bar";
import {
  addShortlistProperty,
  setShortlistComment,
  setShortlistDecision,
  setShortlistOrder,
  submitShortlist,
} from "./actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ShortlistView({
  shortlist,
  token,
}: {
  shortlist: PublicClientShortlist;
  /** Vacío en la previsualización del agente: ni escribe ni instrumenta. */
  token: string;
}) {
  const router = useRouter();
  const t = getShortlistDictionary(shortlist.language);
  const rtl = isRtl(shortlist.language);
  const isPreview = !token;

  const [items, setItems] = useState(shortlist.properties);
  // Espejo en ref: `commitOrder` necesita el estado actual para poder
  // deshacer si el envío falla, y no puede depender de `items` sin recrearse
  // en cada pulsación (el arrastre lo llama con el dedo aún en la pantalla).
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [revision, setRevision] = useState(shortlist.revision);
  const [save, setSave] = useState<SaveState>("idle");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<PublicShortlistProperty | null>(null);
  const [noteFor, setNoteFor] = useState<PublicShortlistProperty | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [submitted, setSubmitted] = useState(shortlist.submitted);
  const [dirtySinceSubmit, setDirtySinceSubmit] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<null | (() => void)>(null);

  // El servidor manda: si llega contenido nuevo (otra pestaña, recarga), se
  // adopta. Sin esto, volver horas después mostraría lo de antes.
  useEffect(() => {
    setItems(shortlist.properties);
    setRevision(shortlist.revision);
    setSubmitted(shortlist.submitted);
  }, [shortlist]);

  const tracker = useAnalytics({
    pageType: "client_shortlist",
    shortlistToken: token || undefined,
    disabled: isPreview,
  });
  const track = useCallback(
    (event: string, data?: unknown) => {
      if (isPreview) return;
      tracker.current?.trackEvent?.(event, data);
    },
    [tracker, isPreview],
  );

  useEffect(() => {
    if (isPreview) return;
    track("shortlist_open", { total: shortlist.properties.length });
  }, [track, isPreview, shortlist.properties.length]);

  const flash = useCallback((state: SaveState) => {
    setSave(state);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (state === "saved") {
      savedTimer.current = setTimeout(() => setSave("idle"), 1600);
    }
  }, []);

  /**
   * Aplica el cambio en pantalla, lo manda, y lo DESHACE si falla.
   * `before` es la foto exacta de antes: restaurarla es la garantía de que la
   * pantalla nunca miente sobre lo que hay guardado.
   */
  const commit = useCallback(
    async (before: PublicShortlistProperty[], run: () => Promise<{ ok: boolean; revision?: number; error?: string }>) => {
      if (isPreview) return;
      flash("saving");
      const res = await run();
      if (!res.ok) {
        setItems(before);
        retry.current = () => void commit(before, run);
        flash("error");
        return;
      }
      retry.current = null;
      if (typeof res.revision === "number") {
        if (res.revision < revision) {
          // Otra pestaña iba por delante: no se pisa, se relee.
          router.refresh();
          return;
        }
        setRevision(res.revision);
      }
      if (submitted) setDirtySinceSubmit(true);
      flash("saved");
    },
    [isPreview, flash, revision, router, submitted],
  );

  // ── Grupos ────────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const by = (d: ShortlistDecision) => items.filter((i) => i.decision === d);
    return {
      // Las prioritarias SE ORDENAN POR RANGO, no por el orden del array. Al
      // mover una, el cambio optimista toca el rango pero no reordena la
      // lista: sin este sort, el número cambiaba y la tarjeta se quedaba
      // donde estaba hasta recargar.
      must: by("must_visit").sort(
        (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9),
      ),
      // Mismo motivo que "must": sin este sort, mover una en "Por revisar"
      // tocaría `position` pero la tarjeta no se movería hasta recargar.
      undecided: by("undecided").sort((a, b) => a.position - b.position),
      maybe: by("maybe"),
      no: by("not_for_me"),
    };
  }, [items]);

  const decided = items.length - groups.undecided.length;

  // ── Acciones ──────────────────────────────────────────────────────────────
  const decide = (item: PublicShortlistProperty, decision: ShortlistDecision) => {
    const before = items;
    setBusyId(item.itemId);
    // Recolocación optimista, incluido el renumerado de prioridades.
    const next = items.map((i) =>
      i.itemId === item.itemId ? { ...i, decision, rank: null } : i,
    );
    let n = 0;
    for (const i of next) {
      if (i.decision === "must_visit") {
        i.rank = i.itemId === item.itemId && decision === "must_visit" ? 0 : (i.rank ?? 0);
      }
    }
    const musts = next
      .filter((i) => i.decision === "must_visit")
      .sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
    for (const m of musts) m.rank = ++n;
    setItems(next);

    track(
      decision === "not_for_me"
        ? "property_discarded"
        : decision === "undecided"
          ? "property_restored"
          : "decision_change",
      { decision },
    );
    void commit(before, () =>
      setShortlistDecision(token, item.itemId, decision),
    ).finally(() => setBusyId(null));
  };

  /**
   * Reordenado por arrastre. Comparte destino con las flechas —
   * `setShortlistOrder` recibe la lista completa ya ordenada— así que las dos
   * vías no pueden divergir. Las flechas siguen siendo imprescindibles: son la
   * alternativa accesible y la que funciona con lector de pantalla.
   */
  const applyOrder = useCallback(
    (orderedIds: string[]) => {
      const rankById = new Map(orderedIds.map((id, i) => [id, i + 1]));
      setItems((prev) =>
        prev.map((i) =>
          rankById.has(i.itemId) ? { ...i, rank: rankById.get(i.itemId)! } : i,
        ),
      );
    },
    [],
  );

  const commitOrder = useCallback(
    (orderedIds: string[]) => {
      const before = itemsRef.current;
      applyOrder(orderedIds);
      track("priority_change", { via: "drag" });
      void commit(before, () => setShortlistOrder(token, orderedIds));
    },
    [applyOrder, commit, token, track],
  );

  const { draggingId, handleProps, itemProps } = useReorderList({
    ids: groups.must.map((m) => m.itemId),
    onReorder: applyOrder,
    onCommit: commitOrder,
    disabled: isPreview,
  });

  // La disposición cambia cuando cambia una decisión, un rango o el número de
  // residencias. Es lo que dispara el viaje de la tarjeta a su nueva sección.
  const layoutSignature = useMemo(
    () => items.map((i) => `${i.itemId}:${i.decision}:${i.rank ?? 0}`).join("|"),
    [items],
  );
  useFlipLayout(layoutSignature, { disabled: Boolean(draggingId) });


  const move = (item: PublicShortlistProperty, dir: -1 | 1) => {
    const before = items;
    const musts = groups.must;
    const idx = musts.findIndex((m) => m.itemId === item.itemId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= musts.length) return;

    const reordered = [...musts];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const rankById = new Map(reordered.map((m, i) => [m.itemId, i + 1]));
    setItems(
      items.map((i) =>
        rankById.has(i.itemId) ? { ...i, rank: rankById.get(i.itemId)! } : i,
      ),
    );
    track("priority_change", { to: target + 1 });
    void commit(before, () =>
      setShortlistOrder(token, reordered.map((m) => m.itemId)),
    );
  };

  // NOTA: el reordenado de las pendientes desapareció con el modo «una
  // residencia cada vez» — ya no hay una lista que colocar, se recorren en
  // orden. La acción de servidor (setShortlistReviewOrder) se conserva por si
  // vuelve a hacer falta.

  const saveNote = (item: PublicShortlistProperty, comment: string) => {
    const before = items;
    setItems(
      items.map((i) =>
        i.itemId === item.itemId ? { ...i, comment: comment.trim() || null } : i,
      ),
    );
    setNoteFor(null);
    if (comment.trim()) track("comment_added");
    void commit(before, () => setShortlistComment(token, item.itemId, comment));
  };

  const addProperty = async (propertyId: string) => {
    if (isPreview) return;
    flash("saving");
    const res = await addShortlistProperty(token, propertyId);
    if (!res.ok) {
      flash("error");
      return;
    }
    track("property_added");
    flash("saved");
    router.refresh();
  };

  const send = async () => {
    if (isPreview) return;
    flash("saving");
    const res = await submitShortlist(token);
    if (!res.ok) {
      flash("error");
      return;
    }
    setSubmitted(true);
    setDirtySinceSubmit(false);
    setRevision(res.revision);
    track("shortlist_submitted", {
      must: groups.must.length,
      maybe: groups.maybe.length,
      no: groups.no.length,
    });
    flash("saved");
    router.refresh();
  };

  const galleryDict = {
    closeGallery: t.closeResidence,
    galleryAll: t.allPhotographs,
    previous: t.previousPhoto,
    next: t.nextPhoto,
  };

  // ── Modo activo ────────────────────────────────────────────────────────────
  // Decidir y ordenar son tareas distintas: mezclarlas en una sola página
  // obliga a recorrer diecinueve láminas. Se abre en «revisar» mientras quede
  // algo pendiente, y en «prioridades» si ya está todo decidido.
  const [mode, setMode] = useState<ShortlistMode>(() =>
    shortlist.properties.some((p) => p.decision === "undecided")
      ? "review"
      : "priorities",
  );
  /**
   * Qué residencia se está revisando. Índice sobre la lista completa: se
   * recorren TODAS para poder volver atrás y cambiar de idea.
   *
   * Pero se ABRE en la primera que falte por decidir. Arrancar en la 1 de 19
   * dejaba al cliente en una que ya había resuelto, con la barra diciéndole
   * que le faltaban tres y sin pista de dónde estaban.
   */
  const [cursor, setCursor] = useState(() => {
    const ordered = [...shortlist.properties].sort(
      (a, b) => a.position - b.position || a.itemId.localeCompare(b.itemId),
    );
    const first = ordered.findIndex((p) => p.decision === "undecided");
    return first >= 0 ? first : 0;
  });
  const [confirmPending, setConfirmPending] = useState(false);

  // Orden de recorrido en «revisar»: el mismo que ve el cliente en la lista.
  const reviewOrder = useMemo(
    () =>
      [...items].sort(
        (a, b) => a.position - b.position || a.itemId.localeCompare(b.itemId),
      ),
    [items],
  );
  const current = reviewOrder[Math.min(cursor, reviewOrder.length - 1)];

  // property_view cuando la residencia pasa a ser LA ACTIVA de verdad, una
  // sola vez por residencia. Ni por animaciones, ni por cambios de tamaño.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (mode !== "review" || !current) return;
    if (seen.current.has(current.itemId)) return;
    seen.current.add(current.itemId);
    track("property_view", { origin: current.origin });
  }, [mode, current, track]);

  /** La siguiente sin decidir a partir de una posición. */
  const nextPendingFrom = useCallback(
    (from: number) => {
      for (let i = from; i < reviewOrder.length; i++) {
        if (reviewOrder[i].decision === "undecided") return i;
      }
      for (let i = 0; i < from; i++) {
        if (reviewOrder[i].decision === "undecided") return i;
      }
      return -1;
    },
    [reviewOrder],
  );

  const decideAndAdvance = (
    item: PublicShortlistProperty,
    decision: ShortlistDecision,
  ) => {
    decide(item, decision);
    // Se pasa sola a la siguiente pendiente: el cliente no tiene que pulsar
    // «siguiente» después de cada decisión. Si no queda ninguna, se queda
    // donde está y la barra de arriba ya marca «todas revisadas».
    const next = nextPendingFrom(cursor + 1);
    if (next >= 0) window.setTimeout(() => setCursor(next), 220);
  };

  const goToPending = () => {
    const next = nextPendingFrom(0);
    if (next >= 0) {
      setCursor(next);
      setMode("review");
    }
  };

  /** El cliente ya está trabajando: ha decidido algo o ha pasado de página. */
  const started =
    cursor > 0 || items.some((i) => i.decision !== "undecided");

  const counts = {
    must: groups.must.length,
    maybe: groups.maybe.length,
    no: groups.no.length,
  };

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-[100dvh] bg-cream-50 pb-44 sm:pb-40">
      {/* ── Apertura ──
          Se presenta entera una sola vez. En cuanto el cliente empieza a
          decidir se encoge: la bienvenida ya la ha leído, y lo que necesita
          es que la residencia quepa en la pantalla. */}
      <header
        className={cn(
          "mx-auto max-w-3xl px-5 text-center transition-all duration-700 ease-out",
          started ? "pt-5 sm:pt-6" : "pt-9 sm:pt-12",
        )}
      >
        <p className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/45">
          Benjamín Cousiño
        </p>
        <p className="mt-1 font-display text-[8.5px] font-medium uppercase vc-tracked-sm text-ink/35">
          {t.privateClientServices}
        </p>
        <h1
          className={cn(
            "font-serif font-normal vc-tight text-ink transition-all duration-700 ease-out",
            started
              ? "mt-2 text-[19px] sm:text-[22px]"
              : "mt-7 text-[30px] sm:text-[40px]",
          )}
        >
          {shortlist.clientFirstName}
        </h1>
        {!started && (
          <>
            <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink/70">
              {t.intro(items.length)}
            </p>
            <p className="mx-auto mt-2 max-w-[46ch] font-sans text-[13px] leading-relaxed text-ink/45">
              {t.invitation}
            </p>
          </>
        )}
      </header>

      <div className={cn(started ? "mt-4" : "mt-8")}>
        <ShortlistNav
          t={t}
          mode={mode}
          onMode={(m) => {
            // Volver a "revisar" es volver a LO QUE FALTA, no a la primera de
            // la lista: es lo que promete el contador de la barra.
            if (m === "review") {
              const next = nextPendingFrom(0);
              if (next >= 0) setCursor(next);
            }
            setMode(m);
          }}
          pending={groups.undecided.length}
          total={items.length}
          counts={counts}
        />
      </div>

      {items.length === 0 && (
        <p className="mx-auto mt-10 max-w-3xl px-5 text-center font-sans text-[13px] text-ink/45">
          {t.emptyState}
        </p>
      )}

      {/* ── REVISAR ── */}
      {mode === "review" && current && (
        <ReviewStage
          key={current.itemId}
          property={current}
          index={cursor}
          total={reviewOrder.length}
          t={t}
          rtl={rtl}
          busy={busyId === current.itemId}
          onDecide={(d) => decideAndAdvance(current, d)}
          onPrev={() => setCursor((c) => Math.max(0, c - 1))}
          onNext={() =>
            setCursor((c) => Math.min(reviewOrder.length - 1, c + 1))
          }
          onView={() => setGallery(current)}
          onNote={() => setNoteFor(current)}
          hasPrev={cursor > 0}
          hasNext={cursor < reviewOrder.length - 1}
        />
      )}

      {/* ── PRIORIDADES ── */}
      {mode === "priorities" && (
        <main className="mx-auto mt-8 max-w-5xl space-y-12 px-5 sm:px-6">
          <section>
            <SectionHead
              title={t.priorityHomes}
              hint={t.priorityHint}
              count={counts.must}
            />
            {counts.must === 0 ? (
              <p className="mt-4 font-sans text-[12.5px] text-ink/40">
                {t.emptyState}
              </p>
            ) : (
              <div className="mt-3 divide-y divide-ink/8">
                {groups.must.map((p, i) => (
                  <PriorityRow
                    key={p.itemId}
                    property={p}
                    t={t}
                    rankLabel={String(i + 1).padStart(2, "0")}
                    canMoveUp={i > 0}
                    canMoveDown={i < groups.must.length - 1}
                    onMove={(d) => move(p, d)}
                    onView={() => setGallery(p)}
                    onNote={() => setNoteFor(p)}
                    onDecide={(d) => decide(p, d)}
                    busy={busyId === p.itemId}
                    dragHandleProps={handleProps(p.itemId)}
                    isDragging={draggingId === p.itemId}
                    {...itemProps(p.itemId)}
                  />
                ))}
              </div>
            )}
          </section>

          <CollapsibleSection
            title={t.maybeGroup}
            count={counts.maybe}
            defaultOpen={counts.maybe <= 3}
          >
            {groups.maybe.map((p) => (
              <PriorityRow
                key={p.itemId}
                property={p}
                t={t}
                compact
                onView={() => setGallery(p)}
                onNote={() => setNoteFor(p)}
                onDecide={(d) => decide(p, d)}
                busy={busyId === p.itemId}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={t.notForMeGroup}
            count={counts.no}
            defaultOpen={false}
          >
            {groups.no.map((p) => (
              <PriorityRow
                key={p.itemId}
                property={p}
                t={t}
                compact
                onView={() => setGallery(p)}
                onNote={() => setNoteFor(p)}
                onDecide={(d) => decide(p, d)}
                busy={busyId === p.itemId}
              />
            ))}
          </CollapsibleSection>

          {!isPreview && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="vc-focus w-full border border-dashed border-gold/35 bg-gold/5 px-5 py-4 font-display text-[10.5px] font-medium uppercase vc-tracked text-gold-dark transition hover:border-gold/60 hover:bg-gold/10"
            >
              + {t.addResidence}
            </button>
          )}
        </main>
      )}

      {/* ── RESUMEN ── */}
      {mode === "summary" && (
        <main className="mx-auto mt-10 max-w-3xl px-5 sm:px-6">
          <h2 className="font-serif text-[26px] text-ink sm:text-[32px]">
            {t.summaryTitle}
          </h2>
          <p className="mt-2 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/45">
            {t.submitSummary(counts.must, counts.maybe, counts.no)}
          </p>

          <div className="mt-8 space-y-8">
            <SummaryList
              title={t.priorityHomes}
              items={groups.must}
              numbered
            />
            <SummaryList title={t.maybeGroup} items={groups.maybe} />
            <SummaryList title={t.notForMeGroup} items={groups.no} dim />
          </div>

          {groups.undecided.length > 0 && (
            <p className="mt-8 border-s-2 border-gold/40 ps-3 font-sans text-[12.5px] leading-relaxed text-ink/55">
              {t.undecidedWarning(groups.undecided.length)}{" "}
              <button
                type="button"
                onClick={goToPending}
                className="vc-focus vc-underline font-medium text-gold-dark"
              >
                {t.continueReviewing}
              </button>
            </p>
          )}
        </main>
      )}

      <SubmitBar
        t={t}
        must={counts.must}
        maybe={counts.maybe}
        no={counts.no}
        submitted={submitted}
        submittedAtLabel={shortlist.submittedAtLabel}
        dirtySinceSubmit={dirtySinceSubmit}
        saveState={save}
        onRetry={() => retry.current?.()}
        onSubmit={() => {
          // Con residencias sin revisar se pregunta, no se bloquea: puede que
          // el cliente ya sepa que esas no le interesan.
          if (groups.undecided.length > 0 && !confirmPending) {
            setMode("summary");
            setConfirmPending(true);
            return;
          }
          void send();
        }}
        disabled={isPreview || items.length === 0}
      />

      {/* Confirmación de envío con pendientes */}
      {confirmPending && groups.undecided.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setConfirmPending(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl border border-ink/10 bg-cream-50 p-6 shadow-2xl sm:rounded-3xl"
          >
            <p className="font-serif text-[19px] leading-snug text-ink">
              {t.undecidedWarning(groups.undecided.length)}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmPending(false);
                  goToPending();
                }}
                className="vc-focus px-5 py-3 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/60 transition hover:text-ink"
              >
                {t.continueReviewing}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmPending(false);
                  void send();
                }}
                className="vc-focus bg-ink px-6 py-3 font-display text-[10px] font-medium uppercase vc-tracked text-cream-50 transition hover:bg-ink-soft"
              >
                {t.sendAnyway}
              </button>
            </div>
          </div>
        </div>
      )}

      {gallery && (
        <PrivateGallery
          title={gallery.title}
          photos={gallery.photoUrls}
          dict={galleryDict}
          rtl={rtl}
          startIndex={0}
          onClose={() => setGallery(null)}
        />
      )}

      {noteFor && (
        <NoteSheet
          t={t}
          property={noteFor}
          onCancel={() => setNoteFor(null)}
          onSave={(text) => saveNote(noteFor, text)}
        />
      )}

      {addOpen && (
        <AddResidenceSheet
          t={t}
          token={token}
          onClose={() => setAddOpen(false)}
          onAdd={addProperty}
        />
      )}
    </div>
  );
}

/** Cabecera de sección: filete, rótulo espaciado y la cifra al otro extremo. */
function SectionHead({
  title,
  hint,
  count,
}: {
  title: string;
  hint?: string;
  count: number;
}) {
  return (
    <>
      <span aria-hidden className="block h-px w-full bg-ink/12" />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/50">
          {title}
        </h2>
        <span className="font-display text-[10px] vc-nums text-ink/25">
          {String(count).padStart(2, "0")}
        </span>
      </div>
      {hint && (
        <p className="mt-1.5 max-w-[46ch] font-sans text-[11px] leading-relaxed text-ink/35">
          {hint}
        </p>
      )}
    </>
  );
}

/** Alternativas y descartadas: plegadas cuando son muchas. */
function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <section>
      <span aria-hidden className="block h-px w-full bg-ink/12" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="vc-focus mt-3 flex w-full items-baseline justify-between gap-3 py-1 text-start"
      >
        <span className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/50">
          {title}
          <span aria-hidden className="ms-2 text-ink/25">
            {open ? "−" : "+"}
          </span>
        </span>
        <span className="font-display text-[10px] vc-nums text-ink/25">
          {String(count).padStart(2, "0")}
        </span>
      </button>
      {open && <div className="mt-2 divide-y divide-ink/8">{children}</div>}
    </section>
  );
}

/** Resumen: solo texto. Aquí ya no hacen falta fotografías grandes. */
function SummaryList({
  title,
  items,
  numbered,
  dim,
}: {
  title: string;
  items: PublicShortlistProperty[];
  numbered?: boolean;
  dim?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn(dim && "opacity-60")}>
      <p className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/45">
        {title}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((p, i) => (
          <li key={p.itemId} className="flex items-baseline gap-3">
            {numbered && (
              <span className="w-6 shrink-0 font-serif text-[15px] vc-nums text-gold-dark">
                {String(i + 1).padStart(2, "0")}
              </span>
            )}
            <span className="min-w-0">
              <span className="font-serif text-[17px] text-ink">{p.title}</span>
              <span className="ms-2 font-sans text-[11.5px] text-ink/40">
                {p.zoneLabel}
              </span>
              {p.comment && (
                <span className="mt-0.5 block font-sans text-[11.5px] italic text-ink/45">
                  {p.comment}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


