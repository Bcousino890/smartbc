import "server-only";
import { getRequestPermissions } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile, type ProfileRow } from "@/lib/db/queries/session";
import type { EffectivePermissions, PermissionAction } from "@/lib/permissions";

/**
 * Piezas de servidor para las rutas que gestionan cuentas
 * (`app/api/admin/usuarios/**`). Las reglas de quién puede hacer qué viven,
 * puras y con test, en `lib/auth/user-admin-rules.ts`.
 */

export type UserAdminGate =
  | { ok: true; actor: ProfileRow; actorPermissions: EffectivePermissions }
  | { ok: false; response: Response };

/**
 * Exige sesión y el permiso EFECTIVO `usuarios.<action>` (rol, rol por país,
 * rol personalizado y excepciones; país de la petición — ver guard.ts).
 * Antes cada ruta miraba una lista fija de roles y no respetaba excepciones.
 */
export async function requireUserAdmin(action: PermissionAction): Promise<UserAdminGate> {
  const actor = await getCurrentProfile().catch(() => null);
  if (!actor) {
    return { ok: false, response: Response.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const { permissions } = await getRequestPermissions(actor);
  if (permissions.usuarios?.[action] !== true) {
    return {
      ok: false,
      response: Response.json(
        { error: "No tienes permiso para gestionar usuarios. Pídeselo a un administrador." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, actor, actorPermissions: permissions };
}

export type TargetProfile = {
  id: string;
  role: string;
  email: string | null;
  country: string | null;
  countries: string[] | null;
  multi_country: boolean | null;
  custom_role_id: string | null;
};

/** Perfil de la cuenta que se va a modificar (service role). */
export async function loadTargetProfile(userId: string): Promise<TargetProfile | null> {
  if (typeof userId !== "string" || !userId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient({ timeoutMs: 10_000 }) as any;
  const full = await db
    .from("profiles")
    .select("id, role, email, country, countries, multi_country, custom_role_id")
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) return (full.data as TargetProfile | null) ?? null;
  // Columnas de las migraciones 0088/0090 sin aplicar: lo mínimo.
  const min = await db.from("profiles").select("id, role, email, country").eq("id", userId).maybeSingle();
  if (min.error || !min.data) return null;
  return { countries: null, multi_country: null, custom_role_id: null, ...(min.data as object) } as TargetProfile;
}

/** Cuántos propietarios hay (para no quedarse sin ninguno). */
export async function countOwners(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient({ timeoutMs: 10_000 }) as any;
  const { count, error } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner");
  // Ante la duda (error de lectura), no dejar degradar: 1.
  return error ? 1 : (count ?? 1);
}

/** ¿Existe el rol personalizado? */
export async function customRoleExists(id: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient({ timeoutMs: 10_000 }) as any;
  const { data, error } = await db.from("custom_roles").select("id").eq("id", id).maybeSingle();
  return !error && Boolean(data);
}

export function forbidden(error: string): Response {
  return Response.json({ error }, { status: 403 });
}
