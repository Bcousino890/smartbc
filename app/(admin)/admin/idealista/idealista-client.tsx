"use client";

import { ArrowLeft, Edit2, Trash2, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { IdealistaForm, type IdealistaListing } from "../publicacion/idealista-form";
import { cn } from "@/lib/utils";

type Property = {
  id: string;
  slug: string;
  title: string;
  zone: string | null;
  price: number | null;
  operation: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  status: string | null;
  cover_photo_url: string | null;
  bc_reference: string | null;
  created_at: string;
};

type DbIdealistaListing = {
  id: string;
  property_id: string;
  square_meters: number | null;
  built_square_meters: number | null;
  price: number | null;
  total_rental_price: number | null;
  has_elevator: boolean;
  rental_type: string | null;
  floor: string | null;
  condition: string | null;
  energy_class: string | null;
  equipment: string | null;
  photo_ids: string[];
  video_ids: string[];
  plan_ids: string[];
  created_at: string;
  updated_at: string;
};

export function IdealistaClient({
  properties,
  listings,
}: {
  properties: Property[];
  listings: DbIdealistaListing[];
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId),
    [selectedPropertyId, properties]
  );

  const selectedListing = useMemo(
    () => listings.find((l) => l.property_id === selectedPropertyId),
    [selectedPropertyId, listings]
  );

  const filteredProperties = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return properties.filter(
      (p) =>
        p.title.toLowerCase().includes(query) ||
        p.zone?.toLowerCase().includes(query) ||
        p.bc_reference?.toLowerCase().includes(query)
    );
  }, [properties, searchTerm]);

  const handleSave = async (data: IdealistaListing) => {
    setError(null);
    setIsSaving(true);

    try {
      const res = await fetch(
        "/api/admin/publicacion/save-idealista-listing",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al guardar");
      }

      setSelectedPropertyId(null);
      setEditingId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error desconocido al guardar"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (selectedPropertyId && selectedProperty) {
    const initialData: Partial<IdealistaListing> = selectedListing
      ? {
          propertyId: selectedProperty.id,
          squareMeters: selectedListing.square_meters || 0,
          builtSquareMeters: selectedListing.built_square_meters || 0,
          price: selectedListing.price || 0,
          totalRentalPrice: selectedListing.total_rental_price || 0,
          hasElevator: selectedListing.has_elevator,
          rentalType: (selectedListing.rental_type || "residential") as
            | "residential"
            | "temporary",
          floor: selectedListing.floor || "",
          condition: (selectedListing.condition || "good") as
            | "good"
            | "to-reform"
            | "needs-reform",
          energyClass: selectedListing.energy_class || "A",
          equipment: selectedListing.equipment || "",
          photos: [],
          videos: [],
          plans: [],
        }
      : undefined;

    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedPropertyId(null);
            setEditingId(null);
          }}
          className="flex items-center gap-2 text-sm font-medium text-ink/60 hover:text-ink transition"
        >
          <ArrowLeft size={16} />
          Volver a la lista
        </button>

        {isSaving && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <Loader2 size={14} className="animate-spin" />
            Guardando...
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        <IdealistaForm
          propertyId={selectedProperty.id}
          propertyTitle={selectedProperty.title}
          initialData={initialData}
          onSave={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Propiedades disponibles */}
      <div className="lg:col-span-1">
        <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] md:p-6">
          <h3 className="mb-4 font-serif text-lg font-semibold text-ink">
            Propiedades
          </h3>

          <div className="mb-4">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            />
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {filteredProperties.length === 0 ? (
              <p className="text-center py-8 text-sm text-ink/50">
                {searchTerm ? "No hay propiedades que coincidan" : "No hay propiedades"}
              </p>
            ) : (
              filteredProperties.map((property) => {
                const hasListing = listings.some(
                  (l) => l.property_id === property.id
                );

                return (
                  <button
                    key={property.id}
                    onClick={() => {
                      setSelectedPropertyId(property.id);
                      setEditingId(null);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg transition",
                      "hover:bg-gold/10 focus:outline-none focus:bg-gold/10",
                      hasListing
                        ? "bg-emerald-50/50 border border-emerald-200/50"
                        : "border border-ink/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm text-ink">
                          {property.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink/55">
                          {property.zone || "Sin zona"}
                        </p>
                        {property.price && (
                          <p className="mt-1 text-xs font-semibold text-gold">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            }).format(property.price)}
                          </p>
                        )}
                      </div>
                      {hasListing && (
                        <span className="mt-1 inline-block px-2 py-1 rounded bg-emerald-100 text-xs font-medium text-emerald-700 whitespace-nowrap">
                          ✓ Preparado
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Lista de propiedades preparadas */}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] md:p-6">
          <h3 className="mb-4 font-serif text-lg font-semibold text-ink">
            Propiedades Preparadas para Idealista
          </h3>

          {listings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-ink/55 mb-2">
                No hay propiedades preparadas aún
              </p>
              <p className="text-xs text-ink/40">
                Selecciona una propiedad de la izquierda para comenzar
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {listings.map((listing) => {
                const property = properties.find(
                  (p) => p.id === listing.property_id
                );

                if (!property) return null;

                return (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gold/20 bg-white/50 px-4 py-3 hover:bg-white/80 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm text-ink">
                        {property.title}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink/55">
                        {listing.square_meters && (
                          <span>{listing.square_meters} m²</span>
                        )}
                        {listing.price && (
                          <span>
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              maximumFractionDigits: 0,
                            }).format(listing.price)}
                          </span>
                        )}
                        {listing.photo_ids.length > 0 && (
                          <span>📷 {listing.photo_ids.length} foto(s)</span>
                        )}
                        {listing.video_ids.length > 0 && (
                          <span>🎥 {listing.video_ids.length} video(s)</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink/40">
                        Actualizado:{" "}
                        {new Date(listing.updated_at).toLocaleDateString(
                          "es-ES"
                        )}
                      </p>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setSelectedPropertyId(listing.property_id)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-ink/10 px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-ink/15 transition"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
