"use client";

import { CheckCircle2, ExternalLink, Mail, RotateCcw, X, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { formatRelativeMinutes } from "@/lib/relative-time";
import type { VisitRequest, VisitRequestStatus } from "@/lib/types";
import type { ContactRequestRow } from "@/lib/db/queries/clients";
import type { IdealistaLeadRow } from "@/lib/db/queries/idealista-leads";
import { cn } from "@/lib/utils";
import {
  updateVisitStatus,
  markContactRead,
  updateIdealistaLeadStatus,
  setIdealistaLeadType,
} from "./actions";

// ─── Status config ────────────────────────────────────────────────

type TabKey = "pending" | "confirmed" | "completed" | "rejected" | "consultas" | "idealista";

const TAB_ORDER: TabKey[] = ["pending", "confirmed", "completed", "rejected", "consultas", "idealista"];

const STATUS_BADGE: Record<VisitRequestStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rescheduled: "border-blue-200 bg-blue-50 text-blue-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  completed: "border-violet-200 bg-violet-50 text-violet-700",
};

const TAB_STATUS_MAP: Record<Exclude<TabKey, "consultas" | "idealista">, VisitRequestStatus> = {
  pending: "pending",
  confirmed: "confirmed",
  completed: "completed",
  rejected: "rejected",
};

const TAB_BADGE_CLASS: Record<TabKey, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-violet-100 text-violet-700",
  rejected: "bg-rose-100 text-rose-700",
  consultas: "bg-blue-100 text-blue-700",
  idealista: "bg-teal-100 text-teal-700",
};

type LeadStatusFilter = "todos" | "nuevo" | "fichado" | "descartado";
type LeadTypeFilter = "todos" | "particular" | "agencia" | "relocation";

const LEAD_TYPE_LABEL: Record<"particular" | "agencia" | "relocation", string> = {
  particular: "Particular",
  agencia: "Agencia",
  relocation: "Relocation",
};

// ─── Main component ──────────────────────────────────────────────────

