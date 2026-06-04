/**
 * Sistema de permisos para roles de agentes inmobiliarios.
 *
 * Recursos: particulares | properties | mensajes | usuarios | reportes | configuracion | visitas
 * Acciones: view | create | edit | delete | contact
 */

export type PermissionResource =
  | "particulares"
  | "properties"
  | "mensajes"
  | "usuarios"
  | "reportes"
  | "configuracion"
  | "visitas";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "contact";

type PermissionMatrix = Record<PermissionResource, Record<PermissionAction, boolean>>;

// ─── Matrices por rol ─────────────────────────────────────────────────────────

const AGENT_JUNIOR_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: true,  create: false, edit: false, delete: false, contact: true  },
  properties:    { view: true,  create: false, edit: false, delete: false, contact: false },
  mensajes:      { view: true,  create: false, edit: false, delete: false, contact: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, contact: false },
  reportes:      { view: false, create: false, edit: false, delete: false, contact: false },
  configuracion: { view: false, create: false, edit: false, delete: false, contact: false },
  visitas:       { view: true,  create: false, edit: false, delete: false, contact: false },
};

const AGENT_SENIOR_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: true,  create: false, edit: true,  delete: false, contact: true  },
  properties:    { view: true,  create: true,  edit: true,  delete: false, contact: false },
  mensajes:      { view: true,  create: false, edit: false, delete: false, contact: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, contact: false },
  reportes:      { view: false, create: false, edit: false, delete: false, contact: false },
  configuracion: { view: false, create: false, edit: false, delete: false, contact: false },
  visitas:       { view: true,  create: true,  edit: true,  delete: false, contact: false },
};

const AGENT_ADMIN_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: true, create: false, edit: true, delete: true,  contact: true  },
  properties:    { view: true, create: true,  edit: true, delete: true,  contact: false },
  mensajes:      { view: true, create: false, edit: false, delete: false, contact: false },
  usuarios:      { view: true, create: true,  edit: true, delete: false, contact: false },
  reportes:      { view: true, create: false, edit: false, delete: false, contact: false },
  configuracion: { view: true, create: false, edit: true,  delete: false, contact: false },
  visitas:       { view: true, create: true,  edit: true,  delete: true,  contact: false },
};

// Roles con acceso total (owner, admin) — todo permitido
const FULL_ACCESS_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: true, create: true, edit: true, delete: true, contact: true  },
  properties:    { view: true, create: true, edit: true, delete: true, contact: true  },
  mensajes:      { view: true, create: true, edit: true, delete: true, contact: true  },
  usuarios:      { view: true, create: true, edit: true, delete: true, contact: true  },
  reportes:      { view: true, create: true, edit: true, delete: true, contact: true  },
  configuracion: { view: true, create: true, edit: true, delete: true, contact: true  },
  visitas:       { view: true, create: true, edit: true, delete: true, contact: true  },
};

// Advisor: similar a full access pero sin gestión de usuarios
const ADVISOR_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: true, create: true,  edit: true,  delete: true,  contact: true  },
  properties:    { view: true, create: true,  edit: true,  delete: true,  contact: true  },
  mensajes:      { view: true, create: true,  edit: true,  delete: true,  contact: true  },
  usuarios:      { view: true, create: false, edit: false, delete: false, contact: false },
  reportes:      { view: true, create: false, edit: false, delete: false, contact: false },
  configuracion: { view: true, create: false, edit: true,  delete: false, contact: false },
  visitas:       { view: true, create: true,  edit: true,  delete: true,  contact: false },
};

// Sin acceso (client, viewer, roles desconocidos)
const NO_ACCESS_PERMISSIONS: PermissionMatrix = {
  particulares:  { view: false, create: false, edit: false, delete: false, contact: false },
  properties:    { view: false, create: false, edit: false, delete: false, contact: false },
  mensajes:      { view: false, create: false, edit: false, delete: false, contact: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, contact: false },
  reportes:      { view: false, create: false, edit: false, delete: false, contact: false },
  configuracion: { view: false, create: false, edit: false, delete: false, contact: false },
  visitas:       { view: false, create: false, edit: false, delete: false, contact: false },
};

// ─── Mapa de permisos por rol ─────────────────────────────────────────────────

export const PERMISSIONS_BY_ROLE: Record<string, PermissionMatrix> = {
  owner:         FULL_ACCESS_PERMISSIONS,
  admin:         FULL_ACCESS_PERMISSIONS,
  advisor:       ADVISOR_PERMISSIONS,
  agent_admin:   AGENT_ADMIN_PERMISSIONS,
  agent_senior:  AGENT_SENIOR_PERMISSIONS,
  agent_junior:  AGENT_JUNIOR_PERMISSIONS,
  client:        NO_ACCESS_PERMISSIONS,
  viewer:        NO_ACCESS_PERMISSIONS,
};

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Verifica si un rol tiene permiso para realizar una acción sobre un recurso.
 *
 * @param role     - Rol del usuario (ej. "agent_junior", "admin")
 * @param resource - Recurso (ej. "particulares", "properties")
 * @param action   - Acción (ej. "view", "edit", "delete")
 * @returns        true si el acceso está permitido, false en caso contrario
 */
export function canAccess(
  role: string,
  resource: string,
  action: string,
): boolean {
  const matrix = PERMISSIONS_BY_ROLE[role] ?? NO_ACCESS_PERMISSIONS;
  const resourcePerms = matrix[resource as PermissionResource];
  if (!resourcePerms) return false;
  return resourcePerms[action as PermissionAction] ?? false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Roles de agente inmobiliario (los 3 nuevos) */
export const AGENT_ROLES = ["agent_junior", "agent_senior", "agent_admin"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/** Todos los roles staff que acceden a /admin */
export const STAFF_ROLES = [
  "owner",
  "admin",
  "advisor",
  "agent_junior",
  "agent_senior",
  "agent_admin",
] as const;

/** Comprueba si un rol es un rol de agente inmobiliario */
export function isAgentRole(role: string): role is AgentRole {
  return AGENT_ROLES.includes(role as AgentRole);
}

/** Comprueba si un rol es staff (accede al /admin) */
export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}
