/**
 * Sistema de permisos para roles de agentes inmobiliarios.
 *
 * Modelo canónico (ÚNICO) usado por:
 *   - canAccess() y las matrices PERMISSIONS_BY_ROLE de este archivo
 *   - app/api/admin/usuarios/[id]/permissions/route.ts (RESOURCES / ACTIONS)
 *   - La UI de gestión de permisos (components/admin/permissions/**)
 *
 * Recursos: properties | particulares | publicacion | captaciones | clientes |
 *           solicitudes | documentacion | mensajes | reportes | usuarios |
 *           configuracion | calendario
 * Acciones: view | create | edit | delete | export
 */

export type PermissionResource =
  | "properties"
  | "particulares"
  | "publicacion"
  | "captaciones"
  | "clientes"
  | "solicitudes"
  | "documentacion"
  | "mensajes"
  | "reportes"
  | "usuarios"
  | "configuracion"
  | "calendario";

export type PermissionAction = "view" | "create" | "edit" | "delete" | "export";

type PermissionMatrix = Record<PermissionResource, Record<PermissionAction, boolean>>;

// ─── Orden canónico (para iterar de forma estable en API y UI) ────────────────

export const PERMISSION_RESOURCES: readonly PermissionResource[] = [
  "properties",
  "particulares",
  "publicacion",
  "captaciones",
  "clientes",
  "solicitudes",
  "documentacion",
  "mensajes",
  "reportes",
  "usuarios",
  "configuracion",
  "calendario",
] as const;

export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
] as const;

// ─── Etiquetas y descripciones en español (para la UI) ────────────────────────

export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  properties:    "Propiedades",
  particulares:  "Particulares",
  publicacion:   "Publicación",
  captaciones:   "Captaciones",
  clientes:      "Clientes",
  solicitudes:   "Solicitudes y visitas",
  documentacion: "Documentación",
  mensajes:      "Mensajes",
  reportes:      "Reportes",
  usuarios:      "Usuarios",
  configuracion: "Configuración",
  calendario:    "Calendario",
};

export const RESOURCE_DESCRIPTIONS: Record<PermissionResource, string> = {
  properties:    "Cartera de propiedades de la agencia.",
  particulares:  "Captaciones y anuncios de particulares.",
  publicacion:   "Publicación de propiedades en portales.",
  captaciones:   "Gestión de captaciones inmobiliarias.",
  clientes:      "Base de datos de clientes y leads.",
  solicitudes:   "Solicitudes de información y visitas.",
  documentacion: "Documentos y archivos de propiedades.",
  mensajes:      "Bandeja de mensajes y conversaciones.",
  reportes:      "Informes y métricas del negocio.",
  usuarios:      "Equipo interno y gestión de cuentas.",
  configuracion: "Ajustes generales de la cuenta.",
  calendario:    "Agenda, citas y eventos.",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view:   "Ver",
  create: "Crear",
  edit:   "Editar",
  delete: "Eliminar",
  export: "Exportar",
};

export const ACTION_DESCRIPTIONS: Record<PermissionAction, string> = {
  view:   "Consultar y acceder a los registros.",
  create: "Añadir nuevos registros.",
  edit:   "Modificar registros existentes.",
  delete: "Eliminar registros de forma permanente.",
  export: "Descargar o exportar los datos.",
};

// ─── Matrices por rol ─────────────────────────────────────────────────────────

const AGENT_JUNIOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true,  create: false, edit: false, delete: false, export: false },
  particulares:  { view: true,  create: false, edit: false, delete: false, export: false },
  publicacion:   { view: true,  create: false, edit: false, delete: false, export: false },
  captaciones:   { view: false, create: false, edit: false, delete: false, export: false },
  clientes:      { view: true,  create: false, edit: false, delete: false, export: false },
  solicitudes:   { view: true,  create: false, edit: false, delete: false, export: false },
  documentacion: { view: true,  create: false, edit: false, delete: false, export: false },
  mensajes:      { view: true,  create: false, edit: false, delete: false, export: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false },
  calendario:    { view: true,  create: false, edit: false, delete: false, export: false },
};

