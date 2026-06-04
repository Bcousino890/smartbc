"use client";

import { Calendar, CheckCircle2, Link2Off, Loader2 } from "lucide-react";
import { useState } from "react";

type Props = {
  connected: boolean;
  connectedAt?: string;
  onDisconnect: () => void;
};

export function GoogleCalendarConnect({
  connected,
  connectedAt,
  onDisconnect,
}: Props) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("¿Desconectar Google Calendar? Perderás la sincronización de visitas."))
      return;
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/google/status", { method: "DELETE" });
      onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      <div className="flex items-start gap-5">
        {/* Google Calendar icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <svg viewBox="0 0 48 48" className="h-7 w-7" aria-hidden="true">
            <rect x="8" y="8" width="32" height="32" rx="4" fill="#fff" />
            <rect x="8" y="16" width="32" height="4" fill="#1a73e8" />
            <rect x="8" y="8" width="32" height="8" rx="4" fill="#1a73e8" />
            <circle cx="16" cy="8" r="3" fill="#1a73e8" />
            <circle cx="32" cy="8" r="3" fill="#1a73e8" />
            <text x="24" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a73e8">
              {new Date().getDate()}
            </text>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-[15px] font-semibold text-ink">
              Google Calendar
            </h3>
            {connected && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 size={11} strokeWidth={2} />
                Conectado
              </span>
            )}
          </div>

          {connected ? (
            <>
              <p className="mt-1 text-[13px] text-ink/60">
                Cuenta: <span className="font-medium text-ink/80">admin@zinto.app</span>
              </p>
              {connectedAt && (
                <p className="mt-0.5 text-[11px] text-ink/45">
                  Vinculado el{" "}
                  {new Date(connectedAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
              >
                {disconnecting ? (
                  <Loader2 size={13} strokeWidth={1.75} className="animate-spin" />
                ) : (
                  <Link2Off size={13} strokeWidth={1.75} />
                )}
                Desconectar
              </button>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-[13px] text-ink/65 max-w-md">
                Conecta tu Google Calendar para sincronizar visitas automáticamente,
                ver todos tus eventos y crear citas desde el CRM.
              </p>
              <a
                href="/api/integrations/google/auth"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#1557b0]"
              >
                <Calendar size={14} strokeWidth={1.75} />
                Conectar cuenta admin@zinto.app
              </a>
            </>
          )}
        </div>
      </div>

      {!connected && (
        <div className="mt-4 rounded-xl border border-gold/10 bg-cream-100/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">
            Cómo configurar
          </p>
          <ol className="space-y-1 text-[12px] text-ink/60 list-decimal list-inside">
            <li>
              Ve a{" "}
              <a
                href="https://console.cloud.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1a73e8] underline"
              >
                console.cloud.google.com
              </a>{" "}
              y crea el proyecto &quot;SmartBC CRM&quot;
            </li>
            <li>Habilita la <strong>Google Calendar API</strong></li>
            <li>Crea credenciales OAuth 2.0 (Aplicación Web)</li>
            <li>
              URI de redirección:{" "}
              <code className="rounded bg-ink/10 px-1 py-0.5 text-[11px]">
                https://portal.bcousinoprop.com/api/integrations/google/callback
              </code>
            </li>
            <li>
              Añade <code className="rounded bg-ink/10 px-1 py-0.5 text-[11px]">GOOGLE_CLIENT_ID</code>,{" "}
              <code className="rounded bg-ink/10 px-1 py-0.5 text-[11px]">GOOGLE_CLIENT_SECRET</code> y{" "}
              <code className="rounded bg-ink/10 px-1 py-0.5 text-[11px]">GOOGLE_REDIRECT_URI</code> en el .env del VPS
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
