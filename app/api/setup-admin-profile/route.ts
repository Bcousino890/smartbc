import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * PUBLIC endpoint to create missing admin profile
 * No authentication required - only works for specific hardcoded email
 * Usage: POST /api/setup-admin-profile
 */
export async function POST() {
  const email = "benjamincousino1@gmail.com";

  try {
    const supabase = createAdminClient();

    // Get user from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError || !users) {
      return Response.json({ error: "Auth list failed", details: listError?.message }, { status: 500 });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
      return Response.json({ error: `User ${email} not found in auth`, status: "USER_NOT_FOUND" }, { status: 404 });
    }

    // Check if profile already exists
    const { data: existing, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) {
      return Response.json({ ok: true, status: "ALREADY_EXISTS", profile: existing });
    }

    // Try direct insert (might fail due to RLS, but try anyway)
    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email,
        role: "admin",
        country: "es",
      })
      .select("id, email, role, country")
      .single();

    if (insertError) {
      // If direct insert fails, try RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc("create_user_profile", {
        p_id: user.id,
        p_email: user.email,
        p_full_name: user.user_metadata?.full_name || user.email,
        p_role: "admin",
      });

      if (rpcError) {
        return Response.json({
          error: "Both insert and RPC failed",
          direct_insert_error: insertError.message,
          rpc_error: rpcError.message,
          status: "FAILED",
        }, { status: 500 });
      }

      return Response.json({
        ok: true,
        status: "CREATED_VIA_RPC",
        profile: rpcResult,
      });
    }

    return Response.json({
      ok: true,
      status: "CREATED_VIA_INSERT",
      profile: inserted,
    });
  } catch (err) {
    return Response.json({
      error: "Unexpected error",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