const AGENT_SENIOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true,  create: true,  edit: true,  delete: false, export: true  },
  particulares:  { view: true,  create: true,  edit: true,  delete: false, export: false },
  publicacion:   { view: true,  create: true,  edit: true,  delete: false, export: false },
  captaciones:   { view: true,  create: true,  edit: true,  delete: false, export: false },
  clientes:      { view: true,  create: true,  edit: true,  delete: false, export: false },
  solicitudes:   { view: true,  create: true,  edit: true,  delete: false, export: false },
  documentacion: { view: true,  create: true,  edit: true,  delete: false, export: false },
  mensajes:      { view: true,  create: true,  edit: false, delete: false, export: false },
  reportes:      { view: true,  create: false, edit: false, delete: false, export: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false },
  calendario:    { view: true,  create: true,  edit: true,  delete: false, export: false },
};

const AGENT_ADMIN_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true,  edit: true, delete: true,  export: true  },
  particulares:  { view: true, create: true,  edit: true, delete: true,  export: true  },
  publicacion:   { view: true, create: true,  edit: true, delete: true,  export: true  },
  captaciones:   { view: true, create: true,  edit: true, delete: true,  export: true  },
  clientes:      { view: true, create: true,  edit: true, delete: true,  export: true  },
  solicitudes:   { view: true, create: true,  edit: true, delete: true,  export: true  },
  documentacion: { view: true, create: true,  edit: true, delete: true,  export: true  },
  mensajes:      { view: true, create: true,  edit: true, delete: false, export: false },
  reportes:      { view: true, create: false, edit: false, delete: false, export: true  },
  usuarios:      { view: true, create: true,  edit: true, delete: false, export: false },
  configuracion: { view: true, create: false, edit: true, delete: false, export: false },
  calendario:    { view: true, create: true,  edit: true, delete: true,  export: false },
};

// Roles con acceso total (owner, admin) — todo permitido
const FULL_ACCESS_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true, edit: true, delete: true, export: true },
  particulares:  { view: true, create: true, edit: true, delete: true, export: true },
  publicacion:   { view: true, create: true, edit: true, delete: true, export: true },
  captaciones:   { view: true, create: true, edit: true, delete: true, export: true },
  clientes:      { view: true, create: true, edit: true, delete: true, export: true },
  solicitudes:   { view: true, create: true, edit: true, delete: true, export: true },
  documentacion: { view: true, create: true, edit: true, delete: true, export: true },
  mensajes:      { view: true, create: true, edit: true, delete: true, export: true },
  reportes:      { view: true, create: true, edit: true, delete: true, export: true },
  usuarios:      { view: true, create: true, edit: true, delete: true, export: true },
  configuracion: { view: true, create: true, edit: true, delete: true, export: true },
  calendario:    { view: true, create: true, edit: true, delete: true, export: true },
};

// Advisor: similar a full access pero sin gestión total de usuarios/config
const ADVISOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true,  edit: true,  delete: true,  export: true  },
  particulares:  { view: true, create: true,  edit: true,  delete: true,  export: true  },
  publicacion:   { view: true, create: true,  edit: true,  delete: true,  export: true  },
  captaciones:   { view: true, create: true,  edit: true,  delete: true,  export: true  },
  clientes:      { view: true, create: true,  edit: true,  delete: true,  export: true  },
  solicitudes:   { view: true, create: true,  edit: true,  delete: true,  export: true  },
  documentacion: { view: true, create: true,  edit: true,  delete: true,  export: true  },
  mensajes:      { view: true, create: true,  edit: true,  delete: false, export: false },
  reportes:      { view: true, create: false, edit: false, delete: false, export: true  },
  usuarios:      { view: true, create: false, edit: false, delete: false, export: false },
  configuracion: { view: true, create: false, edit: true,  delete: false, export: false },
  calendario:    { view: true, create: true,  edit: true,  delete: true,  export: false },
};

