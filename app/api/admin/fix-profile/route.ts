import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const email = "benjamincousino1@gmail.com";

  try {
    // Get the auth user
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      return Response.json({ error: `Failed to list users: ${usersError.message}` }, { status: 500 });
    }

    const user = users?.find(u => u.email === email);
    if (!user) {
      return Response.json({ error: `User ${email} not found in auth` }, { status: 404 });
    }

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (checkError) {
      return Response.json({ error: `Failed to check profile: ${checkError.message}` }, { status: 500 });
    }

    if (existingProfile) {
      return Response.json({ ok: true, message: "Profile already exists", profile: existingProfile });
    }

    // Create the profile
    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        role: "admin",
        full_name: user.user_metadata?.full_name || user.email,
        country: "es",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return Response.json({ error: `Failed to create profile: ${insertError.message}` }, { status: 500 });
    }

    return Response.json({
      ok: true,
      message: "Profile created successfully",
      profile: newProfile,
      userId: user.id,
      email: user.email,
    });
  } catch (err) {
    return Response.json({
      error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
