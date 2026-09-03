import "server-only";
import type { createClient } from "./server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthError = {
  ok: false;
  error: "no_session" | "forbidden_not_admin" | "forbidden_not_staff";
};

export type AuthOk = { ok: true; userId: string; role: string };

// ⚠️ NO es lo mismo que STAFF_ROLES en lib/permissions.ts (7 roles, incluye
// "captadora") — esa otra lista rutea al matrix de permisos de cada rol,
// mientras que esta gatea rutas genéricas de staff (mensajes, propiedades,
// clientes, documentos...) que "captadora" NO debe poder usar (su matrix,
// CAPTADORA_PERMISSIONS, tiene todo en false salvo captaciones). Si agregás
// un rol nuevo, actualizá ambas listas y pensá en cuál le corresponde.
const STAFF_ROLES = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
export const ADMIN_ROLES = ["owner", "admin", "agent_admin"];

export async function requireSession(
  supabase: SupabaseClient,
): Promise<AuthOk | AuthError> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "no_session" };

  const profileResult = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = ((profileResult.data as { role?: string } | null)?.role ?? "client");
  return { ok: true, userId: user.id, role };
}

export async function requireStaff(
  supabase: SupabaseClient,
): Promise<AuthOk | AuthError> {
  const session = await requireSession(supabase);
  if (!session.ok) return session;
  if (!STAFF_ROLES.includes(session.role)) {
    return { ok: false, error: "forbidden_not_staff" };
  }
  return session;
}

export async function requireAdmin(
  supabase: SupabaseClient,
): Promise<AuthOk | AuthError> {
  const session = await requireSession(supabase);
  if (!session.ok) return session;
  if (!ADMIN_ROLES.includes(session.role)) {
    return { ok: false, error: "forbidden_not_admin" };
  }
  return session;
}
