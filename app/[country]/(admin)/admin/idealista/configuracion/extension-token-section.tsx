"use client";

import { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";

// Genera y muestra el token de la extensión de Chrome (antes solo se podía
// obtener con curl/fetch desde la consola del navegador). El token no se
// guarda en el portal: se firma al momento y se pega una sola vez en las
// Opciones de la extensión.
export function ExtensionTokenSection() {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/idealista/extension-token", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === "Forbidden" ? "Solo owner/admin pueden generar el token" : `Error ${res.status}`);
        return;
      }
      const body = await res.json();
      setToken(body.token);
      setExpiresAt(body.expiresAt ?? null);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* el token queda visible para copiar a mano */
    }
  }

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound size={20} className="text-gold" />
        <h2 className="font-serif text-lg font-semibold text-ink">Token de la extensión de Chrome</h2>
      </div>
      <p className="mb-4 text-sm text-ink/60">
        La extensión necesita este token para enviar los contactos del inbox de Idealista al portal.
        Genera uno, cópialo y pégalo en Chrome → Extensiones → SmartBC → Idealista → <strong>Opciones</strong>.
        Dura 1 año; generar uno nuevo no invalida los anteriores.
      </p>

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/85 disabled:opacity-50"
      >
        {loading ? "Generando…" : token ? "Generar otro token" : "Generar token"}
      </button>

      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

      {token && (
        <div className="mt-4">
          <div className="flex items-start gap-2 rounded-xl border border-ink/10 bg-ink/[0.04] p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-relaxed text-ink/80">{token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="shrink-0 rounded-lg border border-ink/10 bg-cream-50 p-2 text-ink/60 transition hover:text-ink"
              title="Copiar token"
            >
              {copied ? <Check size={16} className="text-teal-700" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink/45">
            {copied ? "✓ Copiado al portapapeles. " : ""}
            {expiresAt ? `Válido hasta ${new Date(expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}. ` : ""}
            Guárdalo en las Opciones de la extensión — no se vuelve a mostrar al salir de esta página.
          </p>
        </div>
      )}
    </div>
  );
}
