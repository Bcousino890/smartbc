"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Plug,
  Plus,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ApiClientSummary } from "@/lib/db/queries/api-clients";
import { cn } from "@/lib/utils";

/**
 * Listado de integraciones. Muestra de un vistazo si un proveedor está
 * enviando datos y si está fallando: son las dos preguntas que se hacen cuando
 * "no llegan las captaciones".
 */

type StaffOption = { id: string; full_name: string | null; email: string | null };
type PipelineOption = { id: string; name: string; is_default: boolean };

export function IntegracionesClient({
  country,
  clients,
  staff,
  pipelines,
}: {
  country: string;
  clients: ApiClientSummary[];
  staff: StaffOption[];
  pipelines: PipelineOption[];
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [clients, query]);

  const totals = useMemo(
    () => ({
      active: clients.filter((c) => c.active).length,
      requests: clients.reduce((sum, c) => sum + c.requests_24h, 0),
      errors: clients.reduce((sum, c) => sum + c.errors_24h, 0),
      captaciones: clients.reduce((sum, c) => sum + c.captaciones_total, 0),
    }),
    [clients]
  );

  async function handleCreate(form: FormData) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/integraciones/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          contact_email: form.get("contact_email"),
          country,
          default_created_by: form.get("default_created_by") || undefined,
          default_pipeline_id: form.get("default_pipeline_id") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "No se pudo crear la integración", "error");
        return;
      }
      toast("Integración creada. Genera su clave para empezar.", "success");
      setCreating(false);
      window.location.href = `/${country}/admin/integraciones/${data.client.slug}`;
    } catch {
      toast("Error de red al crear la integración", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-7 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Integraciones activas" value={totals.active} />
        <StatTile label="Peticiones (24 h)" value={totals.requests} />
        <StatTile
          label="Errores (24 h)"
          value={totals.errors}
          tone={totals.errors > 0 ? "danger" : "default"}
        />
        <StatTile label="Captaciones importadas" value={totals.captaciones} />
      </div>

      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-gold/20 bg-white/60 px-3 py-2">
            <Search className="h-4 w-4 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar integración…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
            />
          </label>

          <div className="flex items-center gap-2">
            <a
              href="/api/v1/openapi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gold/25 px-3.5 py-2 text-sm font-medium text-ink/70 transition hover:bg-gold/5"
            >
              <BookOpen className="h-4 w-4" />
              Especificación
            </a>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
            >
              <Plus className="h-4 w-4" />
              Nueva integración
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasClients={clients.length > 0} onCreate={() => setCreating(true)} />
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-1.5 text-left text-sm">
              <thead>
                <tr className="crm-table-header text-ink/50">
                  <th className="px-3 pb-2">Integración</th>
                  <th className="px-3 pb-2">Estado</th>
                  <th className="px-3 pb-2">Claves</th>
                  <th className="px-3 pb-2">24 h</th>
                  <th className="px-3 pb-2">Captaciones</th>
                  <th className="px-3 pb-2">Última petición</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id} className="bg-white/50 transition hover:bg-white/80">
                    <td className="rounded-l-xl px-3 py-3">
                      <Link
                        href={`/${country}/admin/integraciones/${client.slug}`}
                        className="flex items-center gap-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                          <Plug className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{client.name}</span>
                          <span className="block truncate font-mono text-xs text-ink/45">
                            {client.slug}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      {client.active ? (
                        <Badge tone="ok">Activa</Badge>
                      ) : (
                        <Badge tone="muted">Desactivada</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-ink/70">
                        <KeyRound className="h-3.5 w-3.5 text-ink/40" />
                        {client.keys_active}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-ink/70">{client.requests_24h}</span>
                      {client.errors_24h > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-rose-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {client.errors_24h}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink/70">{client.captaciones_total}</td>
                    <td className="rounded-r-xl px-3 py-3 text-ink/55">
                      {client.last_request_at
                        ? new Date(client.last_request_at).toLocaleString("es-CL")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <CreateModal
          staff={staff}
          pipelines={pipelines}
          saving={saving}
          onClose={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <Card className="p-4">
      <p className="crm-label-sm text-ink/45">{label}</p>
      <p
        className={cn(
          "crm-number mt-1 text-2xl text-ink",
          tone === "danger" && value > 0 && "text-rose-600"
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function Badge({ tone, children }: { tone: "ok" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-ink/5 text-ink/50"
      )}
    >
      {tone === "ok" && <CheckCircle2 className="h-3 w-3" />}
      {children}
    </span>
  );
}

function EmptyState({ hasClients, onCreate }: { hasClients: boolean; onCreate: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-gold/25 px-6 py-12 text-center">
      <Plug className="mx-auto h-8 w-8 text-gold/50" />
      <p className="mt-3 font-medium text-ink">
        {hasClients ? "Ninguna integración coincide con la búsqueda" : "Todavía no hay integraciones"}
      </p>
      {!hasClients && (
        <>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink/55">
            Crea una integración para que un sistema externo pueda dar de alta y actualizar
            captaciones por sí solo, sin rellenar nada a mano.
          </p>
          <button
            onClick={onCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50"
          >
            <Plus className="h-4 w-4" />
            Crear la primera
          </button>
        </>
      )}
    </div>
  );
}

function CreateModal({
  staff,
  pipelines,
  saving,
  onClose,
  onSubmit,
}: {
  staff: StaffOption[];
  pipelines: PipelineOption[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-6">
        <h2 className="crm-section-title text-ink">Nueva integración</h2>
        <p className="mt-1 text-sm text-ink/55">
          Al guardarla podrás generar su clave de API y entregarla al proveedor.
        </p>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
        >
          <Field label="Nombre del sistema externo" hint="Ej. Captaciones Chile SpA">
            <input
              name="name"
              required
              maxLength={120}
              className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
            />
          </Field>

          <Field label="Descripción" hint="Opcional">
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
            />
          </Field>

          <Field label="Email de contacto del proveedor" hint="Opcional">
            <input
              name="contact_email"
              type="email"
              className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
            />
          </Field>

          <Field
            label="Usuario que firma las captaciones"
            hint="Toda captación necesita un responsable interno. Por defecto, tú."
          >
            <select
              name="default_created_by"
              className="w-full rounded-xl border border-gold/20 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
            >
              <option value="">— Yo mismo —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name ?? s.email ?? s.id}
                </option>
              ))}
            </select>
          </Field>

          {pipelines.length > 0 && (
            <Field label="Pipeline por defecto" hint="Dónde entran las captaciones nuevas">
              <select
                name="default_pipeline_id"
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
            </Field>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gold/25 px-4 py-2 text-sm text-ink/70 transition hover:bg-gold/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
            >
              {saving ? "Creando…" : "Crear integración"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block crm-label-sm text-ink/50">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/40">{hint}</span>}
    </label>
  );
}
