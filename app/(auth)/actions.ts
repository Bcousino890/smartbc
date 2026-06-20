"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import type { UserRole } from "@/lib/db/database.types";

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

  let { data, error } = await supabase
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();
  let profile = data as { role: UserRole; country?: string } | null;

  // If profile doesn't exist, create it using the SQL function
  if (!profile) {
    const adminEmail = "benjamincousino1@gmail.com";
    const isAdmin = user.email?.toLowerCase() === adminEmail.toLowerCase();
    const initialRole = isAdmin ? "admin" : "client";

    try {
      // Call SQL function that safely creates profile with SECURITY DEFINER
      const { data: created, error: createError } = await adminClient
        .rpc("create_user_profile", {
          p_id: user.id,
          p_email: user.email || "",
          p_full_name: user.user_metadata?.full_name || user.email || "User",
          p_role: initialRole,
        });

      if (createError) {
        console.error("[login] RPC error:", createError);
        await supabase.auth.signOut();
        return { error: "auth.error.noProfile" };
      }

      // Extract profile from response
      if (created && Array.isArray(created) && created.length > 0) {
        profile = {
          role: created[0].role as UserRole,
          country: created[0].country,
        };
      } else if (created) {
        profile = {
          role: created.role as UserRole,
          country: created.country,
        };
      } else {
        console.error("[login] Profile creation returned no data");
        await supabase.auth.signOut();
        return { error: "auth.error.noProfile" };
      }
    } catch (err) {
      console.error("[login] Profile creation error:", err);
      await supabase.auth.signOut();
      return { error: "auth.error.noProfile" };
    }
  }

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "auth.error.noProfile" };
  }

  const staffRolesForCheck = ["admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  const requested = parsed.data.role;
  if (requested === "admin" && !staffRolesForCheck.includes(profile.role)) {
    await supabase.auth.signOut();
    return { error: "auth.error.notAdmin" };
  }

  revalidatePath("/", "layout");

  const staffRoles = ["admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  if (staffRoles.includes(profile.role)) {
    const country = profile.country ?? "es";
    redirect(`/${country}/admin`);
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
