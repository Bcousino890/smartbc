"use client";

import { Check, Eye, EyeOff, Loader2, Mail, Plus, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  InternalUser,
  InternalUserRole,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { requestJson, type RequestJsonFailure } from "@/lib/http/request-json";
import { UsersDirectory } from "./users-directory";
import { PermissionsDrawer } from "@/components/admin/permissions/permissions-drawer";
import { isLegacyRole, roleChoices, roleLabel, staffGroup } from "@/lib/auth/role-model";
import { canManageUser } from "@/lib/auth/user-rank";

// Modelo visible (lib/auth/role-model.ts): Administrador · Asesor · Captadora.
const ROLE_LABEL: Record<InternalUserRole, string> = {
  owner:        roleLabel("owner"),
  admin:        roleLabel("admin"),
  advisor:      roleLabel("advisor"),
  client:       roleLabel("client"),
  viewer:       roleLabel("viewer"),
  agent_junior: roleLabel("agent_junior"),
  agent_senior: roleLabel("agent_senior"),
  agent_admin:  roleLabel("agent_admin"),
  captadora:    roleLabel("captadora"),
};

// Perfiles que se pueden poner a un usuario al editarlo: ver `roleChoices` en
// lib/auth/role-model.ts (Administrador, Asesor de toda la cartera, Asesor de
// solo su cartera y Captadora; más el perfil actual si es heredado).
// Por país, solo se ofrecen los dos tipos de Asesor.
const COUNTRY_ROLE_CHOICES = roleChoices("advisor").filter(
  (c) => c.value === "advisor" || c.value === "agent_senior",
);

// ─── País ─────────────────────────────────────────────────────────────────

const COUNTRY_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: "es", label: "España", flag: "🇪🇸" },
  { code: "cl", label: "Chile", flag: "🇨🇱" },
];
const COUNTRY_FLAG: Record<string, string> = { es: "🇪🇸", cl: "🇨🇱" };

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
        <label className="mb-1.5 block crm-label-sm text-ink/50">
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
        <p className="mt-1 text-xs text-ink/40">
          Elige uno o ambos países. El acceso multi-país se activa automáticamente al seleccionar dos.
        </p>
      </div>

      {selected.length > 1 && (
        <div>
          <label className="mb-1.5 block crm-label-sm text-ink/50">
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
          <p className="mt-1 text-xs text-ink/40">
            Define a qué dashboard (/es/admin o /cl/admin) accede el usuario al iniciar sesión.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Modal crear usuario ──────────────────────────────────────────────────

export type ModalType = "admin" | "advisor" | "captadora" | "client";

/**
 * Mensaje del modal de alta cuando falla la petición. Si no hubo respuesta
 * legible (corte de conexión, timeout, 502 del proxy) la cuenta pudo crearse
 * igualmente en el servidor: se dice, en vez del "Failed to fetch" crudo.
 * Reintentar nunca duplica — la ruta contesta "ya existe" (409).
 */
function describeCreateFailure(result: RequestJsonFailure): string {
  if (result.kind === "http") {
    const existingRole = result.data?.existingRole;
    if (result.data?.code === "email_exists" && typeof existingRole === "string") {
      const label = ROLE_LABEL[existingRole as InternalUserRole] ?? existingRole;
      return `${result.error} Rol actual: ${label}.`;
    }
    return result.error;
  }
  return `${result.error} Puede que el usuario se haya creado igualmente: búscalo en la lista (se está actualizando) antes de reintentar. Si reintentas y ya existe, te avisará en vez de duplicarlo.`;
}

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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [assignedAdvisor, setAssignedAdvisor] = useState("");
  // Multi-país: set de países con acceso + país por defecto (landing).
  // Inicializa con el país del árbol admin desde el que se crea el usuario.
  const [selectedCountries, setSelectedCountries] = useState<string[]>([country]);
  const [defaultCountry, setDefaultCountry] = useState(country);
  // Asesor: toda la cartera (advisor) o solo la suya (agent_senior).
  const [advisorScope, setAdvisorScope] = useState<"all" | "own">("all");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // Equipo: ¿salió el correo con el enlace para elegir contraseña?
  const [linkEmailSent, setLinkEmailSent] = useState<boolean | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName) return;

    setStatus("loading");
    setErrorMsg("");

    // El selector multi-país solo aplica al Asesor. El Administrador accede a
    // ambos países por rol, la captadora solo trabaja en Chile y el cliente es
    // de un solo país.
    const isCaptadora = modalType === "captadora";
    const showCountryPicker =
      modalType !== "client" && modalType !== "admin" && !isCaptadora;
    const role =
      modalType === "advisor" && advisorScope === "own" ? "agent_senior" : modalType;
    const payload = {
      email,
      firstName,
      lastName,
      phone: phone.trim() || undefined,
      role,
      assignedAdvisorId:
        modalType === "client" && assignedAdvisor ? assignedAdvisor : undefined,
      // País por defecto/landing: el elegido en el picker (si aplica) o el
      // árbol admin desde el que se creó el usuario.
      country: isCaptadora ? "cl" : showCountryPicker ? defaultCountry : country,
      // El backend deriva multi_country de countries.length > 1.
      countries: isCaptadora ? ["cl"] : showCountryPicker ? selectedCountries : undefined,
    };

    const result = await requestJson("/api/admin/usuarios/create", {
      method: "POST",
      body: payload,
    });

    if (!result.ok) {
      setStatus("error");
      setErrorMsg(describeCreateFailure(result));
      // La cuenta puede existir aunque aquí no lo sepamos: se refresca la
      // lista de detrás del modal para que se vea si ya está.
      if (result.kind !== "http" || result.data?.mayExist === true) {
        router.refresh();
      }
      return;
    }

    setStatus("success");
    if (modalType !== "client") {
      const emailSent = (result.data as { emailSent?: boolean }).emailSent !== false;
      setLinkEmailSent(emailSent);
      onSuccess?.();
      // Si el correo no salió, el aviso se queda hasta que se cierre a mano.
      if (emailSent) setTimeout(onClose, 2600);
      return;
    }
    setTimeout(() => {
      onClose();
      onSuccess?.();
    }, 1800);
  };

  const MODAL_TITLES: Record<ModalType, string> = {
    admin: "Crear administrador",
    advisor: "Crear asesor",
    captadora: "Crear captadora",
    client: "Crear cliente",
  };
  const modalTitle = MODAL_TITLES[modalType] ?? "Crear usuario";

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
          <h2 className="crm-section-title text-ink">{modalTitle}</h2>
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
            {linkEmailSent === true && (
              <p className="text-xs leading-relaxed text-ink/55">
                Le hemos enviado un enlace para que elija su contraseña. Caduca en 7 días.
              </p>
            )}
            {linkEmailSent === false && (
              <>
                <p
                  role="alert"
                  className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
                >
                  La cuenta está creada, pero el correo con el enlace no salió. Cuando el
                  correo funcione, abre «Editar» en su fila y pulsa «Enviar enlace para
                  elegir contraseña».
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-ink/10 px-4 py-2 text-sm text-ink/65 transition hover:border-ink/20 hover:text-ink"
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block crm-label-sm text-ink/50">
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
                <label className="mb-1.5 block crm-label-sm text-ink/50">
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
              <label className="mb-1.5 block crm-label-sm text-ink/50">
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
              <label className="mb-1.5 block crm-label-sm text-ink/50">
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
                    <label className="mb-1.5 block crm-label-sm text-ink/50">
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
                <label className="mb-1.5 block crm-label-sm text-ink/50">
                  Qué clientes ve
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "all", title: "Toda la cartera", hint: "Ve y gestiona todos los clientes" },
                      { value: "own", title: "Solo su cartera", hint: "Ve solo los clientes que se le asignan" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAdvisorScope(opt.value)}
                      aria-pressed={advisorScope === opt.value}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition",
                        advisorScope === opt.value
                          ? "border-gold/55 bg-gold/10"
                          : "border-ink/10 bg-white hover:border-ink/20",
                      )}
                    >
                      <span className="block text-sm font-medium text-ink">{opt.title}</span>
                      <span className="mt-0.5 block text-xs text-ink/50">{opt.hint}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink/40">
                  Después se puede ajustar permiso a permiso desde «Permisos».
                </p>
              </div>
            )}

            {modalType === "captadora" && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
                Las captadoras solo trabajan en Chile y solo ven las captaciones que
                se les asignan.
              </p>
            )}

            {modalType === "advisor" && (
              <CountryPicker
                selected={selectedCountries}
                defaultCountry={defaultCountry}
                onChangeSelected={setSelectedCountries}
                onChangeDefault={setDefaultCountry}
              />
            )}

            {modalType !== "client" && (
              <p className="rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-xs leading-relaxed text-ink/55">
                No se pone contraseña: al crear la cuenta se le envía un correo con un
                enlace para que la elija la propia persona.
              </p>
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
  currentUserId: string;
  currentUserRole: InternalUserRole;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditUserModal({ user, defaultCountry, currentUserId, currentUserRole, onClose, onSuccess }: EditUserModalProps) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  // Precargado: el formulario manda el teléfono siempre (vacío = borrar), así
  // que abrirlo en blanco borraba el número al guardar cualquier otra cosa.
  const [phone, setPhone] = useState(user.phone ?? "");
  // Perfil de la cuenta: un valor de `roleChoices` (los perfiles asignables o,
  // si la cuenta ya lo tiene, el Propietario o un perfil heredado).
  const [role, setRole] = useState<string>(user.roleKey);
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

  // Acceso de la cuenta. Cada uno cambia su propia contraseña; la de otra
  // persona nadie la fija: se le envía un enlace para que la elija ella. El
  // enlace y la suspensión los hace quien administra esa cuenta (el servidor
  // lo exige igual).
  const isSelf = user.id === currentUserId;
  const canManage = canManageUser(
    { id: currentUserId, role: currentUserRole },
    { id: user.id, role: user.roleKey },
  );
  // Estado local: `editUser` es una copia en el estado, y refrescar la lista no la
  // actualiza; sin esto el botón seguiría diciendo «Suspender» tras suspender.
  const [isSuspendedUser, setIsSuspendedUser] = useState(user.status === "suspended");
  const [accessBusy, setAccessBusy] = useState<null | "reset" | "suspend">(null);
  const [accessMsg, setAccessMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const sendResetLink = async () => {
    setAccessBusy("reset");
    setAccessMsg(null);
    const result = await requestJson(`/api/admin/usuarios/${user.id}/reset-password`, { method: "POST" });
    setAccessBusy(null);
    setAccessMsg(
      result.ok
        ? { kind: "ok", text: `Enlace enviado a ${user.email}. Caduca en 24 horas.` }
        : { kind: "error", text: result.error },
    );
  };

  const toggleSuspension = async () => {
    setAccessBusy("suspend");
    setAccessMsg(null);
    const result = await requestJson(`/api/admin/usuarios/${user.id}/suspend`, {
      method: "POST",
      body: { suspended: !isSuspendedUser },
    });
    setAccessBusy(null);
    setConfirmSuspend(false);
    if (!result.ok) {
      setAccessMsg({ kind: "error", text: result.error });
      return;
    }
    const sessionsRevoked = (result.data as { sessionsRevoked?: boolean }).sessionsRevoked;
    setAccessMsg({
      kind: "ok",
      text: isSuspendedUser
        ? "Cuenta reactivada."
        : sessionsRevoked === false
          ? "Cuenta suspendida: no podrá volver a entrar. No se pudieron cerrar sus sesiones abiertas, que pueden seguir activas hasta una hora."
          : "Cuenta suspendida: ya no puede entrar y sus sesiones se han cerrado.",
    });
    setIsSuspendedUser(!isSuspendedUser);
    onSuccess?.();
  };

  // El Administrador solo lo asigna el Propietario (el servidor lo exige igual);
  // el perfil actual de la cuenta siempre se muestra para no dejar el <select>
  // en blanco.
  const roleOptions = roleChoices(user.roleKey).filter(
    (c) => c.value !== "admin" || currentUserRole === "owner" || user.roleKey === "admin",
  );
  // La captadora solo trabaja en Chile: el país no se elige.
  const isCaptadora = role === "captadora";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      // countryRoles: valor para cada país actualmente seleccionado (el
      // override elegido, o null = usa el rol base) + null para países que
      // tenía asignados y ya no están seleccionados (limpia la fila vieja).
      let countryRolesPayload: Record<string, string | null> | undefined;
      if (!isClient && !isCaptadora && selectedCountries.length > 1) {
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
        country: isCaptadora ? "cl" : country,
        // El backend deriva multi_country de countries.length > 1.
        countries: isClient ? undefined : isCaptadora ? ["cl"] : selectedCountries,
        countryRoles: countryRolesPayload,
      };
      // También para staff: el teléfono del agente es lo que ve el cliente en
      // la colección de visitas. Se envía siempre (vacío = borrarlo).
      payload.phone = phone.trim() || null;
      // El correo solo viaja si cambió: tocarlo implica cambiar también las
      // credenciales de acceso, y no queremos hacerlo en cada guardado.
      const nextEmail = email.trim();
      if (nextEmail && nextEmail !== user.email) payload.email = nextEmail;
      // Solo la propia: la de otra cuenta el servidor la rechaza.
      if (newPassword && isSelf) payload.password = newPassword;

      const result = await requestJson("/api/admin/usuarios/update", {
        method: "PATCH",
        body: payload,
      });

      if (!result.ok) {
        setStatus("error");
        // Sin respuesta legible los cambios pueden haberse guardado; guardar
        // otra vez los mismos valores no rompe nada.
        setErrorMsg(
          result.kind === "http"
            ? result.error
            : `${result.error} Puede que los cambios se hayan guardado igualmente; reintentar es seguro.`,
        );
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
          <h2 className="crm-section-title text-ink">Editar usuario</h2>
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
                <label className="mb-1.5 block crm-label-sm text-ink/50">
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
                <label className="mb-1.5 block crm-label-sm text-ink/50">
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
              <label className="mb-1.5 block crm-label-sm text-ink/50">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                required
                className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
              />
              {email.trim() !== user.email && (
                <p className="mt-1.5 text-xs leading-relaxed text-amber-700">
                  Cambiar el email cambia también el usuario con el que se
                  inicia sesión. A partir de guardar, hay que entrar con{" "}
                  <span className="font-medium">{email.trim() || "—"}</span>.
                </p>
              )}
              {!isClient && email.trim() === user.email && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink/45">
                  Es el correo que ve el cliente en la ficha de asesor de una
                  colección de visitas, y el de inicio de sesión.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block crm-label-sm text-ink/50">
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
                <p className="mt-1.5 text-xs leading-relaxed text-ink/45">
                  Es el teléfono que ve el cliente cuando este agente firma una
                  colección de visitas (ficha de asesor y botón de WhatsApp).
                </p>
              )}
            </div>

            {!isClient && (
              <div>
                <label className="mb-1.5 block crm-label-sm text-ink/50">
                  Rol
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm text-ink focus:border-gold/55 focus:outline-none"
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {roleOptions.find((r) => r.value === role)?.detail && (
                  <p className="mt-1 text-xs text-ink/40">
                    {roleOptions.find((r) => r.value === role)?.detail}
                  </p>
                )}
              </div>
            )}

            {!isClient && isCaptadora && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-800">
                Las captadoras solo trabajan en Chile 🇨🇱. Al guardar, su acceso
                queda limitado a Chile.
              </p>
            )}

            {!isClient && !isCaptadora && (
              <CountryPicker
                selected={selectedCountries}
                defaultCountry={country}
                onChangeSelected={setSelectedCountries}
                onChangeDefault={setCountry}
              />
            )}

            {!isClient && !isCaptadora && selectedCountries.length > 1 && (
              <div className="space-y-2 rounded-xl border border-ink/10 bg-white/50 p-3">
                <p className="crm-label-sm text-ink/50">
                  Rol por país (opcional)
                </p>
                <p className="text-xs text-ink/40">
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
                      <option value="">(usar el perfil de arriba)</option>
                      {COUNTRY_ROLE_CHOICES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                      {countryRoleOverrides[c] &&
                        !COUNTRY_ROLE_CHOICES.some((r) => r.value === countryRoleOverrides[c]) && (
                          <option value={countryRoleOverrides[c]}>
                            {roleLabel(countryRoleOverrides[c])}
                            {isLegacyRole(countryRoleOverrides[c]) ? " (heredado)" : ""}
                          </option>
                        )}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {isSelf && (
              <div>
                <label className="mb-1.5 block crm-label-sm text-ink/50">
                  Nueva contraseña{" "}
                  <span className="font-normal normal-case text-ink/40">(dejar vacío para no cambiar)</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
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
            )}

            {!isSelf && canManage && (
              <div className="space-y-2.5 rounded-xl border border-ink/10 bg-white/50 p-3">
                <p className="crm-label-sm text-ink/50">Acceso de la cuenta</p>

                <div>
                  <button
                    type="button"
                    onClick={sendResetLink}
                    disabled={accessBusy !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs font-medium text-ink/75 transition hover:border-ink/20 hover:text-ink disabled:opacity-50"
                  >
                    {accessBusy === "reset" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Mail size={13} strokeWidth={1.75} />
                    )}
                    Enviar enlace para elegir contraseña
                  </button>
                  <p className="mt-1 text-xs text-ink/40">
                    Le llega a {user.email} y la elige la propia persona: nadie fija la contraseña de otra.
                  </p>
                </div>

                {confirmSuspend ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs leading-relaxed text-red-800">
                      {isSuspendedUser
                        ? `¿Reactivar a ${user.firstName}? Podrá volver a entrar.`
                        : `¿Suspender a ${user.firstName}? Dejará de poder entrar y operar. No se borra nada: sus clientes, captaciones y mensajes siguen en su sitio.`}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={toggleSuspension}
                        disabled={accessBusy !== null}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-50",
                          isSuspendedUser ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800",
                        )}
                      >
                        {accessBusy === "suspend" && <Loader2 size={12} className="animate-spin" />}
                        {isSuspendedUser ? "Sí, reactivar" : "Sí, suspender"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmSuspend(false)}
                        disabled={accessBusy !== null}
                        className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink/65 transition hover:text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSuspend(true)}
                    disabled={accessBusy !== null}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-50",
                      isSuspendedUser
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        : "border-red-200 bg-white text-red-700 hover:bg-red-50",
                    )}
                  >
                    {isSuspendedUser ? "Reactivar cuenta" : "Suspender cuenta"}
                  </button>
                )}

                {accessMsg && (
                  <p
                    role={accessMsg.kind === "error" ? "alert" : "status"}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs",
                      accessMsg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700",
                    )}
                  >
                    {accessMsg.text}
                  </p>
                )}
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
                disabled={!firstName || !email.trim() || status === "loading"}
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


// ─── Componente principal ─────────────────────────────────────────────────

interface UsuariosClientProps {
  users: InternalUser[];
  currentUserId: string;
  currentUserRole: InternalUserRole;
  country: string;
}

export function UsuariosClient({ users, currentUserId, currentUserRole, country }: UsuariosClientProps) {
  const router = useRouter();
  const [createModal, setCreateModal] = useState<ModalType | null>(null);
  const [editUser, setEditUser] = useState<InternalUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<InternalUser | null>(null);

  const advisors = useMemo(() => users.filter((u) => staffGroup(u.roleKey) === "advisors"), [users]);

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
          currentUserId={currentUserId}
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

      <UsersDirectory
        users={users}
        isAdmin={isAdmin}
        country={country}
        onCreate={setCreateModal}
        onEdit={setEditUser}
        onPermissions={setPermissionsUser}
      />
    </>
  );
}
