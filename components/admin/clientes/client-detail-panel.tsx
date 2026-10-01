"use client";

import {
  AlertTriangle,
  ArrowRight,
  Heart,
  Link2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  briefGaps,
  FEATURE_LABEL,
  labelOf,
  PROPERTY_TYPES,
  PURCHASE_PURPOSE,
  type BriefInput,
  type FeatureKey,
} from "@/lib/clients/brief";
import { realEmail } from "@/lib/clients/display";
import { dictionary } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/provider";
import type { PortalLinkSummary } from "@/lib/portal-links/summary";
import type { AdminClient } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ClientDetailPanel({
  client,
  fichaHref,
  portalSummary,
}: {
  client: AdminClient | undefined;
  fichaHref?: string;
  /** undefined = sin permiso; null = sin anuncios. */
  portalSummary?: PortalLinkSummary | null;
}) {
  const t = useT();

  if (!client) {
    return (
      <aside className="flex flex-col items-center justify-center rounded-2xl border border-gold/15 bg-cream-50/85 p-8 text-center shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
        <p className="crm-section-title text-ink">
          {t("clientes.detail.empty.title")}
        </p>
        <p className="mt-2 max-w-xs text-sm text-ink/60">
          {t("clientes.detail.empty.text")}
        </p>
      </aside>
    );
  }

  // `key`: cada cliente monta su propio panel. Cuando aquí había un editor,
  // sin él el estado se quedaba con el cliente ANTERIOR y "Guardar" lo
  // escribía en el nuevo; se mantiene para que nada vuelva a heredarse.
  return (
    <ClientDetailPanelInner
      key={client.id}
      client={client}
      fichaHref={fichaHref}
      portalSummary={portalSummary}
    />
  );
}

function ClientDetailPanelInner({
  client,
  fichaHref,
  portalSummary,
}: {
  client: AdminClient;
  fichaHref?: string;
  portalSummary?: PortalLinkSummary | null;
}) {
  return (
    <aside className="flex flex-col rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <ClientHeader client={client} fichaHref={fichaHref} />
      <ContactInfo client={client} />
      <ActivityBlock client={client} fichaHref={fichaHref} portalSummary={portalSummary} />
      <EncargoBlock brief={client.brief ?? null} fichaHref={fichaHref} />
      <InternalNotesBlock client={client} />
    </aside>
  );
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS_PANEL = [
  "bg-gold/20 text-amber-800",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
];

function getPanelAvatarColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS_PANEL[code % AVATAR_COLORS_PANEL.length];
}

// ─────────────────────────────────────────────────────────────────────────────

function ClientHeader({ client, fichaHref }: { client: AdminClient; fichaHref?: string }) {
  const t = useT();
  const isActive = client.status === "active";
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const avatarColor = getPanelAvatarColor(fullName || client.email);
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            avatarColor,
          )}
        >
          {client.avatarInitials}
        </span>
        <div className="min-w-0">
          <h2 className="truncate crm-section-title text-ink">
            {client.firstName} {client.lastName}
          </h2>
          <span
            className={cn(
              "mt-1 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium",
              isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-ink/15 bg-ink/5 text-ink/55",
            )}
          >
            {t(`clientes.status.${client.status}`)}
          </span>
        </div>
      </div>
      {/* Antes: un "⋮" que no abría nada. La ficha completa es lo que se
          busca desde aquí. */}
      {fichaHref && (
        <Link
          href={fichaHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          {t("clientes.table.openFicha")}
          <ArrowRight size={12} strokeWidth={1.75} className="text-gold" />
        </Link>
      )}
    </header>
  );
}

function ContactInfo({ client }: { client: AdminClient }) {
  const email = realEmail(client.email);
  return (
    <ul className="mt-4 grid grid-cols-1 gap-2 text-xs text-ink/70 sm:grid-cols-3">
      {email && (
        <li className="flex items-center gap-1.5 truncate">
          <Mail size={13} strokeWidth={1.75} className="text-gold" />
          <span className="truncate">{email}</span>
        </li>
      )}
      {client.phone && (
        <li className="flex items-center gap-1.5">
          <Phone size={13} strokeWidth={1.75} className="text-gold" />
          <span>{client.phone}</span>
        </li>
      )}
      {client.location && (
        <li className="flex items-center gap-1.5">
          <MapPin size={13} strokeWidth={1.75} className="text-gold" />
          <span>{client.location}</span>
        </li>
      )}
    </ul>
  );
}

