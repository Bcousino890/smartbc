"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Bell, CheckCircle, Home, Loader2, Mail, Ruler, Star, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { addPropertyToSelection } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import {
  offerPropertyToClient,
  setNewListingAlertsEnabled,
} from "@/app/[country]/(admin)/admin/clientes/property-offer-actions";
import { AddToSelectionButton } from "@/components/admin/viewing-collections/selected-properties-block";
import type { SuggestedProperty } from "@/lib/db/queries/suggested-properties";
import { getCountryConfig, isCountry } from "@/lib/country-config";

type State =
  | { kind: "loading" }
  | { kind: "ready"; suggestions: SuggestedProperty[] }
  | { kind: "no_preferences" }
  | { kind: "error"; message: string };

export function SuggestedPropertiesBlock({
  clientId,
  clientName,
  selectedPropertyIds,
  canAddToSelection,
}: {
  clientId: string;
  clientName: string;
  selectedPropertyIds?: Set<string>;
  canAddToSelection?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [togglingAlerts, setTogglingAlerts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/clientes/${clientId}/suggested-properties`,
        );
        const json = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setState({
            kind: "error",
            message: json.error ?? "No se pudieron cargar las sugerencias.",
          });
          return;
        }
        setAlertsEnabled(Boolean(json.alertsEnabled));
        if (json.reason === "no_preferences") {
          setState({ kind: "no_preferences" });
          return;
        }
        setState({ kind: "ready", suggestions: json.suggestions ?? [] });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              err instanceof Error ? err.message : "Error desconocido",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const count = state.kind === "ready" ? state.suggestions.length : 0;

  const handleToggleAlerts = async () => {
    const next = !alertsEnabled;
    setTogglingAlerts(true);
    setAlertsEnabled(next); // optimista; se revierte si falla
    try {
      const res = await setNewListingAlertsEnabled(clientId, next);
      if (!res.ok) setAlertsEnabled(!next);
    } catch {
      setAlertsEnabled(!next);
    } finally {
      setTogglingAlerts(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="crm-label-sm text-ink/50">
            Propiedades sugeridas
          </h2>
          {count > 0 && (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold-dark">
              {count}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleToggleAlerts}
          disabled={togglingAlerts}
          title={
            alertsEnabled
              ? "Recibirá un resumen cuando entren propiedades nuevas que coincidan"
              : "Activar aviso de propiedades nuevas que coincidan"
          }
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
            alertsEnabled
              ? "border-gold/40 bg-gold/15 text-gold-dark"
              : "border-ink/10 text-ink/45 hover:border-gold/30 hover:text-ink/70"
          }`}
        >
          <Bell size={12} className={alertsEnabled ? "fill-gold-dark/20" : ""} />
          {alertsEnabled ? "Avisos activados" : "Avisar de nuevas"}
        </button>
      </div>

      {state.kind === "loading" && (
        <div className="mt-4 flex h-20 items-center justify-center text-ink/45">
          <Loader2 size={15} className="mr-2 animate-spin" />
          <span className="text-xs">Buscando propiedades…</span>
        </div>
      )}

      {state.kind === "no_preferences" && (
        <p className="mt-3 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-xs text-ink/55">
          {clientName} no tiene preferencias configuradas todavía. Añádelas para
          recibir sugerencias automáticas.
        </p>
      )}

      {state.kind === "error" && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-600" />
          <p className="text-xs text-rose-700">{state.message}</p>
        </div>
      )}

      {state.kind === "ready" && state.suggestions.length === 0 && (
        <p className="mt-3 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-xs text-ink/55">
          No hay propiedades disponibles que coincidan con las preferencias de{" "}
          <strong>{clientName}</strong>.
        </p>
      )}

      {state.kind === "ready" && state.suggestions.length > 0 && (
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
          {state.suggestions.map((prop) => (
            <SuggestionCard
              key={prop.id}
              property={prop}
              clientId={clientId}
              alreadySelected={selectedPropertyIds?.has(prop.id) ?? false}
              canAdd={canAddToSelection ?? false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SuggestionCard({
  property,
  clientId,
  alreadySelected,
  canAdd,
}: {
  property: SuggestedProperty;
  clientId: string;
  alreadySelected: boolean;
  canAdd: boolean;
}) {
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);
  const router = useRouter();
  const mainPhoto = property.photos[0];
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSendEmail = async () => {
    setEmailStatus("sending");
    try {
      const res = await offerPropertyToClient(clientId, property.id);
      setEmailStatus(res.ok ? "sent" : "error");
    } catch {
      setEmailStatus("error");
    } finally {
      setTimeout(() => setEmailStatus("idle"), 2500);
    }
  };

  return (
    <div className="rounded-lg border border-gold/15 bg-white/55 p-3 transition hover:border-gold/40 hover:bg-white/80">
      <div className="flex gap-3">
        {mainPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mainPhoto}
            alt={property.title}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-lg bg-ink/5" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`${config.prefix}/propiedades/${property.slug}`}
                className="block truncate text-xs font-semibold text-ink transition hover:text-gold-dark"
              >
                {property.title}
              </Link>
              <p className="mt-0.5 truncate text-xs text-ink/55">
                {property.bcReference ? `${property.bcReference} · ` : ""}
                {property.zone}
                {property.subzone ? ` · ${property.subzone}` : ""}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-xs font-semibold text-amber-700">
                {property.matchScore}%
              </span>
              <Star
                size={11}
                className="fill-amber-400 text-amber-400"
                strokeWidth={2}
              />
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-xs text-ink/60">
            <span className="flex items-center gap-1">
              <Home size={10} />
              {property.bedrooms}h
            </span>
            <span className="flex items-center gap-1">
              <Users size={10} />
              {property.bathrooms}b
            </span>
            {property.squareMeters > 0 && (
              <span className="flex items-center gap-1">
                <Ruler size={10} />
                {property.squareMeters} m²
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink">
              {config.formatPrice(
                property.price,
                property.currency,
                property.operation,
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                title={
                  emailStatus === "sent"
                    ? "Enviado"
                    : emailStatus === "error"
                      ? "No se pudo enviar — inténtalo de nuevo"
                      : "Enviar esta propiedad por correo al cliente"
                }
                disabled={emailStatus === "sending"}
                onClick={handleSendEmail}
                className={`flex h-6 w-6 items-center justify-center rounded-full border transition disabled:opacity-50 ${
                  emailStatus === "sent"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                    : emailStatus === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-600"
                      : "border-gold/25 text-ink/45 hover:border-gold/50 hover:text-gold-dark"
                }`}
              >
                {emailStatus === "sending" ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : emailStatus === "sent" ? (
                  <CheckCircle size={12} />
                ) : (
                  <Mail size={11} />
                )}
              </button>
              {canAdd ? (
                <AddToSelectionButton
                  added={alreadySelected}
                  onAdd={async () => {
                    const res = await addPropertyToSelection(
                      clientId,
                      property.id,
                      "suggestion",
                    );
                    if (res.ok) router.refresh();
                    return res;
                  }}
                />
              ) : (
                property.matchReasons.length > 0 && (
                  <span className="truncate text-xs text-ink/55">
                    {property.matchReasons[0]}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
