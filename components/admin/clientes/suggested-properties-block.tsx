"use client";

import { useEffect, useState } from "react";
import { Star, Home, DollarSign, Users, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import type { SuggestedProperty } from "@/lib/db/queries/suggested-properties";
import { cn } from "@/lib/utils";

export function SuggestedPropertiesBlock({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch(
          `/api/admin/clientes/${clientId}/suggested-properties`,
        );
        if (!response.ok) {
          throw new Error("Error fetching suggestions");
        }
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error("Error fetching suggestions:", err);
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [clientId]);

  if (loading) {
    return (
      <section className="mt-5 border-t border-gold/15 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55 mb-3">
          Propiedades sugeridas
        </p>
        <div className="flex items-center justify-center h-24 text-ink/45">
          <Loader2 size={16} className="animate-spin mr-2" />
          <span className="text-sm">Buscando propiedades...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-5 border-t border-gold/15 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55 mb-3">
          Propiedades sugeridas
        </p>
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 border-t border-gold/15 pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/55 mb-3">
        Propiedades sugeridas ({suggestions.length})
      </p>

      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-gold/15 bg-cream-100/40 p-4 text-center">
          <p className="text-xs text-ink/55">
            No hay propiedades disponibles que coincidan con las preferencias de{" "}
            <strong>{clientName}</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {suggestions.map((prop) => (
            <PropertyCard key={prop.id} property={prop} />
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyCard({ property }: { property: SuggestedProperty }) {
  const mainPhoto = property.photos[0];

  return (
    <Link href={`/admin/propiedades/${property.slug}`}>
      <div className="group rounded-lg border border-gold/15 bg-white/50 p-3 transition hover:border-gold/40 hover:bg-white/80 cursor-pointer">
        <div className="flex gap-3">
          {/* Thumbnail */}
          {mainPhoto && (
            <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-ink/5">
              <img
                src={mainPhoto}
                alt={property.title}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-ink truncate group-hover:text-gold transition">
                  {property.title}
                </h4>
                <p className="text-[10px] text-ink/55 mt-0.5">{property.zone}</p>
              </div>

              {/* Match score */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] font-semibold text-amber-700">
                  {property.matchScore}%
                </span>
                <Star
                  size={12}
                  className="fill-amber-400 text-amber-400"
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-ink/60">
              <span className="flex items-center gap-1">
                <Home size={10} />
                {property.bedrooms}h
              </span>
              <span className="flex items-center gap-1">
                <Users size={10} />
                {property.bathrooms}b
              </span>
              <span className="text-ink/50">•</span>
              <span>{property.squareMeters}m²</span>
            </div>

            {/* Price & Reasons */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1">
                <DollarSign size={12} className="text-gold" />
                <span className="text-xs font-semibold text-ink">
                  {property.price.toLocaleString("es-ES")}€
                </span>
              </div>

              {property.matchReasons.length > 0 && (
                <div className="text-[9px] text-ink/55 text-right line-clamp-1">
                  {property.matchReasons[0]}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
