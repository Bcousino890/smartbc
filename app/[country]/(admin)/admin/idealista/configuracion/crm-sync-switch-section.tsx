"use client";

// Interruptor de la sincronización Idealista API → CRM (0234). Solo lo pinta
// la página para el dueño y los admin. «Encender» solo se activa con todas las
// comprobaciones en verde (y la base lo vuelve a comprobar al pulsar).
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Power, RefreshCw, XCircle } from "lucide-react";
import type { SwitchStatus } from "@/lib/services/idealista/crm-sync/switch";

type SaveResult = { ok: boolean; enabled?: boolean; failing?: string[]; error?: string };

async function loadStatus(): Promise<SwitchStatus> {
  const res = await fetch("/api/admin/idealista/crm-sync/switch", { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 403 ? "Solo el dueño o un administrador pueden ver esto." : `Error ${res.status}`);
  return (await res.json()) as SwitchStatus;
}

async function saveSwitch(enabled: boolean): Promise<SaveResult> {
  const res = await fetch("/api/admin/idealista/crm-sync/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return (await res.json().catch(() => ({ ok: false, error: `Error ${res.status}` }))) as SaveResult;
}

/** Qué hacer con las comprobaciones que se arreglan desde el propio CRM. */
function hintFor(check: string): string | null {
  if (check.includes("RESERVADO")) return "Crea la etiqueta «RESERVADO» para España en Propiedades → Etiquetas.";
  if (check.includes("país de la API")) return "Revisa en esta misma página la configuración de la API de Idealista (país: España).";
  return null;
}

export function CrmSyncSwitchSection({
  load = loadStatus,
  save = saveSwitch,
}: {
  /** Inyectables para /dev-fixtures. */
  load?: () => Promise<SwitchStatus>;
  save?: (enabled: boolean) => Promise<SaveResult>;
}) {
  const [status, setStatus] = useState<SwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await load());
    } catch (e) {
      setStatus(null);
      setMessage({ ok: false, text: e instanceof Error ? e.message : "No se pudo cargar." });
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const change = async (enabled: boolean) => {
    if (enabled && !confirm("Se encenderá la sincronización: cada publicación, baja o reactivación por API se reflejará en el CRM. ¿Encender?")) return;
    setBusy(true);
    setMessage(null);
    const r = await save(enabled);
    setBusy(false);
    setMessage(
      r.ok
        ? { ok: true, text: enabled ? "Sincronización encendida." : "Sincronización apagada." }
        : { ok: false, text: r.failing?.length ? `No se ha encendido: ${r.failing.length} comprobación(es) en rojo.` : `No se pudo: ${r.error ?? "error"}` },
    );
    await refresh();
  };

  const failing = status?.checks.filter((c) => !c.ok) ?? [];
  const passing = status?.checks.filter((c) => c.ok) ?? [];

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Power size={20} className="text-gold" />
        <h2 className="crm-section-title text-ink">Sincronización con el CRM</h2>
        {status?.available && (
          <span
            data-crm-switch={status.enabled ? "on" : "off"}
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.enabled ? "bg-emerald-100 text-emerald-700" : "bg-ink/10 text-ink/60"}`}
          >
            {status.enabled ? "Encendida" : "Apagada"}
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Con la sincronización encendida, cada anuncio publicado por la API de Idealista crea o reutiliza su ficha en el CRM con la
        etiqueta «RESERVADO» y un SmartLink, y la baja por API la archiva. Antes de encender, el CRM comprueba que todo lo necesario
        está instalado. Apagar siempre se puede.
      </p>

      {loading && !status ? (
        <p className="flex items-center gap-2 text-sm text-ink/60"><Loader2 size={14} className="animate-spin" /> Comprobando…</p>
      ) : !status ? null : !status.available ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          La actualización todavía no está instalada del todo en el servidor (faltan sus migraciones). Vuelve a mirar en unos minutos.
        </p>
      ) : (
        <>
          <p className={`mb-3 text-sm font-medium ${status.allOk ? "text-emerald-700" : "text-red-600"}`}>
            {status.allOk
              ? `Todo en verde: ${passing.length} de ${status.checks.length} comprobaciones.`
              : `${failing.length} de ${status.checks.length} comprobaciones en rojo: hay que arreglarlas antes de encender.`}
          </p>
          {failing.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {failing.map((c) => (
                <li key={c.check} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="flex items-start gap-1.5"><XCircle size={14} className="mt-0.5 shrink-0" /> {c.check}</span>
                  <span className="mt-0.5 block break-words pl-5 text-xs text-red-600/80">esperado: {c.expected} · encontrado: {c.found}</span>
                  {hintFor(c.check) && <span className="mt-0.5 block pl-5 text-xs font-medium text-red-700">{hintFor(c.check)}</span>}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mb-3 text-xs font-semibold text-ink/60 underline-offset-2 hover:underline">
            {showAll ? "Ocultar las comprobaciones en verde" : `Ver las ${passing.length} comprobaciones en verde`}
          </button>
          {showAll && (
            <ul className="mb-4 max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-ink/10 p-2">
              {passing.map((c) => (
                <li key={c.check} className="flex items-start gap-1.5 break-words text-xs text-ink/70">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600" /> {c.check}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => change(true)}
              disabled={busy || !status.allOk || status.enabled}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              title={status.allOk ? "Encender la sincronización" : "Primero tienen que estar todas las comprobaciones en verde"}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} Encender
            </button>
            <button
              type="button"
              onClick={() => change(false)}
              disabled={busy || !status.enabled}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-ink/5 px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Power size={14} /> Apagar
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink/60 transition hover:text-ink disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Volver a comprobar
            </button>
          </div>
          {status.lastChange && (
            <p className="mt-3 text-xs text-ink/50">
              Último cambio: {status.lastChange.enabled ? "encendida" : "apagada"}
              {status.lastChange.by ? ` por ${status.lastChange.by}` : ""} el {new Date(status.lastChange.at).toLocaleString("es-ES")}.
            </p>
          )}
        </>
      )}
      {message && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
