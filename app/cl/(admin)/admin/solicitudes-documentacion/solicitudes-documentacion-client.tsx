"use client";

import { useState } from "react";
import { Building2, CheckCircle, Clock, FileText, Home, Plus, Search, SlidersHorizontal, Star, XCircle } from "lucide-react";
import type { ApplicationCountry, ApplicationOperation, ApplicationStatus } from "@/lib/property-applications/types";
import { ApplicationDetailModal } from "@/components/admin/property-applications/application-detail-modal";
import { CandidateScoreCard } from "@/components/admin/property-applications/candidate-score-card";
import { CreateApplicationModal } from "@/components/admin/property-applications/create-application-modal";

type ApplicationRow = {
  id: string;
  country: ApplicationCountry;
  operation: ApplicationOperation;
  status: ApplicationStatus;
  submitted_at: string | null;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  properties: {
    id: string;
    title: string;
    address: string | null;
    cover_photo_url: string | null;
    price: number | null;
    bc_reference: string | null;
  } | null;
  property_application_scores: {
    total_score: number;
    ai_recommendation: string | null;
    ai_summary: string | null;
    currency_context: string | null;
    income_amount: number | null;
    income_currency: string | null;
    income_amount_eur: number | null;
    income_ratio: number | null;
  } | null;
  property_application_documents: { id: string; status: string; document_type_id: string }[];
};

type Props = {
  initialApplications: ApplicationRow[];
  totalCount: number;
};

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; className: string }> = {
  draft: { label: "Borrador", icon: Clock, className: "bg-zinc-100 text-zinc-600" },
  pending_review: { label: "Pendiente", icon: Clock, className: "bg-blue-100 text-blue-700" },
  approved: { label: "Aprobada", icon: CheckCircle, className: "bg-green-100 text-green-700" },
  rejected: { label: "Rechazada", icon: XCircle, className: "bg-red-100 text-red-700" },
  completed: { label: "Completada", icon: CheckCircle, className: "bg-emerald-100 text-emerald-700" },
};

const OP_CONFIG: Record<ApplicationOperation, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; className: string }> = {
  rent: { label: "Alquiler", icon: Home, className: "bg-blue-100 text-blue-700" },
  sale: { label: "Compra", icon: Building2, className: "bg-violet-100 text-violet-700" },
};

const COUNTRY_FLAG: Record<ApplicationCountry, string> = {
  ES: "🇪🇸",
  CL: "🇨🇱",
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-100 text-green-700" : score >= 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700";
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
      <Star size={9} />
      {score}
    </span>
  );
}

function DocProgress({ docs }: { docs: { status: string }[] }) {
  const total = docs.length;
  const verified = docs.filter((d) => d.status === "verified").length;
  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-ink/50">{verified}/{total}</span>
    </div>
  );
}

