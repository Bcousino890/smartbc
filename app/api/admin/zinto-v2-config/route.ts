import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { encryptSecret } from "@/lib/crypto/secret";

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return null;
  }
  return profile;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const supabase = createAdminClient() as any;
    const { data } = await supabase.from("zinto_config").select("*").limit(1).single();

    if (!data) {
      return Response.json({ config: null });
    }

    // Nunca devolver secretos descifrados al navegador — solo si están seteados.
    return Response.json({
      config: {
        baseUrl: data.base_url_v2,
        integrationId: data.integration_id,
        enabled: Boolean(data.enabled_v2),
        hasApiKey: Boolean(data.api_key_v2_encrypted),
        hasWebhookSecret: Boolean(data.webhook_secret_v2_encrypted),
      },
    });
  } catch (error) {
    console.error("Error fetching Zinto v2 config:", error);
    return Response.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { apiKey, baseUrl, integrationId, webhookSecret, enabled } = body;

    const supabase = createAdminClient() as any;
    const { data: existing } = await supabase
      .from("zinto_config")
      .select("*")
      .limit(1)
      .single();

    // Los secretos solo se (re)escriben si llega un valor nuevo — dejar el
    // campo vacío conserva el que ya estaba guardado. Igual patrón que
    // /api/admin/zinto-config (v1).
    const row: Record<string, unknown> = {
      base_url_v2: baseUrl || "https://crm.zinto.app/api/v2",
      integration_id: integrationId ? parseInt(String(integrationId), 10) : null,
      enabled_v2: Boolean(enabled),
    };

    if (apiKey) {
      const enc = encryptSecret(apiKey);
      row.api_key_v2_encrypted = enc.encrypted;
      row.api_key_v2_iv = enc.iv;
    } else if (!existing?.api_key_v2_encrypted && enabled) {
      return Response.json(
        { error: "La API key de v2 es obligatoria para activarlo" },
        { status: 400 },
      );
    }

    if (webhookSecret) {
      const enc = encryptSecret(webhookSecret);
      row.webhook_secret_v2_encrypted = enc.encrypted;
      row.webhook_secret_v2_iv = enc.iv;
    }

    if (existing) {
      const { error } = await supabase.from("zinto_config").update(row).eq("id", existing.id);
      if (error) {
        console.error("Error updating Zinto v2 config:", error);
        return Response.json({ error: "Failed to update config" }, { status: 500 });
      }
    } else {
      // No debería pasar en la práctica: la fila singleton de zinto_config ya
      // existe desde que se configuró v1 (ver docs/ZINTO_SETUP.md). Sin ella
      // no hay dónde guardar las columnas v2.
      return Response.json(
        { error: "Configura primero WhatsApp (Zinto) v1 en este panel" },
        { status: 400 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error handling Zinto v2 config:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
