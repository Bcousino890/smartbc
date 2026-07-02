import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { AI_SETTINGS_KEY, type StoredAIConfig } from "@/lib/services/ai/chat";

// Lee/guarda la configuración de IA (proveedor + clave + modelos) en app_settings.
// La clave (apiKey) NUNCA se devuelve al cliente; solo se informa si está puesta.

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Unauthorized", status: 401 as const };
  if (!["owner", "admin"].includes(profile.role)) {
    return { error: "Forbidden", status: 403 as const };
  }
  return { profile };
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const db = createAdminClient() as any;
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", AI_SETTINGS_KEY)
    .maybeSingle();

  const cfg = (data?.value ?? {}) as StoredAIConfig;
  return Response.json({
    provider: cfg.provider ?? "openrouter",
    model: cfg.model ?? "",
    visionModel: cfg.visionModel ?? "",
    hasKey: !!cfg.apiKey, // no exponemos la clave
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as
    | { provider?: string; apiKey?: string; model?: string; visionModel?: string }
    | null;
  if (!body) return Response.json({ error: "Cuerpo inválido" }, { status: 400 });

  const provider = (body.provider ?? "").trim().toLowerCase();
  const allowed = ["anthropic", "openrouter", "nvidia", "ollama", "openai"];
  if (!allowed.includes(provider)) {
    return Response.json({ error: "Proveedor no válido" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: existing } = await db
    .from("app_settings")
    .select("value")
    .eq("key", AI_SETTINGS_KEY)
    .maybeSingle();
  const prev = (existing?.value ?? {}) as StoredAIConfig;

  // Si no se envía apiKey nueva (campo vacío), se conserva la anterior.
  const newKey = (body.apiKey ?? "").trim();
  const merged: StoredAIConfig = {
    provider,
    apiKey: newKey || prev.apiKey || "",
    model: (body.model ?? "").trim(),
    visionModel: (body.visionModel ?? "").trim(),
  };

  const { error } = await db
    .from("app_settings")
    .upsert(
      { key: AI_SETTINGS_KEY, value: merged, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, hasKey: !!merged.apiKey });
}
