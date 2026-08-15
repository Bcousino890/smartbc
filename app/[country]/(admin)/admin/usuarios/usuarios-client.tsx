"use client";

import { Check, Eye, EyeOff, Loader2, Mail, Plus, Search, ShieldCheck, UserCog, Users, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InternalUser,
  InternalUserRole,
  InternalUserStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PermissionsDrawer } from "@/components/admin/permissions/permissions-drawer";

const ROLE_BADGE: Record<InternalUserRole, string> = {
  owner:        "border-violet-200 bg-violet-50 text-violet-700",
  admin:        "border-emerald-200 bg-emerald-50 text-emerald-700",
  advisor:      "border-blue-200 bg-blue-50 text-blue-700",
  client:       "border-amber-200 bg-amber-50 text-amber-700",
  viewer:       "border-ink/15 bg-ink/5 text-ink/65",
  agent_junior: "border-sky-200 bg-sky-50 text-sky-700",
  agent_senior: "border-indigo-200 bg-indigo-50 text-indigo-700",
  agent_admin:  "border-purple-200 bg-purple-50 text-purple-700",
  captadora:    "border-rose-200 bg-rose-50 text-rose-700",
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
  captadora:    "Captadora",
};

const STATUS_BADGE: Record<InternalUserStatus, string> = {
  active: "bg-emerald-500",
  invited: "bg-amber-500",
  suspended: "bg-ink/30",
};

// Roles asignables desde el modal de edición. `owner`/`admin` se ofrecen solo a
// quien ya es owner/admin (ver canAssignHighRoles). Incluye `captadora` y
// `viewer`, que antes faltaban en el <select>.
const ALL_ASSIGNABLE_ROLES: { value: InternalUserRole; label: string }[] = [
  { value: "owner", label: "Propietario" },
  { value: "admin", label: "Administrador" },
  { value: "advisor", label: "Asesor" },
  { value: "agent_admin", label: "Agente Admin" },
  { value: "agent_senior", label: "Agente Senior" },
  { value: "agent_junior", label: "Agente Junior" },
  { value: "captadora", label: "Captadora" },
  { value: "viewer", label: "Visualizador" },
];

// ─── País ─────────────────────────────────────────────────────────────────

const COUNTRY_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: "es", label: "España", flag: "🇪🇸" },
  { code: "cl", label: "Chile", flag: "🇨🇱" },
];
const COUNTRY_FLAG: Record<string, string> = { es: "🇪🇸", cl: "🇨🇱" };
const COUNTRY_NAME: Record<string, string> = { es: "España", cl: "Chile" };

/**
 * Multi-select de países (🇪🇸/🇨🇱) + selector de país por defecto (landing).
 * Sustituye al antiguo checkbox binario "Acceso a los 2 países".
 * Garantiza al menos un país seleccionado y mantiene el default dentro del set.
 */
