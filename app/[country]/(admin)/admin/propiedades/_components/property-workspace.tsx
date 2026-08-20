"use client";

// ============================================================================
// PROPERTY COMMAND CENTER — el panel derecho.
//
// La propiedad, entendible en una pantalla: qué es, qué le falta, quién la
// quiere, qué visitas tiene y cómo está funcionando. Seis pestañas en vez del
// scroll de 1.700 líneas; el EDITOR de siempre sigue existiendo y es el
// destino del botón Editar — aquí no se duplica ni un formulario de campos ni
// la gestión de fotos.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Pencil,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import type {
  ClientInterestEntry,
  PropertyWorkspaceDetail,
} from "@/lib/db/queries/properties-workspace";
import {
  HEALTH_DIMENSIONS,
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "@/lib/properties-workspace/types";
import { NORMALIZED_TYPES } from "@/lib/properties-workspace/normalize";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { PORTAL_URL } from "@/lib/portal-url";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { formatDate, formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import { cn } from "@/lib/utils";
import {
  Button,
  Empty,
  Field,
  Panel,
  Pill,
  Select,
  TextInput,
  type Tone,
} from "@/components/admin/ui/primitives";
import { addPropertyToSelection } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import {
  completeLocation,
  setPropertyTypeOverride,
  setPublishedWeb,
} from "../workspace-actions";

const GRADE_TONE: Record<string, Tone> = {
  excellent: "positive",
  good: "info",
  needs_attention: "warning",
  incomplete: "critical",
  unknown: "neutral",
};

export function PropertyWorkspace({
  detail,
  country,
  tab,
  canEdit,
  canPublish,
  onTab,
  onClose,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  tab: WorkspaceTab;
  canEdit: boolean;
  canPublish: boolean;
  onTab: (t: WorkspaceTab) => void;
  onClose?: () => void;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);
  const p = detail.item;

  const counts: Partial<Record<WorkspaceTab, number>> = {
    clients: detail.interest.length,
    viewings: detail.interest.reduce((n, c) => n + c.upcomingStops.length, 0),
    media: p.photoCount,
    details: 0,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Cabecera: identidad + acciones primarias ── */}
      <header className="shrink-0 border-b border-ink/10 bg-cream-50/50 px-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-[19px] leading-tight text-ink">{p.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink/50">
              <span>{[p.zone, p.bcReference].filter(Boolean).join(" · ")}</span>
              <span dir="ltr" className="font-medium tabular-nums text-ink">
                {config.formatPrice(p.price, p.currency, p.operation)}
              </span>
              <Pill tone={p.status === "available" ? "positive" : "neutral"}>
                {t(`pw.status.${p.status}`)}
              </Pill>
              <Pill tone={GRADE_TONE[p.health.overall]}>
                {t(`pw.health.${p.health.overall}`)}
              </Pill>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("cc.cancel")}>
              <X size={14} />
            </Button>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 pb-2.5">
          {canEdit && (
            <Link
              href={`${config.prefix}/propiedades/${p.slug}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[11.5px] font-medium text-cream-50 transition hover:bg-ink-soft"
            >
              <Pencil size={11} strokeWidth={2} className="text-gold" />
              {t("pw.action.edit")}
            </Link>
          )}
          <CopySmartLink slug={p.slug} />
          {canEdit && <AddToClient propertyId={p.id} country={country} />}
          {p.publishedWeb && (
            <a
              href={`${PORTAL_URL}/web/propiedades/${p.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/45 transition hover:text-ink"
            >
              {t("pw.action.openPublic")}
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          )}
        </div>

        {/* ── Pestañas ── */}
        <nav role="tablist" aria-label={p.title} className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WORKSPACE_TABS.map((x) => {
            const on = x === tab;
            const n = counts[x];
            return (
              <button
                key={x}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab(x)}
                className={cn(
                  "relative shrink-0 px-2.5 py-2 text-[12px] font-medium transition-colors",
                  on ? "text-ink" : "text-ink/45 hover:text-ink/75",
                )}
              >
                {t(`pw.tab.${x}`)}
                {typeof n === "number" && n > 0 && (
                  <span className={cn("ms-1.5 rounded px-1 py-px text-[10px] font-semibold tabular-nums", on ? "bg-gold/15 text-gold-dark" : "bg-ink/[0.06] text-ink/45")}>
                    {n}
                  </span>
                )}
                <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[2px] origin-left rounded-full bg-ink transition-transform duration-300", on ? "scale-x-100" : "scale-x-0")} />
              </button>
            );
          })}
        </nav>
      </header>

      {/* ── Cuerpo ── */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {tab === "overview" && <OverviewTab detail={detail} country={country} onTab={onTab} />}
        {tab === "clients" && <ClientsTab detail={detail} country={country} />}
        {tab === "viewings" && <ViewingsTab detail={detail} country={country} />}
        {tab === "media" && <MediaTab detail={detail} country={country} canEdit={canEdit} />}
        {tab === "publication" && (
          <PublicationTab detail={detail} country={country} canPublish={canPublish} />
        )}
        {tab === "details" && <DetailsTab detail={detail} country={country} canEdit={canEdit} />}
      </div>
    </div>
  );
}

// ─── Acciones de cabecera ────────────────────────────────────────────────────

function CopySmartLink({ slug }: { slug: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(`${PORTAL_URL}/compartir/${slug}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={11} strokeWidth={2} className="text-emerald-600" /> : <Copy size={11} strokeWidth={2} />}
      {copied ? t("pw.action.copied") : t("pw.action.smartlink")}
    </Button>
  );
}

/** Añadir ESTA propiedad a la selección de un cliente, buscándolo por nombre.
 *  Reutiliza la acción de siempre (`addPropertyToSelection`, source manual). */
function AddToClient({ propertyId, country }: { propertyId: string; country: Country }) {
  const t = useT();
  const config = getCountryConfig(country);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/clientes/search?q=${encodeURIComponent(q.trim())}`);
        const data = res.ok ? await res.json() : [];
        setResults(
          (Array.isArray(data) ? data : (data.clients ?? [])).slice(0, 8).map((c: any) => ({
            id: c.id,
            name: c.full_name || c.name || c.email || "—",
          })),
        );
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q, open]);

  if (added) {
    return (
      <Link
        href={`${config.prefix}/clientes/${added.id}?tab=properties`}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-700"
      >
        <Check size={11} strokeWidth={2} />
        {t("pw.addClient.done", { name: added.name })}
        <ArrowUpRight size={10} strokeWidth={2} />
      </Link>
    );
  }

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <UserPlus size={11} strokeWidth={2} />
        {t("pw.action.addToClient")}
      </Button>
      {open && (
        <div className="absolute start-0 top-full z-20 mt-1 w-72 rounded-lg border border-ink/12 bg-white p-2 shadow-lg">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("pw.addClient.placeholder")}
            autoFocus
          />
          <ul className="mt-1.5 max-h-52 space-y-0.5 overflow-y-auto">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addPropertyToSelection(c.id, propertyId, "manual");
                      if (r.ok) {
                        setAdded(c);
                        setOpen(false);
                      } else {
                        alert(r.error);
                      }
                    })
                  }
                  className="w-full rounded px-2 py-1.5 text-left text-[12.5px] text-ink transition hover:bg-gold/10"
                >
                  {c.name}
                </button>
              </li>
            ))}
            {q.trim().length >= 2 && results.length === 0 && (
              <li className="px-2 py-1.5 text-[11.5px] text-ink/40">{t("inbox.client.noMatch")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────

function OverviewTab({
  detail,
  country,
  onTab,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  onTab: (t: WorkspaceTab) => void;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);
  const p = detail.item;

  const wantToVisit = detail.interest.filter(
    (c) => c.shortlist?.decision === "must_visit" || c.visitRequest,
  ).length;
  const upcoming = detail.interest.flatMap((c) =>
    c.upcomingStops.map((s) => ({ ...s, clientName: c.clientName })),
  );

  return (
    <>
      {/* ── Health: seis dimensiones que se pueden defender en voz alta ── */}
      <Panel title={t("pw.health.title")}>
        <div className="flex flex-wrap gap-1.5">
          {HEALTH_DIMENSIONS.map((d) => (
            <Pill key={d} tone={GRADE_TONE[p.health.dimensions[d]]}>
              {t(`pw.dim.${d}`)} · {t(`pw.health.${p.health.dimensions[d]}`)}
            </Pill>
          ))}
        </div>
        {p.attention.operational.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-ink/8 pt-2.5">
            {p.attention.operational.map((r) => (
              <li key={r} className="flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {t(`pw.attention.${r}`)}
              </li>
            ))}
          </ul>
        )}
        {p.attention.enhancements.length > 0 && (
          <p className="mt-2 text-[11px] text-ink/45">
            {t("pw.enhancements.label")}{" "}
            {p.attention.enhancements.map((e) => t(`pw.enhance.${e}`)).join(" · ")}
          </p>
        )}
      </Panel>

      {/* ── Demanda ── */}
      <Panel
        title={t("pw.demand.title")}
        action={
          detail.interest.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => onTab("clients")}>
              {t("pw.seeAll")}
            </Button>
          ) : null
        }
      >
        {detail.interest.length === 0 ? (
          <p className="text-[12.5px] text-ink/45">{t("pw.demand.none")}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Stat value={detail.interest.length} label={tn("pw.demand.clients", detail.interest.length)} emphasis />
            {wantToVisit > 0 && <Stat value={wantToVisit} label={t("pw.demand.wantVisit")} />}
            {p.applicationCount > 0 && (
              <Stat value={p.applicationCount} label={tn("pw.demand.applications", p.applicationCount)} />
            )}
          </div>
        )}
      </Panel>

      {/* ── Próximas visitas ── */}
      {upcoming.length > 0 && (
        <Panel
          title={t("pw.viewings.title")}
          action={
            <Button size="sm" variant="ghost" onClick={() => onTab("viewings")}>
              {t("pw.seeAll")}
            </Button>
          }
        >
          <ul className="space-y-1.5">
            {upcoming.slice(0, 3).map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="min-w-0 truncate text-ink/80">{s.clientName}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink/50">
                  {s.at
                    ? formatDateTime(s.at, config.locale)
                    : s.itineraryDate
                      ? formatDate(s.itineraryDate, config.locale)
                      : t("cc.itinerary.noDate")}
                  <Pill tone={s.confirmation === "confirmed" ? "positive" : "warning"}>
                    {t(`pw.confirmation.${s.confirmation}`)}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── SmartLinks: totales, sin inventar quién ── */}
      <Panel title={t("pw.smartlinks.title")}>
        {detail.smartLinks.totalLinks === 0 && detail.engagement.total === 0 ? (
          <p className="text-[12.5px] text-ink/45">{t("pw.smartlinks.none")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <Stat value={detail.smartLinks.totalLinks} label={tn("pw.smartlinks.links", detail.smartLinks.totalLinks)} />
              <Stat value={detail.smartLinks.totalOpens} label={tn("pw.smartlinks.opens", detail.smartLinks.totalOpens)} emphasis />
              {detail.smartLinks.lastOpenedAt && (
                <span className="text-[11px] text-ink/45">
                  {t("pw.smartlinks.last")}{" "}
                  <RelativeTime at={detail.smartLinks.lastOpenedAt} locale={config.locale} className="font-medium text-ink/70" />
                </span>
              )}
            </div>
            {detail.engagement.total > 0 && (
              <p className="mt-2 border-t border-ink/8 pt-2 text-[11px] text-ink/45">
                {t("pw.engagement.summary", { count: detail.engagement.total })}
              </p>
            )}
          </>
        )}
      </Panel>

      {/* ── Frescura y publicación, en una línea cada una ── */}
      <Panel title={t("pw.overview.opsTitle")}>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
          <Field
            label={t("pw.details.lastSync")}
            value={
              p.lastSyncedAt ? (
                <RelativeTime at={p.lastSyncedAt} locale={config.locale} />
              ) : (
                t("pw.details.manualSource")
              )
            }
          />
          <Field
            label={t("pw.publication.webTitle")}
            value={p.publishedWeb ? t("pw.publication.published") : t("pw.publication.unpublished")}
          />
        </dl>
        {p.attention.operational.includes("stale_sync") && (
          <p className="mt-2.5 rounded border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11.5px] text-amber-800">
            {t("pw.stale.warning")}
          </p>
        )}
      </Panel>
    </>
  );
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={cn("font-serif text-[20px] leading-none tabular-nums", emphasis ? "text-gold-dark" : "text-ink")}>
        {value}
      </span>
      <span className="text-[11px] text-ink/50">{label}</span>
    </span>
  );
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

function ClientsTab({ detail, country }: { detail: PropertyWorkspaceDetail; country: Country }) {
  const t = useT();
  const config = getCountryConfig(country);

  if (detail.interest.length === 0) {
    return (
      <Panel title={t("pw.tab.clients")}>
        <Empty>{t("pw.demand.none")}</Empty>
      </Panel>
    );
  }

  return (
    <Panel title={t("pw.clients.title")} count={detail.interest.length} dense>
      <ul>
        {detail.interest.map((c) => (
          <ClientRow key={c.clientId} entry={c} locale={config.locale} prefix={config.prefix} />
        ))}
      </ul>
    </Panel>
  );
}

function ClientRow({
  entry,
  locale,
  prefix,
}: {
  entry: ClientInterestEntry;
  locale: string;
  prefix: string;
}) {
  const t = useT();
  const c = entry;
  return (
    <li className="flex items-start justify-between gap-3 border-b border-ink/6 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{c.clientName}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
          {c.shortlist?.decision === "must_visit" && (
            <Pill tone="gold">
              {c.shortlist.rank
                ? t("pw.signal.priority", { rank: c.shortlist.rank })
                : t("pw.signal.mustVisit")}
            </Pill>
          )}
          {c.shortlist && c.shortlist.decision !== "must_visit" && (
            <Pill tone="neutral">
              {t(`cc.shortlist.${c.shortlist.decision === "maybe" ? "maybe" : "notForMe"}`)}
            </Pill>
          )}
          {c.selection && <Pill tone="info">{t("pw.signal.inSelection")}</Pill>}
          {c.selection && c.selection.clientRating > 0 && (
            <Pill tone="gold">{t("pw.signal.rated", { rating: c.selection.clientRating })}</Pill>
          )}
          {c.upcomingStops.length > 0 && (
            <Pill tone="positive">{t("pw.signal.upcomingVisit")}</Pill>
          )}
          {c.visitRequest && c.upcomingStops.length === 0 && (
            <Pill tone="warning">{t("pw.signal.visitRequested")}</Pill>
          )}
          {c.application && (
            <Pill tone="info">{t(`cc.applications.status.${c.application.status}`)}</Pill>
          )}
        </div>
        {c.shortlist?.decidedAt && (
          <p className="mt-1 text-[10.5px] text-ink/40">
            {t("pw.signal.decidedOn", { date: formatDate(c.shortlist.decidedAt, locale) })}
            {c.shortlist.comment && <span className="italic"> · “{c.shortlist.comment}”</span>}
          </p>
        )}
      </div>
      <Link
        href={`${prefix}/clientes/${c.clientId}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/70 transition hover:border-gold/50 hover:text-ink"
      >
        {t("pw.clients.open")}
        <ArrowUpRight size={10} strokeWidth={2} />
      </Link>
    </li>
  );
}

// ─── VIEWINGS ────────────────────────────────────────────────────────────────

function ViewingsTab({ detail, country }: { detail: PropertyWorkspaceDetail; country: Country }) {
  const t = useT();
  const config = getCountryConfig(country);
  const rows = detail.interest.flatMap((c) =>
    c.upcomingStops.map((s) => ({ ...s, clientId: c.clientId, clientName: c.clientName })),
  );
  const requests = detail.interest.filter((c) => c.visitRequest);

  return (
    <>
      <Panel title={t("pw.viewings.title")} count={rows.length}>
        {rows.length === 0 ? (
          <Empty>{t("pw.viewings.none")}</Empty>
        ) : (
          <ul className="space-y-2">
            {rows.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded border border-ink/8 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink">{s.clientName}</p>
                  <p className="text-[11px] text-ink/50">
                    {s.at
                      ? formatDateTime(s.at, config.locale)
                      : s.itineraryDate
                        ? formatDate(s.itineraryDate, config.locale)
                        : t("cc.itinerary.noDate")}
                    {s.itineraryTitle && ` · ${s.itineraryTitle}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill tone={s.confirmation === "confirmed" ? "positive" : "warning"}>
                    {t(`pw.confirmation.${s.confirmation}`)}
                  </Pill>
                  <Link
                    href={`${config.prefix}/clientes/${s.clientId}?tab=viewings`}
                    className="text-[11px] font-medium text-ink/50 hover:text-ink"
                  >
                    {t("pw.viewings.openItinerary")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {requests.length > 0 && (
        <Panel title={t("clientes.ficha.visits.title")} count={requests.length}>
          <ul className="space-y-1.5">
            {requests.map((c) => (
              <li key={c.clientId} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="min-w-0 truncate text-ink/80">{c.clientName}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Pill tone={c.visitRequest!.status === "pending" ? "warning" : "positive"}>
                    {t(`clientes.ficha.visits.status.${c.visitRequest!.status}`)}
                  </Pill>
                  <span className="text-[11px] text-ink/45">
                    {formatDate(c.visitRequest!.requestedAt, config.locale)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

// ─── MEDIA ───────────────────────────────────────────────────────────────────

function MediaTab({
  detail,
  country,
  canEdit,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  canEdit: boolean;
}) {
  const t = useT();
  const tn = useTn();
  const config = getCountryConfig(country);
  const manage = canEdit ? (
    <Link
      href={`${config.prefix}/propiedades/${detail.item.slug}`}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/55 transition hover:text-ink"
    >
      {t("pw.media.manage")}
      <ArrowUpRight size={10} strokeWidth={2} />
    </Link>
  ) : null;

  return (
    <>
      <Panel title={`${t("pw.media.photos")}`} count={detail.photos.length} action={manage}>
        {detail.photos.length === 0 ? (
          <Empty>{t("pw.media.noPhotos")}</Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
            {detail.photos.map((ph) => (
              <li key={ph.id} className="relative aspect-[4/3] overflow-hidden rounded bg-ink/[0.05]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {ph.isCover && (
                  <span className="absolute start-1 top-1 rounded bg-ink/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cream-50">
                    {t("pw.media.cover")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("pw.media.video")} count={detail.videos.length} action={manage}>
        {detail.videos.length === 0 ? (
          <p className="text-[12px] text-ink/45">{t("pw.media.noVideo")}</p>
        ) : (
          <ul className="space-y-1">
            {detail.videos.map((v) => (
              <li key={v.id}>
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-ink/75 hover:text-ink hover:underline">
                  {v.fileName ?? t("pw.media.video")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("pw.media.plans")} count={detail.plans.length} action={manage}>
        {detail.plans.length === 0 ? (
          <p className="text-[12px] text-ink/45">{t("pw.media.noPlans")}</p>
        ) : (
          <ul className="space-y-1">
            {detail.plans.map((v) => (
              <li key={v.id}>
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-ink/75 hover:text-ink hover:underline">
                  {v.fileName ?? t("pw.media.plans")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ─── PUBLICATION ─────────────────────────────────────────────────────────────

function PublicationTab({
  detail,
  country,
  canPublish,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  canPublish: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = detail.item;
  const blockers = detail.publicationBlockers;

  const toggle = (publish: boolean) => {
    setError(null);
    start(async () => {
      const r = await setPublishedWeb(p.id, publish);
      if (!r.ok) {
        setError(
          r.error.startsWith("blockers:")
            ? r.error
                .slice(9)
                .split(",")
                .map((b) => t(`pw.blocker.${b}`))
                .join(" · ")
            : r.error,
        );
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      {/* ── Web pública: el interruptor que ahora enciende algo ── */}
      <Panel title={t("pw.publication.webTitle")}>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={p.publishedWeb ? "positive" : "neutral"}>
            {p.publishedWeb ? t("pw.publication.published") : t("pw.publication.unpublished")}
          </Pill>
          {p.publishedWeb && (
            <a
              href={`${PORTAL_URL}/web/propiedades/${p.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/50 hover:text-ink"
            >
              {`${PORTAL_URL.replace(/^https?:\/\//, "")}/web/propiedades/${p.slug}`}
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          )}
        </div>

        {blockers.length > 0 && !p.publishedWeb && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50/60 px-3 py-2">
            <p className="text-[11.5px] font-medium text-amber-800">{t("pw.publication.blocked")}</p>
            <ul className="mt-1 space-y-0.5">
              {blockers.map((b) => (
                <li key={b} className="text-[11.5px] text-amber-800/80">
                  · {t(`pw.blocker.${b}`)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {blockers.length > 0 && p.publishedWeb && (
          <p className="mt-3 rounded border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11.5px] text-rose-700">
            {t("pw.publication.inconsistent")}
          </p>
        )}

        {canPublish ? (
          <div className="mt-3 flex items-center gap-2">
            {p.publishedWeb ? (
              <Button size="sm" disabled={pending} onClick={() => toggle(false)}>
                <Globe size={11} strokeWidth={2} />
                {t("pw.publication.unpublish")}
              </Button>
            ) : (
              <Button size="sm" variant="primary" disabled={pending || blockers.length > 0} onClick={() => toggle(true)}>
                <Globe size={11} strokeWidth={2} className="text-gold" />
                {t("pw.publication.publish")}
              </Button>
            )}
            {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-ink/40">{t("pw.publication.noPermission")}</p>
        )}
      </Panel>

      {/* ── Portales: otro circuito, deliberadamente separado ── */}
      <Panel title={t("pw.publication.portalsTitle")}>
        <p className="text-[12px] leading-relaxed text-ink/55">{t("pw.publication.portalsHint")}</p>
        <Link
          href={`${config.prefix}/publicacion`}
          className="mt-2.5 inline-flex items-center gap-1 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-ink/70 transition hover:border-gold/50"
        >
          {t("pw.publication.openPortals")}
          <ArrowUpRight size={10} strokeWidth={2} />
        </Link>
      </Panel>
    </>
  );
}

// ─── DETAILS ─────────────────────────────────────────────────────────────────

function DetailsTab({
  detail,
  country,
  canEdit,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const config = getCountryConfig(country);
  const p = detail.item;
  const [savingType, startType] = useTransition();

  return (
    <>
      {/* ── Tipo normalizado: la regla propone, el agente manda ── */}
      <Panel title={t("pw.details.typeTitle")}>
        <div className="flex flex-wrap items-center gap-3">
          <Field label={t("pw.details.rawType")} value={detail.rawType ?? "—"} />
          <Field label={t("pw.details.normalizedType")} value={t(`pw.type.${p.normalizedType}`)} />
          {canEdit && (
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.07em] text-ink/40">
                {t("pw.details.override")}
              </span>
              <Select
                value={detail.typeOverride ?? ""}
                disabled={savingType}
                onChange={(e) =>
                  startType(async () => {
                    const r = await setPropertyTypeOverride(p.id, e.target.value || null);
                    if (!r.ok) alert(r.error);
                    else router.refresh();
                  })
                }
                className="w-auto py-1 text-[12px]"
              >
                <option value="">{t("pw.details.overrideAuto")}</option>
                {NORMALIZED_TYPES.filter((x) => x !== "unknown").map((x) => (
                  <option key={x} value={x}>
                    {t(`pw.type.${x}`)}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </Panel>

      {/* ── Amenities normalizadas: unidad / edificio / lo no leído ── */}
      <Panel title={t("pw.details.amenities")}>
        {detail.amenities.unit.length === 0 &&
        detail.amenities.building.length === 0 &&
        detail.amenities.leftover.length === 0 ? (
          <p className="text-[12px] text-ink/45">{t("pw.details.noAmenities")}</p>
        ) : (
          <div className="space-y-3">
            {detail.amenities.unit.length > 0 && (
              <AmenityGroup label={t("pw.details.unitAmenities")}>
                {detail.amenities.unit.map((a) => (
                  <Pill key={a} tone="info">{t(`pw.amenity.${a}`)}</Pill>
                ))}
              </AmenityGroup>
            )}
            {detail.amenities.building.length > 0 && (
              <AmenityGroup label={t("pw.details.buildingAmenities")}>
                {detail.amenities.building.map((a) => (
                  <Pill key={a} tone="gold">{t(`pw.amenity.${a}`)}</Pill>
                ))}
              </AmenityGroup>
            )}
            {detail.amenities.leftover.length > 0 && (
              <AmenityGroup label={t("pw.details.leftover")}>
                {detail.amenities.leftover.map((a) => (
                  <Pill key={a} tone="neutral">{a}</Pill>
                ))}
              </AmenityGroup>
            )}
          </div>
        )}
      </Panel>

      {/* ── Ubicación, con el geocodificador de siempre ── */}
      <LocationPanel detail={detail} country={country} canEdit={canEdit} />

      {/* ── Origen y agencia: hechos, sin inventar comisión ni mandato ── */}
      <Panel title={t("pw.details.sourceTitle")}>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
          <Field label={t("pw.details.agency")} value={detail.agency?.name ?? "—"} />
          <Field label={t("pw.details.source")} value={t(`pw.source.${detail.source}`)} />
          <Field label={t("pw.details.externalId")} value={detail.externalId ?? "—"} />
          <Field
            label={t("pw.details.lastSync")}
            value={
              p.lastSyncedAt ? <RelativeTime at={p.lastSyncedAt} locale={config.locale} /> : "—"
            }
          />
        </dl>
        {detail.sourceUrl && (
          <a
            href={detail.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-ink/50 hover:text-ink"
          >
            {t("pw.details.openSource")}
            <ExternalLink size={10} strokeWidth={2} />
          </a>
        )}
      </Panel>

      {/* ── Propietario: pequeño a propósito, cobertura casi cero ── */}
      {(detail.owner.name || detail.owner.phone || detail.owner.email) && (
        <Panel title={t("pw.details.owner")}>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
            <Field label={t("cc.editClient.name")} value={detail.owner.name ?? "—"} />
            <Field label={t("cc.editClient.phone")} value={detail.owner.phone ?? "—"} />
            <Field label={t("cc.editClient.email")} value={detail.owner.email ?? "—"} />
          </dl>
        </Panel>
      )}

      {detail.internalNotes && (
        <Panel title={t("clientes.ficha.notes.title")}>
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink/70">
            {detail.internalNotes}
          </p>
        </Panel>
      )}

      {/* ── Historial: empieza en la 0143, sin pasado inventado ── */}
      <Panel title={t("pw.history.title")} count={detail.history.length}>
        {detail.history.length === 0 ? (
          <p className="text-[12px] text-ink/45">{t("pw.history.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {detail.history.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="min-w-0 text-ink/75">
                  {t(`pw.history.${h.kind}`)}{" "}
                  <span className="text-ink/45">
                    {h.oldValue ?? "—"} → <span className="font-medium text-ink">{h.newValue ?? "—"}</span>
                  </span>
                </span>
                <span className="shrink-0 text-[10.5px] text-ink/40">
                  {formatDateTime(h.createdAt, config.locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 border-t border-ink/8 pt-2 text-[10.5px] text-ink/35">
          {t("pw.history.since")}
        </p>
      </Panel>
    </>
  );
}

function AmenityGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.07em] text-ink/40">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function LocationPanel({
  detail,
  country,
  canEdit,
}: {
  detail: PropertyWorkspaceDetail;
  country: Country;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(detail.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const p = detail.item;
  const hasCoords = detail.latitude !== null && detail.longitude !== null;

  const run = (input: { address?: string | null }) => {
    setError(null);
    start(async () => {
      const r = await completeLocation({ propertyId: p.id, ...input });
      if (!r.ok) {
        setError(r.error === "geocode_failed" ? t("pw.location.geocodeFailed") : r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <Panel
      title={t("pw.location.title")}
      action={
        canEdit && !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <MapPin size={11} strokeWidth={1.9} />
            {t("pw.location.complete")}
          </Button>
        ) : null
      }
    >
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
        <Field label={t("clientes.ficha.preferences.zone")} value={p.zone || "—"} />
        <Field label={t("pw.location.subzone")} value={detail.subzone ?? "—"} />
        <Field label={t("pw.location.address")} value={detail.address ?? t("pw.location.missing")} />
        <Field
          label={t("pw.location.coords")}
          value={
            hasCoords
              ? `${detail.latitude!.toFixed(5)}, ${detail.longitude!.toFixed(5)}`
              : t("pw.location.missing")
          }
        />
      </dl>

      {editing && canEdit && (
        <div className="mt-3 space-y-2 border-t border-ink/8 pt-3">
          <TextInput
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("pw.location.addressPlaceholder")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => run({ address: address || null })}>
              <Search size={11} strokeWidth={2} />
              {pending ? t("inbox.searching") : t("pw.location.geocode")}
            </Button>
            <Button size="sm" onClick={() => setEditing(false)} disabled={pending}>
              {t("cc.cancel")}
            </Button>
            {error && <p className="text-[11.5px] text-rose-600">{error}</p>}
          </div>
          <p className="text-[10.5px] leading-relaxed text-ink/40">{t("pw.location.hint")}</p>
        </div>
      )}
    </Panel>
  );
}
