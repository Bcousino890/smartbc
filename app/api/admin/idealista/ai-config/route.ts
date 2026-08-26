import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { AI_SETTINGS_KEY, type StoredAIConfig } from "@/lib/services/ai/chat";

// Lee/guarda la configuración de IA (proveedor + clave + modelos + zonas) en
// app_settings. La clave (apiKey) NUNCA se devuelve al cliente; solo se informa
// si está puesta. Las zonas son barrios que la IA usa para el título/descripción.

// Zonas por defecto (barrios de Madrid). El usuario las edita en Configuración.
const DEFAULT_ZONES = [
  "Barrio de Salamanca",
  "Chamberí",
  "Retiro",
  "Centro",
  "Chamartín",
  "Tetuán",
  "Arganzuela",
  "Moncloa-Aravaca",
  "Chueca",
  "Malasaña",
  "La Latina",
  "Justicia",
];

function normalizeZones(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const z of input) {
    if (typeof z !== "string") continue;
    const t = z.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= 100) break;
  }
  return out;
}

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

  const cfg = (data?.value ?? {}) as StoredAIConfig & { zones?: string[] };
  const zones = normalizeZones(cfg.zones);
  return Response.json({
    provider: cfg.provider ?? "openrouter",
    model: cfg.model ?? "",
    visionModel: cfg.visionModel ?? "",
    hasKey: !!cfg.apiKey, // no exponemos la clave
    zones: zones.length ? zones : DEFAULT_ZONES,
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as
    | { provider?: string; apiKey?: string; model?: string; visionModel?: string; zones?: unknown }
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
  const prev = (existing?.value ?? {}) as StoredAIConfig & { zones?: string[] };

  // Si no se envía apiKey nueva (campo vacío), se conserva la anterior.
  const newKey = (body.apiKey ?? "").trim();
  // Zonas: si no se envían (undefined), se conservan; si se envía un array, se usa.
  const zones =
    body.zones === undefined ? normalizeZones(prev.zones) : normalizeZones(body.zones);
  const merged: StoredAIConfig & { zones: string[] } = {
    provider,
    apiKey: newKey || prev.apiKey || "",
    model: (body.model ?? "").trim(),
    visionModel: (body.visionModel ?? "").trim(),
    zones,
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
