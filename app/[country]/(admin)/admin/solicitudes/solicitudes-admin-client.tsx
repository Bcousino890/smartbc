"use client";

import { Check, CheckCircle2, Copy, ExternalLink, Languages, Link2, Loader2, Mail, RotateCcw, Search, X, XCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { detectLanguage } from "@/lib/lang-detect";
import { PORTAL_URL } from "@/lib/portal-url";
import { formatRelativeMinutes } from "@/lib/relative-time";
import { shareSlug } from "@/lib/share-slug";
import type { VisitRequest, VisitRequestStatus } from "@/lib/types";
import type { ContactRequestRow } from "@/lib/db/queries/clients";
import type { IdealistaLeadRow } from "@/lib/db/queries/idealista-leads";
import { cn } from "@/lib/utils";
import {
  updateVisitStatus,
  markContactRead,
  updateIdealistaLeadStatus,
  setIdealistaLeadType,
  assignIdealistaLead,
  setIdealistaLeadMatchedProperty,
  updateIdealistaLeadContactStatus,
  translateLeadMessage,
} from "./actions";
import { WhatsAppLeadButton } from "./whatsapp-lead-button";
import {
  PrepareVisitsButton,
  PrepareVisitsLink,
} from "@/components/admin/viewing-collections/prepare-visits-button";

type PropertySearchResult = {
  id: string;
  slug: string | null;
  title: string | null;
  address: string | null;
  bc_reference: string | null;
  cover_photo_url: string | null;
  price: number | null;
  operation: string | null;
};

type StaffOption = { id: string; name: string };

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
type LeadOperationFilter = "todos" | "venta" | "alquiler";

const LEAD_TYPE_LABEL: Record<"particular" | "agencia" | "relocation", string> = {
  particular: "Particular",
  agencia: "Agencia",
  relocation: "Relocation",
};

const CONTACT_STATUS_LABEL: Record<IdealistaLeadRow["contact_status"], string> = {
  ninguno: "Sin contactar",
  contactado_whatsapp: "Contactado por WhatsApp",
  contactado_llamada: "Contactado por llamada",
  contactado_email: "Contactado por email",
  sin_respuesta: "Sin respuesta",
};

const CONTACT_STATUS_BADGE: Record<IdealistaLeadRow["contact_status"], string> = {
  ninguno: "border-ink/10 bg-ink/[0.03] text-ink/45",
  contactado_whatsapp: "border-emerald-200 bg-emerald-50 text-emerald-700",
  contactado_llamada: "border-blue-200 bg-blue-50 text-blue-700",
  contactado_email: "border-violet-200 bg-violet-50 text-violet-700",
  sin_respuesta: "border-amber-200 bg-amber-50 text-amber-700",
};

// ─── Search helpers ───────────────────────────────────────────────
//
// Búsqueda libre (nombre/cliente/precio/referencia) sobre las tarjetas de
// cada pestaña. Compara sin distinguir mayúsculas, acentos ni el separador
// de miles ("4.500" debe encontrarse buscando "4500") y exige que todas las
// palabras tecleadas aparezcan en algún campo (AND), para poder combinar por
// ejemplo nombre + precio en una sola búsqueda.

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\x00-\x7F]/g, "") // quita acentos (tras NFD quedan fuera del rango ASCII)
    .replace(/[.,]/g, "")
    .trim();
}

