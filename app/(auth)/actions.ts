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
  // Normalización defensiva del email: el teclado del móvil manda la primera
  // letra en mayúscula y cuela un espacio al aceptar el autocorrector, y con
  // eso el `.email()` de zod fallaba ANTES de preguntar a GoTrue. Resultado:
  // "Email o contraseña incorrectos" en el móvil con las credenciales buenas.
  const rawEmail = String(formData.get("email") ?? "");
  const rawPassword = String(formData.get("password") ?? "");
  const email = rawEmail.replace(/\s/g, "").toLowerCase();

  const parsed = credentialsSchema.safeParse({
    email,
    password: rawPassword,
    role: formData.get("role"),
  });

  if (!parsed.success) {
    // Diferenciado a propósito: un email mal escrito y una contraseña que no
    // cuadra son dos problemas distintos, y verlos con el mismo texto rojo es
    // lo que hacía imposible entender por qué no entraba.
    const badEmail = parsed.error.issues.some((i) => i.path[0] === "email");
    return {
      error: badEmail ? "auth.error.invalidEmail" : "auth.error.invalidCredentials",
    };
  }

  const supabase = await createClient();
  let { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // Segundo intento sin espacios al principio/final de la contraseña: el mismo
  // autocorrector del móvil añade uno al final y la deja irreconocible. Se
  // prueba primero tal cual se escribió, así que a quien tenga un espacio de
  // verdad en su contraseña no le rompemos nada.
  if (signInError) {
    const trimmedPassword = parsed.data.password.trim();
    if (trimmedPassword && trimmedPassword !== parsed.data.password) {
      ({ error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: trimmedPassword,
      }));
    }
  }

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

  // Comprobar perfil. Solo se selecciona `role` (NO `country`): PostgREST no
  // tiene la columna `country` en su schema cache, y seleccionarla hacía fallar
  // la consulta en silencio (se interpretaba como "sin perfil").
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  let profile = data as { role: UserRole } | null;

  const emailLc = (user.email ?? "").toLowerCase();
  const isAllowlistedAdmin = ADMIN_EMAILS.includes(emailLc);

  // Auto-provisión/ascenso (con service role, gated tras signInWithPassword):
  // crea el perfil si falta, o lo asciende a admin si el email está en la
  // allowlist y aún no lo es. Sin `country` (PostgREST no la conoce).
  if (!profile || (isAllowlistedAdmin && profile.role !== "admin")) {
    try {
      const adminDb = createAdminClient();
      const role: UserRole = isAllowlistedAdmin ? "admin" : (profile?.role ?? "client");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: provisionErr } = await (adminDb.from("profiles") as any).upsert(
        {
          id: user.id,
          email: user.email,
          role,
          full_name: user.user_metadata?.full_name || user.email,
        },
        { onConflict: "id" },
      );
      if (provisionErr) {
        await supabase.auth.signOut();
        return { error: `PROV_FAIL upsert: ${provisionErr.message}` };
      }
      profile = { role };
    } catch (e) {
      await supabase.auth.signOut();
      return { error: `PROV_FAIL throw: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "auth.error.noProfile" };
  }

  revalidatePath("/", "layout");

  const staffRoles = ["admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  if (staffRoles.includes(profile.role)) {
    redirect("/es/admin");
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
  // Mismo saneado que en el login: con un espacio del teclado del móvil, el
  // correo de recuperación no llegaba a ninguna parte.
  const email = String(formData.get("email") ?? "").replace(/\s/g, "").toLowerCase();
  if (!email) return { error: "auth.error.invalidEmail" };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset-password`,
  });

  return { ok: true };
}
