"use client";

import { AlertTriangle, BookOpen, Check, ExternalLink, Loader2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ClientPicker, { type PickedClient } from "@/components/admin/captaciones-map/client-picker";
import { cn } from "@/lib/utils";
import {
  captureParticularesForClient,
  getParticularFit,
  getParticularesFlowStates,
  type FlowState,
} from "../client-flow-actions";
import type { ParticularFit } from "@/lib/db/queries/suggested-particulares";

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const POLL_MS = 6000;
const MAX_POLLS = 25;

/**
 * «Para el encargo de {cliente}» dentro de la ficha del anuncio: cuánto encaja y
 * por qué, dónde está ya (su lista, su ficha, su book) y el botón de captarlo
 * para él. Sin cliente elegido, deja elegirlo aquí mismo.
 */
export function ClientFitCard({
  particularId,
  client,
  onClientChange,
  prefix,
  onChanged,
}: {
  particularId: string;
  client: PickedClient | null;
  onClientChange: (c: PickedClient | null) => void;
  /** `/es`, `/cl`… */
  prefix: string;
  /** Tras captar: la página refresca las etiquetas de la lista y las cifras del cliente. */
  onChanged?: () => void;
}) {
  const [fit, setFit] = useState<ParticularFit | { ok: false; reason: "loading" } | null>(null);
  const [flow, setFlow] = useState<FlowState>("none");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const clientId = client?.id ?? "";

  useEffect(() => {
    if (!clientId) {
      setFit(null);
      return;
    }
    let cancelled = false;
    setFit({ ok: false, reason: "loading" });
    getParticularFit(clientId, particularId)
      .then((res) => !cancelled && setFit(res.ok ? res.fit : { ok: false, reason: "error" }))
      .catch(() => !cancelled && setFit({ ok: false, reason: "error" }));
    return () => {
      cancelled = true;
    };
  }, [clientId, particularId]);

  useEffect(() => {
    if (!clientId) {
      setFlow("none");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    let sawPending = false;
    const run = () =>
      getParticularesFlowStates(clientId, [particularId])
        .then((res) => {
          if (cancelled || !res.ok) return;
          const st = res.states[particularId] ?? "none";
          setFlow(st);
          // La ficha se crea en segundo plano: se vuelve a mirar hasta que aparezca.
          if (st === "pending" && polls++ < MAX_POLLS) {
            sawPending = true;
            timer = setTimeout(run, POLL_MS);
          } else if (st !== "pending" && sawPending) onChanged?.();
        })
        .catch(() => {});
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `onChanged` no debe reiniciar el sondeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, particularId, tick]);

  const capture = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setMsg(null);
    try {
      const score = fit && "fits" in fit && fit.fits ? fit.score : undefined;
      const res = await captureParticularesForClient(client.id, [particularId], score !== undefined ? { [particularId]: score } : undefined);
      if (res.ok) {
        setMsg({ kind: "ok", text: res.inserted > 0 ? `Captado para ${firstName(client.name)}. Su ficha se crea sola y entra en su book.` : `Ya estaba en la lista de ${firstName(client.name)}.` });
        setTick((t) => t + 1);
        onChanged?.();
      } else setMsg({ kind: "error", text: res.error });
    } catch {
      setMsg({ kind: "error", text: "No se pudo captar. Inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }, [client, fit, particularId, onChanged]);

  const base = client ? `${prefix}/admin/clientes/${client.id}` : "";
  const score = fit && "fits" in fit && fit.fits ? fit.score : null;

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/[0.07] p-4">
      <p className="mb-2.5 text-sm font-semibold text-ink">
        {client ? `Para el encargo de ${client.name}` : "Captar para un cliente"}
      </p>

      <ClientPicker value={client} onChange={onClientChange} theme="light" />

      {!client && (
        <p className="mt-2.5 text-sm text-ink/75">
          Elige un cliente para ver cuánto encaja este anuncio con lo que busca, mandarlo a su ficha y añadirlo a su book.
        </p>
      )}

      {client && (
        <div className="mt-3 space-y-3">
          {fit && "reason" in fit && fit.reason === "loading" && (
            <p className="flex items-center gap-2 text-sm text-ink/70">
              <Loader2 size={14} className="animate-spin" aria-hidden /> Calculando el encaje…
            </p>
          )}
          {fit && "reason" in fit && fit.reason === "no_preferences" && (
            <p className="flex items-start gap-1.5 text-sm text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Este cliente aún no tiene encargo, así que no se puede puntuar.{" "}
                <a href={`${base}?encargo=editar`} className="font-semibold underline">Crear el encargo</a>
              </span>
            </p>
          )}
          {fit && "reason" in fit && fit.reason === "error" && <p className="text-sm text-red-700">No se pudo calcular el encaje.</p>}

          {fit && "fits" in fit && !fit.fits && (
            <p className="flex items-start gap-1.5 text-sm text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
              <span>
                <b>No encaja con su encargo:</b> {fit.why.toLowerCase()}. Puedes captarlo igualmente si quieres enseñárselo.
              </span>
            </p>
          )}

          {fit && "fits" in fit && fit.fits && (
            <div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-lg font-bold tabular-nums",
                    fit.score >= 80 ? "bg-emerald-700 text-white" : fit.score >= 60 ? "bg-amber-500 text-ink" : "bg-ink/10 text-ink/70",
                  )}
                >
                  {fit.score}
                </span>
                <p className="text-sm font-medium text-ink">
                  {fit.score >= 80 ? "Encaja con su encargo" : fit.score >= 60 ? "Encaja en parte" : "Encaja poco"}
                </p>
              </div>
              {fit.reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm text-ink/85">
                  {fit.reasons.slice(0, 6).map((r) => (
                    <li key={r} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />{r}</li>
                  ))}
                </ul>
              )}
              {fit.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-sm text-amber-900">
                  {fit.warnings.slice(0, 5).map((w) => (
                    <li key={w} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-ink/10 pt-3">
            {flow === "none" && (
              <button
                type="button"
                onClick={capture}
                disabled={busy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-cream-50 transition hover:bg-ink/90 disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <UserPlus size={15} aria-hidden />}
                Captar para {firstName(client.name)} y añadir a su book
              </button>
            )}
            {flow === "pending" && (
              <p className="flex items-center gap-2 text-sm text-ink">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                En la lista de {firstName(client.name)}. Se está creando su ficha…
              </p>
            )}
            {(flow === "property" || flow === "book") && (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <Check size={15} aria-hidden />
                {flow === "book" ? `Ya está en el book de ${firstName(client.name)}` : `Ficha creada y en la selección de ${firstName(client.name)}`}
              </p>
            )}
            {msg && <p className={cn("mt-2 text-sm", msg.kind === "ok" ? "text-emerald-800" : "text-red-700")}>{msg.text}</p>}
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a href={`${base}?tab=properties#portal-links`} className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline">
                Su lista de anuncios <ExternalLink size={12} aria-hidden />
              </a>
              <a href={`${base}?tab=properties`} className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline">
                <BookOpen size={13} aria-hidden /> Su book
              </a>
              <a href={base} className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline">
                Ficha del cliente <ExternalLink size={12} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
