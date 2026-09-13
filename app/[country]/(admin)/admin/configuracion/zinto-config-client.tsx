"use client";

import {
  MessageCircle,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plug,
  Activity,
  Webhook,
  MinusCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface ZintoConfigState {
  apiKey: string;
  baseUrl: string;
  channelId: number;
  webhookSecret: string;
  inboundToken: string;
  integrationApiKey: string;
}

interface LoadedFlags {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  hasInboundToken: boolean;
  hasIntegrationApiKey: boolean;
  hasIntegrationWebhookSecret: boolean;
  resolvedIntegrationBaseUrl: string;
}

type CheckStatus = "ok" | "warn" | "fail" | "skip";

interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: string;
}

interface CredentialProbe {
  credential: string;
  isActive: boolean;
  version: "v1" | "v2";
  url: string;
  status: number | string;
  authenticated: boolean;
  company?: string;
  scopeCount?: number;
  error?: string;
}

interface HealthReport {
  verdict: string;
  ok: boolean;
  checkedAt: string;
  apiUrl: string | null;
  apiVersion: string | null;
  credentialSource: "database" | "env" | null;
  company: string | null;
  scopes: string[];
  checks: HealthCheck[];
  credentialMatrix: CredentialProbe[];
}

const STATUS_ICON: Record<CheckStatus, typeof CheckCircle> = {
  ok: CheckCircle,
  warn: AlertTriangle,
  fail: XCircle,
  skip: MinusCircle,
};

const STATUS_COLOR: Record<CheckStatus, string> = {
  ok: "text-green-600",
  warn: "text-amber-600",
  fail: "text-red-600",
  skip: "text-ink/35",
};

