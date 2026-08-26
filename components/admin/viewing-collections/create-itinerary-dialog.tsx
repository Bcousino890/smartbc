"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { createItinerary } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import type { SelectionWithProperty } from "@/lib/viewing-collections/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import {
  COLLECTION_LANGUAGES,
  LANGUAGE_LABELS,
  TRANSLATION_REVIEW_REQUIRED,
} from "@/lib/viewing-collections/i18n";

export function CreateItineraryDialog({
  clientId,
  country,
  selections,
  onClose,
}: {
  clientId: string;
  country: Country;
  selections: SelectionWithProperty[];
  onClose: () => void;
}) {
  const router = useRouter();
  const config = getCountryConfig(country);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("14:00");
  const [language, setLanguage] = useState("es");
  const [chosen, setChosen] = useState<Set<string>>(
    new Set(selections.map((s) => s.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createItinerary(clientId, {
        title: title.trim() || null,
        scheduledDate: date || null,
        windowStart: from || null,
        windowEnd: to || null,
        language,
        selectionIds: Array.from(chosen),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  };

  const totalMinutes = chosen.size * 30;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-6 w-full max-w-lg overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="crm-section-title text-ink">
            Crear itinerario
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/45 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium text-ink/55">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Visitas del lunes"
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
            <span className="mt-1 block text-xs text-ink/45">
              El cliente verá este título en la colección.
            </span>
          </label>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <label className="col-span-3 sm:col-span-1">
              <span className="text-xs font-medium text-ink/55">Fecha</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-ink/55">Desde</span>
              <input
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-ink/55">Hasta</span>
              <input
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-ink/45">
            Puedes dejar la fecha vacía y guardarlo como borrador.
          </p>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink/55">
              Idioma de la colección
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            >
              {COLLECTION_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                  {TRANSLATION_REVIEW_REQUIRED.has(l) ? " · sin revisar" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink/45">
              El enlace que verá el cliente se sirve en este idioma.
              {TRANSLATION_REVIEW_REQUIRED.has(language as never) && (
                <span className="mt-0.5 block text-amber-700">
                  Traducción sin revisar por un hablante nativo: el diseño y el
                  sentido de lectura sí están comprobados, la lengua no.
                </span>
              )}
            </span>
          </label>

          <div className="mt-5">
            <p className="text-xs font-medium text-ink/55">
              Propiedades ({chosen.size})
            </p>
            <ul className="mt-2 space-y-1.5">
              {selections.map((sel) => (
                <li key={sel.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink/5 bg-white/65 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={chosen.has(sel.id)}
                      onChange={() =>
                        setChosen((prev) => {
                          const next = new Set(prev);
                          if (next.has(sel.id)) next.delete(sel.id);
                          else next.add(sel.id);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 accent-[#a8814a]"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">
                      {sel.property.title}
                    </span>
                    <span className="shrink-0 text-xs text-ink/55">
                      {config.formatPrice(
                        sel.property.price,
                        sel.property.currency,
                        sel.property.operation,
                      )}
                    </span>
                    {sel.badges.inItinerary && (
                      <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        Ya en otro
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {chosen.size > 0 && (
              <p className="mt-2 text-xs text-ink/50">
                ~{Math.floor(totalMinutes / 60)} h {totalMinutes % 60} min
                estimadas
              </p>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gold/15 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink/70 transition hover:border-ink/30"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            Crear borrador
          </button>
        </div>
      </div>
    </div>
  );
}
