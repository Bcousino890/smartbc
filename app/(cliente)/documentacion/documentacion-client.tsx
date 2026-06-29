"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle, Clock, FileText, Home, Plus, ShoppingBag, XCircle } from "lucide-react";
import type {
  ApplicationOperation,
  PropertyApplicationDocumentType,
  PropertyApplicationDocumentWithType,
  ApplicationStatus,
} from "@/lib/property-applications/types";
import { PropertyApplicationChecklist } from "@/components/property-applications/property-application-checklist";
import { PropertyApplicationTimeline } from "@/components/property-applications/property-application-timeline";
import { CoApplicantInvite } from "@/components/property-applications/co-applicant-invite";

type ApplicationWithProgress = {
  id: string;
  country: "ES" | "CL";
  operation: ApplicationOperation;
  status: ApplicationStatus;
  submitted_at: string | null;
  created_at: string;
  progress: {
    total: number;
    required: number;
    uploaded: number;
    required_uploaded: number;
    verified: number;
    pct: number;
  };
  documents: PropertyApplicationDocumentWithType[];
  property?: {
    title: string;
    address: string | null;
    cover_photo_url: string | null;
  } | null;
};

type Props = {
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    country: "ES" | "CL";
  };
  applications: ApplicationWithProgress[];
  rentDocTypes: PropertyApplicationDocumentType[];
  saleDocTypes: PropertyApplicationDocumentType[];
};

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; className: string }> = {
  draft: { label: "Borrador", icon: Clock, className: "bg-zinc-100 text-zinc-600" },
  pending_review: { label: "En revisión", icon: Clock, className: "bg-blue-100 text-blue-700" },
  approved: { label: "Aprobada", icon: CheckCircle, className: "bg-green-100 text-green-700" },
  rejected: { label: "Rechazada", icon: XCircle, className: "bg-red-100 text-red-700" },
  completed: { label: "Completada", icon: CheckCircle, className: "bg-emerald-100 text-emerald-700" },
};

const COUNTRY_LABEL: Record<"ES" | "CL", string> = {
  ES: "España",
  CL: "Chile",
};

