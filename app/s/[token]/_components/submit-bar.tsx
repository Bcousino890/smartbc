"use client";

// Barra inferior: resumen, estado de guardado y envío.
//
// El estado de guardado NUNCA miente: si la escritura falló dice que falló y
// ofrece reintentar, en vez de enseñar un "Guardado" tranquilizador. En una
// conexión de móvil que va y viene, esa diferencia es la confianza entera.

import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";
import { cn } from "@/lib/utils";

export function SubmitBar({
  t,
  must,
  maybe,
  no,
  submitted,
  submittedAtLabel,
  dirtySinceSubmit,
  saveState,
  onRetry,
  onSubmit,
  disabled,
}: {
  t: ShortlistDictionary;
  must: number;
  maybe: number;
  no: number;
  submitted: boolean;
  submittedAtLabel: string | null;
  dirtySinceSubmit: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onRetry: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/50">
            {t.submitSummary(must, maybe, no)}
          </p>
          <p className="mt-0.5 h-[14px] font-sans text-[10.5px] text-ink/45" aria-live="polite">
            {saveState === "saving" && `${t.saving}…`}
            {saveState === "saved" && t.saved}
            {saveState === "error" && (
              <span className="text-rose-700">
                {t.saveFailed} ·{" "}
                <button
                  type="button"
                  onClick={onRetry}
                  className="vc-focus underline underline-offset-2"
                >
                  {t.retry}
                </button>
              </span>
            )}
            {saveState === "idle" && submitted && submittedAtLabel && (
              <span>
                {t.submitted(submittedAtLabel)}
                {dirtySinceSubmit ? ` · ${t.changesAfterSubmit}` : ""}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className={cn(
            "vc-focus shrink-0 rounded-full px-6 py-3 font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition disabled:opacity-40",
            dirtySinceSubmit || !submitted
              ? "bg-ink hover:bg-ink-soft"
              : "bg-ink/45",
          )}
        >
          {submitted && !dirtySinceSubmit ? t.submittedAgain : t.submit}
        </button>
      </div>
    </div>
  );
}
