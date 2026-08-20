"use client";

// Crear la selección privada: qué entra y en qué idioma.
//
// Dos fuentes, y las dos hacen falta:
//   · Propiedades seleccionadas — fichas nuestras, con su fotografía.
//   · Enlaces de portales — lo que se vio con el cliente en Idealista y aún no
//     es ficha. Media lista se cae en la primera llamada, así que obligar a
//     importarlas antes sería trabajo tirado.
//
// Por defecto entra TODO lo seleccionado y NADA de los enlaces: los anuncios
// suelen estar sin llamar, y mandarlos es una decisión, no el caso normal.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { SelectionWithProperty } from "@/lib/viewing-collections/types";
import type { PortalLinkWithNotes } from "@/lib/portal-links/types";
import { LINK_STATUS_LABEL } from "@/lib/portal-links/types";
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
  portalLinks = [],
  onClose,
}: {
  clientId: string;
  country: Country;
  selections: SelectionWithProperty[];
  /** Anuncios de portal del cliente que todavía no son ficha. */
  portalLinks?: PortalLinkWithNotes[];
  onClose: () => void;
}) {
  const router = useRouter();
  const available = selections.filter((s) => !s.property.isArchived);
  // Los ya convertidos en ficha se excluyen: entrarían dos veces, una por cada
  // lista, y el cliente vería la misma casa repetida.
  const availableLinks = portalLinks.filter((l) => !l.property_id);
  const [chosen, setChosen] = useState<Set<string>>(
    new Set(available.map((s) => s.property_id)),
  );
  const [chosenLinks, setChosenLinks] = useState<Set<string>>(new Set());
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

  const toggleLink = (id: string) =>
    setChosenLinks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = chosen.size + chosenLinks.size;

  const create = () => {
    setError(null);
    start(async () => {
      const res = await createClientShortlist(clientId, {
        propertyIds: [...chosen],
        portalLinkIds: [...chosenLinks],
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
          <h3 className="crm-section-title text-ink">
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
          <p className="text-xs leading-relaxed text-ink/60">
            El cliente podrá elegir cuáles quiere visitar, ordenarlas, descartar
            y comentar. Tu selección no se toca: lo que decida queda aparte.
          </p>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-ink/55">
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

          <p className="mt-4 text-xs font-medium text-ink/55">
            Propiedades seleccionadas ({chosen.size} de {available.length})
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
                    <span className="block truncate text-xs text-ink">
                      {s.property.title}
                    </span>
                    <span className="text-xs text-ink/45">
                      {s.property.bcReference ?? "—"} · {s.property.zone}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {availableLinks.length > 0 && (
            <>
              <div className="mt-5 flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-ink/55">
                  Enlaces de portales ({chosenLinks.size} de{" "}
                  {availableLinks.length})
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setChosenLinks(
                      chosenLinks.size === availableLinks.length
                        ? new Set()
                        : new Set(availableLinks.map((l) => l.id)),
                    )
                  }
                  className="text-xs font-medium text-gold-dark transition hover:text-gold"
                >
                  {chosenLinks.size === availableLinks.length
                    ? "Ninguno"
                    : "Todos"}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink/45">
                Anuncios que todavía no son ficha. El cliente los verá con la
                foto del portal y sin galería, hasta que les crees ficha.
              </p>
              <ul className="mt-2 space-y-1.5">
                {availableLinks.map((l) => (
                  <li key={l.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition",
                        chosenLinks.has(l.id)
                          ? "border-gold/45 bg-gold/5"
                          : "border-ink/10 bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={chosenLinks.has(l.id)}
                        onChange={() => toggleLink(l.id)}
                        className="h-3.5 w-3.5 accent-[#a8814a]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-ink">
                          {l.title ?? l.url.replace(/^https?:\/\//, "")}
                        </span>
                        <span className="text-xs text-ink/45">
                          {LINK_STATUS_LABEL[l.status]}
                          {l.zone ? ` · ${l.zone}` : ""}
                          {l.price_label ? ` · ${l.price_label}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gold/15 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xs font-medium text-ink/55 transition hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={create}
            disabled={pending || total === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            Crear y obtener enlace
          </button>
        </div>
      </div>
    </div>
  );
}