export function SolicitudesAdminClient({
  requests,
  contactRequests,
  idealistaLeads = [],
}: {
  requests: VisitRequest[];
  contactRequests: ContactRequestRow[];
  idealistaLeads?: IdealistaLeadRow[];
}) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [leadStatusFilter, setLeadStatusFilter] = useState<LeadStatusFilter>("todos");
  const [leadTypeFilter, setLeadTypeFilter] = useState<LeadTypeFilter>("todos");
  const [selectedLead, setSelectedLead] = useState<IdealistaLeadRow | null>(null);

  const counts: Record<TabKey, number> = {
    pending: requests.filter((r) => r.status === "pending").length,
    confirmed: requests.filter((r) => r.status === "confirmed").length,
    completed: requests.filter((r) => r.status === "completed").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
    consultas: contactRequests.filter((r) => r.status === "pending").length,
    idealista: idealistaLeads.filter((l) => l.status === "nuevo").length,
  };

  const filteredLeads = idealistaLeads.filter((l) => {
    if (leadStatusFilter !== "todos" && l.status !== leadStatusFilter) return false;
    if (leadTypeFilter !== "todos" && (l.lead_type ?? l.suggested_type) !== leadTypeFilter) return false;
    return true;
  });

  const filteredRequests = requests.filter(
    (r) =>
      activeTab !== "consultas" &&
      activeTab !== "idealista" &&
      r.status === TAB_STATUS_MAP[activeTab as Exclude<TabKey, "consultas" | "idealista">],
  );

  const TAB_LABELS: Record<TabKey, string> = {
    pending: t("solicitudes.tab.pending"),
    confirmed: t("solicitudes.tab.confirmed"),
    completed: t("solicitudes.tab.completed"),
    rejected: t("solicitudes.tab.rejected"),
    consultas: "Consultas web",
    idealista: "Idealista",
  };

  return (
    <section className="mt-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-gold/15 pb-0">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "relative flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-[13px] font-medium transition",
              activeTab === tab
                ? "border-gold/20 bg-cream-50/90 text-ink shadow-[0_-4px_12px_-6px_rgba(40,28,10,0.10)]"
                : "border-transparent text-ink/50 hover:text-ink/75",
            )}
          >
            {TAB_LABELS[tab]}
            {counts[tab] > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  activeTab === tab
                    ? TAB_BADGE_CLASS[tab]
                    : "bg-ink/8 text-ink/50",
                )}
              >
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="mt-4">
        {activeTab === "idealista" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(["todos", "nuevo", "fichado", "descartado"] as LeadStatusFilter[]).map((f) => (
                  <FilterChip
                    key={f}
                    active={leadStatusFilter === f}
                    onClick={() => setLeadStatusFilter(f)}
                    label={f === "todos" ? "Todos" : f === "nuevo" ? "Nuevos" : f === "fichado" ? "Fichados" : "Descartados"}
                  />
                ))}
              </div>
              <span className="hidden text-ink/20 sm:inline">|</span>
              <div className="flex flex-wrap gap-1.5">
                {(["todos", "particular", "agencia", "relocation"] as LeadTypeFilter[]).map((f) => (
                  <FilterChip
                    key={f}
                    active={leadTypeFilter === f}
                    onClick={() => setLeadTypeFilter(f)}
                    label={f === "todos" ? "Todos los tipos" : LEAD_TYPE_LABEL[f]}
                  />
                ))}
              </div>
            </div>
            {filteredLeads.length === 0 ? (
              <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
                {idealistaLeads.length === 0
                  ? "Sin leads de Idealista — usa la extensión de Chrome en el inbox de idealista.com para capturarlos"
                  : "Ningún lead con estos filtros"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredLeads.map((lead) => (
                  <IdealistaLeadCard key={lead.id} lead={lead} onOpen={() => setSelectedLead(lead)} />
                ))}
              </div>
            )}
            {selectedLead && (
              <IdealistaLeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
            )}
          </>
        ) : activeTab === "consultas" ? (
          contactRequests.length === 0 ? (
            <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
              Sin consultas recibidas
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contactRequests.map((r) => (
                <ContactCard key={r.id} contact={r} />
              ))}
            </div>
          )
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
            {t("solicitudes.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRequests.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── ContactCard ────────────────────────────────────────────────

function ContactCard({ contact }: { contact: ContactRequestRow }) {
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(contact.status);

  function handleRead() {
    if (optimisticStatus !== "pending") return;
    startTransition(async () => {
      setOptimisticStatus("read");
      await markContactRead(contact.id);
    });
  }

  const isNew = optimisticStatus === "pending";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-cream-50/85 p-4 shadow-[0_8px_25px_-10px_rgba(40,28,10,0.12)] transition-opacity",
        isNew ? "border-blue-200" : "border-gold/15",
        isTransitioning && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800">
            {contact.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink text-sm leading-tight">{contact.name}</p>
            <p className="truncate text-[11px] text-ink/50 leading-tight mt-0.5">{contact.email}</p>
          </div>
        </div>
        <span className={cn(
          "shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
          isNew ? "border-blue-200 bg-blue-50 text-blue-700" : "border-stone-200 bg-stone-50 text-stone-500",
        )}>
          {isNew ? "Nuevo" : "Leído"}
        </span>
      </div>

      {contact.subject && (
        <div className="mt-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
          <p className="text-[12px] font-medium text-ink/75 truncate">📋 {contact.subject}</p>
          {contact.country_interest && (
            <p className="text-[11px] text-ink/40 mt-0.5">🌍 {contact.country_interest}</p>
          )}
        </div>
      )}

      <p className="mt-3 text-[12px] text-ink/70 line-clamp-3 leading-relaxed">{contact.message}</p>

      {contact.phone && (
        <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="mt-2 block text-[11px] text-ink/50 hover:text-amber-800 transition-colors">
          📞 {contact.phone}
        </a>
      )}

      <div className="mt-2.5 text-[11px] text-ink/40">
        {new Date(contact.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>

      {isNew && (
        <div className="mt-3 flex gap-2">
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-gold hover:text-navy"
          >
            <Mail size={13} strokeWidth={2} />
            Responder
          </a>
          <button
            type="button"
            onClick={handleRead}
            disabled={isTransitioning}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
          >
            <CheckCircle2 size={13} strokeWidth={2} />
            Marcar leído
          </button>
        </div>
      )}
    </div>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
        active
          ? "border-teal-300 bg-teal-50 text-teal-800"
          : "border-gold/15 bg-cream-50/60 text-ink/50 hover:text-ink/75",
      )}
    >
      {label}
    </button>
  );
}

// ─── IdealistaLeadCard ─────────────────────────────────────────────────

const LEAD_STATUS_BADGE: Record<IdealistaLeadRow["status"], string> = {
  nuevo: "border-blue-200 bg-blue-50 text-blue-700",
  fichado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  descartado: "border-rose-200 bg-rose-50 text-rose-700",
};

const LEAD_STATUS_LABEL: Record<IdealistaLeadRow["status"], string> = {
  nuevo: "Nuevo",
  fichado: "Fichado",
  descartado: "Descartado",
};

function IdealistaLeadCard({ lead, onOpen }: { lead: IdealistaLeadRow; onOpen: () => void }) {
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(lead.status);
  const [optimisticType, setOptimisticType] = useOptimistic(lead.lead_type);
  const [expanded, setExpanded] = useState(false);

  function handleStatus(status: IdealistaLeadRow["status"]) {
    startTransition(async () => {
      setOptimisticStatus(status);
      await updateIdealistaLeadStatus(lead.id, status);
    });
  }

  function handleType(type: "particular" | "agencia" | "relocation") {
    startTransition(async () => {
      setOptimisticType(type);
      await setIdealistaLeadType(lead.id, type);
    });
  }

  const bullets = lead.profile?.bullets ?? [];
  const presentacion = lead.profile?.presentacion ?? null;
  const isNuevo = optimisticStatus === "nuevo";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-cream-50/85 p-4 shadow-[0_8px_25px_-10px_rgba(40,28,10,0.12)] transition-opacity",
        isNuevo ? "border-teal-200" : "border-gold/15",
        isTransitioning && "opacity-60",
      )}
    >
      {/* Área clicable: abre el detalle completo. Las acciones quedan fuera. */}
      <div onClick={onOpen} className="cursor-pointer" role="button" tabIndex={0}>
        {/* Header: avatar + nombre + teléfono + estado */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {lead.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lead.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-800">
                {(lead.name || "??").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium text-ink text-sm leading-tight">{lead.name || "Sin nombre"}</p>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone.replace(/\s/g, "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block truncate text-[11px] text-ink/50 leading-tight mt-0.5 hover:text-amber-800 transition-colors"
                >
                  📞 {lead.phone}
                  {lead.is_international && lead.phone_country ? ` · ${lead.phone_country} Internacional` : ""}
                </a>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
              LEAD_STATUS_BADGE[optimisticStatus],
            )}
          >
            {LEAD_STATUS_LABEL[optimisticStatus]}
          </span>
        </div>

        {/* Tipo: confirmado o sugerido */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {optimisticType ? (
            <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800">
              {LEAD_TYPE_LABEL[optimisticType]}
            </span>
          ) : lead.suggested_type ? (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"
              title={lead.suggestion_keywords.length > 0 ? `Detectado por: ${lead.suggestion_keywords.join(", ")}` : undefined}
            >
              Sugerido: {LEAD_TYPE_LABEL[lead.suggested_type]}
            </span>
          ) : null}
          {lead.detail_captured && (
            <span className="rounded-full border border-ink/10 bg-ink/[0.04] px-2.5 py-0.5 text-[11px] text-ink/45" title="Perfil y mensaje completo capturados">
              ● Detalle
            </span>
          )}
        </div>

        {/* Propiedad consultada */}
        {(lead.property_title || lead.property_ref || lead.idealista_code) && (
          <div className="mt-3 flex gap-2.5 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
            {lead.property_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lead.property_image_url}
                alt=""
                className="h-11 w-14 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink/75 truncate">
                📍 {[lead.property_title, lead.property_price, lead.property_type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
              </p>
              {(lead.property_ref || lead.idealista_code) && (
                <p className="text-[11px] text-ink/40 mt-0.5">
                  {[lead.property_ref && `Ref. ${lead.property_ref}`, lead.idealista_code && `Cod. ${lead.idealista_code}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {lead.properties.length > 1 && (
                <p className="text-[11px] font-semibold text-teal-700 mt-0.5">
                  Consultó por {lead.properties.length} propiedades
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mensaje */}
        {lead.message && (
          <>
            <p className={cn("mt-3 text-[12px] text-ink/70 leading-relaxed whitespace-pre-line", !expanded && "line-clamp-3")}>
              {lead.message}
            </p>
            {lead.message.length > 180 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="mt-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 transition-colors"
              >
                {expanded ? "Ver menos" : "Ver más"}
              </button>
            )}
          </>
        )}

        {/* Perfil de búsqueda */}
        {(bullets.length > 0 || presentacion) && (
          <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2">
            <p className="text-[11px] font-semibold text-teal-800">Perfil para búsqueda de vivienda</p>
            {bullets.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {bullets.slice(0, 5).map((b) => (
                  <li key={b} className="text-[11px] text-ink/60">
                    • {b}
                  </li>
                ))}
              </ul>
            )}
            {presentacion && <p className="mt-1.5 text-[11px] italic text-ink/55 line-clamp-4">“{presentacion}”</p>}
          </div>
        )}

        {/* Fechas */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink/40">
          {lead.message_date && (
            <>
              <span>🗓 {lead.message_date}</span>
              <span className="text-ink/25">·</span>
            </>
          )}
          <span>
            Capturado{" "}
            {new Date(lead.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {/* Acciones */}
      {isNuevo ? (
        <>
          <div className="mt-3 flex gap-1.5">
            {(["particular", "agencia", "relocation"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleType(type)}
                disabled={isTransitioning}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-60",
                  (optimisticType ?? lead.suggested_type) === type
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : "border-gold/15 bg-cream-50/60 text-ink/45 hover:text-ink/75",
                )}
              >
                {LEAD_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleStatus("fichado")}
              disabled={isTransitioning}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 size={13} strokeWidth={2} />
              Fichar
            </button>
            <button
              type="button"
              onClick={() => handleStatus("descartado")}
              disabled={isTransitioning}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <XCircle size={13} strokeWidth={2} />
              Descartar
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => handleStatus("nuevo")}
            disabled={isTransitioning}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
          >
            <RotateCcw size={13} strokeWidth={2} />
            Reabrir
          </button>
        </div>
      )}
    </div>
  );
}

// ─── IdealistaLeadModal ─────────────────────────────────────────────

function IdealistaLeadModal({ lead, onClose }: { lead: IdealistaLeadRow; onClose: () => void }) {
  const bullets = lead.profile?.bullets ?? [];
  const presentacion = lead.profile?.presentacion ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gold/15 bg-cream-50 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {lead.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lead.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-ink text-base">{lead.name || "Sin nombre"}</p>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone.replace(/\s/g, "")}`}
                  className="mt-0.5 block text-[13px] text-ink/60 hover:text-amber-800 transition-colors"
                >
                  📞 {lead.phone}
                  {lead.is_international && lead.phone_country ? ` · ${lead.phone_country} Internacional` : ""}
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink/70"
          >
            <X size={18} />
          </button>
        </div>

        {lead.properties.length > 1 ? (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
              Consultó por {lead.properties.length} propiedades
            </p>
            <div className="mt-1.5 space-y-1.5">
              {lead.properties.map((p, i) => (
                <div key={p.title ?? p.imageUrl ?? i} className="flex gap-2.5 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-11 w-14 shrink-0 rounded-md object-cover" />
                  )}
                  <p className="min-w-0 text-[13px] font-medium text-ink/80 self-center">
                    📍 {[p.title, p.price, p.type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          (lead.property_title || lead.property_ref || lead.idealista_code) && (
            <div className="mt-4 flex gap-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2.5">
              {lead.property_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.property_image_url} alt="" className="h-14 w-18 shrink-0 rounded-md object-cover" />
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink/80">
                  📍 {[lead.property_title, lead.property_price, lead.property_type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
                </p>
                {(lead.property_ref || lead.idealista_code) && (
                  <p className="text-[11px] text-ink/40 mt-0.5">
                    {[lead.property_ref && `Ref. ${lead.property_ref}`, lead.idealista_code && `Cod. ${lead.idealista_code}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {lead.message && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">Mensaje</p>
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink/75">{lead.message}</p>
          </div>
        )}

        {(bullets.length > 0 || presentacion) && (
          <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-teal-800">Perfil para búsqueda de vivienda</p>
            {bullets.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {bullets.map((b) => (
                  <li key={b} className="text-[12px] text-ink/65">
                    • {b}
                  </li>
                ))}
              </ul>
            )}
            {presentacion && <p className="mt-2 text-[12px] italic text-ink/60">“{presentacion}”</p>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink/40">
          {lead.message_date && (
            <>
              <span>🗓 {lead.message_date}</span>
              <span className="text-ink/25">·</span>
            </>
          )}
          <span>
            Capturado{" "}
            {new Date(lead.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <a
          href={`https://www.idealista.com/inbox/CONVERSATION_${lead.conversation_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-gold hover:text-navy"
        >
          <ExternalLink size={14} strokeWidth={2} />
          Abrir en Idealista
        </a>
      </div>
    </div>
  );
}

// ─── RequestCard ───────────────────────────────────────────────

function RequestCard({ request }: { request: VisitRequest }) {
  const t = useT();
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    request.status,
  );

  const isPendingStatus = optimisticStatus === "pending";

  function handleConfirm() {
    startTransition(async () => {
      setOptimisticStatus("confirmed");
      await updateVisitStatus(request.id, "confirmed");
    });
  }

  function handleCancel() {
    startTransition(async () => {
      setOptimisticStatus("rejected");
      await updateVisitStatus(request.id, "cancelled");
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-gold/15 bg-cream-50/85 p-4 shadow-[0_8px_25px_-10px_rgba(40,28,10,0.12)] transition-opacity",
        isTransitioning && "opacity-60",
      )}
    >
      {/* Header: avatar + nombre + email + badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-bold text-amber-800">
            {request.clientInitials}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink text-sm leading-tight">
              {request.clientName}
            </p>
            {request.clientEmail && (
              <p className="truncate text-[11px] text-ink/50 leading-tight mt-0.5">
                {request.clientEmail}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={optimisticStatus} />
      </div>

      {/* Propiedad */}
      <div className="mt-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
        {request.propertySlug ? (
          <a
            href={`${config.prefix}/propiedades/${request.propertySlug}`}
            className="block group"
          >
            <p className="text-[12px] font-medium text-ink/75 group-hover:text-amber-800 transition-colors truncate">
              📍 {request.propertyTitle}
            </p>
            {request.propertyReference && (
              <p className="text-[11px] text-ink/40 mt-0.5">
                {request.propertyReference}
              </p>
            )}
          </a>
        ) : (
          <>
            <p className="text-[12px] text-ink/70 truncate">
              📍 {request.propertyTitle}
            </p>
            {request.propertyReference && (
              <p className="text-[11px] text-ink/40 mt-0.5">
                {request.propertyReference}
              </p>
            )}
          </>
        )}
      </div>

      {/* Fechas */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink/50">
        <span>🗓 {request.requestedDateLabel}</span>
        <span className="text-ink/30">·</span>
        <span>
          {t("solicitudes.received")}{" "}
          {formatRelativeMinutes(request.receivedRelativeMinutes, t)}
        </span>
      </div>

      {/* Acciones para pendientes */}
      {isPendingStatus && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isTransitioning}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <CheckCircle2 size={13} strokeWidth={2} />
            {t("solicitudes.action.confirm")}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isTransitioning}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
          >
            <XCircle size={13} strokeWidth={2} />
            {t("solicitudes.action.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: VisitRequestStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        "shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
        STATUS_BADGE[status],
      )}
    >
      {t(`solicitudes.status.${status}`)}
    </span>
  );
}
