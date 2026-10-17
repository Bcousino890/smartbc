import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";

/**
 * Agrupación de las 16 secciones del CRM en áreas, para que el panel de
 * Permisos se lea de un vistazo en vez de ser una lista plana de 96
 * interruptores. Módulo PURO (probado con `npm run test:permission-areas`).
 */
export type PermissionArea = {
  id: string;
  label: string;
  hint: string;
  resources: PermissionResource[];
};

const AREAS: PermissionArea[] = [
  {
    id: "comercial",
    label: "Operación comercial",
    hint: "Lo que se trabaja a diario con clientes y propiedades.",
    resources: ["properties", "clientes", "solicitudes", "viewing_collections", "calendario", "mensajes", "documentacion"],
  },
  {
    id: "captacion",
    label: "Captación y publicación",
    hint: "Conseguir propiedades y sacarlas a portales.",
    resources: ["particulares", "captaciones", "publicacion", "sindicacion"],
  },
  {
    id: "gestion",
    label: "Gestión del negocio",
    hint: "Agencias colaboradoras y resultados.",
    resources: ["agencias", "reportes"],
  },
  {
    id: "administracion",
    label: "Administración",
    hint: "Personas, ajustes y herramientas técnicas.",
    resources: ["usuarios", "configuracion", "diagnostico"],
  },
];

/**
 * Áreas con todas las secciones. Si algún día se añade un recurso a
 * `PERMISSION_RESOURCES` y se olvida aquí, aparece en «Otras secciones» en vez
 * de desaparecer del panel.
 */
export function getPermissionAreas(): PermissionArea[] {
  const placed = new Set(AREAS.flatMap((a) => a.resources));
  const missing = PERMISSION_RESOURCES.filter((r) => !placed.has(r));
  return missing.length
    ? [...AREAS, { id: "otras", label: "Otras secciones", hint: "", resources: [...missing] }]
    : AREAS;
}

/** Acciones que borran, sacan datos o publican hacia fuera: se señalan en el panel. */
export const SENSITIVE_ACTIONS: readonly PermissionAction[] = ["delete", "export", "publish"];

export function isSensitiveAction(action: PermissionAction): boolean {
  return SENSITIVE_ACTIONS.includes(action);
}

export type CellMatrix = Record<PermissionResource, Record<PermissionAction, boolean>>;

export type PermissionSummary = {
  /** Secciones en las que puede ver. */
  canView: number;
  /** Secciones en las que puede crear o editar. */
  canChange: number;
  /** Permisos sensibles activos (eliminar, exportar, publicar). */
  sensitive: number;
  /** Total de secciones. */
  total: number;
};

export function summarizePermissions(matrix: CellMatrix): PermissionSummary {
  let canView = 0;
  let canChange = 0;
  let sensitive = 0;
  for (const resource of PERMISSION_RESOURCES) {
    const row = matrix[resource];
    if (row?.view) canView++;
    if (row?.create || row?.edit) canChange++;
    for (const action of SENSITIVE_ACTIONS) if (row?.[action]) sensitive++;
  }
  return { canView, canChange, sensitive, total: PERMISSION_RESOURCES.length };
}

/** Permisos activos de un área, y total posible. */
export function areaCounts(
  area: PermissionArea,
  matrix: CellMatrix,
): { on: number; total: number } {
  let on = 0;
  for (const resource of area.resources) {
    for (const action of PERMISSION_ACTIONS) if (matrix[resource]?.[action]) on++;
  }
  return { on, total: area.resources.length * PERMISSION_ACTIONS.length };
}
