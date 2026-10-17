"use client";

import { ChevronDown, Plus, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { InternalUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { RoleBadge } from "@/components/admin/permissions/role-badge";
import { staffGroup } from "@/lib/auth/role-model";
import type { ModalType } from "./usuarios-client";

const COUNTRY_FLAG: Record<string, string> = { es: "🇪🇸", cl: "🇨🇱" };
const COUNTRY_NAME: Record<string, string> = { es: "España", cl: "Chile" };
const PAGE_SIZE = 25;

type TabId = "all" | "admins" | "advisors" | "captadoras" | "clients" | "others";
type StatusFilter = "all" | "active" | "suspended";

const CREATE_LABEL: Record<ModalType, string> = {
  admin: "Administrador",
  advisor: "Asesor",
  captadora: "Captadora",
  client: "Cliente",
};

function tabOf(u: InternalUser): TabId {
  const g = staffGroup(u.roleKey);
  if (g === "admins") return "admins";
  if (g === "advisors") return "advisors";
  if (g === "captadoras") return "captadoras";
  if (u.roleKey === "client") return "clients";
  return "others";
}

const userCountries = (u: InternalUser) => u.countries ?? (u.country ? [u.country] : []);
const fullName = (u: InternalUser) => `${u.firstName} ${u.lastName}`.trim();

interface UsersDirectoryProps {
  users: InternalUser[];
  isAdmin: boolean;
  country: string;
  onCreate: (type: ModalType) => void;
  onEdit: (user: InternalUser) => void;
  onPermissions: (user: InternalUser) => void;
}

export function UsersDirectory({ users, isAdmin, country, onCreate, onEdit, onPermissions }: UsersDirectoryProps) {
  const [tab, setTab] = useState<TabId>(isAdmin ? "all" : "clients");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Quien no es admin solo gestiona clientes (y ve el resto sin tocarlo).
  const visible = useMemo(
    () => (isAdmin ? users : users.filter((u) => tabOf(u) === "clients" || tabOf(u) === "others")),
    [users, isAdmin],
  );

  const counts = useMemo(() => {
    const c: Record<TabId, number> = { all: visible.length, admins: 0, advisors: 0, captadoras: 0, clients: 0, others: 0 };
    for (const u of visible) c[tabOf(u)] += 1;
    return c;
  }, [visible]);

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string }[] = [];
    if (isAdmin) {
      list.push({ id: "all", label: "Todos" }, { id: "admins", label: "Administradores" }, { id: "advisors", label: "Asesores" });
      if (country === "cl" || counts.captadoras > 0) list.push({ id: "captadoras", label: "Captadoras" });
    }
    list.push({ id: "clients", label: "Clientes" });
    if (counts.others > 0) list.push({ id: "others", label: "Otros" });
    return list;
  }, [isAdmin, country, counts]);

  useEffect(() => setLimit(PAGE_SIZE), [tab, query, status, countryFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((u) => {
      if (tab !== "all" && tabOf(u) !== tab) return false;
      if (status !== "all" && (status === "suspended") !== (u.status === "suspended")) return false;
      if (countryFilter !== "all" && !userCountries(u).includes(countryFilter)) return false;
      if (!q) return true;
      return fullName(u).toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [visible, tab, status, countryFilter, query]);

  const shown = filtered.slice(0, limit);
  const hasFilters = query !== "" || status !== "all" || countryFilter !== "all";

  const createOptions: ModalType[] = isAdmin
    ? ["admin", "advisor", ...(country === "cl" || counts.captadoras > 0 ? (["captadora"] as ModalType[]) : []), "client"]
    : ["client"];
  const tabCreate: Partial<Record<TabId, ModalType>> = {
    admins: "admin",
    advisors: "advisor",
    captadoras: "captadora",
    clients: "client",
  };
  const contextual = tabCreate[tab];

  return (
    <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-4 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      {/* Pestañas */}
      <div role="tablist" aria-label="Tipo de usuario" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                active ? "bg-ink text-cream-50" : "text-ink/60 hover:bg-ink/5 hover:text-ink",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                  active ? "bg-cream-50/20 text-cream-50" : "bg-ink/8 text-ink/55",
                )}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "captadoras" && (
        <p className="mt-3 text-sm text-ink/55">Trabajan solo en Chile y solo ven las captaciones que se les asignan.</p>
      )}

      {/* Barra de herramientas */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
          <Search size={15} strokeWidth={1.75} className="text-ink/45" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar usuarios"
            className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="Filtrar por estado"
          className="rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/75 focus:border-gold/55 focus:outline-none"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="suspended">Suspendidos</option>
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          aria-label="Filtrar por país"
          className="rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/75 focus:border-gold/55 focus:outline-none"
        >
          <option value="all">Todos los países</option>
          <option value="es">🇪🇸 España</option>
          <option value="cl">🇨🇱 Chile</option>
        </select>
        <CreateButton options={createOptions} contextual={contextual} onCreate={onCreate} />
      </div>

      {/* Resultado */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={tab === "admins" ? <UserCog size={24} /> : <Users size={24} />}
          title={hasFilters ? "Sin resultados" : "No hay usuarios en esta lista"}
          description={hasFilters ? "Prueba con otra búsqueda o quita los filtros." : "Crea el primero con el botón «Crear»."}
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setCountryFilter("all");
                }}
                className="rounded-xl border border-ink/10 px-4 py-2 text-sm font-medium text-ink/70 transition hover:text-ink"
              >
                Quitar filtros
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mt-4 text-xs text-ink/50" aria-live="polite">
            {filtered.length === 1 ? "1 usuario" : `${filtered.length} usuarios`}
          </p>

          {/* Tabla (≥ md) */}
          <div className="mt-2 hidden md:block">
            <table className="w-full table-fixed border-separate border-spacing-y-1.5 text-left text-sm">
              <thead>
                <tr className="crm-table-header text-ink/50">
                  <th className="w-[27%] px-3 pb-2">Usuario</th>
                  <th className="w-[18%] px-3 pb-2">Perfil</th>
                  <th className="w-[8%] px-3 pb-2">País</th>
                  <th className="w-[12%] px-3 pb-2">Estado</th>
                  <th className="hidden w-[10%] px-3 pb-2 lg:table-cell">Último acceso</th>
                  <th className="w-[200px] px-3 pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className={cn("bg-white/55 transition hover:bg-white/85", u.status === "suspended" && "opacity-65")}>
                    <td className="rounded-l-xl px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{fullName(u)}</p>
                          <p className="truncate text-xs text-ink/55">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <RoleBadge role={u.roleKey} />
                    </td>
                    <td className="px-3 py-3">
                      <Flags user={u} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={u.status} />
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-ink/65 lg:table-cell">{u.lastLoginText ?? "—"}</td>
                    <td className="rounded-r-xl px-3 py-3 text-right">
                      <Actions user={u} onEdit={onEdit} onPermissions={onPermissions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (< md) */}
          <ul className="mt-2 space-y-2 md:hidden">
            {shown.map((u) => (
              <li
                key={u.id}
                className={cn("rounded-xl border border-ink/8 bg-white/70 p-3.5", u.status === "suspended" && "opacity-70")}
              >
                <div className="flex items-start gap-3">
                  <Avatar user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{fullName(u)}</p>
                    <p className="truncate text-xs text-ink/55">{u.email}</p>
                  </div>
                  <StatusPill status={u.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RoleBadge role={u.roleKey} layout="inline" />
                    <Flags user={u} />
                  </div>
                  <Actions user={u} onEdit={onEdit} onPermissions={onPermissions} />
                </div>
              </li>
            ))}
          </ul>

          {filtered.length > shown.length && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="rounded-xl border border-ink/10 bg-white/70 px-5 py-2 text-sm font-medium text-ink/70 transition hover:text-ink"
              >
                Mostrar más ({filtered.length - shown.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Avatar({ user }: { user: InternalUser }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-cream-50">
      {user.initials}
    </span>
  );
}

function Flags({ user }: { user: InternalUser }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {userCountries(user).map((c) => (
        <span
          key={c}
          title={COUNTRY_NAME[c] ?? c}
          className="inline-flex items-center rounded-md border border-ink/10 bg-white/70 px-1.5 py-0.5 text-sm leading-none"
        >
          {COUNTRY_FLAG[c] ?? c}
        </span>
      ))}
    </span>
  );
}

function StatusPill({ status }: { status: InternalUser["status"] }) {
  const dot = status === "active" ? "bg-emerald-500" : status === "invited" ? "bg-amber-500" : "bg-rose-400";
  const label = status === "active" ? "Activo" : status === "invited" ? "Invitado" : "Suspendido";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink/75">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </span>
  );
}

function Actions({
  user,
  onEdit,
  onPermissions,
}: {
  user: InternalUser;
  onEdit: (u: InternalUser) => void;
  onPermissions: (u: InternalUser) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {user.roleKey !== "client" && (
        <button
          type="button"
          onClick={() => onPermissions(user)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-gold/20"
        >
          <ShieldCheck size={13} strokeWidth={1.75} />
          Permisos
        </button>
      )}
      <button
        type="button"
        onClick={() => onEdit(user)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-white hover:text-ink"
      >
        <UserCog size={13} strokeWidth={1.75} />
        Editar
      </button>
    </span>
  );
}

function CreateButton({
  options,
  contextual,
  onCreate,
}: {
  options: ModalType[];
  contextual?: ModalType;
  onCreate: (t: ModalType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const cls =
    "inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80";

  if (contextual) {
    return (
      <button type="button" onClick={() => onCreate(contextual)} className={cls}>
        <Plus size={14} strokeWidth={1.75} className="text-gold" />
        Crear {CREATE_LABEL[contextual].toLowerCase()}
      </button>
    );
  }
  if (options.length === 1) {
    return (
      <button type="button" onClick={() => onCreate(options[0])} className={cls}>
        <Plus size={14} strokeWidth={1.75} className="text-gold" />
        Crear {CREATE_LABEL[options[0]].toLowerCase()}
      </button>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={cls}>
        <Plus size={14} strokeWidth={1.75} className="text-gold" />
        Crear
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1.5 w-48 rounded-xl border border-ink/10 bg-cream-50 p-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate(o);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink/80 transition hover:bg-ink/5 hover:text-ink"
            >
              {CREATE_LABEL[o]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
