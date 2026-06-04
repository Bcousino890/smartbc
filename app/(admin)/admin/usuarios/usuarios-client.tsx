"use client";

import { Check, Loader2, Mail, Plus, Search, ShieldCheck, UserCog, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type ModalType = "admin" | "advisor" | "client";

interface CreateUserModalProps {
  userRole: InternalUserRole;
  advisors: InternalUser[];
  modalType: ModalType;
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
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
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
        role: modalType,
        assignedAdvisorId:
          modalType === "client" && assignedAdvisor ? assignedAdvisor : undefined,
        password: modalType !== "client" ? password : undefined,
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
    modalType === "admin"
      ? "Crear administrador"
      : modalType === "advisor"
        ? "Crear asesor"
        : "Crear cliente";

  const needsPassword = modalType === "admin" || modalType === "advisor";

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
          <h2 className="font-serif text-xl font-semibold text-ink">{modalTitle}</h2>
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
              {modalType === "admin"
                ? "Administrador creado exitosamente"
                : modalType === "advisor"
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

            {needsPassword && (
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
                disabled={
                  !email ||
                  !firstName ||
                  (needsPassword && !password) ||
                  status === "loading"
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
              >
                {status === "loading" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Plus size={15} strokeWidth={1.75} />
                )}
                {modalTitle}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal editar usuario ─────────────────────────────────────────────────

interface EditUserModalProps {
  user: InternalUser;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditUserModal({ user, onClose, onSuccess }: EditUserModalProps) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InternalUserRole>(user.roleKey);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isClient = user.roleKey === "client";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const payload: Record<string, unknown> = {
        userId: user.id,
        firstName,
        lastName,
        role,
      };
      if (isClient && phone) payload.phone = phone;
      if (newPassword) payload.password = newPassword;

      const res = await fetch("/api/admin/usuarios/update", {
        method: "PATCH",
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
      }, 1500);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
    }
  };

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
          <h2 className="font-serif text-xl font-semibold text-ink">Editar usuario</h2>
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
            <p className="font-medium text-ink">Cambios guardados</p>
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
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
              </div>
            </div>

            {isClient && (
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
            )}

            {!isClient && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Rol
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as InternalUserRole)}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink focus:border-gold/55 focus:outline-none"
                >
                  <option value="admin">Administrador</option>
                  <option value="advisor">Asesor</option>
                </select>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Nueva contraseña{" "}
                <span className="font-normal normal-case text-ink/40">(dejar vacío para no cambiar)</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
              />
            </div>

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
                disabled={!firstName || status === "loading"}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
              >
                {status === "loading" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} strokeWidth={2} />
                )}
                Guardar cambios
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Permisos modal ───────────────────────────────────────────────────────

const PERM_RESOURCES: { key: string; label: string }[] = [
  { key: "properties",   label: "Propiedades"  },
  { key: "particulares", label: "Particulares" },
  { key: "clientes",     label: "Clientes"     },
  { key: "solicitudes",  label: "Solicitudes"  },
  { key: "mensajes",     label: "Mensajes"     },
  { key: "reportes",     label: "Reportes"     },
  { key: "usuarios",     label: "Usuarios"     },
  { key: "configuracion",label: "Configuración"},
];

const PERM_ACTIONS: { key: string; label: string }[] = [
  { key: "view",   label: "Ver"      },
  { key: "edit",   label: "Editar"   },
  { key: "create", label: "Crear"    },
  { key: "delete", label: "Eliminar" },
  { key: "export", label: "Exportar" },
];

type PermValue = true | false | "override_true" | "override_false";
type PermissionsMap = Record<string, Record<string, PermValue>>;

// Returns whether the effective permission is "on"
function isEffectivelyAllowed(v: PermValue): boolean {
  return v === true || v === "override_true";
}

// Returns whether this cell has been manually overridden
function isOverride(v: PermValue): boolean {
  return v === "override_true" || v === "override_false";
}

interface PermissionsModalProps {
  user: InternalUser;
  onClose: () => void;
}

function PermissionsModal({ user, onClose }: PermissionsModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("");
  // local editable state: true/false (flat override values chosen by user)
  // null means "use role default" (no override)
  const [localOverrides, setLocalOverrides] = useState<Record<string, Record<string, boolean | null>>>({});
  // fetched from server — role defaults + existing overrides
  const [fetched, setFetched] = useState<PermissionsMap>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/usuarios/${user.id}/permissions`)
      .then((r) => r.json())
      .then((data: { role: string; permissions: PermissionsMap }) => {
        if (cancelled) return;
        setRole(data.role);
        setFetched(data.permissions ?? {});
        // Initialise local overrides from server override values
        const init: Record<string, Record<string, boolean | null>> = {};
        for (const res of PERM_RESOURCES) {
          init[res.key] = {};
          for (const act of PERM_ACTIONS) {
            const val = data.permissions?.[res.key]?.[act.key];
            if (val === "override_true")  init[res.key][act.key] = true;
            else if (val === "override_false") init[res.key][act.key] = false;
            else init[res.key][act.key] = null; // role default, no override
          }
        }
        setLocalOverrides(init);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user.id]);

  // Effective value for a cell, combining role default + local override
  function effectiveValue(resource: string, action: string): boolean {
    const override = localOverrides[resource]?.[action];
    if (override !== null && override !== undefined) return override;
    const serverVal = fetched[resource]?.[action];
    return isEffectivelyAllowed(serverVal ?? false);
  }

  function hasLocalOverride(resource: string, action: string): boolean {
    return localOverrides[resource]?.[action] !== null &&
           localOverrides[resource]?.[action] !== undefined;
  }

  // Clicking a checkbox cycles through: role-default → override(opposite) → back
  function toggleCell(resource: string, action: string) {
    const currentLocalOverride = localOverrides[resource]?.[action] ?? null;
    const roleDefault = (() => {
      const serverVal = fetched[resource]?.[action];
      if (serverVal === "override_true" || serverVal === "override_false") {
        // We ignore the server override here — look at what role alone gives
        // We don't track original role default separately, so derive it:
        // role default = server value if it's a plain boolean
        return false; // safe fallback
      }
      return serverVal as boolean;
    })();

    setLocalOverrides((prev) => {
      const next = { ...prev, [resource]: { ...prev[resource] } };
      if (currentLocalOverride === null) {
        // No override → set override to the opposite of effective (which is roleDefault)
        const eff = effectiveValue(resource, action);
        next[resource][action] = !eff;
      } else {
        // Has override → remove override (revert to role default)
        next[resource][action] = null;
      }
      return next;
    });
    void roleDefault; // suppress unused warning
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    setErrorMsg("");

    // Build overrides array — only cells where localOverrides[r][a] !== null
    const overrides: { resource: string; action: string; allowed: boolean }[] = [];
    for (const res of PERM_RESOURCES) {
      for (const act of PERM_ACTIONS) {
        const val = localOverrides[res.key]?.[act.key] ?? null;
        if (val !== null) {
          overrides.push({ resource: res.key, action: act.key, allowed: val });
        }
      }
    }

    try {
      const res = await fetch(`/api/admin/usuarios/${user.id}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus("error");
        setErrorMsg(data.error ?? "Error desconocido");
      } else {
        setSaveStatus("success");
        setTimeout(onClose, 1600);
      }
    } catch (err) {
      setSaveStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col rounded-2xl bg-cream-50 shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ink/8 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-[10px] font-medium text-cream-50">
              {user.initials}
            </span>
            <div>
              <p className="font-medium text-ink">
                {user.firstName} {user.lastName}
              </p>
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                  ROLE_BADGE[user.roleKey],
                )}
              >
                {ROLE_LABEL[user.roleKey] ?? role}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-ink/40 hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {saveStatus === "success" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Check size={24} strokeWidth={2} className="text-emerald-600" />
              </span>
              <p className="font-medium text-ink">Permisos guardados</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={24} className="animate-spin text-ink/40" />
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] text-ink/60">
                <span className="flex items-center gap-1.5">
                  <span className="h-3.5 w-3.5 rounded border border-ink/20 bg-white" />
                  Por defecto (denegado)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-ink/20 bg-ink/8">
                    <Check size={8} strokeWidth={3} className="text-ink/40" />
                  </span>
                  Por rol (permitido)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-blue-400 bg-blue-500">
                    <Check size={8} strokeWidth={3} className="text-white" />
                  </span>
                  Permiso manual (override)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-red-300 bg-red-50">
                    <X size={8} strokeWidth={3} className="text-red-400" />
                  </span>
                  Denegado manual (override)
                </span>
              </div>

              {/* Matrix */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                      <th className="pb-2 pr-3 text-left">Recurso</th>
                      {PERM_ACTIONS.map((a) => (
                        <th key={a.key} className="px-2 pb-2 text-center">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERM_RESOURCES.map((res, i) => (
                      <tr
                        key={res.key}
                        className={cn(
                          "border-t border-ink/6",
                          i === 0 && "border-t-0",
                        )}
                      >
                        <td className="py-2.5 pr-3 font-medium text-ink">
                          {res.label}
                        </td>
                        {PERM_ACTIONS.map((act) => {
                          const eff = effectiveValue(res.key, act.key);
                          const hasOverrideLocal = hasLocalOverride(res.key, act.key);
                          const serverVal = fetched[res.key]?.[act.key];
                          const roleAllowed =
                            !hasOverrideLocal && isEffectivelyAllowed(serverVal ?? false);
                          const isServerOverride = isOverride(serverVal ?? false);

                          // Determine visual state
                          let cellStyle = "";
                          let iconEl: React.ReactNode = null;

                          if (hasOverrideLocal) {
                            if (eff) {
                              // manual override TRUE (blue)
                              cellStyle =
                                "border-blue-400 bg-blue-500 hover:bg-blue-600";
                              iconEl = (
                                <Check size={11} strokeWidth={3} className="text-white" />
                              );
                            } else {
                              // manual override FALSE (red)
                              cellStyle =
                                "border-red-300 bg-red-50 hover:bg-red-100";
                              iconEl = (
                                <X size={11} strokeWidth={3} className="text-red-400" />
                              );
                            }
                          } else if (isServerOverride) {
                            // Existing server override not yet touched locally
                            if (eff) {
                              cellStyle = "border-blue-400 bg-blue-500";
                              iconEl = (
                                <Check size={11} strokeWidth={3} className="text-white" />
                              );
                            } else {
                              cellStyle = "border-red-300 bg-red-50";
                              iconEl = (
                                <X size={11} strokeWidth={3} className="text-red-400" />
                              );
                            }
                          } else if (roleAllowed) {
                            // Role default: permitted
                            cellStyle =
                              "border-ink/20 bg-ink/8 cursor-pointer hover:border-ink/30";
                            iconEl = (
                              <Check size={11} strokeWidth={3} className="text-ink/40" />
                            );
                          } else {
                            // Role default: denied
                            cellStyle =
                              "border-ink/15 bg-white cursor-pointer hover:border-ink/25";
                            iconEl = null;
                          }

                          return (
                            <td key={act.key} className="px-2 py-2.5 text-center">
                              <button
                                type="button"
                                title={`${res.label} → ${act.label}`}
                                onClick={() => toggleCell(res.key, act.key)}
                                className={cn(
                                  "mx-auto flex h-5 w-5 items-center justify-center rounded border transition",
                                  cellStyle,
                                )}
                              >
                                {iconEl}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {saveStatus === "error" && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMsg}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && saveStatus !== "success" && (
          <div className="shrink-0 border-t border-ink/8 px-6 py-4">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-ink/65 transition hover:border-ink/20 hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} strokeWidth={1.75} />
                )}
                Guardar permisos
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Fila de usuario ─────────────────────────────────────────────────────

interface UserRowProps {
  user: InternalUser;
  onEdit?: (user: InternalUser) => void;
  onPermissions?: (user: InternalUser) => void;
}

function UserRow({ user, onEdit, onPermissions }: UserRowProps) {
  const isInvited = user.status === "invited";
  const isClient = user.roleKey === "client";
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
      <td className="px-3 py-3 text-[12px] text-ink/65">{user.lastLoginText ?? "—"}</td>
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
          <div className="inline-flex items-center gap-1.5">
            {!isClient && (
              <button
                type="button"
                onClick={() => onPermissions?.(user)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100"
              >
                <ShieldCheck size={12} strokeWidth={1.75} />
                <span>Permisos</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit?.(user)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-ink/70 transition hover:bg-white hover:text-ink"
            >
              <UserCog size={12} strokeWidth={1.75} />
              <span>Editar</span>
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Tabla reutilizable ───────────────────────────────────────────────────

function UsersTable({
  users,
  onEdit,
  onPermissions,
  emptyText,
}: {
  users: InternalUser[];
  onEdit: (user: InternalUser) => void;
  onPermissions: (user: InternalUser) => void;
  emptyText: string;
}) {
  return (
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
          {users.map((u) => (
            <UserRow key={u.id} user={u} onEdit={onEdit} onPermissions={onPermissions} />
          ))}
        </tbody>
      </table>
      {users.length === 0 && (
        <p className="mt-4 text-center text-sm text-ink/55">{emptyText}</p>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

interface UsuariosClientProps {
  users: InternalUser[];
  currentUserRole: InternalUserRole;
}

export function UsuariosClient({ users, currentUserRole }: UsuariosClientProps) {
  const router = useRouter();
  const [queryAdmins, setQueryAdmins] = useState("");
  const [queryAdvisors, setQueryAdvisors] = useState("");
  const [queryAgents, setQueryAgents] = useState("");
  const [queryClients, setQueryClients] = useState("");
  const [createModal, setCreateModal] = useState<ModalType | null>(null);
  const [editUser, setEditUser] = useState<InternalUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<InternalUser | null>(null);

  const admins = useMemo(
    () => users.filter((u) => u.roleKey === "admin" || u.roleKey === "owner"),
    [users],
  );
  const advisors = useMemo(() => users.filter((u) => u.roleKey === "advisor"), [users]);
  const agents = useMemo(
    () => users.filter((u) => ["agent_junior", "agent_senior", "agent_admin"].includes(u.roleKey)),
    [users],
  );
  const clients = useMemo(() => users.filter((u) => u.roleKey === "client"), [users]);

  const filteredAdmins = useMemo(() => {
    const q = queryAdmins.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [admins, queryAdmins]);

  const filteredAdvisors = useMemo(() => {
    const q = queryAdvisors.trim().toLowerCase();
    if (!q) return advisors;
    return advisors.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
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
        u.email.toLowerCase().includes(q),
    );
  }, [clients, queryClients]);

  const handleSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  const isAdmin = currentUserRole === "admin" || currentUserRole === "owner" || currentUserRole === "agent_admin";

  return (
    <>
      {createModal && (
        <CreateUserModal
          userRole={currentUserRole}
          advisors={advisors}
          modalType={createModal}
          onClose={() => setCreateModal(null)}
          onSuccess={handleSuccess}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSuccess={handleSuccess}
        />
      )}
      {permissionsUser && (
        <PermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
        />
      )}

      {/* Sección 1: Administradores (solo admin) */}
      {isAdmin && (
        <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <h2 className="mb-5 font-serif text-lg font-semibold text-ink">
            Administradores
          </h2>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex w-full max-w-md items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
              <Search size={15} strokeWidth={1.75} className="text-ink/45" />
              <input
                type="search"
                value={queryAdmins}
                onChange={(e) => setQueryAdmins(e.target.value)}
                placeholder="Buscar admins..."
                className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setCreateModal("admin")}
              className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
            >
              <Plus size={14} strokeWidth={1.75} />
              <span>Crear admin</span>
            </button>
          </div>

          <UsersTable
            users={filteredAdmins}
            onEdit={setEditUser}
            onPermissions={setPermissionsUser}
            emptyText="No hay administradores que coincidan con tu búsqueda."
          />
        </section>
      )}

      {/* Sección 2: Asesores (solo admin) */}
      {isAdmin && (
        <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <h2 className="mb-5 font-serif text-lg font-semibold text-ink">Asesores</h2>

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
              onClick={() => setCreateModal("advisor")}
              className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80"
            >
              <Plus size={14} strokeWidth={1.75} className="text-gold" />
              <span>Crear asesor</span>
            </button>
          </div>

          <UsersTable
            users={filteredAdvisors}
            onEdit={setEditUser}
            onPermissions={setPermissionsUser}
            emptyText="No hay asesores que coincidan con tu búsqueda."
          />
        </section>
      )}

      {/* Sección 3: Agentes inmobiliarios (solo admin) */}
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

          <UsersTable
            users={filteredAgents}
            onEdit={setEditUser}
            onPermissions={setPermissionsUser}
            emptyText="No hay agentes que coincidan con tu búsqueda."
          />
        </section>
      )}


      {/* Sección 3: Clientes */}
      <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        <h2 className="mb-5 font-serif text-lg font-semibold text-ink">Clientes</h2>

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
            onClick={() => setCreateModal("client")}
            className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/80"
          >
            <Plus size={14} strokeWidth={1.75} className="text-gold" />
            <span>Crear cliente</span>
          </button>
        </div>

        <UsersTable
          users={filteredClients}
          onEdit={setEditUser}
          onPermissions={setPermissionsUser}
          emptyText="No hay clientes que coincidan con tu búsqueda."
        />
      </section>
    </>
  );
}
