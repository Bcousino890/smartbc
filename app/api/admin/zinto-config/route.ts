import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { encryptSecret } from "@/lib/services/zinto/config";

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

    // Never return decrypted secrets to the browser — only whether they're set.
    return Response.json({
      config: {
        id: data.id,
        baseUrl: data.base_url,
        channelId: data.channel_id,
        hasApiKey: Boolean(data.api_key_encrypted),
        hasWebhookSecret: Boolean(data.webhook_secret_encrypted),
        hasInboundToken: Boolean(data.inbound_token_encrypted),
      },
    });
  } catch (error) {
    console.error("Error fetching Zinto config:", error);
    return Response.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { apiKey, baseUrl, channelId, webhookSecret, inboundToken } = body;

    const supabase = createAdminClient() as any;
    const { data: existing } = await supabase
      .from("zinto_config")
      .select("*")
      .limit(1)
      .single();

    // Build the row. Secrets are only (re)written when a new value is provided,
    // so leaving a field blank keeps the previously stored secret.
    const row: Record<string, unknown> = {
      base_url: baseUrl || "https://crm.zinto.app/api/v1",
      channel_id: channelId ? parseInt(String(channelId), 10) : 4,
    };

    if (apiKey) {
      const enc = encryptSecret(apiKey);
      row.api_key_encrypted = enc.encrypted;
      row.api_key_iv = enc.iv;
    } else if (!existing?.api_key_encrypted) {
      return Response.json({ error: "API key is required" }, { status: 400 });
    }

    if (webhookSecret) {
      const enc = encryptSecret(webhookSecret);
      row.webhook_secret_encrypted = enc.encrypted;
      row.webhook_secret_iv = enc.iv;
    }

    if (inboundToken) {
      const enc = encryptSecret(inboundToken);
      row.inbound_token_encrypted = enc.encrypted;
      row.inbound_token_iv = enc.iv;
    }

    if (existing) {
      const { error } = await supabase.from("zinto_config").update(row).eq("id", existing.id);
      if (error) {
        console.error("Error updating Zinto config:", error);
        return Response.json({ error: "Failed to update config" }, { status: 500 });
      }
    } else {
      const { error } = await supabase.from("zinto_config").insert(row);
      if (error) {
        console.error("Error creating Zinto config:", error);
        return Response.json({ error: "Failed to create config" }, { status: 500 });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error handling Zinto config:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
