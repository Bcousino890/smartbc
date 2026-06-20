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

  const adminEmail = "benjamincousino1@gmail.com";
  const isAdmin = user.email?.toLowerCase() === adminEmail.toLowerCase();

  // Try to get profile from DB
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();

  let profile = existingProfile as { role: UserRole; country?: string } | null;

  // If profile doesn't exist in DB, create it with admin client
  if (!profile) {
    const adminClient = createAdminClient();

    // Attempt insert
    const { data: inserted, error: insertError } = await adminClient
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email,
        role: isAdmin ? "admin" : "client",
        country: "es",
      })
      .select("role, country")
      .maybeSingle();

    if (!insertError && inserted) {
      profile = inserted;
    } else {
      // Insert failed or returned nothing
      // Create in-memory profile for immediate use
      profile = {
        role: isAdmin ? ("admin" as UserRole) : ("client" as UserRole),
        country: "es",
      };

      // Also attempt async profile creation in background (don't wait)
      adminClient
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email,
          role: isAdmin ? "admin" : "client",
          country: "es",
        })
        .catch(() => {
          // Silently fail - user already has in-memory profile
        });
    }
  }

  revalidatePath("/", "layout");

  // Redirect based on profile role (always has one now, either from DB or memory)
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
