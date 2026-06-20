import "server-only";
import { createAdminClient } from "@/lib/db/admin";

const ML_APP_ID = process.env.ML_APP_ID ?? "3130270647591976";
const ML_AUTH_URL = "https://auth.mercadolibre.cl/authorization";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export type MercadoLibreTokens = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user_id: number;
  scope: string;
};

export async function getMlAppId(): Promise<string> {
  return process.env.ML_APP_ID ?? ML_APP_ID;
}

export async function getMlClientSecret(): Promise<string | undefined> {
  const secret = process.env.ML_SECRET_KEY;
  if (secret) return secret;

  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "ml.chile.client_secret")
      .maybeSingle();

    let val = data?.value as string | null | undefined;
    if (val) val = val.replace(/^["']+|["']+$/g, "").trim();
    return val || undefined;
  } catch {
    return undefined;
  }
}

export async function getMlTokens(): Promise<MercadoLibreTokens | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "ml.chile.access_token",
        "ml.chile.refresh_token",
        "ml.chile.user_id",
        "ml.chile.token_expires_at",
      ]);

    if (!data || data.length === 0) return null;

    const map: Record<string, string> = {};
    for (const row of data) {
      const val = row.value;
      map[row.key] = typeof val === "string" ? val.replace(/^["']+|["']+$/g, "").trim() : val;
    }

    if (!map["ml.chile.access_token"] || !map["ml.chile.refresh_token"]) return null;

    return {
      access_token: map["ml.chile.access_token"],
      refresh_token: map["ml.chile.refresh_token"],
      user_id: Number(map["ml.chile.user_id"]) || 0,
      token_type: "Bearer",
      expires_in: 21600,
      scope: "",
    };
  } catch {
    return null;
  }
}

export async function saveMlTokens(tokens: MercadoLibreTokens): Promise<void> {
  const db = createAdminClient() as any;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const rows = [
    { key: "ml.chile.access_token", value: tokens.access_token },
    { key: "ml.chile.refresh_token", value: tokens.refresh_token },
    { key: "ml.chile.user_id", value: String(tokens.user_id) },
    { key: "ml.chile.token_expires_at", value: expiresAt },
  ];

  for (const row of rows) {
    await db
      .from("app_settings")
      .upsert({ key: row.key, value: row.value, updated_at: new Date().toISOString() })
      .eq("key", row.key);
  }

  console.log(`[ml-config] Tokens saved. user_id=${tokens.user_id}, expires=${expiresAt}`);
}

export async function refreshMlAccessToken(): Promise<MercadoLibreTokens | null> {
  const [clientSecret, tokens] = await Promise.all([getMlClientSecret(), getMlTokens()]);
  const appId = await getMlAppId();

  if (!clientSecret || !tokens?.refresh_token) {
    console.error("[ml-config] Cannot refresh: missing client_secret or refresh_token");
    return null;
  }

  try {
    const res = await fetch(ML_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[ml-config] Token refresh failed ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const newTokens = (await res.json()) as MercadoLibreTokens;
    await saveMlTokens(newTokens);
    return newTokens;
  } catch (err) {
    console.error(`[ml-config] Refresh error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const db = createAdminClient() as any;

  const { data: expiresData } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "ml.chile.token_expires_at")
    .maybeSingle();

  const expiresAt = expiresData?.value
    ? new Date(String(expiresData.value).replace(/^["']+|["']+$/g, "").trim())
    : null;

  // Refresh 5 minutes before expiry
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

  if (needsRefresh) {
    const refreshed = await refreshMlAccessToken();
    return refreshed?.access_token ?? null;
  }

  const tokens = await getMlTokens();
  return tokens?.access_token ?? null;
}

export function buildOAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ML_APP_ID,
    redirect_uri: redirectUri,
  });
  return `${ML_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<MercadoLibreTokens | null> {
  const [clientSecret, appId] = await Promise.all([getMlClientSecret(), getMlAppId()]);

  if (!clientSecret) {
    console.error("[ml-config] client_secret not configured");
    return null;
  }

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ml-config] Token exchange failed ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const tokens = (await res.json()) as MercadoLibreTokens;
  await saveMlTokens(tokens);
  return tokens;
}
