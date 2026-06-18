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

  for (let [key, value] of Object.entries(body)) {
    // If the app_key field contains a full Smartproxy URL, extract just the key
    if (key === "scraping.smartproxy.app_key" && typeof value === "string" && value.includes("app_key=")) {
      try {
        const u = new URL(value);
        const extracted = u.searchParams.get("app_key");
        if (extracted) value = extracted;
      } catch {
        // Not a URL, use as-is
      }
    }
    await db
      .from("app_settings")
      .upsert({ key, value }, { onConflict: "key" });
  }

  if ("scraping.proxyUrl" in body) {
    invalidateProxyCache();
  }

  return Response.json({ ok: true });
}
