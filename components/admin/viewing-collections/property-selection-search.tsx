"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addPropertyToSelection } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import { getCountryConfig, type Country } from "@/lib/country-config";

type Result = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  bc_reference: string | null;
  price: number;
  operation: "rent" | "sale";
};

/** Buscador manual sobre el endpoint existente /api/admin/properties/search. */
export function PropertySelectionSearch({
  clientId,
  country,
  excludePropertyIds,
  onClose,
}: {
  clientId: string;
  country: Country;
  excludePropertyIds: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const config = getCountryConfig(country);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
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

  const excluded = new Set(excludePropertyIds);

  const add = (propertyId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await addPropertyToSelection(clientId, propertyId, "search");
      if (res.ok) {
        setAdded((prev) => new Set(prev).add(propertyId));
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-8 w-full max-w-lg overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="font-serif text-lg font-semibold text-ink">
            Buscar propiedad
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

        <div className="border-b border-gold/15 px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 focus-within:border-gold/55">
            <Search size={14} strokeWidth={1.75} className="text-gold-dark" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Título, dirección o referencia BC…"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
            />
            {loading && (
              <Loader2 size={14} className="animate-spin text-ink/35" />
            )}
          </div>
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </p>
        )}

        <ul className="max-h-[50vh] overflow-y-auto p-3">
          {results.length === 0 && !loading && (
            <li className="px-2 py-8 text-center text-[12px] text-ink/45">
              {q ? "Sin resultados." : "Escribe para buscar."}
            </li>
          )}
          {results.map((r) => {
            const isIn = excluded.has(r.id) || added.has(r.id);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-white/70"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {r.title}
                  </p>
                  <p className="truncate text-[11px] text-ink/50">
                    {r.bc_reference ? `${r.bc_reference} · ` : ""}
                    {config.formatPrice(r.price, null, r.operation)}
                  </p>
                </div>
                {isIn ? (
                  <span className="shrink-0 text-[11px] font-medium text-emerald-700">
                    En selección
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => add(r.id)}
                    disabled={pending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink disabled:opacity-50"
                  >
                    <Plus size={11} strokeWidth={2} className="text-gold-dark" />
                    Añadir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
