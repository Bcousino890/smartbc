"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, ExternalLink, Loader2, X } from "lucide-react";
import {
  createSmartLinkForStop,
  linkExistingSmartLink,
  linkVisitRequest,
  unlinkVisitRequest,
  updateStopAddressVisibility,
  updateStopClientVisibility,
  updateStopConfirmation,
  updateStopNotes,
  updateStopSchedule,
} from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import {
  CONFIRMATIONS_ALLOWING_HIDE,
  STOP_CONFIRMATIONS,
  type StopConfirmation,
  type StopWithSelection,
} from "@/lib/viewing-collections/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";

const CONFIRM_LABEL: Record<StopConfirmation, string> = {
  pending: "Pendiente",
  proposed: "Propuesta al propietario",
  confirmed: "Confirmada",
  declined: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
};

type ShareOption = {
  id: string;
  token: string;
  label: string | null;
  opens: number;
};

export function ViewingStopEditor({
  stop,
  clientName,
  country,
  timezone,
  scheduledDate,
  onClose,
}: {
  stop: StopWithSelection;
  clientName: string;
  country: Country;
  timezone: string;
  scheduledDate: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const config = getCountryConfig(country);
  const prop = stop.selection.property;

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shares, setShares] = useState<ShareOption[]>([]);

  const [time, setTime] = useState(
    stop.scheduled_at
      ? new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: timezone,
          hour12: false,
        }).format(new Date(stop.scheduled_at))
      : "",
  );
  const [duration, setDuration] = useState(stop.duration_minutes ?? 30);
  const [notes, setNotes] = useState(stop.agent_notes ?? "");

  useEffect(() => {
    fetch(`/api/admin/property-shares?propertyId=${prop.id}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setShares(j.data ?? []))
      .catch(() => setShares([]));
  }, [prop.id]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>) => {
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      else {
        if (res.warning) setWarning(res.warning);
        router.refresh();
      }
    });
  };

  const canShowExactAddress = ["confirmed", "completed"].includes(
    stop.confirmation_status,
  );
  const canHide = CONFIRMATIONS_ALLOWING_HIDE.includes(stop.confirmation_status);

  const saveSchedule = () => {
    if (!time) {
      run(() => updateStopSchedule(stop.id, { scheduledAt: null, durationMinutes: duration }));
      return;
    }
    if (!scheduledDate) {
      setError("Asigna primero una fecha al itinerario.");
      return;
    }
    // La hora se interpreta en la zona del itinerario. Construimos el instante
    // buscando el offset real de esa fecha (evita el desfase de verano).
    const iso = localTimeToIso(scheduledDate, time, timezone);
    run(() =>
      updateStopSchedule(stop.id, {
        scheduledAt: iso,
        durationMinutes: duration,
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="mt-4 w-full max-w-lg overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate font-serif text-base font-semibold text-ink">
              {prop.title}
            </h3>
            <p className="mt-0.5 truncate text-[11px] text-ink/55">
              {prop.bcReference ? `${prop.bcReference} · ` : ""}
              {prop.zone}
              {prop.subzone ? ` · ${prop.subzone}` : ""} ·{" "}
              {config.formatPrice(prop.price, prop.currency, prop.operation)}
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

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          )}
          {warning && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {warning}
            </p>
          )}

          {/* Horario */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              Horario
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label>
                <span className="text-[10px] text-ink/55">Hora</span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 block rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                />
              </label>
              <label>
                <span className="text-[10px] text-ink/55">Duración</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="mt-1 block rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
                >
                  {[15, 20, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={saveSchedule}
                disabled={pending}
                className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </section>

          {/* Confirmación */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              Confirmación
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STOP_CONFIRMATIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => run(() => updateStopConfirmation(stop.id, s))}
                  disabled={pending}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                    stop.confirmation_status === s
                      ? "border-gold/50 bg-gold/15 text-ink"
                      : "border-ink/10 bg-white text-ink/60 hover:border-gold/30",
                  )}
                >
                  {CONFIRM_LABEL[s]}
                </button>
              ))}
            </div>
          </section>

          {/* Dirección */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              Dirección visible para el cliente
            </p>
            <div className="mt-2 space-y-1.5">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-ink/10 bg-white/65 px-3 py-2">
                <input
                  type="radio"
                  checked={stop.address_visibility === "area_only"}
                  onChange={() =>
                    run(() => updateStopAddressVisibility(stop.id, "area_only"))
                  }
                  disabled={pending}
                  className="mt-0.5 accent-[#a8814a]"
                />
                <span className="text-[12px] text-ink/80">
                  Solo zona
                  <span className="ml-1 text-ink/50">
                    — «{prop.zone}
                    {prop.subzone ? ` · ${prop.subzone}` : ""}»
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2",
                  canShowExactAddress
                    ? "cursor-pointer border-ink/10 bg-white/65"
                    : "cursor-not-allowed border-ink/5 bg-ink/[0.02]",
                )}
              >
                <input
                  type="radio"
                  checked={stop.address_visibility === "exact"}
                  onChange={() =>
                    run(() => updateStopAddressVisibility(stop.id, "exact"))
                  }
                  disabled={pending || !canShowExactAddress}
                  className="mt-0.5 accent-[#a8814a]"
                />
                <span className="text-[12px] text-ink/80">
                  Dirección exacta
                  {!canShowExactAddress && (
                    <span className="mt-0.5 block text-[10px] text-ink/45">
                      Disponible al confirmar o completar la visita.
                    </span>
                  )}
                </span>
              </label>
            </div>
          </section>

          {/* Visibilidad */}
          {canHide && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                Visibilidad en la colección
              </p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-ink/10 bg-white/65 px-3 py-2">
                <input
                  type="checkbox"
                  checked={stop.hidden_from_client}
                  onChange={(e) =>
                    run(() =>
                      updateStopClientVisibility(stop.id, e.target.checked),
                    )
                  }
                  disabled={pending}
                  className="accent-[#a8814a]"
                />
                <span className="text-[12px] text-ink/80">
                  Ocultar esta parada al cliente
                  <span className="mt-0.5 block text-[10px] text-ink/45">
                    Se conserva en el CRM; la colección pública no la muestra y
                    renumera el resto sin dejar huecos.
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* SmartLink */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              SmartLink
            </p>
            {stop.smartLink ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink/70">
                  /c/{stop.smartLink.token}
                </span>
                <span className="text-[11px] text-ink/55">
                  {stop.smartLink.opensCount} apertura
                  {stop.smartLink.opensCount === 1 ? "" : "s"}
                </span>
                <a
                  href={`/c/${stop.smartLink.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-dark transition hover:text-gold"
                  aria-label="Abrir SmartLink"
                >
                  <ExternalLink size={13} strokeWidth={1.75} />
                </a>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => run(() => createSmartLinkForStop(stop.id))}
                  disabled={pending}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-50"
                >
                  Crear SmartLink ahora
                </button>
                {shares.length > 0 && (
                  <label className="block">
                    <span className="text-[10px] text-ink/55">
                      O reutilizar uno existente
                    </span>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        run(() =>
                          linkExistingSmartLink(stop.id, e.target.value),
                        );
                      }}
                      disabled={pending}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[11px] text-ink focus:border-gold/55 focus:outline-none"
                    >
                      <option value="">Selecciona…</option>
                      {shares.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label ?? `/c/${s.token.slice(0, 8)}…`} ({s.opens}{" "}
                          aperturas)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="text-[10px] text-ink/45">
                  Si no creas ninguno, se generará automáticamente al publicar.
                </p>
              </div>
            )}
          </section>

          {/* Visita en el CRM */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              Visita en el CRM
            </p>
            {stop.visitRequest ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-blue-200/60 bg-blue-50/50 px-3 py-2">
                <span className="text-[11px] text-ink/70">
                  Agendada · estado {stop.visitRequest.status}
                </span>
                <button
                  type="button"
                  onClick={() => run(() => unlinkVisitRequest(stop.id))}
                  disabled={pending}
                  className="text-[11px] font-medium text-ink/55 transition hover:text-rose-600 disabled:opacity-50"
                >
                  Desvincular
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => run(() => linkVisitRequest(stop.id))}
                disabled={pending || !stop.scheduled_at}
                title={
                  stop.scheduled_at ? undefined : "Asigna una hora primero"
                }
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-[11px] font-medium text-ink/75 transition hover:border-gold/55 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CalendarPlus size={12} strokeWidth={1.75} className="text-gold-dark" />
                )}
                Agendar en el calendario
              </button>
            )}
          </section>

          {/* Notas internas */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              Notas internas
              <span className="ml-1.5 font-normal normal-case tracking-normal text-ink/40">
                🔒 nunca visibles para el cliente
              </span>
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if ((stop.agent_notes ?? "") !== notes) {
                  run(() => updateStopNotes(stop.id, notes));
                }
              }}
              rows={2}
              placeholder="El propietario pide avisar 30 min antes…"
              className="mt-2 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12px] text-ink focus:border-gold/55 focus:outline-none"
            />
          </section>
        </div>

        <div className="flex justify-end border-t border-gold/15 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-[12px] font-medium text-ink/70 transition hover:border-ink/30"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "17/08/2026" + "10:00" + zona → ISO absoluto.
 *
 * Se calcula el offset real de esa fecha en esa zona (no el actual), para que
 * una visita en marzo y otra en agosto no se desplacen una hora por el cambio
 * de horario de verano.
 */
function localTimeToIso(date: string, time: string, timeZone: string): string {
  const [h, m] = time.split(":").map(Number);
  const naive = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const asLocal = new Date(
    naive.toLocaleString("en-US", { timeZone }),
  );
  const asUtc = new Date(naive.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = asLocal.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - offset).toISOString();
}
