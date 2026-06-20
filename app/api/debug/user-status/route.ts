import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const email = "benjamincousino1@gmail.com";

    // Check auth user
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
      return Response.json({ error: `Auth error: ${usersError.message}` }, { status: 500 });
    }

    const user = users?.find(u => u.email === email);
    if (!user) {
      return Response.json({ error: `User not found in auth`, email }, { status: 404 });
    }

    // Check profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, country")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return Response.json({ error: `Profile query error: ${profileError.message}` }, { status: 500 });
    }

    // Check env var
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
    const shouldBeAdmin = adminEmails.includes(email.toLowerCase());

    return Response.json({
      ok: true,
      authUser: {
        id: user.id,
        email: user.email,
        metadata: user.user_metadata,
      },
      profile: profile || { status: "MISSING" },
      envConfig: {
        ADMIN_EMAILS: process.env.ADMIN_EMAILS,
        parsedEmails: adminEmails,
        shouldBeAdmin,
      },
    });
  } catch (err) {
    return Response.json({
      error: `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
