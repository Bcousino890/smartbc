import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { invalidateProxyCache } from "@/lib/sync/proxy-config";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const { data } = await db.from("app_settings").select("key, value");
  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }
  return Response.json(settings);
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const db = createAdminClient() as any;

  for (const [key, value] of Object.entries(body)) {
    // Si se guarda scraping.proxyConfigs, extraer el config activo y ponerlo en scraping.proxyUrl
    if (key === "scraping.proxyConfigs" && typeof value === "string") {
      try {
        const configs = JSON.parse(value);
        const activeConfig = configs.find((c: any) => c.enabled);
        if (activeConfig && activeConfig.url) {
          await db
            .from("app_settings")
            .upsert({ key: "scraping.proxyUrl", value: activeConfig.url }, { onConflict: "key" });
        }
      } catch (e) {
        console.error("Failed to parse proxyConfigs:", e);
      }
    }

    await db
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
  }

  if ("scraping.proxyUrl" in body || "scraping.proxyConfigs" in body) {
    invalidateProxyCache();
  }

  return Response.json({ ok: true });
}
