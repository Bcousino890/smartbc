import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export interface IdealistaApiConfig {
  id: string;
  feedKey: string | null;
  clientId: string | null;
  clientSecret: string | null;
  sandbox: boolean;
  apiEnabled: boolean;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  defaultContactId: number | null;
  defaultContactName: string | null;
  defaultContactEmail: string | null;
  defaultContactPhone: string | null;
}

function mapRow(row: any): IdealistaApiConfig {
  return {
    id: row.id,
    feedKey: row.feed_key ?? null,
    clientId: row.client_id ?? null,
    clientSecret: row.client_secret ?? null,
    sandbox: row.sandbox_mode ?? true,
    apiEnabled: row.api_enabled ?? false,
    accessToken: row.access_token ?? null,
    tokenExpiresAt: row.token_expires_at ?? null,
    defaultContactId: row.default_contact_id ?? null,
    defaultContactName: row.default_contact_name ?? null,
    defaultContactEmail: row.default_contact_email ?? null,
    defaultContactPhone: row.default_contact_phone ?? null,
  };
}

export async function getIdealistaApiConfig(): Promise<IdealistaApiConfig | null> {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("idealista_config")
    .select(
      "id, feed_key, client_id, client_secret, sandbox_mode, api_enabled, access_token, token_expires_at, default_contact_id, default_contact_name, default_contact_email, default_contact_phone"
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function saveIdealistaApiConfig(input: {
  feedKey: string;
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
  apiEnabled: boolean;
  defaultContactName?: string;
  defaultContactEmail?: string;
  defaultContactPhone?: string;
}): Promise<void> {
  const db = createAdminClient() as any;
  const { data: existing } = await db
    .from("idealista_config")
    .select("id, feed_key, sandbox_mode")
    .limit(1)
    .maybeSingle();

  // El contactId y el token son válidos solo dentro de un mismo entorno
  // (feedKey + sandbox/producción). Si cambia cualquiera de los dos, el
  // contacto o el token cacheado podrían pertenecer a otra cuenta/entorno.
  const environmentChanged =
    !existing || existing.feed_key !== input.feedKey || existing.sandbox_mode !== input.sandbox;

  const record = {
    feed_key: input.feedKey,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    sandbox_mode: input.sandbox,
    api_enabled: input.apiEnabled,
    default_contact_name: input.defaultContactName || null,
    default_contact_email: input.defaultContactEmail || null,
    default_contact_phone: input.defaultContactPhone || null,
    access_token: null,
    token_expires_at: null,
    ...(environmentChanged ? { default_contact_id: null } : {}),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await db.from("idealista_config").update(record).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("idealista_config").insert(record);
    if (error) throw new Error(error.message);
  }
}

export async function cacheAccessToken(token: string, expiresInSeconds: number): Promise<void> {
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("idealista_config").select("id").limit(1).maybeSingle();
  if (!existing) return;

  // Restamos un margen de 60s para no usar un token que expire justo al llegar a Idealista.
  const expiresAt = new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
  await db
    .from("idealista_config")
    .update({ access_token: token, token_expires_at: expiresAt })
    .eq("id", existing.id);
}

export async function saveDefaultContactId(contactId: number): Promise<void> {
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("idealista_config").select("id").limit(1).maybeSingle();
  if (!existing) return;
  await db.from("idealista_config").update({ default_contact_id: contactId }).eq("id", existing.id);
}
