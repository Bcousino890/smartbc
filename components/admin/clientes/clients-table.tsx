"use client";

// ============================================================================
// Lista de clientes.
//
// Lo que cambió (2026-10) y por qué:
//  · Columna ANUNCIOS: lo que manda la extensión de Chrome ("SmartBC · Enviar
//    a una ficha") llegaba a la ficha sin dejar rastro aquí. Ahora cada fila
//    dice cuántos hay por llamar y cuántos son nuevos, y lleva directo al
//    bloque de la ficha donde se trabajan.
//  · "Último acceso" se quitó: en la lista nunca tuvo dato (siempre "—"). El
//    estado pasa a un punto sobre el avatar y Operación + Preferencias se
//    juntan en "Busca", para que la fila quepa sin scroll lateral junto al
//    panel de la derecha (antes "Ver detalle" quedaba fuera de pantalla).
//  · El nombre es un enlace a la ficha.
//  · Los emails de relleno (`…@interno.smartbc.local`, `lead-…@sin-email…`) no
//    se enseñan como si fueran reales: sale el teléfono, o "Sin email".
//  · La paginación era decorativa (botones que no hacían nada y una lista
//    entera debajo). Ahora pagina de verdad.
// ============================================================================

import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { realEmail } from "@/lib/clients/display";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { dictionary } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/provider";
import type { PortalLinkSummary } from "@/lib/portal-links/summary";
import type { AdminClient, ClientProfileType, ClientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROFILE_KEYS: Record<ClientProfileType, string> = {
  student: "clientes.profile.student",
  worker: "clientes.profile.worker",
  company: "clientes.profile.company",
  family: "clientes.profile.family",
  investor: "clientes.profile.investor",
};

type StatusFilter = "all" | ClientStatus;
type SortKey = "recent" | "name" | "favorites" | "visits" | "portalLinks";

const PAGE_SIZE = 10;

const digits = (v: string | undefined) => (v ?? "").replace(/\D/g, "");

export function ClientsTable({
  clients,
  country,
  portalSummaries,
  selectedId,
  onSelect,
}: {
  clients: AdminClient[];
  country: Country;
  /** null = sin permiso o módulo apagado: la columna no se pinta. */
  portalSummaries: Record<string, PortalLinkSummary> | null;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const prefix = getCountryConfig(country).prefix;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  const showPortal = portalSummaries !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = digits(q);
    let result = clients;

    if (q) {
      result = result.filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          (realEmail(c.email) ?? "").toLowerCase().includes(q) ||
          c.preferredZone.toLowerCase().includes(q) ||
          // Teléfono por cifras: "612 70" encuentra "+34 612 70 58 60".
          (qDigits.length >= 3 && digits(c.phone).includes(qDigits)),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    const sorted = [...result];
    if (sortKey === "name") {
      sorted.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      );
    } else if (sortKey === "favorites") {
      sorted.sort((a, b) => b.activity.favorites - a.activity.favorites);
    } else if (sortKey === "visits") {
      sorted.sort((a, b) => b.activity.visitsRequested - a.activity.visitsRequested);
    } else if (sortKey === "portalLinks" && portalSummaries) {
      const s = (id: string) => portalSummaries[id];
      sorted.sort(
        (a, b) =>
          (s(b.id)?.toCall ?? 0) - (s(a.id)?.toCall ?? 0) ||
          (s(b.id)?.fresh ?? 0) - (s(a.id)?.fresh ?? 0) ||
          (s(b.id)?.total ?? 0) - (s(a.id)?.total ?? 0),
      );
    }
    // "recent" mantiene el orden original (por created_at desc desde la BD)

    return sorted;
  }, [clients, query, statusFilter, sortKey, portalSummaries]);

  // Cambiar de filtro con la página 3 abierta dejaba la tabla vacía.
  useEffect(() => setPage(1), [query, statusFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const visibleFrom = filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const visibleTo = Math.min(filtered.length, current * PAGE_SIZE);
  const columns = showPortal ? 6 : 5;

  const STATUS_TABS: { value: StatusFilter; labelKey: string }[] = [
    { value: "all", labelKey: "clientes.filter.all" },
    { value: "active", labelKey: "clientes.filter.active" },
    { value: "inactive", labelKey: "clientes.filter.inactive" },
  ];

  return (
    <section className="flex flex-col rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      {/* Top: search + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
          <Search size={15} strokeWidth={1.75} className="text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("clientes.search.placeholder")}
            className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-ink/10 bg-white/70 p-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  statusFilter === tab.value
                    ? "bg-ink text-cream-50 shadow-sm"
                    : "text-ink/60 hover:text-ink",
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="appearance-none rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-xs font-medium text-ink/70 transition hover:border-gold/40 focus:border-gold/55 focus:outline-none"
          >
            <option value="recent">{t("clientes.sort.recent")}</option>
            {showPortal && (
              <option value="portalLinks">{t("clientes.sort.portalLinks")}</option>
            )}
            <option value="name">{t("clientes.sort.name")}</option>
            <option value="favorites">{t("clientes.sort.favorites")}</option>
            <option value="visits">{t("clientes.sort.visits")}</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5 text-left text-sm">
          <thead>
            <tr className="crm-table-header text-ink/50">
              <th className="px-3 pb-2">{t("clientes.table.client")}</th>
              <th className="px-3 pb-2">{t("clientes.table.profile")}</th>
              <th className="px-3 pb-2">{t("clientes.table.wants")}</th>
              {showPortal && <th className="px-3 pb-2">{t("clientes.table.portalLinks")}</th>}
              <th className="px-3 pb-2">{t("clientes.table.advisor")}</th>
              <th className="px-3 pb-2 text-right">
                <span className="sr-only">{t("clientes.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns}
                  className="rounded-xl border border-gold/15 bg-white/40 px-4 py-10 text-center text-ink/55"
                >
                  {t("clientes.empty")}
                </td>
              </tr>
            ) : (
              pageRows.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  href={`${prefix}/clientes/${client.id}`}
                  portal={showPortal ? (portalSummaries?.[client.id] ?? null) : undefined}
                  selected={client.id === selectedId}
                  onSelect={onSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gold/15 pt-4 text-xs">
        <p className="text-ink/55">
          {t("clientes.pagination.showing", {
            from: visibleFrom,
            to: visibleTo,
            total: filtered.length,
          })}
        </p>
        <Pagination totalPages={totalPages} currentPage={current} onChange={setPage} />
      </footer>
    </section>
  );
}

/** Singular/plural con el convenio `<clave>.one` del Command Center. */
function useCount() {
  const t = useT();
  return (key: string, count: number) =>
    t(count === 1 && `${key}.one` in dictionary.es ? `${key}.one` : key, { count });
}

function ClientRow({
  client,
  href,
  portal,
  selected,
  onSelect,
}: {
  client: AdminClient;
  href: string;
  /** undefined = columna oculta; null = cliente sin anuncios. */
  portal: PortalLinkSummary | null | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const count = useCount();
  const isActive = client.status === "active";
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const email = realEmail(client.email);
  const contact = email ?? client.phone ?? t("clientes.email.none");
  const isRent = client.operation === "alquiler";

  return (
    <tr
      className={cn(
        "cursor-pointer text-sm transition",
        selected
          ? "bg-cream-100/80 ring-2 ring-gold/40"
          : "bg-white/55 hover:bg-white/85",
      )}
      onClick={() => onSelect(client.id)}
    >
      <td className="rounded-l-xl px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream-50">
            {client.avatarInitials}
            <span
              title={t("clientes.status.dot", { status: t(`clientes.status.${client.status}`) })}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-cream-50",
                isActive ? "bg-emerald-500" : "bg-ink/30",
              )}
            />
          </span>
          <div className="min-w-0">
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium text-ink hover:text-gold-dark hover:underline"
            >
              {fullName || contact}
            </Link>
            <p className={cn("truncate text-xs", email || client.phone ? "text-ink/55" : "text-ink/35")}>
              {contact}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {client.profileTypeKnown === false ? (
          <span className="text-ink/30">—</span>
        ) : (
          <span className="rounded-md border border-ink/10 bg-cream-100/80 px-2.5 py-1 text-xs font-medium text-ink/75">
            {t(PROFILE_KEYS[client.profileType])}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-ink/75">
        <p>
          {t(`filters.operation.${isRent ? "rent" : "sale"}`)}
          {client.preferredZone && client.preferredZone !== "—" && (
            <span className="text-ink/55"> · {client.preferredZone}</span>
          )}
        </p>
        {isRent && (
          <p className="text-xs text-ink/50">
            {t(`card.stay.${client.stayType === "corta" ? "short" : "long"}`)}
          </p>
        )}
      </td>
      {portal !== undefined && (
        <td className="px-3 py-3">
          <PortalCell summary={portal} href={`${href}?tab=properties#portal-links`} count={count} />
        </td>
      )}
      <td className="px-3 py-3 text-ink/75">
        {client.assignedAdvisor || (
          <span className="text-xs text-ink/35">{t("cc.advisor.unassigned")}</span>
        )}
      </td>
      <td className="rounded-r-xl px-3 py-3 text-right">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${t("clientes.table.openFicha")} · ${fullName}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <span className="hidden 2xl:inline">{t("clientes.table.openFicha")}</span>
          <ArrowRight size={12} strokeWidth={1.75} className="text-gold" />
        </Link>
      </td>
    </tr>
  );
}

function PortalCell({
  summary,
  href,
  count,
}: {
  summary: PortalLinkSummary | null;
  href: string;
  count: (key: string, n: number) => string;
}) {
  const t = useT();
  if (!summary || summary.total === 0) return <span className="text-ink/30">—</span>;

  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      title={t("clientes.portal.open")}
      className="group inline-flex flex-col items-start gap-1"
    >
      {summary.toCall > 0 ? (
        <span className="inline-flex items-center whitespace-nowrap gap-1.5 rounded-full border border-gold/45 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold-dark group-hover:border-gold">
          {count("clientes.portal.toCall", summary.toCall)}
        </span>
      ) : (
        <span className="whitespace-nowrap text-xs text-ink/60 group-hover:text-ink">
          {count("clientes.portal.total", summary.total)}
        </span>
      )}
      {summary.fresh > 0 && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink/55">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
          {count("clientes.portal.fresh", summary.fresh)}
        </span>
      )}
    </Link>
  );
}

function Pagination({
  totalPages,
  currentPage,
  onChange,
}: {
  totalPages: number;
  currentPage: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // 1 … (actual-1, actual, actual+1) … última
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "...") pages.push("...");
  }

  return (
    <nav className="flex items-center gap-1">
      <PageButton
        aria-label="Anterior"
        disabled={currentPage === 1}
        onClick={() => onChange(currentPage - 1)}
      >
        <ChevronLeft size={14} strokeWidth={1.75} />
      </PageButton>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-2 text-ink/40">
            …
          </span>
        ) : (
          <PageButton key={p} active={p === currentPage} onClick={() => onChange(p)}>
            {p}
          </PageButton>
        ),
      )}
      <PageButton
        aria-label="Siguiente"
        disabled={currentPage === totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        <ChevronRight size={14} strokeWidth={1.75} />
      </PageButton>
    </nav>
  );
}

function PageButton({
  children,
  active = false,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-gold text-ink"
          : "border border-ink/10 bg-white/70 text-ink/65 hover:border-gold/40 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
