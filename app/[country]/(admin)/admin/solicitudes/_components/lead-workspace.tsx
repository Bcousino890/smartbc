"use client";

// ============================================================================
// LEAD WORKSPACE — la ficha de una solicitud (página propia).
//
// Maquetas del 4 de noviembre: una cabecera compacta común (quién es, de dónde
// viene y quién la lleva) y tres pestañas que caben en una pantalla de
// escritorio sin desplazarse:
//
//   Resumen          anuncio consultado + lo que preguntó │ siguiente paso + actividad reciente
//   Actividad        historial de la solicitud            │ próximo seguimiento + añadir nota
//   Cliente y datos  contacto (WhatsApp y llamadas)       │ cliente en el CRM + anuncio de origen
//
// Lo largo (mensaje, historial completo, evidencia) se abre bajo demanda.
//
// Las capacidades protegidas se REUTILIZAN tal cual: el botón de Zinto,
// «Preparar visitas», registrar contacto (resultado + próxima tarea en una
// transacción), la asignación de administrador y el vínculo exacto.
// «Abrir Zinto» usa el teléfono de WhatsApp y «Llamar» el de llamadas (0242);
// ninguno de los dos registra un contacto.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleCheck,
  Copy,
  Download,
  Globe,
  Languages,
  Mail,
  MessageCircle,
  Pencil,
  PencilLine,
  Phone,
  RefreshCw,
  Save,
  Search,
  UserCheck,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { fichaActions } from "@/lib/sales-inbox/views";
