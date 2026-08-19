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
import { useReorderList } from "@/hooks/use-reorder-list";
import { PrivateGallery } from "@/app/v/[token]/_components/private-gallery";
import { cn } from "@/lib/utils";
import { ShortlistCard } from "./_components/shortlist-card";
import { NoteSheet } from "./_components/note-sheet";
import { AddResidenceSheet } from "./_components/add-residence-sheet";
import { SubmitBar } from "./_components/submit-bar";
import {
  addShortlistProperty,
  setShortlistComment,
  setShortlistDecision,
  setShortlistOrder,
  setShortlistReviewOrder,
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

  /**
   * Mismo mecanismo que las prioritarias, pero para "Por revisar" — ANTES de
   * que el cliente haya marcado nada. Escribe `position`, no `rank`: el rank
   * tiene un CHECK que solo lo permite en 'must_visit'.
   *
   * Es lo que hacía falta para que el orden se pudiera cambiar desde el
   * principio, y no solo después de decidir la primera residencia.
   */
  const applyReviewOrder = useCallback((orderedIds: string[]) => {
    const posById = new Map(orderedIds.map((id, i) => [id, i + 1]));
    setItems((prev) =>
      prev.map((i) =>
        posById.has(i.itemId) ? { ...i, position: posById.get(i.itemId)! } : i,
      ),
    );
  }, []);

  const commitReviewOrder = useCallback(
    (orderedIds: string[]) => {
      const before = itemsRef.current;
      applyReviewOrder(orderedIds);
      track("priority_change", { via: "drag", group: "undecided" });
      void commit(before, () => setShortlistReviewOrder(token, orderedIds));
    },
    [applyReviewOrder, commit, token, track],
  );

  const {
    draggingId: draggingReviewId,
    handleProps: reviewHandleProps,
    itemProps: reviewItemProps,
  } = useReorderList({
    ids: groups.undecided.map((m) => m.itemId),
    onReorder: applyReviewOrder,
    onCommit: commitReviewOrder,
    disabled: isPreview,
  });

  const moveReview = (item: PublicShortlistProperty, dir: -1 | 1) => {
    const before = items;
    const pending = groups.undecided;
    const idx = pending.findIndex((m) => m.itemId === item.itemId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= pending.length) return;

    const reordered = [...pending];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const posById = new Map(reordered.map((m, i) => [m.itemId, i + 1]));
    setItems(
      items.map((i) =>
        posById.has(i.itemId) ? { ...i, position: posById.get(i.itemId)! } : i,
      ),
    );
    track("priority_change", { to: target + 1, group: "undecided" });
    void commit(before, () =>
      setShortlistReviewOrder(token, reordered.map((m) => m.itemId)),
    );
  };

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

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-[100dvh] bg-cream-50 pb-44 sm:pb-40">
      {/* ── Apertura ── */}
      <header className="mx-auto max-w-3xl px-5 pt-10 text-center sm:pt-14">
        <p className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/45">
          Benjamín Cousiño
        </p>
        <p className="mt-1 font-display text-[8.5px] font-medium uppercase vc-tracked-sm text-ink/35">
          {t.privateClientServices}
        </p>

        <h1 className="mt-9 font-serif text-[30px] font-normal vc-tight text-ink sm:text-[40px]">
          {shortlist.clientFirstName}
        </h1>
        <p className="mt-3 font-sans text-[14px] leading-relaxed text-ink/70">
          {t.intro(items.length)}
        </p>
        <p className="mx-auto mt-2 max-w-[46ch] font-sans text-[13px] leading-relaxed text-ink/45">
          {t.invitation}
        </p>

        <Progress done={decided} total={items.length} t={t} />
      </header>

      <main className="mx-auto mt-10 max-w-5xl space-y-14 px-5 sm:px-6">
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-ink/15 px-5 py-10 text-center font-sans text-[13px] text-ink/45">
            {t.emptyState}
          </p>
        )}

        <Group
          title={t.priorityHomes}
          hint={t.priorityHint}
          count={groups.must.length}
          show={groups.must.length > 0}
        >
          {groups.must.map((p, i) => (
            <ShortlistCard
              key={p.itemId}
              property={p}
              t={t}
              rankLabel={String(i + 1).padStart(2, "0")}
              canMoveUp={i > 0}
              canMoveDown={i < groups.must.length - 1}
              onMove={(d) => move(p, d)}
              onDecide={(d) => decide(p, d)}
              onView={() => {
                setGallery(p);
                track("property_view");
              }}
              onNote={() => setNoteFor(p)}
              busy={busyId === p.itemId}
              dragHandleProps={handleProps(p.itemId)}
              isDragging={draggingId === p.itemId}
              itemRef={itemProps(p.itemId).ref}
              itemStyle={itemProps(p.itemId).style}
            />
          ))}
        </Group>

        <Group
          title={t.toReview}
          hint={t.toReviewHint}
          count={groups.undecided.length}
          show={groups.undecided.length > 0}
        >
          {groups.undecided.map((p, i) => (
            <ShortlistCard
              key={p.itemId}
              property={p}
              t={t}
              rankLabel={String(i + 1).padStart(2, "0")}
              canMoveUp={i > 0}
              canMoveDown={i < groups.undecided.length - 1}
              onMove={(d) => moveReview(p, d)}
              onDecide={(d) => decide(p, d)}
              onView={() => {
                setGallery(p);
                track("property_view");
              }}
              onNote={() => setNoteFor(p)}
              busy={busyId === p.itemId}
              dragHandleProps={reviewHandleProps(p.itemId)}
              isDragging={draggingReviewId === p.itemId}
              itemRef={reviewItemProps(p.itemId).ref}
              itemStyle={reviewItemProps(p.itemId).style}
            />
          ))}
        </Group>

        <Group
          title={t.maybeGroup}
          count={groups.maybe.length}
          show={groups.maybe.length > 0}
        >
          {groups.maybe.map((p) => (
            <ShortlistCard
              key={p.itemId}
              property={p}
              t={t}
              onDecide={(d) => decide(p, d)}
              onView={() => {
                setGallery(p);
                track("property_view");
              }}
              onNote={() => setNoteFor(p)}
              busy={busyId === p.itemId}
            />
          ))}
        </Group>

        <Group
          title={t.notForMeGroup}
          count={groups.no.length}
          show={groups.no.length > 0}
          dim
        >
          {groups.no.map((p) => (
            <ShortlistCard
              key={p.itemId}
              property={p}
              t={t}
              onDecide={(d) => decide(p, d)}
              onView={() => {
                setGallery(p);
                track("property_view");
              }}
              onNote={() => setNoteFor(p)}
              busy={busyId === p.itemId}
            />
          ))}
        </Group>

        {!isPreview && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="vc-focus w-full rounded-2xl border border-dashed border-gold/35 bg-gold/5 px-5 py-4 font-display text-[10.5px] font-medium uppercase vc-tracked text-gold-dark transition hover:border-gold/60 hover:bg-gold/10"
          >
            + {t.addResidence}
          </button>
        )}
      </main>

      <SubmitBar
        t={t}
        must={groups.must.length}
        maybe={groups.maybe.length}
        no={groups.no.length}
        submitted={submitted}
        submittedAtLabel={shortlist.submittedAtLabel}
        dirtySinceSubmit={dirtySinceSubmit}
        saveState={save}
        onRetry={() => retry.current?.()}
        onSubmit={send}
        disabled={isPreview || items.length === 0}
      />

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

function Progress({
  done,
  total,
  t,
}: {
  done: number;
  total: number;
  t: ShortlistDictionary;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const pending = total - done;
  return (
    <div className="mx-auto mt-8 max-w-xs">
      <p
        className="font-display text-[10px] font-medium uppercase vc-tracked text-ink/45"
        aria-live="polite"
      >
        {t.reviewed(done, total)}
        {pending > 0 && (
          <span className="ms-2 text-ink/30">· {t.pending(pending)}</span>
        )}
      </p>
      <div
        className="mt-2 h-px w-full bg-ink/10"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-px bg-gold transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  count,
  show,
  dim,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  show: boolean;
  dim?: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section className={cn(dim && "opacity-70")}>
      {/* Cabecera de sección al modo del libro: filete, rótulo espaciado y la
          cifra al otro extremo. Lo que separa un grupo de otro es el aire,
          no una caja. */}
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
      {/* Sin bordes entre residencias: una línea de pelo y mucho aire. */}
      <div className="mt-5 divide-y divide-ink/8">
        {children}
      </div>
    </section>
  );
}
