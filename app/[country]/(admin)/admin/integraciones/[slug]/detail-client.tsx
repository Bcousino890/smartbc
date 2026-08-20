"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ApiClientRow } from "@/lib/api/types";
import type { ApiKeySummary, ApiRequestSummary } from "@/lib/db/queries/api-clients";
import { cn } from "@/lib/utils";

type StaffOption = { id: string; full_name: string | null; email: string | null };
type PipelineOption = { id: string; name: string; is_default: boolean };

type Tab = "claves" | "config" | "log" | "guia";

export function IntegracionDetailClient({
  country,
  client,
  keys,
  requests,
  staff,
  pipelines,
}: {
  country: string;
  client: ApiClientRow;
  keys: ApiKeySummary[];
  requests: ApiRequestSummary[];
  staff: StaffOption[];
  pipelines: PipelineOption[];
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("claves");
  const [keyList, setKeyList] = useState(keys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState(client);
  const [logs, setLogs] = useState(requests);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function generateKey() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integraciones/clients/${client.id}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `Clave ${keyList.length + 1}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "No se pudo generar la clave", "error");
        return;
      }
      setKeyList((prev) => [data.key, ...prev]);
      setFreshKey(data.plaintext);
      toast("Clave generada. Cópiala ahora: no se vuelve a mostrar.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(keyId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integraciones/keys/${keyId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "No se pudo revocar la clave", "error");
        return;
      }
      setKeyList((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, revoked_at: data.key.revoked_at } : k))
      );
      toast("Clave revocada", "success");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(patch: Partial<ApiClientRow>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integraciones/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "No se pudo guardar", "error");
        return;
      }
      setConfig(data.client);
      toast("Configuración guardada", "success");
    } finally {
      setBusy(false);
    }
  }

  async function reloadLogs(onlyErrors: boolean) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/integraciones/clients/${client.id}/requests?limit=100${onlyErrors ? "&errors=1" : ""}`
      );
      const data = await res.json();
      if (res.ok) setLogs(data.requests ?? []);
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast("Copiado al portapapeles", "success"),
      () => toast("No se pudo copiar", "error")
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "claves", label: "Claves" },
    { id: "config", label: "Configuración" },
    { id: "log", label: "Peticiones" },
    { id: "guia", label: "Guía para el proveedor" },
  ];

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/${country}/admin/integraciones`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold/20 text-ink/60 transition hover:bg-gold/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h2 className="crm-section-title text-ink">{config.name}</h2>
            <p className="font-mono text-xs text-ink/45">{config.slug}</p>
          </div>
        </div>
        <button
          onClick={() => saveConfig({ active: !config.active })}
          disabled={busy}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50",
            config.active
              ? "border border-rose-200 text-rose-600 hover:bg-rose-50"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          )}
        >
          {config.active ? "Desactivar integración" : "Activar integración"}
        </button>
      </div>

      {freshKey && (
        <Card className="border-amber-300/60 bg-amber-50/80 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            Clave generada — cópiala ahora, no se puede volver a mostrar
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-white/80 px-3 py-2 font-mono text-xs text-ink">
              {freshKey}
            </code>
            <button
              onClick={() => copy(freshKey)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-cream-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </button>
            <button
              onClick={() => setFreshKey(null)}
              className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-900"
            >
              Ya la guardé
            </button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition",
              tab === t.id ? "bg-ink text-cream-50" : "text-ink/60 hover:bg-gold/5"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "claves" && (
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-ink">Claves de API</h3>
              <p className="mt-0.5 text-sm text-ink/55">
                Solo se guarda el hash. Si el proveedor pierde la clave, genera otra y revoca la
                anterior.
              </p>
            </div>
            <button
              onClick={generateKey}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Generar clave
            </button>
          </div>

          {keyList.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-gold/25 px-6 py-10 text-center text-sm text-ink/50">
              Sin claves. Genera una para que el proveedor pueda autenticarse.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-2">
              {keyList.map((key) => (
                <li
                  key={key.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/15 bg-white/50 px-4 py-3",
                    key.revoked_at && "opacity-55"
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-sm text-ink">
                      <KeyRound className="h-3.5 w-3.5 text-ink/40" />
                      {key.key_prefix}_…{key.last_four}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/45">
                      {key.label ? `${key.label} · ` : ""}
                      {key.scopes.join(", ")} · {key.rate_limit_per_minute}/min
                      {key.last_used_at
                        ? ` · último uso ${new Date(key.last_used_at).toLocaleString("es-CL")}`
                        : " · sin usar"}
                    </p>
                  </div>
                  {key.revoked_at ? (
                    <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink/50">
                      Revocada
                    </span>
                  ) : (
                    <button
                      onClick={() => revokeKey(key.id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Revocar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "config" && (
        <Card className="p-5 md:p-6">
          <h3 className="font-medium text-ink">Comportamiento de la sincronización</h3>
          <p className="mt-0.5 text-sm text-ink/55">
            Define qué puede tocar esta integración cuando reenvía una captación que ya existe.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <Toggle
              label="Reparto automático"
              hint="Las captaciones nuevas se asignan solas al usuario con menos carga."
              checked={config.auto_distribute}
              onChange={(v) => saveConfig({ auto_distribute: v })}
              disabled={busy}
            />
            <Toggle
              label="Autorizar sobrescritura de datos del equipo"
              hint="Apagado: el teléfono del dueño, la dirección real, las notas y la etapa nunca se pisan una vez rellenados desde el panel. Encendido: la integración PUEDE pisarlos, pero solo si lo pide explícitamente en cada envío."
              checked={config.overwrite_manual_fields}
              onChange={(v) => saveConfig({ overwrite_manual_fields: v })}
              disabled={busy}
              danger
            />
            <Toggle
              label="Adoptar captaciones existentes por URL"
              hint="Si la captación ya existía por scraping con la misma URL de origen, se actualiza esa en vez de crear un duplicado."
              checked={config.match_by_source_url}
              onChange={(v) => saveConfig({ match_by_source_url: v })}
              disabled={busy}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block crm-label-sm text-ink/50">
                Usuario que firma las captaciones
              </span>
              <select
                value={config.default_created_by}
                onChange={(e) => saveConfig({ default_created_by: e.target.value })}
                disabled={busy}
                className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.email ?? s.id}
                  </option>
                ))}
              </select>
            </label>

            {pipelines.length > 0 && (
              <label className="block">
                <span className="mb-1 block crm-label-sm text-ink/50">
                  Pipeline por defecto
                </span>
                <select
                  value={config.default_pipeline_id ?? ""}
                  onChange={(e) => saveConfig({ default_pipeline_id: e.target.value || null })}
                  disabled={busy}
                  className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
                >
                  <option value="">— Pipeline por defecto del país —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.is_default ? " (por defecto)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </Card>
      )}

      {tab === "log" && (
        <Card className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-ink">Últimas peticiones</h3>
              <p className="mt-0.5 text-sm text-ink/55">
                Pulsa una fila para ver el cuerpo exacto que envió el proveedor.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => reloadLogs(false)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gold/25 px-3 py-2 text-sm text-ink/70 disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                Actualizar
              </button>
              <button
                onClick={() => reloadLogs(true)}
                disabled={busy}
                className="rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600 disabled:opacity-50"
              >
                Solo errores
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-gold/25 px-6 py-10 text-center text-sm text-ink/50">
              Sin peticiones registradas todavía.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-1.5">
              {logs.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-gold/15 bg-white/50">
                  <button
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
                  >
                    <StatusPill status={entry.status_code} />
                    <span className="font-mono text-xs text-ink/70">
                      {entry.method} {entry.path}
                    </span>
                    <span className="text-xs text-ink/45">
                      {new Date(entry.created_at).toLocaleString("es-CL")}
                    </span>
                    <span className="text-xs text-ink/45">{entry.duration_ms ?? 0} ms</span>
                    {entry.dry_run && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        simulación
                      </span>
                    )}
                    {entry.items_total > 0 && (
                      <span className="ml-auto text-xs text-ink/55">
                        {entry.items_created} nuevas · {entry.items_updated} actualizadas ·{" "}
                        {entry.items_unchanged} sin cambios
                        {entry.items_failed > 0 && ` · ${entry.items_failed} con error`}
                        {entry.items_removed > 0 && (
                          <span className="ml-1 font-medium text-rose-600">
                            · {entry.items_removed} retirados
                          </span>
                        )}
                      </span>
                    )}
                  </button>

                  {expanded === entry.id && (
                    <div className="border-t border-gold/10 px-4 py-3">
                      {entry.error_message && (
                        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          <strong>{entry.error_code}</strong>: {entry.error_message}
                        </p>
                      )}
                      <p className="mb-1 text-xs text-ink/45">
                        request_id: <code className="font-mono">{entry.request_id}</code>
                        {entry.idempotency_key && (
                          <>
                            {" · "}Idempotency-Key:{" "}
                            <code className="font-mono">{entry.idempotency_key}</code>
                          </>
                        )}
                      </p>
                      <pre className="max-h-80 overflow-auto rounded-lg bg-ink/5 p-3 text-xs leading-relaxed text-ink/80">
                        {JSON.stringify(entry.request_body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "guia" && <ProviderGuide slug={config.slug} onCopy={copy} />}
    </div>
  );
}

function StatusPill({ status }: { status: number | null }) {
  const code = status ?? 0;
  const tone =
    code >= 500 ? "bg-rose-100 text-rose-700"
    : code >= 400 ? "bg-amber-100 text-amber-800"
    : code >= 200 ? "bg-emerald-100 text-emerald-700"
    : "bg-ink/5 text-ink/50";
  return (
    <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs font-semibold", tone)}>
      {code || "—"}
    </span>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  danger,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="flex items-start gap-3 rounded-xl border border-gold/15 bg-white/50 px-4 py-3 text-left transition hover:bg-white/80 disabled:opacity-50"
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
          checked
            ? danger
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-emerald-600 bg-emerald-600 text-white"
            : "border-ink/20 bg-white"
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink/50">{hint}</span>
      </span>
    </button>
  );
}

/** Guía copiable de arranque: lo que se le manda al proveedor el primer día. */
function ProviderGuide({ slug, onCopy }: { slug: string; onCopy: (text: string) => void }) {
  const base =
    typeof window !== "undefined" ? window.location.origin : "https://portal.bcousinoprop.com";

  const ping = `curl -s ${base}/api/v1/ping \\
  -H "Authorization: Bearer TU_CLAVE"`;

  const upsert = `curl -s -X POST ${base}/api/v1/captaciones \\
  -H "Authorization: Bearer TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ${slug}-001" \\
  -d '{
    "external_id": "MI-REF-001",
    "title": "Casa en Las Condes",
    "operation": "venta",
    "price": 450000000,
    "currency": "clp",
    "bedrooms": 4,
    "bathrooms": 3,
    "square_meters": 320,
    "property_type": "house",
    "region": "Metropolitana",
    "commune": "Las Condes",
    "address_scraped": "Av. Apoquindo 1234",
    "source_url": "https://portal-ejemplo.cl/aviso/123",
    "owner": { "name": "María Pérez", "phone": "+56912345678" },
    "contacts": [
      { "contact_type": "owner", "contact_name": "María Pérez",
        "phone": "+56912345678", "has_whatsapp": true, "rut": "12.345.678-9" }
    ],
    "photos": { "mode": "sync", "items": [
      { "url": "https://cdn-ejemplo.cl/1.jpg", "position": 0 }
    ]},
    "listings": [
      { "source_url": "https://portalinmobiliario.com/aviso/999",
        "broker_name": "Corredora X", "price": 460000000, "currency": "clp" }
    ]
  }'`;

  return (
    <Card className="p-5 md:p-6">
      <h3 className="font-medium text-ink">Guía de arranque para el proveedor</h3>
      <p className="mt-0.5 text-sm text-ink/55">
        Tres pasos. La documentación completa está en{" "}
        <a href="/api/v1/openapi" target="_blank" rel="noreferrer" className="text-gold underline">
          /api/v1/openapi
        </a>{" "}
        y en <code className="font-mono text-xs">docs/API_PUBLICA.md</code>.
      </p>

      <ol className="mt-5 flex flex-col gap-5">
        <Step
          n={1}
          title="Comprobar la clave"
          body="Si esto responde 200, las credenciales están bien y cualquier fallo posterior es del payload."
          code={ping}
          onCopy={onCopy}
        />
        <Step
          n={2}
          title="Enviar una captación completa"
          body="Un solo POST rellena las seis pestañas de la ficha. Reenviar el mismo external_id actualiza en vez de duplicar."
          code={upsert}
          onCopy={onCopy}
        />
        <Step
          n={3}
          title="Probar sin escribir"
          body="Añadiendo la cabecera X-SmartBC-Dry-Run: 1 se valida el payload y se devuelve qué habría pasado, sin tocar la base de datos."
          code={`curl -s -X POST ${base}/api/v1/captaciones \\
  -H "Authorization: Bearer TU_CLAVE" \\
  -H "Content-Type: application/json" \\
  -H "X-SmartBC-Dry-Run: 1" \\
  -d '{ "external_id": "MI-REF-001", "price": 470000000 }'`}
          onCopy={onCopy}
        />
      </ol>
    </Card>
  );
}

function Step({
  n,
  title,
  body,
  code,
  onCopy,
}: {
  n: number;
  title: string;
  body: string;
  code: string;
  onCopy: (text: string) => void;
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold-dark">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink/55">{body}</p>
        <div className="mt-2 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded-lg bg-ink/5 p-3 text-xs leading-relaxed text-ink/80">
            {code}
          </pre>
          <button
            onClick={() => onCopy(code)}
            title="Copiar"
            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/20 text-ink/50 transition hover:bg-gold/5"
          >
            <Terminal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
