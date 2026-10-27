"use client";

import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Tag as TagIcon,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { archiveProperty } from "@/app/(admin)/admin/propiedades/actions";
import {
  type AgencyOption,
  NewPropertyModal,
} from "@/components/admin/new-property-modal";
import { BatchTagMenu, TagFilterMenu } from "@/components/admin/property-tags/tag-menus";
import {
  ActiveChips,
  ADMIN_STATUS_OPTIONS,
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  bedroomsChipLabel,
  type FilterChip,
  FilterSelect,
  ZoneFilterMenu,
  FLOOR_OPTIONS,
  MoreFiltersToggle,
  OPERATION_OPTIONS,
  RangeChip,
  SearchBox,
  STAY_OPTIONS,
} from "@/components/admin/property-search";
import { TagChip } from "@/components/admin/property-tags/tag-chip";
import { TagManagerDialog } from "@/components/admin/property-tags/tag-manager-dialog";
import { assignTags } from "@/components/admin/property-tags/tag-api";
import {
  applyTagChange,
  type PropertyTag,
} from "@/lib/properties/tags";
import { PropertyPhotosModal } from "@/components/admin/property-photos-modal";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { useT } from "@/lib/i18n/provider";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { canAccess } from "@/lib/permissions";
import { type AdminPropertyFilters, matchesAdminPropertyFilters } from "@/lib/properties/admin-filter";
import { buildListSearch, rowAnchorId, withReturnContext } from "@/lib/properties/admin-list-url";
import { LinkPendingOverlay } from "@/components/admin/nav-pending";
import { PORTAL_URL } from "@/lib/portal-url";
import type { AdminProperty, AdminPropertyStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AdminPropertyStatus, string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reserved: "border-amber-200 bg-amber-50 text-amber-700",
  rented: "border-blue-200 bg-blue-50 text-blue-700",
  sold: "border-violet-200 bg-violet-50 text-violet-700",
  draft: "border-ink/15 bg-ink/5 text-ink/55",
};

const STATUS_LABELS: Record<AdminPropertyStatus, string> = {
  available: "Disponible",
  reserved: "Reservado",
  rented: "Alquilado",
  sold: "Vendido",
  draft: "Borrador",
};

type PropertiesAdminProps = {
  properties: AdminProperty[];
  agencies: AgencyOption[];
  currentRole?: string;
  country: Country;
  initialTags?: PropertyTag[];
};

// La lista lee los filtros de la URL al montarse y después la escribe ella
// misma con replaceState. Si la URL cambia por OTRA vía sin remontar la página
// (el menú «Propiedades» estando en una lista filtrada, «Ver archivadas»…), se
// remonta para que el estado vuelva a salir de la URL: la URL manda, y los
// controles nunca contradicen la barra de direcciones (CRM-01).
export function PropertiesAdminClient(props: PropertiesAdminProps) {
  const search = useSearchParams().toString();
  const ownWrite = useRef<string | null>(null);
  const seen = useRef(search);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (search === seen.current) return;
    seen.current = search;
    if (search !== ownWrite.current) setGeneration((g) => g + 1);
  }, [search]);
  return (
    <PropertiesAdminList
      key={generation}
      {...props}
      onUrlWrite={(qs) => {
        ownWrite.current = qs;
      }}
    />
  );
}