function matchesSearch(terms: string[], fields: (string | null | undefined)[]): boolean {
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(fields.filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}

// ─── Precio / operación ─────────────────────────────────────────
//
// property_price es texto libre tal cual lo muestra Idealista (ej.
// "2.400 €/mes" en alquiler, "450.000 €" en venta): parseLeadPrice extrae el
// monto para el filtro de rango, inferLeadOperation deduce venta/alquiler por
// la presencia de "/mes".

function parseLeadPrice(priceText: string | null): number | null {
  if (!priceText) return null;
  const digits = priceText.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function inferLeadOperation(priceText: string | null): "alquiler" | "venta" | null {
  if (!priceText) return null;
  return /\/\s*mes\b/i.test(priceText) ? "alquiler" : "venta";
}

// ─── Main component ──────────────────────────────────────────────────

export function SolicitudesAdminClient({
  requests,
  contactRequests,
  idealistaLeads = [],
  staffOptions = [],
}: {
  requests: VisitRequest[];
  contactRequests: ContactRequestRow[];
  idealistaLeads?: IdealistaLeadRow[];
  staffOptions?: StaffOption[];
}) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [leadStatusFilter, setLeadStatusFilter] = useState<LeadStatusFilter>("todos");
  const [leadTypeFilter, setLeadTypeFilter] = useState<LeadTypeFilter>("todos");
  const [leadOperationFilter, setLeadOperationFilter] = useState<LeadOperationFilter>("todos");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Id en lugar del objeto completo: así, tras un router.refresh() (ej. al
  // vincular manualmente una ficha del sistema desde el modal), el modal
  // vuelve a leer el lead actualizado del array recién llegado por props en
  // vez de quedarse con la instancia vieja capturada al abrirlo.
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = selectedLeadId
    ? idealistaLeads.find((l) => l.id === selectedLeadId) ?? null
    : null;

  const counts: Record<TabKey, number> = {
    pending: requests.filter((r) => r.status === "pending").length,
    confirmed: requests.filter((r) => r.status === "confirmed").length,
    completed: requests.filter((r) => r.status === "completed").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
    consultas: contactRequests.filter((r) => r.status === "pending").length,
    idealista: idealistaLeads.filter((l) => l.status === "nuevo").length,
  };

  const searchTerms = normalizeSearchText(searchQuery).split(/\s+/).filter(Boolean);

  const filteredLeads = idealistaLeads.filter((l) => {
    if (leadStatusFilter !== "todos" && l.status !== leadStatusFilter) return false;
    if (leadTypeFilter !== "todos" && (l.lead_type ?? l.suggested_type) !== leadTypeFilter) return false;
    if (leadOperationFilter !== "todos" && inferLeadOperation(l.property_price) !== leadOperationFilter) return false;
    const price = parseLeadPrice(l.property_price);
    if (priceMin && (price === null || price < Number(priceMin))) return false;
    if (priceMax && (price === null || price > Number(priceMax))) return false;
    return matchesSearch(searchTerms, [
      l.name,
      l.phone,
      l.property_title,
      l.property_price,
      l.property_ref,
      l.idealista_code,
      l.matched_property_title,
      l.matched_property_reference,
      ...l.properties.flatMap((p) => [p.title, p.price]),
    ]);
  });

  const filteredContactRequests = contactRequests.filter((c) =>
    matchesSearch(searchTerms, [c.name, c.email, c.phone, c.subject, c.message]),
  );

  const filteredRequests = requests.filter(
    (r) =>
      activeTab !== "consultas" &&
      activeTab !== "idealista" &&
      r.status === TAB_STATUS_MAP[activeTab as Exclude<TabKey, "consultas" | "idealista">] &&
      matchesSearch(searchTerms, [r.clientName, r.clientEmail, r.propertyTitle, r.propertyReference]),
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
              "relative flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-medium transition",
              activeTab === tab
                ? "border-gold/20 bg-cream-50/90 text-ink shadow-[0_-4px_12px_-6px_rgba(40,28,10,0.10)]"
                : "border-transparent text-ink/50 hover:text-ink/75",
            )}
          >
            {TAB_LABELS[tab]}
            {counts[tab] > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-bold leading-none",
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

      {/* Búsqueda */}
      <label className="mt-4 flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
        <Search size={15} strokeWidth={1.75} className="shrink-0 text-ink/45" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre, cliente, precio o referencia…"
          className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Limpiar búsqueda"
            className="shrink-0 rounded-md p-0.5 text-ink/35 transition hover:bg-ink/10 hover:text-ink/60"
          >
            <X size={14} />
          </button>
        )}
      </label>

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
              <span className="hidden text-ink/20 sm:inline">|</span>
              <div className="flex flex-wrap gap-1.5">
                {(["todos", "venta", "alquiler"] as LeadOperationFilter[]).map((f) => (
                  <FilterChip
                    key={f}
                    active={leadOperationFilter === f}
                    onClick={() => setLeadOperationFilter(f)}
                    label={f === "todos" ? "Venta y alquiler" : f === "venta" ? "Venta" : "Alquiler"}
                  />
                ))}
              </div>
              <span className="hidden text-ink/20 sm:inline">|</span>
              <PriceRange min={priceMin} max={priceMax} onMin={setPriceMin} onMax={setPriceMax} />
            </div>
            {filteredLeads.length === 0 ? (
              <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
                {idealistaLeads.length === 0
                  ? "Sin leads de Idealista — usa la extensión de Chrome en el inbox de idealista.com para capturarlos"
                  : searchQuery.trim()
                    ? "Ningún lead coincide con tu búsqueda"
                    : "Ningún lead con estos filtros"}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredLeads.map((lead) => (
                  <IdealistaLeadCard
                    key={lead.id}
                    lead={lead}
                    staffOptions={staffOptions}
                    onOpen={() => setSelectedLeadId(lead.id)}
                  />
                ))}
              </div>
            )}
            {selectedLead && (
              <IdealistaLeadModal
                lead={selectedLead}
                staffOptions={staffOptions}
                onClose={() => setSelectedLeadId(null)}
              />
            )}
          </>
        ) : activeTab === "consultas" ? (
          filteredContactRequests.length === 0 ? (
            <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
              {contactRequests.length === 0
                ? "Sin consultas recibidas"
                : "Ninguna consulta coincide con tu búsqueda"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredContactRequests.map((r) => (
                <ContactCard key={r.id} contact={r} />
              ))}
            </div>
          )
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-gold/15 bg-cream-50/60 py-14 text-center text-sm text-ink/45">
            {searchQuery.trim() ? "Ninguna solicitud coincide con tu búsqueda" : t("solicitudes.empty")}
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
            <p className="truncate text-xs text-ink/50 leading-tight mt-0.5">{contact.email}</p>
          </div>
        </div>
        <span className={cn(
          "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold",
          isNew ? "border-blue-200 bg-blue-50 text-blue-700" : "border-stone-200 bg-stone-50 text-stone-500",
        )}>
          {isNew ? "Nuevo" : "Leído"}
        </span>
      </div>

      {contact.subject && (
        <div className="mt-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
          <p className="text-xs font-medium text-ink/75 truncate">📋 {contact.subject}</p>
          {contact.country_interest && (
            <p className="text-xs text-ink/40 mt-0.5">🌍 {contact.country_interest}</p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-ink/70 line-clamp-3 leading-relaxed">{contact.message}</p>

      {contact.phone && (
        <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="mt-2 block text-xs text-ink/50 hover:text-amber-800 transition-colors">
          📞 {contact.phone}
        </a>
      )}

      <div className="mt-2.5 text-xs text-ink/40">
        {new Date(contact.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </div>

      <div className="mt-3">
        <PrepareVisitsButton source="contact" sourceId={contact.id} compact />
      </div>

      {isNew && (
        <div className="mt-3 flex gap-2">
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-gold hover:text-navy"
          >
            <Mail size={13} strokeWidth={2} />
            Responder
          </a>
          <button
            type="button"
            onClick={handleRead}
            disabled={isTransitioning}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
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
        "rounded-full border px-3 py-1 text-xs font-semibold transition",
        active
          ? "border-teal-300 bg-teal-50 text-teal-800"
          : "border-gold/15 bg-cream-50/60 text-ink/50 hover:text-ink/75",
      )}
    >
      {label}
    </button>
  );
}

// ─── PriceRange ───────────────────────────────────────────────────
//
// Rango de precio (mín – máx €) para los leads de Idealista, mismo estilo de
// chip usado en el buscador de propiedades (properties-admin-client.tsx).
// Vacío = sin límite por ese lado.

function PriceRange({
  min,
  max,
  onMin,
  onMax,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  const sanitize = (v: string) => v.replace(/[^\d]/g, "");
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-white/85 px-2 py-1 text-ink/75 transition focus-within:border-gold/55">
      <span className="crm-label-sm text-ink/45">
        Precio
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={min}
        onChange={(e) => onMin(sanitize(e.target.value))}
        placeholder="mín"
        className="w-14 bg-transparent text-xs text-ink placeholder:text-ink/35 focus:outline-none"
      />
      <span className="text-ink/35">–</span>
      <input
        type="text"
        inputMode="numeric"
        value={max}
        onChange={(e) => onMax(sanitize(e.target.value))}
        placeholder="máx"
        className="w-16 bg-transparent text-xs text-ink placeholder:text-ink/35 focus:outline-none"
      />
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────
//
// Copia texto al portapapeles (p.ej. nombre o teléfono) para pegarlo rápido
// en Zinto. Muestra un tick verde 1,5 s al copiar.

function CopyButton({
  value,
  title,
  size = 12,
  className,
  label,
}: {
  value: string;
  title: string;
  size?: number;
  className?: string;
  label?: string; // si se da, se pinta como pill con texto en vez de solo icono
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt(title, value);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (label) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={title}
        aria-label={title}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
          copied
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-ink/15 bg-white text-ink/70 hover:border-teal-300 hover:text-teal-700",
          className,
        )}
      >
        {copied ? <Check size={size} strokeWidth={2.5} /> : <Copy size={size} strokeWidth={2} />}
        {copied ? "Copiado" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md p-1 transition",
        copied
          ? "text-emerald-600"
          : "text-ink/35 hover:bg-ink/5 hover:text-teal-700",
        className,
      )}
    >
      {copied ? <Check size={size} strokeWidth={2.5} /> : <Copy size={size} strokeWidth={2} />}
    </button>
  );
}

// Formatea el precio de una ficha para el previsualizador de propiedades.
function formatFichaPrice(price: number | null, operation: string | null): string | null {
  if (price == null) return null;
  const n = new Intl.NumberFormat("es-ES").format(price);
  return operation === "rent" ? `${n} €/mes` : `${n} €`;
}

// ─── LangBadge ────────────────────────────────────────────────────
//
// Muestra "el idioma que habla" el contacto, detectado del mensaje sin llamadas
// de red. Solo se pinta cuando hay una pista fiable (no para "Desconocido").

function LangBadge({ text, className }: { text: string | null | undefined; className?: string }) {
  const lang = detectLanguage(text);
  if (!lang || lang.code === "unknown") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-ink/10 bg-white/70 px-2 py-0.5 text-xs font-semibold text-ink/60",
        className,
      )}
      title={`Idioma del mensaje: ${lang.label}`}
    >
      <span aria-hidden>{lang.flag}</span>
      {lang.label}
    </span>
  );
}

// ─── LeadMessage ──────────────────────────────────────────────────
//
// Mensaje del lead con traducción al español bajo demanda (vía IA). Detecta el
// idioma en cliente para decidir si ofrecer el botón "Traducir" y permite
// alternar entre original y traducción una vez obtenida.

function LeadMessage({ text }: { text: string }) {
  const [isPending, startTransition] = useTransition();
  const [translation, setTranslation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const lang = detectLanguage(text);
  const isSpanish = lang?.code === "es";
  const showingTranslation = translation != null && !showOriginal;

  function handleTranslate() {
    if (translation != null) {
      setShowOriginal((v) => !v);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await translateLeadMessage(text);
      if (res.ok) {
        setTranslation(res.translation);
        setShowOriginal(false);
      } else {
        setError(res.error);
      }
    });
  }

  const buttonLabel =
    translation == null ? "Traducir" : showOriginal ? "Ver traducción" : "Ver original";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="crm-label-sm text-ink/40">Mensaje</p>
        {!isSpanish && (
          <button
            type="button"
            onClick={handleTranslate}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Languages size={11} strokeWidth={2} />
            )}
            {buttonLabel}
          </button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/75">
        {showingTranslation ? translation : text}
      </p>
      {showingTranslation && (
        <p className="mt-1 crm-label-sm text-teal-700/70">
          Traducido al español
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
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

function IdealistaLeadCard({
  lead,
  staffOptions,
  onOpen,
}: {
  lead: IdealistaLeadRow;
  staffOptions: StaffOption[];
  onOpen: () => void;
}) {
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(lead.status);
  const [optimisticType, setOptimisticType] = useOptimistic(lead.lead_type);
  const [optimisticAssignedTo, setOptimisticAssignedTo] = useOptimistic(lead.assigned_to);
  const [optimisticContactStatus, setOptimisticContactStatus] = useOptimistic(
    lead.contact_status,
  );
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

  function handleAssign(advisorId: string) {
    startTransition(async () => {
      setOptimisticAssignedTo(advisorId || null);
      await assignIdealistaLead(lead.id, advisorId || null);
    });
  }

  function handleContactStatus(status: IdealistaLeadRow["contact_status"]) {
    startTransition(async () => {
      setOptimisticContactStatus(status);
      await updateIdealistaLeadContactStatus(lead.id, status);
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
              <div className="flex items-center gap-1">
                <p className="truncate font-medium text-ink text-sm leading-tight">{lead.name || "Sin nombre"}</p>
                {lead.name && <CopyButton value={lead.name} title="Copiar nombre" />}
              </div>
              {lead.phone && (
                <div className="flex items-center gap-1">
                  <a
                    href={`tel:${lead.phone.replace(/\s/g, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block truncate text-xs text-ink/50 leading-tight mt-0.5 hover:text-amber-800 transition-colors"
                  >
                    📞 {lead.phone}
                    {lead.is_international && lead.phone_country ? ` · ${lead.phone_country} Internacional` : ""}
                  </a>
                  <CopyButton value={lead.phone.replace(/\s+/g, "")} title="Copiar teléfono" size={11} />
                  <WhatsAppLeadButton
                    phone={lead.phone}
                    name={lead.name}
                    message={lead.message}
                    propertyTitle={lead.matched_property_title || lead.property_title}
                    leadId={lead.id}
                    size={11}
                  />
                </div>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold",
              LEAD_STATUS_BADGE[optimisticStatus],
            )}
          >
            {LEAD_STATUS_LABEL[optimisticStatus]}
          </span>
        </div>

        {/* Tipo: confirmado o sugerido */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {optimisticType ? (
            <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              {LEAD_TYPE_LABEL[optimisticType]}
            </span>
          ) : lead.suggested_type ? (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
              title={lead.suggestion_keywords.length > 0 ? `Detectado por: ${lead.suggestion_keywords.join(", ")}` : undefined}
            >
              Sugerido: {LEAD_TYPE_LABEL[lead.suggested_type]}
            </span>
          ) : null}
          {lead.detail_captured && (
            <span className="rounded-full border border-ink/10 bg-ink/[0.04] px-2.5 py-0.5 text-xs text-ink/45" title="Perfil y mensaje completo capturados">
              ● Detalle
            </span>
          )}
          <LangBadge text={lead.message} />
        </div>

        {/* Propiedad consultada */}
        {(lead.property_title || lead.property_ref || lead.idealista_code) && (
          <div className="mt-3 flex gap-2.5 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
            {lead.property_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lead.property_image_url}
                alt=""
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="h-11 w-14 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink/75 truncate">
                📍 {[lead.property_title, lead.property_price, lead.property_type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
              </p>
              {(lead.property_ref || lead.idealista_code) && (
                <p className="text-xs text-ink/40 mt-0.5">
                  {[lead.property_ref && `Ref. ${lead.property_ref}`, lead.idealista_code && `Cod. ${lead.idealista_code}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {lead.matched_property_slug ? (
                <a
                  href={`/es/admin/propiedades/${lead.matched_property_slug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
                >
                  <ExternalLink size={11} />
                  Ver ficha en el sistema
                  {lead.matched_property_reference ? ` · ${lead.matched_property_reference}` : ""}
                </a>
              ) : (
                (lead.property_ref || lead.idealista_code) && (
                  <p className="mt-1 text-xs text-ink/35">Sin ficha vinculada en el sistema</p>
                )
              )}
              {lead.properties.length > 1 && (
                <p className="text-xs font-semibold text-teal-700 mt-0.5">
                  Consultó por {lead.properties.length} propiedades
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mensaje */}
        {lead.message && (
          <>
            <p className={cn("mt-3 text-xs text-ink/70 leading-relaxed whitespace-pre-line", !expanded && "line-clamp-3")}>
              {lead.message}
            </p>
            {lead.message.length > 180 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((v) => !v);
                }}
                className="mt-1 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
              >
                {expanded ? "Ver menos" : "Ver más"}
              </button>
            )}
          </>
        )}

        {/* Perfil de búsqueda */}
        {(bullets.length > 0 || presentacion) && (
          <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2">
            <p className="text-xs font-semibold text-teal-800">Perfil para búsqueda de vivienda</p>
            {bullets.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {bullets.slice(0, 5).map((b) => (
                  <li key={b} className="text-xs text-ink/60">
                    • {b}
                  </li>
                ))}
              </ul>
            )}
            {presentacion && <p className="mt-1.5 text-xs italic text-ink/55 line-clamp-4">“{presentacion}”</p>}
          </div>
        )}

        {/* Fechas */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/40">
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

      {/* Asignación + estado de contacto */}
      <div
        className="mt-3 grid grid-cols-2 gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <select
          value={optimisticAssignedTo ?? ""}
          onChange={(e) => handleAssign(e.target.value)}
          disabled={isTransitioning}
          className="rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs text-ink/75 focus:border-gold/55 focus:outline-none disabled:opacity-60"
        >
          <option value="">Sin asignar</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={optimisticContactStatus}
          onChange={(e) =>
            handleContactStatus(e.target.value as IdealistaLeadRow["contact_status"])
          }
          disabled={isTransitioning}
          className={cn(
            "rounded-lg border px-2 py-1.5 text-xs font-medium focus:outline-none disabled:opacity-60",
            CONTACT_STATUS_BADGE[optimisticContactStatus],
          )}
        >
          {(Object.keys(CONTACT_STATUS_LABEL) as IdealistaLeadRow["contact_status"][]).map(
            (s) => (
              <option key={s} value={s}>
                {CONTACT_STATUS_LABEL[s]}
              </option>
            ),
          )}
        </select>
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
                  "flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition disabled:opacity-60",
                  (optimisticType ?? lead.suggested_type) === type
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : "border-gold/15 bg-cream-50/60 text-ink/45 hover:text-ink/75",
                )}
              >
                {LEAD_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <PrepareVisitsButton source="idealista" sourceId={lead.id} />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleStatus("fichado")}
              disabled={isTransitioning}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 size={13} strokeWidth={2} />
              Fichar
            </button>
            <button
              type="button"
              onClick={() => handleStatus("descartado")}
              disabled={isTransitioning}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
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
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 disabled:opacity-60"
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

function IdealistaLeadModal({
  lead,
  staffOptions,
  onClose,
}: {
  lead: IdealistaLeadRow;
  staffOptions: StaffOption[];
  onClose: () => void;
}) {
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticAssignedTo, setOptimisticAssignedTo] = useOptimistic(lead.assigned_to);
  const [optimisticContactStatus, setOptimisticContactStatus] = useOptimistic(
    lead.contact_status,
  );
  const bullets = lead.profile?.bullets ?? [];
  const presentacion = lead.profile?.presentacion ?? null;
  // Las llamadas perdidas se guardan con conversation_id "call_<id>" y su
  // hilo en Idealista es /inbox/CALL_<id> (no CONVERSATION_).
  const idealistaUrl = lead.conversation_id.startsWith("call_")
    ? `https://www.idealista.com/inbox/CALL_${lead.conversation_id.slice(5)}`
    : `https://www.idealista.com/inbox/CONVERSATION_${lead.conversation_id}`;

  function handleAssign(advisorId: string) {
    startTransition(async () => {
      setOptimisticAssignedTo(advisorId || null);
      await assignIdealistaLead(lead.id, advisorId || null);
    });
  }

  function handleContactStatus(status: IdealistaLeadRow["contact_status"]) {
    startTransition(async () => {
      setOptimisticContactStatus(status);
      await updateIdealistaLeadContactStatus(lead.id, status);
    });
  }

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
              <div className="flex items-center gap-1.5">
                <p className="truncate font-semibold text-ink text-base">{lead.name || "Sin nombre"}</p>
                {lead.name && <CopyButton value={lead.name} title="Copiar nombre" size={14} />}
              </div>
              {lead.phone && (
                <div className="mt-0.5 flex items-center gap-1.5">
                  <a
                    href={`tel:${lead.phone.replace(/\s/g, "")}`}
                    className="block text-sm text-ink/60 hover:text-amber-800 transition-colors"
                  >
                    📞 {lead.phone}
                    {lead.is_international && lead.phone_country ? ` · ${lead.phone_country} Internacional` : ""}
                  </a>
                  <CopyButton value={lead.phone.replace(/\s+/g, "")} title="Copiar teléfono" size={13} />
                  <WhatsAppLeadButton
                    phone={lead.phone}
                    name={lead.name}
                    message={lead.message}
                    propertyTitle={lead.matched_property_title || lead.property_title}
                    leadId={lead.id}
                    size={13}
                  />
                </div>
              )}
              <LangBadge text={lead.message} className="mt-1.5" />
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

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 crm-label-sm text-ink/40">
              Asignado a
            </p>
            <select
              value={optimisticAssignedTo ?? ""}
              onChange={(e) => handleAssign(e.target.value)}
              disabled={isTransitioning}
              className="w-full rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-sm text-ink/80 focus:border-gold/55 focus:outline-none disabled:opacity-60"
            >
              <option value="">Sin asignar</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 crm-label-sm text-ink/40">
              Estado de contacto
            </p>
            <select
              value={optimisticContactStatus}
              onChange={(e) =>
                handleContactStatus(e.target.value as IdealistaLeadRow["contact_status"])
              }
              disabled={isTransitioning}
              className={cn(
                "w-full rounded-lg border px-2.5 py-2 text-sm font-medium focus:outline-none disabled:opacity-60",
                CONTACT_STATUS_BADGE[optimisticContactStatus],
              )}
            >
              {(Object.keys(CONTACT_STATUS_LABEL) as IdealistaLeadRow["contact_status"][]).map(
                (s) => (
                  <option key={s} value={s}>
                    {CONTACT_STATUS_LABEL[s]}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        {lead.properties.length > 1 ? (
          <div className="mt-4">
            <p className="crm-label-sm text-ink/40">
              Consultó por {lead.properties.length} propiedades
            </p>
            <div className="mt-1.5 space-y-1.5">
              {lead.properties.map((p, i) => (
                <div key={p.title ?? p.imageUrl ?? i} className="flex gap-2.5 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2">
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      className="h-11 w-14 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 self-center">
                    <p className="text-sm font-medium text-ink/80">
                      📍 {[p.title, p.price, p.type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
                    </p>
                    {p.date && <p className="mt-0.5 text-xs text-ink/40">🗓 {p.date}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          (lead.property_title || lead.property_ref || lead.idealista_code) && (
            <div className="mt-4 flex gap-3 rounded-lg border border-ink/5 bg-ink/[0.03] px-3 py-2.5">
              {lead.property_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lead.property_image_url}
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                  className="h-14 w-18 shrink-0 rounded-md object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink/80">
                  📍 {[lead.property_title, lead.property_price, lead.property_type].filter(Boolean).join(" · ") || "Propiedad sin identificar"}
                </p>
                {(lead.property_ref || lead.idealista_code) && (
                  <p className="text-xs text-ink/40 mt-0.5">
                    {[lead.property_ref && `Ref. ${lead.property_ref}`, lead.idealista_code && `Cod. ${lead.idealista_code}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        <PropertyMatchPicker lead={lead} />

        {lead.message && <LeadMessage text={lead.message} />}

        {(bullets.length > 0 || presentacion) && (
          <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2.5">
            <p className="text-xs font-semibold text-teal-800">Perfil para búsqueda de vivienda</p>
            {bullets.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {bullets.map((b) => (
                  <li key={b} className="text-xs text-ink/65">
                    • {b}
                  </li>
                ))}
              </ul>
            )}
            {presentacion && <p className="mt-2 text-xs italic text-ink/60">“{presentacion}”</p>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/40">
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
          href={idealistaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold hover:text-navy"
        >
          <ExternalLink size={14} strokeWidth={2} />
          Abrir en Idealista
        </a>
      </div>
    </div>
  );
}

// ─── PropertyMatchPicker ─────────────────────────────────────────────
//
// Vínculo a la ficha del sistema. Si ya hay match automático (por Ref./Cód.,
// ver api/extension/idealista-leads/route.ts) muestra el link y permite
// cambiarlo; si no lo hay, muestra directamente el buscador para que el
// admin lo vincule a mano.

function PropertyMatchPicker({ lead }: { lead: IdealistaLeadRow }) {
  const router = useRouter();
  const [isTransitioning, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al abrir el picker (query vacía) carga y previsualiza las fichas guardadas
  // más recientes; al teclear, busca con debounce. Así el admin puede elegir
  // una ficha de un vistazo sin tener que escribir.
  useEffect(() => {
    if (!editing) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(
      async () => {
        setSearching(true);
        try {
          const res = await fetch(`/api/admin/properties/search?q=${encodeURIComponent(query)}`);
          const json = await res.json().catch(() => ({}));
          setResults(json.data ?? []);
        } finally {
          setSearching(false);
        }
      },
      query.trim() ? 300 : 0,
    );
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, editing]);

  function handleSelect(propertyId: string) {
    startTransition(async () => {
      await setIdealistaLeadMatchedProperty(lead.id, propertyId);
      setEditing(false);
      setQuery("");
      setResults([]);
      router.refresh();
    });
  }

  function handleUnlink() {
    startTransition(async () => {
      await setIdealistaLeadMatchedProperty(lead.id, null);
      router.refresh();
    });
  }

  // Enlace público (SmartLink) de la ficha ya vinculada, para copiar/abrir y
  // pegarlo en Zinto/WhatsApp. Convención igual que la ficha de propiedad:
  // /compartir/{bcref}-{slug}.
  const publicSlug = lead.matched_property_slug
    ? shareSlug(lead.matched_property_slug, lead.matched_property_reference)
    : null;
  const relativeShareUrl = publicSlug ? `/compartir/${publicSlug}` : null;
  const absoluteShareUrl = publicSlug ? `${PORTAL_URL}/compartir/${publicSlug}` : null;

  if (!editing) {
    return (
      <div className="mt-4">
        {lead.matched_property_slug ? (
          <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <a
                href={`/es/admin/propiedades/${lead.matched_property_slug}`}
                className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 transition-colors"
              >
                <ExternalLink size={12} className="shrink-0" />
                <span className="truncate">
                  Ver ficha en el sistema
                  {lead.matched_property_reference ? ` · ${lead.matched_property_reference}` : ""}
                </span>
              </a>
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={isTransitioning}
                className="shrink-0 text-xs text-ink/40 underline transition hover:text-ink/70 disabled:opacity-50"
              >
                Cambiar
              </button>
            </div>

            {/* Enlace público / SmartLink para compartir */}
            {relativeShareUrl && (
              <>
                <p className="mt-2.5 crm-label-sm text-teal-800/70">
                  Enlace público
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate rounded-md border border-ink/10 bg-white px-2 py-1.5 font-mono text-xs text-ink/55">
                    {relativeShareUrl}
                  </span>
                  {absoluteShareUrl && (
                    <CopyButton
                      value={absoluteShareUrl}
                      title="Copiar enlace público"
                      label="Copiar"
                    />
                  )}
                  <a
                    href={relativeShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir enlace público"
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-white px-2.5 text-ink/60 transition hover:border-teal-300 hover:text-teal-700"
                  >
                    <ExternalLink size={13} strokeWidth={2} />
                  </a>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink/50 underline transition hover:text-teal-800"
          >
            <Link2 size={12} />
            Vincular a una ficha del sistema
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="crm-label-sm text-teal-800">
          Vincular a una ficha del sistema
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setQuery("");
            setResults([]);
          }}
          className="text-ink/40 hover:text-ink/70"
        >
          <X size={14} />
        </button>
      </div>
      <p className="mt-1 text-xs text-ink/45">
        Elige una de tus fichas guardadas o busca por título, dirección o referencia.
      </p>
      <div className="relative mt-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, dirección o referencia..."
          className="w-full rounded-lg border border-ink/10 bg-white py-2 pl-8 pr-3 text-sm focus:border-teal-400 focus:outline-none"
        />
        {searching && (
          <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-ink/35" />
        )}
      </div>
      {results.length > 0 && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {results.map((p) => {
            const price = formatFichaPrice(p.price, p.operation);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p.id)}
                disabled={isTransitioning}
                className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white disabled:opacity-50"
              >
                {p.cover_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_photo_url} alt="" className="h-10 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded-md bg-ink/5 text-ink/30">
                    <Link2 size={13} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink/80">
                    {p.title || p.address || "Sin título"}
                  </p>
                  {(price || p.address) && (
                    <p className="truncate text-xs text-ink/45">
                      {[price, p.title ? p.address : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {p.bc_reference && (
                  <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-xs text-ink/55">
                    {p.bc_reference}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {searching && results.length === 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 py-2 text-xs text-ink/40">
          <Loader2 size={13} className="animate-spin" />
          Cargando fichas…
        </div>
      )}
      {!searching && results.length === 0 && (
        <p className="mt-2 text-xs text-ink/40">
          {query.trim() ? "Sin resultados" : "No hay fichas guardadas todavía"}
        </p>
      )}
      {lead.matched_property_slug && (
        <button
          type="button"
          onClick={handleUnlink}
          disabled={isTransitioning}
          className="mt-2 text-xs text-rose-600 underline transition hover:text-rose-800 disabled:opacity-50"
        >
          Quitar vínculo actual
        </button>
      )}
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
              <p className="truncate text-xs text-ink/50 leading-tight mt-0.5">
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
            <p className="text-xs font-medium text-ink/75 group-hover:text-amber-800 transition-colors truncate">
              📍 {request.propertyTitle}
            </p>
            {request.propertyReference && (
              <p className="text-xs text-ink/40 mt-0.5">
                {request.propertyReference}
              </p>
            )}
          </a>
        ) : (
          <>
            <p className="text-xs text-ink/70 truncate">
              📍 {request.propertyTitle}
            </p>
            {request.propertyReference && (
              <p className="text-xs text-ink/40 mt-0.5">
                {request.propertyReference}
              </p>
            )}
          </>
        )}
      </div>

      {/* Fechas */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/50">
        <span>🗓 {request.requestedDateLabel}</span>
        <span className="text-ink/30">·</span>
        <span>
          {t("solicitudes.received")}{" "}
          {formatRelativeMinutes(request.receivedRelativeMinutes, t)}
        </span>
      </div>

      {/* Acciones para pendientes */}
      {isPendingStatus && (
        <div className="mt-3 flex flex-wrap gap-2">
          {request.clientId && <PrepareVisitsLink clientId={request.clientId} />}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isTransitioning}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <CheckCircle2 size={13} strokeWidth={2} />
            {t("solicitudes.action.confirm")}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isTransitioning}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
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
        "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        STATUS_BADGE[status],
      )}
    >
      {t(`solicitudes.status.${status}`)}
    </span>
  );
}
