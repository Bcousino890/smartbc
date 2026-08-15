"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Loader2, Send, X } from "lucide-react";
import { publishItinerary } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import type { ItineraryWithStops } from "@/lib/viewing-collections/types";
import { CopyLinkButton } from "./copy-link-button";

export function PublishCollectionDialog({
  itinerary,
  onClose,
}: {
  itinerary: ItineraryWithStops;
  onClose: () => void;
}) {
  const router = useRouter();
  const [days, setDays] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    url: string;
    expiresAt: string;
    sharesCreated: number;
  } | null>(null);

  const visible = itinerary.stops.filter((s) => !s.hidden_from_client);
  const withoutLink = visible.filter((s) => !s.smartLink).length;
  const exactAddresses = visible.filter(
    (s) => s.address_visibility === "exact",
  ).length;

  const publish = () => {
    setError(null);
    startTransition(async () => {
      const res = await publishItinerary(itinerary.id, { expiryDays: days });
      if (res.ok) {
        setResult({
          url: res.url,
          expiresAt: res.expiresAt,
          sharesCreated: res.sharesCreated,
        });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="mt-8 w-full max-w-md overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="font-serif text-lg font-semibold text-ink">
            {result ? "Colección publicada" : "Publicar colección"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/45 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {result ? (
          <div className="px-5 py-5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-700">
              <Check size={15} strokeWidth={2.5} />
              Enlace privado generado
            </p>

            <p className="mt-3 break-all rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-[11px] text-ink/75">
              {result.url}
            </p>

            <p className="mt-2 text-[11px] text-ink/55">
              Caduca el{" "}
              {new Date(result.expiresAt).toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
              {result.sharesCreated > 0 &&
                ` · ${result.sharesCreated} SmartLink${result.sharesCreated > 1 ? "s" : ""} creado${result.sharesCreated > 1 ? "s" : ""}`}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <CopyLinkButton url={result.url} className="px-3 py-2" />
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/75 transition hover:border-gold/55"
              >
                <ExternalLink size={11} strokeWidth={1.75} className="text-gold-dark" />
                Abrir
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(result.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[11px] font-medium text-cream-50 transition hover:bg-ink-soft"
              >
                WhatsApp
              </a>
            </div>

            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
              Los cambios que hagas a partir de ahora son visibles al instante
              para el cliente.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-5 py-4">
              <Row ok label="Fecha" value={itinerary.scheduled_date ?? "—"} />
              <Row
                ok
                label="Residencias"
                value={`${visible.length} visible${visible.length === 1 ? "" : "s"}`}
              />
              <Row ok label="Horarios" value="todas con hora" />
              <Row
                ok
                label="Direcciones exactas"
                value={`${exactAddresses} de ${visible.length}`}
              />
              <Row
                ok
                label="SmartLinks"
                value={
                  withoutLink > 0
                    ? `se crearán ${withoutLink}`
                    : "todos existen"
                }
              />

              {itinerary.readiness.warnings.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {itinerary.readiness.warnings.map((w, i) => (
                    <p
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800"
                    >
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      {w.kind === "overlaps" && `${w.count} solape(s) de horario.`}
                      {w.kind === "unconfirmed_stops" &&
                        `${w.count} parada(s) sin confirmar.`}
                      {w.kind === "non_available_properties" &&
                        `Reservadas o vendidas: ${w.titles.join(", ")}.`}
                    </p>
                  ))}
                </div>
              )}

              <label className="block pt-1">
                <span className="text-[11px] font-medium text-ink/55">
                  Caducidad
                </span>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                >
                  {[30, 60, 90, 180].map((d) => (
                    <option key={d} value={d}>
                      {d} días
                    </option>
                  ))}
                </select>
              </label>

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gold/15 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/70 transition hover:border-ink/30"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={12} strokeWidth={1.75} className="text-gold" />
                )}
                Publicar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-1.5 text-ink/60">
        <Check
          size={12}
          strokeWidth={2.5}
          className={ok ? "text-emerald-600" : "text-ink/30"}
        />
        {label}
      </span>
      <span className="font-medium text-ink/80">{value}</span>
    </div>
  );
}
