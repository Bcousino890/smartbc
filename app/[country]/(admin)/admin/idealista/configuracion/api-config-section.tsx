"use client";

import { Cable, Loader2, Check, KeyRound, Wifi, FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";

const inputCls =
  "w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none";

export function ApiConfigSection() {
  const [feedKey, setFeedKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [clientSecretMasked, setClientSecretMasked] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [apiEnabled, setApiEnabled] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [hasDefaultContact, setHasDefaultContact] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/idealista/api-config");
        const d = await res.json();
        if (res.ok) {
          setFeedKey(d.feedKey ?? "");
          setClientId(d.clientId ?? "");
          setClientSecretMasked(d.clientSecretMasked ?? "");
          setSandbox(d.sandbox ?? true);
          setApiEnabled(d.apiEnabled ?? false);
          setContactName(d.defaultContactName ?? "");
          setContactEmail(d.defaultContactEmail ?? "");
          setContactPhone(d.defaultContactPhone ?? "");
          setHasDefaultContact(!!d.hasDefaultContact);
        }
      } catch {
        // silencioso — el usuario puede reintentar guardando
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/idealista/api-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedKey,
          clientId,
          clientSecret,
          sandbox,
          apiEnabled,
          defaultContactName: contactName,
          defaultContactEmail: contactEmail,
          defaultContactPhone: contactPhone,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Error al guardar");
        return;
      }
      setClientSecret("");
      setMsg("Guardado. Prueba la conexión para confirmar que las credenciales funcionan.");
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/idealista/api-test-connection", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d.error ?? "No se pudo conectar con el Partner API de Idealista");
        return;
      }
      setMsg(
        `Conexión OK. Anuncios publicados: ${d.publishInfo?.publishedAds ?? "?"} / ${d.publishInfo?.maxPublishedAds ?? "?"}`
      );
    } catch {
      setError("Error de red al probar la conexión");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-2 flex items-center gap-2">
        <Cable size={20} className="text-gold" />
        <h2 className="font-serif text-lg font-semibold text-ink">
          Partner API de Idealista (REST oficial)
        </h2>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Publicación vía API oficial de Idealista (OAuth2 + <code className="rounded bg-ink/5 px-1">feedKey</code>),
        en paralelo al login por cookies de arriba. No sustituye ese método — es una vía adicional,
        más estable a largo plazo porque no depende de que Idealista mantenga igual su web.
        Pide el <code className="rounded bg-ink/5 px-1">client_id</code> /{" "}
        <code className="rounded bg-ink/5 px-1">client_secret</code> a tu gestor de cuenta de Idealista
        (o a <code className="rounded bg-ink/5 px-1">datafeed@idealista.com</code>) si aún no los tienes.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={14} className="animate-spin" /> Cargando configuración...
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
              feedKey
            </label>
            <input
              type="text"
              value={feedKey}
              onChange={(e) => setFeedKey(e.target.value)}
              placeholder="ilc..."
              className={`${inputCls} font-mono`}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                client_id
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={`${inputCls} font-mono`}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                client_secret
                {clientSecretMasked && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <Check size={10} /> Guardado
                  </span>
                )}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={clientSecretMasked ? `${clientSecretMasked} (déjalo vacío para conservar)` : "..."}
                className={`${inputCls} font-mono`}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
              Modo sandbox (pruebas, no publica anuncios reales)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" checked={apiEnabled} onChange={(e) => setApiEnabled(e.target.checked)} />
              Habilitar publicación vía API
            </label>
          </div>

          <div className="rounded-xl border border-ink/10 bg-white/60 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink/50">
              Contacto por defecto {hasDefaultContact && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 normal-case tracking-normal">
                  <Check size={10} /> Creado en Idealista
                </span>
              )}
            </p>
            <p className="mb-3 text-[11px] text-ink/45">
              El Partner API exige asociar cada anuncio a un contacto/agente ya dado de alta en tu
              cuenta de Idealista. Se crea una sola vez con estos datos y se reutiliza en todas las
              publicaciones por API.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Nombre"
                className={inputCls}
              />
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email"
                className={inputCls}
              />
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+34600111222"
                className={inputCls}
              />
            </div>
          </div>

          {msg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check size={14} /> {msg}
            </div>
          )}
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Guardar credenciales
            </button>
            <button
              type="button"
              onClick={testConnection}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
              Probar conexión
            </button>
            {sandbox && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <FlaskConical size={12} /> Sandbox activo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
