import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * EMERGENCY endpoint to create or verify admin user
 * POST body: { email, password, name }
 *
 * USAGE:
 * curl -X POST https://portal.bcousino prop.com/api/emergency-admin-setup \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "email": "benjamincousino1@gmail.com",
 *     "password": "tu-contraseña",
 *     "name": "Benjamin Cousino"
 *   }'
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return Response.json(
        { error: "Missing email, password, or name" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. Check if user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return Response.json(
        { error: "Failed to list users", details: listError.message },
        { status: 500 }
      );
    }

    let user = users?.find(u => u.email === email);

    // 2. If user doesn't exist, create it
    if (!user) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createError) {
        return Response.json(
          { error: "Failed to create user", details: createError.message },
          { status: 400 }
        );
      }

      user = created.user;
    }

    if (!user) {
      return Response.json({ error: "No user returned" }, { status: 500 });
    }

    // 3. Check if profile exists
    const { data: profile, error: profileCheckError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileCheckError) {
      return Response.json(
        { error: "Profile check failed", details: profileCheckError.message },
        { status: 500 }
      );
    }

    // 4. If profile doesn't exist, create it
    if (!profile) {
      const { error: profileCreateError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          full_name: name,
          role: "admin",
          country: "es",
        });

      if (profileCreateError) {
        return Response.json(
          {
            error: "Failed to create profile",
            details: profileCreateError.message,
            note: "User was created but profile insert failed. This might be a RLS issue.",
            workaround: "Try logging in anyway - the app might create it automatically.",
          },
          { status: 400 }
        );
      }
    }

    return Response.json({
      ok: true,
      message: "Admin user ready to login",
      user: {
        id: user.id,
        email: user.email,
        profile_created: !!profile || "just-created",
      },
      next_step: "Go to /login and enter your credentials",
    });
  } catch (err) {
    return Response.json(
      {
        error: "Unexpected error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    endpoint: "/api/emergency-admin-setup",
    method: "POST",
    body: {
      email: "benjamincousino1@gmail.com",
      password: "your-password",
      name: "Benjamin Cousino",
    },
    description: "Creates admin user in auth + profile if they don't exist",
  });
}