/**
 * Solo lo que la lista SABE. "Propiedades vistas", "Mensajes" y "Última
 * conexión" salían siempre a 0 / "—" porque la lista no carga la analítica
 * (la ficha sí: a un cliente con 13 vistas se le leía aquí "0 vistas"). Esas
 * cifras viven en la ficha; aquí quedan favoritos, visitas y los anuncios que
 * le han llegado de los portales.
 */
function ActivityBlock({
  client,
  fichaHref,
  portalSummary,
}: {
  client: AdminClient;
  fichaHref?: string;
  portalSummary?: PortalLinkSummary | null;
}) {
  const t = useT();
  const a = client.activity;
  const n = (key: string, count: number) =>
    t(count === 1 && `${key}.one` in dictionary.es ? `${key}.one` : key, { count });
  const portalHref = fichaHref ? `${fichaHref}?tab=properties#portal-links` : undefined;

  return (
    <section className="mt-5 border-t border-gold/15 pt-4">
      <p className="crm-label-sm text-ink/55">
        {t("clientes.detail.activity.title")}
      </p>
      <ul className="mt-3 grid grid-cols-3 gap-3">
        <ActivityItem
          icon={<Heart size={15} strokeWidth={1.75} />}
          value={a.favorites}
          labelKey="clientes.detail.activity.favorites"
        />
        <ActivityItem
          icon={<Calendar15 />}
          value={a.visitsRequested}
          labelKey="clientes.detail.activity.visits"
        />
        {portalSummary !== undefined && (
          <ActivityItem
            icon={<Link2 size={15} strokeWidth={1.75} />}
            value={portalSummary?.total ?? 0}
            labelKey="clientes.detail.activity.portalLinks"
          />
        )}
      </ul>

      {portalSummary !== undefined && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs">
          {portalSummary && portalSummary.total > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink/70">
              {portalSummary.toCall > 0 && (
                <strong className="font-medium text-gold-dark">
                  {n("clientes.portal.toCall", portalSummary.toCall)}
                </strong>
              )}
              {portalSummary.fresh > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                  {n("clientes.portal.fresh", portalSummary.fresh)}
                </span>
              )}
              {portalSummary.toCall === 0 && portalSummary.fresh === 0 && (
                <span>{n("clientes.portal.total", portalSummary.total)}</span>
              )}
            </span>
          ) : (
            <span className="text-ink/50">{t("clientes.detail.portal.none")}</span>
          )}
          {portalHref && portalSummary && portalSummary.total > 0 && (
            <Link
              href={portalHref}
              className="inline-flex items-center gap-1 font-medium text-ink/60 transition hover:text-ink"
            >
              {t("clientes.detail.portal.see")}
              <ArrowRight size={11} strokeWidth={2} />
            </Link>
          )}
        </div>
      )}

      {fichaHref && (
        <Link
          href={`${fichaHref}?tab=activity`}
          className="mt-2 inline-flex items-center gap-1 text-xs text-ink/45 transition hover:text-ink"
        >
          {t("clientes.detail.activity.inFicha")}
          <ArrowRight size={11} strokeWidth={2} />
        </Link>
      )}
    </section>
  );
}