export function SolicitudesDocumentacionClient({ initialApplications, totalCount }: Props) {
  const [applications] = useState(initialApplications);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCountry, setFilterCountry] = useState<ApplicationCountry | "all">("all");
  const [filterOperation, setFilterOperation] = useState<ApplicationOperation | "all">("all");
  const [filterStatus, setFilterStatus] = useState<ApplicationStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = applications.filter((app) => {
    const name = app.profiles?.full_name?.toLowerCase() ?? "";
    const email = app.profiles?.email?.toLowerCase() ?? "";
    const property = app.properties?.title?.toLowerCase() ?? "";
    const search = searchTerm.toLowerCase();

    if (search && !name.includes(search) && !email.includes(search) && !property.includes(search)) return false;
    if (filterCountry !== "all" && app.country !== filterCountry) return false;
    if (filterOperation !== "all" && app.operation !== filterOperation) return false;
    if (filterStatus !== "all" && app.status !== filterStatus) return false;
    return true;
  });

  const pendingCount = applications.filter((a) => a.status === "pending_review").length;

  return (
    <div className="mt-7 space-y-5">
      {/* Stats rápidas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-cream-50/60 bg-cream-50/80 p-4 backdrop-blur-sm">
          <p className="text-xs text-ink/50">Total solicitudes</p>
          <p className="mt-1 font-serif text-2xl text-ink">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
          <p className="text-xs text-blue-600">Pendientes revisión</p>
          <p className="mt-1 font-serif text-2xl text-blue-700">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-green-100 bg-green-50/80 p-4">
          <p className="text-xs text-green-600">Aprobadas</p>
          <p className="mt-1 font-serif text-2xl text-green-700">
            {applications.filter((a) => a.status === "approved").length}
          </p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/80 p-4">
          <p className="text-xs text-violet-600">Compras</p>
          <p className="mt-1 font-serif text-2xl text-violet-700">
            {applications.filter((a) => a.operation === "sale").length}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80"
        >
          <Plus size={14} />
          Nueva solicitud
        </button>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            placeholder="Buscar cliente o propiedad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-xl border border-ink/15 bg-white/80 py-2 pl-8 pr-4 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-ink/40" />
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value as ApplicationCountry | "all")}
            className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="all">Todos los países</option>
            <option value="ES">🇪🇸 España</option>
            <option value="CL">🇨🇱 Chile</option>
          </select>

          <select
            value={filterOperation}
            onChange={(e) => setFilterOperation(e.target.value as ApplicationOperation | "all")}
            className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="all">Alquiler y Compra</option>
            <option value="rent">Alquiler</option>
            <option value="sale">Compra</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ApplicationStatus | "all")}
            className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="all">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="pending_review">Pendiente</option>
            <option value="approved">Aprobada</option>
            <option value="rejected">Rechazada</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-cream-50/60 bg-cream-50/80 py-16 text-center">
          <FileText size={32} strokeWidth={1.25} className="mx-auto text-gold/40" />
          <p className="mt-3 text-sm text-ink/50">No hay solicitudes con estos filtros</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cream-50/60 bg-cream-50/80 shadow-sm backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/8 text-left">
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Cliente</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Propiedad</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Operación</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Score</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Docs</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Estado</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink/50"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app, idx) => {
                const statusCfg = STATUS_CONFIG[app.status];
                const StatusIcon = statusCfg.icon;
                const opCfg = OP_CONFIG[app.operation];
                const OpIcon = opCfg.icon;
                const score = app.property_application_scores;
                const clientName = app.profiles?.full_name ?? app.profiles?.email ?? "—";
                return (
                  <tr
                    key={app.id}
                    className={`border-b border-ink/5 transition hover:bg-cream-50/60 ${idx % 2 === 0 ? "" : "bg-ink/[0.015]"}`}
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-ink">{clientName}</p>
                        <p className="text-[11px] text-ink/45">{app.profiles?.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {app.properties ? (
                        <div>
                          <p className="text-ink/80">{app.properties.title}</p>
                          {app.properties.bc_reference && (
                            <p className="text-[11px] text-ink/40">{app.properties.bc_reference}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink/30">Sin propiedad</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${opCfg.className}`}>
                          <OpIcon size={10} />
                          {opCfg.label}
                        </span>
                        <span className="text-xs text-ink/40">{COUNTRY_FLAG[app.country]} {app.country}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {score ? (
                        <ScoreBadge score={score.total_score} />
                      ) : (
                        <span className="text-[11px] text-ink/30">Calculando...</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <DocProgress docs={app.property_application_documents} />
                    </td>
                    <td className="px-5 py-4">
                      <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.className}`}>
                        <StatusIcon size={10} />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSelectedId(app.id)}
                        className="rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
                      >
                        Revisar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedId && (
        <ApplicationDetailModal
          applicationId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => { setSelectedId(null); window.location.reload(); }}
        />
      )}

      {/* Modal de creación */}
      {showCreate && (
        <CreateApplicationModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); window.location.reload(); }}
        />
      )}
    </div>
  );
}
