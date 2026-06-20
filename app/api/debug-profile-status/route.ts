import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function GET() {
  const supabase = createAdminClient();
  const email = "benjamincousino1@gmail.com";
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // 1. Check if user exists in auth
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      diagnostics.checks.auth = { status: "ERROR", error: authError.message };
      return Response.json(diagnostics, { status: 500 });
    }

    const user = users?.find(u => u.email === email);
    if (!user) {
      diagnostics.checks.auth = { status: "NOT_FOUND", message: `User ${email} not in auth` };
      return Response.json(diagnostics, { status: 404 });
    }

    diagnostics.checks.auth = { status: "OK", userId: user.id, email: user.email };

    // 2. Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, country")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      diagnostics.checks.profile_query = { status: "ERROR", error: profileError.message };
    } else if (profile) {
      diagnostics.checks.profile_exists = { status: "OK", data: profile };
    } else {
      diagnostics.checks.profile_exists = { status: "MISSING" };

      // 3. Try to create it
      try {
        const { data: created, error: rpcError } = await supabase
          .rpc("create_user_profile", {
            p_id: user.id,
            p_email: user.email,
            p_full_name: user.user_metadata?.full_name || user.email,
            p_role: "admin",
          });

        if (rpcError) {
          diagnostics.checks.profile_creation = { status: "RPC_ERROR", error: rpcError.message };
        } else {
          diagnostics.checks.profile_creation = { status: "SUCCESS", data: created };
        }
      } catch (err) {
        diagnostics.checks.profile_creation = {
          status: "EXCEPTION",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // 4. Check RLS policies
    try {
      const { data: policies, error: policiesError } = await supabase.rpc(
        "get_profile_policies",
      );

      if (!policiesError) {
        diagnostics.checks.rls_policies = { status: "OK", policies };
      }
    } catch {
      diagnostics.checks.rls_policies = { status: "SKIPPED" };
    }

    // 5. Check migrations applied
    try {
      const { data: migs } = await supabase
        .from("schema_migrations")
        .select("version, name")
        .order("version", { ascending: false })
        .limit(10);

      diagnostics.checks.migrations = { status: "OK", latest: migs };
    } catch {
      diagnostics.checks.migrations = { status: "SKIPPED" };
    }

    return Response.json(diagnostics);
  } catch (err) {
    diagnostics.checks.fatal = {
      status: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    };
    return Response.json(diagnostics, { status: 500 });
  }
}
