"use client";

// Nota del cliente sobre una residencia. Hoja inferior en móvil, centrada en
// escritorio. Su texto vive aparte de las notas internas de BCP: son dos voces
// distintas y no deben mezclarse nunca.

import { useEffect, useRef, useState } from "react";
import type { PublicShortlistProperty } from "@/lib/client-shortlist/public-contract";
import type { ShortlistDictionary } from "@/lib/client-shortlist/i18n";

const MAX = 500;

export function NoteSheet({
  t,
  property,
  onSave,
  onCancel,
}: {
  t: ShortlistDictionary;
  property: PublicShortlistProperty;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(property.comment ?? "");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={property.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl border border-ink/10 bg-cream-50 p-5 shadow-2xl sm:rounded-3xl"
      >
        <p className="font-display text-[9.5px] font-medium uppercase vc-tracked text-ink/40">
          {property.zoneLabel}
        </p>
        <h3 className="mt-1 font-serif text-[21px] text-ink">{property.title}</h3>

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX))}
          rows={4}
          placeholder={t.notePlaceholder}
          className="mt-4 w-full resize-none rounded-xl border border-ink/12 bg-white px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
        />
        <p className="mt-1 text-end font-display text-[10px] vc-nums text-ink/30">
          {text.length} / {MAX}
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="vc-focus rounded-full px-4 py-2.5 font-display text-[10px] font-medium uppercase vc-tracked-sm text-ink/50 transition hover:text-ink"
          >
            {t.closeResidence}
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            className="vc-focus rounded-full bg-ink px-5 py-2.5 font-display text-[10px] font-medium uppercase vc-tracked-sm text-cream-50 transition hover:bg-ink-soft"
          >
            {t.saveNote}
          </button>
        </div>
      </div>
    </div>
  );
}
