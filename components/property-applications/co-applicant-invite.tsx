"use client";

import { useState } from "react";
import { Check, UserPlus, X } from "lucide-react";

export function CoApplicantInvite({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/property-applications/co-applicants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId, invite_email: email }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al enviar la invitación");
        return;
      }
      setSent(true);
      setEmail("");
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-cream-50/60 bg-cream-50/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">¿Solicitud conjunta?</p>
          <p className="text-xs text-ink/50">
            Invita a un co-solicitante (pareja, compañero). Cada uno sube sus documentos por separado.
          </p>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
          >
            <UserPlus size={13} />
            Invitar
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleInvite} className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            required
            className="flex-1 rounded-lg border border-ink/20 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {loading ? "..." : <><Check size={12} /> Enviar</>}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="rounded-lg p-2 text-ink/40 transition hover:text-ink"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {sent && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-green-600">
          <Check size={12} />
          Invitación enviada. El co-solicitante recibirá un email para unirse.
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      <p className="mt-3 text-[11px] text-ink/40">
        La privacidad está garantizada: cada solicitante solo ve sus propios documentos.
      </p>
    </div>
  );
}