function PropertiesAdminList({
  properties: propertiesProp,
  agencies,
  currentRole,
  country,
  initialTags = [],
  onUrlWrite,
}: PropertiesAdminProps & { onUrlWrite: (search: string) => void }) {
  const config = getCountryConfig(country);
  const t = useT();
  const { toast } = useToast();

  // Los filtros viven en la URL (?operacion=…&distrito=…). Así, al entrar en una
  // ficha y volver atrás, el navegador restaura la misma URL y la lista aparece
  // filtrada igual que la dejaste, en vez de reiniciarse. De regalo, el listado
  // filtrado se puede compartir o guardar en marcadores.
  const searchParams = useSearchParams();
  // Lee un parámetro validándolo contra los valores permitidos: una URL
  // manipulada a mano no debe meter basura en un filtro tipado.
  const param = <T extends string>(key: string, allowed?: readonly T[]): T => {
    const raw = searchParams.get(key) ?? "";
    if (allowed && !allowed.includes(raw as T)) return "" as T;
    return raw as T;
  };

  const [query, setQuery] = useState(() => param("q"));
  const [operationFilter, setOperationFilter] = useState<"" | "alquiler" | "venta">(
    () => param("operacion", ["", "alquiler", "venta"] as const),
  );
  const [statusFilter, setStatusFilter] = useState<"" | "available" | "reserved" | "sold" | "rented" | "draft">(
    () => param("estado", ["", "available", "reserved", "sold", "rented", "draft"] as const),
  );
  const [zoneFilter, setZoneFilter] = useState<string>(() => param("distrito"));
  const [subzoneFilter, setSubzoneFilter] = useState<string>(() => param("zona"));
  const [agencyFilter, setAgencyFilter] = useState<string>(() => param("agencia"));
  const [stayFilter, setStayFilter] = useState<"" | "larga" | "corta">(
    () => param("estancia", ["", "larga", "corta"] as const),
  );
  const [bedroomsFilter, setBedroomsFilter] = useState<string>(() => param("dormitorios"));
  const [bathroomsFilter, setBathroomsFilter] = useState<string>(() => param("banos"));
  const [floorFilter, setFloorFilter] = useState<string>(() => param("planta"));
  const [minPrice, setMinPrice] = useState<string>(() => param("precioMin"));
  const [maxPrice, setMaxPrice] = useState<string>(() => param("precioMax"));
  const [minM2, setMinM2] = useState<string>(() => param("m2Min"));
  const [maxM2, setMaxM2] = useState<string>(() => param("m2Max"));
  const [tagFilter, setTagFilter] = useState<string[]>(() =>
    param("etiquetas").split(",").filter(Boolean),
  );
  const [page, setPage] = useState(() => {
    const n = Number.parseInt(searchParams.get("pagina") ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  });
  // Etiquetas: el catálogo y la asignación viven en estado local para que
  // crear/asignar se vea al instante sin recargar la lista entera.
  const [tags, setTags] = useState<PropertyTag[]>(initialTags);
  const [tagMap, setTagMap] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(propertiesProp.map((p) => [p.id, p.tagIds ?? []])),
  );
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const properties = useMemo(
    () => propertiesProp.map((p) => ({ ...p, tagIds: tagMap[p.id] ?? [] })),
    [propertiesProp, tagMap],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(
    () => Boolean(param("estancia") || param("dormitorios") || param("banos") || param("planta") || param("precioMin") || param("precioMax") || param("m2Min") || param("m2Max") || param("zona")),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  // Opciones únicas para los selects de zona y agencia, derivadas del
  // listado actual. Ordenadas alfabéticamente.
  const zoneOptions = useMemo(
    () =>
      Array.from(new Set(properties.map((p) => p.zone))).filter(Boolean).sort(),
    [properties],
  );
  const zoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of properties) if (p.zone) m.set(p.zone, (m.get(p.zone) ?? 0) + 1);
    return [...m].map(([name, count]) => ({ name, count }));
  }, [properties]);
  // Subzonas disponibles dentro del distrito seleccionado.
  const subzoneOptions = useMemo(
    () =>
      zoneFilter
        ? Array.from(
            new Set(
              properties
                .filter((p) => p.zone === zoneFilter && p.subzone)
                .map((p) => p.subzone as string),
            ),
          ).sort((a, b) => a.localeCompare(b, "es"))
        : [],
    [properties, zoneFilter],
  );
  const agencyOptions = useMemo(
    () =>
      Array.from(
        new Map(
          properties.map((p) => [p.agencyId, p.agencyName]),
        ).entries(),
      )
        .filter(([id]) => Boolean(id))
        .sort((a, b) => a[1].localeCompare(b[1])),
    [properties],
  );

  // Cerrar el menú al hacer click fuera o al pulsar Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const filtered = useMemo(() => {
    const f: AdminPropertyFilters = {
      query,
      tagIds: tagFilter,
      operation: operationFilter,
      status: statusFilter,
      zone: zoneFilter,
      subzone: subzoneFilter,
      agency: agencyFilter,
      stay: stayFilter,
      bedrooms: bedroomsFilter,
      bathrooms: bathroomsFilter,
      floor: floorFilter,
      minPrice,
      maxPrice,
      minM2,
      maxM2,
    };
    return properties.filter((p) => matchesAdminPropertyFilters(p, f, (id) => tagById.get(id)?.name));
  }, [
    properties,
    tagById,
    tagFilter,
    query,
    operationFilter,
    statusFilter,
    zoneFilter,
    subzoneFilter,
    agencyFilter,
    stayFilter,
    bedroomsFilter,
    bathroomsFilter,
    floorFilter,
    minPrice,
    maxPrice,
    minM2,
    maxM2,
  ]);

  // Paginación: solo renderizamos una página de la tabla (DOM acotado).
  const PER_PAGE = 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Al cambiar cualquier filtro/búsqueda, volver a la primera página. Se salta
  // el primer render: si no, al volver atrás con ?pagina=3 este efecto la
  // reseteaba a 1 nada más montar y perdías la página en la que estabas.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [
    query,
    tagFilter,
    operationFilter,
    statusFilter,
    zoneFilter,
    subzoneFilter,
    agencyFilter,
    stayFilter,
    bedroomsFilter,
    bathroomsFilter,
    floorFilter,
    minPrice,
    maxPrice,
    minM2,
    maxM2,
  ]);

  // Espeja los filtros en la URL. Usamos history.replaceState (no router.push)
  // a propósito: no dispara navegación ni recarga los datos del servidor —solo
  // reescribe la barra de direcciones— así que escribir en el buscador sigue
  // siendo instantáneo con el catálogo entero en memoria. `replace` en vez de
  // `push` para no llenar el historial de estados intermedios: "atrás" desde
  // una ficha te devuelve a la lista, no a cada letra que tecleaste.
  const urlState = {
    query,
    tagFilter,
    operationFilter,
    statusFilter,
    zoneFilter,
    subzoneFilter,
    agencyFilter,
    stayFilter,
    bedroomsFilter,
    bathroomsFilter,
    floorFilter,
    minPrice,
    maxPrice,
    minM2,
    maxM2,
    page,
  };
  useEffect(() => {
    const qs = buildListSearch(urlState, window.location.search);
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (url !== window.location.pathname + window.location.search) {
      onUrlWrite(qs);
      window.history.replaceState(null, "", url);
    }
    // urlState se reconstruye en cada render; las dependencias son sus campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    operationFilter,
    statusFilter,
    zoneFilter,
    subzoneFilter,
    agencyFilter,
    stayFilter,
    bedroomsFilter,
    bathroomsFilter,
    floorFilter,
    minPrice,
    maxPrice,
    minM2,
    maxM2,
    page,
    tagFilter,
  ]);

  // Si la página ya no existe (otro conjunto tras «Ver archivadas», datos que
  // cambiaron…), se queda en la última y la URL se corrige: la página de la
  // URL siempre es la que se ve. Si sigue existiendo, no se toca.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Consulta actual de la lista para el «Volver» de cada ficha (`?volver=`).
  // Se calcula del estado, no de window.location: en este render la URL aún no
  // se ha reescrito. `searchParams` aporta lo que la lista no maneja
  // (`archivadas`).
  const returnSearch = buildListSearch({ ...urlState, page: safePage }, searchParams.toString());

  // Al volver de una ficha, la URL trae el ancla de su fila (#propiedad-…):
  // se lleva a la vista y se resalta un momento (decisión D1).
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null);
  useEffect(() => {
    let hash = "";
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const slug = hash.startsWith(rowAnchorId("")) ? hash.slice(rowAnchorId("").length) : "";
    if (!slug) return;
    const el = document.getElementById(rowAnchorId(slug));
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setHighlightSlug(slug);
    const timer = window.setTimeout(() => setHighlightSlug(null), 2500);
    return () => window.clearTimeout(timer);
  }, []);

  const hasActiveFilters = Boolean(
    tagFilter.length > 0 ||
      operationFilter ||
      statusFilter ||
      zoneFilter ||
      subzoneFilter ||
      agencyFilter ||
      stayFilter ||
      bedroomsFilter ||
      bathroomsFilter ||
      floorFilter ||
      minPrice ||
      maxPrice ||
      minM2 ||
      maxM2 ||
      query,
  );

  const clearFilters = () => {
    setQuery("");
    setTagFilter([]);
    setOperationFilter("");
    setStatusFilter("");
    setZoneFilter("");
    setSubzoneFilter("");
    setAgencyFilter("");
    setStayFilter("");
    setBedroomsFilter("");
    setBathroomsFilter("");
    setFloorFilter("");
    setMinPrice("");
    setMaxPrice("");
    setMinM2("");
    setMaxM2("");
  };

  // --- Selección múltiple para copiar URLs y enviarlas a clientes ---
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      if (allFilteredSelected) {
        // Deseleccionar solo las filtradas (conserva selecciones de otros filtros)
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const selectedProps = useMemo(
    () => properties.filter((p) => selected.has(p.id)),
    [properties, selected],
  );

  const shareUrl = (id: string) => `${PORTAL_URL}/compartir/${id}`;

  const copyToClipboard = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage, "success");
    } catch {
      toast("No se pudo copiar al portapapeles", "error");
    }
  };

  const copyUrls = () => {
    const text = selectedProps.map((p) => shareUrl(p.id)).join("\n");
    copyToClipboard(
      text,
      `${selectedProps.length} URL${selectedProps.length === 1 ? "" : "s"} copiada${selectedProps.length === 1 ? "" : "s"}`,
    );
  };

  // Formato listo para pegar en WhatsApp/email: título · precio · enlace
  const copyForClients = () => {
    const text = selectedProps
      .map((p) => {
        const price = `${config.formatPrice(p.price, p.currency)}${p.operation === "alquiler" && p.price > 0 ? "/mes" : ""}`;
        return `🏠 ${p.title}\n💰 ${price} · ${p.zone}\n🔗 ${shareUrl(p.id)}`;
      })
      .join("\n\n");
    copyToClipboard(text, "Mensaje copiado, listo para enviar");
  };

  // Chips de filtros activos (cada uno se quita con su ×).
  const activeChips: FilterChip[] = [];
  for (const id of tagFilter) {
    const t = tagById.get(id);
    if (t)
      activeChips.push({
        key: `tag-${id}`,
        label: `Etiqueta: ${t.name}`,
        clear: () => setTagFilter((p) => p.filter((x) => x !== id)),
      });
  }
  if (operationFilter)
    activeChips.push({
      key: "op",
      label: operationFilter === "venta" ? "Venta" : "Alquiler",
      clear: () => setOperationFilter(""),
    });
  if (statusFilter)
    activeChips.push({
      key: "estado",
      label: STATUS_LABELS[statusFilter],
      clear: () => setStatusFilter(""),
    });
  if (zoneFilter)
    activeChips.push({
      key: "distrito",
      label: zoneFilter,
      clear: () => {
        setZoneFilter("");
        setSubzoneFilter("");
      },
    });
  if (subzoneFilter)
    activeChips.push({
      key: "zona",
      label: subzoneFilter,
      clear: () => setSubzoneFilter(""),
    });
  if (agencyFilter)
    activeChips.push({
      key: "agencia",
      label: agencyOptions.find(([id]) => id === agencyFilter)?.[1] ?? agencyFilter,
      clear: () => setAgencyFilter(""),
    });
  if (stayFilter)
    activeChips.push({
      key: "estancia",
      label: `Estancia ${stayFilter}`,
      clear: () => setStayFilter(""),
    });
  if (bedroomsFilter)
    activeChips.push({
      key: "dorm",
      label: bedroomsChipLabel(bedroomsFilter),
      clear: () => setBedroomsFilter(""),
    });
  if (bathroomsFilter)
    activeChips.push({
      key: "banos",
      label: `${bathroomsFilter}+ baños`,
      clear: () => setBathroomsFilter(""),
    });
  if (floorFilter)
    activeChips.push({
      key: "planta",
      label: `Planta ${floorFilter}ª o más`,
      clear: () => setFloorFilter(""),
    });
  if (minPrice || maxPrice)
    activeChips.push({
      key: "precio",
      label: `Precio ${minPrice || "0"} – ${maxPrice || "sin tope"}`,
      clear: () => {
        setMinPrice("");
        setMaxPrice("");
      },
    });
  if (minM2 || maxM2)
    activeChips.push({
      key: "m2",
      label: `${minM2 || "0"} – ${maxM2 || "sin tope"} m²`,
      clear: () => {
        setMinM2("");
        setMaxM2("");
      },
    });
  if (query.trim())
    activeChips.push({
      key: "q",
      label: `“${query.trim()}”`,
      clear: () => setQuery(""),
    });

  // Cuántos filtros "avanzados" hay activos (para el contador del botón).
  const advancedCount = [
    subzoneFilter,
    stayFilter,
    bedroomsFilter,
    bathroomsFilter,
    floorFilter,
    minPrice || maxPrice,
    minM2 || maxM2,
  ].filter(Boolean).length;
  const canEdit = !currentRole || canAccess(currentRole, "properties", "edit");

  const [batchBusy, setBatchBusy] = useState(false);
  const applyBatchTag = async (tagId: string, mode: "add" | "remove") => {
    const slugs = Array.from(selected);
    if (slugs.length === 0) return;
    setBatchBusy(true);
    const r = await assignTags(slugs, mode === "add" ? [tagId] : [], mode === "remove" ? [tagId] : []);
    setBatchBusy(false);
    if (!r.ok) return toast(r.error, "error");
    setTagMap((prev) => {
      const next = { ...prev };
      for (const slug of slugs)
        next[slug] = applyTagChange(prev[slug], mode === "add" ? [tagId] : [], mode === "remove" ? [tagId] : []);
      return next;
    });
    const name = tagById.get(tagId)?.name ?? "etiqueta";
    toast(
      `${mode === "add" ? "Añadida" : "Quitada"} «${name}» en ${slugs.length} propiedad${slugs.length === 1 ? "" : "es"}`,
      "success",
    );
  };
  const canDeleteTags = !currentRole || canAccess(currentRole, "properties", "delete");

  return (
    <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-4 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm sm:p-5 md:p-6">
      {/* Fila 1: buscador + alta */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscar por título, ref. BC (BC-1766), ref. de portal, zona o etiqueta…"
        />
        <button
          type="button"
          onClick={() => setTagManagerOpen(true)}
          className="crm-button inline-flex items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-ink/75 transition hover:border-gold/55 hover:text-ink"
        >
          <TagIcon size={14} strokeWidth={1.75} className="text-gold-dark" />
          <span>Etiquetas</span>
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="crm-button flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-cream-50 transition hover:bg-ink-soft"
          >
            <Plus size={14} strokeWidth={1.75} className="text-gold" />
            <span>{t("adminProps.add")}</span>
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className={cn("transition", menuOpen ? "rotate-180" : "rotate-0")}
            />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gold/20 bg-cream-50 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setModalOpen(true);
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm text-ink transition hover:bg-gold/10"
              >
                <Pencil size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-dark" />
                <div>
                  <p className="font-medium">{t("adminProps.add.manual")}</p>
                  <p className="text-xs text-ink/55">{t("adminProps.add.manual.help")}</p>
                </div>
              </button>
              {/* "Importar por link" navega a la página dedicada
                  /admin/propiedades/importar (Idealista / Fotocasa / Inmoweb). */}
              <Link
                href={`${config.prefix}/propiedades/importar`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-start gap-3 border-t border-gold/10 px-4 py-3 text-left text-sm text-ink transition hover:bg-gold/10"
              >
                <LinkIcon size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-dark" />
                <div>
                  <p className="font-medium">{t("adminProps.add.byLink")}</p>
                  <p className="text-xs text-ink/55">{t("adminProps.add.byLink.help")}</p>
                </div>
              </Link>
              {/* Importar desde PDF (BCP-01 P8): España V1. Se lee en el navegador
                  y sale un borrador por vivienda para revisar. */}
              {country === "es" ? (
                <Link
                  href={`${config.prefix}/propiedades/importar/pdf`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-start gap-3 border-t border-gold/10 px-4 py-3 text-left text-sm text-ink transition hover:bg-gold/10"
                >
                  <FileText size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-gold-dark" />
                  <div>
                    <p className="font-medium">{t("adminProps.add.byPdf")}</p>
                    <p className="text-xs text-ink/55">{t("adminProps.add.byPdf.help")}</p>
                  </div>
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: filtros principales + "Más filtros" */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <FilterSelect
          label="Operación"
          value={operationFilter}
          onChange={(v) => setOperationFilter(v as typeof operationFilter)}
          options={OPERATION_OPTIONS}
        />
        <FilterSelect
          label="Estado"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={ADMIN_STATUS_OPTIONS}
        />
        <ZoneFilterMenu
          zones={zoneCounts}
          value={zoneFilter}
          onChange={(v) => {
            setZoneFilter(v);
            setSubzoneFilter(""); // al cambiar de distrito, reiniciar subzona
          }}
        />
        <FilterSelect
          label="Agencia"
          value={agencyFilter}
          onChange={setAgencyFilter}
          options={[
            { value: "", label: "Todas" },
            ...agencyOptions.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <TagFilterMenu
          tags={tags}
          selected={tagFilter}
          onChange={setTagFilter}
          onManage={() => setTagManagerOpen(true)}
        />
        <MoreFiltersToggle open={moreOpen} count={advancedCount} onToggle={() => setMoreOpen((o) => !o)} />
        <span className="ml-auto text-xs font-semibold text-ink/60">
          {hasActiveFilters
            ? `${filtered.length} resultado${filtered.length === 1 ? "" : "s"} de ${properties.length}`
            : `${properties.length} propiedades`}
        </span>
      </div>

      {moreOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gold/15 bg-white/55 p-3 text-xs">
          {subzoneOptions.length > 0 && (
            <FilterSelect
              label="Subzona"
              value={subzoneFilter}
              onChange={setSubzoneFilter}
              options={[
                { value: "", label: "Todo el distrito" },
                ...subzoneOptions.map((s) => ({ value: s, label: s })),
              ]}
            />
          )}
          <FilterSelect
            label="Estancia"
            value={stayFilter}
            onChange={(v) => setStayFilter(v as typeof stayFilter)}
            options={STAY_OPTIONS}
          />
          <FilterSelect
            label="Dormitorios"
            value={bedroomsFilter}
            onChange={setBedroomsFilter}
            options={BEDROOM_OPTIONS}
          />
          <FilterSelect
            label="Baños"
            value={bathroomsFilter}
            onChange={setBathroomsFilter}
            options={BATHROOM_OPTIONS}
          />
          <FilterSelect
            label="Planta"
            value={floorFilter}
            onChange={setFloorFilter}
            options={FLOOR_OPTIONS}
          />
          <RangeChip label="Precio" min={minPrice} max={maxPrice} onMin={setMinPrice} onMax={setMaxPrice} />
          <RangeChip label="M²" min={minM2} max={maxM2} onMin={setMinM2} onMax={setMaxM2} />
        </div>
      )}

      {/* Chips de filtros activos + limpiar */}
      <ActiveChips chips={activeChips} onClearAll={clearFilters} />

      {/* Barra de selección: copiar URLs para enviar a clientes */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2">
          <span className="text-xs font-semibold text-gold-dark">
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={copyUrls}
            className="crm-button inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-cream-50 transition hover:bg-ink-soft"
          >
            <Copy size={12} strokeWidth={1.75} className="text-gold" />
            <span>Copiar URLs</span>
          </button>
          <button
            type="button"
            onClick={copyForClients}
            className="crm-button inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-emerald-700 transition hover:bg-emerald-100"
          >
            <MessageCircle size={12} strokeWidth={1.75} />
            <span>Copiar para WhatsApp</span>
          </button>
          {canEdit && (
            <BatchTagMenu
              tags={tags}
              count={selected.size}
              busy={batchBusy}
              onApply={applyBatchTag}
              onManage={() => setTagManagerOpen(true)}
            />
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="crm-button inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-ink/65 transition hover:border-rose-300 hover:text-rose-700"
          >
            <X size={12} strokeWidth={1.75} />
            <span>Limpiar selección</span>
          </button>
        </div>
      )}

      <TagManagerDialog
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        tags={tags}
        country={country}
        canDelete={canDeleteTags}
        onTagsChange={setTags}
        onTagDeleted={(id) => {
          setTagFilter((p) => p.filter((x) => x !== id));
          setTagMap((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([k, v]) => [k, v.filter((x) => x !== id)]),
            ),
          );
        }}
      />

      <NewPropertyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        agencies={agencies}
        country={country}
      />

      {/* Lista en tarjetas: sin scroll horizontal, se apila en móvil. */}
      <div className="mt-5">
        {filtered.length > 0 && (
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <SelectCheckbox
              checked={allFilteredSelected}
              onChange={toggleAllFiltered}
              ariaLabel="Seleccionar todas las propiedades filtradas"
            />
            <span className="crm-label-sm text-ink/45">Seleccionar todas</span>
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-ink/55">
            {t("adminProps.empty")}
            {hasActiveFilters && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="crm-button rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-ink/70 transition hover:border-gold/55"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {paged.map((p) => (
              <PropertyRow
                key={p.id}
                property={p}
                canEdit={canEdit}
                selected={selected.has(p.id)}
                onToggleSelect={() => toggleOne(p.id)}
                highlighted={highlightSlug === p.id}
                returnSearch={returnSearch}
                config={config}
                galleryCountry={country}
                tags={(p.tagIds ?? []).map((id) => tagById.get(id)).filter((t): t is PropertyTag => Boolean(t))}
              />
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
      )}
    </section>
  );
}

function PropertyRow({
  property,
  canEdit = true,
  selected = false,
  onToggleSelect,
  highlighted = false,
  returnSearch = "",
  config,
  galleryCountry,
  tags = [],
}: {
  property: AdminProperty;
  canEdit?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  highlighted?: boolean;
  returnSearch?: string;
  config: ReturnType<typeof getCountryConfig>;
  galleryCountry: Country;
  tags?: PropertyTag[];
}) {
  const t = useT();
  const [photosOpen, setPhotosOpen] = useState(false);
  // Sin "al mes" cuando no hay precio ("Precio a consultar").
  const isRent = property.operation === "alquiler" && property.price > 0;
  const formatted = config.formatPrice(property.price, property.currency);
  // Portada efectiva y nº de fotos ya calculados en el servidor: la lista no
  // recibe la galería (CRM-02, E1).
  const cover = property.coverPhotoUrl ?? null;
  const photoCount = property.photoCount;
  const editHref = withReturnContext(`${config.prefix}/propiedades/${property.id}`, returnSearch);
  // Referencia visible: SIEMPRE la BC. Las de portal y la PROP-… viven en la
  // ficha (Notas internas), no aquí.
  const bcRef = property.bcReference;

  return (
    <li
      id={rowAnchorId(property.id)}
      className={cn(
        "relative flex scroll-mt-24 flex-col gap-3 rounded-2xl border p-3 transition sm:flex-row sm:items-center sm:gap-4 sm:p-3.5",
        selected
          ? "border-gold/50 bg-gold/10"
          : "border-gold/10 bg-white/65 hover:border-gold/35 hover:bg-white/90",
        highlighted && "ring-2 ring-gold/60",
      )}
    >
      <div className="flex items-start gap-3 sm:contents">
        <div className="pt-1 sm:pt-0">
          <SelectCheckbox
            checked={selected}
            onChange={() => onToggleSelect?.()}
            ariaLabel={`Seleccionar ${property.title}`}
          />
        </div>

        <button
          type="button"
          onClick={() => setPhotosOpen(true)}
          aria-label={t("adminProps.photos.manage")}
          className="relative h-[88px] w-[118px] shrink-0 overflow-hidden rounded-xl border border-gold/15 transition hover:border-gold/55 sm:h-[96px] sm:w-[132px]"
          style={cover ? undefined : { backgroundImage: PLACEHOLDER_GRADIENT }}
        >
          {cover ? (
            <Image src={cover} alt="" fill sizes="132px" className="object-cover" />
          ) : (
            <ImageIcon
              size={18}
              strokeWidth={1.75}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ink/45"
            />
          )}
          {photoCount > 0 && (
            <span className="absolute bottom-1 right-1 rounded-md bg-ink/70 px-1.5 py-0.5 text-xs font-semibold text-cream-50">
              {photoCount}
            </span>
          )}
        </button>

        {/* Móvil: precio junto a la miniatura */}
        <div className="min-w-0 flex-1 sm:hidden">
          <PriceBlock formatted={formatted} isRent={isRent} />
        </div>
      </div>

      {/* Título y datos */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {bcRef ? (
            <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-gold-dark">
              {bcRef}
            </span>
          ) : (
            <span className="rounded-md border border-ink/10 bg-ink/5 px-1.5 py-0.5 text-xs text-ink/45">
              Sin ref. BC
            </span>
          )}
          {property.featured && (
            <span className="crm-badge rounded-md border border-gold/35 bg-gold/15 px-1.5 py-0.5 text-gold-dark">
              {t("adminProps.featured.badge")}
            </span>
          )}
        </div>
        <Link
          href={canEdit ? editHref : `/compartir/${property.id}`}
          className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-ink transition hover:text-gold-dark"
          title={property.title}
        >
          {property.title}
          {canEdit && <LinkPendingOverlay skeleton="property-detail" />}
        </Link>
        <p className="mt-1 truncate text-xs text-ink/60">
          {[property.subzone, property.zone].filter(Boolean).join(" · ")}
          {property.agencyName && property.agencyName !== "—"
            ? ` · ${property.agencyName}`
            : ""}
        </p>
        <p className="mt-0.5 text-xs text-ink/60">
          {property.bedrooms} dorm. · {property.bathrooms} baños · {property.squareMeters} m²
        </p>
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((tg) => (
              <TagChip key={tg.id} name={tg.name} color={tg.color} />
            ))}
          </div>
        )}
      </div>

      {/* Precio (escritorio) */}
      <div className="hidden w-[150px] shrink-0 text-right sm:block">
        <PriceBlock formatted={formatted} isRent={isRent} align="right" />
      </div>

      {/* Chips de estado */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:w-[128px] sm:flex-col sm:items-end">
        <span
          className={cn(
            "crm-badge rounded-full border px-2.5 py-0.5",
            STATUS_STYLES[property.status],
          )}
        >
          {t(`adminProps.status.${property.status}`)}
        </span>
        {property.isDualOperation ? (
          <span className="crm-badge rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
            {t("filters.operation.sale")} + {t("filters.operation.rent")}
          </span>
        ) : (
          <span
            className={cn(
              "crm-badge rounded-full border px-2.5 py-0.5",
              isRent
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            {isRent ? t("filters.operation.rent") : t("filters.operation.sale")}
          </span>
        )}
        <span className="text-xs text-ink/45">{property.publishedLabel}</span>
      </div>

      {/* Acciones: Editar + menú */}
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {canEdit ? (
          <Link
            href={editHref}
            className="crm-button inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink px-3.5 py-2 text-cream-50 transition hover:bg-ink-soft sm:flex-none"
          >
            <Pencil size={12} strokeWidth={1.75} className="text-gold" />
            <span>{t("adminProps.edit")}</span>
            <LinkPendingOverlay skeleton="property-detail" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="crm-button inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink/20 px-3.5 py-2 text-ink/40 sm:flex-none"
            title="Sin permiso para editar"
          >
            <Pencil size={12} strokeWidth={1.75} />
            <span>{t("adminProps.edit")}</span>
          </span>
        )}
        <RowMenu
          slug={property.id}
          photoCount={photoCount}
          onPhotos={() => setPhotosOpen(true)}
        />
      </div>

      <PropertyPhotosModal
        open={photosOpen}
        onClose={() => setPhotosOpen(false)}
        slug={property.id}
        title={property.title}
        galleryCountry={galleryCountry}
      />
    </li>
  );
}

function PriceBlock({
  formatted,
  isRent,
  align = "left",
}: {
  formatted: string;
  isRent: boolean;
  align?: "left" | "right";
}) {
  return (
    <p className={cn(align === "right" ? "text-right" : "text-left")}>
      <span className="block text-lg font-bold leading-tight tabular-nums text-ink">
        {formatted}
      </span>
      {isRent && <span className="text-xs text-ink/55">al mes</span>}
    </p>
  );
}

// Menú "⋯" de cada fila: ver ficha pública, fotos y archivar.
function RowMenu({
  slug,
  photoCount,
  onPhotos,
}: {
  slug: string;
  photoCount: number;
  onPhotos: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleArchive = () => {
    setOpen(false);
    if (
      typeof window !== "undefined" &&
      !window.confirm(t("adminProps.archive.confirm"))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await archiveProperty({ slug });
      if (result.ok) {
        router.refresh();
      } else if (typeof window !== "undefined") {
        window.alert(`${t("adminProps.archive.error")} · ${result.error}`);
      }
    });
  };

  const itemClass =
    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-ink transition hover:bg-gold/10";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        disabled={isPending}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/15 bg-white text-ink/70 transition hover:border-gold/55 hover:text-ink disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <MoreHorizontal size={16} strokeWidth={1.75} />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-gold/20 bg-cream-50 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]"
        >
          <a
            href={`/compartir/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Eye size={14} strokeWidth={1.75} className="text-gold-dark" />
            <span>Ver ficha pública</span>
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onPhotos();
            }}
            className={cn(itemClass, "border-t border-gold/10")}
          >
            <ImageIcon size={14} strokeWidth={1.75} className="text-gold-dark" />
            <span>Gestionar fotos ({photoCount})</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleArchive}
            className={cn(itemClass, "border-t border-gold/10 hover:bg-red-50 hover:text-red-700")}
          >
            <Archive size={14} strokeWidth={1.75} />
            <span>{t("adminProps.archive.action")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Checkbox de selección con estilo de marca (cuadrado dorado al marcar).
function SelectCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded border transition",
        checked
          ? "border-gold bg-gold text-fixed-ink"
          : "border-ink/25 bg-white hover:border-gold/60",
      )}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}
