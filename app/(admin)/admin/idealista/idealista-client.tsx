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
  property_type: string | null;
  address_street: string | null;
  address_number: string | null;
  address_postal_code: string | null;
  address_city: string | null;
  address_block: string | null;
  address_door: string | null;
  address_visibility: string | null;
  square_meters: number | null;
  built_square_meters: number | null;
  floor: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  condition: string | null;
  price: number | null;
  total_rental_price: number | null;
  rental_type: string | null;
  max_tenants: number | null;
  pets_allowed: boolean;
  children_recommended: boolean;
  equipment_type: string | null;
  windows_location: string | null;
  has_elevator: boolean;
  orientation_north: boolean;
  orientation_south: boolean;
  orientation_east: boolean;
  orientation_west: boolean;
  has_terrace: boolean;
  has_balcony: boolean;
  has_parking: boolean;
  has_storage: boolean;
  has_pool: boolean;
  has_garden: boolean;
  has_wardrobes: boolean;
  has_ac: boolean;
  is_penthouse: boolean;
  is_studio: boolean;
  is_duplex: boolean;
  energy_class: string | null;
  energy_performance: number | null;
  emission_rating: string | null;
  emission_value: number | null;
  contact_id: string | null;
  notes: string | null;
  photo_ids: string[];
  video_ids: string[];
  plan_ids: string[];
  idealista_property_id: string | null;
  idealista_state: string | null;
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
    const initialData: Partial<IdealistaListing> | undefined = selectedListing
      ? {
          propertyId: selectedProperty.id,
          propertyType: selectedListing.property_type ?? "flat",
          addressStreet: selectedListing.address_street ?? "",
          addressNumber: selectedListing.address_number ?? "",
          addressPostalCode: selectedListing.address_postal_code ?? "",
          addressCity: selectedListing.address_city ?? "",
          addressBlock: selectedListing.address_block ?? "",
          addressDoor: selectedListing.address_door ?? "",
          addressVisibility: (selectedListing.address_visibility ?? "exact") as "exact" | "street" | "hidden",
          squareMeters: selectedListing.square_meters || 0,
          builtSquareMeters: selectedListing.built_square_meters || 0,
          floor: selectedListing.floor ?? "",
          bedrooms: selectedListing.bedrooms ?? 0,
          bathrooms: selectedListing.bathrooms ?? 0,
          condition: (selectedListing.condition ?? "good") as "good" | "to-reform" | "needs-reform" | "new",
          price: selectedListing.price || 0,
          totalRentalPrice: selectedListing.total_rental_price || 0,
          rentalType: (selectedListing.rental_type ?? "residential") as "residential" | "temporary",
          maxTenants: selectedListing.max_tenants ?? 0,
          petsAllowed: selectedListing.pets_allowed,
          childrenRecommended: selectedListing.children_recommended,
          equipmentType: (selectedListing.equipment_type ?? "unknown") as "furnished" | "kitchen-only" | "empty" | "unknown",
          windowsLocation: (selectedListing.windows_location ?? "exterior") as "interior" | "exterior",
          hasElevator: selectedListing.has_elevator,
          orientationNorth: selectedListing.orientation_north,
          orientationSouth: selectedListing.orientation_south,
          orientationEast: selectedListing.orientation_east,
          orientationWest: selectedListing.orientation_west,
          hasTerrace: selectedListing.has_terrace,
          hasBalcony: selectedListing.has_balcony,
          hasParking: selectedListing.has_parking,
          hasStorage: selectedListing.has_storage,
          hasPool: selectedListing.has_pool,
          hasGarden: selectedListing.has_garden,
          hasWardrobes: selectedListing.has_wardrobes,
          hasAC: selectedListing.has_ac,
          isPenthouse: selectedListing.is_penthouse,
          isStudio: selectedListing.is_studio,
          isDuplex: selectedListing.is_duplex,
          energyClass: selectedListing.energy_class ?? "",
          energyPerformance: selectedListing.energy_performance ?? 0,
          emissionRating: selectedListing.emission_rating ?? "",
          emissionValue: selectedListing.emission_value ?? 0,
          contactId: selectedListing.contact_id ?? "",
          notes: selectedListing.notes ?? "",
          photos: selectedListing.photo_ids ?? [],
          videos: selectedListing.video_ids ?? [],
          plans: selectedListing.plan_ids ?? [],
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
                        {listing.bedrooms != null && listing.bedrooms > 0 && (
                          <span>{listing.bedrooms} hab.</span>
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
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        {listing.idealista_state === "published" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            ✓ Publicado en Idealista
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            Borrador — subida manual pendiente
                          </span>
                        )}
                        <span className="text-[10px] text-ink/35">
                          {new Date(listing.updated_at).toLocaleDateString("es-ES")}
                        </span>
                      </div>
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