function CountryPicker({
  selected,
  defaultCountry,
  onChangeSelected,
  onChangeDefault,
}: {
  selected: string[];
  defaultCountry: string;
  onChangeSelected: (next: string[]) => void;
  onChangeDefault: (code: string) => void;
}) {
  const toggle = (code: string) => {
    const has = selected.includes(code);
    let next: string[];
    if (has) {
      // No permitir vaciar: siempre al menos un país.
      if (selected.length === 1) return;
      next = selected.filter((c) => c !== code);
    } else {
      next = [...selected, code];
    }
    onChangeSelected(next);
    // Si el país por defecto ya no está en el set, reasignar al primero.
    if (!next.includes(defaultCountry)) {
      onChangeDefault(next[0]);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
          Países con acceso
        </label>
        <div className="flex flex-wrap gap-2">
          {COUNTRY_OPTIONS.map((opt) => {
            const active = selected.includes(opt.code);
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => toggle(opt.code)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition",
                  active
                    ? "border-gold/55 bg-gold/10 text-ink"
                    : "border-ink/10 bg-white text-ink/55 hover:border-ink/20",
                )}
              >
                <span>{opt.flag}</span>
                <span>{opt.label}</span>
                {active && <Check size={14} strokeWidth={2.5} className="text-gold" />}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-ink/40">
          Elige uno o ambos países. El acceso multi-país se activa automáticamente al seleccionar dos.
        </p>
      </div>

      {selected.length > 1 && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
            País por defecto (landing)
          </label>
          <select
            value={defaultCountry}
            onChange={(e) => onChangeDefault(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            {COUNTRY_OPTIONS.filter((o) => selected.includes(o.code)).map((o) => (
              <option key={o.code} value={o.code}>
                {o.flag} {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink/40">
            Define a qué dashboard (/es/admin o /cl/admin) accede el usuario al iniciar sesión.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Modal crear usuario ──────────────────────────────────────────────────

type ModalType = "admin" | "advisor" | "agent_junior" | "agent_senior" | "agent_admin" | "client";

interface CreateUserModalProps {
  userRole: InternalUserRole;
  advisors: InternalUser[];
  modalType: ModalType;
  country: string;
  onClose: () => void;
  onSuccess?: () => void;
}

function CreateUserModal({
  userRole,
  advisors,
  modalType,
  country,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedAdvisor, setAssignedAdvisor] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Multi-país: set de países con acceso + país por defecto (landing).
  // Inicializa con el país del árbol admin desde el que se crea el usuario.
  const [selectedCountries, setSelectedCountries] = useState<string[]>([country]);
  const [defaultCountry, setDefaultCountry] = useState(country);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      // El selector multi-país solo aplica a staff no-admin (asesores/agentes).
      // Admin accede a ambos países por rol; cliente es de un solo país.
      const showCountryPicker = modalType !== "client" && modalType !== "admin";
      const payload = {
        email,
        firstName,
        lastName,
        phone: phone.trim() || undefined,
        role: modalType,
        assignedAdvisorId:
          modalType === "client" && assignedAdvisor ? assignedAdvisor : undefined,
        password: modalType !== "client" ? password : undefined,
        // País por defecto/landing: el elegido en el picker (si aplica) o el
        // árbol admin desde el que se creó el usuario.
        country: showCountryPicker ? defaultCountry : country,
        // El backend deriva multi_country de countries.length > 1.
        countries: showCountryPicker ? selectedCountries : undefined,
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

  const MODAL_TITLES: Record<ModalType, string> = {
    admin: "Crear administrador",
    advisor: "Crear asesor",
    agent_junior: "Crear agente junior",
    agent_senior: "Crear agente senior",
    agent_admin: "Crear agente administrador",
    client: "Crear cliente",
  };
  const modalTitle = MODAL_TITLES[modalType] ?? "Crear usuario";
  const needsPassword = modalType !== "client";

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
              {modalTitle.replace("Crear", "").trim()} creado exitosamente
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

            {modalType === "client" && (
              <>
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

            {needsPassword && modalType !== "admin" && (
              <CountryPicker
                selected={selectedCountries}
                defaultCountry={defaultCountry}
                onChangeSelected={setSelectedCountries}
                onChangeDefault={setDefaultCountry}
              />
            )}

            {needsPassword && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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
  defaultCountry: string;
  currentUserRole: InternalUserRole;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditUserModal({ user, defaultCountry, currentUserRole, onClose, onSuccess }: EditUserModalProps) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<InternalUserRole>(user.roleKey);
  // Si el perfil aún no tiene país asignado, el default de edición es el
  // árbol admin desde el que se abrió (no un país fijo).
  const [country, setCountry] = useState(user.country ?? defaultCountry);
  // Set de países con acceso: derivado de countries/multiCountry/country.
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    user.countries ??
      (user.multiCountry ? ["es", "cl"] : [user.country ?? defaultCountry]),
  );
  // Rol efectivo por país (solo relevante con >1 país): "" = usa el rol base.
  const [countryRoleOverrides, setCountryRoleOverrides] = useState<Record<string, string>>(
    user.countryRoles ?? {},
  );
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isClient = user.roleKey === "client";

  // Solo owner/admin pueden asignar los roles de staff más altos (owner/admin).
  // El rol actual del usuario siempre se muestra para no invalidar el <select>.
  const canAssignHighRoles = currentUserRole === "owner" || currentUserRole === "admin";
  const roleOptions = ALL_ASSIGNABLE_ROLES.filter(
    (r) =>
      canAssignHighRoles ||
      (r.value !== "owner" && r.value !== "admin") ||
      r.value === user.roleKey,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      // countryRoles: valor para cada país actualmente seleccionado (el
      // override elegido, o null = usa el rol base) + null para países que
      // tenía asignados y ya no están seleccionados (limpia la fila vieja).
      let countryRolesPayload: Record<string, string | null> | undefined;
      if (!isClient && selectedCountries.length > 1) {
        countryRolesPayload = {};
        for (const c of selectedCountries) {
          countryRolesPayload[c] = countryRoleOverrides[c] || null;
        }
        for (const c of Object.keys(user.countryRoles ?? {})) {
          if (!selectedCountries.includes(c)) countryRolesPayload[c] = null;
        }
      }

      const payload: Record<string, unknown> = {
        userId: user.id,
        firstName,
        lastName,
        role,
        // País por defecto/landing.
        country,
        // El backend deriva multi_country de countries.length > 1.
        countries: isClient ? undefined : selectedCountries,
        countryRoles: countryRolesPayload,
      };
      // También para staff: el teléfono del agente es lo que ve el cliente en
      // la colección de visitas. Se envía siempre (vacío = borrarlo).
      payload.phone = phone.trim() || null;
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
              {!isClient && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink/45">
                  Es el teléfono que ve el cliente cuando este agente firma una
                  colección de visitas (ficha de asesor y botón de WhatsApp).
                </p>
              )}
            </div>

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
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isClient && (
              <CountryPicker
                selected={selectedCountries}
                defaultCountry={country}
                onChangeSelected={setSelectedCountries}
                onChangeDefault={setCountry}
              />
            )}

            {!isClient && selectedCountries.length > 1 && (
              <div className="space-y-2 rounded-xl border border-ink/10 bg-white/50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">
                  Rol por país (opcional)
                </p>
                <p className="text-[11px] text-ink/40">
                  Por defecto usa el rol de arriba en ambos países. Elige un
                  rol distinto solo si este usuario debe tener más o menos
                  acceso en un país concreto (ej. senior en Chile, junior en
                  España).
                </p>
                {selectedCountries.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-center text-base leading-none">
                      {COUNTRY_FLAG[c]}
                    </span>
                    <select
                      value={countryRoleOverrides[c] ?? ""}
                      onChange={(e) =>
                        setCountryRoleOverrides((prev) => ({ ...prev, [c]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
                    >
                      <option value="">(usar rol base: {ROLE_LABEL[role]})</option>
                      {ALL_ASSIGNABLE_ROLES.filter(
                        (r) => r.value !== "owner" && r.value !== "admin",
                      ).map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Nueva contraseña{" "}
                <span className="font-normal normal-case text-ink/40">(dejar vacío para no cambiar)</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
        <div className="flex flex-wrap items-center gap-1">
          {(user.countries ?? (user.country ? [user.country] : [])).map((c) => (
            <span
              key={c}
              title={COUNTRY_NAME[c] ?? c}
              className="inline-flex items-center rounded-md border border-ink/10 bg-white/70 px-1.5 py-0.5 text-[13px] leading-none"
            >
              {COUNTRY_FLAG[c] ?? c}
            </span>
          ))}
        </div>
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
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  users: InternalUser[];
  onEdit: (user: InternalUser) => void;
  onPermissions: (user: InternalUser) => void;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-y-1.5 text-left text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            <th className="px-3 pb-2">Usuario</th>
            <th className="px-3 pb-2">Rol</th>
            <th className="px-3 pb-2">País(es)</th>
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
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

interface UsuariosClientProps {
  users: InternalUser[];
  currentUserRole: InternalUserRole;
  country: string;
}

export function UsuariosClient({ users, currentUserRole, country }: UsuariosClientProps) {
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
  // Resto de usuarios (viewer y cualquier rol no contemplado en las secciones
  // anteriores): sin esto quedarían ocultos pese a existir en la BD.
  const others = useMemo(
    () =>
      users.filter(
        (u) =>
          !["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin", "client"].includes(
            u.roleKey,
          ),
      ),
    [users],
  );

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
          country={country}
          onClose={() => setCreateModal(null)}
          onSuccess={handleSuccess}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          defaultCountry={country}
          currentUserRole={currentUserRole}
          onClose={() => setEditUser(null)}
          onSuccess={handleSuccess}
        />
      )}
      {permissionsUser && (
        <PermissionsDrawer
          user={permissionsUser}
          canEdit={currentUserRole === "admin" || currentUserRole === "owner"}
          onClose={() => setPermissionsUser(null)}
          onSaved={handleSuccess}
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
            emptyIcon={<UserCog size={24} />}
            emptyTitle={queryAdmins ? "Sin resultados" : "No hay administradores"}
            emptyDescription={queryAdmins ? "Prueba con otro término de búsqueda." : "Crea el primer administrador con el botón de arriba."}
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
            emptyIcon={<Users size={24} />}
            emptyTitle={queryAdvisors ? "Sin resultados" : "No hay asesores"}
            emptyDescription={queryAdvisors ? "Prueba con otro término de búsqueda." : "Crea el primer asesor con el botón de arriba."}
          />
        </section>
      )}

      {/* Sección 3: Agentes inmobiliarios (solo admin) */}
      {isAdmin && (
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateModal("agent_junior")}
                className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100"
              >
                <Plus size={14} strokeWidth={1.75} />
                <span>Junior</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateModal("agent_senior")}
                className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Plus size={14} strokeWidth={1.75} />
                <span>Senior</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateModal("agent_admin")}
                className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-100"
              >
                <Plus size={14} strokeWidth={1.75} />
                <span>Admin</span>
              </button>
            </div>
          </div>

          <UsersTable
            users={filteredAgents}
            onEdit={setEditUser}
            onPermissions={setPermissionsUser}
            emptyIcon={<Users size={24} />}
            emptyTitle={queryAgents ? "Sin resultados" : "No hay agentes inmobiliarios"}
            emptyDescription={queryAgents ? "Prueba con otro término de búsqueda." : "Añade el primer agente con los botones de arriba."}
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
          emptyIcon={<Users size={24} />}
          emptyTitle={queryClients ? "Sin resultados" : "No hay clientes"}
          emptyDescription={queryClients ? "Prueba con otro término de búsqueda." : "Crea el primer cliente con el botón de arriba."}
        />
      </section>

      {/* Sección 4: Otros usuarios (viewer / roles no contemplados arriba) */}
      {others.length > 0 && (
        <section className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
          <h2 className="mb-5 font-serif text-lg font-semibold text-ink">
            Otros usuarios
          </h2>

          <UsersTable
            users={others}
            onEdit={setEditUser}
            onPermissions={setPermissionsUser}
            emptyIcon={<Users size={24} />}
            emptyTitle="No hay otros usuarios"
          />
        </section>
      )}
    </>
  );
}