import { DEFAULT_TASK_TIME, madridDatePlus, madridParts, madridToIso, TASK_TZ } from "@/lib/sales-inbox/time";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type { StaffRef } from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { PrepareVisitsButton } from "@/components/admin/viewing-collections/prepare-visits-button";
import {
  Button,
  Labeled,
  Modal,
  Panel,
  Pill,
  TextArea,
  TextInput,
} from "@/components/admin/ui/primitives";
import { LeadAvatar } from "./lead-avatar";
import { LinkBadge } from "./lead-card";
import { OwnerLine } from "./owner-control";
import { RegisterContactDialog } from "./register-contact-dialog";
import { formatDate, formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { translateLeadMessage } from "../actions";
import {
  confirmSuggestedListing,
  convertLeadToClient,
  findClientCandidates,
  logContact,
  matchLeadProperty,
  mergeSamePhoneLeads,
  saveLeadPhones,
  searchPropertiesForLead,
  setFollowUp,
  setLeadDiscarded,
} from "../inbox-actions";
import { WhatsAppLeadButton } from "../whatsapp-lead-button";

export type WorkspaceTab = "summary" | "activity" | "client";
type RunFn = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

// ─── Estilos comunes de la ficha ─────────────────────────────────────────────

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-action";
/** Botón secundario discreto: filete fino, texto de tinta, icono en oro. */
const secondaryBtn = cn(
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-sol-line px-4 sol-ui text-sol-ink transition hover:border-sol-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
  focusRing,
);
/** Acción principal: dorado apagado (`.sol-cta`, globals.css). */
const ctaBtn = cn(
  "sol-cta inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg px-5 sol-ui font-semibold transition disabled:opacity-50",
  focusRing,
);
/** Enlace de texto en oro; 44 px de zona en móvil. */
const linkCls = cn(
  "inline-flex min-h-[44px] items-center gap-1.5 sol-ui text-sol-action underline-offset-2 hover:underline lg:min-h-[32px]",
  focusRing,
);

const TABS: WorkspaceTab[] = ["summary", "activity", "client"];
const TAB_LABEL: Record<WorkspaceTab, string> = {
  summary: "inbox.tab.summary",
  activity: "inbox.tab.activity",
  client: "inbox.tab.client",
};

export function LeadWorkspace({
  lead,
  staff,
  country,
  canEdit,
  isAdmin = false,
  backLabel,
  onClose,
}: {
  lead: LeadDetail;
  staff: StaffRef[];
  country: Country;
  canEdit: boolean;
  isAdmin?: boolean;
  /** «Volver a tarjetas» / «Volver a por piso» / «Volver a prioridades». */
  backLabel?: string;
  onClose?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const [contact, setContact] = useState<null | "contact" | "complete">(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const tabRefs = useRef<Record<WorkspaceTab, HTMLButtonElement | null>>({ summary: null, activity: null, client: null });

  const run: RunFn = (fn) => {
    setError(null);
    startBusy(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? t("inbox.error.generic"));
      else router.refresh();
    });
  };

  const name = lead.name?.trim() || t("inbox.row.noName");
  const back = backLabel ?? t("inbox.backToList");
  const listingRef = lead.propertyRef ?? lead.idealistaCode;
  // Las acciones de trabajo no dependen del estado (cliente vinculado o
  // descartada siguen pudiendo contactarse): ver `fichaActions`. Zinto, con
  // el teléfono de WhatsApp.
  const actions = fichaActions({ phone: lead.zintoPhone, state: lead.state }, canEdit);
  const timeline = buildTimeline(lead, t);
  const type = lead.leadType ?? null;

  // Flechas izquierda/derecha entre pestañas (patrón WAI-ARIA de tablist).
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ── Miga y vuelta ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="hidden min-w-0 truncate sol-meta text-sol-muted sm:block">
          {onClose ? (
            <button type="button" onClick={onClose} className={cn("hover:text-sol-action hover:underline", focusRing)}>
              {t("inbox.title")}
            </button>
          ) : (
            t("inbox.title")
          )}
          <span aria-hidden> / </span>
          {name}
        </p>
        {onClose && (
          <>
            <button
              type="button"
              onClick={onClose}
              className={cn("inline-flex min-h-[44px] items-center gap-1 sol-ui font-semibold text-sol-action sm:hidden", focusRing)}
            >
              <ChevronLeft size={18} strokeWidth={2.2} /> {back}
            </button>
            <button type="button" onClick={onClose} className={cn(secondaryBtn, "hidden shrink-0 px-6 sm:inline-flex")}>
              {back}
            </button>
          </>
        )}
      </div>

      {/* ── Cabecera común: persona, estado, origen y responsable ── */}
      <header className="mt-2 flex flex-col gap-3 border-b border-sol-line pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {lead.avatarUrl ? (
            <LeadAvatar
              src={lead.avatarUrl}
              name={lead.name}
              className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-sol-line"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sol-select sol-ui font-semibold text-sol-action ring-1 ring-sol-line"
            >
              {initials(name)}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 break-words sol-name font-semibold leading-tight text-sol-ink">{name}</h1>
              <span className="rounded border border-sol-line px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-sol-muted">
                {t(`inbox.state.${lead.state}`)}
              </span>
              {lead.isInternational && (
                <Globe size={16} strokeWidth={1.8} className="shrink-0 text-sol-faint" aria-label={t("inbox.filter.international")} />
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sol-ui text-sol-muted">
              <span>{t("inbox.source.idealista")}</span>
              {listingRef && (
                <>
                  <span aria-hidden>·</span>
                  <span>{listingRef}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <RelativeTime at={lead.createdAt} locale={config.locale} />
              {type ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t(`inbox.type.${type}`)}</span>
                </>
              ) : lead.suggestedType ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{t("inbox.type.suggested", { type: t(`inbox.type.${lead.suggestedType}`) })}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <OwnerLine lead={lead} staff={staff} isAdmin={isAdmin} locale={config.locale} />
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-sol-error/30 bg-sol-error-bg px-4 py-3 text-sm text-sol-error">
          {error}
        </p>
      )}

      {/* ── Pestañas ligeras: línea fina bajo la activa ── */}
      <div
        role="tablist"
        aria-label={t("inbox.tab.label")}
        onKeyDown={onTabKey}
        className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:gap-4 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((id) => {
          const on = tab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`ws-tab-${id}`}
              aria-selected={on}
              aria-controls={`ws-panel-${id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(id)}
              className={cn(
                "relative inline-flex min-h-[48px] shrink-0 items-center whitespace-nowrap px-3 sol-ui transition-colors",
                focusRing,
                on ? "font-semibold text-sol-ink" : "text-sol-muted hover:text-sol-ink",
              )}
            >
              {t(TAB_LABEL[id])}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-sol-accent/70 transition-opacity",
                  on ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* ── Cuerpo: dos columnas en escritorio, apiladas en móvil ── */}
      <div
        role="tabpanel"
        id={`ws-panel-${tab}`}
        aria-labelledby={`ws-tab-${tab}`}
        className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start"
      >
        {tab === "summary" && (
          <>
            <div className="flex min-w-0 flex-col gap-5">
              <ListingPanel lead={lead} country={country} canEdit={canEdit} onRun={run} busy={busy} />
              <EnquiryPanel lead={lead} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <NextStepPanel
                lead={lead}
                locale={config.locale}
                canEdit={canEdit}
                busy={busy}
                onRegister={() => setContact("contact")}
                onDiscard={() => setDiscardOpen(true)}
                onRestore={() => run(() => setLeadDiscarded(lead.id, false))}
                onRun={run}
              />
              <Panel title={t("inbox.recent.title")}>
                <Timeline entries={timeline.slice(0, 2)} locale={config.locale} compact />
                <button type="button" onClick={() => setTab("activity")} className={cn(linkCls, "mt-3")}>
                  {t("inbox.ws.recent.see")}
                  <ArrowUpRight size={15} strokeWidth={2} />
                </button>
              </Panel>
            </div>
          </>
        )}

        {tab === "activity" && (
          <>
            <div className="flex min-w-0 flex-col gap-5">
              <HistoryPanel entries={timeline} locale={config.locale} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <FollowUpPanel
                lead={lead}
                locale={config.locale}
                canEdit={canEdit}
                busy={busy}
                onRun={run}
                onDone={() => setContact("complete")}
              />
              {canEdit && <NotePanel lead={lead} busy={busy} onRun={run} />}
            </div>
          </>
        )}

        {tab === "client" && (
          <>
            <div className="flex min-w-0 flex-col gap-5">
              {lead.duplicates.length > 0 && (
                <Duplicates lead={lead} canEdit={canEdit} busy={busy} onError={setError} startBusy={startBusy} />
              )}
              <ContactPanel lead={lead} canEdit={canEdit} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <ClientPanel lead={lead} country={country} canEdit={canEdit} />
              <OriginPanel lead={lead} />
            </div>
          </>
        )}
      </div>

      {/* Móvil: la acción principal siempre a mano. */}
      {(actions.registerContact || actions.openZinto) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-sol-line bg-sol-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden">
          {actions.registerContact && (
            <button type="button" onClick={() => setContact("contact")} className={cn(ctaBtn, "w-full")}>
              {t("inbox.contact.open")}
            </button>
          )}
          {actions.openZinto && lead.zintoPhone && (
            <WhatsAppLeadButton
              phone={lead.zintoPhone}
              name={lead.name}
              message={lead.message}
              propertyTitle={lead.propertyTitle}
              leadId={lead.id}
              size={16}
              label={t("inbox.zinto.openShort")}
              className={cn(secondaryBtn, "w-full")}
            />
          )}
        </div>
      )}

      {contact && (
        <RegisterContactDialog
          lead={lead}
          locale={config.locale}
          completingTask={contact === "complete"}
          onClose={() => setContact(null)}
        />
      )}
      {discardOpen && (
        <DiscardDialog
          onClose={() => setDiscardOpen(false)}
          onConfirm={(reason) => {
            setDiscardOpen(false);
            run(() => setLeadDiscarded(lead.id, true, reason));
          }}
        />
      )}
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·"
  );
}

// ─── Fechas ──────────────────────────────────────────────────────────────────

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TASK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** «Hoy, 12:14» / «Ayer, 09:47» / «2 nov, 10:00» (hora de Madrid). */
function useWhen(locale: string) {
  const t = useT();
  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const time = new Intl.DateTimeFormat(locale, { timeZone: TASK_TZ, hour: "2-digit", minute: "2-digit" }).format(d);
    const now = new Date();
    if (dayKey(d) === dayKey(now)) return t("inbox.ws.today", { time });
    if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return t("inbox.ws.yesterday", { time });
    return formatDateTime(iso, locale);
  };
}

/** «Jueves, 5 nov, 16:30»: el día de la semana manda en un seguimiento. */
function dueLabel(iso: string, locale: string): string {
  const s = new Intl.DateTimeFormat(locale, {
    timeZone: TASK_TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Historial ───────────────────────────────────────────────────────────────

type TimelineEntry = {
  id: string;
  at: string;
  Icon: LucideIcon;
  title: string;
  body: string | null;
  author: string | null;
};

const KIND_ICON: Record<string, LucideIcon> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  note: PencilLine,
  assignment: UserCheck,
  follow_up: CalendarClock,
  conversion: UserPlus,
  discarded: XCircle,
  status: RefreshCw,
};

/**
 * Todo lo que ha pasado, de lo más reciente a lo más antiguo: el registro de
 * la solicitud, el resumen de WhatsApp (una línea, no treinta mensajes) y su
 * llegada desde Idealista.
 */
function buildTimeline(lead: LeadDetail, t: ReturnType<typeof useT>): TimelineEntry[] {
  const out: TimelineEntry[] = lead.activity.map((a) => ({
    id: a.id,
    at: a.createdAt,
    Icon: KIND_ICON[a.kind] ?? RefreshCw,
    title:
      a.kind === "status" && a.body?.startsWith("Teléfonos")
        ? t("inbox.ws.history.phones")
        : `${t(`inbox.activity.kind.${a.kind}`)}${a.outcome ? ` · ${t(`inbox.log.call.${a.outcome}`)}` : ""}`,
    body: a.body,
    author: a.authorName,
  }));
  const wa = lead.whatsapp;
  if (wa.conversationId) {
    out.push({
      id: "whatsapp",
      at: wa.lastMessageAt ?? lead.createdAt,
      Icon: MessageCircle,
      title:
        wa.outbound > 0
          ? t("inbox.activity.waSummary", { sent: wa.outbound, received: wa.inbound })
          : t("inbox.activity.waOpenedOnly"),
      body: null,
      author: null,
    });
  }
  const ref = lead.propertyRef ?? lead.idealistaCode;
  out.sort((a, b) => b.at.localeCompare(a.at));
  // La llegada va siempre al final: es el origen de todo lo demás.
  out.push({
    id: "received",
    at: lead.createdAt,
    Icon: Download,
    title: t("inbox.activity.received"),
    body: ref ? `${t("inbox.source.idealista")} · ${ref}` : t("inbox.source.idealista"),
    author: null,
  });
  return out;
}

function Timeline({ entries, locale, compact = false }: { entries: TimelineEntry[]; locale: string; compact?: boolean }) {
  const t = useT();
  const when = useWhen(locale);
  return (
    <ol>
      {entries.map((e, i) => (
        <li key={e.id} className={cn("relative flex gap-4", i < entries.length - 1 && (compact ? "pb-4" : "pb-5"))}>
          {i < entries.length - 1 && (
            <span aria-hidden className="absolute bottom-0 start-[19px] top-10 w-px bg-sol-line" />
          )}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sol-line bg-sol-column text-sol-action">
            <e.Icon size={17} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="sol-ui font-semibold text-sol-ink">{e.title}</p>
            <p className="sol-meta text-sol-muted">
              {when(e.at)}
              {e.author ? ` · ${t("inbox.ws.history.by", { name: e.author })}` : ""}
            </p>
            {!compact && e.body && <p className="mt-1 line-clamp-2 sol-ui text-sol-ink">{e.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Los cuatro últimos a la vista; el historial completo, bajo demanda. */
function HistoryPanel({ entries, locale }: { entries: TimelineEntry[]; locale: string }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const LIMIT = 4;
  return (
    <Panel title={t("inbox.ws.history.title")}>
      <Timeline entries={all ? entries : entries.slice(0, LIMIT)} locale={locale} />
      {entries.length > LIMIT && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className={cn(linkCls, "mt-4")}>
          {all ? t("inbox.ws.history.less") : t("inbox.ws.history.all", { count: entries.length })}
        </button>
      )}
    </Panel>
  );
}

// ─── Resumen · anuncio consultado ────────────────────────────────────────────

/** «Vínculo exacto» en oro; el resto de estados, con su etiqueta de siempre. */
function LinkLabel({ status }: { status: LeadDetail["linkStatus"] }) {
  const t = useT();
  if (status !== "exact") return <LinkBadge status={status} />;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-sol-action">
      <BadgeCheck size={15} strokeWidth={1.9} />
      {t("inbox.link.exact")}
    </span>
  );
}

function ListingPanel({
  lead,
  country,
  canEdit,
  onRun,
  busy,
}: {
  lead: LeadDetail;
  country: Country;
  canEdit: boolean;
  onRun: RunFn;
  busy: boolean;
}) {
  const t = useT();
  const config = getCountryConfig(country);
  const [matching, setMatching] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const exact = lead.linkStatus === "exact";
  // Identificadores recibidos: «Idealista: Cod. | Ref.».
  const ids = [lead.idealistaCode && `${t("inbox.source.idealista")}: ${lead.idealistaCode}`, lead.propertyRef]
    .filter(Boolean)
    .join("  |  ");

  // Sin vínculo exacto NO se enseña ningún inmueble: ni foto ni ficha de un
  // piso «parecido». Solo lo que llegó de Idealista, tal cual, y la manera de
  // identificarlo (vincular con motivo, o importar).
  if (!exact || !lead.property) {
    return (
      <Panel title={t("inbox.ws.property.title")} action={<LinkBadge status={lead.linkStatus} />}>
        <p className="text-[22px] font-semibold leading-snug text-sol-ink">{t("inbox.card.unknownListing")}</p>
        <p className="mt-1 text-sm text-sol-review-ink">
          {lead.linkStatus === "conflict" ? t("inbox.property.conflictHint") : t("inbox.property.noEvidence")}
        </p>
        {(lead.propertyTitle || lead.propertyPrice) && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-sol-muted">{t("inbox.property.received")}</dt>
            <dd className="text-sol-ink">{[lead.propertyTitle, lead.propertyPrice].filter(Boolean).join(" · ")}</dd>
            {ids && (
              <>
                <dt className="text-sol-muted">{t("inbox.property.receivedIds")}</dt>
                <dd className="text-sol-ink">{ids}</dd>
              </>
            )}
          </dl>
        )}
        {lead.suggestion && canEdit && !suggestionDismissed && (
          <div className="mt-3 rounded-lg border border-sol-line bg-sol-column px-4 py-3">
            <p className="font-semibold text-sol-ink">{t("inbox.property.suggestionTitle")}</p>
            <p className="mt-1 text-sm text-sol-ink">
              {[
                lead.suggestion.title,
                lead.suggestion.reference,
                lead.suggestion.price !== null
                  ? config.formatPrice(lead.suggestion.price, null, lead.suggestion.operation)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-sm text-sol-muted">{t("inbox.property.suggestionHint")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                className={cn(ctaBtn, "min-h-[44px]")}
                onClick={() =>
                  onRun(() =>
                    confirmSuggestedListing(lead.id, {
                      propertyId: lead.suggestion!.propertyId,
                      listingId: lead.suggestion!.listingId,
                    }),
                  )
                }
              >
                {t("inbox.property.suggestionYes")}
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setSuggestionDismissed(true)}>
                {t("inbox.property.suggestionNo")}
              </button>
            </div>
          </div>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={secondaryBtn} onClick={() => setMatching((v) => !v)}>
              <Search size={15} strokeWidth={2} className="text-sol-action" />
              {t("inbox.property.match")}
            </button>
            <Link href={`${config.prefix}/propiedades/importar`} className={secondaryBtn}>
              {t("inbox.property.import")}
              <ArrowUpRight size={14} strokeWidth={2} className="text-sol-action" />
            </Link>
          </div>
        )}
        <p className="mt-3 sol-meta text-sol-muted">{t("inbox.property.visitNeedsExact")}</p>
        {matching && canEdit && <PropertyPicker leadId={lead.id} onDone={() => setMatching(false)} onRun={onRun} />}
      </Panel>
    );
  }

  const p = lead.property;
  // Una ficha propia se abre en /propiedades/[slug]; un anuncio de Idealista
  // sin ficha propia (las "inspo") vive en /idealista.
  const href = p.slug ? `${config.prefix}/propiedades/${p.slug}` : `${config.prefix}/idealista`;
  // Foto: la portada de la ficha interna o la del anuncio identificado, nunca
  // la miniatura de la bandeja (condición de 0238).
  const cover = p.coverUrl ?? lead.propertyImageUrl;
  return (
    <Panel
      title={t("inbox.ws.property.title")}
      action={lead.listingRetired ? <Pill tone="neutral">{t("inbox.listing.retired")}</Pill> : null}
    >
      {lead.listingRetired && <p className="mb-3 text-sm text-sol-muted">{t("inbox.listing.retiredHint")}</p>}
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative aspect-[4/3] w-full shrink-0 self-start overflow-hidden rounded-lg bg-sol-column sm:w-[216px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center p-4 text-sm text-sol-muted">{t("inbox.card.noImage")}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={href} className={cn("line-clamp-2 text-[22px] leading-snug text-sol-ink hover:underline", focusRing)}>
            {p.title ?? "—"}
          </Link>
          {p.price !== null && (
            <p className="mt-1 text-[22px] leading-snug tabular-nums text-sol-ink">
              {config.formatPrice(p.price, null, p.operation)}
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sol-meta text-sol-muted">
            {(p.reference ?? lead.propertyRef) && (
              <>
                <span>{p.reference ?? lead.propertyRef}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <LinkLabel status={lead.linkStatus} />
            {p.status && p.status !== "available" && (
              <Pill tone="warning">{t(`inbox.property.status.${p.status}`)}</Pill>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5">
            {/* El anuncio EXACTO en idealista.com (por su código), solo con
                vínculo verificado; la conversación va en «Lo que preguntó». */}
            {lead.adUrl && (
              <a href={lead.adUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {t("inbox.ws.property.openAd")}
                <ArrowUpRight size={15} strokeWidth={2} />
              </a>
            )}
            <Link href={href} className={linkCls}>
              {t("inbox.ws.property.internal")}
              <ArrowUpRight size={15} strokeWidth={2} />
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <PrepareVisitsButton source="idealista" sourceId={lead.id} compact />
            {canEdit && (
              <button
                type="button"
                onClick={() => setMatching((v) => !v)}
                className={cn("min-h-[44px] sol-meta text-sol-muted underline-offset-2 hover:text-sol-action hover:underline lg:min-h-[32px]", focusRing)}
              >
                {t("inbox.property.review")}
              </button>
            )}
          </div>
        </div>
      </div>
      <OtherEnquiries lead={lead} />
      {matching && canEdit && <PropertyPicker leadId={lead.id} onDone={() => setMatching(false)} onRun={onRun} />}
    </Panel>
  );
}

/**
 * Los demás pisos por los que preguntó en el MISMO hilo, plegados: el
 * emparejamiento no los mira, y su precio deja ver si el hilo mezcla venta y
 * alquiler.
 */
function OtherEnquiries({ lead }: { lead: LeadDetail }) {
  const t = useT();
  if (lead.properties.length <= 1) return null;
  return (
    <details className="mt-3 border-t border-sol-line pt-2">
      <summary className={cn("flex min-h-[44px] cursor-pointer items-center sol-meta text-sol-action lg:min-h-[32px]", focusRing)}>
        {t("inbox.ws.otherEnquiries", { count: lead.properties.length - 1 })}
      </summary>
      <ul className="mt-1 space-y-1.5">
        {lead.properties.map((p, i) => (
          <li key={`${p.title ?? ""}-${i}`} className="flex items-center gap-2.5 sol-meta">
            <span className="min-w-0 flex-1 truncate text-sol-ink">{p.title ?? t("inbox.row.noProperty")}</span>
            {p.price && <span className="shrink-0 tabular-nums text-sol-muted">{p.price}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Resumen · lo que preguntó ───────────────────────────────────────────────

/**
 * El mensaje original y la presentación, recortados a unas líneas; «Ver
 * mensaje completo» los abre enteros. La traducción, a un clic. La
 * conversación de Idealista se abre desde aquí: es donde llegó la pregunta.
 */
function EnquiryPanel({ lead }: { lead: LeadDetail }) {
  const t = useT();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const presRef = useRef<HTMLParagraphElement>(null);

  const text = translated && !showOriginal ? translated : lead.message;
  const BULLETS = 3;
  const bullets = expanded ? lead.profileBullets : lead.profileBullets.slice(0, BULLETS);

  useEffect(() => {
    if (expanded) return;
    const check = () =>
      setOverflows(
        lead.profileBullets.length > BULLETS ||
          [msgRef.current, presRef.current].some((el) => !!el && el.scrollHeight > el.clientHeight + 1),
      );
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [expanded, text, lead.profilePresentation, lead.profileBullets.length]);

  return (
    <Panel
      title={t("inbox.enquiry.title")}
      action={
        lead.message ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (translated) {
                setShowOriginal((v) => !v);
                return;
              }
              start(async () => {
                const r = await translateLeadMessage(lead.message ?? "");
                if (r.ok && "text" in r) setTranslated(r.text as string);
              });
            }}
            className={cn("inline-flex min-h-[44px] items-center gap-1.5 sol-meta text-sol-action hover:underline lg:min-h-[32px]", focusRing)}
          >
            <Languages size={14} strokeWidth={1.9} />
            {translated
              ? showOriginal
                ? t("inbox.enquiry.showTranslation")
                : t("inbox.enquiry.showOriginal")
              : pending
                ? t("inbox.enquiry.translating")
                : t("inbox.ws.translate")}
          </button>
        ) : null
      }
    >
      {text ? (
        <div className="rounded-lg border border-sol-line px-4 py-3">
          <p ref={msgRef} className={cn("whitespace-pre-line text-base leading-relaxed text-sol-ink", !expanded && "line-clamp-3")}>
            {text}
          </p>
        </div>
      ) : (
        <p className="sol-ui text-sol-muted">{t("inbox.ws.enquiry.empty")}</p>
      )}
      {translated && !showOriginal && <p className="mt-1.5 text-xs text-sol-faint">{t("inbox.enquiry.machine")}</p>}
      {/* La extensión separa la presentación del resto de viñetas del perfil. */}
      {lead.profilePresentation && (
        <p ref={presRef} className={cn("mt-3 whitespace-pre-line sol-ui text-sol-muted", !expanded && "line-clamp-2")}>
          <span className="font-semibold text-sol-ink">{t("inbox.enquiry.presentation")} · </span>
          {lead.profilePresentation}
        </p>
      )}
      {bullets.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {bullets.map((b, i) => (
            <li key={i}>
              <Pill tone="neutral">{b}</Pill>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4">
        {(overflows || expanded) && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className={linkCls}>
            {expanded ? t("inbox.ws.enquiry.less") : t("inbox.ws.enquiry.more")}
          </button>
        )}
        <a href={lead.idealistaThreadUrl} target="_blank" rel="noopener noreferrer" className={cn(linkCls, "ms-auto")}>
          {t("inbox.ws.thread")}
          <ArrowUpRight size={15} strokeWidth={2} />
        </a>
      </div>
    </Panel>
  );
}

// ─── Resumen · siguiente paso ────────────────────────────────────────────────

/**
 * UN siguiente paso y las acciones de trabajo: registrar el contacto (la única
 * que lo da por hecho), abrir Zinto con el teléfono de WhatsApp y llamar al de
 * llamadas.
 */
function NextStepPanel({
  lead,
  locale,
  canEdit,
  busy,
  onRegister,
  onDiscard,
  onRestore,
  onRun,
}: {
  lead: LeadDetail;
  locale: string;
  canEdit: boolean;
  busy: boolean;
  onRegister: () => void;
  onDiscard: () => void;
  onRestore: () => void;
  onRun: RunFn;
}) {
  const t = useT();
  const sorted = lead.reasons.slice().sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b]);
  const top = sorted.find((r) => REASON_PRIORITY[r] <= 2);
  const hints = sorted.filter((r) => REASON_PRIORITY[r] === 3);
  const closed = lead.state === "converted" || lead.state === "discarded";
  const actions = fichaActions({ phone: lead.zintoPhone, state: lead.state }, canEdit);
  const scheduled = lead.nextActionAt
    ? `${formatDateTime(lead.nextActionAt, locale)}${lead.nextActionNote ? ` · ${lead.nextActionNote}` : ""}`
    : null;

  const status = closed
    ? t(`inbox.next.closed.${lead.state}`)
    : top
      ? t(`inbox.next.do.${top}`)
      : scheduled
        ? t("inbox.next.scheduled", { when: scheduled })
        : t("inbox.next.none");
  const tone = !closed && top ? (REASON_PRIORITY[top] === 1 ? "text-sol-error" : "text-sol-review-ink") : "text-sol-muted";
  const noPhone = (
    <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-dashed border-sol-line px-3 text-center sol-meta text-sol-muted">
      {t("inbox.ws.contact.noPhone")}
    </span>
  );

  return (
    <Panel title={t("inbox.next.title")}>
      <p className={cn("sol-ui", tone)}>{status}</p>
      {top && scheduled && <p className="sol-meta text-sol-muted">{scheduled}</p>}

      {actions.registerContact && (
        <button type="button" onClick={onRegister} className={cn(ctaBtn, "mt-4 w-full")}>
          <UserPlus size={18} strokeWidth={1.9} />
          {t("inbox.contact.open")}
        </button>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {actions.openZinto && lead.zintoPhone ? (
          <WhatsAppLeadButton
            phone={lead.zintoPhone}
            name={lead.name}
            message={lead.message}
            propertyTitle={lead.propertyTitle}
            leadId={lead.id}
            size={16}
            label={t("inbox.zinto.openShort")}
            className={cn(secondaryBtn, "w-full")}
          />
        ) : (
          noPhone
        )}
        {lead.callPhone ? (
          <a href={`tel:${telHref(lead.callPhone)}`} title={lead.callPhone} className={cn(secondaryBtn, "w-full")}>
            <Phone size={16} strokeWidth={1.9} className="text-sol-action" />
            {t("inbox.call")}
          </a>
        ) : (
          noPhone
        )}
      </div>
      <p className="mt-2 sol-meta text-sol-muted">{t("inbox.contact.notByOpening")}</p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {lead.zintoPhone ? <ZintoStatus lead={lead} locale={locale} canEdit={canEdit} busy={busy} onRun={onRun} /> : <span />}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={lead.state === "discarded" ? onRestore : onDiscard}
            className={cn("min-h-[44px] sol-meta text-sol-muted underline-offset-2 hover:text-sol-action hover:underline disabled:opacity-50 lg:min-h-[32px]", focusRing)}
          >
            {lead.state === "discarded" ? t("inbox.ws.next.closedRestore") : t("inbox.ws.next.discard")}
          </button>
        )}
      </div>
      {hints.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {hints.map((h) => (
            <li key={h}>
              <Pill tone="neutral">{t(`inbox.reason.${h}`)}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** `tel:` solo con cifras y un «+» inicial. */
function telHref(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, "");
}

// ─── Actividad · próximo seguimiento y nota ──────────────────────────────────

/**
 * La tarea programada, con fecha, hora y acción. «Editar» la cambia (o la
 * quita); «Marcar como hecho» abre «Registrar contacto» con la tarea ya
 * marcada: así el resultado del contacto y la próxima tarea se guardan juntos,
 * el historial se conserva y la solicitud sigue abierta.
 */
function FollowUpPanel({
  lead,
  locale,
  canEdit,
  busy,
  onRun,
  onDone,
}: {
  lead: LeadDetail;
  locale: string;
  canEdit: boolean;
  busy: boolean;
  onRun: RunFn;
  onDone: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const initial = lead.nextActionAt ? madridParts(new Date(lead.nextActionAt)) : null;
  const [date, setDate] = useState(initial?.date ?? madridDatePlus(new Date(), 1));
  const [time, setTime] = useState(initial?.time ?? DEFAULT_TASK_TIME);
  const [action, setAction] = useState(lead.nextActionNote ?? "");
  const iso = madridToIso(date, time);

  return (
    <Panel title={t("inbox.ws.followUp.title")}>
      {lead.nextActionAt ? (
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-sol-line bg-sol-column text-sol-action">
            <CalendarDays size={24} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] font-semibold leading-snug text-sol-ink">{dueLabel(lead.nextActionAt, locale)}</p>
            <p className={cn("sol-ui", lead.nextActionNote ? "text-sol-ink" : "text-sol-muted")}>
              {lead.nextActionNote ?? t("inbox.ws.followUp.noteless")}
            </p>
            {lead.followUp === "overdue" && (
              <Pill tone="critical" className="mt-1.5">
                {t("inbox.ws.followUp.overdue")}
              </Pill>
            )}
          </div>
        </div>
      ) : (
        <p className="sol-ui text-sol-muted">{t("inbox.ws.followUp.none")}</p>
      )}

      {canEdit && !editing && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => setEditing(true)} className={secondaryBtn}>
            <Pencil size={15} strokeWidth={1.9} className="text-sol-action" />
            {lead.nextActionAt ? t("inbox.ws.followUp.edit") : t("inbox.ws.followUp.schedule")}
          </button>
          {lead.nextActionAt && (
            <button
              type="button"
              onClick={onDone}
              className={cn(secondaryBtn, "border-sol-accent/60 bg-sol-accent/15 font-semibold hover:bg-sol-accent/25")}
            >
              <CircleCheck size={16} strokeWidth={1.9} className="text-sol-action" />
              {t("inbox.ws.followUp.done")}
            </button>
          )}
        </div>
      )}

      {canEdit && editing && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: t("inbox.followUp.tomorrow"), days: 1 },
              { label: t("inbox.followUp.in3"), days: 3 },
              { label: t("inbox.followUp.nextWeek"), days: 7 },
            ].map((o) => (
              <Button key={o.days} size="sm" onClick={() => setDate(madridDatePlus(new Date(), o.days))}>
                {o.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Labeled label={t("inbox.contact.date")}>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Labeled>
            <Labeled label={t("inbox.contact.time")}>
              <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Labeled>
          </div>
          <Labeled label={t("inbox.contact.action")}>
            <TextInput value={action} onChange={(e) => setAction(e.target.value)} placeholder={t("inbox.contact.actionPlaceholder")} />
          </Labeled>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              disabled={busy || !iso}
              onClick={() => {
                if (!iso) return;
                onRun(() => setFollowUp(lead.id, iso, action || null));
                setEditing(false);
              }}
            >
              {t("inbox.ws.followUp.save")}
            </Button>
            <Button onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
            {lead.nextActionAt && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  onRun(() => setFollowUp(lead.id, null, null));
                  setEditing(false);
                }}
              >
                {t("inbox.ws.followUp.remove")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function NotePanel({ lead, busy, onRun }: { lead: LeadDetail; busy: boolean; onRun: RunFn }) {
  const t = useT();
  const [note, setNote] = useState("");
  return (
    <Panel title={t("inbox.ws.note.title")}>
      <TextArea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("inbox.ws.note.placeholder")}
        aria-label={t("inbox.ws.note.title")}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={busy || !note.trim()}
          onClick={() => {
            onRun(() => logContact(lead.id, "note", { body: note.trim() }));
            setNote("");
          }}
          className={secondaryBtn}
        >
          <Save size={15} strokeWidth={1.9} className="text-sol-action" />
          {t("inbox.ws.note.save")}
        </button>
      </div>
    </Panel>
  );
}

// ─── Cliente y datos · contacto ──────────────────────────────────────────────

/**
 * Dos teléfonos independientes: el de WhatsApp (Zinto) y el de llamadas, con
 * su acción al lado y UN botón para guardarlos. Mientras no se configure uno
 * distinto, los dos empiezan con el recibido de Idealista, que se conserva
 * aparte como evidencia. Las acciones usan siempre el número GUARDADO.
 */
function ContactPanel({ lead, canEdit }: { lead: LeadDetail; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [zinto, setZinto] = useState(lead.zintoPhone ?? "");
  const [call, setCall] = useState(lead.callPhone ?? "");
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Tras guardar llega la ficha nueva: los campos vuelven a lo guardado.
  useEffect(() => {
    setZinto(lead.zintoPhone ?? "");
    setCall(lead.callPhone ?? "");
  }, [lead.zintoPhone, lead.callPhone]);

  const dirty = zinto.trim() !== (lead.zintoPhone ?? "") || call.trim() !== (lead.callPhone ?? "");
  const email = lead.linkedClient?.email ?? null;

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveLeadPhones(lead.id, { zinto, call });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      setMsg({ ok: true, text: t("inbox.ws.contact.saved") });
      router.refresh();
    });

  return (
    <Panel title={t("inbox.ws.contact.title")}>
      <div className="space-y-3">
        <div>
          <label htmlFor="ws-phone-zinto" className="mb-1.5 block sol-ui text-sol-ink">{t("inbox.ws.contact.zinto")}</label>
          <div className="flex gap-3">
            <TextInput
              id="ws-phone-zinto"
              value={zinto}
              onChange={(e) => setZinto(e.target.value)}
              inputMode="tel"
              autoComplete="off"
              readOnly={!canEdit}
              aria-describedby="ws-contact-received"
              className="min-w-0 flex-1"
            />
            {lead.zintoPhone ? (
              <WhatsAppLeadButton
                phone={lead.zintoPhone}
                name={lead.name}
                message={lead.message}
                propertyTitle={lead.propertyTitle}
                leadId={lead.id}
                size={16}
                label={t("inbox.zinto.openShort")}
                className={cn(secondaryBtn, "w-[150px] shrink-0 sm:w-[168px]")}
              />
            ) : null}
          </div>
        </div>
        <div>
          <label htmlFor="ws-phone-call" className="mb-1.5 block sol-ui text-sol-ink">{t("inbox.ws.contact.call")}</label>
          <div className="flex gap-3">
            <TextInput
              id="ws-phone-call"
              value={call}
              onChange={(e) => setCall(e.target.value)}
              inputMode="tel"
              autoComplete="off"
              readOnly={!canEdit}
              aria-describedby="ws-contact-received"
              className="min-w-0 flex-1"
            />
            {lead.callPhone ? (
              <a
                href={`tel:${telHref(lead.callPhone)}`}
                title={lead.callPhone}
                className={cn(secondaryBtn, "w-[150px] shrink-0 sm:w-[168px]")}
              >
                <Phone size={16} strokeWidth={1.9} className="text-sol-action" />
                {t("inbox.call")}
              </a>
            ) : null}
          </div>
        </div>
        {email && (
          <div>
            <label htmlFor="ws-email" className="mb-1.5 block sol-ui text-sol-ink">{t("inbox.ws.contact.email")}</label>
            <TextInput id="ws-email" value={email} readOnly />
          </div>
        )}
      </div>

      <p id="ws-contact-received" className="mt-2 sol-meta text-sol-muted">
        {lead.phone ? t("inbox.ws.contact.received", { phone: lead.phone }) : t("inbox.ws.contact.receivedNone")}
      </p>
      {lead.extraPhones.map((extra) => (
        <p key={extra} className="mt-1 flex flex-wrap items-center gap-x-2 sol-meta text-sol-muted">
          <span>{t("inbox.ws.contact.extra")}:</span>
          <span className="text-sol-ink">{extra}</span>
          <CopyPhoneButton phone={extra} />
        </p>
      ))}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={saving || !dirty} onClick={save} className={secondaryBtn}>
            <Save size={15} strokeWidth={1.9} className="text-sol-action" />
            {saving ? t("cc.saving") : t("inbox.ws.contact.save")}
          </button>
          <span role="status" aria-live="polite" className={cn("sol-meta", msg?.ok ? "text-sol-action" : "text-sol-error")}>
            {msg?.text ?? ""}
          </span>
        </div>
      ) : (
        <p className="mt-4 sol-meta text-sol-faint">{t("inbox.ws.contact.readOnly")}</p>
      )}
    </Panel>
  );
}

// ─── Cliente y datos · cliente en el CRM ─────────────────────────────────────

function ClientPanel({
  lead,
  country,
  canEdit,
}: {
  lead: LeadDetail;
  country: Country;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof findClientCandidates>> | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Al abrir una solicitud sin ficha se buscan coincidencias solas: el
  // asesor llega ya a "vincular a este" o "crear cliente", sin tener que
  // acordarse de pulsar el buscador. Solo lectura, así que es seguro.
  const unlinked = !(lead.clientId && lead.linkedClient);
  useEffect(() => {
    setCandidates(null);
    if (!canEdit || !unlinked) return;
    let cancelled = false;
    startLoad(async () => {
      const r = await findClientCandidates(lead.id);
      if (!cancelled) setCandidates(r);
    });
    return () => {
      cancelled = true;
    };
  }, [lead.id, canEdit, unlinked]);

  // Ya convertido: no se vuelve a emparejar ni se ofrece crear otro.
  if (lead.clientId && lead.linkedClient) {
    return (
      <Panel title={t("inbox.ws.client.title")}>
        <Pill tone="positive">
          <Check size={12} strokeWidth={2.2} />
          {t("inbox.ws.client.linked")}
        </Pill>
        <p className="mt-2 truncate text-[22px] font-semibold leading-snug text-sol-ink">{lead.linkedClient.fullName}</p>
        {lead.convertedAt && (
          <p className="sol-meta text-sol-muted">
            {t("inbox.client.convertedOn", { date: formatDate(lead.convertedAt, config.locale) })}
          </p>
        )}
        <Link href={`${config.prefix}/clientes/${lead.clientId}`} className={cn(linkCls, "mt-2")}>
          {t("inbox.ws.client.open")}
          <ArrowUpRight size={15} strokeWidth={2} />
        </Link>
      </Panel>
    );
  }

  return (
    <Panel
      title={t("inbox.ws.client.title")}
      action={
        canEdit && (!candidates || !candidates.ok) ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => startLoad(async () => setCandidates(await findClientCandidates(lead.id)))}
          >
            <Search size={11} strokeWidth={2} />
            {loading ? t("inbox.searching") : t("inbox.client.check")}
          </Button>
        ) : null
      }
    >
      {!candidates ? (
        <p className="sol-ui text-sol-muted">{loading ? t("inbox.searching") : t("inbox.client.notLinked")}</p>
      ) : !candidates.ok ? (
        <p className="sol-meta text-sol-error">{candidates.error}</p>
      ) : (
        <div className="space-y-3">
          {candidates.matches.length > 0 ? (
            <>
              <p className="sol-meta text-sol-muted">{t("inbox.client.possible")}</p>
              <ul className="space-y-1.5">
                {candidates.matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-sol-line px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate sol-ui font-semibold text-sol-ink">{m.fullName}</p>
                      <p className="truncate sol-meta text-sol-muted">
                        {t(`inbox.client.matchedBy.${m.matchedBy}`)} · {m.phone ?? m.email}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={saving}
                      onClick={() => {
                        setError(null);
                        startSave(async () => {
                          const r = await convertLeadToClient({ leadId: lead.id, existingClientId: m.id });
                          if (!r.ok) setError(r.error);
                          else router.refresh();
                        });
                      }}
                    >
                      {t("inbox.client.link")}
                    </Button>
                  </li>
                ))}
              </ul>
              {candidates.ambiguous && <p className="sol-meta text-sol-review-ink">{t("inbox.client.ambiguous")}</p>}
            </>
          ) : (
            <p className="sol-ui text-sol-muted">{t("inbox.client.noMatch")}</p>
          )}

          <CreateClientForm lead={lead} prefill={candidates.prefill} disabled={saving} onError={setError} />
          {error && <p className="sol-meta text-sol-error">{error}</p>}
        </div>
      )}
    </Panel>
  );
}

// ─── Cliente y datos · anuncio de origen ─────────────────────────────────────

/** Miniatura, referencia y vínculo; lo recibido de Idealista, bajo demanda. */
function OriginPanel({ lead }: { lead: LeadDetail }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const exact = lead.linkStatus === "exact" && !!lead.property;
  const cover = exact ? (lead.property?.coverUrl ?? lead.propertyImageUrl) : null;
  const title = exact ? lead.property?.title : null;
  const ref = (exact ? lead.property?.reference : null) ?? lead.propertyRef ?? lead.idealistaCode;

  return (
    <Panel title={t("inbox.ws.origin.title")}>
      <div className="flex gap-4">
        {cover && (
          <div className="relative aspect-[4/3] w-[136px] shrink-0 self-start overflow-hidden rounded-lg bg-sol-column sm:w-[168px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <div className="min-w-0">
          <p className="line-clamp-2 sol-ui font-semibold text-sol-ink">
            {title ?? (exact ? "—" : t("inbox.card.unknownListing"))}
          </p>
          {!exact && lead.propertyTitle && <p className="line-clamp-1 sol-meta text-sol-muted">{lead.propertyTitle}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sol-meta text-sol-muted">
            {ref && <span>{ref}</span>}
            {ref && <span aria-hidden>·</span>}
            <LinkLabel status={lead.linkStatus} />
          </p>
          <button type="button" onClick={() => setOpen(true)} className={cn(linkCls, "mt-1")}>
            {t("inbox.ws.origin.evidence")}
            <ArrowUpRight size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t("inbox.evidence.title")} footer={<Button onClick={() => setOpen(false)}>{t("reparto.result.close")}</Button>}>
          <EvidenceList lead={lead} />
        </Modal>
      )}
    </Panel>
  );
}

/** Lo que llegó de Idealista, tal cual. Es lo que permite revisar un vínculo. */
function EvidenceList({ lead }: { lead: LeadDetail }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-ink/50">{t("inbox.evidence.source")}</dt>
      <dd className="text-ink/85">Idealista</dd>
      <dt className="text-ink/50">{t("inbox.evidence.ref")}</dt>
      <dd className="text-ink/85">{lead.propertyRef ?? t("inbox.evidence.notReceived")}</dd>
      <dt className="text-ink/50">{t("inbox.evidence.code")}</dt>
      <dd className="text-ink/85">
        {lead.idealistaCode ?? t("inbox.evidence.notReceived")}
        {lead.previousPublicationCode && (
          <span className="block text-ink/55">
            {t("inbox.evidence.previousPublication", { code: lead.previousPublicationCode })}
          </span>
        )}
      </dd>
      <dt className="text-ink/50">{t("inbox.evidence.atEnquiry")}</dt>
      <dd className="text-ink/85">{[lead.propertyTitle, lead.propertyPrice].filter(Boolean).join(" · ") || "—"}</dd>
      <dt className="text-ink/50">{t("inbox.ws.evidence.phone")}</dt>
      <dd className="text-ink/85">{lead.phone ?? t("inbox.evidence.notReceived")}</dd>
      <dt className="text-ink/50">{t("inbox.evidence.link")}</dt>
      <dd>
        <LinkBadge status={lead.linkStatus} />
      </dd>
      <dt className="text-ink/50">{t("inbox.evidence.thread")}</dt>
      <dd>
        <a href={lead.idealistaThreadUrl} target="_blank" rel="noopener noreferrer" className="text-gold-dark underline-offset-2 hover:underline">
          {t("inbox.ws.thread")}
        </a>
      </dd>
    </dl>
  );
}

// ─── Descartar ───────────────────────────────────────────────────────────────

function DiscardDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={t("inbox.discardDialog.title")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {t("inbox.discard")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink/65">{t("inbox.discardDialog.intro")}</p>
      <Labeled label={t("inbox.discardDialog.reason")} className="mt-3">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required />
      </Labeled>
    </Modal>
  );
}

// ─── Duplicados ──────────────────────────────────────────────────────────────

function Duplicates({
  lead,
  canEdit,
  busy,
  onError,
  startBusy,
}: {
  lead: LeadDetail;
  canEdit: boolean;
  busy: boolean;
  onError: (e: string | null) => void;
  startBusy: (fn: () => Promise<void>) => void;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="rounded-lg border border-sol-line bg-sol-review px-4 py-3">
      <p className="sol-ui font-semibold text-sol-review-ink">
        {t("inbox.duplicate.title", { count: lead.duplicates.length })}
      </p>
      <p className="mt-0.5 sol-meta text-sol-muted">{t("inbox.duplicate.hint")}</p>
      <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto sol-meta text-sol-ink">
        {lead.duplicates.map((d) => (
          <li key={d.id} className="truncate">
            {d.name?.trim() || t("inbox.row.noName")}
            {d.propertyTitle ? ` · ${d.propertyTitle}` : ""}
          </li>
        ))}
      </ul>
      {canEdit && (
        <Button
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={() =>
            startBusy(async () => {
              onError(null);
              const r = await mergeSamePhoneLeads(lead.id);
              if (!r.ok) {
                onError(r.error);
                return;
              }
              // La unida puede ser esta misma: se abre la que sobrevive.
              const qs = new URLSearchParams(window.location.search);
              qs.set("lead", r.survivorId);
              router.replace(`?${qs.toString()}`, { scroll: false });
              router.refresh();
            })
          }
        >
          {t("inbox.duplicate.merge", { count: lead.duplicates.length + 1 })}
        </Button>
      )}
    </div>
  );
}

// ─── Buscar el anuncio (revisar vínculo) ─────────────────────────────────────

function PropertyPicker({
  leadId,
  onDone,
  onRun,
}: {
  leadId: string;
  onDone: () => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; title: string; reference: string | null }>
  >([]);
  const [searching, start] = useTransition();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      start(async () => setResults(await searchPropertiesForLead(q)));
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  // «Revisar vínculo» es una corrección con evidencia: sin motivo no se
  // puede elegir. El anuncio consultado queda en el historial (auditoría).
  return (
    <div className="mt-3 space-y-2 border-t border-ink/8 pt-3">
      <p className="text-xs text-ink/55">{t("inbox.property.reviewHint")}</p>
      <Labeled label={t("inbox.property.reviewReason")}>
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("inbox.property.reviewReasonPlaceholder")} />
      </Labeled>
      <TextInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("inbox.property.searchPlaceholder")}
        aria-label={t("inbox.property.searchPlaceholder")}
      />
      {searching && <p className="text-xs text-ink/40">{t("inbox.searching")}</p>}
      {results.length > 0 && (
        <ul className="max-h-52 space-y-1 overflow-y-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={() => {
                  onRun(() => matchLeadProperty(leadId, p.id, reason));
                  onDone();
                }}
                className="flex w-full items-center justify-between gap-2 rounded border border-ink/8 px-2.5 py-1.5 text-left text-xs transition hover:border-gold/45 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-ink">{p.title}</span>
                {p.reference && (
                  <span className="shrink-0 text-xs text-ink/40">{p.reference}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!reason.trim() && results.length > 0 && (
        <p className="text-xs text-amber-700">{t("inbox.property.reasonFirst")}</p>
      )}
    </div>
  );
}

// ─── Crear cliente ───────────────────────────────────────────────────────────

function CreateClientForm({
  lead,
  prefill,
  disabled,
  onError,
}: {
  lead: LeadDetail;
  prefill: { name: string; email: string; phone: string };
  disabled: boolean;
  onError: (e: string | null) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(prefill);
  const [saving, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <UserPlus size={11} strokeWidth={2} />
        {t("inbox.client.create")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded border border-ink/10 p-3">
      <TextInput
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
        placeholder={t("cc.editClient.name")}
        autoFocus
      />
      <TextInput
        value={f.phone}
        onChange={(e) => setF({ ...f, phone: e.target.value })}
        placeholder={t("cc.editClient.phone")}
        inputMode="tel"
      />
      <TextInput
        value={f.email}
        onChange={(e) => setF({ ...f, email: e.target.value })}
        placeholder={t("inbox.client.emailOptional")}
        inputMode="email"
      />
      <p className="text-xs leading-relaxed text-ink/40">
        {t("inbox.client.emailHint")}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setOpen(false)} disabled={saving}>
          {t("cc.cancel")}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={saving || !f.name.trim()}
          onClick={() => {
            onError(null);
            start(async () => {
              const r = await convertLeadToClient({ leadId: lead.id, newClient: f });
              if (!r.ok) onError(r.error);
              else router.refresh();
            });
          }}
        >
          {saving ? t("cc.saving") : t("inbox.client.create")}
        </Button>
      </div>
    </div>
  );
}

// ─── Copiar teléfono ─────────────────────────────────────────────────────────

/** Copia el número tal cual está; el aviso "Copiado" dura un instante. */
function CopyPhoneButton({ phone }: { phone: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      // Sin permiso de portapapeles (http, iframe…): vía antigua.
      const ta = document.createElement("textarea");
      ta.value = phone;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={t("inbox.phone.copy")}
      title={copied ? t("inbox.phone.copied") : t("inbox.phone.copy")}
      className={cn(
        "inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-ink/15 bg-white text-ink/55 transition hover:border-gold/50 hover:text-ink",
        copied && "border-emerald-300 text-emerald-700",
      )}
    >
      {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={2} />}
    </button>
  );
}

// ─── Estado de WhatsApp por Zinto ────────────────────────────────────────────

/**
 * Dice de un vistazo si a esta persona ya se le escribió por Zinto. Abrir el
 * chat no es escribir, así que se distingue: "chat abierto" (aviso) frente a
 * "escrito" (hecho). Si se le escribió desde fuera del portal, un botón lo
 * deja anotado en el historial.
 */
function ZintoStatus({
  lead,
  locale,
  canEdit,
  busy,
  onRun,
}: {
  lead: LeadDetail;
  locale: string;
  canEdit: boolean;
  busy: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const t = useT();
  const wa = lead.whatsapp;
  const manual = lead.activity.find((a) => a.kind === "whatsapp");

  if (wa.outbound > 0) {
    const replied = wa.inbound > 0;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <Pill tone={wa.awaitingReply ? "warning" : replied ? "positive" : "info"}>
          {wa.awaitingReply
            ? t("inbox.zinto.awaitingReply")
            : replied
              ? t("inbox.zinto.replied")
              : t("inbox.zinto.sent")}
        </Pill>
        {wa.firstOutboundAt && (
          <span className="text-ink/40">
            <RelativeTime at={wa.firstOutboundAt} locale={locale} />
          </span>
        )}
      </span>
    );
  }

  if (manual) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <Pill tone="info">{t("inbox.zinto.sentManual")}</Pill>
        <span className="text-ink/40">
          <RelativeTime at={manual.createdAt} locale={locale} />
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {wa.conversationId && <Pill tone="warning">{t("inbox.zinto.openedOnly")}</Pill>}
      {canEdit && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onRun(() => logContact(lead.id, "whatsapp"))}
        >
          <Check size={11} strokeWidth={2} />
          {t("inbox.zinto.markSent")}
        </Button>
      )}
    </span>
  );
}
