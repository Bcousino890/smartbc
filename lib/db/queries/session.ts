import "server-only";
import { createClient } from "../server";
import type { Database } from "../database.types";
import { isSuspended } from "@/lib/auth/user-rank";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  // Una cuenta suspendida no existe para la aplicación: su sesión puede seguir
  // viva hasta que caduque el token, pero ninguna ruta ni gate la reconoce
  // (migración 0210; sin la columna, `suspended_at` no viene y no pasa nada).
  if (isSuspended(data as { suspended_at?: string | null } | null)) return null;
  return data;
}
