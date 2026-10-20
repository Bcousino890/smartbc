import "server-only";
import { getEffectiveRoleAndPermissions } from "./permissions";
import { getCurrentProfile, type ProfileRow } from "./session";
import { createAdminClient } from "../admin";
import type { CaptacionViewRestriction, EffectivePermissions } from "@/lib/permissions";
import {
  applyScopeOverrides,
  defaultScopesFor,
  resolveCaptacionRestriction,
  type ScopeValue,
} from "@/lib/permissions-scope";
import { getScopeOverrides } from "./permissions";
import { canWorkCaptacion, isCaptacionAdminRole } from "@/lib/captaciones/access";

/** Captaciones es un módulo exclusivo de Chile: el país siempre es `cl`. */
const CAPTACIONES_COUNTRY = "cl";

export type CaptacionActor = {
  id: string;
  /** Rol EFECTIVO en Chile (rol por país si lo tiene; si no, el global). */
  role: string;
  /** Permisos efectivos: rol + rol personalizado + excepciones del usuario. */
  effective: EffectivePermissions;
  /** Atajo para los gates de "mando" (asignar, editar ficha, mover etapa). */
  isAdmin: boolean;
  /** Alcance de Editar en captaciones ("own" = solo asignadas/creadas por la persona). */
  editScope: ScopeValue;
  /** Qué captaciones puede VER (perfil + excepción de alcance de Ver). */
  viewRestriction: CaptacionViewRestriction;
};

/**
 * Resuelve el contexto de permisos del usuario para captaciones.
 *
 * Todo lo que decide accesos en captaciones (página de detalle y rutas de API)
 * debe partir de aquí, en vez de leer `profile.role` a pelo: ese campo es el
 * rol GLOBAL e ignora el rol por país, el rol personalizado y las excepciones
 * por usuario, que es justo lo que dejaba a gente sin poder trabajar sus
 * captaciones.
 */
export async function getCaptacionActor(profile: {
  id: string;
  role: string;
}): Promise<CaptacionActor> {
  const { effectiveRole, permissions } = await getEffectiveRoleAndPermissions(
    profile.id,
    profile.role,
    CAPTACIONES_COUNTRY,
  );
  const overrides = await getScopeOverrides(profile.id);
  return {
    id: profile.id,
    role: effectiveRole,
    effective: permissions,
    isAdmin: isCaptacionAdminRole(effectiveRole),
    // Mismos defaults que el panel (`getScopeDefaults` → `defaultScopesFor`):
    // la celda de captaciones sale del rol de Chile.
    editScope: applyScopeOverrides(
      defaultScopesFor(profile.role, effectiveRole),
      overrides,
      CAPTACIONES_COUNTRY,
    ).captaciones.edit,
    viewRestriction: resolveCaptacionRestriction(effectiveRole, overrides, CAPTACIONES_COUNTRY),
  };
}

/** `canWorkCaptacion` ya resuelto con el actor de `getCaptacionActor`. */
export function actorCanWorkCaptacion(
  actor: CaptacionActor,
  captacion: { assigned_to?: string | null; created_by?: string | null },
): boolean {
  return canWorkCaptacion(actor, captacion, actor.effective, actor.editScope);
}

export type CaptacionWorkGate =
  | {
      ok: true;
      profile: ProfileRow;
      actor: CaptacionActor;
      captacion: { assigned_to: string | null; created_by: string | null };
    }
  | { ok: false; response: Response };

/**
 * Gate para rutas de API que mutan una captación concreta (contactos, avisos…).
 *
 * A diferencia de `requirePermission("captaciones", "edit")`, esto además tiene
 * en cuenta a quien tiene la captación asignada o la creó, y resuelve el rol
 * de Chile. Es el mismo criterio con el que la UI decide si enseñar los botones,
 * para que nunca vuelvan a ir por caminos distintos.
 */
export async function requireCaptacionWork(captacionId: string): Promise<CaptacionWorkGate> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: captacion } = await db
    .from("captaciones")
    .select("assigned_to, created_by")
    .eq("id", captacionId)
    .single();

  if (!captacion) {
    return { ok: false, response: Response.json({ error: "Captación no encontrada" }, { status: 404 }) };
  }

  const actor = await getCaptacionActor(profile);
  if (!actorCanWorkCaptacion(actor, captacion)) {
    return {
      ok: false,
      response: Response.json(
        { error: "No tienes permiso para editar esta captación" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, profile, actor, captacion };
}
