"use client";

// ============================================================================
// Añadir paradas a un itinerario YA CREADO.
//
// Antes solo se podían quitar: si el cliente pedía ver una propiedad más había
// que rehacer el itinerario entero y se perdían horas, confirmaciones y
// SmartLinks. Dos vías, ambas al mismo sitio:
//
//   · De su selección — lo que ya se había elegido para este cliente y todavía
//     no está en este itinerario. Un clic.
//   · Del catálogo — una propiedad nueva. `addStop` crea la fila de selección
//     de forma transparente (source='manual'), así que el agente no tiene que
//     pasar por el bloque de selección primero.
//
// La parada entra al final y SIN hora: el itinerario publicado no cambia de
// forma para el cliente hasta que se le pone hora y se republica.
// ============================================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import { addStop } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import type { SelectionWithProperty } from "@/lib/viewing-collections/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  title: string;
  reference: string | null;
  price: number | null;
  operation: string | null;
  city: string | null;
};

function priceLabel(
  config: ReturnType<typeof getCountryConfig>,
  price: number | null,
  currency: string | null,
  operation: string | null,
): string {
  if (!price) return "—";
  return config.formatPrice(price, currency, operation === "rent" ? "rent" : "sale");
}

export function AddStopDialog({
  itineraryId,
  country,
  selections,
  /** Propiedades ya presentes en el itinerario: no se ofrecen dos veces. */
  alreadyInItinerary,
  onClose,
}: {
  itineraryId: string;
  country: Country;
  selections: SelectionWithProperty[];
  alreadyInItinerary: Set<string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const config = getCountryConfig(country);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available = selections.filter(
    (s) => !alreadyInItinerary.has(s.property_id) && !added.has(s.property_id),
  );

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/properties/search?q=${encodeURIComponent(q)}&country=${country}`,
        );
        const json = await res.json();
        setResults(json.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, country]);

  const add = (
    ref: { selectionId: string } | { propertyId: string },
    propertyId: string,
  ) => {
    setError(null);
    startTransition(async () => {
      const res = await addStop(itineraryId, ref);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAdded((prev) => new Set(prev).add(propertyId));
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-8 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="crm-section-title text-ink">
            Añadir propiedad al itinerario
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}

          {/* ── De su selección ── */}
          <p className="crm-label-sm text-ink/45">
            De su selección
          </p>
          {available.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-ink/15 px-3 py-3 text-xs text-ink/45">
              Todas las propiedades de su selección ya están en este itinerario.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {available.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-ink">
                      {s.property.title}
                    </span>
                    <span className="text-xs text-ink/50">
                      {s.property.bcReference ?? "—"} ·{" "}
                      {priceLabel(
                        config,
                        s.property.price,
                        s.property.currency,
                        s.property.operation,
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => add({ selectionId: s.id }, s.property_id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
                  >
                    <Plus size={11} strokeWidth={2} className="text-gold-dark" />
                    Añadir
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Del catálogo ── */}
          <p className="mt-5 crm-label-sm text-ink/45">
            O buscar en el catálogo
          </p>
          <div className="relative mt-2">
            <Search
              size={13}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Referencia, calle, zona…"
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-8 pr-3 text-xs text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            />
          </div>

          {loading && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/45">
              <Loader2 size={11} className="animate-spin" />
              Buscando…
            </p>
          )}

          {results.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {results.map((r) => {
                const inItinerary =
                  alreadyInItinerary.has(r.id) || added.has(r.id);
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-white px-3 py-2",
                      inItinerary && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-ink">
                        {r.title}
                      </span>
                      <span className="text-xs text-ink/50">
                        {r.reference ?? "—"} ·{" "}
                        {priceLabel(config, r.price, null, r.operation)}
                        {r.city ? ` · ${r.city}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending || inItinerary}
                      onClick={() => add({ propertyId: r.id }, r.id)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
                    >
                      <Plus size={11} strokeWidth={2} className="text-gold-dark" />
                      {inItinerary ? "Ya está" : "Añadir"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-gold/15 px-5 py-3">
          <p className="text-xs leading-relaxed text-ink/45">
            La parada entra al final y sin hora. Ponle hora y, si el itinerario
            ya estaba publicado, vuelve a publicar para que el cliente la vea.
          </p>
        </div>
      </div>
    </div>
  );
}
