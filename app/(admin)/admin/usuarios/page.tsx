"use client";

import { Mail, Plus, Search, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { useT } from "@/lib/i18n/provider";
import { mockInternalUsers } from "@/lib/mock-admin-extras";
import type {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<InternalUserRole, string> = {
  owner: "border-violet-200 bg-violet-50 text-violet-700",
  admin: "border-emerald-200 bg-emerald-50 text-emerald-700",
  advisor: "border-blue-200 bg-blue-50 text-blue-700",
  viewer: "border-ink/15 bg-ink/5 text-ink/65",
};

const STATUS_BADGE: Record<InternalUserStatus, string> = {
  active: "bg-emerald-500",
  invited: "bg-amber-500",
  suspended: "bg-ink/30",
};

export default function AdminUsuariosPage() {
  const t = useT();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mockInternalUsers;
    return mockInternalUsers.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="usuarios.title"
        subtitleKey="usuarios.subtitle"
      />

      <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
            <Search size={15} strokeWidth={1.75} className="text-ink/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("usuarios.search.placeholder")}
              className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink-soft"
          >
            <Plus size={14} strokeWidth={1.75} className="text-gold" />
            <span>{t("usuarios.invite")}</span>
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                <th className="px-3 pb-2">{t("usuarios.table.user")}</th>
                <th className="px-3 pb-2">{t("usuarios.table.role")}</th>
                <th className="px-3 pb-2">{t("usuarios.table.status")}</th>
                <th className="px-3 pb-2">
                  {t("usuarios.table.lastLogin")}
                </th>
                <th className="px-3 pb-2">{t("usuarios.table.joined")}</th>
                <th className="px-3 pb-2 text-right">
                  {t("usuarios.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}

function UserRow({ user }: { user: InternalUser }) {
  const t = useT();
  const isInvited = user.status === "invited";
  return (
    <tr className="bg-white/55 transition hover:bg-white/85">
      <td className="rounded-l-xl px-3 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-[10px] font-medium text-cream-50">
            {user.initials}
          </span>
          <div>
            <p className="font-medium text-ink">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-[11px] text-ink/55">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-[11px] font-medium",
            ROLE_BADGE[user.roleKey],
          )}
        >
          {t(`usuarios.role.${user.roleKey}`)}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5 text-[12px] text-ink/75">
          <span
            className={cn("h-2 w-2 rounded-full", STATUS_BADGE[user.status])}
          />
          {t(`usuarios.status.${user.status}`)}
        </span>
      </td>
      <td className="px-3 py-3 text-[12px] text-ink/65">
        {user.lastLoginText ?? "—"}
      </td>
      <td className="px-3 py-3 text-[12px] text-ink/65">{user.joinedLabel}</td>
      <td className="rounded-r-xl px-3 py-3 text-right">
        {isInvited ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
          >
            <Mail size={12} strokeWidth={1.75} />
            <span>{t("usuarios.action.resendInvite")}</span>
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition hover:bg-white"
          >
            <UserCog size={12} strokeWidth={1.75} />
            <span>{t("usuarios.action.edit")}</span>
          </button>
        )}
      </td>
    </tr>
  );
}
