"use client";

import { ArrowLeft, Edit2, Loader2, Search, Sparkles, Send, Calendar, Trash2, Link2, Wand2, Droplets } from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  property_id: string | null;
  is_inspo: boolean;
  inspo_title: string | null;
  reference_code: string | null;
  property_type: string | null;
  cadastral_reference: string | null;
  address_street: string | null;
  address_number: string | null;
  has_no_number: boolean;
  address_postal_code: string | null;
  address_city: string | null;
  address_block: string | null;
  address_door: string | null;
  building_name: string | null;
  is_last_floor: boolean;
  address_visibility: string | null;
  square_meters: number | null;
  built_square_meters: number | null;
  floor: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  condition: string | null;
  operation: string | null;
  price: number | null;
  community_fees: number | null;
  sale_exception: string | null;
  total_rental_price: number | null;
  rental_type: string | null;
  max_tenants: number | null;
  pets_allowed: boolean;
  children_recommended: boolean;
  equipment_type: string | null;
  windows_location: string | null;
  has_elevator: boolean;
  is_bank_property: boolean;
  heating_type: string | null;
  construction_year: number | null;
  has_adapted_access: boolean;
  has_wheelchair_access: boolean;
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
  external_link: string | null;
  contact_id: string | null;
  notes: string | null;
  photo_ids: string[];
  video_ids: string[];
  plan_ids: string[];
  idealista_property_id: string | null;
  idealista_state: string | null;
  scheduled_publish_at: string | null;
  created_at: string;
  updated_at: string;
};

function listingToInitialData(
  listing: DbIdealistaListing,
  propertyId: string
): Partial<IdealistaListing> {
  return {
    // listingId: id de la fila. Necesario para que al editar (sobre todo inspos)
    // el guardado ACTUALICE en vez de insertar un duplicado.
    listingId: listing.id,
    propertyId,
    isInspo: listing.is_inspo,
    inspoTitle: listing.inspo_title ?? "",
    referenceCode: listing.reference_code ?? "",
    propertyType: listing.property_type ?? "flat",
    cadastralReference: listing.cadastral_reference ?? "",
    addressStreet: listing.address_street ?? "",
    addressNumber: listing.address_number ?? "",
    hasNoNumber: listing.has_no_number,
    addressPostalCode: listing.address_postal_code ?? "",
    addressCity: listing.address_city ?? "",
    addressBlock: listing.address_block ?? "",
    addressDoor: listing.address_door ?? "",
    buildingName: listing.building_name ?? "",
    isLastFloor: listing.is_last_floor,
    addressVisibility: (listing.address_visibility ?? "exact") as
      | "exact"
      | "street"
      | "hidden",
    squareMeters: listing.square_meters ?? 0,
    builtSquareMeters: listing.built_square_meters ?? 0,
    floor: listing.floor ?? "",
    bedrooms: listing.bedrooms ?? 0,
    bathrooms: listing.bathrooms ?? 0,
    condition: (listing.condition ?? "good") as
      | "good"
      | "to-reform"
      | "needs-reform"
      | "new",
    operation: (listing.operation ?? "rent") as "sale" | "rent",
    price: listing.price ?? 0,
    communityFees: listing.community_fees ?? 0,
    saleException: (listing.sale_exception ?? "none") as
      | "none"
      | "illegally-occupied"
      | "rented-with-tenants"
      | "bare-ownership",
    totalRentalPrice: listing.total_rental_price ?? 0,
    rentalType: (listing.rental_type ?? "residential") as
      | "residential"
      | "temporary",
    maxTenants: listing.max_tenants ?? 0,
    petsAllowed: listing.pets_allowed,
    childrenRecommended: listing.children_recommended,
    equipmentType: (listing.equipment_type ?? "unknown") as
      | "furnished"
      | "kitchen-only"
      | "empty"
      | "unknown",
    windowsLocation: (listing.windows_location ?? "exterior") as
      | "interior"
      | "exterior",
    hasElevator: listing.has_elevator,
    isBankProperty: listing.is_bank_property,
    heatingType: (listing.heating_type ?? "unknown") as
      | "individual"
      | "centralized"
      | "none"
      | "unknown",
    constructionYear: listing.construction_year ?? 0,
    hasAdaptedAccess: listing.has_adapted_access,
    hasWheelchairAccess: listing.has_wheelchair_access,
    orientationNorth: listing.orientation_north,
    orientationSouth: listing.orientation_south,
    orientationEast: listing.orientation_east,
    orientationWest: listing.orientation_west,
    hasTerrace: listing.has_terrace,
    hasBalcony: listing.has_balcony,
    hasParking: listing.has_parking,
    hasStorage: listing.has_storage,
    hasPool: listing.has_pool,
    hasGarden: listing.has_garden,
    hasWardrobes: listing.has_wardrobes,
    hasAC: listing.has_ac,
    isPenthouse: listing.is_penthouse,
    isStudio: listing.is_studio,
    isDuplex: listing.is_duplex,
    energyClass: listing.energy_class ?? "",
    energyPerformance: listing.energy_performance ?? 0,
    emissionRating: listing.emission_rating ?? "",
    emissionValue: listing.emission_value ?? 0,
    externalLink: listing.external_link ?? "",
    contactId: listing.contact_id ?? "",
    notes: listing.notes ?? "",
    photos: listing.photo_ids ?? [],
    videos: listing.video_ids ?? [],
    plans: listing.plan_ids ?? [],
    scheduledPublishAt: listing.scheduled_publish_at ?? null,
  };
}

