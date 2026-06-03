import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  try {
    const { feedKey, clientId, clientSecret, sandboxMode } = await req.json();
    const supabase = createAdminClient();

    const { data: existing } = await (supabase
      .from("idealista_config")
      .select("id")
      .limit(1)
      .single() as any);

    if (existing) {
      await (supabase
        .from("idealista_config")
        .update({
          feed_key: feedKey,
          client_id: clientId,
          client_secret: clientSecret,
          sandbox_mode: sandboxMode ?? true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", (existing as any).id) as any);
    } else {
      await (supabase
        .from("idealista_config")
        .insert({
          feed_key: feedKey,
          client_id: clientId,
          client_secret: clientSecret,
          sandbox_mode: sandboxMode ?? true,
        } as any) as any);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Save config error:", error);
    return Response.json({ error: "Error al guardar configuración" }, { status: 500 });
  }
}
