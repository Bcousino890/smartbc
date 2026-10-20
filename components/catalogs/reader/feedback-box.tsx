"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Label } from "@/app/v/[token]/_components/editorial";
import {
  FEEDBACK_COMMENT_MAX,
  FEEDBACK_RATINGS,
  feedbackDirty,
  feedbackErrorText,
  starsLabel,
  type FeedbackError,
  type SavedFeedback,
} from "@/lib/catalogs/feedback-rules";
import { cn } from "@/lib/utils";

// «Tu opinión» (0218, DC12–DC14): solo en la pantalla 2 y solo con un enlace
// personal. El navegador manda la clave pública de la vivienda, las estrellas
// y el comentario; quién opina lo decide el servidor por el token. «Guardado»
// solo aparece cuando la ruta confirma la escritura.

const KNOWN = ["link_invalid", "not_in_catalog", "invalid_rating", "comment_too_long"] as const;

type Msg = { kind: "ok" | "error"; text: string } | null;

function savedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);
}

export function FeedbackBox({
  token,
  itemKey,
  itemTitle,
  saved,
  onSaved,
}: {
  token: string;
  itemKey: string;
  itemTitle: string;
  saved: SavedFeedback | null;
  onSaved: (key: string, value: SavedFeedback) => void;
}) {
  const uid = useId();
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [closed, setClosed] = useState<FeedbackError | null>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);

  // El aviso se ve aunque el formulario quede al pie del panel desplazable.
  useEffect(() => {
    if (msg) msgRef.current?.scrollIntoView({ block: "nearest" });
  }, [msg]);

  // Si llega otra versión guardada (otra pestaña, recarga) y no hay nada a
  // medio escribir, se muestra la guardada.
  useEffect(() => {
    if (!saved) return;
    setRating((r) => (r === null ? saved.rating : r));
    setComment((c) => (c === "" ? saved.comment ?? "" : c));
  }, [saved]);

  const length = [...comment].length;
  const tooLong = length > FEEDBACK_COMMENT_MAX;
  const dirty = feedbackDirty(saved, rating, comment);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || closed) return;
    if (rating === null) {
      setMsg({ kind: "error", text: feedbackErrorText("invalid_rating") });
      return;
    }
    if (tooLong) {
      setMsg({ kind: "error", text: feedbackErrorText("comment_too_long") });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/seleccion/${encodeURIComponent(token)}/opiniones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: itemKey, rating, comment }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok === true) {
        const value: SavedFeedback = { rating, comment: comment.trim() ? comment.trim() : null, updatedAt: String(data.updatedAt ?? new Date().toISOString()) };
        onSaved(itemKey, value);
        setComment(value.comment ?? "");
        setMsg({ kind: "ok", text: data.status === "unchanged" ? "Ya estaba guardada así." : "Guardado. Tu asesor lo verá." });
        return;
      }
      const code = typeof data?.error === "string" ? (data.error as string) : null;
      if (code === "link_invalid" || code === "not_in_catalog") setClosed(code);
      const text =
        code === "rate_limited" ? feedbackErrorText("rate_limited")
        : code && (KNOWN as readonly string[]).includes(code) ? feedbackErrorText(code as FeedbackError)
        : feedbackErrorText("backend");
      setMsg({ kind: "error", text });
    } catch {
      setMsg({ kind: "error", text: feedbackErrorText("network") });
    } finally {
      setBusy(false);
    }
  }

  const groupLabel = `${uid}-stars`;
  return (
    <form onSubmit={submit} className="mt-8 border-t border-ink/10 pt-6" data-testid="feedback-box" aria-labelledby={`${uid}-title`} noValidate>
      <Label tone="gold">
        <span id={`${uid}-title`}>Tu opinión</span>
      </Label>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-ink/60">
        Valora esta vivienda para tu asesor. Puedes cambiarlo cuando quieras.
      </p>
      <fieldset className="mt-4" disabled={busy || !!closed}>
        <legend id={groupLabel} className="sr-only">
          Valoración de {itemTitle}
        </legend>
        <div className="flex items-center gap-1" role="radiogroup" aria-labelledby={groupLabel} data-testid="feedback-stars">
          {FEEDBACK_RATINGS.map((n) => {
            const on = rating !== null && n <= rating;
            return (
              <label key={n} className="group relative cursor-pointer">
                <input
                  type="radio"
                  name={`${uid}-rating`}
                  value={n}
                  checked={rating === n}
                  onChange={() => {
                    setRating(n);
                    setMsg(null);
                  }}
                  className="peer sr-only"
                  aria-label={starsLabel(n)}
                  data-testid={`feedback-star-${n}`}
                />
                <span
                  aria-hidden
                  className={cn(
                    "block px-1 font-serif text-[26px] leading-none transition-colors duration-300 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold",
                    on ? "text-gold" : "text-ink/20 group-hover:text-gold/60",
                  )}
                >
                  ★
                </span>
              </label>
            );
          })}
          <span className="ml-2 font-sans text-[12px] text-ink/50" aria-live="polite" data-testid="feedback-rating-label">
            {rating === null ? "Sin valorar" : `${rating} de 5`}
          </span>
        </div>
        <label htmlFor={`${uid}-comment`} className="mt-5 block font-sans text-[12px] text-ink/60">
          Comentario <span className="text-ink/40">(opcional)</span>
        </label>
        <textarea
          id={`${uid}-comment`}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setMsg(null);
          }}
          rows={3}
          aria-invalid={tooLong}
          aria-describedby={`${uid}-count`}
          className="mt-2 w-full resize-y rounded-none border border-ink/15 bg-cream-50/60 px-3 py-2 font-sans text-[14px] leading-relaxed text-ink outline-none transition-colors focus:border-gold aria-[invalid=true]:border-red-500"
          data-testid="feedback-comment"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <span id={`${uid}-count`} className={cn("font-sans text-[11px] vc-nums", tooLong ? "text-red-700" : "text-ink/40")}>
            {length.toLocaleString("es-ES")} / {FEEDBACK_COMMENT_MAX.toLocaleString("es-ES")}
          </span>
          {saved ? (
            <span className="font-sans text-[11px] text-ink/45" data-testid="feedback-saved-at">
              Guardada el {savedLabel(saved.updatedAt)}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={busy || !!closed || rating === null || tooLong || !dirty}
          aria-busy={busy}
          className="vc-focus inline-flex items-center border border-ink/80 bg-ink px-5 py-2.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-300 hover:bg-ink/85 disabled:cursor-not-allowed disabled:border-ink/20 disabled:bg-transparent disabled:text-ink/40"
          data-testid="feedback-save"
        >
          {busy ? "Guardando…" : saved ? "Guardar cambios" : "Guardar opinión"}
        </button>
        {msg ? (
          <p
            ref={msgRef}
            role={msg.kind === "error" ? "alert" : "status"}
            className={cn("min-w-0 font-sans text-[13px]", msg.kind === "error" ? "text-red-800" : "text-emerald-800")}
            data-testid="feedback-message"
          >
            {msg.text}
          </p>
        ) : null}
        </div>
      </fieldset>
    </form>
  );
}
