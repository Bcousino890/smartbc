"use client";

// ============================================================================
// LEAD WORKSPACE — la ficha de una solicitud (página propia, Figma A02).
//
// Todo lo que hace falta para trabajar un lead, sin abrir un modal por acción y
// sin salir de la pantalla. El orden responde a cómo se trabaja de verdad:
//
//   quién es → qué pidió → qué piso → cómo le hablo → quién es en el CRM
//   → cuándo vuelvo → qué ha pasado
//
// Las capacidades protegidas se REUTILIZAN tal cual: el botón de WhatsApp y
// "Preparar visitas" son los mismos componentes de siempre.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Globe,
  Languages,
  MoreHorizontal,
  Phone,
  Search,
  UserPlus,
} from "lucide-react";
import { REASON_PRIORITY } from "@/lib/sales-inbox/types";
import { fichaActions } from "@/lib/sales-inbox/views";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type { StaffRef } from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { PrepareVisitsButton } from "@/components/admin/viewing-collections/prepare-visits-button";
import {
  Button,
  Empty,
  Labeled,
  Modal,
  Panel,
  Pill,
  TextArea,
  TextInput,
  type Tone,
} from "@/components/admin/ui/primitives";
import { LeadAvatar } from "./lead-avatar";
import { LinkBadge } from "./lead-card";
import { OwnerControl } from "./owner-control";
import { RegisterContactDialog } from "./register-contact-dialog";
import { formatDate, formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { translateLeadMessage } from "../actions";
import {
  convertLeadToClient,
  findClientCandidates,
  logContact,
  matchLeadProperty,
  mergeSamePhoneLeads,
  searchPropertiesForLead,
  setFollowUp,
  setLeadDiscarded,
  snoozeFollowUp,
} from "../inbox-actions";
import { WhatsAppLeadButton } from "../whatsapp-lead-button";

const STATE_TONE: Record<string, Tone> = {
  new: "neutral",
  contacted: "info",
  engaged: "positive",
  converted: "gold",
  discarded: "neutral",
};

export type WorkspaceTab = "summary" | "activity" | "client";

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
  const [contactOpen, setContactOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startBusy(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? t("inbox.error.generic"));
      else router.refresh();
    });
  };

  const TABS: Array<{ id: WorkspaceTab; label: string; count?: number }> = [
    { id: "summary", label: t("inbox.tab.summary") },
    { id: "activity", label: t("inbox.tab.activity"), count: lead.activity.length },
    { id: "client", label: t("inbox.tab.client") },
  ];
  const name = lead.name?.trim() || t("inbox.row.noName");
  const back = backLabel ?? t("inbox.backToList");
  const listingRef = lead.propertyRef ?? lead.idealistaCode;
  // Las acciones de trabajo no dependen del estado (cliente vinculado o
  // descartada siguen pudiendo contactarse): ver `fichaActions`.
  const actions = fichaActions(lead, canEdit);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ── Miga y vuelta ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="hidden min-w-0 truncate text-sm text-sol-muted sm:block">
          {onClose ? (
            <button type="button" onClick={onClose} className="hover:text-sol-action hover:underline">
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
              className="inline-flex min-h-[44px] items-center gap-1 sol-ui font-semibold text-sol-action sm:hidden"
            >
              <ChevronLeft size={18} strokeWidth={2.2} /> {back}
            </button>
            <Button onClick={onClose} className="hidden shrink-0 sm:inline-flex sm:min-w-[200px]">
              {back}
            </Button>
          </>
        )}
      </div>

      {/* ── Cabecera: persona, responsable y conversación ── */}
      <header className="mt-3 flex flex-col gap-5 border-b border-sol-line pb-6 lg:flex-row lg:items-start lg:justify-between">
        {/* La foto va DENTRO del bloque de identidad: con justify-between, un
            tercer hijo empujaría el nombre al centro. */}
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {lead.avatarUrl && (
            <LeadAvatar
              src={lead.avatarUrl}
              name={lead.name}
              className="mt-1 h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-sol-line"
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <h1 className="min-w-0 break-words sol-name font-bold leading-tight text-sol-ink">{name}</h1>
              <Pill tone={STATE_TONE[lead.state] ?? "neutral"}>{t(`inbox.state.${lead.state}`)}</Pill>
              {lead.isInternational && (
                <Globe size={16} strokeWidth={1.8} className="shrink-0 text-sol-faint" aria-label={t("inbox.filter.international")} />
              )}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 sol-ui text-sol-muted">
              <span>{t("inbox.source.idealista")}</span>
              <span aria-hidden>·</span>
              <RelativeTime at={lead.createdAt} locale={config.locale} />
              {listingRef && (
                <>
                  <span aria-hidden>·</span>
                  <span>{listingRef}</span>
                </>
              )}
              {lead.suggestedType && !lead.leadType && (
                <Pill tone="neutral" className="ms-1">
                  {t("inbox.type.suggested", { type: t(`inbox.type.${lead.suggestedType}`) })}
                </Pill>
              )}
              {lead.leadType && <Pill tone="neutral" className="ms-1">{t(`inbox.type.${lead.leadType}`)}</Pill>}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start lg:w-auto lg:shrink-0">
          <OwnerControl lead={lead} staff={staff} isAdmin={isAdmin} />
          {/* Abrir Zinto NO registra contacto: eso solo lo hace «Registrar
              contacto». */}
          {actions.openZinto && lead.phone && (
            <WhatsAppLeadButton
              phone={lead.phone}
              name={lead.name}
              message={lead.message}
              propertyTitle={lead.propertyTitle}
              leadId={lead.id}
              size={16}
              label={t("inbox.zinto.open")}
              className="hidden min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-sol-action px-6 sol-ui font-semibold text-sol-on-action transition hover:bg-sol-action-strong disabled:opacity-50 lg:inline-flex xl:min-w-[300px]"
            />
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-sol-error/30 bg-sol-error-bg px-4 py-3 text-sm text-sol-error">
          {error}
        </p>
      )}

      {/* Pestañas */}
      <div role="tablist" aria-label={t("inbox.tab.label")} className="-mx-4 mt-6 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`ws-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls={`ws-panel-${x.id}`}
            onClick={() => setTab(x.id)}
            className={cn(
              "inline-flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-6 sol-ui font-semibold transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-action",
              tab === x.id
                ? "border-sol-action bg-sol-action text-sol-on-action"
                : "border-sol-line bg-sol-surface text-sol-ink hover:border-sol-action/40",
            )}
          >
            {x.label}
            {x.count ? <span className={tab === x.id ? "opacity-80" : "text-sol-muted"}>{x.count}</span> : null}
          </button>
        ))}
      </div>

      {/* ── Cuerpo ── */}
      <div
        role="tabpanel"
        id={`ws-panel-${tab}`}
        aria-labelledby={`ws-tab-${tab}`}
        className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,486px)]"
      >
        {tab === "summary" && (
          <>
            <div className="flex min-w-0 flex-col gap-6">
              <Enquiry lead={lead} />
              {/* En móvil, el anuncio va antes que el mensaje (Figma D01). */}
              <div className="max-lg:order-first">
                <PropertyContext lead={lead} country={country} canEdit={canEdit} onRun={run} busy={busy} />
              </div>
              <OtherEnquiries lead={lead} />
              <ClientSummary lead={lead} onOpen={() => setTab("client")} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <NextStep
                lead={lead}
                locale={config.locale}
                canEdit={canEdit}
                busy={busy}
                onRegister={() => setContactOpen(true)}
                onDiscard={() => setDiscardOpen(true)}
                onRestore={() => run(() => setLeadDiscarded(lead.id, false))}
                onRun={run}
              />
              <Activity lead={lead} locale={config.locale} recent onSeeAll={() => setTab("activity")} />
            </div>
          </>
        )}

        {tab === "activity" && (
          <>
            <div className="flex min-w-0 flex-col gap-6">
              {canEdit && <FollowUp lead={lead} locale={config.locale} onRun={run} busy={busy} />}
              {canEdit && <ContactLog lead={lead} onRun={run} busy={busy} />}
              {!canEdit && <Activity lead={lead} locale={config.locale} />}
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              {canEdit && <Activity lead={lead} locale={config.locale} />}
              <AssignmentHistory lead={lead} locale={config.locale} />
            </div>
          </>
        )}

        {tab === "client" && (
          <>
            <div className="flex min-w-0 flex-col gap-6">
              {lead.duplicates.length > 0 && (
                <Duplicates lead={lead} canEdit={canEdit} busy={busy} onError={setError} startBusy={startBusy} />
              )}
              <ClientSection lead={lead} country={country} canEdit={canEdit} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <Evidence lead={lead} />
            </div>
          </>
        )}
      </div>

      {/* Móvil: la acción principal siempre a mano (Figma D01). */}
      {(actions.registerContact || actions.openZinto) && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-sol-line bg-sol-surface px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden">
          {actions.registerContact && (
            <Button variant="primary" onClick={() => setContactOpen(true)} className="w-full">
              {t("inbox.contact.open")}
            </Button>
          )}
          {actions.openZinto && lead.phone && (
            <WhatsAppLeadButton
              phone={lead.phone}
              name={lead.name}
              message={lead.message}
              propertyTitle={lead.propertyTitle}
              leadId={lead.id}
              size={16}
              label={t("inbox.zinto.openShort")}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-sol-line bg-sol-surface px-4 sol-ui font-semibold text-sol-ink disabled:opacity-50"
            />
          )}
        </div>
      )}

      {contactOpen && (
        <RegisterContactDialog lead={lead} locale={config.locale} onClose={() => setContactOpen(false)} />
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

// ─── Siguiente paso ──────────────────────────────────────────────────────────

/**
 * UN siguiente paso, con su porqué, y las acciones de trabajo: registrar el
 * contacto (la única que lo da por hecho), llamar y lo infrecuente.
 */
function NextStep({
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
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const t = useT();
  const sorted = lead.reasons.slice().sort((a, b) => REASON_PRIORITY[a] - REASON_PRIORITY[b]);
  const top = sorted.find((r) => REASON_PRIORITY[r] <= 2);
  const hints = sorted.filter((r) => REASON_PRIORITY[r] === 3);
  const closed = lead.state === "converted" || lead.state === "discarded";

  return (
    <Panel title={t("inbox.next.title")}>
      {top && !closed && (
        <Pill tone={REASON_PRIORITY[top] === 1 ? "critical" : "warning"} className="mb-3">
          {t(`inbox.reason.${top}`)}
        </Pill>
      )}
      {closed ? (
        <p className="text-lg leading-relaxed text-sol-muted">{t(`inbox.next.closed.${lead.state}`)}</p>
      ) : top ? (
        <p className="text-lg leading-relaxed text-sol-ink">{t(`inbox.next.do.${top}`)}</p>
      ) : lead.nextActionAt ? (
        <p className="text-lg leading-relaxed text-sol-ink">
          {t("inbox.next.scheduled", { when: formatDateTime(lead.nextActionAt, locale) })}
          {lead.nextActionNote ? ` · ${lead.nextActionNote}` : ""}
        </p>
      ) : (
        <p className="text-lg leading-relaxed text-sol-muted">{t("inbox.next.none")}</p>
      )}
      {top && lead.nextActionAt && (
        <p className="mt-1 text-sm text-sol-muted">
          {formatDateTime(lead.nextActionAt, locale)}
          {lead.nextActionNote ? ` · ${lead.nextActionNote}` : ""}
        </p>
      )}

      <div className="mt-6 space-y-3">
        {fichaActions(lead, canEdit).registerContact && (
          <Button variant="primary" onClick={onRegister} className="w-full !min-h-[48px]">
            <ClipboardCheck size={16} strokeWidth={2} />
            {t("inbox.contact.open")}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {lead.phone ? (
            <a
              href={`tel:${lead.phone.replace(/\s/g, "")}`}
              title={lead.phone}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-sol-line bg-sol-surface px-3 sol-ui font-semibold text-sol-ink transition hover:border-sol-action/40"
            >
              <Phone size={15} strokeWidth={2} className="text-sol-action" />
              {t("inbox.call")}
            </a>
          ) : (
            <span className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-sol-review px-3 text-center text-sm font-semibold text-sol-review-ink">
              {t("inbox.reason.missing_contact")}
            </span>
          )}
          <MoreActions
            lead={lead}
            canEdit={canEdit}
            busy={busy}
            onDiscard={onDiscard}
            onRestore={onRestore}
          />
        </div>
      </div>
      <p className="mt-3 sol-meta text-sol-muted">{t("inbox.contact.notByOpening")}</p>

      {lead.phone && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-sol-line pt-4">
          <span className="font-mono text-sm text-sol-ink">{lead.phone}</span>
          <CopyPhoneButton phone={lead.phone} />
          <ZintoStatus lead={lead} locale={locale} canEdit={canEdit} busy={busy} onRun={onRun} />
        </div>
      )}
      {hints.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-sol-line pt-4">
          {hints.map((h) => (
            <li key={h}><Pill tone="neutral">{t(`inbox.reason.${h}`)}</Pill></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Datos del cliente (resumen) ─────────────────────────────────────────────

function ClientSummary({ lead, onOpen }: { lead: LeadDetail; onOpen: () => void }) {
  const t = useT();
  return (
    <Panel title={t("inbox.clientCard.title")}>
      <p className="text-base text-sol-ink">
        {lead.linkedClient
          ? t("inbox.clientCard.linked", { name: lead.linkedClient.fullName })
          : t("inbox.clientCard.none")}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 text-left sol-ui font-semibold text-sol-action underline-offset-2 hover:underline"
      >
        {t("inbox.clientCard.more")}
      </button>
    </Panel>
  );
}

// ─── Más acciones ────────────────────────────────────────────────────────────

/** Lo infrecuente, fuera de la vista: anuncio original y descartar. */
function MoreActions({
  lead,
  canEdit,
  busy,
  onDiscard,
  onRestore,
}: {
  lead: LeadDetail;
  canEdit: boolean;
  busy: boolean;
  onDiscard: () => void;
  onRestore: () => void;
}) {
  const t = useT();
  return (
    <details className="relative">
      <summary className="inline-flex min-h-[44px] w-full cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-sol-line bg-sol-surface px-3 sol-ui font-semibold text-sol-ink transition hover:border-sol-action/40 [&::-webkit-details-marker]:hidden">
        <MoreHorizontal size={16} /> {t("inbox.more")}
      </summary>
      <div className="absolute end-0 z-20 mt-2 w-64 rounded-xl border border-sol-line bg-sol-surface p-1.5 shadow-lg">
        <a
          href={lead.idealistaThreadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-3 text-sm text-sol-ink hover:bg-sol-select"
        >
          {t("inbox.openThread")}
          <ExternalLink size={11} strokeWidth={2} />
        </a>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={lead.state === "discarded" ? onRestore : onDiscard}
            className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm text-sol-ink hover:bg-sol-select disabled:opacity-50"
          >
            {lead.state === "discarded" ? t("inbox.restore") : t("inbox.discardWithReason")}
          </button>
        )}
      </div>
    </details>
  );
}

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
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
      <p className="text-xs font-medium text-amber-800">
        {t("inbox.duplicate.title", { count: lead.duplicates.length })}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-amber-800/70">{t("inbox.duplicate.hint")}</p>
      <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900/80">
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

// ─── Evidencia del origen ────────────────────────────────────────────────────

/** Lo que llegó de Idealista, tal cual. Es lo que permite revisar un vínculo. */
function Evidence({ lead }: { lead: LeadDetail }) {
  const t = useT();
  return (
    <Panel title={t("inbox.evidence.title")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-ink/45">{t("inbox.evidence.source")}</dt>
        <dd className="text-ink/80">Idealista</dd>
        <dt className="text-ink/45">{t("inbox.evidence.ref")}</dt>
        <dd className="text-ink/80">{lead.propertyRef ?? t("inbox.evidence.notReceived")}</dd>
        <dt className="text-ink/45">{t("inbox.evidence.code")}</dt>
        <dd className="text-ink/80">
          {lead.idealistaCode ?? t("inbox.evidence.notReceived")}
          {lead.previousPublicationCode && (
            <span className="block text-ink/50">
              {t("inbox.evidence.previousPublication", { code: lead.previousPublicationCode })}
            </span>
          )}
        </dd>
        <dt className="text-ink/45">{t("inbox.evidence.atEnquiry")}</dt>
        <dd className="text-ink/80">{[lead.propertyTitle, lead.propertyPrice].filter(Boolean).join(" · ") || "—"}</dd>
        <dt className="text-ink/45">{t("inbox.evidence.link")}</dt>
        <dd><LinkBadge status={lead.linkStatus} /></dd>
        <dt className="text-ink/45">{t("inbox.evidence.thread")}</dt>
        <dd>
          <a href={lead.idealistaThreadUrl} target="_blank" rel="noopener noreferrer" className="text-gold-dark underline-offset-2 hover:underline">
            {t("inbox.openThread")}
          </a>
        </dd>
      </dl>
    </Panel>
  );
}

// ─── Historial de responsable ────────────────────────────────────────────────

function AssignmentHistory({ lead, locale }: { lead: LeadDetail; locale: string }) {
  const t = useT();
  if (lead.assignmentHistory.length === 0) return null;
  return (
    <Panel title={t("inbox.history.title")} count={lead.assignmentHistory.length}>
      <ul className="space-y-2">
        {lead.assignmentHistory.map((e) => (
          <li key={e.id} className="text-xs">
            <p className="text-ink/80">
              {t(`inbox.history.kind.${e.kind}`)}
              {(e.previousName || e.newName) && (
                <span className="text-ink/55"> · {e.previousName ?? "—"} → {e.newName ?? "—"}</span>
              )}
              {e.reason && <span className="text-ink/50"> · {e.reason}</span>}
            </p>
            <p className="text-ink/40">
              {formatDateTime(e.occurredAt, locale)} · {e.actorName ?? t("inbox.history.system")}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ─── Consulta original ───────────────────────────────────────────────────────

function Enquiry({ lead }: { lead: LeadDetail }) {
  const t = useT();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pending, start] = useTransition();

  if (!lead.message && lead.profileBullets.length === 0 && !lead.profilePresentation) {
    return null;
  }

  return (
    <Panel
      title={t("inbox.enquiry.title")}
      action={
        lead.message ? (
          <Button
            size="sm"
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
          >
            <Languages size={11} strokeWidth={1.9} />
            {translated
              ? showOriginal
                ? t("inbox.enquiry.showTranslation")
                : t("inbox.enquiry.showOriginal")
              : pending
                ? t("inbox.enquiry.translating")
                : t("inbox.enquiry.translate")}
          </Button>
        ) : null
      }
    >
      {lead.message && (
        <p className="whitespace-pre-line text-lg leading-relaxed text-sol-ink md:text-xl">
          {translated && !showOriginal ? translated : lead.message}
        </p>
      )}
      {translated && !showOriginal && (
        <p className="mt-1.5 text-xs text-ink/35">{t("inbox.enquiry.machine")}</p>
      )}
      {/* La extensión separa la presentación del resto de viñetas del perfil;
          `getLeadDetail` ya la bajaba pero aquí nunca se pintaba. */}
      {lead.profilePresentation && (
        <div className="mt-6">
          <p className="crm-label-sm text-sol-muted">{t("inbox.enquiry.presentation")}</p>
          <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-sol-ink">
            {lead.profilePresentation}
          </p>
        </div>
      )}
      {lead.profileBullets.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {lead.profileBullets.map((b, i) => (
            <li key={i}>
              <Pill tone="positive">{b}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Propiedad ───────────────────────────────────────────────────────────────

/**
 * Los demás pisos por los que preguntó en el MISMO hilo.
 *
 * La ingesta los guarda todos (`idealista_leads.properties`) y `getLeadDetail`
 * ya los baja, pero la bandeja no los pintaba: se enseñaba solo la tarjeta
 * principal, así que un contacto que preguntó por tres pisos parecía interesado
 * en uno. El emparejamiento tampoco los mira, y por eso al lado de cada uno se
 * dice su precio: es lo que permite ver de un vistazo si el hilo mezcla venta y
 * alquiler.
 */
function OtherEnquiries({ lead }: { lead: LeadDetail }) {
  const t = useT();
  if (lead.properties.length <= 1) return null;

  return (
    <Panel title={t("inbox.otherEnquiries.title")} count={lead.properties.length}>
      <ul className="space-y-1.5">
        {lead.properties.map((p, i) => (
          <li
            key={`${p.title ?? ""}-${i}`}
            className="flex items-center gap-2.5 rounded-md border border-ink/8 bg-ink/[0.02] px-2.5 py-1.5"
          >
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="h-9 w-12 shrink-0 rounded object-cover"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-ink/70">
              {p.title ?? t("inbox.row.noProperty")}
            </span>
            {p.price && (
              <span className="shrink-0 text-xs tabular-nums text-ink/45">{p.price}</span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PropertyContext({
  lead,
  country,
  canEdit,
  onRun,
  busy,
}: {
  lead: LeadDetail;
  country: Country;
  canEdit: boolean;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  busy: boolean;
}) {
  const t = useT();
  const config = getCountryConfig(country);
  const [matching, setMatching] = useState(false);

  const exact = lead.linkStatus === "exact";
  // Identificadores recibidos: «Idealista: Cod. | Ref.» como en el Figma.
  const ids = [lead.idealistaCode && `${t("inbox.source.idealista")}: ${lead.idealistaCode}`, lead.propertyRef]
    .filter(Boolean)
    .join("  |  ");
  const btn =
    "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-sol-line bg-sol-surface px-4 sol-ui font-semibold text-sol-ink transition hover:border-sol-action/40";
  const primaryBtn =
    "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-sol-action px-4 sol-ui font-semibold text-sol-on-action transition hover:bg-sol-action-strong";

  // Sin vínculo exacto NO se enseña ningún inmueble: ni foto ni ficha de un
  // piso «parecido». Solo lo que llegó de Idealista, tal cual, y la manera de
  // identificarlo (vincular con motivo, o importar).
  if (!exact || !lead.property) {
    return (
      <Panel title={t("inbox.property.title")} action={<LinkBadge status={lead.linkStatus} />}>
        <p className="text-[22px] font-semibold leading-snug text-sol-ink">{t("inbox.card.unknownListing")}</p>
        <p className="mt-2 text-sm text-sol-review-ink">
          {lead.linkStatus === "conflict" ? t("inbox.property.conflictHint") : t("inbox.property.noEvidence")}
        </p>
        {(lead.propertyTitle || lead.propertyPrice) && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
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
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={lead.idealistaThreadUrl} target="_blank" rel="noopener noreferrer" className={btn}>
            {t("inbox.openThread")}
            <ExternalLink size={13} strokeWidth={2} />
          </a>
          {canEdit && (
            <>
              <button type="button" className={btn} onClick={() => setMatching((v) => !v)}>
                <Search size={14} strokeWidth={2} />
                {t("inbox.property.match")}
              </button>
              <Link href={`${config.prefix}/propiedades/importar`} className={btn}>
                {t("inbox.property.import")}
                <ArrowUpRight size={13} strokeWidth={2} />
              </Link>
            </>
          )}
        </div>
        <p className="mt-3 text-sm text-sol-muted">{t("inbox.property.visitNeedsExact")}</p>
        {matching && canEdit && (
          <PropertyPicker leadId={lead.id} onDone={() => setMatching(false)} onRun={onRun} />
        )}
      </Panel>
    );
  }

  const p = lead.property;
  // Una ficha propia se abre en /propiedades/[slug]; un anuncio de Idealista
  // sin ficha propia (las "inspo") vive en /idealista.
  const href = p.slug ? `${config.prefix}/propiedades/${p.slug}` : `${config.prefix}/idealista`;
  const cover = p.coverUrl ?? lead.propertyImageUrl;
  return (
    <Panel title={t("inbox.property.title")} action={<LinkBadge status={lead.linkStatus} />}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="relative aspect-[4/3] w-full shrink-0 self-start overflow-hidden rounded-lg bg-sol-column sm:w-[212px]">
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
          <Link href={href} className="block text-[22px] font-semibold leading-snug text-sol-ink hover:underline">
            {p.title ?? "—"}
          </Link>
          {p.price !== null && (
            <p className="mt-1 text-[22px] font-semibold leading-snug tabular-nums text-sol-ink">
              {config.formatPrice(p.price, null, p.operation)}
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sol-ui text-sol-muted">
            {p.zone && <span>{p.zone}</span>}
            {p.reference && <span>· {p.reference}</span>}
            {p.status && (
              <Pill tone={p.status === "available" ? "positive" : "warning"}>
                {t(`inbox.property.status.${p.status}`)}
              </Pill>
            )}
            {p.source === "listing" && <Pill tone="info">{t("inbox.property.fromListing")}</Pill>}
          </p>
          {ids && <p className="mt-2 text-sm font-semibold text-sol-action">{ids}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            {/* El anuncio EXACTO en idealista.com (por su código); la
                conversación, aparte. */}
            {lead.adUrl && (
              <a href={lead.adUrl} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
                {t("inbox.property.openAd")}
                <ExternalLink size={13} strokeWidth={2} />
              </a>
            )}
            <a href={lead.idealistaThreadUrl} target="_blank" rel="noopener noreferrer" className={btn}>
              {t("inbox.openThread")}
              <ExternalLink size={13} strokeWidth={2} />
            </a>
            <PrepareVisitsButton source="idealista" sourceId={lead.id} compact />
            <Link href={href} className="inline-flex min-h-[40px] items-center gap-1 px-1 text-sm font-semibold text-sol-action hover:underline">
              {t("inbox.property.open")}
              <ArrowUpRight size={13} strokeWidth={2} />
            </Link>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setMatching((v) => !v)}
              className="mt-3 text-sm font-semibold text-sol-muted underline-offset-2 hover:text-sol-action hover:underline"
            >
              {t("inbox.property.review")}
            </button>
          )}
        </div>
      </div>
      {matching && canEdit && (
        <PropertyPicker leadId={lead.id} onDone={() => setMatching(false)} onRun={onRun} />
      )}
    </Panel>
  );
}

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

// ─── Cliente ─────────────────────────────────────────────────────────────────

function ClientSection({
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
  const [candidates, setCandidates] = useState<Awaited<
    ReturnType<typeof findClientCandidates>
  > | null>(null);
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
      <Panel title={t("inbox.client.title")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {lead.linkedClient.fullName}
            </p>
            <p className="truncate text-xs text-ink/45">{lead.linkedClient.email}</p>
            {lead.convertedAt && (
              <p className="mt-0.5 text-xs text-ink/35">
                {t("inbox.client.convertedOn", {
                  date: formatDate(lead.convertedAt, config.locale),
                })}
              </p>
            )}
          </div>
          <Link
            href={`${config.prefix}/clientes/${lead.clientId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 transition hover:bg-ink-soft"
          >
            {t("inbox.client.openCommandCenter")}
            <ArrowUpRight size={11} strokeWidth={2} className="text-gold" />
          </Link>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={t("inbox.client.title")}
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
        <p className="text-xs text-ink/45">
          {loading ? t("inbox.searching") : t("inbox.client.notLinked")}
        </p>
      ) : !candidates.ok ? (
        <p className="text-xs text-rose-600">{candidates.error}</p>
      ) : (
        <div className="space-y-3">
          {candidates.matches.length > 0 ? (
            <>
              <p className="crm-label-sm text-ink/45">
                {t("inbox.client.possible")}
              </p>
              <ul className="space-y-1">
                {candidates.matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded border border-ink/10 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{m.fullName}</p>
                      <p className="truncate text-xs text-ink/45">
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
                          const r = await convertLeadToClient({
                            leadId: lead.id,
                            existingClientId: m.id,
                          });
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
              {candidates.ambiguous && (
                <p className="text-xs leading-relaxed text-amber-700">
                  {t("inbox.client.ambiguous")}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-ink/45">{t("inbox.client.noMatch")}</p>
          )}

          <CreateClientForm
            lead={lead}
            prefill={candidates.prefill}
            disabled={saving}
            onError={setError}
          />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </Panel>
  );
}

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

// ─── Registro de contacto ────────────────────────────────────────────────────

/**
 * Notas sueltas desde Actividad. Los resultados de contacto (habló, no
 * contesta, email…) se registran con «Registrar contacto», con su tarea.
 */
function ContactLog({
  lead,
  onRun,
  busy,
}: {
  lead: LeadDetail;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  busy: boolean;
}) {
  const t = useT();
  const [note, setNote] = useState("");

  return (
    <Panel title={t("inbox.notes.title")}>
      <div className="flex gap-2">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("inbox.log.notePlaceholder")}
          aria-label={t("inbox.notes.title")}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={busy || !note.trim()}
          onClick={() => {
            onRun(() => logContact(lead.id, "note", { body: note.trim() }));
            setNote("");
          }}
        >
          {t("inbox.log.add")}
        </Button>
      </div>
    </Panel>
  );
}

// ─── Seguimiento ─────────────────────────────────────────────────────────────

function FollowUp({
  lead,
  locale,
  onRun,
  busy,
}: {
  lead: LeadDetail;
  locale: string;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  busy: boolean;
}) {
  const t = useT();
  const [note, setNote] = useState(lead.nextActionNote ?? "");

  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };

  return (
    <Panel title={t("inbox.followUp.title")}>
      {lead.nextActionAt ? (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={lead.followUp === "overdue" ? "critical" : "info"}>
            {formatDateTime(lead.nextActionAt, locale)}
          </Pill>
          {lead.nextActionNote && (
            <span className="text-xs text-ink/60">{lead.nextActionNote}</span>
          )}
          <div className="ms-auto flex gap-1.5">
            <Button size="sm" disabled={busy} onClick={() => onRun(() => snoozeFollowUp(lead.id, 1))}>
              {t("inbox.followUp.snooze1")}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onRun(() => snoozeFollowUp(lead.id, 7))}>
              {t("inbox.followUp.snooze7")}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onRun(() => setFollowUp(lead.id, null, null))}
            >
              <Check size={11} strokeWidth={2} />
              {t("inbox.followUp.done")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              { label: t("inbox.followUp.tomorrow"), days: 1 },
              { label: t("inbox.followUp.in3"), days: 3 },
              { label: t("inbox.followUp.nextWeek"), days: 7 },
            ].map((o) => (
              <Button
                key={o.days}
                size="sm"
                disabled={busy}
                onClick={() => onRun(() => setFollowUp(lead.id, inDays(o.days), note || null))}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("inbox.followUp.notePlaceholder")}
            className="mt-2"
          />
        </>
      )}
    </Panel>
  );
}

// ─── Actividad ───────────────────────────────────────────────────────────────

/** Lo que ha pasado. `recent`: las tres últimas, con acceso al historial. */
function Activity({
  lead,
  locale,
  recent = false,
  onSeeAll,
}: {
  lead: LeadDetail;
  locale: string;
  recent?: boolean;
  onSeeAll?: () => void;
}) {
  const t = useT();

  // El hilo de WhatsApp se resume en UNA línea con enlace al chat: volcar
  // treinta mensajes aquí taparía los cuatro hechos que importan.
  const wa = lead.whatsapp;
  const items = recent ? lead.activity.slice(0, 3) : lead.activity;
  const dot = "mt-2 h-2 w-2 shrink-0 rounded-full";

  return (
    <Panel
      title={recent ? t("inbox.recent.title") : t("inbox.activity.title")}
      count={recent ? null : lead.activity.length}
    >
      <ul className="space-y-5">
        {wa.conversationId && (
          <li className="flex gap-3">
            <span className={cn(dot, "bg-[#25D366]")} />
            <div className="min-w-0">
              {wa.lastMessageAt && (
                <p className="sol-meta text-sol-muted">
                  <RelativeTime at={wa.lastMessageAt} locale={locale} />
                </p>
              )}
              <p className="mt-1 sol-ui text-sol-ink">
                {wa.outbound > 0
                  ? t("inbox.activity.waSummary", { sent: wa.outbound, received: wa.inbound })
                  : t("inbox.activity.waOpenedOnly")}
              </p>
            </div>
          </li>
        )}

        {items.map((a) => (
          <li key={a.id} className="flex gap-3">
            <span className={cn(dot, "bg-sol-action")} />
            <div className="min-w-0">
              <p className="sol-meta text-sol-muted">
                <RelativeTime at={a.createdAt} locale={locale} />
                {a.authorName ? ` · ${a.authorName}` : ""}
              </p>
              <p className="mt-1 sol-ui text-sol-ink">
                {t(`inbox.activity.kind.${a.kind}`)}
                {a.outcome && ` · ${t(`inbox.log.call.${a.outcome}`)}`}
                {a.body && <span className="text-sol-muted"> · {a.body}</span>}
              </p>
            </div>
          </li>
        ))}

        <li className="flex gap-3">
          <span className={cn(dot, "bg-sol-action")} />
          <div>
            <p className="sol-meta text-sol-muted">{formatDateTime(lead.createdAt, locale)}</p>
            <p className="mt-1 sol-ui text-sol-ink">{t("inbox.activity.received")}</p>
          </div>
        </li>
      </ul>

      {!recent && lead.activity.length === 0 && !wa.conversationId && (
        <div className="mt-4">
          <Empty>{t("inbox.activity.empty")}</Empty>
        </div>
      )}
      {recent && onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="mt-6 sol-ui font-semibold text-sol-action underline-offset-2 hover:underline"
        >
          {t("inbox.recent.all")}
        </button>
      )}
    </Panel>
  );
}