function Calendar15() {
  // Using lucide Calendar at 15 to match the others
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ActivityItem({
  icon,
  value,
  labelKey,
}: {
  icon: React.ReactNode;
  value: number | string;
  labelKey: string;
}) {
  const t = useT();
  return (
    <li className="flex flex-col items-center gap-1 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
        {icon}
      </span>
      <span className="text-base font-bold text-ink">
        {value}
      </span>
      <span className="text-xs leading-tight text-ink/55">{t(labelKey)}</span>
    </li>
  );
}

/**
 * El encargo, en resumen y de solo lectura. Hasta 2026-10-01 aquí había un
 * TERCER editor de preferencias, con seis campos, que al guardar reducía las
 * zonas a una sola y escribía la estancia también en venta. Ahora se edita en
 * un único sitio —la ficha, el mismo formulario que "Nuevo cliente"— y este
 * botón lleva directo a él (`?encargo=editar`).
 */
function EncargoBlock({ brief, fichaHref }: { brief: BriefInput | null; fichaHref?: string }) {
  const editHref = fichaHref ? `${fichaHref}?encargo=editar` : undefined;
  const fmt = (n: number) => new Intl.NumberFormat("es-ES").format(n);

  const rows: Array<[string, string]> = [];
  if (brief) {
    const rent = brief.operation === "rent";
    const unit = rent ? " €/mes" : " €";
    rows.push([
      "Busca",
      [
        rent ? "Alquiler" : "Compra",
        rent ? (brief.stay === "short" ? "temporada" : "larga") : labelOf(PURCHASE_PURPOSE, brief.purchasePurpose)?.toLowerCase(),
        brief.propertyTypes.map((k) => labelOf(PROPERTY_TYPES, k)).join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · "),
    ]);
    const where = [...brief.zones, ...brief.subzones];
    if (where.length) rows.push(["Zonas", where.join(", ") + (brief.zonesFlexible ? " (abierto a otras)" : "")]);
    if (brief.minPrice !== null || brief.maxPrice !== null) {
      rows.push([
        "Presupuesto",
        brief.minPrice !== null && brief.maxPrice !== null
          ? `${fmt(brief.minPrice)} – ${fmt(brief.maxPrice)}${unit}`
          : brief.maxPrice !== null
            ? `hasta ${fmt(brief.maxPrice)}${unit}`
            : `desde ${fmt(brief.minPrice as number)}${unit}`,
      ]);
    }
    const size = [
      brief.minBedrooms !== null ? `${brief.minBedrooms}+ dorm.` : null,
      brief.minBathrooms !== null ? `${brief.minBathrooms}+ baños` : null,
      brief.minSquareMeters !== null ? `${brief.minSquareMeters}+ m²` : null,
    ].filter(Boolean);
    if (size.length) rows.push(["Vivienda", size.join(" · ")]);
    if (rent && brief.occupants) {
      rows.push([
        "Quién",
        [
          `${brief.occupants} pers.`,
          brief.students ? `${brief.students} estudian` : null,
          brief.workers ? `${brief.workers} trabajan` : null,
          brief.pets ? "con mascota" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ]);
    }
    if (brief.mustHave.length) {
      rows.push(["Imprescindible", brief.mustHave.map((k) => FEATURE_LABEL[k as FeatureKey] ?? k).join(", ")]);
    }
  }

  const essential = brief ? briefGaps(brief).filter((g) => g.level === "essential") : [];

  return (
    <section className="mt-5 border-t border-gold/15 pt-4">
      <header className="flex items-center justify-between gap-2">
        <p className="crm-label-sm text-ink/55">El encargo</p>
        {editHref && (
          <Link
            href={editHref}
            className="inline-flex items-center gap-1 rounded-md border border-ink/12 bg-white/70 px-2 py-1 text-xs text-ink/70 transition hover:border-gold/50 hover:text-ink"
          >
            <Pencil size={11} strokeWidth={1.75} />
            {brief ? "Editar encargo" : "Definir encargo"}
          </Link>
        )}
      </header>

      {!brief ? (
        <p className="mt-3 rounded-xl border border-dashed border-gold/25 bg-white/40 px-3 py-4 text-center text-xs text-ink/55">
          Sin encargo todavía: sin él no hay propiedades sugeridas.
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[96px_1fr] gap-2 text-xs">
                <dt className="text-ink/50">{label}</dt>
                <dd className="text-ink/85">{value}</dd>
              </div>
            ))}
          </dl>
          {essential.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>Falta: {essential.map((g) => g.label.toLowerCase()).join(", ")}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

function InternalNotesBlock({ client }: { client: AdminClient }) {
  const t = useT();
  return (
    <section className="mt-5 border-t border-gold/15 pt-4">
      <header className="flex items-center justify-between">
        <p className="crm-label-sm text-ink/55">
          {t("clientes.detail.notes.title")}
        </p>
        <button
          type="button"
          aria-label={t("clientes.detail.actions.editNotes")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink/45 transition hover:bg-white/60 hover:text-ink"
        >
          <Pencil size={13} strokeWidth={1.75} />
        </button>
      </header>

      <div className="mt-3 rounded-xl border border-gold/15 bg-white/55 p-3">
        {client.internalNotes.length === 0 ? (
          <p className="text-xs text-ink/55">
            {t("clientes.detail.notes.empty")}
          </p>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink/75">
            {client.internalNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}

        <p
          className={cn(
            "mt-3 flex items-center gap-1.5 text-xs font-semibold",
            client.priority === "high" ? "text-amber-700" : "text-ink/55",
          )}
        >
          <Star
            size={13}
            strokeWidth={1.75}
            className={cn(
              client.priority === "high"
                ? "fill-amber-500 text-amber-500"
                : "text-ink/40",
            )}
          />
          <span>
            {t(`clientes.detail.notes.priority.${client.priority}`)}
          </span>
        </p>
      </div>
    </section>
  );
}
