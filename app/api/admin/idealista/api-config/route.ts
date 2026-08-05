import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getIdealistaApiConfig, saveIdealistaApiConfig } from "@/lib/services/idealista/partner-api/config";

function maskSecret(value: string | null): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const config = await getIdealistaApiConfig();
  if (!config) {
    return Response.json({
      configured: false,
      feedKey: "",
      clientId: "",
      clientSecretMasked: "",
      sandbox: true,
      apiEnabled: false,
      defaultContactName: "",
      defaultContactEmail: "",
      defaultContactPhone: "",
      hasDefaultContact: false,
    });
  }

  return Response.json({
    configured: !!(config.feedKey && config.clientId && config.clientSecret),
    feedKey: config.feedKey ?? "",
    clientId: config.clientId ?? "",
    clientSecretMasked: maskSecret(config.clientSecret),
    sandbox: config.sandbox,
    apiEnabled: config.apiEnabled,
    defaultContactName: config.defaultContactName ?? "",
    defaultContactEmail: config.defaultContactEmail ?? "",
    defaultContactPhone: config.defaultContactPhone ?? "",
    hasDefaultContact: !!config.defaultContactId,
  });
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { feedKey, clientId, clientSecret, sandbox, apiEnabled, defaultContactName, defaultContactEmail, defaultContactPhone } = body;

    if (!feedKey || !clientId) {
      return Response.json({ error: "feedKey y clientId son requeridos" }, { status: 400 });
    }

    // Si el secreto viene vacío o enmascarado (el usuario no lo tocó en el
    // formulario), conservamos el que ya había guardado en vez de borrarlo.
    let resolvedSecret: string | undefined = clientSecret;
    if (!resolvedSecret || resolvedSecret.startsWith("••••")) {
      const existing = await getIdealistaApiConfig();
      resolvedSecret = existing?.clientSecret ?? undefined;
    }
    if (!resolvedSecret) {
      return Response.json({ error: "clientSecret es requerido" }, { status: 400 });
    }

    await saveIdealistaApiConfig({
      feedKey,
      clientId,
      clientSecret: resolvedSecret,
      sandbox: !!sandbox,
      apiEnabled: !!apiEnabled,
      defaultContactName,
      defaultContactEmail,
      defaultContactPhone,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api-config] error:", err);
    return Response.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}