export function IdealistaClient({
  properties,
  listings,
}: {
  properties: Property[];
  listings: DbIdealistaListing[];
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isInspoMode, setIsInspoMode] = useState(false);
  const [editingInspoId, setEditingInspoId] = useState<string | null>(null);
  // Datos precargados al "sembrar" una inspo (desde link o desde propiedad).
  // Cuando existe, el formulario se abre relleno para revisar antes de guardar.
  const [seedData, setSeedData] = useState<Partial<IdealistaListing> | null>(null);
  const [seedUrl, setSeedUrl] = useState("");
  // Qué siembra está cargando: "link" o el id de la propiedad. null = ninguna.
  const [seeding, setSeeding] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const router = useRouter();

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId),
    [selectedPropertyId, properties]
  );

  const selectedListing = useMemo(
    // Solo para propiedades reales seleccionadas. Sin el guard, al crear una inspo
    // nueva (selectedPropertyId = null) coincidía con la primera inspo existente
    // (property_id = null) y abría esa para editar en vez de una en blanco.
    () =>
      selectedPropertyId
        ? listings.find((l) => !l.is_inspo && l.property_id === selectedPropertyId)
        : undefined,
    [selectedPropertyId, listings]
  );

  const inspoListing = useMemo(
    () => listings.find((l) => l.id === editingInspoId),
    [editingInspoId, listings]
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

  const inspoListings = useMemo(
    () => listings.filter((l) => l.is_inspo),
    [listings]
  );
  const systemListings = useMemo(
    () => listings.filter((l) => !l.is_inspo),
    [listings]
  );

  function clearForm() {
    setSelectedPropertyId(null);
    setIsInspoMode(false);
    setEditingInspoId(null);
    setSeedData(null);
    setSeedUrl("");
    setSeedError(null);
    setError(null);
  }

  // Siembra una inspo desde un link externo: extrae datos + re-aloja fotos
  // limpias, y abre el formulario relleno para revisar antes de guardar.
  const handleSeedFromLink = async () => {
    const url = seedUrl.trim();
    if (!url || seeding) return;
    setSeedError(null);
    setSeeding("link");
    try {
      const res = await fetch("/api/admin/idealista/inspo-from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSeedError(json.error ?? "No se pudo leer el anuncio");
        return;
      }
      setSeedData(json.data as Partial<IdealistaListing>);
      setIsInspoMode(true);
    } catch {
      setSeedError("Error de red al leer el anuncio");
    } finally {
      setSeeding(null);
    }
  };

  // Siembra una inspo a partir de una propiedad ya existente en el sistema.
  const handleSeedFromProperty = async (propertyId: string) => {
    if (seeding) return;
    setSeedError(null);
    setSeeding(propertyId);
    try {
      const res = await fetch("/api/admin/idealista/inspo-from-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSeedError(json.error ?? "No se pudo preparar la inspo");
        return;
      }
      setSeedData(json.data as Partial<IdealistaListing>);
      setIsInspoMode(true);
    } catch {
      setSeedError("Error de red al preparar la inspo");
    } finally {
      setSeeding(null);
    }
  };

  const handleSave = async (data: IdealistaListing): Promise<string | undefined> => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/publicacion/save-idealista-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al guardar");
      }
      const { id } = await res.json();
      clearForm();
      // Refresca los datos del server component para que la nueva ficha aparezca
      // en "Fichas guardadas" sin recargar la página a mano.
      router.refresh();
      return id as string | undefined;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al guardar");
      return undefined;
    } finally {
      setIsSaving(false);
    }
  };

  // Abre la ficha en idealista.com con los datos precargados — la extensión
  // de Chrome "SmartBC → Idealista Autopublish" detecta el parámetro ?smartbc=
  // y rellena el formulario automáticamente en el navegador del usuario
  // (evita el bloqueo de Cloudflare que sufre la automatización desde el VPS).
  const handlePublish = async (listingId: string) => {
    setPublishingId(listingId);
    try {
      const res = await fetch("/api/admin/idealista/publish-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPublishResults((prev) => ({ ...prev, [listingId]: { ok: false, msg: data.error ?? "Error al generar el enlace" } }));
        return;
      }
      window.open(data.url, "_blank");
      setPublishResults((prev) => ({ ...prev, [listingId]: { ok: true, msg: "Abierto en Idealista — revisa la pestaña nueva" } }));
    } catch {
      setPublishResults((prev) => ({ ...prev, [listingId]: { ok: false, msg: "Error de red al generar el enlace" } }));
    } finally {
      setPublishingId(null);
    }
  };

  // Opt-in: quita la marca de agua del portal de origen de las fotos de la inspo.
  // Destructivo, por eso pide confirmación explícita (puede tocar fotos sin marca).
  const handleCleanWatermark = async (id: string) => {
    if (
      !confirm(
        "Quitar la marca de agua reprocesa las fotos ya alojadas (necesita ≥8 fotos y puede alterar fotos sin marca). ¿Continuar?",
      )
    )
      return;
    setCleaningId(id);
    try {
      const res = await fetch("/api/admin/idealista/inspo-clean-watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishResults((prev) => ({ ...prev, [id]: { ok: false, msg: data.error ?? "No se pudo limpiar" } }));
      } else {
        setPublishResults((prev) => ({ ...prev, [id]: { ok: true, msg: `Marca quitada en ${data.cleaned} fotos` } }));
        router.refresh();
      }
    } catch {
      setPublishResults((prev) => ({ ...prev, [id]: { ok: false, msg: "Error de red al limpiar" } }));
    } finally {
      setCleaningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Borrar esta ficha? Esta acción no se puede deshacer.")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/idealista/delete-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // silent — el usuario puede reintentar
    } finally {
      setDeletingId(null);
    }
  };

  // ── Vista de formulario (propiedad existente o inspo) ─────────────────────
  const showingForm = (selectedPropertyId && selectedProperty) || isInspoMode || editingInspoId;

  if (showingForm) {
    const isInspo = isInspoMode || inspoListing?.is_inspo || !!seedData;
    const propertyId = selectedPropertyId ?? editingInspoId ?? `inspo-${Date.now()}`;
    const propertyTitle = isInspo
      ? (seedData?.inspoTitle ?? inspoListing?.inspo_title ?? "")
      : (selectedProperty?.title ?? "");
    const initialData =
      seedData
        ? seedData
        : selectedListing
        ? listingToInitialData(selectedListing, propertyId)
        : inspoListing
        ? listingToInitialData(inspoListing, inspoListing.id)
        : undefined;

    return (
      <div className="space-y-6">
        <button
          onClick={clearForm}
          className="flex items-center gap-2 text-sm font-medium text-ink/60 hover:text-ink transition"
        >
          <ArrowLeft size={16} />
          Volver
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
          propertyId={propertyId}
          propertyTitle={propertyTitle}
          isInspo={!!isInspo}
          initialData={initialData}
          bcReference={!isInspo && !selectedListing ? (selectedProperty?.bc_reference ?? undefined) : undefined}
          onSave={handleSave}
          onPublish={async (data) => {
            const savedId = await handleSave(data);
            const listingId = savedId ?? editingInspoId ?? selectedListing?.id;
            if (listingId) await handlePublish(listingId);
          }}
        />
      </div>
    );
  }

  // ── Vista principal (dos modos) ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Cabecera de modos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Modo 1: propiedad del sistema */}
        <div className="rounded-xl border border-ink/10 bg-white/60 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Search size={15} className="text-ink/50" />
            <h3 className="text-sm font-semibold text-ink">Propiedad existente</h3>
          </div>
          <p className="text-xs text-ink/50 mb-3">
            Busca una propiedad ya creada en el sistema y prepara su ficha para Idealista.
          </p>
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por nombre, zona, referencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            />
          </div>
        </div>

        {/* Modo 2: inspo */}
        <div className="rounded-xl border-2 border-dashed border-gold/40 bg-gold/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={15} className="text-gold" />
            <h3 className="text-sm font-semibold text-ink">Nueva Inspo</h3>
          </div>
          <p className="text-xs text-ink/50 mb-3">
            Pega el link de un anuncio de cualquier portal (idealista, fotocasa, airbnb...) y se autocompleta la ficha (datos + fotos sin marca), o créala desde cero.
          </p>

          {/* Autocompletar desde link */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="url"
                placeholder="Pega el link del anuncio (idealista, fotocasa, airbnb, cualquier portal...)"
                value={seedUrl}
                onChange={(e) => setSeedUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSeedFromLink();
                }}
                disabled={seeding === "link"}
                className="w-full rounded-lg border border-gold/25 bg-white pl-8 pr-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:opacity-60"
              />
            </div>
            <button
              onClick={handleSeedFromLink}
              disabled={!seedUrl.trim() || seeding === "link"}
              className="flex items-center gap-1.5 rounded-lg bg-gold/20 px-3 py-2 text-xs font-semibold text-gold transition hover:bg-gold/30 disabled:opacity-50"
            >
              {seeding === "link" ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Autocompletar
            </button>
          </div>

          {seeding === "link" && (
            <p className="mt-2 text-[11px] text-ink/45">
              Leyendo el anuncio y limpiando fotos... puede tardar unos segundos.
            </p>
          )}
          {seedError && (
            <p className="mt-2 text-[11px] text-red-600">{seedError}</p>
          )}

          <button
            onClick={() => setIsInspoMode(true)}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-ink/60 ring-1 ring-inset ring-ink/10 transition hover:text-ink"
          >
            + Crear en blanco
          </button>
        </div>
      </div>

      {/* Lista de propiedades del sistema (si hay búsqueda o siempre visible) */}
      {filteredProperties.length > 0 && (
        <div className="rounded-xl border border-ink/8 bg-white/40 overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto divide-y divide-ink/6">
            {filteredProperties.map((property) => {
              const listing = systemListings.find((l) => l.property_id === property.id);
              return (
                <div
                  key={property.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gold/5 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {property.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink/50">
                      {property.zone && <span>{property.zone}</span>}
                      {property.price && (
                        <span className="font-semibold text-gold">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: "EUR",
                            maximumFractionDigits: 0,
                          }).format(property.price)}
                        </span>
                      )}
                      {listing && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ✓ Preparada
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleSeedFromProperty(property.id)}
                      disabled={!!seeding}
                      className="flex items-center gap-1 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/15 disabled:opacity-50"
                      title="Crear una inspo autocompletada con los datos y fotos de esta propiedad"
                    >
                      {seeding === property.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Inspo
                    </button>
                    <button
                      onClick={() => setSelectedPropertyId(property.id)}
                      className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/20"
                    >
                      {listing ? "Editar" : "Preparar →"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fichas preparadas: del sistema + inspo */}
      {listings.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/45">
            Fichas guardadas ({listings.length})
          </h3>
          <div className="space-y-2">
            {listings.map((listing) => {
              const property = !listing.is_inspo
                ? properties.find((p) => p.id === listing.property_id)
                : null;
              const displayTitle = listing.is_inspo
                ? (listing.inspo_title || "Inspo sin título")
                : (property?.title ?? "Propiedad eliminada");

              return (
                <div
                  key={listing.id}
                  className="flex items-center gap-3 rounded-xl border border-gold/15 bg-white/60 px-4 py-3 hover:bg-white/80 transition"
                >
                  {listing.is_inspo && (
                    <Sparkles size={14} className="shrink-0 text-gold" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {displayTitle}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                      {listing.square_meters && (
                        <span>{listing.square_meters} m²</span>
                      )}
                      {listing.bedrooms != null && listing.bedrooms > 0 && (
                        <span>{listing.bedrooms} hab.</span>
                      )}
                      {(() => {
                        // Alquiler: el precio está en total_rental_price, no en price.
                        const p =
                          listing.operation === "rent"
                            ? listing.total_rental_price
                            : listing.price;
                        return p ? (
                          <span>
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              maximumFractionDigits: 0,
                            }).format(p)}
                            {listing.operation === "rent" ? "/mes" : ""}
                          </span>
                        ) : null;
                      })()}
                      {listing.reference_code && (
                        <span className="rounded-full bg-blue-100/60 px-2 py-0.5 text-[10px] font-medium text-blue-700 font-mono">
                          {listing.reference_code}
                        </span>
                      )}
                      {listing.idealista_state === "published" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          ✓ Publicado
                        </span>
                      ) : (listing as any).scheduled_publish_at ? (
                        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          <Calendar size={9} />
                          {new Date((listing as any).scheduled_publish_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                          Borrador
                        </span>
                      )}
                      {publishResults[listing.id] && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${publishResults[listing.id].ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {publishResults[listing.id].msg}
                        </span>
                      )}
                      <span className="text-ink/30">
                        {new Date(listing.updated_at).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {listing.is_inspo && (
                      <button
                        onClick={() => handleCleanWatermark(listing.id)}
                        disabled={cleaningId === listing.id}
                        className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                        title="Quitar la marca de agua del portal de origen (reprocesa las fotos)"
                      >
                        {cleaningId === listing.id ? <Loader2 size={12} className="animate-spin" /> : <Droplets size={12} />}
                        Quitar marca
                      </button>
                    )}
                    {listing.idealista_state !== "published" && (
                      <button
                        onClick={() => handlePublish(listing.id)}
                        disabled={publishingId === listing.id}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                        title="Abrir en Idealista con los datos precargados"
                      >
                        {publishingId === listing.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Abrir en Idealista
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (listing.is_inspo) {
                          setEditingInspoId(listing.id);
                        } else {
                          setSelectedPropertyId(listing.property_id!);
                        }
                      }}
                      className="rounded-lg border border-ink/15 bg-ink/5 p-1.5 text-ink/50 transition hover:bg-ink/10 hover:text-ink"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(listing.id)}
                      disabled={deletingId === listing.id}
                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-500 transition hover:bg-red-100 disabled:opacity-50"
                      title="Borrar ficha"
                    >
                      {deletingId === listing.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {listings.length === 0 && filteredProperties.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-ink/40">
            No hay propiedades en el sistema
          </p>
        </div>
      )}
    </div>
  );
}
