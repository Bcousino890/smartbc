"use client";

// Crear la selección privada: qué propiedades entran y en qué idioma.
// Por defecto entran todas las de la selección de BCP, que es el caso normal
// después de una reunión.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { SelectionWithProperty } from "@/lib/viewing-collections/types";
import {
  COLLECTION_LANGUAGES,
  LANGUAGE_LABELS,
  TRANSLATION_REVIEW_REQUIRED,
} from "@/lib/viewing-collections/i18n";
import type { Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { createClientShortlist } from "@/app/[country]/(admin)/admin/clientes/shortlist-actions";

export function CreateShortlistDialog({
  clientId,
  country: _country,
  selections,
  onClose,
}: {
  clientId: string;
  country: Country;
  selections: SelectionWithProperty[];
  onClose: () => void;
}) {
  const router = useRouter();
  const available = selections.filter((s) => !s.property.isArchived);
  const [chosen, setChosen] = useState<Set<string>>(
    new Set(available.map((s) => s.property_id)),
  );
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = () => {
    setError(null);
    start(async () => {
      const res = await createClientShortlist(clientId, {
        propertyIds: [...chosen],
        language,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-8 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="font-serif text-lg font-semibold text-ink">
            Selección privada para el cliente
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink/45 transition hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[12px] leading-relaxed text-ink/60">
            El cliente podrá elegir cuáles quiere visitar, ordenarlas, descartar
            y comentar. Tu selección no se toca: lo que decida queda aparte.
          </p>

          <label className="mt-4 block">
            <span className="text-[11px] font-medium text-ink/55">
              Idioma de la selección
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
          </label>

          <p className="mt-4 text-[11px] font-medium text-ink/55">
            Propiedades ({chosen.size} de {available.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {available.map((s) => (
              <li key={s.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition",
                    chosen.has(s.property_id)
                      ? "border-gold/45 bg-gold/5"
                      : "border-ink/10 bg-white",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(s.property_id)}
                    onChange={() => toggle(s.property_id)}
                    className="h-3.5 w-3.5 accent-[#a8814a]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink">
                      {s.property.title}
                    </span>
                    <span className="text-[11px] text-ink/45">
                      {s.property.bcReference ?? "—"} · {s.property.zone}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gold/15 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-[12px] font-medium text-ink/55 transition hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={create}
            disabled={pending || chosen.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            Crear y obtener enlace
          </button>
        </div>
      </div>
    </div>
  );
}
