"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Droplets,
  ExternalLink,
  FileDown,
  FileImage,
  Globe,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  MapIcon,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

// Mapa editable (Leaflet). ssr:false porque Leaflet toca `window`. Reutiliza el
// mismo picker que el formulario de Idealista: clic o arrastrar el pin fija las
// coordenadas exactas de la propiedad.
const MapPicker = dynamic(() => import("../../publicacion/map-picker"), {
  ssr: false,
});
import {
  updateProperty,
  addPropertyVideo,
  uploadPropertyPlan,
  uploadPropertyVideo,
  deletePropertyMedia,
  deleteProperty,
  type MediaItem,
} from "@/app/(admin)/admin/propiedades/actions";
import { PropertyPhotosModal } from "@/components/admin/property-photos-modal";
import { PropertyVideoPanel } from "@/components/admin/property-video-panel";
import {
  type SmartLinkRow,
  SmartLinksPanel,
} from "@/components/admin/smart-links-panel";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { propertyFeaturesForCountry } from "@/lib/property-features";
import { sectorsForCommune } from "@/lib/mock-properties";
import { useT } from "@/lib/i18n/provider";
import { shareSlug } from "@/lib/share-slug";
import { PORTAL_URL } from "@/lib/portal-url";
import { cn } from "@/lib/utils";

type Photo = {
  url: string;
  alt: string | null;
  position: number;
  is_cover: boolean;
};

