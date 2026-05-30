"use client";

import {
  ExternalLink,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ParticularRow = {
  id: string;
  portal: string;
  external_id: string;
  source_url: string;
  zone: string | null;
  price: number | null;
  operation: "rent" | "sale" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  photos: Array<{ url: string; alt?: string }> | null;
  features: string[] | null;
  owner_name: string | null;
  phone: string | null;
  chat_only: boolean | null;
  created_at: string | null;
  taken_down_at: string | null;
  is_active: boolean;
};

const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// ─── Modal ────────────────────────────────────────────────────────────────────

function ParticularModal({
  row,
  onClose,
}: {
  row: ParticularRow;
  onClose: () => void;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const photos = row.photos ?? [];
  const cover = photos[photoIdx]?.url;
  const hasPhone = Boolean(row.phone);

  const portalLabel =
    row.portal.charAt(0).toUpperCase() + row.portal.slice(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Foto + nav */}
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-ink/5">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink/30">
              sin foto
            </div>
          )}

          {/* Prev / Next */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() =>
                  setPhotoIdx((i) => (i === 0 ? photos.length - 1 : i - 1))
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70"
              >
                ‹
              </button>
              <button
                onClick={() =>
                  setPhotoIdx((i) => (i === photos.length - 1 ? 0 : i + 1))
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-ink/50 p-2 text-white hover:bg-ink/70"
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i === photoIdx ? "bg-white" : "bg-white/50",
                    )}
                  />
                ))}
              </div>
            </>
          )}

          {/* Badges */}
          <span className="absolute left-3 top-3 rounded-md bg-ink/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-50">
            {row.operation === "rent" ? "Alquiler" : "Venta"}
          </span>
          <span className="absolute right-10 top-3 rounded-md bg-gold/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
            {portalLabel}
          </span>

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-1 text-ink hover:bg-white"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {/* Precio + zona */}
          <div>
            {/* Badge de baja — el dato se conserva pero el anuncio ya no está activo */}
            {!row.is_active && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Anuncio retirado</span>
                {row.taken_down_at && (
                  <span className="text-red-500">
                    · {DATE_FMT.format(new Date(row.taken_down_at))}
                  </span>
                )}
                <span className="ml-auto text-xs text-red-400">
                  Datos conservados — puede volver a estar disponible
                </span>
              </div>
            )}
            <p className="font-serif text-2xl font-semibold text-ink">
              {row.price != null
                ? `${formatPrice(row.price)}${row.operation === "rent" ? "/mes" : ""}`
                : "Precio no disponible"}
            </p>
            {row.zone && (
              <div className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                <MapPin size={13} strokeWidth={1.75} className="text-gold" />
                {row.zone}
              </div>
            )}
            <p className="mt-1 text-sm text-ink/50">
              {[
                row.bedrooms != null ? `${row.bedrooms} hab` : null,
                row.bathrooms != null ? `${row.bathrooms} baños` : null,
                row.square_meters != null ? `${row.square_meters} m²` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {/* Datos de contacto */}
          <div className="rounded-xl border border-gold/20 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/40">
              Contacto · Particular
            </p>

            {row.owner_name && (
              <p className="mb-3 font-medium text-ink">{row.owner_name}</p>
            )}

            {hasPhone ? (
              <a
                href={`tel:${row.phone}`}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Phone size={16} strokeWidth={2} />
                Llamar · {row.phone}
              </a>
            ) : (
              <a
                href={row.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5"
              >
                <MessageSquare size={16} strokeWidth={1.75} />
                Escribir por {portalLabel}
                {row.chat_only && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Solo chat
                  </span>
                )}
              </a>
            )}
          </div>

          {/* Características */}
          {row.features && row.features.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Características
              </p>
              <div className="flex flex-wrap gap-1.5">
                {row.features.map((f, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[12px] text-ink/70"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Descripción */}
          {row.description && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Descripción
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                {row.description}
              </p>
            </div>
          )}

          {/* Acciones inferiores */}
          <div className="flex gap-2 border-t border-ink/8 pt-4">
            <a
              href={row.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/70 transition hover:border-gold/40 hover:text-ink"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
              Ver en {portalLabel}
            </a>
            <button
              onClick={() => {
                // TODO: abrir modal de nueva propiedad con datos pre-rellenados
                alert("Crear propiedad — próximamente");
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-dark"
            >
              <Plus size={14} strokeWidth={2} />
              Crear propiedad
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Listado principal ────────────────────────────────────────────────────────

export function ParticularesClient({ rows }: { rows: ParticularRow[] }) {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState<"" | "rent" | "sale">("");
  const [zone, setZone] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [last24h, setLast24h] = useState(false);
  const [selected, setSelected] = useState<ParticularRow | null>(null);

  const zoneOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.zone).filter(Boolean))).sort() as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    const bMin = bedrooms ? Number(bedrooms) : null;
    const aMin = areaMin ? Number(areaMin) : null;
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      if (q) {
        const hay =
          (r.zone?.toLowerCase().includes(q) ?? false) ||
          (r.description?.toLowerCase().includes(q) ?? false) ||
          r.external_id.toLowerCase().includes(q);
        if (!hay) return false;
      }
      if (operation && r.operation !== operation) return false;
      if (zone && r.zone !== zone) return false;
      if (pMin != null && (r.price ?? 0) < pMin) return false;
      if (pMax != null && (r.price ?? Infinity) > pMax) return false;
      if (bMin != null && (r.bedrooms ?? 0) < bMin) return false;
      if (aMin != null && (r.square_meters ?? 0) < aMin) return false;
      if (
        last24h &&
        !(r.created_at && new Date(r.created_at).getTime() >= since)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, query, operation, zone, priceMin, priceMax, bedrooms, areaMin, last24h]);

  return (
    <>
      {/* Modal */}
      {selected && (
        <ParticularModal row={selected} onClose={() => setSelected(null)} />
      )}

      <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
            <Search size={15} strokeWidth={1.75} className="text-ink/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por zona, descripción o ref…"
              className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Operación: todas</option>
            <option value="rent">Alquiler</option>
            <option value="sale">Venta</option>
          </select>
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Zona: todas</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ máx"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <select
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Hab: todas</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={areaMin}
            onChange={(e) => setAreaMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="m² mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setLast24h((v) => !v)}
            className={
              last24h
                ? "rounded-lg border border-gold bg-gold/15 px-3 py-2 text-[13px] font-medium text-gold-dark"
                : "rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink/70 transition hover:border-gold/40"
            }
          >
            Últimas 24h
          </button>
          <span className="ml-auto text-[11px] text-ink/55">
            {filtered.length} de {rows.length}
          </span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-12 text-center text-ink/55">
            No hay anuncios de particulares todavía. El scraper los detecta
            automáticamente cada 6 horas.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => {
              const cover = r.photos?.[0]?.url;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white text-left transition hover:border-gold/50 hover:shadow-[0_12px_30px_-18px_rgba(40,28,10,0.35)]"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink/5">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink/30">
                        sin foto
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-50">
                      {r.operation === "rent" ? "Alquiler" : "Venta"}
                    </span>
                    <span className="absolute right-2 top-2 rounded-md bg-gold/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
                      {r.portal}
                    </span>
                    {/* Badge de retirado */}
                    {!r.is_active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/30">
                        <span className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                          Retirado
                        </span>
                      </span>
                    )}
                    {/* Indicador de contacto disponible */}
                    {r.phone && (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <Phone size={10} strokeWidth={2} />
                        Teléfono
                      </span>
                    )}
                    {!r.phone && r.chat_only && (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <MessageSquare size={10} strokeWidth={1.75} />
                        Solo chat
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-center gap-1.5 text-[12px] text-ink/60">
                      <MapPin size={12} strokeWidth={1.75} className="text-gold" />
                      <span>{r.zone ?? "Madrid"}</span>
                    </div>
                    <p className="mt-1 font-serif text-lg font-medium text-ink">
                      {r.price != null
                        ? `${formatPrice(r.price)}${r.operation === "rent" ? "/mes" : ""}`
                        : "Precio n/d"}
                    </p>
                    <p className="mt-1 text-[12px] text-ink/60">
                      {[
                        r.bedrooms != null ? `${r.bedrooms} hab` : null,
                        r.bathrooms != null ? `${r.bathrooms} baños` : null,
                        r.square_meters != null ? `${r.square_meters} m²` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-ink/45">
                      <span>
                        {r.created_at
                          ? DATE_FMT.format(new Date(r.created_at))
                          : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gold-dark group-hover:underline">
                        Ver detalles
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
