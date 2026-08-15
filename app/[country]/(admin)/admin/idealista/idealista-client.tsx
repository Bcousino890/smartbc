"use client";

import { ArrowLeft, Edit2, Loader2, Search, Sparkles, Send, Calendar, Trash2, Link2, Wand2, Droplets, Download, Archive, RotateCcw, History, Clapperboard, Video, Plug, Power, Image as ImageIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { IdealistaForm, type IdealistaListing } from "../publicacion/idealista-form";
import { IdealistaStatusModal } from "@/components/admin/idealista-status-modal";
import { IdealistaStateSelector } from "@/components/admin/idealista-state-selector";
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
  latitude: number | null;
  longitude: number | null;
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
  heating_fuel: string | null;
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
  description: string | null;
  photo_ids: string[];
  video_ids: string[];
  plan_ids: string[];
  idealista_property_id: string | null;
  idealista_state: string | null;
  // Publicación por el Partner API (API en tiempo real). Va aparte de
  // `idealista_property_id`, que lo rellena el flujo de la extensión.
  api_property_id: number | null;
  api_state: string | null;
  api_last_error: string | null;
  scheduled_publish_at: string | null;
  archived_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
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
    latitude: listing.latitude ?? 0,
    longitude: listing.longitude ?? 0,
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
    heatingFuel: (listing.heating_fuel ?? "unknown") as
      | "unknown"
      | "gas-natural"
      | "gasoil"
      | "otro",
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
    description: listing.description ?? "",
    photos: listing.photo_ids ?? [],
    videos: listing.video_ids ?? [],
    plans: listing.plan_ids ?? [],
    scheduledPublishAt: listing.scheduled_publish_at ?? null,
  };
}

// Qué le falta a una ficha para estar lista para publicar en Idealista.
// Devuelve una lista de carencias en texto (vacía = ficha completa).
function listingMissingFields(l: DbIdealistaListing): string[] {
  const missing: string[] = [];
  const photoCount = l.photo_ids?.length ?? 0;
  if (photoCount === 0) missing.push("fotos");
  else if (photoCount < 4) missing.push(`más fotos (tiene ${photoCount}, mínimo recomendable 4)`);
  if (!l.description?.trim()) missing.push("descripción");
  const price = l.operation === "rent" ? l.total_rental_price : l.price;
  if (!price) missing.push("precio");
  if (l.is_inspo && !l.inspo_title?.trim()) missing.push("título");
  if (!l.reference_code) missing.push("referencia");
  if (!l.address_city?.trim()) missing.push("zona/ciudad");
  return missing;
}

