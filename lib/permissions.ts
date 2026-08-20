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
  | "agencias"
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
  | "sindicacion"
  | "diagnostico"
  | "calendario"
  | "viewing_collections";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "publish";

export type PermissionMatrix = Record<PermissionResource, Record<PermissionAction, boolean>>;

// ─── Orden canónico (para iterar de forma estable en API y UI) ────────────────

export const PERMISSION_RESOURCES: readonly PermissionResource[] = [
  "properties",
  "agencias",
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
  "sindicacion",
  "diagnostico",
  "calendario",
  "viewing_collections",
] as const;

export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "publish",
] as const;

// ─── Etiquetas y descripciones en español (para la UI) ────────────────────────

export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  properties:    "Propiedades",
  agencias:      "Agencias",
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
  sindicacion:   "Sindicación",
  diagnostico:   "Diagnóstico",
  calendario:    "Calendario",
  viewing_collections: "Colecciones de visitas",
};

export const RESOURCE_DESCRIPTIONS: Record<PermissionResource, string> = {
  properties:    "Cartera de propiedades de la agencia.",
  agencias:      "Agencias colaboradoras y condiciones de comisión.",
  particulares:  "Captaciones y anuncios de particulares.",
  publicacion:   "Publicación de propiedades en portales (Idealista, PortalInmobiliario…).",
  captaciones:   "Gestión de captaciones inmobiliarias.",
  clientes:      "Base de datos de clientes y leads.",
  solicitudes:   "Solicitudes de información y visitas.",
  documentacion: "Documentos y archivos de propiedades.",
  mensajes:      "Bandeja de mensajes y conversaciones.",
  reportes:      "Informes y métricas del negocio.",
  usuarios:      "Equipo interno y gestión de cuentas.",
  configuracion: "Ajustes generales de la cuenta.",
  sindicacion:   "Feeds de sindicación a portales externos.",
  diagnostico:   "Herramientas de diagnóstico técnico.",
  calendario:    "Agenda, citas y eventos.",
  viewing_collections:
    "Selecciones de propiedades por cliente, itinerarios de visitas y colecciones privadas compartibles.",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view:   "Ver",
  create: "Crear",
  edit:   "Editar",
  delete: "Eliminar",
  export: "Exportar",
  publish: "Publicar",
};

export const ACTION_DESCRIPTIONS: Record<PermissionAction, string> = {
  view:   "Consultar y acceder a los registros.",
  create: "Añadir nuevos registros.",
  edit:   "Modificar registros existentes.",
  delete: "Eliminar registros de forma permanente.",
  export: "Descargar o exportar los datos.",
  publish:
    "Generar, renovar y revocar enlaces públicos dirigidos a clientes.",
};

// ─── Matrices por rol ─────────────────────────────────────────────────────────

