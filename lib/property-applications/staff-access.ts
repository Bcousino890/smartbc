// Mapa PURO (sin I/O) de qué permiso y qué alcance exige cada operación de
// STAFF sobre una solicitud de documentación. Vive aparte de `staff-gate.ts`
// (que es server-only) para poder probarlo con `npm run test:permission-scope`.
//
// - `permission`: acción de la matriz `documentacion.*` que debe tener la persona.
// - `scope`: tipo de alcance (`ScopeKind`) con el que se comprueba el cliente de
//   la solicitud. «Exportar» sigue el alcance de «Ver».

export type StaffApplicationAccess = {
  permission: "view" | "edit" | "export";
  scope: "view" | "edit";
};

/** Lecturas: GET de la solicitud. */
export const STAFF_READ: StaffApplicationAccess = { permission: "view", scope: "view" };
/** Escrituras: decidir, editar, verificar, analizar, subir documentos. */
export const STAFF_WRITE: StaffApplicationAccess = { permission: "edit", scope: "edit" };
/** Resumen del candidato (PDF / envío): permiso Exportar, alcance de Ver. */
export const STAFF_EXPORT: StaffApplicationAccess = { permission: "export", scope: "view" };

const PATCH_STAFF_ACTIONS = new Set(["approve", "reject", "reopen", "update", "recalculate"]);

/**
 * Acceso que exige una acción del PATCH de la solicitud cuando la ejecuta
 * staff. `null` = no es una acción de staff (p. ej. `submit`, que es solo del
 * solicitante, o una acción desconocida): no se aplica gate de staff.
 */
export function staffAccessForPatchAction(action: unknown): StaffApplicationAccess | null {
  return typeof action === "string" && PATCH_STAFF_ACTIONS.has(action) ? STAFF_WRITE : null;
}