export function IdealistaClient({
  properties,
  listings,
  listingsWithVideo,
  leadCountsByProperty,
}: {
  properties: Property[];
  listings: DbIdealistaListing[];
  /** IDs (de properties o de idealista_listings) que ya tienen vídeo automático generado. */
  listingsWithVideo: string[];
  /** property_id -> nº de leads del inbox de Idealista matcheados a esa propiedad. */
  leadCountsByProperty: Record<string, number>;
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
  const [showAllProperties, setShowAllProperties] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [apiActionId, setApiActionId] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleaningId, setCleaningId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalListingId, setStatusModalListingId] = useState<string | null>(null);
  const [statusModalTitle, setStatusModalTitle] = useState("");
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [generateVideosMsg, setGenerateVideosMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const videoIds = useMemo(() => new Set(listingsWithVideo), [listingsWithVideo]);

  // Dispara el vídeo de TODAS las inspo que lo necesiten (nuevas o con fotos
  // cambiadas) de una vez. El render sigue en el servidor tras responder: no
  // hay que esperar aquí a que termine, solo a que quede encolado.
  const handleGenerateAllVideos = async () => {
    setGeneratingVideos(true);
    setGenerateVideosMsg(null);
    try {
      const res = await fetch("/api/admin/idealista/listings/generate-videos", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateVideosMsg({ ok: false, text: data.error ?? "No se pudieron encolar los vídeos." });
        return;
      }
      const parts = [`${data.queued} vídeo(s) encolados`];
      if (data.upToDate > 0) parts.push(`${data.upToDate} ya al día`);
      if (data.skipped > 0) parts.push(`${data.skipped} sin fotos suficientes`);
      setGenerateVideosMsg({
        ok: true,
        text:
          data.queued > 0
            ? `${parts.join(", ")}. Se renderizan uno a uno; recarga en unos minutos para ver el botón de descarga.`
            : `Nada que encolar (${parts.slice(1).join(", ") || "todas al día"}).`,
      });
    } catch {
      setGenerateVideosMsg({ ok: false, text: "Error de red al encolar los vídeos." });
    } finally {
      setGeneratingVideos(false);
    }
  };

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

  // Pipeline de bajas: las fichas archivadas (bajadas de Idealista) se sacan
  // de la lista activa pero no se borran — se muestran aparte, con opción de
  // restaurar.
  const activeListings = useMemo(
    () => listings.filter((l) => !l.archived_at),
    [listings]
  );
  const archivedListings = useMemo(
    () => listings.filter((l) => !!l.archived_at),
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
  // Si el servidor detecta que ya existe una ficha del mismo anuncio (409),
  // pregunta y reintenta con force=true si el usuario confirma.
  const handleSeedFromLink = async (force = false) => {
    const url = seedUrl.trim();
    if (!url || (seeding && !force)) return;
    setSeedError(null);
    setSeeding("link");
    try {
      const res = await fetch("/api/admin/idealista/inspo-from-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, force }),
      });
      const json = await res.json();
      if (res.status === 409 && json.duplicate) {
        if (
          confirm(
            `Ya tienes una ficha creada desde este anuncio: "${json.duplicate.title}".\n\n¿Crear otra igualmente?`,
          )
        ) {
          await handleSeedFromLink(true);
        }
        return;
      }
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
  const handleSeedFromProperty = async (propertyId: string, force = false) => {
    if (seeding && !force) return;
    setSeedError(null);
    setSeeding(propertyId);
    try {
      const res = await fetch("/api/admin/idealista/inspo-from-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, force }),
      });
      const json = await res.json();
      if (res.status === 409 && json.duplicate) {
        if (
          confirm(
            `Ya tienes una ficha creada desde el anuncio de origen de esta propiedad: "${json.duplicate.title}".\n\n¿Crear otra igualmente?`,
          )
        ) {
          await handleSeedFromProperty(propertyId, true);
        }
        return;
      }
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
    // Aviso previo: si a la ficha le falta algo importante, confirmar antes de
    // abrir Idealista (evita descubrir la carencia con el formulario ya abierto).
    const listing = listings.find((l) => l.id === listingId);
    if (listing) {
      const missing = listingMissingFields(listing);
      if (
        missing.length > 0 &&
        !confirm(`A esta ficha le falta: ${missing.join(", ")}.\n\n¿Abrir en Idealista igualmente?`)
      ) {
        return;
      }
    }
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

  // Publicación por el Partner API: en vez de abrir el formulario de Idealista
  // en el navegador, se le manda el anuncio directamente y contesta al momento
  // (con el propertyId, o con el detalle exacto de lo que le falta).
  const handleApiAction = async (
    listingId: string,
    action: "publish" | "deactivate" | "reactivate" | "clone" | "sync-images" | "refresh-state"
  ) => {
    if (action === "deactivate" && !confirm("Se dará de baja el anuncio en Idealista y quedará libre el hueco. ¿Continuar?")) {
      return;
    }
    setApiActionId(listingId);
    setPublishResults((prev) => ({ ...prev, [listingId]: { ok: true, msg: "Hablando con Idealista…" } }));
    try {
      const res = await fetch("/api/admin/idealista/api/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, action }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        propertyId?: number;
        steps?: string[];
        warnings?: string[];
        errors?: string[];
      };

      const parts = [...(data.steps ?? []), ...(data.warnings ?? []), ...(data.errors ?? [])];
      setPublishResults((prev) => ({
        ...prev,
        [listingId]: {
          ok: data.ok,
          msg: parts.length > 0 ? parts.join(" · ") : data.ok ? "Hecho" : "No se pudo completar",
        },
      }));
      if (data.ok) router.refresh();
    } catch {
      setPublishResults((prev) => ({ ...prev, [listingId]: { ok: false, msg: "Error de red al hablar con Idealista" } }));
    } finally {
      setApiActionId(null);
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

  // Descarga las fotos de la ficha en un ZIP (carpeta con la referencia BC).
  // Es una descarga directa por GET; el navegador la guarda por el header.
  const handleDownloadPhotos = (id: string) => {
    const a = document.createElement("a");
    a.href = `/api/admin/idealista/download-photos?listingId=${id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (id: string, isPublished: boolean) => {
    const message = isPublished
      ? "¿Bajar esta ficha de Idealista? Se archivará (no se borra: fotos y datos quedan guardados) y podrás restaurarla luego."
      : "¿Borrar esta ficha? Esta acción no se puede deshacer.";
    if (!confirm(message)) return;
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

  // Restaura una ficha archivada (bajada) a la lista activa como publicada.
  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch("/api/admin/idealista/restore-listing", {
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
      setRestoringId(null);
    }
  };

  const handleOpenStatusHistory = (listingId: string, title: string) => {
    setStatusModalListingId(listingId);
    setStatusModalTitle(title);
    setStatusModalOpen(true);
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
          propertySlug={!isInspo ? selectedProperty?.slug : undefined}
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
              placeholder="Buscar por nombre, zona o referencia (ej. BC-1338)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            />
          </div>
          {!searchTerm && (
            <button
              onClick={() => setShowAllProperties((v) => !v)}
              className="mt-2 text-xs font-medium text-ink/45 underline decoration-dotted underline-offset-2 hover:text-ink/70"
            >
              {showAllProperties ? "Ocultar listado completo" : `Ver todas las propiedades (${properties.length})`}
            </button>
          )}
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
              onClick={() => handleSeedFromLink()}
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

      {/* Lista de propiedades del sistema: solo mientras se busca o si el usuario pide verla toda */}
      {filteredProperties.length > 0 && (searchTerm || showAllProperties) && (
        <div className="rounded-xl border border-ink/8 bg-white/40 overflow-hidden">
          <div className="max-h-[220px] overflow-y-auto divide-y divide-ink/6">
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
      {activeListings.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/45">
              Fichas guardadas ({activeListings.length})
            </h3>
            <button
              onClick={handleGenerateAllVideos}
              disabled={generatingVideos}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              title="Genera o actualiza el vídeo automático de todas las inspo que lo necesiten"
            >
              {generatingVideos ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
              Generar vídeos de todas las inspo
            </button>
          </div>
          {generateVideosMsg && (
            <p className={`mb-3 text-xs ${generateVideosMsg.ok ? "text-emerald-700" : "text-red-600"}`}>
              {generateVideosMsg.text}
            </p>
          )}
          <div className="space-y-2">
            {activeListings.map((listing) => {
              const property = !listing.is_inspo
                ? properties.find((p) => p.id === listing.property_id)
                : null;
              const displayTitle = listing.is_inspo
                ? (listing.inspo_title || "Inspo sin título")
                : (property?.title ?? "Propiedad eliminada");
              // El vídeo automático se guarda contra la propiedad si la ficha
              // es una propiedad real, o contra la propia ficha si es inspo.
              const videoOwnerId = listing.is_inspo ? listing.id : listing.property_id;
              const videoHref =
                listing.is_inspo
                  ? `/api/admin/idealista/listings/${listing.id}/download-video`
                  : property
                    ? `/api/admin/properties/${property.slug}/download-video`
                    : null;
              const hasVideo = !!videoOwnerId && videoIds.has(videoOwnerId) && !!videoHref;

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
                      {!listing.is_inspo && listing.property_id && leadCountsByProperty[listing.property_id] > 0 && (
                        <span
                          className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700"
                          title="Contactos del inbox de Idealista matcheados a esta propiedad (ver Solicitudes)"
                        >
                          👤 {leadCountsByProperty[listing.property_id]} lead{leadCountsByProperty[listing.property_id] === 1 ? "" : "s"}
                        </span>
                      )}
                      {(() => {
                        // Checklist: ¿la ficha está lista para publicar?
                        const missing = listingMissingFields(listing);
                        return missing.length === 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600" title="La ficha tiene todo lo necesario para publicar">
                            ✓ Lista
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
                            title={`Antes de publicar completa: ${missing.join(", ")}`}
                          >
                            ⚠ Faltan: {missing.join(", ")}
                          </span>
                        );
                      })()}
                      {publishResults[listing.id] && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${publishResults[listing.id].ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                          {publishResults[listing.id].msg}
                        </span>
                      )}
                      {listing.api_property_id && (
                        <span
                          className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                          title={`Publicado por API — propertyId ${listing.api_property_id}`}
                        >
                          API {listing.api_property_id}
                          {listing.api_state && listing.api_state !== "active" ? ` · ${listing.api_state}` : ""}
                        </span>
                      )}
                      {/* El último error del API se guarda en la ficha: si no se
                          enseña, el operador no sabe por qué no salió el anuncio. */}
                      {!publishResults[listing.id] && listing.api_last_error && (
                        <span
                          className="max-w-[28rem] truncate rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600"
                          title={listing.api_last_error}
                        >
                          ⚠ API: {listing.api_last_error}
                        </span>
                      )}
                      <span className="text-ink/30">
                        {new Date(listing.updated_at).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-ink/10">
                      <IdealistaStateSelector
                        listingId={listing.id}
                        currentState={listing.idealista_state}
                        onStateChange={(newState) => {
                          listing.idealista_state = newState;
                          router.refresh();
                        }}
                      />
                      {(listing.published_at || listing.unpublished_at) && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink/40">
                          {listing.published_at && (
                            <span>
                              ↑ Subida: {new Date(listing.published_at).toLocaleDateString("es-ES")}
                            </span>
                          )}
                          {listing.unpublished_at && (
                            <span>
                              ↓ Bajada: {new Date(listing.unpublished_at).toLocaleDateString("es-ES")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleOpenStatusHistory(listing.id, displayTitle)}
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-ink/5 px-2.5 py-1.5 text-xs font-semibold text-ink/60 transition hover:bg-ink/10 hover:text-ink"
                      title="Ver historial de cambios de estado"
                    >
                      <History size={12} />
                      Historial
                    </button>
                    {listing.photo_ids?.length > 0 && (
                      <button
                        onClick={() => handleDownloadPhotos(listing.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-ink/5 px-2.5 py-1.5 text-xs font-semibold text-ink/60 transition hover:bg-ink/10 hover:text-ink"
                        title={`Descargar las ${listing.photo_ids.length} fotos en una carpeta`}
                      >
                        <Download size={12} />
                        Fotos
                      </button>
                    )}
                    {hasVideo && videoHref && (
                      <a
                        href={videoHref}
                        className="flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-xs font-semibold text-gold-dark transition hover:bg-gold/15"
                        title="Descargar el vídeo automático ya generado"
                      >
                        <Video size={12} />
                        Vídeo
                      </a>
                    )}
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

                    {/* Partner API: publicar sin pasar por el formulario ni la extensión. */}
                    <button
                      onClick={() => handleApiAction(listing.id, "publish")}
                      disabled={apiActionId === listing.id}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                      title={
                        listing.api_property_id
                          ? `Actualizar en Idealista el anuncio ${listing.api_property_id}`
                          : "Publicar directamente por la API de Idealista"
                      }
                    >
                      {apiActionId === listing.id ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
                      {listing.api_property_id ? "Actualizar por API" : "Publicar por API"}
                    </button>

                    {listing.api_property_id && (
                      <>
                        <button
                          onClick={() => handleApiAction(listing.id, "sync-images")}
                          disabled={apiActionId === listing.id}
                          className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-ink/5 px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-ink/10 disabled:opacity-50"
                          title="Reenviar las fotos a Idealista (sustituye las que tenga)"
                        >
                          <ImageIcon size={12} />
                          Fotos
                        </button>
                        <button
                          onClick={() => handleApiAction(listing.id, listing.api_state === "inactive" ? "reactivate" : "deactivate")}
                          disabled={apiActionId === listing.id}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                          title={
                            listing.api_state === "inactive"
                              ? "Reactivar el anuncio en Idealista"
                              : "Dar de baja el anuncio en Idealista"
                          }
                        >
                          <Power size={12} />
                          {listing.api_state === "inactive" ? "Reactivar" : "Dar de baja"}
                        </button>
                      </>
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
                      onClick={() => handleDelete(listing.id, listing.idealista_state === "published")}
                      disabled={deletingId === listing.id}
                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-500 transition hover:bg-red-100 disabled:opacity-50"
                      title={listing.idealista_state === "published" ? "Bajar ficha (se archiva, no se borra)" : "Borrar ficha"}
                    >
                      {deletingId === listing.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : listing.idealista_state === "published" ? (
                        <Archive size={14} />
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

      {archivedListings.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/45">
            Archivadas — bajadas de Idealista ({archivedListings.length})
          </h3>
          <div className="space-y-2">
            {archivedListings.map((listing) => {
              const displayTitle = listing.is_inspo
                ? (listing.inspo_title || "Inspo sin título")
                : (properties.find((p) => p.id === listing.property_id)?.title ?? "Propiedad eliminada");
              return (
                <div
                  key={listing.id}
                  className="flex items-center gap-3 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 opacity-75"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink/70">{displayTitle}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/45">
                      {listing.reference_code && (
                        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium font-mono">
                          {listing.reference_code}
                        </span>
                      )}
                      <span>
                        Archivada el {new Date(listing.archived_at!).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(listing.id)}
                    disabled={restoringId === listing.id}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                    title="Restaurar a fichas activas"
                  >
                    {restoringId === listing.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Restaurar
                  </button>
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

      {/* Modal de historial de estados */}
      <IdealistaStatusModal
        listingId={statusModalListingId || ""}
        title={statusModalTitle}
        isOpen={statusModalOpen}
        onClose={() => {
          setStatusModalOpen(false);
          setStatusModalListingId(null);
          setStatusModalTitle("");
        }}
      />
    </div>
  );
}