export type PropertyForEdit = {
  id: string;
  slug: string;
  title: string;
  // Título específico de la variante de alquiler cuando la propiedad tiene
  // ambas operaciones activas (isDualOperation). Null → cae a `title`.
  title_rent: string | null;
  description: string | null;
  operation: "rent" | "sale";
  operations: string[];
  rent_price: number | null;
  stay: "short" | "long" | null;
  status: "available" | "reserved" | "sold" | "archived";
  price: number;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  covered_area_m2: number | null;
  parking_lots: number | null;
  floors: number | null;
  is_condominium: boolean | null;
  construction_year: number | null;
  sector: string | null;
  zone: string;
  address: string | null;
  features: string[];
  features_manual: string[];
  latitude: number | null;
  longitude: number | null;
  available_from: string | null;
  bc_reference: string | null;
  property_reference: string;
  source: "manual" | "scrape" | "api";
  source_url: string | null;
  archived_at: string | null;
  cover_photo_url: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  internal_notes: string | null;
  published_web: boolean;
  agency: { id: string; name: string; slug: string } | null;
  photos: Photo[];
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saved"; at: number }
  | { kind: "error"; msg: string };

export function PropertyEditView({
  property,
  shares,
  videos: initialVideos = [],
  plans: initialPlans = [],
}: {
  property: PropertyForEdit;
  shares: SmartLinkRow[];
  videos?: MediaItem[];
  plans?: MediaItem[];
}) {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);
  const isCL = country === "cl";
  const checklistFeatures = propertyFeaturesForCountry(country);
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [photosOpen, setPhotosOpen] = useState(false);
  const [cleaningWatermark, setCleaningWatermark] = useState(false);
  const [watermarkMsg, setWatermarkMsg] = useState<string | null>(null);
  const [deletingProperty, setDeletingProperty] = useState(false);

  async function handleDeleteProperty() {
    if (
      !window.confirm(
        `¿Eliminar la propiedad "${property.title}"? Esta acción no se puede deshacer. Se borrarán sus fotos. Si vino de una captación, esa captación volverá a "confirmada" para poder re-convertirla.`,
      )
    ) {
      return;
    }
    setDeletingProperty(true);
    try {
      const res = await deleteProperty(property.slug, country);
      if (res.ok) {
        router.push(`/${country}/admin/propiedades`);
      } else {
        window.alert(`No se pudo eliminar: ${res.error}`);
        setDeletingProperty(false);
      }
    } catch (e) {
      window.alert(
        `Error al eliminar: ${e instanceof Error ? e.message : String(e)}`,
      );
      setDeletingProperty(false);
    }
  }

  // Videos state
  const [videos, setVideos] = useState<MediaItem[]>(initialVideos);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Planos state
  const [plans, setPlans] = useState<MediaItem[]>(initialPlans);
  const [planError, setPlanError] = useState<string | null>(null);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const planInputRef = useRef<HTMLInputElement>(null);

  // Estado del form. Inicializamos con los valores actuales.
  const [title, setTitle] = useState(property.title);
  const [titleRent, setTitleRent] = useState(
    property.title_rent ?? property.title,
  );
  const [description, setDescription] = useState(property.description ?? "");
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [price, setPrice] = useState(property.price);
  const [bedrooms, setBedrooms] = useState(property.bedrooms);
  const [bathrooms, setBathrooms] = useState(property.bathrooms);
  const [squareMeters, setSquareMeters] = useState<number | "">(
    property.square_meters ?? "",
  );
  const [coveredAreaM2, setCoveredAreaM2] = useState<number | "">(
    property.covered_area_m2 ?? "",
  );
  const [parkingLots, setParkingLots] = useState<number | "">(
    property.parking_lots ?? "",
  );
  const [floors, setFloors] = useState<number | "">(property.floors ?? "");
  const [isCondominium, setIsCondominium] = useState<boolean>(
    property.is_condominium ?? false,
  );
  const [constructionYear, setConstructionYear] = useState<number | "">(
    property.construction_year ?? "",
  );
  const [sector, setSector] = useState(property.sector ?? "");
  const [zone, setZone] = useState(property.zone);
  const [address, setAddress] = useState(property.address ?? "");
  // Coordenadas editables (fijar el punto exacto en el mapa). 0 = sin fijar.
  const [latitude, setLatitude] = useState<number>(property.latitude ?? 0);
  const [longitude, setLongitude] = useState<number>(property.longitude ?? 0);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [operations, setOperations] = useState<("rent" | "sale")[]>(
    (property.operations.length > 0
      ? property.operations
      : [property.operation]) as ("rent" | "sale")[],
  );
  const [rentPrice, setRentPrice] = useState<number | "">(
    property.rent_price ?? "",
  );
  // Operación "principal": venta si está en venta (con o sin alquiler
  // también), alquiler si solo está en alquiler.
  const operation: "rent" | "sale" = operations.includes("sale")
    ? "sale"
    : "rent";
  const isDualOperation =
    operations.includes("sale") && operations.includes("rent");

  function toggleOperation(op: "rent" | "sale") {
    setOperations((prev) => {
      if (prev.includes(op)) {
        // No permitir desmarcar la última operación activa.
        if (prev.length === 1) return prev;
        return prev.filter((o) => o !== op);
      }
      return [...prev, op];
    });
  }
  const [stay, setStay] = useState<"short" | "long" | "">(property.stay ?? "");
  const [availableFrom, setAvailableFrom] = useState(property.available_from ?? "");
  const [status, setStatus] = useState(property.status);
  const [ownerName, setOwnerName] = useState(property.owner_name ?? "");
  const [ownerPhone, setOwnerPhone] = useState(property.owner_phone ?? "");
  const [ownerEmail, setOwnerEmail] = useState(property.owner_email ?? "");
  const [internalNotes, setInternalNotes] = useState(
    property.internal_notes ?? "",
  );
  const [featuresManual, setFeaturesManual] = useState<string[]>(
    property.features_manual ?? [],
  );
  const [newFeature, setNewFeature] = useState("");
  const [copied, setCopied] = useState<"rent" | "sale" | "single" | null>(
    null,
  );
  const [publishedWeb, setPublishedWeb] = useState(property.published_web);

  const addManualFeature = () => {
    const f = newFeature.trim();
    if (!f) return;
    // Evita duplicados con las auto-detectadas y entre las manuales.
    const already = new Set(
      [...property.features, ...featuresManual].map((x) =>
        x.toLowerCase(),
      ),
    );
    if (already.has(f.toLowerCase())) {
      setNewFeature("");
      return;
    }
    setFeaturesManual((prev) => [...prev, f]);
    setNewFeature("");
  };

  const removeManualFeature = (f: string) => {
    setFeaturesManual((prev) => prev.filter((x) => x !== f));
  };

  // Activa/desactiva una característica del checklist. Mismo criterio de
  // deduplicación (case-insensitive) que addManualFeature.
  const toggleFeature = (f: string) => {
    const already = featuresManual.some(
      (x) => x.toLowerCase() === f.toLowerCase(),
    );
    if (already) {
      removeManualFeature(f);
      return;
    }
    if (property.features.some((x) => x.toLowerCase() === f.toLowerCase())) return;
    setFeaturesManual((prev) => [...prev, f]);
  };

  // ─── Video handlers ────────────────────────────────────────────────────
  async function handleAddVideo() {
    if (!videoUrl.trim()) return;
    setAddingVideo(true);
    setVideoError(null);
    try {
      const res = await addPropertyVideo(property.slug, videoUrl.trim());
      if (res.ok) {
        setVideos((v) => [...v, res.item]);
        setVideoUrl("");
      } else {
        setVideoError(res.error);
      }
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "No se pudo añadir el vídeo.");
    } finally {
      setAddingVideo(false);
    }
  }

  async function handleDeleteVideo(item: MediaItem) {
    if (!confirm("¿Eliminar este video?")) return;
    try {
      await deletePropertyMedia(property.slug, item.id, item.storage_path);
      setVideos((v) => v.filter((x) => x.id !== item.id));
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "No se pudo eliminar el vídeo.");
    }
  }

  async function handleVideoFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);
    setUploadingVideo(true);

    // Subimos por Server Action (no por Route Handler): el límite de body de
    // Next (bodySizeLimit: 5gb) SOLO aplica a Server Actions. El Route Handler
    // cortaba el body de los vídeos grandes y fallaba con "Failed to parse body
    // as FormData". Mismo camino probado que los planos.
    const fd = new FormData();
    fd.set("slug", property.slug);
    fd.set("file", file);
    try {
      const res = await uploadPropertyVideo(fd);
      if (res.ok) {
        setVideos((v) => [...v, res.item]);
      } else {
        setVideoError(res.error);
      }
    } catch (err) {
      // Si el Server Action lanza (vídeo demasiado grande para el Storage del
      // VPS, timeout, etc.) reseteamos el estado para no dejar el spinner
      // colgado y sugerimos el enlace de YouTube/Vimeo como alternativa.
      setVideoError(
        (err instanceof Error ? `No se pudo subir (${err.message}). ` : "No se pudo subir el vídeo. ") +
          "Si el vídeo es grande, pega un enlace de YouTube/Vimeo.",
      );
    } finally {
      setUploadingVideo(false);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  }

  // ─── Plan handlers ─────────────────────────────────────────────────────
  async function handlePlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPlanError(null);
    setUploadingPlan(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.set("slug", property.slug);
        fd.set("file", file);
        const res = await uploadPropertyPlan(fd);
        if (res.ok) setPlans((p) => [...p, res.item]);
        else { setPlanError(res.error); break; }
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "No se pudo subir el plano.");
    } finally {
      setUploadingPlan(false);
      if (planInputRef.current) planInputRef.current.value = "";
    }
  }

  async function handleDeletePlan(item: MediaItem) {
    if (!confirm("¿Eliminar este plano?")) return;
    try {
      await deletePropertyMedia(property.slug, item.id, item.storage_path);
      setPlans((p) => p.filter((x) => x.id !== item.id));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "No se pudo eliminar el plano.");
    }
  }

  function getEmbedUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
      }
      if (u.hostname.includes("youtube.com")) {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.hostname.includes("vimeo.com")) {
        const id = u.pathname.split("/").filter(Boolean).pop();
        return id ? `https://player.vimeo.com/video/${id}` : null;
      }
    } catch {}
    return null;
  }

  const isScraped = property.source === "scrape";

  // SmartLink: URL pública del compartir, con la referencia BC al inicio del
  // slug (bc0871-…). Dominio fijo (PORTAL_URL), no window.origin: un agente
  // logueado por accidente en el dominio de marketing (www.bcousinoprop.com)
  // generaría ahí mismo el enlace que le manda al cliente.
  const publicSlug = shareSlug(property.slug, property.bc_reference);
  const smartLinkBase = `${PORTAL_URL}/compartir/${publicSlug}`;
  // Propiedad dual: cada operación tiene su propia variante del SmartLink
  // (?op=sale / ?op=rent) para que el título, el precio y el PDF que ve el
  // cliente correspondan a la operación que le interesa, sin ambigüedad.
  const smartLinkFor = (op: "rent" | "sale") =>
    isDualOperation ? `${smartLinkBase}?op=${op}` : smartLinkBase;
  const pdfHrefFor = (op: "rent" | "sale") =>
    isDualOperation
      ? `/api/admin/properties/${property.slug}/pdf?op=${op}`
      : `/api/admin/properties/${property.slug}/pdf`;

  const handleCopyLink = async (op: "rent" | "sale" | "single") => {
    const link = op === "single" ? smartLinkBase : smartLinkFor(op);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(op);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback rudimentario si no hay permiso de portapapeles.
      window.prompt(t("adminProps.detail.copyLinkFallback"), link);
    }
  };
  const cover =
    property.cover_photo_url ??
    property.photos.find((p) => p.is_cover)?.url ??
    property.photos[0]?.url ??
    null;

  // Coloca el pin a partir de la dirección escrita (Nominatim/OSM). Útil para
  // importaciones sin coordenadas: escribes/confirmas la dirección y de ahí
  // sale el punto de partida, que luego se afina arrastrando el pin.
  const geocodeFromAddress = async () => {
    const countryName = country === "cl" ? "Chile" : "España";
    const q = [address, zone, countryName].filter(Boolean).join(", ");
    if (!q.trim()) {
      setGeocodeError("Escribe una dirección o zona primero.");
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json", "User-Agent": "smartbc-property-edit" } },
      );
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!data.length) {
        setGeocodeError("No se encontró esa dirección. Coloca el pin a mano en el mapa.");
        return;
      }
      setLatitude(parseFloat(data[0].lat));
      setLongitude(parseFloat(data[0].lon));
    } catch {
      setGeocodeError("Error al buscar la dirección. Coloca el pin a mano.");
    } finally {
      setGeocoding(false);
    }
  };

  // Genera la descripción con IA a partir de los datos del formulario + las
  // características marcadas (auto-detectadas y manuales) + las fotos ya
  // subidas, para que la IA "vea" el inmueble en vez de inventar.
  const generateDescription = async () => {
    setGeneratingDesc(true);
    setDescError(null);
    try {
      const res = await fetch("/api/admin/propiedades/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country,
          operation,
          zone,
          sector: sector || undefined,
          address,
          squareMeters: squareMeters === "" ? undefined : squareMeters,
          coveredAreaM2: coveredAreaM2 === "" ? undefined : coveredAreaM2,
          bedrooms,
          bathrooms,
          parkingLots: parkingLots === "" ? undefined : parkingLots,
          floors: floors === "" ? undefined : floors,
          isCondominium,
          constructionYear: constructionYear === "" ? undefined : constructionYear,
          price,
          features: [...property.features, ...featuresManual],
          photos: property.photos.map((p) => p.url),
        }),
      });
      const data = (await res.json()) as { description?: string; error?: string };
      if (!res.ok || !data.description) {
        setDescError(data.error ?? "No se pudo generar la descripción.");
        return;
      }
      setDescription(data.description);
    } catch {
      setDescError("Error al generar la descripción.");
    } finally {
      setGeneratingDesc(false);
    }
  };

  // Opt-in: quita la marca de agua de la agencia de origen de las fotos ya
  // alojadas. Destructivo, por eso pide confirmación (puede tocar fotos sin
  // marca real y necesita ≥8 fotos + el motor del VPS).
  const handleCleanWatermark = async () => {
    if (
      !confirm(
        "Quitar la marca de agua reprocesa las fotos ya alojadas de esta propiedad. Necesita al menos 8 fotos y, si el anuncio no tiene una marca real, podría alterar las fotos. ¿Continuar?",
      )
    )
      return;
    setCleaningWatermark(true);
    setWatermarkMsg(null);
    try {
      const res = await fetch(`/api/admin/properties/${property.slug}/clean-watermark`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setWatermarkMsg(data.error ?? "No se pudo quitar la marca de agua");
        return;
      }
      setWatermarkMsg(`Marca de agua quitada en ${data.cleaned} fotos.`);
      router.refresh();
    } catch {
      setWatermarkMsg("Error de red al procesar las fotos");
    } finally {
      setCleaningWatermark(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveState({ kind: "idle" });
    startTransition(async () => {
      try {
        const res = await updateProperty({
          slug: property.slug,
          title,
          titleRent: isDualOperation ? titleRent || null : null,
          description: description || null,
          price,
          bedrooms,
          bathrooms,
          squareMeters: squareMeters === "" ? null : Number(squareMeters),
          coveredAreaM2: coveredAreaM2 === "" ? null : Number(coveredAreaM2),
          parkingLots: parkingLots === "" ? null : Number(parkingLots),
          floors: floors === "" ? null : Number(floors),
          isCondominium,
          constructionYear: constructionYear === "" ? null : Number(constructionYear),
          sector: sector || null,
          zone,
          address: address || null,
          // Coordenadas fijadas en el mapa (0 = sin fijar → null).
          latitude: latitude || null,
          longitude: longitude || null,
          operations,
          rentPrice: isDualOperation
            ? (rentPrice === "" ? null : Number(rentPrice))
            : null,
          stay: stay || null,
          availableFrom: availableFrom || null,
          status,
          ownerName: ownerName || null,
          ownerPhone: ownerPhone || null,
          ownerEmail: ownerEmail || null,
          internalNotes: internalNotes || null,
          featuresManual,
          publishedWeb,
        });
        if (res.ok) {
          setSaveState({ kind: "saved", at: Date.now() });
          router.refresh();
        } else {
          setSaveState({ kind: "error", msg: res.error });
        }
      } catch (err) {
        setSaveState({
          kind: "error",
          msg: err instanceof Error ? err.message : "No se pudo guardar la propiedad.",
        });
      }
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-24 lg:px-10">
      {/* Cabecera */}
      <div className="flex items-center justify-between pt-7">
        <Link
          href={`${config.prefix}/propiedades`}
          className="inline-flex items-center gap-2 text-[12px] font-medium text-ink/65 transition hover:text-ink"
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          <span>{t("adminProps.detail.back")}</span>
        </Link>
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            isScraped
              ? "border-gold/35 bg-gold/10 text-gold-dark"
              : "border-ink/15 bg-ink/5 text-ink/65",
          )}
        >
          {isScraped
            ? t("adminProps.detail.sourceScrape", {
                agency: property.agency?.name ?? "—",
              })
            : t("adminProps.detail.sourceManual")}
        </span>
      </div>

      <header className="mt-4 flex items-start gap-5">
        <button
          type="button"
          onClick={() => setPhotosOpen(true)}
          className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-gold/20 bg-cream-50 transition hover:border-gold/55"
          aria-label={t("adminProps.photos.manage")}
        >
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="128px"
              className="object-cover"
            />
          ) : (
            <ImageIcon
              size={20}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ink/40"
            />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {property.property_reference && (
              <span
                className="rounded-md border border-ink/10 bg-ink/5 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-ink/80"
              >
                {property.property_reference}
              </span>
            )}
            {property.bc_reference && (
              <span
                className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-gold-dark"
              >
                {property.bc_reference}
              </span>
            )}
          </div>
          <h1 className="mt-1 font-serif text-2xl font-medium leading-tight text-ink md:text-3xl">
            {property.title}
          </h1>
          <p className="mt-1 text-[12px] text-ink/55">
            {property.zone} · {property.bedrooms} hbt · {property.bathrooms} baños
            {property.square_meters ? ` · ${property.square_meters} m²` : ""}
            {property.source_url && (
              <>
                {" · "}
                <a
                  href={property.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark hover:underline"
                >
                  {t("adminProps.detail.viewOnAgency")}
                </a>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Acciones rápidas: ver como cliente / copiar SmartLink / descargar PDF.
          Si la propiedad es dual (venta + alquiler), se separan en dos grupos
          para que el título, precio y PDF que ve el cliente correspondan
          siempre a una única operación, sin conflicto. */}
      {isDualOperation ? (
        <div className="mt-5 flex flex-col gap-3">
          {(["sale", "rent"] as const).map((op) => (
            <div
              key={op}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white/60 p-2.5"
            >
              <span className="rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold-dark">
                {op === "sale" ? "Venta" : "Alquiler"}
              </span>
              <a
                href={smartLinkFor(op)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
              >
                <ExternalLink size={13} strokeWidth={1.75} className="text-gold-dark" />
                <span>{t("adminProps.detail.viewAsClient")}</span>
              </a>
              <button
                type="button"
                onClick={() => handleCopyLink(op)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px] font-medium transition",
                  copied === op
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gold/30 bg-cream-50 text-ink hover:border-gold/55 hover:bg-white",
                )}
              >
                {copied === op ? (
                  <Check size={13} strokeWidth={2} />
                ) : (
                  <Link2 size={13} strokeWidth={1.75} className="text-gold-dark" />
                )}
                <span>
                  {copied === op
                    ? t("adminProps.detail.linkCopied")
                    : t("adminProps.detail.copyLink")}
                </span>
              </button>
              <a
                href={pdfHrefFor(op)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
              >
                <FileDown size={13} strokeWidth={1.75} className="text-gold-dark" />
                <span>{t("adminProps.detail.downloadPdf")}</span>
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <a
            href={smartLinkBase}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
          >
            <ExternalLink size={13} strokeWidth={1.75} className="text-gold-dark" />
            <span>{t("adminProps.detail.viewAsClient")}</span>
          </a>
          <button
            type="button"
            onClick={() => handleCopyLink("single")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[12px] font-medium transition",
              copied === "single"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gold/30 bg-cream-50 text-ink hover:border-gold/55 hover:bg-white",
            )}
          >
            {copied === "single" ? (
              <Check size={13} strokeWidth={2} />
            ) : (
              <Link2 size={13} strokeWidth={1.75} className="text-gold-dark" />
            )}
            <span>
              {copied === "single"
                ? t("adminProps.detail.linkCopied")
                : t("adminProps.detail.copyLink")}
            </span>
          </button>
          <a
            href={`/api/admin/properties/${property.slug}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
          >
            <FileDown size={13} strokeWidth={1.75} className="text-gold-dark" />
            <span>{t("adminProps.detail.downloadPdf")}</span>
          </a>
        </div>
      )}

      {/* Descargar fotos (con el logo superpuesto): las fotos no dependen de
          la operación, así que este botón va una sola vez, sea o no dual. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {property.photos.length > 0 && (
          <a
            href={`/api/admin/properties/${property.slug}/download-photos`}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
          >
            <ImageIcon size={13} strokeWidth={1.75} className="text-gold-dark" />
            <span>{t("adminProps.detail.downloadPhotos")}</span>
          </a>
        )}
        {videos.length > 0 && (
          <a
            href={`/api/admin/properties/${property.slug}/download-video`}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
          >
            <Video size={13} strokeWidth={1.75} className="text-gold-dark" />
            <span>Descargar vídeo</span>
          </a>
        )}
        <button
          type="button"
          onClick={handleDeleteProperty}
          disabled={deletingProperty}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-[12px] font-medium text-red-700 transition hover:border-red-400 hover:bg-red-100 disabled:opacity-50"
        >
          <Trash2 size={13} strokeWidth={1.75} />
          <span>{deletingProperty ? "Eliminando..." : "Eliminar propiedad"}</span>
        </button>
      </div>

      {/* Aviso para propiedades sindicadas */}
      {isScraped && (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/10 p-3.5 text-[12px] text-ink/80">
          <AlertTriangle
            size={16}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-gold-dark"
          />
          <span>{t("adminProps.detail.scrapedWarning")}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-6">
        {/* Datos básicos */}
        <Section
          icon={<Info size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.basicData")}
        >
          {isDualOperation ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={`${t("adminProps.detail.title")} — Venta`}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label={`${t("adminProps.detail.title")} — Alquiler`}>
                <input
                  type="text"
                  value={titleRent}
                  onChange={(e) => setTitleRent(e.target.value)}
                  required
                  className={inputClass}
                />
              </Field>
            </div>
          ) : (
            <Field label={t("adminProps.detail.title")}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
          )}
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink/80">
            <span className="flex items-center justify-between gap-2">
              {t("adminProps.detail.description")}
              <button
                type="button"
                onClick={generateDescription}
                disabled={generatingDesc}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-1 text-[11px] font-semibold text-gold-dark transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingDesc ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {generatingDesc
                  ? "Generando…"
                  : description
                    ? "Regenerar con IA"
                    : "Generar con IA"}
              </button>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className={cn(inputClass, "resize-y")}
            />
            {descError && (
              <span className="text-[11px] text-orange-600">{descError}</span>
            )}
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label={
                operation === "rent"
                  ? t("adminProps.detail.priceRent")
                  : t("adminProps.detail.priceSale")
              }
            >
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min={0}
                required
                className={inputClass}
              />
            </Field>
            {isDualOperation && (
              <Field label={t("adminProps.detail.priceRent")}>
                <input
                  type="number"
                  value={rentPrice}
                  onChange={(e) =>
                    setRentPrice(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  min={0}
                  required
                  className={inputClass}
                />
              </Field>
            )}
            <Field label={t("adminProps.detail.bedrooms")}>
              <input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.bathrooms")}>
              <input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(Number(e.target.value))}
                min={0}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("adminProps.detail.squareMeters")}>
              <input
                type="number"
                value={squareMeters}
                onChange={(e) =>
                  setSquareMeters(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                min={0}
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.zone")}>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                required
                className={inputClass}
              />
            </Field>
            <Field label={t("adminProps.detail.status")}>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as PropertyForEdit["status"],
                  )
                }
                className={inputClass}
              >
                <option value="available">
                  {t("adminProps.status.available")}
                </option>
                <option value="reserved">
                  {t("adminProps.status.reserved")}
                </option>
                <option value="sold">{t("adminProps.status.sold")}</option>
                <option value="archived">
                  {t("adminProps.status.archived")}
                </option>
              </select>
            </Field>
          </div>
          <Field label={t("adminProps.detail.address")}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
              placeholder={t("adminProps.detail.addressPlaceholder")}
            />
          </Field>

          {isCL && (
            <Field label="Sector / subzona">
              <input
                type="text"
                list="edit-cl-sectors"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ej. Chicureo, Huinganal, Los Trapenses…"
                className={inputClass}
              />
              <datalist id="edit-cl-sectors">
                {sectorsForCommune(zone).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          )}

          {isCL && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Sup. útil m²">
                <input
                  type="number"
                  value={coveredAreaM2}
                  onChange={(e) =>
                    setCoveredAreaM2(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  min={0}
                  className={inputClass}
                />
              </Field>
              <Field label="Estacionamientos">
                <input
                  type="number"
                  value={parkingLots}
                  onChange={(e) =>
                    setParkingLots(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  min={0}
                  className={inputClass}
                />
              </Field>
              <Field label="N.º de pisos">
                <input
                  type="number"
                  value={floors}
                  onChange={(e) => setFloors(e.target.value === "" ? "" : Number(e.target.value))}
                  min={0}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {isCL && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Año de construcción">
                <input
                  type="number"
                  value={constructionYear}
                  onChange={(e) =>
                    setConstructionYear(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  min={1800}
                  max={2100}
                  className={inputClass}
                />
              </Field>
              <Field label="¿Está en condominio?">
                <div className="flex h-[42px] items-center gap-2 rounded-xl border border-ink/10 bg-white px-3">
                  <label className="flex items-center gap-1.5 text-sm text-ink/75">
                    <input
                      type="checkbox"
                      checked={isCondominium}
                      onChange={(e) => setIsCondominium(e.target.checked)}
                      className="h-4 w-4 rounded border-ink/20 text-gold focus:ring-gold/40"
                    />
                    Sí, está en condominio
                  </label>
                </div>
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Operación">
              <div className="flex h-[42px] items-center gap-4 rounded-xl border border-ink/10 bg-white px-3">
                <label className="flex items-center gap-1.5 text-sm text-ink/75">
                  <input
                    type="checkbox"
                    checked={operations.includes("sale")}
                    onChange={() => toggleOperation("sale")}
                    className="h-4 w-4 rounded border-ink/20 text-gold focus:ring-gold/40"
                  />
                  Venta
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink/75">
                  <input
                    type="checkbox"
                    checked={operations.includes("rent")}
                    onChange={() => toggleOperation("rent")}
                    className="h-4 w-4 rounded border-ink/20 text-gold focus:ring-gold/40"
                  />
                  Alquiler
                </label>
              </div>
            </Field>
            <Field label="Modalidad">
              <select
                value={stay}
                onChange={(e) =>
                  setStay(e.target.value as "short" | "long" | "")
                }
                className={inputClass}
                disabled={!operations.includes("rent")}
              >
                <option value="">— No aplica —</option>
                <option value="long">Larga estancia</option>
                <option value="short">Corta estancia</option>
              </select>
            </Field>
            <Field label="Disponible desde">
              <input
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Mapa EDITABLE: fija la ubicación exacta. Clic o arrastrar el pin
              guarda las coordenadas al pulsar "Guardar cambios". Estas coords
              tienen prioridad sobre el geocoding automático — imprescindible
              para importaciones (Airbnb, Fotocasa…) que no traen coordenadas. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] text-ink/60">
                Fija la ubicación exacta: haz clic en el mapa o arrastra el pin. Se guarda al pulsar “Guardar cambios”.
              </p>
              <button
                type="button"
                onClick={geocodeFromAddress}
                disabled={geocoding}
                className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[12px] font-medium text-ink/70 transition hover:bg-ink/5 disabled:opacity-50"
              >
                {geocoding ? <Loader2 size={13} className="animate-spin" /> : <MapIcon size={13} />}
                Buscar por dirección
              </button>
            </div>
            {geocodeError && (
              <p className="text-[11px] text-orange-600">{geocodeError}</p>
            )}
            <div className="overflow-hidden rounded-lg border border-ink/15">
              <MapPicker
                lat={latitude}
                lng={longitude}
                onChange={(la, ln) => {
                  setLatitude(la);
                  setLongitude(ln);
                  setGeocodeError(null);
                }}
                country={country}
              />
            </div>
            <p className="text-[11px] text-ink/45">
              {latitude && longitude
                ? `Coordenadas fijadas: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · el SmartLink mostrará este punto exacto.`
                : "Sin coordenadas fijadas — coloca el pin para marcar la ubicación exacta del piso."}
            </p>
          </div>
        </Section>

        {/* Info del dueño — NUNCA se sobrescribe por el sync */}
        <Section
          icon={<User size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.ownerSection")}
          subtitle={t("adminProps.detail.ownerSubtitle")}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("adminProps.detail.ownerName")}>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className={inputClass}
                placeholder={t("adminProps.detail.ownerNamePh")}
              />
            </Field>
            <Field label={t("adminProps.detail.ownerPhone")}>
              <input
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                className={inputClass}
                placeholder="+34 ..."
              />
            </Field>
            <Field label={t("adminProps.detail.ownerEmail")}>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className={inputClass}
                placeholder="email@..."
              />
            </Field>
          </div>
          <Field label={t("adminProps.detail.internalNotes")}>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={4}
              className={cn(inputClass, "resize-y")}
              placeholder={t("adminProps.detail.internalNotesPh")}
            />
          </Field>
        </Section>

        {/* Características: auto-detectadas (de la descripción) + manuales */}
        <Section
          icon={<Info size={15} strokeWidth={1.75} />}
          title="Características"
          subtitle="Las auto-detectadas vienen de la descripción del piso (se actualizan en cada sync). Añade manuales si conoces alguna que la descripción no menciona."
        >
          {property.features.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink/55">
                Auto-detectadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {property.features.map((f) => (
                  <span
                    key={`auto-${f}`}
                    className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-ink/5 px-2.5 py-1 text-[12px] text-ink/70"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mb-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink/55">
              Checklist ({isCL ? "PortalInmobiliario" : "habituales"})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {checklistFeatures.map((f) => {
                const active =
                  featuresManual.some((x) => x.toLowerCase() === f.toLowerCase()) ||
                  property.features.some((x) => x.toLowerCase() === f.toLowerCase());
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeature(f)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition",
                      active
                        ? "border-gold/50 bg-gold/15 text-ink"
                        : "border-ink/12 bg-white/50 text-ink/60 hover:border-gold/40 hover:text-ink",
                    )}
                  >
                    {active && <Check size={11} strokeWidth={2.5} className="text-gold-dark" />}
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink/55">
              Manuales
            </p>
            {featuresManual.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {featuresManual.map((f) => (
                  <span
                    key={`man-${f}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 text-[12px] text-ink"
                  >
                    {f}
                    <button
                      type="button"
                      onClick={() => removeManualFeature(f)}
                      className="text-ink/55 hover:text-rose-700"
                      aria-label={`Quitar ${f}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualFeature();
                  }
                }}
                placeholder="Ej. Vistas al parque, Suelo de tarima, Bodega…"
                className={cn(inputClass, "flex-1")}
              />
              <button
                type="button"
                onClick={addManualFeature}
                disabled={!newFeature.trim()}
                className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink disabled:opacity-50"
              >
                Añadir
              </button>
            </div>
          </div>
        </Section>

        {/* SmartLinks: links únicos con tracking por envío */}
        <Section
          icon={<Send size={15} strokeWidth={1.75} />}
          title={t("adminProps.smartLinks.title")}
        >
          <SmartLinksPanel slug={property.slug} initialLinks={shares} />
        </Section>

        {/* Fotos */}
        <Section
          icon={<ImageIcon size={15} strokeWidth={1.75} />}
          title={t("adminProps.detail.photosSection")}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPhotosOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <ImageIcon size={13} strokeWidth={1.75} className="text-gold" />
              <span>
                {t("adminProps.photos.action", {
                  count: property.photos.length,
                })}
              </span>
            </button>
            <button
              type="button"
              onClick={handleCleanWatermark}
              disabled={cleaningWatermark}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-[12px] font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              title="Quita la marca de agua de la agencia de origen (reprocesa las fotos, necesita ≥8)"
            >
              {cleaningWatermark ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Droplets size={13} />
              )}
              <span>Quitar marca de agua</span>
            </button>
          </div>
          {watermarkMsg && (
            <p className="mt-2 text-[12px] text-ink/60">{watermarkMsg}</p>
          )}
        </Section>

        {/* Videos */}
        <Section
          icon={<Video size={15} strokeWidth={1.75} />}
          title="Videos"
        >
          {/* Input oculto para subir archivo de video */}
          <input
            type="file"
            ref={videoFileInputRef}
            accept="video/*"
            onChange={handleVideoFileUpload}
            className="hidden"
          />
          <div className="flex gap-2">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddVideo();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=… o Vimeo"
              className={cn(inputClass, "flex-1")}
            />
            <button
              type="button"
              onClick={() => void handleAddVideo()}
              disabled={addingVideo || !videoUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink disabled:opacity-50"
            >
              {addingVideo ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} strokeWidth={1.75} />
              )}
              Añadir
            </button>
          </div>
          {uploadingVideo ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3 text-[12px] text-ink/70">
              <Loader2 size={14} className="animate-spin text-gold" />
              <span className="font-medium">Subiendo vídeo… no cierres esta página</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoFileInputRef.current?.click()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Plus size={13} strokeWidth={1.75} />
              Subir video (.mp4)
            </button>
          )}
          {videoError && (
            <p className="mt-1 text-[12px] text-rose-700">{videoError}</p>
          )}
          {videos.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              {videos.map((item) => {
                const embed = getEmbedUrl(item.url);
                const isDirectVideo = !embed && item.storage_path && !item.storage_path.startsWith("http");
                return (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-lg border border-ink/10 bg-white/85"
                  >
                    {embed ? (
                      <iframe
                        src={embed}
                        className="aspect-video w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : isDirectVideo ? (
                      <video
                        src={item.url}
                        controls
                        className="aspect-video w-full"
                        preload="metadata"
                      />
                    ) : (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-ink/75 hover:text-gold"
                      >
                        <Video size={14} strokeWidth={1.75} />
                        {item.url}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteVideo(item)}
                      className="absolute right-2 top-2 rounded-full bg-ink/70 p-1 text-white transition hover:bg-rose-700"
                      title="Eliminar video"
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {videos.length === 0 && (
            <p className="mt-2 text-[12px] text-ink/45">
              Sin videos aún. Añade un enlace de YouTube/Vimeo o sube un archivo MP4.
            </p>
          )}

          {/* Generación del vídeo a partir de las fotos de la ficha. Enseña el
              peso estimado antes de dejar renderizar. */}
          <PropertyVideoPanel
            subject={{ type: "property", slug: property.slug }}
            photoCount={property.photos.length}
            hasExistingVideo={videos.length > 0}
          />
        </Section>

        {/* Planos */}
        <Section
          icon={<FileImage size={15} strokeWidth={1.75} />}
          title="Planos"
        >
          <input
            type="file"
            ref={planInputRef}
            multiple
            accept="image/*"
            onChange={handlePlanUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => planInputRef.current?.click()}
            disabled={uploadingPlan}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink disabled:opacity-50"
          >
            {uploadingPlan ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} strokeWidth={1.75} />
            )}
            Subir plano
          </button>
          {planError && (
            <p className="mt-1 text-[12px] text-rose-700">{planError}</p>
          )}
          {plans.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              {plans.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-ink/10 bg-ink/5"
                >
                  <Image
                    src={item.url}
                    alt={item.file_name}
                    fill
                    sizes="(max-width: 768px) 50vw, 33vw"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeletePlan(item)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white opacity-0 transition hover:bg-rose-700 group-hover:opacity-100"
                    title="Eliminar plano"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                    {item.file_name}
                  </div>
                </div>
              ))}
            </div>
          )}
          {plans.length === 0 && (
            <p className="mt-2 text-[12px] text-ink/45">
              Sin planos aún. Sube imágenes de la distribución.
            </p>
          )}
        </Section>

        {/* Publicación en web pública */}
        <Section
          icon={<Globe size={15} strokeWidth={1.75} />}
          title="Web Pública"
          subtitle="Controla si esta propiedad aparece en el portal web público (bcousinoprop.com/web/propiedades)."
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPublishedWeb((v) => !v)}
              aria-pressed={publishedWeb}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none",
                publishedWeb ? "bg-gold" : "bg-ink/20",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  publishedWeb ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
            <span className="text-sm text-ink/80">
              {publishedWeb
                ? "Publicada en el portal web"
                : "No publicada · Solo visible internamente"}
            </span>
          </div>
          {publishedWeb && (
            <p className="text-[12px] text-ink/50">
              La propiedad aparecerá en{" "}
              <a
                href="/web/propiedades"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-dark hover:underline"
              >
                /web/propiedades
              </a>{" "}
              una vez guardada.
            </p>
          )}
        </Section>

        {/* Barra inferior sticky con guardar */}
        <div className="sticky bottom-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-gold/25 bg-cream-50/95 px-4 py-3 shadow-[0_15px_40px_-20px_rgba(40,28,10,0.35)] backdrop-blur">
          <div className="text-[12px] text-ink/65">
            {saveState.kind === "saved" && (
              <span className="text-emerald-700">
                ✓ {t("adminProps.detail.saved")}
              </span>
            )}
            {saveState.kind === "error" && (
              <span className="text-rose-700">
                {t("adminProps.detail.errorSaving", { error: saveState.msg })}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} strokeWidth={1.75} className="text-gold" />
            )}
            <span>{t("adminProps.detail.save")}</span>
          </button>
        </div>
      </form>

      <PropertyPhotosModal
        open={photosOpen}
        onClose={() => setPhotosOpen(false)}
        slug={property.slug}
        title={property.title}
        country={country}
        initialPhotos={property.photos.map((p) => ({
          url: p.url,
          isCover: p.is_cover,
        }))}
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none";

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/80 p-5 shadow-[0_10px_30px_-20px_rgba(40,28,10,0.25)] md:p-6">
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 text-gold-dark">{icon}</span>
        <div>
          <h2 className="font-serif text-lg font-medium text-ink">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-ink/55">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink/80">
      <span>{label}</span>
      {children}
    </label>
  );
}

