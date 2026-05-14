import "server-only";
import type { createClient } from "./server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthError = {
  ok: false;
  error: "no_session" | "forbidden_not_admin" | "forbidden_not_staff";
};

export type AuthOk = { ok: true; userId: string; role: "admin" | "advisor" | "client" };

/**
 * Devuelve la sesión activa o un error tipado. No verifica rol — para eso
 * usar `requireAdmin` o `requireStaff`.
 */
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
  const role = ((profileResult.data as { role?: string } | null)?.role ??
    "client") as "admin" | "advisor" | "client";
  return { ok: true, userId: user.id, role };
}

/**
 * Requiere que el usuario sea staff (admin o advisor). RLS de Supabase impide
 * la escritura aunque alguien lo intente bypassear, pero detectarlo aquí
 * permite devolver un mensaje claro a la UI en vez de un error opaco de PG.
 */
export async function requireStaff(
  supabase: SupabaseClient,
): Promise<AuthOk | AuthError> {
  const session = await requireSession(supabase);
  if (!session.ok) return session;
  if (session.role !== "admin" && session.role !== "advisor") {
    return { ok: false, error: "forbidden_not_staff" };
  }
  return session;
}

/**
 * Requiere rol `admin` estricto. Se usa para mutaciones reservadas (crear
 * agencia, editar comisiones) donde un advisor lee pero no escribe.
 */
export async function requireAdmin(
  supabase: SupabaseClient,
): Promise<AuthOk | AuthError> {
  const session = await requireSession(supabase);
  if (!session.ok) return session;
  if (session.role !== "admin") {
    return { ok: false, error: "forbidden_not_admin" };
  }
  return session;
}
