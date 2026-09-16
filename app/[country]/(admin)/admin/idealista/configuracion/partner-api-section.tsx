"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug, RefreshCw, Users, Link2 } from "lucide-react";

// Credenciales y mantenimiento del Partner API de Idealista (la "API en tiempo
// real"): publicar deja de depender de la extensión de Chrome y pasa a ser una
// llamada directa con respuesta inmediata.

interface ConfigStatus {
  configured: boolean;
  clientId: string;
  feedKey: string;
  sandbox: boolean;
  scope: "idealista" | "microsite";
  sendCode: boolean;
  hasSecret: boolean;
  defaultContactId: number | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

interface ContactOption {
  contactId: number;
  name: string;
  email: string;
}

interface Orphan {
  propertyId: number;
  code: string;
  state: string;
  address: string;
}

const inputCls =
  "w-full rounded-xl border border-ink/10 bg-cream-50 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-gold/50";

export function PartnerApiSection() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [feedKey, setFeedKey] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [scope, setScope] = useState<"idealista" | "microsite">("idealista");
  const [sendCode, setSendCode] = useState(true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; details?: string[] } | null>(null);
  const [orphans, setOrphans] = useState<Orphan[]>([]);

  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [defaultContactId, setDefaultContactId] = useState("");
  const [savingDefaultContact, setSavingDefaultContact] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/idealista/api/config");
      if (!res.ok) return;
      const data = (await res.json()) as ConfigStatus;
      setConfig(data);
      setClientId(data.clientId);
      setFeedKey(data.feedKey);
      setSandbox(data.sandbox);
      setScope(data.scope);
      setSendCode(data.sendCode);
      setDefaultContactId(data.defaultContactId ? String(data.defaultContactId) : "");
    } catch {
      /* el panel se queda con los valores vacíos */
    }
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/admin/idealista/api/contacts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (Array.isArray(data?.contacts)) setContactOptions(data.contacts);
      })
      .catch(() => {});
  }, [load]);

  async function saveDefaultContact() {
    const contactId = Number(defaultContactId);
    if (!Number.isInteger(contactId) || contactId <= 0) return;
    setSavingDefaultContact(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/idealista/api/default-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `Error ${res.status}` });
        return;
      }
      setMessage({
        kind: "ok",
        text:
          body.backfilled > 0
            ? `Contacto por defecto guardado. Se aplicó a ${body.backfilled} ficha(s) que no tenían contacto.`
            : "Contacto por defecto guardado.",
      });
      void load();
    } catch {
      setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setSavingDefaultContact(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/idealista/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret: clientSecret || undefined,
          feedKey,
          sandbox,
          scope,
          sendCode,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: body.error ?? `Error ${res.status}` });
        return;
      }
      setClientSecret("");
      setConfig(body.config);
      setMessage({ kind: "ok", text: "Credenciales guardadas." });
    } catch {
      setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/idealista/api/test-connection", { method: "POST" });
      const body = await res.json();
      if (body.ok) {
        setMessage({ kind: "ok", text: body.message });
      } else {
        setMessage({
          kind: "error",
          text: body.error ?? "No se pudo conectar",
          details: body.details ? [String(body.details).slice(0, 500)] : undefined,
        });
      }
      void load();
    } catch {
      setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setTesting(false);
    }
  }

  async function syncContacts() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/idealista/api/contacts", { method: "PUT" });
      const body = await res.json();
      setMessage(
        body.ok
          ? { kind: "ok", text: `${body.total} contacto(s) sincronizados desde Idealista.` }
          : { kind: "error", text: "No se pudieron sincronizar los contactos", details: body.errors }
      );
    } catch {
      setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setSyncing(false);
    }
  }

  async function reconcile() {
    setReconciling(true);
    setMessage(null);
    setOrphans([]);
    try {
      const res = await fetch("/api/admin/idealista/api/reconcile", { method: "POST" });
      const body = await res.json();
      if (body.errors?.length) {
        setMessage({ kind: "error", text: "La reconciliación terminó con avisos", details: body.errors });
      } else {
        setMessage({
          kind: "ok",
          text: `${body.matched} de ${body.totalRemote} anuncio(s) de Idealista emparejados con fichas del CRM.`,
        });
      }
      setOrphans(body.orphans ?? []);
    } catch {
      setMessage({ kind: "error", text: "No se pudo conectar con el servidor." });
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Plug size={20} className="text-gold" />
        <h2 className="crm-section-title text-ink">API en tiempo real (Partner API)</h2>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Publica los anuncios llamando directamente a Idealista, con respuesta inmediata y control de huecos.
        Sólo admite inmuebles de <strong>segunda mano</strong>. Mientras esté marcado <strong>sandbox</strong> no
        se toca nada real: es el entorno de pruebas de Idealista, disponible de lunes a viernes de 6h a 21h.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">Client ID</label>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} placeholder="bcousino" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink/70">
            Client secret {config?.hasSecret && <span className="text-ink/40">(guardado — déjalo vacío para no cambiarlo)</span>}
          </label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className={inputCls}
            placeholder={config?.hasSecret ? "••••••••••••" : "Client secret de Idealista"}
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-ink/70">feedKey</label>
        <input
          value={feedKey}
          onChange={(e) => setFeedKey(e.target.value)}
          className={`${inputCls} font-mono text-xs`}
          placeholder="ilc…"
        />
        <p className="mt-1 text-xs text-ink/50">
          Es el código de cliente en Idealista: &quot;ilc&quot; y 40 letras o números. Está en su panel, en Herramientas → Configuración.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} className="h-4 w-4 accent-gold" />
          Usar el entorno de pruebas (sandbox)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={scope === "idealista"}
            onChange={(e) => setScope(e.target.checked ? "idealista" : "microsite")}
            className="h-4 w-4 accent-gold"
          />
          Publicar en el buscador de Idealista (si lo desmarcas, sólo se verá en la web de la agencia)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={sendCode} onChange={(e) => setSendCode(e.target.checked)} className="h-4 w-4 accent-gold" />
          Mandar nuestra referencia como código del anuncio (evita duplicados al republicar)
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-ink/10 bg-cream-50 p-3">
        <label className="mb-1 block text-xs font-medium text-ink/70">Contacto por defecto</label>
        <p className="mb-2 text-xs text-ink/50">
          Se usa en toda ficha que no tenga su propio contacto asignado — incluidas las ya creadas. Sincronizá o creá el
          contacto arriba (&quot;Sincronizar contactos&quot; o desde el formulario de cada ficha) antes de elegirlo aquí.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={defaultContactId}
            onChange={(e) => setDefaultContactId(e.target.value)}
            className={`${inputCls} max-w-sm`}
          >
            <option value="">Sin contacto por defecto</option>
            {contactOptions.map((c) => (
              <option key={c.contactId} value={String(c.contactId)}>
                {c.name} — {c.email} (#{c.contactId})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveDefaultContact}
            disabled={savingDefaultContact || !defaultContactId}
            className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-gold/40 disabled:opacity-50"
          >
            {savingDefaultContact ? "Guardando…" : "Guardar y aplicar a fichas sin contacto"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/85 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar credenciales"}
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={testing || !config?.configured}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 bg-cream-50 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 disabled:opacity-50"
        >
          <RefreshCw size={15} className={testing ? "animate-spin" : ""} />
          {testing ? "Probando…" : "Probar conexión"}
        </button>
        <button
          type="button"
          onClick={syncContacts}
          disabled={syncing || !config?.configured}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 bg-cream-50 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 disabled:opacity-50"
        >
          <Users size={15} />
          {syncing ? "Sincronizando…" : "Sincronizar contactos"}
        </button>
        <button
          type="button"
          onClick={reconcile}
          disabled={reconciling || !config?.configured}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 bg-cream-50 px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold/40 disabled:opacity-50"
        >
          <Link2 size={15} />
          {reconciling ? "Reconciliando…" : "Reconciliar anuncios"}
        </button>
      </div>

      {config?.lastTestAt && !message && (
        <p className={`mt-3 text-sm ${config.lastTestOk ? "text-emerald-700" : "text-red-700"}`}>
          Última prueba: {new Date(config.lastTestAt).toLocaleString("es-ES")} — {config.lastTestMessage}
        </p>
      )}

      {message && (
        <div
          className={`mt-3 rounded-xl border p-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-600/20 bg-emerald-50 text-emerald-800"
              : "border-red-600/20 bg-red-50 text-red-800"
          }`}
        >
          <p className="font-medium">{message.text}</p>
          {message.details?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm">
              {message.details.map((detail, i) => (
                <li key={i} className="break-words">{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {orphans.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-600/20 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            {orphans.length} anuncio(s) en Idealista sin ficha equivalente en el CRM
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80">
            No se ha tocado ninguno. Revísalos para decidir si crear la ficha o darlos de baja.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/90">
            {orphans.slice(0, 25).map((orphan) => (
              <li key={orphan.propertyId}>
                <span className="font-mono">{orphan.propertyId}</span>
                {orphan.code ? ` · ref. ${orphan.code}` : ""} · {orphan.state}
                {orphan.address ? ` · ${orphan.address}` : ""}
              </li>
            ))}
            {orphans.length > 25 && <li className="text-amber-800/70">…y {orphans.length - 25} más</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
