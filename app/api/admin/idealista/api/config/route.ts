import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  getIdealistaApiConfigStatus,
  isValidFeedKey,
  saveIdealistaApiConfig,
} from "@/lib/services/idealista/partner-api/config";
import { clearIdealistaTokenCache } from "@/lib/services/idealista/partner-api/client";

// Credenciales del Partner API de Idealista. El client secret nunca sale de
// aquí: el GET sólo dice si hay uno guardado.

async function guard() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!["owner", "admin"].includes(profile.role)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

export async function GET() {
  const { error } = await guard();
  if (error) return error;

  try {
    return Response.json(await getIdealistaApiConfigStatus());
  } catch (err) {
    console.error("[idealista-api/config] GET:", err);
    return Response.json({ error: "No se pudo leer la configuración" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { error } = await guard();
  if (error) return error;

  try {
    const body = (await req.json()) as {
      clientId?: string;
      clientSecret?: string;
      feedKey?: string;
      sandbox?: boolean;
      scope?: "idealista" | "microsite";
      sendCode?: boolean;
    };

    const clientId = (body.clientId ?? "").trim();
    const feedKey = (body.feedKey ?? "").trim();

    if (!clientId) return Response.json({ error: "Falta el client ID." }, { status: 400 });
    if (!feedKey) return Response.json({ error: "Falta el feedKey." }, { status: 400 });
    if (!isValidFeedKey(feedKey)) {
      return Response.json(
        { error: 'El feedKey no tiene el formato de Idealista: "ilc" seguido de 40 letras o números.' },
        { status: 400 }
      );
    }

    const current = await getIdealistaApiConfigStatus();
    if (!body.clientSecret && !current.hasSecret) {
      return Response.json({ error: "Falta el client secret." }, { status: 400 });
    }

    await saveIdealistaApiConfig({
      clientId,
      clientSecret: body.clientSecret?.trim() || undefined,
      feedKey,
      sandbox: body.sandbox !== false,
      scope: body.scope === "microsite" ? "microsite" : "idealista",
      sendCode: body.sendCode !== false,
    });

    // Las credenciales han cambiado: el token cacheado ya no vale.
    clearIdealistaTokenCache();

    return Response.json({ ok: true, config: await getIdealistaApiConfigStatus() });
  } catch (err) {
    console.error("[idealista-api/config] POST:", err);
    // El mensaje real importa: si falla la escritura (por ejemplo, porque falta
    // la migración 0118 en el VPS), hay que verlo en el panel y no un genérico.
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo guardar la configuración" },
      { status: 500 }
    );
  }
}