// Rol "captadora" — operaria de captaciones (solo ve y edita asignadas a ella)
const CAPTADORA_PERMISSIONS: PermissionMatrix = {
  properties:    { view: false, create: false, edit: false, delete: false, export: false },
  particulares:  { view: false, create: false, edit: false, delete: false, export: false },
  publicacion:   { view: false, create: false, edit: false, delete: false, export: false },
  captaciones:   { view: true,  create: false, edit: true,  delete: false, export: false },
  clientes:      { view: false, create: false, edit: false, delete: false, export: false },
  solicitudes:   { view: false, create: false, edit: false, delete: false, export: false },
  documentacion: { view: false, create: false, edit: false, delete: false, export: false },
  mensajes:      { view: false, create: false, edit: false, delete: false, export: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false },
  calendario:    { view: false, create: false, edit: false, delete: false, export: false },
};

// Sin acceso (client, viewer, roles desconocidos)
const NO_ACCESS_PERMISSIONS: PermissionMatrix = {
  properties:    { view: false, create: false, edit: false, delete: false, export: false },
  particulares:  { view: false, create: false, edit: false, delete: false, export: false },
  publicacion:   { view: false, create: false, edit: false, delete: false, export: false },
  captaciones:   { view: false, create: false, edit: false, delete: false, export: false },
  clientes:      { view: false, create: false, edit: false, delete: false, export: false },
  solicitudes:   { view: false, create: false, edit: false, delete: false, export: false },
  documentacion: { view: false, create: false, edit: false, delete: false, export: false },
  mensajes:      { view: false, create: false, edit: false, delete: false, export: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false },
  calendario:    { view: false, create: false, edit: false, delete: false, export: false },
};

// ─── Mapa de permisos por rol ─────────────────────────────────────────────────