export function ZintoConfigClient() {
  const [config, setConfig] = useState<ZintoConfigState>({
    apiKey: "",
    baseUrl: "https://crm.zinto.app/api/v1",
    channelId: 4,
    webhookSecret: "",
    inboundToken: "",
    integrationApiKey: "",
  });
  const [flags, setFlags] = useState<LoadedFlags>({
    hasApiKey: false,
    hasWebhookSecret: false,
    hasInboundToken: false,
    hasIntegrationApiKey: false,
    hasIntegrationWebhookSecret: false,
    resolvedIntegrationBaseUrl: "",
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
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);

  const loadConfig = useCallback(async () => {
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
          hasIntegrationApiKey: data.config.hasIntegrationApiKey ?? false,
          hasIntegrationWebhookSecret: data.config.hasIntegrationWebhookSecret ?? false,
          resolvedIntegrationBaseUrl: data.config.resolvedIntegrationBaseUrl ?? "",
        });
      }
    } catch (e) {
      console.error("Error loading Zinto config:", e);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/admin/zinto/health");
      setHealth(res.ok ? await res.json() : null);
    } catch (e) {
      console.error("Error loading Zinto health:", e);
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadConfig();
      setLoading(false);
      await loadHealth();
    })();
  }, [loadConfig, loadHealth]);

  const handleRegisterWebhook = async () => {
    if (
      !confirm(
        "Se dará de alta el webhook en Zinto y se guardará su secreto cifrado. " +
          "Si ya había uno apuntando a esta URL, se reemplaza. ¿Continuar?",
      )
    ) {
      return;
    }
    setRegisteringWebhook(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const res = await fetch("/api/admin/zinto/webhook", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setErrorMessage(data.error || "No se pudo registrar el webhook");
        return;
      }
      setSuccessMessage(
        `Webhook registrado (${data.webhookId}) · ${data.eventTypes} tipos de evento` +
          (data.replaced ? ` · se reemplazaron ${data.replaced} duplicado(s)` : ""),
      );
      await loadConfig();
      await loadHealth();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setRegisteringWebhook(false);
    }
  };

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
      // Clear secret inputs after save (they're stored encrypted now).
      setConfig((prev) => ({
        ...prev,
        apiKey: "",
        webhookSecret: "",
        inboundToken: "",
        integrationApiKey: "",
      }));
      // Releer del servidor en vez de adivinar: la URL base se normaliza al
      // guardar, así que lo que quedó almacenado puede no ser lo que se envió.
      await loadConfig();
      await loadHealth();
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

        {/* Estado real de la integración. Va ARRIBA a propósito: "Probar
            Conexión" sólo mira la capa legacy, y durante cuatro semanas dijo
            que todo iba bien mientras la capa nueva estaba muerta. */}
        <div className="rounded-xl border border-ink/10 bg-white/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 crm-label-sm text-ink/55">
              <Activity size={15} strokeWidth={1.75} className="text-gold" />
              <span>Estado de la integración</span>
            </div>
            <button
              type="button"
              onClick={loadHealth}
              disabled={healthLoading}
              className="rounded-lg border border-ink/10 px-2.5 py-1 text-xs text-ink/65 transition hover:bg-ink/5 disabled:opacity-50"
            >
              {healthLoading ? "Comprobando…" : "Volver a comprobar"}
            </button>
          </div>

          {healthLoading && !health ? (
            <div className="flex items-center gap-2 py-4 text-sm text-ink/50">
              <Loader2 size={14} className="animate-spin" />
              <span>Preguntando a Zinto…</span>
            </div>
          ) : !health ? (
            <p className="pt-3 text-sm text-ink/55">
              No se pudo obtener el diagnóstico.
            </p>
          ) : (
            <>
              <p
                className={`mt-3 rounded-lg border p-3 text-sm ${
                  health.ok
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {health.verdict}
              </p>

              <ul className="mt-3 space-y-2">
                {health.checks.map((check) => {
                  const Icon = STATUS_ICON[check.status];
                  return (
                    <li key={check.id} className="flex items-start gap-2 text-sm">
                      <Icon
                        size={15}
                        className={`mt-0.5 shrink-0 ${STATUS_COLOR[check.status]}`}
                      />
                      <div className="min-w-0">
                        <span className="font-medium text-ink">{check.label}</span>
                        <span className="text-ink/60"> · {check.detail}</span>
                        {check.action && (
                          <span className="block text-xs text-ink/50">→ {check.action}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {health.scopes.length > 0 && (
                <p className="mt-3 text-xs text-ink/45">
                  Empresa: <strong>{health.company ?? "—"}</strong> · Credencial:{" "}
                  {health.credentialSource === "database" ? "panel" : "entorno"} · API{" "}
                  {health.apiVersion ?? "v1"} · Scopes: {health.scopes.join(", ")}
                </p>
              )}

              {health.credentialMatrix?.length > 1 && (
                <details className="mt-3 rounded-lg border border-ink/10 bg-cream-50/60 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-ink/65">
                    Qué credencial vale contra qué versión de la API (
                    {health.credentialMatrix.filter((p) => p.authenticated).length}/
                    {health.credentialMatrix.length})
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {health.credentialMatrix.map((probe, i) => (
                      <li
                        key={`${probe.credential}-${probe.version}-${i}`}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span
                          className={
                            probe.authenticated ? "text-green-600" : "text-ink/30"
                          }
                        >
                          {probe.authenticated ? "●" : "○"}
                        </span>
                        <span className="text-ink/70">
                          <strong>{probe.credential}</strong> contra{" "}
                          <code className="text-ink/60">{probe.version}</code>
                          {probe.isActive && (
                            <span className="ml-1 rounded bg-gold/15 px-1 text-[10px] text-ink/70">
                              en uso
                            </span>
                          )}
                          {" · "}
                          {probe.authenticated
                            ? `${probe.company ?? "autentica"} · ${probe.scopeCount ?? 0} scopes`
                            : `${probe.status} ${probe.error ?? ""}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          <div className="mt-4 flex flex-col gap-2 border-t border-ink/8 pt-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-ink/50">
              El webhook es lo que trae los mensajes entrantes. Sin él la comunicación es
              sólo de ida.
            </p>
            <button
              type="button"
              onClick={handleRegisterWebhook}
              disabled={registeringWebhook}
              className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-gold/5 disabled:opacity-50"
            >
              {registeringWebhook ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Webhook size={14} />
              )}
              <span>
                {flags.hasIntegrationWebhookSecret ? "Volver a registrar webhook" : "Registrar webhook"}
              </span>
            </button>
          </div>
        </div>

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

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-medium text-ink/65">
              API Key de integración{" "}
              {flags.hasIntegrationApiKey ? (
                <span className="text-green-700">· guardada</span>
              ) : (
                <span className="text-ink/40">· opcional</span>
              )}
            </span>
            <input
              type={showSecrets ? "text" : "password"}
              value={config.integrationApiKey}
              onChange={(e) => set("integrationApiKey", e.target.value)}
              placeholder={
                flags.hasIntegrationApiKey
                  ? "•••••••• (guardada — deja vacío para conservar)"
                  : "Déjalo vacío si es la misma clave de arriba"
              }
              className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
            <span className="text-[11px] text-ink/45">
              Sólo si Zinto os dio una clave aparte para la API de integración. Vacío = se
              usa la API Key de arriba para todo.
            </span>
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
            {flags.resolvedIntegrationBaseUrl && (
              <span className="text-[11px] text-ink/45">
                La API de integración se llamará en{" "}
                <code className="text-ink/60">
                  {flags.resolvedIntegrationBaseUrl}/api/v1/…
                </code>
              </span>
            )}
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
        <p className="text-xs text-ink/45">
          <strong>&laquo;Probar Conexión&raquo; sólo comprueba la capa antigua de WhatsApp</strong>{" "}
          (listar canales). Para saber si la integración completa funciona, mira
          &laquo;Estado de la integración&raquo; arriba: es lo único que verifica la URL, la
          clave, los permisos y el webhook por separado.
        </p>
      </div>
    </section>
  );
}
