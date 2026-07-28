import { canAccess, type EffectivePermissions } from "@/lib/permissions";

/** Usuario que intenta operar sobre la captación. `role` es el rol EFECTIVO. */
export type CaptacionActorRef = { id: string; role: string };

/** Campos mínimos de la captación necesarios para decidir el acceso. */
export type CaptacionAccessRef = {
  assigned_to?: string | null;
  created_by?: string | null;
};

/**
 * ¿Puede este usuario TRABAJAR esta captación? Es decir: registrar intentos de
 * contacto, añadir/editar contactos del dueño, editar notas y confirmar al
 * propietario.
 *
 * Regla ÚNICA compartida por la UI (pestañas "Datos del Dueño" e "Intentos") y
 * por las rutas de API que mutan la captación. Antes cada lado tenía su propia
 * lista de roles escrita a mano y no coincidían: la UI enseñaba los botones a
 * `captadora | admin | creador` mientras la API aceptaba
 * `admin | agent_admin | asignado | creador`. Resultado: a quien tenía la
 * captación en sus manos pero no era literalmente `captadora` ni `admin` —un
 * ejecutivo, un rol por país o un rol personalizado— no le aparecía el botón
 * "+ Registrar Intento" ni podía escribir los datos del dueño, aunque la API sí
 * le habría dejado.
 *
 * Criterio:
 *   1. Quien tiene la captación asignada o quien la creó, siempre — es su
 *      trabajo, no depende del rol.
 *   2. El resto del equipo, si su permiso EFECTIVO incluye `captaciones.edit`.
 *
 * @param actor      Usuario actual (id + rol efectivo, este último solo como
 *                   fallback si no hay matriz).
 * @param captacion  `assigned_to` / `created_by` de la captación.
 * @param effective  Matriz de permisos efectivos (rol por país + rol
 *                   personalizado + excepciones del usuario). Si no se pasa,
 *                   se cae al permiso por rol.
 */
export function canWorkCaptacion(
  actor: CaptacionActorRef,
  captacion: CaptacionAccessRef,
  effective?: EffectivePermissions | null,
): boolean {
  if (!actor?.id) return false;

  if (captacion.assigned_to && captacion.assigned_to === actor.id) return true;
  if (captacion.created_by && captacion.created_by === actor.id) return true;

  if (effective) return effective.captaciones?.edit ?? false;
  return canAccess(actor.role, "captaciones", "edit");
}

/** Roles con mando sobre la captación (asignar, editar ficha, mover etapa). */
export function isCaptacionAdminRole(role: string): boolean {
  return role === "admin" || role === "owner" || role === "agent_admin";
}
