"use client";

import {
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Plug,
} from "lucide-react";
import { useState, useEffect } from "react";

interface ZintoV2ConfigState {
  apiKey: string;
  baseUrl: string;
  integrationId: string;
  webhookSecret: string;
  enabled: boolean;
}

interface LoadedFlags {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
}

/**
 * Config de la API v2 de Zinto (bidireccional), EN PARALELO a "WhatsApp
 * (Zinto)" de arriba (v1, la que hoy manda/recibe de verdad). Mientras
 * "enabled" esté apagado, nada de esto toca el tráfico real — ver
 * docs/ZINTO_SETUP.md sección v2.
 */
export function ZintoV2ConfigClient() {
  const [config, setConfig] = useState<ZintoV2ConfigState>({
    apiKey: "",
    baseUrl: "https://crm.zinto.app/api/v2",
    integrationId: "",
    webhookSecret: "",
    enabled: false,
  });
  const [flags, setFlags] = useState<LoadedFlags>({ hasApiKey: false, hasWebhookSecret: false });

  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/zinto-v2-config");
        const data = await res.json();
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            baseUrl: data.config.baseUrl ?? prev.baseUrl,
            integrationId: data.config.integrationId != null ? String(data.config.integrationId) : "",
            enabled: Boolean(data.config.enabled),
          }));
          setFlags({
            hasApiKey: data.config.hasApiKey,
            hasWebhookSecret: data.config.hasWebhookSecret,
          });
        }
      } catch (e) {
        console.error("Error loading Zinto v2 config:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (field: keyof ZintoV2ConfigState, value: string | boolean) =>
    setConfig((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/admin/zinto-v2-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMessage(err.error || "Error al guardar configuración");
        return;
      }
      setSuccessMessage("Configuración de Zinto v2 guardada correctamente.");
      setFlags({
        hasApiKey: flags.hasApiKey || Boolean(config.apiKey),
        hasWebhookSecret: flags.hasWebhookSecret || Boolean(config.webhookSecret),
      });
      setConfig((prev) => ({ ...prev, apiKey: "", webhookSecret: "" }));
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
    setWarningMessage("");
    try {
      const res = await fetch("/api/admin/zinto-v2-config/test", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || "No se pudo conectar con Zinto v2");
        return;
      }
      if (data.warning) {
        setWarningMessage(data.warning);
      } else {
        const scopes = data.capabilities?.scopes?.join(", ");
        setSuccessMessage(
          `Conexión correcta · API v2 disponible (${data.health?.version || "v2"})` +
            (scopes ? ` · scopes: ${scopes}` : ""),
        );
      }
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
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <span>WhatsApp (Zinto) — API v2</span>
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
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 crm-label-sm text-ink/55">
          <span className="text-gold">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <span>WhatsApp (Zinto) — API v2 (beta, en paralelo)</span>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-ink/65">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="h-4 w-4 rounded border-ink/20"
          />
          Activar v2 (envío/recepción real)
        </label>
      </header>

      <div className="mt-4 space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Mientras esté desactivado, todo el WhatsApp real sigue yendo por v1 (arriba). Guía
            completa en <code>docs/ZINTO_SETUP.md</code> (sección &quot;API v2&quot;).
          </span>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
        {warningMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={16} />
            <span>{warningMessage}</span>
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
              API Key (v2) {flags.hasApiKey && <span className="text-green-700">· guardada</span>}
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
              placeholder="https://crm.zinto.app/api/v2"
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/65">
              Integration ID (X-Zinto-Integration-Id)
            </span>
            <input
              type="number"
              value={config.integrationId}
              onChange={(e) => set("integrationId", e.target.value)}
              placeholder="Pídelo/créalo en Zinto — sin esto v2 no responde"
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-medium text-ink/65">
              Webhook Secret (v2){" "}
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
        </div>

        <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-end md:gap-2">
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-gold/5 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
            <span>Probar Conexión (v2)</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>Guardar Configuración</span>
          </button>
        </div>

        <p className="pt-2 text-xs text-ink/55">
          El webhook de v2 es <code>/api/webhooks/zinto-v2</code> (URL completa:{" "}
          <code>https://portal.bcousinoprop.com/api/webhooks/zinto-v2</code>) — distinta de la de
          v1. Solo responde 200 si &quot;Activar v2&quot; está encendido; si no, 404 a propósito.
        </p>
      </div>
    </section>
  );
}
