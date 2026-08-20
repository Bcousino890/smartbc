"use client";

import { useState } from "react";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Link2,
  Pencil,
  XCircle,
} from "lucide-react";
import type {
  ItineraryWithStops,
  SelectionWithProperty,
} from "@/lib/viewing-collections/types";
import type { Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { CollapsibleBlock } from "./collapsible-block";
import { ItineraryBuilder } from "./itinerary-builder";
import { CopyLinkButton } from "./copy-link-button";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  completed: "Completado",
  cancelled: "Cancelado",
  archived: "Archivado",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "border-ink/15 bg-white text-ink/60",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  archived: "border-ink/10 bg-ink/5 text-ink/45",
};

export function ViewingItinerariesBlock({
  clientId,
  clientName,
  country,
  itineraries,
  selections,
  canEdit,
  canDelete,
  canPublish,
}: {
  clientId: string;
  clientName: string;
  country: Country;
  itineraries: ItineraryWithStops[];
  /** Selección del cliente: de aquí salen las propiedades que se pueden
   *  añadir a un itinerario ya creado, sin rehacerlo. */
  selections: SelectionWithProperty[];
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = itineraries.find((i) => i.id === openId) ?? null;

  return (
    <>
      <CollapsibleBlock title="Itinerarios de visitas" count={itineraries.length}>
        {itineraries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-8 text-center text-xs text-ink/55">
            Sin itinerarios. Marca propiedades en la selección y pulsa «Crear
            itinerario».
          </p>
        ) : (
          <ul className="space-y-2.5">
            {itineraries.map((it) => (
              <ItineraryCard
                key={it.id}
                itinerary={it}
                onOpen={() => setOpenId(it.id)}
                canEdit={canEdit}
              />
            ))}
          </ul>
        )}
      </CollapsibleBlock>

      {open && (
        <ItineraryBuilder
          itinerary={open}
          clientId={clientId}
          selections={selections}
          clientName={clientName}
          country={country}
          canEdit={canEdit}
          canDelete={canDelete}
          canPublish={canPublish}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function ItineraryCard({
  itinerary,
  onOpen,
  canEdit,
}: {
  itinerary: ItineraryWithStops;
  onOpen: () => void;
  canEdit: boolean;
}) {
  const visible = itinerary.stops.filter((s) => !s.hidden_from_client);
  const confirmed = visible.filter(
    (s) => s.confirmation_status === "confirmed",
  ).length;
  const pending = visible.filter((s) =>
    ["pending", "proposed"].includes(s.confirmation_status),
  ).length;
  const cancelled = itinerary.stops.filter((s) =>
    ["cancelled", "declined"].includes(s.confirmation_status),
  ).length;

  const share = itinerary.activeShare;

  return (
    <li className="rounded-xl border border-gold/10 bg-white/65 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {itinerary.title || "Itinerario sin título"}
          </p>
          <p className="mt-0.5 text-xs text-ink/55">
            {itinerary.scheduled_date ?? "Sin fecha"}
            {itinerary.window_start
              ? ` · ${itinerary.window_start.slice(0, 5)}–${(itinerary.window_end ?? "").slice(0, 5)}`
              : ""}
            {" · "}
            {visible.length} {visible.length === 1 ? "residencia" : "residencias"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
            STATUS_STYLE[itinerary.status],
          )}
        >
          {STATUS_LABEL[itinerary.status]}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60">
        {confirmed > 0 && (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-600" />
            {confirmed} confirmada{confirmed > 1 ? "s" : ""}
          </span>
        )}
        {pending > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} className="text-amber-600" />
            {pending} pendiente{pending > 1 ? "s" : ""}
          </span>
        )}
        {cancelled > 0 && (
          <span className="inline-flex items-center gap-1">
            <XCircle size={11} className="text-rose-500" />
            {cancelled} cancelada{cancelled > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {share && (
        <div className="mt-2.5 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
            <span className="inline-flex items-center gap-1">
              <Eye size={11} className="text-emerald-700" />
              {share.opensCount} apertura{share.opensCount === 1 ? "" : "s"}
            </span>
            {share.lastOpenedAt && (
              <span className="text-ink/50">
                última{" "}
                {new Date(share.lastOpenedAt).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-ink/50">
              <Link2 size={11} />
              caduca{" "}
              {new Date(share.expires_at).toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      )}

      {itinerary.status === "draft" &&
        itinerary.readiness.blockers.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Para publicar falta:{" "}
            {itinerary.readiness.blockers
              .map((b) =>
                b.kind === "no_date"
                  ? "la fecha"
                  : b.kind === "no_stops"
                    ? "añadir paradas"
                    : b.kind === "stops_without_time"
                      ? `${b.count} parada(s) sin hora`
                      : `${b.titles.length} propiedad(es) archivada(s)`,
              )
              .join(", ")}
          </p>
        )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
        >
          {canEdit ? (
            <Pencil size={11} strokeWidth={1.75} className="text-gold-dark" />
          ) : (
            <Calendar size={11} strokeWidth={1.75} className="text-gold-dark" />
          )}
          {canEdit ? "Editar" : "Ver"}
        </button>

        {share && <CopyLinkButton url={share.url} />}

        {share && (
          <a
            href={share.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
          >
            <BarChart3 size={11} strokeWidth={1.75} className="text-gold-dark" />
            Abrir
          </a>
        )}
      </div>
    </li>
  );
}
