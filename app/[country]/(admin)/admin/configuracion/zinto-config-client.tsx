"use client";

import {
  MessageCircle,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plug,
} from "lucide-react";
import { useState, useEffect } from "react";

interface ZintoConfigState {
  apiKey: string;
  baseUrl: string;
  channelId: number;
  webhookSecret: string;
  inboundToken: string;
}

interface LoadedFlags {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  hasInboundToken: boolean;
}

export function ZintoConfigClient() {
  const [config, setConfig] = useState<ZintoConfigState>({
    apiKey: "",
    baseUrl: "https://crm.zinto.app/api/v1",
    channelId: 4,
    webhookSecret: "",
    inboundToken: "",
  });
  const [flags, setFlags] = useState<LoadedFlags>({
    hasApiKey: false,
    hasWebhookSecret: false,
    hasInboundToken: false,
  });

  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [channels, setChannels] = useState<
    { id: number; name: string; type: string; status: string }[] | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/zinto-config");
        const data = await res.json();
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            baseUrl: data.config.baseUrl ?? prev.baseUrl,
            channelId: data.config.channelId ?? prev.channelId,
          }));
          setFlags({
            hasApiKey: data.config.hasApiKey,
            hasWebhookSecret: data.config.hasWebhookSecret,
            hasInboundToken: data.config.hasInboundToken,
          });
        }
      } catch (e) {
        console.error("Error loading Zinto config:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (field: keyof ZintoConfigState, value: string | number) =>
    setConfig((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/admin/zinto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMessage(err.error || "Error al guardar configuración");
        return;
      }
      setSuccessMessage("Configuración de Zinto guardada correctamente.");
      setFlags({
        hasApiKey: flags.hasApiKey || Boolean(config.apiKey),
        hasWebhookSecret: flags.hasWebhookSecret || Boolean(config.webhookSecret),
        hasInboundToken: flags.hasInboundToken || Boolean(config.inboundToken),
      });
      // Clear secret inputs after save (they're stored encrypted now).
      setConfig((prev) => ({ ...prev, apiKey: "", webhookSecret: "", inboundToken: "" }));
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setChannels(null);
    try {
      const res = await fetch("/api/admin/zinto-config/test", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || "No se pudo conectar con Zinto");
        return;
      }
      setChannels(data.channels || []);
      setSuccessMessage(`Conexión correcta · ${data.count} canal(es) encontrado(s).`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <header className="flex items-center gap-2 crm-label-sm text-ink/55">
          <span className="text-gold">
            <MessageCircle size={16} strokeWidth={1.75} />
          </span>
          <span>WhatsApp (Zinto)</span>
        </header>
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gold" />
        </div>
      </section>
    );
  }

  const secretPlaceholder = (has: boolean) =>
    has ? "•••••••• (guardado — deja vacío para conservar)" : "Pega el valor aquí";

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <header className="flex items-center gap-2 crm-label-sm text-ink/55">
        <span className="text-[#128C7E]">
          <MessageCircle size={16} strokeWidth={1.75} />
        </span>
        <span>WhatsApp (Zinto)</span>
      </header>

      <div className="mt-4 space-y-4">
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-medium text-ink/65">
              API Key {flags.hasApiKey && <span className="text-green-700">· guardada</span>}
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white/85 px-3 py-2">
              <input
                type={showSecrets ? "text" : "password"}
                value={config.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                placeholder={secretPlaceholder(flags.hasApiKey)}
                className="w-full bg-transparent text-sm text-ink focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="text-ink/55 hover:text-ink"
              >
                {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/65">URL base</span>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              placeholder="https://crm.zinto.app/api/v1"
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/65">Channel ID (WhatsApp)</span>
            <input
              type="number"
              value={config.channelId}
              onChange={(e) => set("channelId", parseInt(e.target.value || "4", 10))}
              placeholder="4"
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/65">
              Webhook Secret (estado){" "}
              {flags.hasWebhookSecret && <span className="text-green-700">· guardado</span>}
            </span>
            <input
              type={showSecrets ? "text" : "password"}
              value={config.webhookSecret}
              onChange={(e) => set("webhookSecret", e.target.value)}
              placeholder={secretPlaceholder(flags.hasWebhookSecret)}
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/65">
              Inbound Token (X-Zinto-Token){" "}
              {flags.hasInboundToken && <span className="text-green-700">· guardado</span>}
            </span>
            <input
              type={showSecrets ? "text" : "password"}
              value={config.inboundToken}
              onChange={(e) => set("inboundToken", e.target.value)}
              placeholder={secretPlaceholder(flags.hasInboundToken)}
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-end md:gap-2">
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-gold/5 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            <span>Probar Conexión</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#128C7E] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#0e6f64] disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>Guardar Configuración</span>
          </button>
        </div>

        {channels && (
          <div className="border-t border-ink/8 pt-4">
            <p className="mb-2 crm-label-sm text-ink/45">
              Canales de Zinto
            </p>
            <div className="space-y-2">
              {channels.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white/70 p-2.5 text-sm text-ink"
                >
                  <span
                    className={
                      c.status === "active" ? "text-green-600" : "text-ink/40"
                    }
                  >
                    ●
                  </span>
                  <span className="font-medium">#{c.id}</span>
                  <span>{c.name}</span>
                  <span className="text-ink/45">({c.type})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="pt-2 text-xs text-ink/55">
          Las claves se guardan <strong>cifradas</strong> en la base de datos (nunca en git).
          El <em>Inbound Token</em> debe coincidir con el header <code>X-Zinto-Token</code> del
          Flujo de Zinto. Guía completa en <code>docs/ZINTO_SETUP.md</code>.
        </p>
      </div>
    </section>
  );
}
