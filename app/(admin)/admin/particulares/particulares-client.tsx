"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { createPropertyFromParticular, updateParticularPhone } from "./actions";
import PriceHistoryChart from "./price-history-chart";

export type ParticularChangeRow = {
  id: string;
  change_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_at: string;
};

export type ParticularRow = {
  id: string;
  portal: string;
  external_id: string;
  particular_reference: string | null;
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
  latitude: number | null;
  longitude: number | null;
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

function formatPhone(phone: string): string {
  const d = phone.replace(/[\s\-\(\)\.]/g, "");
  if (/^[6789]\d{8}$/.test(d))
    return `+34 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (/^34[6789]\d{8}$/.test(d))
    return `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (/^\+34[6789]\d{8}$/.test(d))
    return `+${d.slice(1, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return phone;
}

// ─── Edit Phone Modal ────────────────────────────────────────────────────────

function EditPhoneModal({
  particularId,
  currentPhone,
  onClose,
  onSaved,
}: {
  particularId: string;
  currentPhone: string | null;
  onClose: () => void;
  onSaved: (newPhone: string | null) => void;
}) {
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await updateParticularPhone(particularId, phone || null);
      if (res.ok) {
        onSaved(phone || null);
        onClose();
      } else {
        setError((res as any).error || "unknown_error");
      }
    } catch {
      setError("network_error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/10 p-6">
          <h2 className="text-lg font-semibold text-ink">Editar teléfono</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-ink/50 hover:text-ink"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div>
            <label className="block text-sm font-medium text-ink/75 mb-2">
              Teléfono
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: +34 600 123 456"
              className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink/50">
              Deja en blanco para eliminar el teléfono
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              No se pudo guardar ({error}). Inténtalo de nuevo.
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-ink/10 p-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-ink/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  new_listing:       { label: "Alta del anuncio",    color: "bg-emerald-100 text-emerald-700" },
  price_up:          { label: "Subida de precio",    color: "bg-red-100 text-red-700" },
  price_down:        { label: "Bajada de precio",    color: "bg-emerald-100 text-emerald-700" },
  price_change:      { label: "Cambio de precio",    color: "bg-amber-100 text-amber-700" },
  photo_count_change:{ label: "Cambio de fotos",     color: "bg-blue-100 text-blue-700" },
  photo_added:       { label: "Fotos añadidas",      color: "bg-blue-100 text-blue-700" },
  phone_added:       { label: "Teléfono añadido",    color: "bg-emerald-100 text-emerald-700" },
  description_updated:{ label: "Descripción actualizada", color: "bg-ink/10 text-ink/60" },
  reactivated:       { label: "Anuncio reactivado",  color: "bg-emerald-100 text-emerald-700" },
  deleted:           { label: "Anuncio retirado",    color: "bg-red-100 text-red-700" },
};

function ChangeHistory({ particularId }: { particularId: string }) {
  const [changes, setChanges] = useState<ParticularChangeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/particulares/history?id=${particularId}`)
      .then((r) => r.json())
      .then((d) => setChanges(d.changes ?? []))
      .catch(() => setChanges([]))
      .finally(() => setLoading(false));
  }, [particularId]);

  if (loading) return <p className="text-xs text-ink/40 py-2">Cargando historial…</p>;
  if (!changes || changes.length === 0) return <p className="text-xs text-ink/40 py-2">Sin historial de cambios.</p>;

  return (
    <ol className="relative border-l border-ink/10 pl-4 space-y-3">
      {changes.map((c) => {
        const meta = CHANGE_TYPE_LABELS[c.change_type] ?? { label: c.change_type, color: "bg-ink/10 text-ink/60" };
        const fmt = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
        return (
          <li key={c.id} className="flex items-start gap-2">
            <span className="absolute -left-1.5 mt-0.5 h-3 w-3 rounded-full border-2 border-white bg-gold/50" />
            <div className="min-w-0">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
                {meta.label}
              </span>
              {(c.change_type === "price_up" || c.change_type === "price_down" || c.change_type === "price_change") && c.old_value && c.new_value && (
                <span className="ml-2 text-[11px] text-ink/55">
                  {formatPrice(c.old_value.price as number)} → {formatPrice(c.new_value.price as number)} €
                </span>
              )}
              {c.change_type === "photo_count_change" && c.old_value && c.new_value && (
                <span className="ml-2 text-[11px] text-ink/55">
                  {c.old_value.count as number} → {c.new_value.count as number} fotos
                </span>
              )}
              {c.change_type === "phone_added" && c.new_value && (
                <span className="ml-2 text-[11px] text-ink/55">
                  {String(c.new_value.phone ?? "")}
                </span>
              )}
              <p className="mt-0.5 text-[10px] text-ink/40">{fmt.format(new Date(c.changed_at))}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ParticularModal({
  row,
  onClose,
  onPhoneUpdated,
  canCreateProperty = true,
}: {
  row: ParticularRow;
  onClose: () => void;
  onPhoneUpdated?: (newPhone: string | null) => void;
  canCreateProperty?: boolean;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [currentRow, setCurrentRow] = useState(row);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const photos = currentRow.photos ?? [];
  const cover = photos[photoIdx]?.url;
  const hasPhone = Boolean(currentRow.phone);

  // Estado de la conversión particular → propiedad (en Portales externos).
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ slug: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Cargar historial de precios cuando se abre el modal o cambia el row
  useEffect(() => {
    fetch(`/api/admin/particulares/history?id=${currentRow.id}`)
      .then((r) => r.json())
      .then((d) => {
        const prices = (d.changes ?? []).filter((c: ParticularChangeRow) =>
          ["price_up", "price_down", "price_change"].includes(c.change_type)
        ).map((c: ParticularChangeRow) => ({
          date: c.changed_at,
          price: (c.new_value?.price as number) ?? 0,
        })).sort((a: { date: string; price: number }, b: { date: string; price: number }) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setPriceHistory(prices);
      })
      .catch(() => setPriceHistory([]));
  }, [currentRow.id]);

  async function handleCreateProperty() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPropertyFromParticular(currentRow.id);
      if (res.ok) setCreated({ slug: res.slug });
      else setCreateError((res as any).error || "unknown_error");
    } catch {
      setCreateError("network_error");
    } finally {
      setCreating(false);
    }
  }

  const portalLabel =
    currentRow.portal.charAt(0).toUpperCase() + currentRow.portal.slice(1);

  function handlePhoneSaved(newPhone: string | null) {
    setCurrentRow({ ...currentRow, phone: newPhone });
    onPhoneUpdated?.(newPhone);
    setShowEditPhone(false);
  }

  return (
    <>
      {showEditPhone && (
        <EditPhoneModal
          particularId={currentRow.id}
          currentPhone={currentRow.phone}
          onClose={() => setShowEditPhone(false)}
          onSaved={handlePhoneSaved}
        />
      )}
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
            {currentRow.operation === "rent" ? "Alquiler" : "Venta"}
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
          {/* Referencias (interna + externa) + historial */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {currentRow.particular_reference && (
                <span className="rounded-md border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-gold-dark">
                  {currentRow.particular_reference}
                </span>
              )}
              <span className="rounded-md border border-ink/15 bg-ink/5 px-2.5 py-1 font-mono text-[11px] text-ink/60">
                {currentRow.portal.toUpperCase()}-{currentRow.external_id}
              </span>
            </div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="mt-2 text-[11px] text-ink/50 underline hover:text-ink transition"
            >
              {showHistory ? "Ocultar historial" : "Ver historial"}
            </button>
          </div>

          {/* Gráfico de precios */}
          {priceHistory.length > 0 && (
            <div className="rounded-xl border border-gold/15 bg-gold/3 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Historial de precios
              </p>
              <PriceHistoryChart priceHistory={priceHistory} />
            </div>
          )}

          {/* Timeline de cambios */}
          {showHistory && (
            <div className="rounded-xl border border-ink/10 bg-ink/3 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Historial de cambios
              </p>
              <ChangeHistory particularId={currentRow.id} />
            </div>
          )}

          {/* Precio + zona */}
          <div>
            {/* Badge de baja — el dato se conserva pero el anuncio ya no está activo */}
            {!currentRow.is_active && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Anuncio retirado</span>
                {currentRow.taken_down_at && (
                  <span className="text-red-500">
                    · {DATE_FMT.format(new Date(currentRow.taken_down_at))}
                  </span>
                )}
                <span className="ml-auto text-xs text-red-400">
                  Datos conservados — puede volver a estar disponible
                </span>
              </div>
            )}
            <p className="font-serif text-2xl font-semibold text-ink">
              {currentRow.price != null
                ? `${formatPrice(currentRow.price)}${currentRow.operation === "rent" ? "/mes" : ""}`
                : "Precio no disponible"}
            </p>
            {currentRow.zone && (
              <div className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                <MapPin size={13} strokeWidth={1.75} className="text-gold" />
                {currentRow.zone}
              </div>
            )}
            <p className="mt-1 text-sm text-ink/50">
              {[
                currentRow.bedrooms != null ? `${currentRow.bedrooms} hab` : null,
                currentRow.bathrooms != null ? `${currentRow.bathrooms} baños` : null,
                currentRow.square_meters != null ? `${currentRow.square_meters} m²` : null,
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

            {currentRow.owner_name && (
              <p className="mb-3 font-medium text-ink">{currentRow.owner_name}</p>
            )}

            {hasPhone ? (
              <div className="space-y-2">
                <a
                  href={`tel:${currentRow.phone}`}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <Phone size={16} strokeWidth={2} />
                  Llamar · {formatPhone(currentRow.phone!)}
                </a>
                <button
                  onClick={() => setShowEditPhone(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5"
                >
                  Editar teléfono
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <a
                  href={currentRow.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 hover:bg-gold/5"
                >
                  <MessageSquare size={16} strokeWidth={1.75} />
                  Contactar por chat
                  {currentRow.chat_only && (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Solo disponible
                    </span>
                  )}
                </a>
                <button
                  onClick={() => setShowEditPhone(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/50 hover:bg-gold/10"
                >
                  <Phone size={14} strokeWidth={1.75} />
                  Agregar teléfono
                </button>
              </div>
            )}
          </div>

          {/* Mapa — exacto si hay coords, fallback por zona/dirección */}
          {(currentRow.latitude && currentRow.longitude) || currentRow.zone ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Ubicación
              </p>
              {currentRow.latitude && currentRow.longitude ? (
                <div className="relative h-48 w-full overflow-hidden rounded-lg border border-ink/10 bg-gray-100">
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: "none" }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${currentRow.longitude - 0.003},${currentRow.latitude - 0.003},${currentRow.longitude + 0.003},${currentRow.latitude + 0.003}&layer=mapnik&marker=${currentRow.latitude},${currentRow.longitude}`}
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-ink/10">
                  <div className="relative h-48 w-full bg-gray-100">
                    <iframe
                      width="100%"
                      height="100%"
                      style={{ border: "none" }}
                      src={`https://maps.google.com/maps?q=${encodeURIComponent((currentRow.zone ?? "") + ", Madrid")}&output=embed&zoom=15`}
                      allowFullScreen
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-white px-3 py-2 text-[11px] text-ink/50">
                    <MapPin size={11} strokeWidth={1.75} className="text-gold" />
                    Zona aproximada · {currentRow.zone}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Características */}
          {currentRow.features && currentRow.features.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Características
              </p>
              <div className="flex flex-wrap gap-1.5">
                {currentRow.features.map((f, i) => (
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
          {currentRow.description && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
                Descripción
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/75">
                {currentRow.description}
              </p>
            </div>
          )}

          {/* Acciones inferiores */}
          <div className="flex gap-2 border-t border-ink/8 pt-4">
            <a
              href={currentRow.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/70 transition hover:border-gold/40 hover:text-ink"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
              Ver en {portalLabel}
            </a>
            {canCreateProperty && (
              created ? (
                <Link
                  href={`/admin/propiedades/${created.slug}`}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <Check size={14} strokeWidth={2} />
                  Propiedad creada · abrir ficha
                </Link>
              ) : (
                <button
                  onClick={handleCreateProperty}
                  disabled={creating}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60"
                >
                  <Plus size={14} strokeWidth={2} />
                  {creating ? "Creando…" : "Crear propiedad"}
                </button>
              )
            )}
          </div>
          {createError && (
            <p className="text-xs text-red-600">
              No se pudo crear la propiedad ({createError}). Inténtalo de nuevo.
            </p>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

// ─── Utilidades ────────────────────────────────────────────────────────

function formatPhoneToInternational(phone: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (/^[6789]\d{8}$/.test(cleaned)) {
    return `+34 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (cleaned.startsWith("34")) {
    const withoutCountry = cleaned.slice(2);
    return `+34 ${withoutCountry.slice(0, 3)} ${withoutCountry.slice(3, 6)} ${withoutCountry.slice(6)}`;
  }
  return phone;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Listado principal ────────────────────────────────────────────────────────

type RefreshState = "idle" | "loading" | "done" | "error";

export function ParticularesClient({
  rows,
  currentRole,
  hasMore = false,
  currentOffset = 0,
  pageSize = 100,
  total = 0,
}: {
  rows: ParticularRow[];
  currentRole?: string;
  hasMore?: boolean;
  currentOffset?: number;
  pageSize?: number;
  total?: number;
}) {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState<"" | "rent" | "sale">("");
  const [zone, setZone] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [last24h, setLast24h] = useState(false);
  const [onlyNoPhone, setOnlyNoPhone] = useState(false);
  const [selected, setSelected] = useState<ParticularRow | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);
  const [allRows, setAllRows] = useState(rows);
  const [loadingMore, setLoadingMore] = useState(false);

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
    return allRows.filter((r) => {
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
      if (onlyNoPhone && r.phone) return false;
      if (
        last24h &&
        !(r.created_at && new Date(r.created_at).getTime() >= since)
      ) {
        return false;
      }
      return true;
    });
  }, [allRows, query, operation, zone, priceMin, priceMax, bedrooms, areaMin, last24h, onlyNoPhone]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const nextOffset = currentOffset + pageSize;
      const params = new URLSearchParams({ offset: String(nextOffset) });
      const res = await fetch(`/api/admin/particulares/paginated?${params}`);
      const data = await res.json();
      if (res.ok && data.rows) {
        setAllRows((prev) => [...prev, ...data.rows]);
      }
    } catch (error) {
      console.error("Error loading more particulares:", error);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRefreshPhones() {
    setRefreshState("loading");
    setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/particulares/refresh-phones", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRefreshResult({ updated: data.updated, checked: data.checked });
        setRefreshState("done");
        setTimeout(() => setRefreshState("idle"), 8000);
      } else {
        setRefreshState("error");
        setTimeout(() => setRefreshState("idle"), 5000);
      }
    } catch {
      setRefreshState("error");
      setTimeout(() => setRefreshState("idle"), 5000);
    }
  }


  function handlePhoneUpdated(newPhone: string | null) {
    setSelected((prev) => (prev ? { ...prev, phone: newPhone } : null));
  }

  return (
    <>
      {/* Modal */}
      {selected && (
        <ParticularModal
          row={selected}
          onClose={() => setSelected(null)}
          onPhoneUpdated={handlePhoneUpdated}
          canCreateProperty={!currentRole || canAccess(currentRole, "properties", "create")}
        />
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
          <button
            type="button"
            onClick={() => setOnlyNoPhone((v) => !v)}
            className={
              onlyNoPhone
                ? "rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-700"
                : "rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-[13px] text-ink/70 transition hover:border-amber-300"
            }
          >
            Sin teléfono
          </button>
          <button
            type="button"
            onClick={handleRefreshPhones}
            disabled={refreshState === "loading"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition",
              refreshState === "loading"
                ? "border border-gold/40 bg-gold/10 text-gold-dark opacity-80 cursor-wait"
                : refreshState === "done"
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                : refreshState === "error"
                ? "border border-red-300 bg-red-50 text-red-700"
                : "border border-ink/10 bg-white/85 text-ink/70 hover:border-gold/40 hover:bg-gold/5"
            )}
          >
            {refreshState === "loading" ? (
              <><Loader2 size={13} className="animate-spin" /> Actualizando…</>
            ) : refreshState === "done" ? (
              <><Check size={13} strokeWidth={2} /> {refreshResult?.updated ?? 0} teléfonos nuevos</>
            ) : refreshState === "error" ? (
              <>Error — reintentar</>
            ) : (
              <><RefreshCw size={13} strokeWidth={1.75} /> Actualizar teléfonos</>
            )}
          </button>
          <span className="ml-auto text-[11px] text-ink/55">
            {filtered.length} de {rows.length} anuncios · {rows.filter(r => r.phone).length} con teléfono
          </span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-12 text-center text-ink/55">
            No hay anuncios de particulares todavía. El scraper los detecta
            automáticamente cada hora.
          </div>
        ) : (
          <>
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
                    {/* Teléfono visible + copiar */}
                    {r.phone && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const digits = r.phone!.replace(/[\s\-\(\)\.]/g, "");
                          navigator.clipboard.writeText(digits).catch(() => {});
                          setCopiedPhoneId(r.id);
                          setTimeout(() => setCopiedPhoneId(null), 2000);
                        }}
                        className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-700"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={10} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Phone size={10} strokeWidth={2} />
                            {formatPhone(r.phone)}
                          </>
                        )}
                      </button>
                    )}
                    {!r.phone && (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        <MessageSquare size={10} strokeWidth={1.75} />
                        Contactar por chat
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
                    {r.phone && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const cleanPhone = r.phone!.replace(/[\s\-()]/g, "");
                          copyToClipboard(cleanPhone);
                          setCopiedPhoneId(r.id);
                          setTimeout(() => setCopiedPhoneId(null), 2000);
                        }}
                        className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={12} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Copy size={12} strokeWidth={1.75} />
                            {formatPhoneToInternational(r.phone)}
                          </>
                        )}
                      </button>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-ink/45">
                      <span className="flex items-center gap-1.5">
                        {r.particular_reference ? (
                          <span className="font-mono font-semibold text-gold-dark/70">{r.particular_reference}</span>
                        ) : (
                          r.created_at ? DATE_FMT.format(new Date(r.created_at)) : ""
                        )}
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

            {hasMore && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-lg bg-gold px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Cargando..." : `Cargar más (${allRows.length}/${total})`}
                </button>
              </div>
            )}

          </>
        )}
      </section>
    </>
  );
}