export function DocumentacionClient({ profile, applications, rentDocTypes, saleDocTypes }: Props) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(
    applications.length > 0 ? applications[0].id : null
  );
  const [creatingOp, setCreatingOp] = useState<ApplicationOperation | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedApp = applications.find((a) => a.id === selectedAppId);
  const docTypes = selectedApp?.operation === "sale" ? saleDocTypes : rentDocTypes;

  async function handleCreateApplication(operation: ApplicationOperation) {
    setError(null);
    setCreatingOp(operation);
    try {
      const res = await fetch("/api/property-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: profile.country,
          operation,
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Error al crear la solicitud");
        return;
      }
      // Recargar la página para ver la nueva solicitud
      window.location.reload();
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setCreatingOp(null);
    }
  }

  async function handleSubmit() {
    if (!selectedApp) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/property-applications/${selectedApp.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit" }),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Error al enviar la solicitud");
          return;
        }
        window.location.reload();
      } catch {
        setError("Error de conexión. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-ink">
          Documentación para {COUNTRY_LABEL[profile.country]}
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Sube los documentos requeridos para tu solicitud de alquiler o compra.
          Nuestro equipo revisará y verificará cada documento.
        </p>
        {profile.country === "CL" && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong>Importante para Chile:</strong> Todos los valores de ingresos deben estar en pesos chilenos (CLP).
              No uses USD ni otros currencies.
            </span>
          </div>
        )}
      </div>

      {/* Si no hay solicitudes: botones para crear */}
      {applications.length === 0 && (
        <div className="rounded-2xl border border-gold/25 bg-cream-50/85 p-8 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.30)] backdrop-blur-sm">
          <FileText size={36} strokeWidth={1.25} className="mx-auto text-gold/60" />
          <p className="mt-4 font-serif text-lg text-ink">¿Qué tipo de operación buscas?</p>
          <p className="mt-1 text-sm text-ink/55">
            Selecciona el tipo de solicitud para ver los documentos requeridos
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => handleCreateApplication("rent")}
              disabled={creatingOp !== null}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
            >
              <Home size={16} strokeWidth={1.75} />
              {creatingOp === "rent" ? "Creando..." : "Solicitud de Alquiler"}
            </button>
            <button
              onClick={() => handleCreateApplication("sale")}
              disabled={creatingOp !== null}
              className="flex items-center justify-center gap-2 rounded-xl border border-ink/20 bg-white/80 px-6 py-3 text-sm font-medium text-ink transition hover:bg-white disabled:opacity-50"
            >
              <ShoppingBag size={16} strokeWidth={1.75} />
              {creatingOp === "sale" ? "Creando..." : "Solicitud de Compra"}
            </button>
          </div>
          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* Layout con solicitudes */}
      {applications.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Panel lateral: lista de solicitudes */}
          <aside className="space-y-2">
            {applications.map((app) => {
              const cfg = STATUS_CONFIG[app.status];
              const StatusIcon = cfg.icon;
              const isSelected = app.id === selectedAppId;
              return (
                <button
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? "border-gold/50 bg-cream-50/90 shadow-sm"
                      : "border-cream-50/40 bg-cream-50/50 hover:bg-cream-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {app.operation === "rent" ? "Alquiler" : "Compra"} · {COUNTRY_LABEL[app.country]}
                      </p>
                      {app.property && (
                        <p className="mt-0.5 truncate text-xs text-ink/50">
                          {app.property.title}
                        </p>
                      )}
                    </div>
                    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.className}`}>
                      <StatusIcon size={10} />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-ink/50">
                      <span>{app.progress.uploaded}/{app.progress.total} documentos</span>
                      <span>{app.progress.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-gold transition-all"
                        style={{ width: `${app.progress.pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Botón agregar nueva */}
            <div className="pt-2">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                Nueva solicitud
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCreateApplication("rent")}
                  disabled={creatingOp !== null}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/20 py-2 text-xs text-ink/50 transition hover:border-ink/40 hover:text-ink/70 disabled:opacity-50"
                >
                  <Plus size={12} />
                  Alquiler
                </button>
                <button
                  onClick={() => handleCreateApplication("sale")}
                  disabled={creatingOp !== null}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/20 py-2 text-xs text-ink/50 transition hover:border-ink/40 hover:text-ink/70 disabled:opacity-50"
                >
                  <Plus size={12} />
                  Compra
                </button>
              </div>
            </div>
          </aside>

          {/* Panel principal: checklist + timeline */}
          {selectedApp && (
            <main className="space-y-6">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <PropertyApplicationTimeline status={selectedApp.status} />

              <PropertyApplicationChecklist
                applicationId={selectedApp.id}
                operation={selectedApp.operation}
                country={selectedApp.country}
                status={selectedApp.status}
                documents={selectedApp.documents}
                docTypes={docTypes}
                progress={selectedApp.progress}
              />

              <CoApplicantInvite applicationId={selectedApp.id} />

              {/* Botón enviar */}
              {(selectedApp.status === "draft" || selectedApp.status === "rejected") &&
                selectedApp.progress.required_uploaded >= selectedApp.progress.required && (
                  <div className="rounded-xl border border-gold/30 bg-gold/5 p-5">
                    <p className="text-sm font-medium text-ink">
                      ¿Listo para enviar?
                    </p>
                    <p className="mt-1 text-xs text-ink/55">
                      Todos los documentos requeridos están cargados. Nuestro equipo revisará
                      tu solicitud en 24-48 horas.
                    </p>
                    <button
                      onClick={handleSubmit}
                      disabled={isPending}
                      className="mt-4 rounded-xl bg-ink px-6 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                    >
                      {isPending ? "Enviando..." : "Enviar para revisión"}
                    </button>
                  </div>
                )}
            </main>
          )}
        </div>
      )}
    </div>
  );
}
