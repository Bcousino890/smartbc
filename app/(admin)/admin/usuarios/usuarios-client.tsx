"use client";

import { Check, Loader2, Mail, Plus, Search, UserCog, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import type {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const ROLE_BADGE: Record<InternalUserRole, string> = {
  owner:        "border-violet-200 bg-violet-50 text-violet-700",
  admin:        "border-emerald-200 bg-emerald-50 text-emerald-700",
  advisor:      "border-blue-200 bg-blue-50 text-blue-700",
  client:       "border-amber-200 bg-amber-50 text-amber-700",
  viewer:       "border-ink/15 bg-ink/5 text-ink/65",
  agent_junior: "border-sky-200 bg-sky-50 text-sky-700",
  agent_senior: "border-indigo-200 bg-indigo-50 text-indigo-700",
  agent_admin:  "border-purple-200 bg-purple-50 text-purple-700",
};

const ROLE_LABEL: Record<InternalUserRole, string> = {
  owner:        "Propietario",
  admin:        "Administrador",
  advisor:      "Asesor",
  client:       "Cliente",
  viewer:       "Visualizador",
  agent_junior: "Agente Junior",
  agent_senior: "Agente Senior",
  agent_admin:  "Agente Admin",
};

const STATUS_BADGE: Record<InternalUserStatus, string> = {
  active: "bg-emerald-500",
  invited: "bg-amber-500",
  suspended: "bg-ink/30",
};

// ─── Modal crear usuario ──────────────────────────────────────────────────

interface CreateUserModalProps {
  userRole: InternalUserRole;
  advisors: InternalUser[];
  modalType: "advisor" | "client";
  onClose: () => void;
  onSuccess?: () => void;
}

function CreateUserModal({
  userRole,
  advisors,
  modalType,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedAdvisor, setAssignedAdvisor] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const payload = {
        email,
        firstName,
        lastName,
        phone: modalType === "client" ? phone : undefined,
        role: modalType === "advisor" ? "advisor" : "client",
        assignedAdvisorId:
          modalType === "client" && assignedAdvisor ? assignedAdvisor : undefined,
        password: modalType === "advisor" ? password : undefined,
      };

      const res = await fetch("/api/admin/usuarios/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Error desconocido");
        return;
      }

      setStatus("success");
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 1800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
    }
  };

  const modalTitle =
    modalType === "advisor" ? "Crear asesor" : "Crear cliente";
  const submitLabel =
    modalType === "advisor"
      ? "Crear asesor"
      : "Crear cliente";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-cream-50 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-ink">
            {modalTitle}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Check size={24} strokeWidth={2} className="text-emerald-600" />
            </span>
            <p className="font-medium text-ink">
              {modalType === "advisor"
                ? "Asesor creado exitosamente"
                : "Cliente creado exitosamente"}
            </p>
            <p className="text-sm text-ink/55">{email}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Nombre
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Juan"
                  required
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Apellido
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="García"
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
                autoFocus
                className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
              />
            </div>

            {modalType === "client" && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+34 600 123 456"
                    className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                  />
                </div>

                {userRole === "admin" && advisors.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                      Asignado a (Asesor)
                    </label>
                    <select
                      value={assignedAdvisor}
                      onChange={(e) => setAssignedAdvisor(e.target.value)}
                      className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink focus:border-gold/55 focus:outline-none"
                    >
                      <option value="">Sin asignar</option>
                      {advisors.map((advisor) => (
                        <option key={advisor.id} value={advisor.id}>
                          {advisor.firstName} {advisor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {modalType === "advisor" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>
            )}

            {status === "error" && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm text-ink/65 transition hover:border-ink/20 hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!email || !firstName || status === "loading"}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
              >
                {status === "loading" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} strokeWidth={1.75} />
                )}
                {submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Fila de usuario ─────────────────────────────────────────────────────

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
            ROLE_BADGE[user.roleKey]
          )}
        >
          {ROLE_LABEL[user.roleKey] ?? user.roleKey}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5 text-[12px] text-ink/75">
          <span className={cn("h-2 w-2 rounded-full", STATUS_BADGE[user.status])} />
          {user.status === "active"
            ? "Activo"
            : user.status === "invited"
              ? "Invitado"
              : "Suspendido"}
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
            <span>Reenviar invitación</span>
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition hover:bg-white"
          >
            <UserCog size={12} strokeWidth={1.75} />
            <span>Editar</span>
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

interface UsuariosClientProps {
  users: InternalUser[];
  currentUserRole: InternalUserRole;
}

export function UsuariosClient({
  users,
  currentUserRole,
}: UsuariosClientProps) {
  const t = useT();
  const [queryAdvisors, setQueryAdvisors] = useState("");
  const [queryAgents, setQueryAgents] = useState("");
  const [queryClients, setQueryClients] = useState("");
  const [showCreateAdvisor, setShowCreateAdvisor] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Separar por tipo de usuario
  const advisors = useMemo(() => users.filter((u) => u.roleKey === "advisor"), [users]);
  const agents   = useMemo(
    () => users.filter((u) => ["agent_junior", "agent_senior", "agent_admin"].includes(u.roleKey)),
    [users],
  );
  const clients  = useMemo(() => users.filter((u) => u.roleKey === "client"), [users]);

  // Filtrar
  const filteredAdvisors = useMemo(() => {
    const q = queryAdvisors.trim().toLowerCase();
    if (!q) return advisors;
    return advisors.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [advisors, queryAdvisors]);

  const filteredAgents = useMemo(() => {
    const q = queryAgents.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [agents, queryAgents]);

  const filteredClients = useMemo(() => {
    const q = queryClients.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [clients, queryClients]);

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Solo admin/owner puede ver asesores y agentes
  const isAdmin = currentUserRole === "admin" || currentUserRole === "owner" || currentUserRole === "agent_admin";

  return (
    <>
      {showCreateAdvisor && (
        <CreateUserModal
          userRole={currentUserRole}
          advisors={advisors}
          modalType="advisor"
          onClose={() => setShowCreateAdvisor(false)}
          onSuccess={handleSuccess}
        />
      )}
      {showCreateClient && (
        <CreateUserModal
          userRole={currentUserRole}
          advisors={advisors}
          modalType="client"
          onClose={() => setShowCreateClient(false)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Sección 1: Asesores (solo admin) */}
      {isAdmin && (
        <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <h2 className="mb-5 font-serif text-lg font-semibold text-ink">
            Asesores
          </h2>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
              <Search size={15} strokeWidth={1.75} className="text-ink/45" />
              <input
                type="search"
                value={queryAdvisors}
                onChange={(e) => setQueryAdvisors(e.target.value)}
                placeholder="Buscar asesores..."
                className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowCreateAdvisor(true)}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80"
            >
              <Plus size={14} strokeWidth={1.75} className="text-gold" />
              <span>Crear asesor</span>
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                  <th className="px-3 pb-2">Usuario</th>
                  <th className="px-3 pb-2">Rol</th>
                  <th className="px-3 pb-2">Estado</th>
                  <th className="px-3 pb-2">Último acceso</th>
                  <th className="px-3 pb-2">Se unió</th>
                  <th className="px-3 pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvisors.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
            {filteredAdvisors.length === 0 && (
              <p className="mt-4 text-center text-sm text-ink/55">
                No hay asesores que coincidan con tu búsqueda.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Sección 2: Agentes inmobiliarios (solo admin) */}
      {isAdmin && agents.length > 0 && (
        <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <h2 className="mb-5 font-serif text-lg font-semibold text-ink">
            Agentes Inmobiliarios
          </h2>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
              <Search size={15} strokeWidth={1.75} className="text-ink/45" />
              <input
                type="search"
                value={queryAgents}
                onChange={(e) => setQueryAgents(e.target.value)}
                placeholder="Buscar agentes..."
                className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                  <th className="px-3 pb-2">Usuario</th>
                  <th className="px-3 pb-2">Rol</th>
                  <th className="px-3 pb-2">Estado</th>
                  <th className="px-3 pb-2">Último acceso</th>
                  <th className="px-3 pb-2">Se unió</th>
                  <th className="px-3 pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((u) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </tbody>
            </table>
            {filteredAgents.length === 0 && (
              <p className="mt-4 text-center text-sm text-ink/55">
                No hay agentes que coincidan con tu búsqueda.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Sección 3: Clientes */}
      <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <h2 className="mb-5 font-serif text-lg font-semibold text-ink">
          Clientes
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
            <Search size={15} strokeWidth={1.75} className="text-ink/45" />
            <input
              type="search"
              value={queryClients}
              onChange={(e) => setQueryClients(e.target.value)}
              placeholder="Buscar clientes..."
              className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowCreateClient(true)}
            className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80"
          >
            <Plus size={14} strokeWidth={1.75} className="text-gold" />
            <span>Crear cliente</span>
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                <th className="px-3 pb-2">Usuario</th>
                <th className="px-3 pb-2">Rol</th>
                <th className="px-3 pb-2">Estado</th>
                <th className="px-3 pb-2">Último acceso</th>
                <th className="px-3 pb-2">Se unió</th>
                <th className="px-3 pb-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
          {filteredClients.length === 0 && (
            <p className="mt-4 text-center text-sm text-ink/55">
              No hay clientes que coincidan con tu búsqueda.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
