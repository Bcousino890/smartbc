"use client";

import { useEffect, useState } from "react";
import { Heart, MapPin, Home, Zap, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import type { SuggestedProperty } from "@/lib/db/queries/suggested-properties";
import { cn } from "@/lib/utils";

export function SuggestedPropertiesGrid({
  clientId,
}: {
  clientId: string;
}) {
  const [properties, setProperties] = useState<SuggestedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await fetch(
          `/api/cliente/suggested-properties`,
        );
        if (!response.ok) {
          throw new Error("Error fetching properties");
        }
        const data = await response.json();
        setProperties(data.properties || []);

        // Fetch favorites
        const favResponse = await fetch("/api/cliente/favorites");
        if (favResponse.ok) {
          const favData = await favResponse.json();
          setFavorites(new Set(favData.favorites || []));
        }
      } catch (err) {
        console.error("Error:", err);
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, []);

  const toggleFavorite = async (propertyId: string) => {
    try {
      const isFavorite = favorites.has(propertyId);
      const response = await fetch("/api/cliente/favorites", {
        method: isFavorite ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });

      if (response.ok) {
        const newFavorites = new Set(favorites);
        if (isFavorite) {
          newFavorites.delete(propertyId);
        } else {
          newFavorites.add(propertyId);
        }
        setFavorites(newFavorites);
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-gold mr-2" />
        <span className="text-ink/60">Buscando propiedades para ti...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-6">
        <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-700">Error al cargar propiedades</h3>
          <p className="text-sm text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="rounded-lg border border-gold/20 bg-cream-100/40 p-8 text-center">
        <p className="text-ink/60 mb-2">No encontramos propiedades que coincidan.</p>
        <p className="text-sm text-ink/45">
          Prueba a ajustar tus preferencias de búsqueda para ver más opciones.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          property={property}
          isFavorite={favorites.has(property.id)}
          onToggleFavorite={() => toggleFavorite(property.id)}
        />
      ))}
    </div>
  );
}

function PropertyCard({
  property,
  isFavorite,
  onToggleFavorite,
}: {
  property: SuggestedProperty;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const mainPhoto = property.photos[0];

  return (
    <div className="group rounded-xl border border-gold/15 bg-white overflow-hidden hover:border-gold/40 transition hover:shadow-lg">
      {/* Image */}
      <Link href={`/p/${property.slug}`}>
        <div className="relative h-48 bg-ink/5 overflow-hidden">
          {mainPhoto && (
            <img
              src={mainPhoto}
              alt={property.title}
              className="w-full h-full object-cover group-hover:scale-105 transition"
            />
          )}

          {/* Match badge */}
          <div className="absolute top-3 right-3 bg-gold text-white px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1">
            <Zap size={12} className="fill-current" />
            {property.matchScore}% match
          </div>
        </div>
      </Link>

      <div className="p-4">
        {/* Title & favorite button */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link href={`/p/${property.slug}`}>
            <h3 className="font-semibold text-ink group-hover:text-gold transition line-clamp-2">
              {property.title}
            </h3>
          </Link>
          <button
            onClick={onToggleFavorite}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-ink/15 bg-white hover:border-red-300 hover:bg-red-50 transition shrink-0 mt-0.5"
          >
            <Heart
              size={16}
              className={cn(
                "transition",
                isFavorite ? "fill-red-500 text-red-500" : "text-ink/40",
              )}
            />
          </button>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-ink/60 mb-3">
          <MapPin size={14} className="shrink-0" />
          <span>{property.zone}</span>
        </div>

        {/* Key info */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <div className="flex items-center gap-1 bg-cream-100 px-2 py-1 rounded-lg text-ink/70">
            <Home size={13} />
            <span>{property.bedrooms}h</span>
          </div>
          <div className="text-ink/60">•</div>
          <div className="text-ink/70">{property.squareMeters}m²</div>
          <div className="text-ink/60">•</div>
          <div className="text-ink/70">{property.bathrooms}b</div>
        </div>

        {/* Price */}
        <div className="mb-3 pb-3 border-b border-ink/10">
          <div className="text-xl font-bold text-ink">
            {property.price.toLocaleString("es-ES")}€
          </div>
          {property.stayType === "corta" && (
            <div className="text-xs text-ink/60 mt-1">/ mes</div>
          )}
        </div>

        {/* Match reasons */}
        {property.matchReasons.length > 0 && (
          <div className="space-y-1 mb-4">
            {property.matchReasons.map((reason, i) => (
              <div key={i} className="text-xs text-ink/60 flex items-start gap-2">
                <span className="text-gold mt-1">✓</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/p/${property.slug}`}
            className="rounded-lg border border-gold text-gold px-3 py-2 text-sm font-medium text-center hover:bg-gold/10 transition"
          >
            Ver detalles
          </Link>
          <button
            className="rounded-lg bg-gold text-white px-3 py-2 text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50"
          >
            Solicitar visita
          </button>
        </div>
      </div>
    </div>
  );
}