// `properties.publish` controla el interruptor de la web pública (contrato de
// la migración 0143). Hasta entonces era false para TODOS los roles: el
// permiso existía y no lo tenía nadie, y de todos modos la web ignoraba el
// campo. Ahora lo tienen agent_admin, admin/owner y advisor.
const AGENT_JUNIOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  agencias:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  particulares:  { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  publicacion:   { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  captaciones:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  clientes:      { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  solicitudes:   { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  documentacion: { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  mensajes:      { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  sindicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  viewing_collections: { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
};

const AGENT_SENIOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true,  create: true,  edit: true,  delete: false, export: true, publish: false },
  agencias:      { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  particulares:  { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  publicacion:   { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  captaciones:   { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  clientes:      { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  solicitudes:   { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  documentacion: { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  mensajes:      { view: true,  create: true,  edit: false, delete: false, export: false, publish: false },
  reportes:      { view: true,  create: false, edit: false, delete: false, export: false, publish: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  sindicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: true,  create: true,  edit: true,  delete: false, export: false, publish: false },
  viewing_collections: { view: true,  create: true,  edit: true,  delete: false, export: false, publish: true  },
};

const AGENT_ADMIN_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true,  edit: true, delete: true,  export: true, publish: true  },
  agencias:      { view: true, create: true,  edit: true, delete: false, export: false, publish: false },
  particulares:  { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  publicacion:   { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  captaciones:   { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  clientes:      { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  solicitudes:   { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  documentacion: { view: true, create: true,  edit: true, delete: true,  export: true, publish: false },
  mensajes:      { view: true, create: true,  edit: true, delete: false, export: false, publish: false },
  reportes:      { view: true, create: false, edit: false, delete: false, export: true, publish: false },
  usuarios:      { view: true, create: true,  edit: true, delete: false, export: false, publish: false },
  configuracion: { view: true, create: false, edit: true, delete: false, export: false, publish: false },
  sindicacion:   { view: true, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: true, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: true, create: true,  edit: true, delete: true,  export: false, publish: false },
  viewing_collections: { view: true,  create: true,  edit: true,  delete: true,  export: true,  publish: true  },
};

// Roles con acceso total (owner, admin) — todo permitido
const FULL_ACCESS_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true, edit: true, delete: true, export: true, publish: true  },
  agencias:      { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  particulares:  { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  publicacion:   { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  captaciones:   { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  clientes:      { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  solicitudes:   { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  documentacion: { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  mensajes:      { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  reportes:      { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  usuarios:      { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  configuracion: { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  sindicacion:   { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  diagnostico:   { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  calendario:    { view: true, create: true, edit: true, delete: true, export: true, publish: false },
  viewing_collections: { view: true, create: true, edit: true, delete: true, export: true, publish: true },
};

// Advisor: similar a full access pero sin gestión total de usuarios/config
const ADVISOR_PERMISSIONS: PermissionMatrix = {
  properties:    { view: true, create: true,  edit: true,  delete: true,  export: true, publish: true  },
  agencias:      { view: true, create: false, edit: false, delete: false, export: false, publish: false },
  particulares:  { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  publicacion:   { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  captaciones:   { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  clientes:      { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  solicitudes:   { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  documentacion: { view: true, create: true,  edit: true,  delete: true,  export: true, publish: false },
  mensajes:      { view: true, create: true,  edit: true,  delete: false, export: false, publish: false },
  reportes:      { view: true, create: false, edit: false, delete: false, export: true, publish: false },
  usuarios:      { view: true, create: false, edit: false, delete: false, export: false, publish: false },
  configuracion: { view: true, create: false, edit: true,  delete: false, export: false, publish: false },
  sindicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: true, create: true,  edit: true,  delete: true,  export: false, publish: false },
  viewing_collections: { view: true, create: true,  edit: true,  delete: true,  export: true,  publish: true  },
};

// Rol "captadora" — operaria de captaciones (solo ve y edita asignadas a ella)
const CAPTADORA_PERMISSIONS: PermissionMatrix = {
  properties:    { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  agencias:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  particulares:  { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  publicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  captaciones:   { view: true,  create: false, edit: true,  delete: false, export: false, publish: false },
  clientes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  solicitudes:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  documentacion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  mensajes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  sindicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  viewing_collections: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
};

// Sin acceso (client, viewer, roles desconocidos)
const NO_ACCESS_PERMISSIONS: PermissionMatrix = {
  properties:    { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  agencias:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  particulares:  { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  publicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  captaciones:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  clientes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  solicitudes:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  documentacion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  mensajes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  reportes:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  usuarios:      { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  configuracion: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  sindicacion:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  diagnostico:   { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  calendario:    { view: false, create: false, edit: false, delete: false, export: false, publish: false },
  viewing_collections: { view: false, create: false, edit: false, delete: false, export: false, publish: false },
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

/**
 * Igual que `PERMISSIONS_BY_ROLE[role] ?? NO_ACCESS_PERMISSIONS`, expuesto
 * como función para que `lib/db/queries/permissions.ts` pueda resolver la
 * matriz base de un rol (incluido el rol efectivo por país) sin importar el
 * mapa privado directamente.
 */
export function PERMISSIONS_BY_ROLE_FALLBACK(role: string): PermissionMatrix {
  return PERMISSIONS_BY_ROLE[role] ?? NO_ACCESS_PERMISSIONS;
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
 *
 * @param baseMatrix - Matriz base explícita (opcional). Cuando se pasa, se usa
 *   en vez de `PERMISSIONS_BY_ROLE[role]` — la usan los roles personalizados
 *   (`custom_roles.matrix`) y el rol efectivo por país resuelto en
 *   `lib/db/queries/permissions.ts`. Sin ella, comportamiento actual.
 */
export function applyOverrides(
  role: string,
  overrides: PermissionOverride[],
  baseMatrix?: PermissionMatrix,
): EffectivePermissions {
  const matrix = baseMatrix ?? PERMISSIONS_BY_ROLE[role] ?? NO_ACCESS_PERMISSIONS;
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
  baseMatrix?: PermissionMatrix,
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

  return applyOverrides(role, ordered, baseMatrix);
}

// ─── Roles personalizados ──────────────────────────────────────────────────

/**
 * Construye una `PermissionMatrix` completa (todas las celdas presentes) a
 * partir de un valor arbitrario (típicamente `custom_roles.matrix`, jsonb
 * leído de la base de datos). Tolerante con datos parciales o corruptos:
 * cualquier celda ausente o con tipo inesperado cae a `false` en vez de
 * lanzar o dejar huecos — así un roles personalizado mal guardado nunca
 * concede más de lo que declara explícitamente.
 */
export function normalizeMatrix(input: unknown): PermissionMatrix {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const out = {} as PermissionMatrix;
  for (const resource of PERMISSION_RESOURCES) {
    const srcResource = (src[resource] && typeof src[resource] === "object"
      ? src[resource]
      : {}) as Record<string, unknown>;
    out[resource] = {} as Record<PermissionAction, boolean>;
    for (const action of PERMISSION_ACTIONS) {
      out[resource][action] = srcResource[action] === true;
    }
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Roles de agente inmobiliario (los 3 nuevos) */
export const AGENT_ROLES = ["agent_junior", "agent_senior", "agent_admin"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * Todos los roles staff que acceden a /admin (usado para rutear al matrix
 * de permisos correcto, ver ROLE_PERMISSIONS más abajo).
 *
 * ⚠️ NO es lo mismo que STAFF_ROLES en lib/db/auth-helpers.ts (6 roles, sin
 * "captadora") — esa lista gatea rutas genéricas de staff (mensajes,
 * propiedades, clientes, documentos...) que "captadora" NO debe poder usar
 * (ver CAPTADORA_PERMISSIONS: todo en false salvo captaciones). Son dos
 * listas con propósitos distintos a propósito; si agregás un rol nuevo,
 * actualizá ambas y pensá en cuál de las dos (o las dos) le corresponde.
 */
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
    // El advisor tiene la misma matriz que un admin en captaciones (ver/crear/
    // editar/borrar); dejarlo fuera de "all" le vaciaba el listado.
    case "advisor":
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
    resource === "clientes" ||
    resource === "solicitudes" ||
    resource === "viewing_collections";

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
