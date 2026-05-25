"use client";

import {
  BarChart3,
  Building2,
  ClipboardList,
  Home,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { useT } from "@/lib/i18n/provider";
import type { AdminUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/agencias", labelKey: "admin.nav.agencias", icon: Building2 },
  { href: "/admin/propiedades", labelKey: "admin.nav.propiedades", icon: Home },
  { href: "/admin/clientes", labelKey: "admin.nav.clientes", icon: Users },
  {
    href: "/admin/solicitudes",
    labelKey: "admin.nav.solicitudes",
    icon: ClipboardList,
  },
  {
    href: "/admin/mensajes",
    labelKey: "admin.nav.mensajes",
    icon: MessageSquare,
  },
  {
    href: "/admin/sindicacion",
    labelKey: "admin.nav.sindicacion",
    icon: Radio,
  },
  { href: "/admin/reportes", labelKey: "admin.nav.reportes", icon: BarChart3 },
  { href: "/admin/usuarios", labelKey: "admin.nav.usuarios", icon: UserCog },
  {
    href: "/admin/configuracion",
    labelKey: "admin.nav.configuracion",
    icon: Settings,
  },
] as const;

export function AdminSidebar({ user }: { user: AdminUser }) {
  const t = useT();
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-[260px] flex-col bg-ink text-cream-50">
      {/* Logo (white via CSS filter trick: brightness 0 turns the dark navy
          PNG to pure black, invert flips it to white) */}
      <div className="flex flex-col items-center px-6 pt-7">
        <Image
          src="/logo.png"
          alt="Benjamín Cousiño Propiedades"
          width={420}
          height={Math.round(420 * (519 / 3282))}
          priority
          className="h-auto w-full select-none"
          style={{ filter: "brightness(0) invert(1)" }}
        />
      </div>

      <p className="mt-7 px-6 text-[10px] font-semibold tracking-[0.18em] text-gold/85">
        {t("admin.section.label")}
      </p>

      <nav className="mt-3 flex-1 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-cream-50/8 text-gold"
                      : "text-cream-50/70 hover:bg-cream-50/5 hover:text-cream-50",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span>{t(labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="m-3 rounded-xl border border-cream-50/10 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-50/10 font-serif text-[11px] font-medium text-cream-50">
            {user.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-cream-50/55">
              {t(user.roleKey)}
            </p>
          </div>
        </div>
        <form action={signOutAction} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-cream-50/15 py-2 text-[11px] text-cream-50/70 transition hover:bg-cream-50/5 hover:text-cream-50"
          >
            <LogOut size={13} strokeWidth={1.75} />
            <span>{t("sidebar.logout")}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
