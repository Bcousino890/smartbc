"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import type { UserRole } from "@/lib/db/database.types";

// Emails que reciben rol admin si se auto-crea su perfil al iniciar sesión.
const ADMIN_EMAILS = ["fabri@bcousinoprop.com"];

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["client", "admin"]).optional(),
});

export type SignInState = {
  error?: string;
};

export async function signInAction(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: "auth.error.invalidCredentials" };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    return { error: "auth.error.invalidCredentials" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "auth.error.invalidCredentials" };

  // HARDCODED ADMIN: bypass DB for this email, always allow in
  if (user.email?.toLowerCase() === "benjamincousino1@gmail.com") {
    revalidatePath("/", "layout");
    redirect("/es/admin");
  }

  // All other users: check profile.
  // Cast explícito: el cliente de servidor infiere `data` como `never` para este
  // select, así que tipamos el resultado según el esquema real de la BD.
  const { data } = await supabase
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();
  let profile = data as { role: UserRole; country: string | null } | null;

  // Auto-provisión: si el usuario se autenticó pero no tiene perfil (el trigger
  // on_auth_user_created no llegó a crearlo, o quedó atrás por las migraciones),
  // lo creamos aquí con el service role. El rol admin se concede SOLO a los
  // emails de la allowlist; cualquier otro entra como `client`. Gated tras el
  // signInWithPassword de arriba, así que requiere conocer la contraseña.
  if (!profile) {
    const adminDb = createAdminClient();
    const emailLc = (user.email ?? "").toLowerCase();
    const role: UserRole = ADMIN_EMAILS.includes(emailLc) ? "admin" : "client";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: provisionErr } = await (adminDb.from("profiles") as any).upsert(
      {
        id: user.id,
        email: user.email,
        role,
        full_name: user.user_metadata?.full_name || user.email,
        country: "es",
      },
      { onConflict: "id" },
    );
    if (provisionErr) {
      await supabase.auth.signOut();
      return { error: "auth.error.noProfile" };
    }
    profile = { role, country: "es" };
  }

  revalidatePath("/", "layout");

  const staffRoles = ["admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  if (staffRoles.includes(profile.role)) {
    redirect(`/${profile.country ?? "es"}/admin`);
  }
  redirect("/inicio");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  if (!email) return { error: "auth.error.invalidCredentials" };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset-password`,
  });

  return { ok: true };
}
