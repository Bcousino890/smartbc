"use client";

import { Mail, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n/provider";

interface EmailConfigData {
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  fromEmail: string;
  fromName?: string;
}

interface LoadedFlags {
  hasSecretAccessKey: boolean;
}

export function EmailConfigClient() {
  const t = useT();
  const [config, setConfig] = useState<EmailConfigData>({
    awsRegion: "eu-west-1",
    awsAccessKeyId: "",
    awsSecretAccessKey: "",
    fromEmail: "",
    fromName: "SmartBC",
  });
  const [flags, setFlags] = useState<LoadedFlags>({ hasSecretAccessKey: false });

  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [sendingTo, setSendingTo] = useState(false);
  const [testToEmail, setTestToEmail] = useState("");
  const [sendToStatus, setSendToStatus] = useState<"idle" | "success" | "error">("idle");
  const [sendToMessage, setSendToMessage] = useState("");

  // Load existing config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/admin/email-config");
        const data = await response.json();

        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            awsRegion: data.config.awsRegion || prev.awsRegion,
            awsAccessKeyId: data.config.awsAccessKeyId || "",
            fromEmail: data.config.fromEmail || "",
            fromName: data.config.fromName || prev.fromName,
          }));
          setFlags({ hasSecretAccessKey: Boolean(data.config.hasSecretAccessKey) });
        }
      } catch (error) {
        console.error("Error loading email config:", error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleInputChange = (field: keyof EmailConfigData, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/email-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        setSaveStatus("error");
        setErrorMessage(error.error || "Error al guardar configuración");
        return;
      }

      setSaveStatus("success");
      setSuccessMessage("Configuración guardada exitosamente");
      setFlags((prev) => ({ hasSecretAccessKey: prev.hasSecretAccessKey || Boolean(config.awsSecretAccessKey) }));
      // Clear the secret input after save (it's stored encrypted now).
      setConfig((prev) => ({ ...prev, awsSecretAccessKey: "" }));
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestStatus("idle");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/email-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setTestStatus("error");
        setErrorMessage(data.error || "Error al probar la conexión");
        return;
      }

      setTestStatus("success");
      setSuccessMessage(data.message || "Conexión exitosa");
      setTimeout(() => setTestStatus("idle"), 3000);
    } catch (error) {
      setTestStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
          <span className="text-gold">
            <Mail size={16} strokeWidth={1.75} />
          </span>
          <span>Configuración de Email (AWS SES)</span>
        </header>
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-gold" />
        </div>
      </section>
    );
  }

  const secretPlaceholder = flags.hasSecretAccessKey
    ? "•••••••• (guardada — deja vacío para conservar)"
    : "Pega la Secret Access Key aquí";

  return (
    <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <header className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
        <span className="text-gold">
          <Mail size={16} strokeWidth={1.75} />
        </span>
        <span>Configuración de Email (AWS SES)</span>
      </header>

      <div className="mt-4 space-y-4">
        {/* Status Messages */}
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

        {/* Form Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* From Email */}
          <Field
            labelKey="Correo de remitente"
            type="email"
            value={config.fromEmail}
            onChange={(v) => handleInputChange("fromEmail", v)}
            placeholder="no-reply@example.com"
          />

          {/* From Name */}
          <Field
            labelKey="Nombre de remitente"
            type="text"
            value={config.fromName || ""}
            onChange={(v) => handleInputChange("fromName", v)}
            placeholder="SmartBC"
          />

          {/* AWS Region */}
          <Field
            labelKey="AWS Region"
            type="text"
            value={config.awsRegion}
            onChange={(v) => handleInputChange("awsRegion", v)}
            placeholder="eu-west-1"
          />

          {/* AWS Access Key ID */}
          <Field
            labelKey="AWS Access Key ID"
            type="text"
            value={config.awsAccessKeyId}
            onChange={(v) => handleInputChange("awsAccessKeyId", v)}
            placeholder="AKIA..."
          />

          {/* AWS Secret Access Key */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[11px] font-medium text-ink/65">
              AWS Secret Access Key {flags.hasSecretAccessKey && <span className="text-green-700">· guardada</span>}
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white/85 px-3 py-2">
              <input
                type={showSecret ? "text" : "password"}
                value={config.awsSecretAccessKey}
                onChange={(e) => handleInputChange("awsSecretAccessKey", e.target.value)}
                placeholder={secretPlaceholder}
                className="w-full bg-transparent text-sm text-ink focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="text-ink/55 hover:text-ink"
              >
                {showSecret ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 pt-2 md:flex-row md:justify-end md:gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testing || saving}
            className="flex items-center justify-center gap-2 rounded-xl border border-gold/30 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-gold/5 disabled:opacity-50"
          >
            {testing && <Loader2 size={14} className="animate-spin" />}
            <span>Probar Conexión</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>Guardar Configuración</span>
          </button>
        </div>

        {/* Send test to specific address */}
        <div className="border-t border-ink/8 pt-4 mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45 mb-3">Enviar correo de prueba</p>
          {sendToStatus !== "idle" && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm mb-3 ${sendToStatus === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
              {sendToStatus === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span>{sendToMessage}</span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              value={testToEmail}
              onChange={(e) => setTestToEmail(e.target.value)}
              placeholder="destino@ejemplo.com"
              className="flex-1 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            />
            <button
              onClick={async () => {
                setSendingTo(true);
                setSendToStatus("idle");
                setSendToMessage("");
                try {
                  const res = await fetch("/api/admin/email-config/send-test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ to: testToEmail }),
                  });
                  const data = await res.json();
                  if (!res.ok || !data.ok) {
                    setSendToStatus("error");
                    setSendToMessage(data.error || "Error al enviar");
                  } else {
                    setSendToStatus("success");
                    setSendToMessage(data.message || "Enviado correctamente");
                    setTimeout(() => setSendToStatus("idle"), 4000);
                  }
                } catch (e) {
                  setSendToStatus("error");
                  setSendToMessage(e instanceof Error ? e.message : "Error desconocido");
                } finally {
                  setSendingTo(false);
                }
              }}
              disabled={sendingTo || !testToEmail}
              className="flex items-center gap-2 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-gold/5 disabled:opacity-40"
            >
              {sendingTo ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Enviar</span>
            </button>
          </div>
        </div>

        {/* Info Text */}
        <p className="text-[11px] text-ink/55 pt-2">
          Las credenciales se guardan encriptadas en la base de datos. Se utilizarán para enviar correos de restablecimiento de contraseña e invitaciones.
        </p>
      </div>
    </section>
  );
}

interface FieldProps {
  labelKey: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
}

function Field({
  labelKey,
  type = "text",
  value,
  onChange,
  placeholder,
  fullWidth,
}: FieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${fullWidth ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] font-medium text-ink/65">{labelKey}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
      />
    </label>
  );
}
