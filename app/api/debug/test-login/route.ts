import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ error: "Missing email or password" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Try to sign in
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return Response.json({ error: `Sign in failed: ${signInError.message}` }, { status: 401 });
    }

    const user = data.user;
    if (!user) {
      return Response.json({ error: "Sign in succeeded but no user returned" }, { status: 500 });
    }

    // Check profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, country")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return Response.json({ error: `Profile query failed: ${profileError.message}` }, { status: 500 });
    }

    if (!profile) {
      return Response.json({
        ok: false,
        reason: "NO_PROFILE",
        message: "Auth user exists but profile is missing",
        authUser: { id: user.id, email: user.email },
        profile: null,
        nextStep: "Try logging in via /login - should auto-create profile",
      });
    }

    return Response.json({
      ok: true,
      user: { id: user.id, email: user.email },
      profile,
      redirectTo: profile.role === "admin" ? `/${profile.country || "es"}/admin` : "/inicio",
    });
  } catch (err) {
    return Response.json({
      error: `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
