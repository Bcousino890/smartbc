import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(req: Request) {
  try {
    const { feedKey, clientId, clientSecret, sandboxMode } = await req.json();
    const supabase = createAdminClient();

    // `idealista_config` es nueva (migración 0018) y aún no está en los tipos
    // generados de Supabase, así que el builder la tipa como `never`. Casteamos
    // a una forma mínima tipada (patrón del repo) en vez de usar `any`.
    type ConfigTable = {
      select: (c: string) => {
        limit: (n: number) => {
          single: () => Promise<{ data: { id: string } | null }>;
        };
      };
      update: (p: Record<string, unknown>) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
      insert: (
        p: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
    };
    const cfg = () =>
      supabase.from("idealista_config") as unknown as ConfigTable;

    const { data: existing } = await cfg().select("id").limit(1).single();

    if (existing) {
      await cfg()
        .update({
          feed_key: feedKey,
          client_id: clientId,
          client_secret: clientSecret,
          sandbox_mode: sandboxMode ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await cfg().insert({
        feed_key: feedKey,
        client_id: clientId,
        client_secret: clientSecret,
        sandbox_mode: sandboxMode ?? true,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Save config error:", error);
    return Response.json({ error: "Error al guardar configuración" }, { status: 500 });
  }
}
