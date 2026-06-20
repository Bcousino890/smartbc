import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST() {
  try {
    const supabase = createAdminClient();

    // Get user from auth by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError || !users) {
      return Response.json({ error: "Failed to list users" }, { status: 500 });
    }

    const user = users.find(u => u.email === "benjamincousino1@gmail.com");
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Check if profile exists
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("id", user.id);

    if (count && count > 0) {
      return Response.json({ ok: true, message: "Profile already exists" });
    }

    // Create profile using admin client (bypasses RLS)
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        role: "admin",
        full_name: "Benjamin Cousino",
        country: "es",
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      ok: true,
      message: "Profile created successfully",
      profile: data,
    });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Unknown error",
    }, { status: 500 });
  }
}
