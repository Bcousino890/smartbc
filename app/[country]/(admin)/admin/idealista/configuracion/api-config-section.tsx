"use client";

import { Check, Globe, Loader2, ShieldCheck, TestTube2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LoadedConfig = {
  clientId: string;
  hasClientSecret: boolean;
  feedKey: string;
  sandbox: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
};

export function ApiConfigSection() {
  const [loaded, setLoaded] = useState<LoadedConfig | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [feedKey, setFeedKey] = useState("");
  const [sandbox, setSandbox] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testInfo, setTestInfo] = useState<unknown>(null);

  useEffect(() => {
    fetch("/api/admin/idealista/api/config")
      .then((r) => r.json())
      .then((d: LoadedConfig) => {
        setLoaded(d);
        setClientId(d.clientId ?? "");
        setFeedKey(d.feedKey ?? "");
        setSandbox(d.sandbox !== false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!clientId.trim() || !feedKey.trim()) {
      setError("Client ID y feedKey son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/idealista/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
          feedKey: feedKey.trim(),
          sandbox,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setMessage("Configuración guardada.");
      setClientSecret("");
      setLoaded((prev) => (prev ? { ...prev, clientId, feedKey, sandbox, hasClientSecret: true } : prev));
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    setTestInfo(null);
    try {
      const res = await fetch("/api/admin/idealista/api/test-connection", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo conectar");
        return;
      }
      setMessage("Conexión correcta.");
      setTestInfo(data.info);
    } catch {
      setError("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-2 flex items-center gap-2">
        <Zap size={18} className="text-gold" />
        <h3 className="font-serif text-base font-semibold text-ink">
          API oficial de Idealista (Partner API)
        </h3>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Nuevo
        </span>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Publica fichas directamente por el API oficial (OAuth2), en vez de abrir idealista.com con la extensión.
        Pide estas credenciales a tu gestor de cuenta de Idealista (client_id, client_secret y feedKey del partner
        program). Requiere que cada ficha tenga un <strong>ID de contacto de Idealista</strong> cargado.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={14} className="animate-spin" />
          Cargando configuración...
        </div>
      ) : (
        <div className="space-y-4">
          {message && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check size={14} />
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID del partner program"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Client Secret {loaded?.hasClientSecret && <span className="text-ink/35">(configurado — deja vacío para no cambiarlo)</span>}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={loaded?.hasClientSecret ? "••••••••••" : "Client secret"}
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                feedKey
              </label>
              <input
                type="text"
                value={feedKey}
                onChange={(e) => setFeedKey(e.target.value)}
                placeholder="ilc..."
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Entorno
              </label>
              <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
                <button
                  type="button"
                  onClick={() => setSandbox(true)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                    sandbox ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink/70"
                  )}
                >
                  <TestTube2 size={13} />
                  Sandbox
                </button>
                <button
                  type="button"
                  onClick={() => setSandbox(false)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                    !sandbox ? "bg-white text-red-700 shadow-sm" : "text-ink/50 hover:text-ink/70"
                  )}
                >
                  <Globe size={13} />
                  Producción
                </button>
              </div>
            </div>
          </div>

          {!sandbox && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Producción: las publicaciones serán reales y visibles en idealista.com. Valida primero en sandbox.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Guardar
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !loaded?.hasClientSecret}
              title={!loaded?.hasClientSecret ? "Guarda las credenciales primero" : undefined}
              className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube2 size={14} />}
              Probar conexión
            </button>
            {loaded?.lastTestAt && (
              <span className="text-xs text-ink/40">
                Último test: {new Date(loaded.lastTestAt).toLocaleString("es-ES")} —{" "}
                {loaded.lastTestOk ? "✓ OK" : "✗ falló"}
              </span>
            )}
          </div>

          {testInfo != null && (
            <pre className="overflow-x-auto rounded-lg bg-ink/5 p-3 text-[11px] text-ink/70">
              {JSON.stringify(testInfo, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