export const PERMISSIONS_BY_ROLE: Record<string, PermissionMatrix> = {
  owner:         FULL_ACCESS_PERMISSIONS,
  admin:         FULL_ACCESS_PERMISSIONS,
  advisor:       ADVISOR_PERMISSIONS,
  agent_admin:   AGENT_ADMIN_PERMISSIONS,
  agent_senior:  AGENT_SENIOR_PERMISSIONS,
  agent_junior:  AGENT_JUNIOR_PERMISSIONS,
  captadora:     CAPTADORA_PERMISSIONS,
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

// ─── Permisos efectivos (rol + excepciones por usuario) ──────────────────────

export type PermissionOverride = {
  resource: string;
  action: string;
  allowed: boolean;
  /**
   * País al que aplica la excepción.
   *   null | undefined = override global (todos los países del usuario)
   *   'es' | 'cl'      = override específico de ese país
   */
  country?: string | null;
};

export type EffectivePermissions = Record<
  PermissionResource,
  Record<PermissionAction, boolean>
>;

/**
 * Combina la matriz del rol con las excepciones por usuario guardadas en
 * `user_permission_overrides`. Una excepción siempre gana sobre el default
 * del rol (tanto para conceder como para denegar).
 *
 * NOTA: no filtra por país — aplica todos los overrides recibidos en orden.
 * Para respetar el país activo usa `applyOverridesForCountry`.
 */
export function applyOverrides(
  role: string,
  overrides: PermissionOverride[],
): EffectivePermissions {
  const matrix = PERMISSIONS_BY_ROLE[role] ?? NO_ACCESS_PERMISSIONS;
  const effective = {} as EffectivePermissions;
  for (const resource of PERMISSION_RESOURCES) {
    effective[resource] = { ...matrix[resource] };
  }
  for (const o of overrides) {
    const res = o.resource as PermissionResource;
    const act = o.action as PermissionAction;
    if (effective[res] && act in effective[res]) {
      effective[res][act] = o.allowed;
    }
  }
  return effective;
}

/**
 * Igual que `applyOverrides` pero respetando el país activo:
 *   1. aplica primero los overrides globales (country null/undefined)
 *   2. luego aplica los del país activo, que sobrescriben a los globales
 *
 * Si no se pasa `country`, sólo se aplican los overrides globales (los
 * específicos de país no deben "colarse" fuera de su país). Para el
 * comportamiento retrocompatible sin filtrar por país, usa `applyOverrides`.
 */
export function applyOverridesForCountry(
  role: string,
  overrides: PermissionOverride[],
  country?: string | null,
): EffectivePermissions {
  const isGlobal = (o: PermissionOverride) =>
    o.country === null || o.country === undefined;

  // Globales primero; luego los del país activo (ganan sobre los globales).
  const ordered = country
    ? [
        ...overrides.filter(isGlobal),
        ...overrides.filter((o) => o.country === country),
      ]
    : overrides.filter(isGlobal);

  return applyOverrides(role, ordered);
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
  "captadora",
] as const;

// ─── Granularidad de permisos para captaciones ──────────────────────────────────
/**
 * Especificación de qué campos puede editar cada rol en captaciones.
 * Se aplica además de los permisos base (view, create, edit, delete).
 */
export type CaptacionEditableFields = {
  canEditPropertyFields: boolean; // title, price, bedrooms, bathrooms, etc.
  canEditOwnerFields: boolean;    // owner_phone, owner_name, owner_contact, address_real
  canEditStatus: boolean;         // cambiar status manualmente
  canAssignCaptadora: boolean;    // asignar a una captadora
};

/**
 * Restricciones de visualización de captaciones por rol/contexto.
 * Usado en queries para filtrar qué captaciones ve cada usuario.
 */
export type CaptacionViewRestriction =
  | "all"           // Admin: ve todo
  | "own_only"      // Agente: solo propias (created_by)
  | "assigned_only" // Captadora: solo asignadas a ella
  | "confirmed_and_own" // Agente senior: propias + confirmadas (para conversión);

/**
 * Retorna los campos editables para captaciones según rol.
 */
export function getCaptacionEditableFields(role: string): CaptacionEditableFields {
  switch (role) {
    case "admin":
    case "owner":
      return {
        canEditPropertyFields: true,
        canEditOwnerFields: true,
        canEditStatus: true,
        canAssignCaptadora: true,
      };
    case "agent_admin":
      return {
        canEditPropertyFields: true,
        canEditOwnerFields: true,
        canEditStatus: true,
        canAssignCaptadora: true,
      };
    case "agent_senior":
      return {
        canEditPropertyFields: false, // Solo creador inicial puede editar estos
        canEditOwnerFields: true,
        canEditStatus: true,
        canAssignCaptadora: false,
      };
    case "captadora":
      return {
        canEditPropertyFields: false,
        canEditOwnerFields: true, // Solo datos del dueño
        canEditStatus: false,
        canAssignCaptadora: false,
      };
    default:
      return {
        canEditPropertyFields: false,
        canEditOwnerFields: false,
        canEditStatus: false,
        canAssignCaptadora: false,
      };
  }
}

/**
 * Retorna restricción de visualización según rol.
 */
export function getCaptacionViewRestriction(role: string): CaptacionViewRestriction {
  switch (role) {
    case "admin":
    case "owner":
    case "agent_admin":
      return "all";
    case "agent_senior":
    case "agent_junior":
      return "confirmed_and_own";
    case "captadora":
      return "assigned_only";
    default:
      return "assigned_only";
  }
}

// ─── Scope de datos general (own/team/all) ──────────────────────────────────
/**
 * Restricción de visibilidad GENERAL de un recurso, aplicable a cualquier
 * listado del panel (no solo captaciones). Generaliza el mecanismo que hasta
 * ahora solo existía para captaciones (`CaptacionViewRestriction`).
 *
 *   - "all"           → sin filtro: ve todos los registros.
 *   - "team"          → su cartera + la de su equipo. Sin un modelo formal de
 *                       equipos en el esquema, HOY se simplifica a "own_only"
 *                       (los registros cuyo propietario/asesor es el usuario).
 *                       Ver `getAssignedClientIds` en las queries.
 *   - "own_only"      → solo los registros propios (creador/asesor asignado).
 *   - "assigned_only" → solo los explícitamente asignados al usuario
 *                       (usado por captaciones: `assigned_to` = captadora).
 *   - "none"          → no ve nada de ese recurso.
 */
export type ViewRestriction =
  | "all"
  | "team"
  | "own_only"
  | "assigned_only"
  | "none";

/**
 * Normaliza la restricción específica de captaciones al tipo general.
 * `confirmed_and_own` es una particularidad de captaciones (propias +
 * confirmadas para conversión); en el modelo general su equivalente más
 * cercano y conservador es "own_only". La lógica fina de "confirmadas" sigue
 * viviendo en `getCaptacionViewRestriction`, que NO se toca.
 */
function normalizeCaptacionRestriction(
  r: CaptacionViewRestriction,
): ViewRestriction {
  switch (r) {
    case "all":
      return "all";
    case "assigned_only":
      return "assigned_only";
    case "own_only":
    case "confirmed_and_own":
      return "own_only";
    default:
      return "all";
  }
}

/**
 * Restricción de visibilidad de un recurso según el rol. Decisiones de negocio
 * por defecto, deliberadamente CONSERVADORAS: ante la duda se devuelve "all"
 * para NO ocultar datos por error (comportamiento histórico).
 *
 * Mapa de decisiones (rol × recurso → restricción):
 *
 *   rol \ recurso     | properties | clientes   | solicitudes | captaciones
 *   ------------------|------------|------------|-------------|-------------------
 *   owner             | all        | all        | all         | all
 *   admin             | all        | all        | all         | all
 *   advisor           | all        | all        | all         | all
 *   agent_admin       | all        | all        | all         | all
 *   agent_senior      | all        | team       | team        | own_only (*)
 *   agent_junior      | all        | own_only   | own_only    | own_only (*)
 *   captadora         | none       | none       | none        | assigned_only
 *   (desconocido)     | all        | all        | all         | all
 *
 *   (*) captaciones delega en `getCaptacionViewRestriction` (normalizado):
 *       agent_senior/junior → `confirmed_and_own` → "own_only".
 *
 * Notas de negocio:
 *   - `properties` es inventario COMPARTIDO: todo el staff que entra al panel
 *     lo ve completo (para clientes/solicitudes sí se restringe por cartera).
 *   - `agent_senior` = "team" y `agent_junior` = "own_only" SOLO en clientes y
 *     solicitudes; cualquier otro recurso no listado aquí cae en "all" para no
 *     restringir de más.
 *   - `captadora` solo opera captaciones; el resto de recursos → "none".
 *
 * @param role     Rol del usuario (ej. "agent_junior", "admin").
 * @param resource Recurso a consultar (ej. "clientes", "solicitudes").
 */
export function getViewRestriction(
  role: string,
  resource: PermissionResource,
): ViewRestriction {
  // Captaciones: reutiliza la lógica dedicada existente (coherencia total).
  if (resource === "captaciones") {
    return normalizeCaptacionRestriction(getCaptacionViewRestriction(role));
  }

  const isScopedBusinessData =
    resource === "clientes" || resource === "solicitudes";

  switch (role) {
    case "owner":
    case "admin":
    case "advisor":
    case "agent_admin":
      return "all";
    case "agent_senior":
      // Inventario (properties) y demás recursos: todo. Cartera de negocio
      // (clientes/solicitudes): su equipo (hoy simplificado a "own", ver tipo).
      return isScopedBusinessData ? "team" : "all";
    case "agent_junior":
      return isScopedBusinessData ? "own_only" : "all";
    case "captadora":
      // Fuera de captaciones (ya resuelto arriba) no ve nada.
      return "none";
    default:
      // Rol no contemplado: NO ocultar datos por error.
      return "all";
  }
}

/** Comprueba si un rol es un rol de agente inmobiliario */
export function isAgentRole(role: string): role is AgentRole {
  return AGENT_ROLES.includes(role as AgentRole);
}

/** Comprueba si un rol es staff (accede al /admin) */
export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);
}
