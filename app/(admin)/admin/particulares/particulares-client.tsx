"use client";

import {
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Search,
  Filter,
  Phone,
  Wifi,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ParticulareDetailModal,
  type ParticularData,
} from "@/components/admin/particulares-detail-modal";
import { PLACEHOLDER_GRADIENT } from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface Particular extends ParticularData {}

export function ParticularesCient({
  initialData,
  initialCount,
}: {
  initialData: Particular[];
  initialCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<Particular[]>(initialData);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [zoneFilter, setZoneFilter] = useState("");
  const [operationFilter, setOperationFilter] = useState<"" | "rent" | "sale">(
    ""
  );
  const [portalFilter, setPortalFilter] = useState("");
  const [hasPhoneFilter, setHasPhoneFilter] = useState(false);
  const [selectedParticular, setSelectedParticular] =
    useState<Particular | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const limit = 50;

  // Get unique zones and portals
  const zoneOptions = useMemo(
    () =>
      Array.from(
        new Set(
          initialData
            .map((p) => p.zone)
            .filter((z): z is string => Boolean(z))
        )
      ).sort(),
    [initialData]
  );

  const portalOptions = useMemo(
    () => Array.from(new Set(initialData.map((p) => p.portal))).sort(),
    [initialData]
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Fetch with filters
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (query) params.append("search", query);
      if (zoneFilter) params.append("zone", zoneFilter);
      if (operationFilter) params.append("operation", operationFilter);
      if (portalFilter) params.append("portal", portalFilter);
      if (hasPhoneFilter) params.append("hasPhone", "true");

      const res = await fetch(`/api/admin/particulares?${params}`);
      const result = await res.json();

      setData(result.data);
      setCount(result.count);
    } catch (error) {
      console.error("Error fetching particulares:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when filters change
  useEffect(() => {
    setOffset(0);
    fetchData();
  }, [query, zoneFilter, operationFilter, portalFilter, hasPhoneFilter]);

  // Fetch on pagination
  useEffect(() => {
    if (offset > 0) fetchData();
  }, [offset]);

  const handleOpenModal = (particular: Particular) => {
    setSelectedParticular(particular);
    setModalOpen(true);
  };

  const totalPages = Math.ceil(count / limit);
  const currentPage = offset / limit + 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Particulares</h1>
          <p className="mt-1 text-sm text-gray-600">
            {count} propiedad{count !== 1 ? "es" : ""} encontrada{count !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar por nombre, zona, descripción..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Zone Filter */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
            >
              <Filter size={16} />
              Zona: {zoneFilter || "Todas"}
              <ChevronDown
                size={16}
                className={cn(
                  "transition-transform",
                  menuOpen && "rotate-180"
                )}
              />
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-gray-300 bg-white shadow-lg">
                <button
                  onClick={() => {
                    setZoneFilter("");
                    setMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                >
                  Todas las zonas
                </button>
                {zoneOptions.map((zone) => (
                  <button
                    key={zone}
                    onClick={() => {
                      setZoneFilter(zone);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm hover:bg-gray-50",
                      zoneFilter === zone && "bg-blue-50 text-blue-700"
                    )}
                  >
                    {zone}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Operation Filter */}
          <select
            value={operationFilter}
            onChange={(e) =>
              setOperationFilter(e.target.value as "" | "rent" | "sale")
            }
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <option value="">Tipo: Todos</option>
            <option value="rent">Alquiler</option>
            <option value="sale">Venta</option>
          </select>

          {/* Portal Filter */}
          <select
            value={portalFilter}
            onChange={(e) => setPortalFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
          >
            <option value="">Portal: Todos</option>
            {portalOptions.map((portal) => (
              <option key={portal} value={portal}>
                {portal.charAt(0).toUpperCase() + portal.slice(1)}
              </option>
            ))}
          </select>

          {/* Has Phone Filter */}
          <button
            onClick={() => setHasPhoneFilter(!hasPhoneFilter)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors",
              hasPhoneFilter
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-300 bg-white hover:bg-gray-50"
            )}
          >
            <Phone size={16} />
            {hasPhoneFilter ? "Con teléfono" : "Filtrar: Teléfono"}
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow-sm">
          <p className="text-gray-600">No hay particulares que coincidan con los filtros</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((particular) => (
              <div
                key={particular.id}
                onClick={() => handleOpenModal(particular)}
                className="group cursor-pointer rounded-lg bg-white shadow-sm transition-all hover:shadow-lg"
              >
                {/* Image */}
                <div className="relative h-48 w-full overflow-hidden bg-gray-100">
                  {particular.photos?.[0] ? (
                    <Image
                      src={particular.photos[0].url}
                      alt={particular.photos[0].alt || "Property"}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className={cn("h-full w-full", PLACEHOLDER_GRADIENT)}
                    >
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon size={32} className="text-white/50" />
                      </div>
                    </div>
                  )}

                  {/* Badge */}
                  <div className="absolute right-2 top-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 shadow-md">
                    {particular.portal}
                  </div>

                  {/* Contact Badge */}
                  {particular.phone ? (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs text-white">
                      <Phone size={12} />
                      Contacto disponible
                    </div>
                  ) : particular.chat_only ? (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-xs text-white">
                      <Wifi size={12} />
                      Solo chat
                    </div>
                  ) : null}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-1">
                    {particular.owner_name || "Sin nombre"}
                  </h3>

                  {particular.price && (
                    <p className="text-lg font-bold text-blue-600">
                      {formatPrice(particular.price)}
                    </p>
                  )}

                  <div className="mt-2 flex gap-2 text-sm text-gray-600">
                    {particular.bedrooms !== null && (
                      <span>🛏️ {particular.bedrooms}</span>
                    )}
                    {particular.bathrooms !== null && (
                      <span>🚿 {particular.bathrooms}</span>
                    )}
                    {particular.square_meters && (
                      <span>📐 {particular.square_meters}m²</span>
                    )}
                  </div>

                  {particular.zone && (
                    <p className="mt-2 text-sm text-gray-500">
                      📍 {particular.zone}
                    </p>
                  )}

                  {particular.operation && (
                    <p className="mt-1 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {particular.operation === "rent" ? "Alquiler" : "Venta"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-white p-4 shadow-sm">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= count}
                className="rounded px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <ParticulareDetailModal
        isOpen={modalOpen}
        data={selectedParticular}
        onClose={() => setModalOpen(false)}
        onCreateProperty={(particular) => {
          // Navigate to create property with data pre-filled
          router.push(
            `/admin/propiedades/new?source=${encodeURIComponent(JSON.stringify(particular))}`
          );
        }}
      />
    </div>
  );
}
