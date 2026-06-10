"use client";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Heart,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import type { AdminClient, ClientProfileType } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-gold/20 text-amber-800",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
];

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "—";
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (d < 60) return "ahora";
  if (d < 3600) return `hace ${Math.floor(d / 60)}m`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)}h`;
  if (d < 604800) return `hace ${Math.floor(d / 86400)}d`;
  return new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

// ─── Profile badge colors ─────────────────────────────────────────────────────

const PROFILE_BADGE: Record<ClientProfileType, string> = {
  student: "border-violet-200 bg-violet-50 text-violet-700",
  worker: "border-blue-200 bg-blue-50 text-blue-700",
  company: "border-amber-200 bg-amber-50 text-amber-700",
};

const PROFILE_KEYS: Record<ClientProfileType, string> = {
  student: "clientes.profile.student",
  worker: "clientes.profile.worker",
  company: "clientes.profile.company",
};

const PAGE_SIZE = 8;

// ─── Table ────────────────────────────────────────────────────────────────────

export function ClientsTable({
  clients,
  totalClients,
  selectedId,
  onSelect,
}: {
  clients: AdminClient[];
  totalClients: number; // total registered — not the visible page count
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.preferredZone.toLowerCase().includes(q),
    );
  }, [clients, query]);

  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const visibleFrom = filtered.length === 0 ? 0 : 1;
  const visibleTo = Math.min(filtered.length, PAGE_SIZE);

  return (
    <section className="flex flex-col rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      {/* Top: search + actions */}
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
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white/70 px-3 py-2 text-[12px] font-medium text-ink/70 transition hover:border-gold/40 hover:text-ink"
          >
            <Filter size={14} strokeWidth={1.75} />
            <span>{t("clientes.filters")}</span>
          </button>
          <button
            type="button"
            aria-label={t("clientes.viewSettings")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 bg-white/70 text-ink/70 transition hover:border-gold/40 hover:text-ink"
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-5 flex-1 overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-y-1.5 text-left text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              <th className="px-3 pb-2">{t("clientes.table.client")}</th>
              <th className="px-3 pb-2">{t("clientes.table.profile")}</th>
              <th className="px-3 pb-2">{t("clientes.table.status")}</th>
              <th className="px-3 pb-2">{t("clientes.table.lastAccess")}</th>
              <th className="px-3 pb-2 text-center">
                <span className="inline-flex items-center gap-1">
                  <Heart size={11} strokeWidth={1.75} />
                  {t("clientes.table.favorites")}
                </span>
              </th>
              <th className="px-3 pb-2 text-center">
                <span className="inline-flex items-center gap-1">
                  <Eye size={11} strokeWidth={1.75} />
                  {t("clientes.table.visits")}
                </span>
              </th>
              <th className="px-3 pb-2 text-right">
                {t("clientes.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center py-16 text-center">
                    <Users size={32} className="mb-3 text-gold/40" />
                    <p className="text-sm font-medium text-ink/55">
                      {t("clientes.empty")}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  selected={client.id === selectedId}
                  onSelect={onSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gold/15 pt-4 text-[12px]">
        <p className="text-ink/55">
          {t("clientes.pagination.showing", {
            from: visibleFrom,
            to: visibleTo,
            total: totalClients,
          })}
        </p>
        <Pagination totalPages={totalPages} currentPage={1} />
      </footer>
    </section>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ClientRow({
  client,
  selected,
  onSelect,
}: {
  client: AdminClient;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const isActive = client.status === "active";
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const initials = getInitials(fullName || client.email);
  const avatarColor = getAvatarColor(fullName || client.email);

  // Relative last-seen: prefer updatedAt from the row, fall back to legacy label fields
  const lastSeen: string = (() => {
    if (client.updatedAt) return timeAgo(client.updatedAt);
    if (client.lastAccessLabelKey) {
      return t(client.lastAccessLabelKey, {
        time: client.lastAccessValue ?? "",
      });
    }
    return client.lastAccessText ?? "—";
  })();

  return (
    <tr
      className={cn(
        "cursor-pointer text-[13px] transition",
        selected
          ? "bg-cream-100/80 ring-2 ring-gold/40"
          : "bg-white/55 hover:bg-white/85",
      )}
      onClick={() => onSelect(client.id)}
    >
      {/* Client: avatar + name + email */}
      <td className="rounded-l-xl px-3 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              avatarColor,
            )}
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{fullName}</p>
            <p className="truncate text-[11px] text-ink/55">{client.email}</p>
          </div>
        </div>
      </td>

      {/* Profile badge */}
      <td className="px-3 py-3">
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            PROFILE_BADGE[client.profileType],
          )}
        >
          {t(PROFILE_KEYS[client.profileType])}
        </span>
      </td>

      {/* Status dot + label */}
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5 text-[12px] text-ink/75">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isActive ? "bg-emerald-500" : "bg-ink/30",
            )}
          />
          {t(`clientes.status.${client.status}`)}
        </span>
      </td>

      {/* Last access relative */}
      <td className="px-3 py-3 text-[12px] text-ink/65">{lastSeen}</td>

      {/* Favorites count */}
      <td className="px-3 py-3 text-center">
        <span className="inline-flex items-center gap-1 text-[12px] text-ink/70">
          <Heart
            size={12}
            strokeWidth={1.75}
            className={
              client.activity.favorites > 0
                ? "fill-rose-400 text-rose-400"
                : "text-ink/30"
            }
          />
          {client.activity.favorites}
        </span>
      </td>

      {/* Visits count */}
      <td className="px-3 py-3 text-center">
        <span className="inline-flex items-center gap-1 text-[12px] text-ink/70">
          <Eye
            size={12}
            strokeWidth={1.75}
            className={
              client.activity.visitsRequested > 0 ? "text-gold" : "text-ink/30"
            }
          />
          {client.activity.visitsRequested}
        </span>
      </td>

      {/* Actions */}
      <td className="rounded-r-xl px-3 py-3 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(client.id);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-cream-50 transition hover:bg-ink-soft"
        >
          <span>{t("clientes.table.viewDetails")}</span>
          <ArrowRight size={12} strokeWidth={1.75} className="text-gold" />
        </button>
      </td>
    </tr>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  totalPages,
  currentPage,
}: {
  totalPages: number;
  currentPage: number;
}) {
  const pages: (number | "...")[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1, 2, 3, "...", totalPages);
  }

  return (
    <nav className="flex items-center gap-1">
      <PageButton aria-label="Previous">
        <ChevronLeft size={14} strokeWidth={1.75} />
      </PageButton>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="px-2 text-ink/40">
            …
          </span>
        ) : (
          <PageButton key={p} active={p === currentPage}>
            {p}
          </PageButton>
        ),
      )}
      <PageButton aria-label="Next">
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
        "flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[12px] font-medium transition",
        active
          ? "bg-gold text-ink"
          : "border border-ink/10 bg-white/70 text-ink/65 hover:border-gold/40 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
