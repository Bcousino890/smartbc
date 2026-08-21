import "server-only";
import { createAdminClient } from "../admin";
import { randomToken } from "@/lib/tokens";

/**
 * Enlaces temporales de UN particular para compartir fuera del equipo
 * (WhatsApp a un cliente o a un colega externo). Tabla y ruta pública
 * 100% independientes de property_shares/SmartLinks/Viewing Collections —
 * ver migración 0149.
 *
 * `particulares` no está en database.types.ts (el archivo se quedó
 * congelado en migraciones tempranas — ver el resto del módulo de
 * particulares, que ya castea todo con `as any`), así que este archivo
 * hace lo mismo por consistencia.
 */

// Crea un enlace temporal. ttlDays=7 por defecto — no hay UI todavía para
// elegir otro valor.
export async function createParticularShareLink(params: {
  particularId: string;
  createdBy: string | null;
  ttlDays?: number;
}): Promise<{ token: string; expiresAt: string }> {
  const { particularId, createdBy, ttlDays = 7 } = params;
  const supabase = createAdminClient();

  const token = randomToken();
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("particulares_share_links")
    .insert({
      particular_id: particularId,
      token,
      created_by: createdBy,
      expires_at: expiresAt,
    });
  if (error) throw new Error(error.message);

  return { token, expiresAt };
}

// Columnas públicas del particular — LÍMITE DE PRIVACIDAD, no una lista de
// conveniencia. El destinatario de /a/{token} es SIEMPRE alguien de fuera
// del equipo: nunca añadir aquí phone, owner_name, address, latitude,
// longitude, source_url, external_id, particular_reference, assigned_to,
// assigned_name ni nada de particulares_contacts.
const PUBLIC_PARTICULAR_COLUMNS =
  "operation, price, zone, bedrooms, bathrooms, square_meters, description, features, photos, cover_url, portal";

// Resolver un token a los datos públicos de su particular. Pública (sin
// auth) — se usa en /a/[token]. Devuelve null si el token no existe o si
// el enlace ya caducó (mismo criterio que getPropertyByShareToken en
// lib/db/queries/shares.ts).
export async function getParticularByShareToken(
  token: string,
): Promise<{ shareId: string; particular: Record<string, unknown> } | null> {
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shareRes = await (supabase as any)
    .from("particulares_share_links")
    .select("id, particular_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (shareRes.error) throw new Error(shareRes.error.message);
  const share = shareRes.data as {
    id: string;
    particular_id: string;
    expires_at: string | null;
  } | null;
  if (!share) return null;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partRes = await (supabase as any)
    .from("particulares")
    .select(PUBLIC_PARTICULAR_COLUMNS)
    .eq("id", share.particular_id)
    .maybeSingle();
  if (partRes.error) throw new Error(partRes.error.message);
  if (!partRes.data) return null;

  return {
    shareId: share.id,
    particular: partRes.data as Record<string, unknown>,
  };
}

// Registrar una apertura: contador simple (no hay tabla de eventos, a
// diferencia de property_share_opens — ver migración 0149). Fire-and-forget
// desde /a/[token]: no bloqueamos el render si falla.
export async function recordParticularShareOpen(shareId: string): Promise<void> {
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: selErr } = await (supabase as any)
    .from("particulares_share_links")
    .select("opened_count")
    .eq("id", shareId)
    .maybeSingle();
  if (selErr || !data) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("particulares_share_links")
    .update({
      opened_count: (data.opened_count ?? 0) + 1,
      last_opened_at: new Date().toISOString(),
    })
    .eq("id", shareId);
}
