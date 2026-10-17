/**
 * Modelo VISIBLE de roles del equipo: Administrador · Asesor · Captadora (Chile).
 *
 * Módulo PURO (sin imports ni acceso a datos) para poder probarlo con
 * `npm run test:role-model` y usarlo igual desde el servidor y desde la
 * pantalla de Usuarios.
 *
 * Los roles internos de la base de datos NO se migran: sacar valores del enum
 * `user_role` no se puede, y reescribir los permisos de cada persona sin
 * revisarlos uno a uno quitaría o daría acceso por sorpresa. En su lugar:
 *
 *   rol interno   | se ve como                    | qué es
 *   --------------|-------------------------------|---------------------------
 *   owner         | Propietario (en Administradores) | el dueño; no se asigna
 *   admin         | Administrador                 | gestión completa
 *   agent_admin   | Administrador · heredado      | gestión con acceso limitado
 *   advisor       | Asesor · toda la cartera      | el Asesor estándar
 *   agent_senior  | Asesor · solo su cartera      | Asesor restringido a lo suyo
 *   agent_junior  | Asesor · heredado             | Asesor de solo lectura
 *   captadora     | Captadora · solo Chile        | solo Captaciones asignadas
 *
 * Se pueden ASIGNAR cuatro perfiles (admin, advisor, agent_senior, captadora).
 * `agent_admin` y `agent_junior` ya no se crean, pero quien los tiene los
 * conserva —y los ve marcados como «heredado»— hasta que se decida su destino.
 */

export type StaffGroup = "admins" | "advisors" | "captadoras";

/** Perfiles que se pueden crear o asignar a una persona. */
export const ASSIGNABLE_STAFF_ROLES = ["admin", "advisor", "agent_senior", "captadora"] as const;
export type AssignableStaffRole = (typeof ASSIGNABLE_STAFF_ROLES)[number];

/** Las captadoras solo operan en Chile (Captaciones es un módulo exclusivo de Chile). */
export const CAPTADORA_COUNTRY = "cl";

const GROUP_BY_ROLE: Record<string, StaffGroup> = {
  owner: "admins",
  admin: "admins",
  agent_admin: "admins",
  advisor: "advisors",
  agent_senior: "advisors",
  agent_junior: "advisors",
  captadora: "captadoras",
};

/** Grupo de la pantalla de Usuarios al que pertenece un rol; null si no es staff. */
export function staffGroup(role: string | null | undefined): StaffGroup | null {
  return typeof role === "string" && Object.hasOwn(GROUP_BY_ROLE, role) ? GROUP_BY_ROLE[role] : null;
}

const LABEL: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  agent_admin: "Administrador",
  advisor: "Asesor",
  agent_senior: "Asesor",
  agent_junior: "Asesor",
  captadora: "Captadora",
  client: "Cliente",
  viewer: "Visualizador",
};

/** Etiqueta que ve la gente. Nunca dice «agente». */
export function roleLabel(role: string | null | undefined): string {
  return typeof role === "string" && Object.hasOwn(LABEL, role) ? LABEL[role] : (role ?? "");
}

const DETAIL: Record<string, string> = {
  advisor: "Toda la cartera",
  agent_senior: "Solo su cartera",
  agent_junior: "Solo su cartera · solo lectura (heredado)",
  agent_admin: "Acceso limitado (heredado)",
  captadora: "Solo Chile",
};

/** Matiz que explica el alcance del rol; null si el rol no lo necesita. */
export function roleDetail(role: string | null | undefined): string | null {
  return typeof role === "string" && Object.hasOwn(DETAIL, role) ? DETAIL[role] : null;
}

export function isAssignableStaffRole(role: string | null | undefined): role is AssignableStaffRole {
  return typeof role === "string" && (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(role);
}

/** Perfiles que ya no se crean pero que algunas cuentas todavía conservan. */
export function isLegacyRole(role: string | null | undefined): boolean {
  return role === "agent_admin" || role === "agent_junior";
}

export type RoleChoice = {
  value: string;
  label: string;
  detail: string | null;
};

const CHOICES: Record<AssignableStaffRole, RoleChoice> = {
  admin: { value: "admin", label: "Administrador", detail: null },
  advisor: { value: "advisor", label: "Asesor · toda la cartera", detail: "Ve y gestiona todos los clientes" },
  agent_senior: { value: "agent_senior", label: "Asesor · solo su cartera", detail: "Ve solo sus clientes y solicitudes" },
  captadora: { value: "captadora", label: "Captadora · solo Chile", detail: "Solo trabaja Captaciones" },
};

/**
 * Opciones del desplegable de rol al editar una cuenta.
 *
 * Siempre los cuatro perfiles asignables. Si la cuenta tiene hoy un rol que ya
 * no se asigna (Propietario, un perfil heredado, un Visualizador…) se añade como
 * opción propia: así el <select> nunca muestra otro perfil por error y guardar
 * sin tocar el rol no lo cambia.
 */
export function roleChoices(currentRole?: string | null): RoleChoice[] {
  const base = ASSIGNABLE_STAFF_ROLES.map((r) => CHOICES[r]);
  if (!currentRole || isAssignableStaffRole(currentRole)) return base;
  if (currentRole === "owner") {
    return [{ value: "owner", label: "Propietario", detail: null }, ...base];
  }
  if (isLegacyRole(currentRole)) {
    const label =
      currentRole === "agent_admin"
        ? "Administrador · acceso limitado (heredado)"
        : "Asesor · solo lectura (heredado)";
    return [...base, { value: currentRole, label, detail: roleDetail(currentRole) }];
  }
  return [...base, { value: currentRole, label: roleLabel(currentRole), detail: null }];
}

/**
 * Error si los países no valen para el rol, o null si valen.
 * Hoy solo hay una regla: la captadora trabaja únicamente en Chile.
 */
export function countriesError(
  role: string | null | undefined,
  countries: readonly string[],
): string | null {
  if (role !== "captadora") return null;
  const onlyChile = countries.length > 0 && countries.every((c) => c === CAPTADORA_COUNTRY);
  return onlyChile ? null : "Las captadoras solo trabajan en Chile: el único país posible es Chile.";
}

export type RoleCountries =
  | { ok: true; country: string | undefined; countries: string[] | undefined }
  | { ok: false; error: string };

/**
 * Países con los que se guarda una cuenta de ese rol.
 *
 * La captadora trabaja solo en Chile: sin países se le da Chile y con Chile se
 * confirma, pero si llega con España (sola o junto a Chile) se RECHAZA en vez
 * de recortarla en silencio — quien edita tiene que enterarse. El resto de
 * roles conservan los países tal cual venían.
 */
export function resolveRoleCountries(
  role: string | null | undefined,
  input: { country?: string; countries?: string[] },
): RoleCountries {
  if (role !== "captadora") {
    return { ok: true, country: input.country, countries: input.countries };
  }
  const asked = input.countries ?? (input.country ? [input.country] : [CAPTADORA_COUNTRY]);
  const error = countriesError(role, asked);
  if (error) return { ok: false, error };
  if (input.countries && input.country && input.country !== CAPTADORA_COUNTRY) {
    return { ok: false, error: countriesError(role, [input.country]) as string };
  }
  return { ok: true, country: CAPTADORA_COUNTRY, countries: [CAPTADORA_COUNTRY] };
}
