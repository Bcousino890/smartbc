"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Plus,
  Send,
  Settings2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  archiveItinerary,
  cancelItinerary,
  deleteItinerary,
  removeStop,
  reorderStop,
  revealAddressesForConfirmedStops,
  unpublishItinerary,
  updateItinerary,
} from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import type {
  ItineraryWithStops,
  StopWithSelection,
} from "@/lib/viewing-collections/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { ViewingStopEditor } from "./viewing-stop-editor";
import { PublishCollectionDialog } from "./publish-collection-dialog";
import { CopyLinkButton } from "./copy-link-button";

const CONFIRM_LABEL: Record<string, string> = {
  pending: "Pendiente",
  proposed: "Propuesta",
  confirmed: "Confirmada",
  declined: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
};

const CONFIRM_STYLE: Record<string, string> = {
  pending: "border-ink/15 bg-white text-ink/60",
  proposed: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declined: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
};

export function ItineraryBuilder({
  itinerary,
  clientId,
  clientName,
  country,
  canEdit,
  canDelete,
  canPublish,
  onClose,
}: {
  itinerary: ItineraryWithStops;
  clientId: string;
  clientName: string;
  country: Country;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const config = getCountryConfig(country);
  const [editingStop, setEditingStop] = useState<StopWithSelection | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(itinerary.title ?? "");
  const [date, setDate] = useState(itinerary.scheduled_date ?? "");
  const [from, setFrom] = useState(itinerary.window_start?.slice(0, 5) ?? "");
  const [to, setTo] = useState(itinerary.window_end?.slice(0, 5) ?? "");

  const stops = itinerary.stops;
  const isPublished = itinerary.status === "published";
  const readOnly = !canEdit || ["cancelled", "archived"].includes(itinerary.status);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else router.refresh();
    });
  };

  const saveHeader = () =>
    run(() =>
      updateItinerary(itinerary.id, {
        title: title.trim() || null,
        scheduledDate: date || null,
        windowStart: from || null,
        windowEnd: to || null,
      }),
    );

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-start justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6"
        onClick={onClose}
      >
        <div
          className="mt-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-3 border-b border-gold/15 px-5 py-4">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold text-ink">
                {itinerary.title || "Itinerario"}
              </h3>
              <p className="mt-0.5 text-[11px] text-ink/55">
                {clientName} · {stops.length}{" "}
                {stops.length === 1 ? "parada" : "paradas"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-ink/45 transition hover:text-ink"
              aria-label="Cerrar"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
            {isPublished && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
                Este itinerario está publicado: cualquier cambio es visible al
                instante para el cliente.
              </p>
            )}

            {error && (
              <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                {error}
              </p>
            )}

            {/* Datos del día */}
            {!readOnly && (
              <div className="rounded-xl border border-gold/15 bg-white/60 p-3">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <label className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-medium text-ink/55">
                      Título
                    </span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={80}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-medium text-ink/55">
                      Fecha
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-medium text-ink/55">
                      Desde
                    </span>
                    <input
                      type="time"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-medium text-ink/55">
                      Hasta
                    </span>
                    <input
                      type="time"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={saveHeader}
                  disabled={pending}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
                >
                  {pending && <Loader2 size={11} className="animate-spin" />}
                  Guardar datos del día
                </button>
              </div>
            )}

            {/* Checklist de publicación */}
            <ReadinessPanel itinerary={itinerary} />

            {/* Paradas */}
            <ul className="mt-4 space-y-2">
              {stops.map((stop, i) => (
                <StopRow
                  key={stop.id}
                  stop={stop}
                  index={i}
                  total={stops.length}
                  priceLabel={config.formatPrice(
                    stop.selection.property.price,
                    stop.selection.property.currency,
                    stop.selection.property.operation,
                  )}
                  timezone={itinerary.timezone}
                  readOnly={readOnly}
                  pending={pending}
                  onEdit={() => setEditingStop(stop)}
                  onMove={(dir) => {
                    const target =
                      dir === "up"
                        ? i >= 2
                          ? stops[i - 2].id
                          : null
                        : i + 1 < stops.length
                          ? stops[i + 1].id
                          : null;
                    if (dir === "up" && i === 0) return;
                    if (dir === "down" && i === stops.length - 1) return;
                    run(() => reorderStop(stop.id, target));
                  }}
                  onRemove={() => {
                    if (
                      !confirm(
                        isPublished
                          ? "El cliente ya puede estar viendo esta colección. ¿Quitar la parada? Considera cancelarla en su lugar para que no desaparezca sin explicación."
                          : "¿Quitar esta parada del itinerario?",
                      )
                    )
                      return;
                    run(() => removeStop(stop.id));
                  }}
                />
              ))}
            </ul>

            {stops.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-[12px] text-ink/55">
                Sin paradas. Añádelas desde la selección del cliente.
              </p>
            )}

            {!readOnly && stops.length > 0 && (
              <button
                type="button"
                onClick={() => run(() => revealAddressesForConfirmedStops(itinerary.id))}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
              >
                <MapPin size={11} strokeWidth={1.75} className="text-gold-dark" />
                Mostrar dirección en todas las confirmadas
              </button>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gold/15 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {canDelete && itinerary.status === "draft" && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("¿Eliminar este borrador?")) return;
                    startTransition(async () => {
                      const res = await deleteItinerary(itinerary.id);
                      if (!res.ok) setError(res.error);
                      else {
                        router.refresh();
                        onClose();
                      }
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/60 transition hover:border-rose-300 hover:text-rose-600"
                >
                  <Trash2 size={11} strokeWidth={1.75} />
                  Eliminar
                </button>
              )}
              {canEdit && ["draft", "published"].includes(itinerary.status) && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("¿Cancelar el itinerario? Se revocarán sus enlaces."))
                      return;
                    run(() => cancelItinerary(itinerary.id));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/60 transition hover:border-rose-300 hover:text-rose-600"
                >
                  Cancelar itinerario
                </button>
              )}
              {canEdit && ["completed", "cancelled"].includes(itinerary.status) && (
                <button
                  type="button"
                  onClick={() => run(() => archiveItinerary(itinerary.id))}
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/60 transition hover:border-ink/30"
                >
                  Archivar
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={`/v/preview/${itinerary.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
              >
                <Eye size={11} strokeWidth={1.75} className="text-gold-dark" />
                Previsualizar
              </a>
              {itinerary.activeShare && (
                <CopyLinkButton
                  url={itinerary.activeShare.url}
                  className="px-3 py-2"
                />
              )}
              {canPublish && isPublished && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !confirm(
                        "El cliente ya no podrá abrir el enlace que le enviaste. ¿Despublicar?",
                      )
                    )
                      return;
                    run(() => unpublishItinerary(itinerary.id));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/70 transition hover:border-gold/55"
                >
                  <Undo2 size={11} strokeWidth={1.75} />
                  Despublicar
                </button>
              )}
              {canPublish && !["cancelled", "archived"].includes(itinerary.status) && (
                <button
                  type="button"
                  onClick={() => setPublishOpen(true)}
                  disabled={!itinerary.readiness.canPublish}
                  title={
                    itinerary.readiness.canPublish
                      ? undefined
                      : "Faltan datos para publicar"
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-40"
                >
                  <Send size={12} strokeWidth={1.75} className="text-gold" />
                  {isPublished ? "Republicar" : "Publicar"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingStop && (
        <ViewingStopEditor
          stop={editingStop}
          clientName={clientName}
          country={country}
          timezone={itinerary.timezone}
          scheduledDate={itinerary.scheduled_date}
          onClose={() => setEditingStop(null)}
        />
      )}

      {publishOpen && (
        <PublishCollectionDialog
          itinerary={itinerary}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </>
  );
}

function ReadinessPanel({ itinerary }: { itinerary: ItineraryWithStops }) {
  const { blockers, warnings } = itinerary.readiness;
  if (blockers.length === 0 && warnings.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {blockers.map((b, i) => (
        <p
          key={`b${i}`}
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {b.kind === "no_date" && "Falta la fecha del itinerario."}
          {b.kind === "no_stops" && "El itinerario no tiene paradas visibles."}
          {b.kind === "stops_without_time" &&
            `${b.count} parada(s) visible(s) sin hora asignada.`}
          {b.kind === "archived_properties" &&
            `Propiedades archivadas: ${b.titles.join(", ")}. Quítalas o sustitúyelas.`}
        </p>
      ))}
      {warnings.map((w, i) => (
        <p
          key={`w${i}`}
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {w.kind === "overlaps" && `${w.count} solape(s) de horario.`}
          {w.kind === "unconfirmed_stops" &&
            `${w.count} parada(s) sin confirmar.`}
          {w.kind === "non_available_properties" &&
            `Han cambiado de estado: ${w.titles.join(", ")}.`}
        </p>
      ))}
    </div>
  );
}

function StopRow({
  stop,
  index,
  total,
  priceLabel,
  timezone,
  readOnly,
  pending,
  onEdit,
  onMove,
  onRemove,
}: {
  stop: StopWithSelection;
  index: number;
  total: number;
  priceLabel: string;
  timezone: string;
  readOnly: boolean;
  pending: boolean;
  onEdit: () => void;
  onMove: (dir: "up" | "down") => void;
  onRemove: () => void;
}) {
  const prop = stop.selection.property;
  const time = stop.scheduled_at
    ? new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }).format(new Date(stop.scheduled_at))
    : null;

  return (
    <li
      className={cn(
        "rounded-xl border border-ink/5 bg-white/65 px-3 py-2.5",
        stop.hidden_from_client && "opacity-55",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <span className="font-mono text-[11px] font-semibold text-ink/45">
            {index + 1}
          </span>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => onMove("up")}
                disabled={index === 0 || pending}
                className="text-ink/30 transition hover:text-gold-dark disabled:opacity-20"
                aria-label="Subir"
              >
                <ArrowUp size={12} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => onMove("down")}
                disabled={index === total - 1 || pending}
                className="text-ink/30 transition hover:text-gold-dark disabled:opacity-20"
                aria-label="Bajar"
              >
                <ArrowDown size={12} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {prop.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={prop.coverPhotoUrl}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-lg bg-ink/5" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink">
                {prop.title}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-ink/50">
                {prop.bcReference ? `${prop.bcReference} · ` : ""}
                {priceLabel}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-ink/70">
              {time ?? "sin hora"}
              {stop.duration_minutes ? ` · ${stop.duration_minutes}′` : ""}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                CONFIRM_STYLE[stop.confirmation_status],
              )}
            >
              {CONFIRM_LABEL[stop.confirmation_status]}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                stop.address_visibility === "exact"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-ink/10 bg-ink/5 text-ink/50",
              )}
            >
              <MapPin size={8} strokeWidth={2} />
              {stop.address_visibility === "exact" ? "Dirección" : "Zona"}
            </span>
            {stop.smartLink ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                SmartLink · {stop.smartLink.opensCount}
              </span>
            ) : (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Sin SmartLink
              </span>
            )}
            {stop.visitRequest && (
              <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                En el CRM
              </span>
            )}
            {stop.hidden_from_client && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-ink/15 bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink/55">
                <EyeOff size={8} strokeWidth={2} />
                Oculta
              </span>
            )}
            {prop.isArchived && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                Archivada
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-ink/15 bg-white p-1.5 text-ink/60 transition hover:border-gold/55 hover:text-ink"
            aria-label="Editar parada"
          >
            <Settings2 size={12} strokeWidth={1.75} />
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="rounded-lg border border-ink/15 bg-white p-1.5 text-ink/45 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-40"
              aria-label="Quitar parada"
            >
              <Trash2 size={12} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
