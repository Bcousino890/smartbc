"use client";

// ============================================================================
// LEAD WORKSPACE — el panel derecho.
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
  ExternalLink,
  Globe,
  Languages,
  Phone,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type { StaffRef } from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { PrepareVisitsButton } from "@/components/admin/viewing-collections/prepare-visits-button";
import {
  Button,
  Empty,
  Panel,
  Pill,
  Select,
  TextArea,
  TextInput,
  type Tone,
} from "@/components/admin/ui/primitives";
import { LeadAvatar } from "./lead-avatar";
import { formatDate, formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { translateLeadMessage } from "../actions";
import {
  assignLead,
  assignLeadToMe,
  convertLeadToClient,
  findClientCandidates,
  logContact,
  matchLeadProperty,
  searchPropertiesForLead,
  setFollowUp,
  setLeadDiscarded,
  snoozeFollowUp,
  type CallOutcome,
} from "../inbox-actions";
import { WhatsAppLeadButton } from "../whatsapp-lead-button";

const STATE_TONE: Record<string, Tone> = {
  new: "neutral",
  contacted: "info",
  engaged: "positive",
  converted: "gold",
  discarded: "neutral",
};

export function LeadWorkspace({
  lead,
  staff,
  country,
  canEdit,
  onClose,
}: {
  lead: LeadDetail;
  staff: StaffRef[];
  country: Country;
  canEdit: boolean;
  onClose?: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startBusy(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? t("inbox.error.generic"));
      else router.refresh();
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Cabecera ── */}
      <header className="shrink-0 border-b border-ink/10 bg-cream-50/50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          {/* La foto va DENTRO del bloque de identidad, no como tercer hijo
              del flex: con justify-between, un tercer hijo empujaría el
              nombre al centro en vez de dejarlo pegado a la foto. */}
          <div className="flex min-w-0 items-start gap-3">
            {/* Foto de perfil que la extensión saca del inbox de Idealista.
                Solo se pinta si existe: quien no tiene foto sale con
                iniciales en Idealista, y un icono genérico aquí no aportaría
                nada. */}
            {lead.avatarUrl && (
              <LeadAvatar
                src={lead.avatarUrl}
                name={lead.name}
                className="mt-0.5 h-11 w-11 rounded-full object-cover ring-1 ring-ink/10"
              />
            )}
            <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[22px] font-bold leading-tight text-ink">
                {lead.name?.trim() || t("inbox.row.noName")}
              </h2>
              {lead.isInternational && (
                <Globe size={13} strokeWidth={1.8} className="shrink-0 text-ink/35" />
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
              <Pill tone={STATE_TONE[lead.state] ?? "neutral"}>
                {t(`inbox.state.${lead.state}`)}
              </Pill>
              <span>{t("inbox.source.idealista")}</span>
              <span aria-hidden>·</span>
              <RelativeTime at={lead.createdAt} locale={config.locale} />
              {lead.suggestedType && !lead.leadType && (
                <Pill tone="neutral">
                  {t("inbox.type.suggested", { type: t(`inbox.type.${lead.suggestedType}`) })}
                </Pill>
              )}
              {lead.leadType && <Pill tone="neutral">{t(`inbox.type.${lead.leadType}`)}</Pill>}
            </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <Select
                value={lead.assignedTo ?? ""}
                disabled={busy}
                onChange={(e) => run(() => assignLead(lead.id, e.target.value || null))}
                aria-label={t("inbox.assign.label")}
                className={cn(
                  "max-w-[170px] py-1 text-xs",
                  !lead.assignedTo && "border-amber-300 bg-amber-50 text-amber-800",
                )}
              >
                <option value="">{t("inbox.assign.none")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("cc.cancel")}>
                <X size={14} />
              </Button>
            )}
          </div>
        </div>

        {/* Contacto directo, siempre a mano */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {lead.phone ? (
            <>
              <a
                href={`tel:${lead.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/75 transition hover:border-gold/50 hover:text-ink"
              >
                <Phone size={11} strokeWidth={2} className="text-gold" />
                {lead.phone}
              </a>
              <WhatsAppLeadButton
                phone={lead.phone}
                name={lead.name}
                message={lead.message}
                propertyTitle={lead.propertyTitle}
                leadId={lead.id}
              />
            </>
          ) : (
            <Pill tone="warning">{t("inbox.reason.missing_contact")}</Pill>
          )}
          <a
            href={lead.idealistaThreadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink/45 transition hover:text-ink"
          >
            {t("inbox.openThread")}
            <ExternalLink size={10} strokeWidth={2} />
          </a>
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => setLeadDiscarded(lead.id, lead.state !== "discarded"))}
              className="ms-auto"
            >
              {lead.state === "discarded" ? t("inbox.restore") : t("inbox.discard")}
            </Button>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </header>

      {/* ── Cuerpo ── */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {lead.duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
            <p className="text-xs font-medium text-amber-800">
              {t("inbox.duplicate.title", { count: lead.duplicates.length })}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/70">
              {t("inbox.duplicate.hint")}
            </p>
          </div>
        )}

        <Enquiry lead={lead} />

        <PropertyContext lead={lead} country={country} canEdit={canEdit} onRun={run} busy={busy} />

        <OtherEnquiries lead={lead} />

        <ClientSection lead={lead} country={country} canEdit={canEdit} />

        {canEdit && <ContactLog lead={lead} onRun={run} busy={busy} />}

        {canEdit && <FollowUp lead={lead} locale={config.locale} onRun={run} busy={busy} />}

        <Activity lead={lead} locale={config.locale} />
      </div>
    </div>
  );
}

// ─── Consulta original ───────────────────────────────────────────────────────

function Enquiry({ lead }: { lead: LeadDetail }) {
  const t = useT();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [pending, start] = useTransition();

  if (!lead.message && lead.profileBullets.length === 0) return null;

  return (
    <Panel
      title={t("inbox.enquiry.title")}
      action={
        lead.message ? (
          <Button
            size="sm"
            variant="ghost"
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
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">
          {translated && !showOriginal ? translated : lead.message}
        </p>
      )}
      {translated && !showOriginal && (
        <p className="mt-1.5 text-xs text-ink/35">{t("inbox.enquiry.machine")}</p>
      )}
      {lead.profileBullets.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-ink/8 pt-3">
          {lead.profileBullets.map((b, i) => (
            <li key={i}>
              <Pill tone="neutral">{b}</Pill>
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

  if (lead.property) {
    const p = lead.property;
    // Una ficha propia se abre en /propiedades/[slug]; un anuncio de Idealista
    // sin ficha propia (las "inspo") vive en /idealista, y hasta ahora la
    // bandeja lo daba directamente por inexistente.
    const href = p.slug
      ? `${config.prefix}/propiedades/${p.slug}`
      : `${config.prefix}/idealista`;
    return (
      <Panel
        title={t("inbox.property.title")}
        action={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setMatching((v) => !v)}>
              {t("inbox.property.change")}
            </Button>
          ) : null
        }
      >
        <div className="flex gap-3">
          {p.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.coverUrl}
              alt=""
              className="h-16 w-24 shrink-0 rounded object-cover"
              loading="lazy"
            />
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={href}
              className="block truncate text-sm font-medium text-ink hover:underline"
            >
              {p.title ?? "—"}
            </Link>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink/50">
              {p.reference && <span>{p.reference}</span>}
              {p.price !== null && (
                <span>{config.formatPrice(p.price, null, p.operation)}</span>
              )}
              {p.zone && <span>{p.zone}</span>}
              {p.status && (
                <Pill tone={p.status === "available" ? "positive" : "warning"}>
                  {t(`inbox.property.status.${p.status}`)}
                </Pill>
              )}
              {p.source === "listing" && (
                <Pill tone="info">{t("inbox.property.fromListing")}</Pill>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={href}
                className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink/70 transition hover:border-gold/50"
              >
                {t("inbox.property.open")}
                <ArrowUpRight size={10} strokeWidth={2} />
              </Link>
              <PrepareVisitsButton source="idealista" sourceId={lead.id} compact />
            </div>
          </div>
        </div>
        {matching && canEdit && (
          <PropertyPicker leadId={lead.id} onDone={() => setMatching(false)} onRun={onRun} />
        )}
      </Panel>
    );
  }

  // Sin ficha propia: 190 de 322 leads están así. No se construye otro
  // importador — se enlaza el que ya existe, con la URL del anuncio si la hay.
  return (
    <Panel title={t("inbox.property.title")}>
      <div className="flex gap-3">
        {lead.propertyImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lead.propertyImageUrl}
            alt=""
            className="h-16 w-24 shrink-0 rounded object-cover opacity-80"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink/75">
            {lead.propertyTitle ?? t("inbox.row.noProperty")}
          </p>
          {lead.propertyPrice && (
            <p className="text-xs text-ink/45">{lead.propertyPrice}</p>
          )}
          <p className="mt-1 text-xs text-amber-700">{t("inbox.property.unmatched")}</p>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMatching((v) => !v)}>
                <Search size={11} strokeWidth={2} />
                {t("inbox.property.match")}
              </Button>
              <Link
                href={`${config.prefix}/propiedades/importar`}
                className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/70 transition hover:border-gold/50"
              >
                {t("inbox.property.import")}
                <ArrowUpRight size={10} strokeWidth={2} />
              </Link>
            </div>
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

  return (
    <div className="mt-3 border-t border-ink/8 pt-3">
      <TextInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("inbox.property.searchPlaceholder")}
        autoFocus
      />
      {searching && <p className="mt-1.5 text-xs text-ink/40">{t("inbox.searching")}</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onRun(() => matchLeadProperty(leadId, p.id));
                  onDone();
                }}
                className="flex w-full items-center justify-between gap-2 rounded border border-ink/8 px-2.5 py-1.5 text-left text-xs transition hover:border-gold/45"
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
        canEdit && !candidates ? (
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
        <p className="text-xs text-ink/45">{t("inbox.client.notLinked")}</p>
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

// ─── Registro de contacto ────────────────────────────────────────────────────

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

  const outcomes: CallOutcome[] = ["answered", "no_answer", "callback"];

  return (
    <Panel title={t("inbox.log.title")}>
      {/* Abrir `tel:` no marca nada: que suene el teléfono no es haber
          hablado, y de esa diferencia depende el estado del lead. */}
      <p className="text-xs text-ink/45">{t("inbox.log.callHint")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {outcomes.map((o) => (
          <Button
            key={o}
            size="sm"
            disabled={busy}
            onClick={() => onRun(() => logContact(lead.id, "call", { outcome: o }))}
          >
            {t(`inbox.log.call.${o}`)}
          </Button>
        ))}
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onRun(() => logContact(lead.id, "email"))}
        >
          {t("inbox.log.email")}
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("inbox.log.notePlaceholder")}
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

function Activity({ lead, locale }: { lead: LeadDetail; locale: string }) {
  const t = useT();

  // El hilo de WhatsApp se resume en UNA línea con enlace al chat: volcar
  // treinta mensajes aquí taparía los cuatro hechos que importan.
  const wa = lead.whatsapp;

  return (
    <Panel title={t("inbox.activity.title")} count={lead.activity.length}>
      <ul className="space-y-2">
        {wa.conversationId && (
          <li className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#25D366]" />
            <div className="min-w-0">
              <p className="text-xs text-ink/80">
                {wa.outbound > 0
                  ? t("inbox.activity.waSummary", { sent: wa.outbound, received: wa.inbound })
                  : t("inbox.activity.waOpenedOnly")}
              </p>
              {wa.lastMessageAt && (
                <p className="text-xs text-ink/35">
                  <RelativeTime at={wa.lastMessageAt} locale={locale} />
                </p>
              )}
            </div>
          </li>
        )}

        {lead.activity.map((a) => (
          <li key={a.id} className="flex gap-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/20" />
            <div className="min-w-0">
              <p className="text-xs text-ink/80">
                {t(`inbox.activity.kind.${a.kind}`)}
                {a.outcome && ` · ${t(`inbox.log.call.${a.outcome}`)}`}
                {a.body && <span className="text-ink/50"> · {a.body}</span>}
              </p>
              <p className="text-xs text-ink/35">
                <RelativeTime at={a.createdAt} locale={locale} />
                {a.authorName ? ` · ${a.authorName}` : ""}
              </p>
            </div>
          </li>
        ))}

        <li className="flex gap-2.5">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/50" />
          <div>
            <p className="text-xs text-ink/80">{t("inbox.activity.received")}</p>
            <p className="text-xs text-ink/35">
              {formatDateTime(lead.createdAt, locale)}
            </p>
          </div>
        </li>
      </ul>

      {lead.activity.length === 0 && !wa.conversationId && (
        <Empty>{t("inbox.activity.empty")}</Empty>
      )}
    </Panel>
  );
}
