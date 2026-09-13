import "server-only";
import { createAdminClient } from "../admin";
import { randomToken } from "@/lib/tokens";
import {
  sanitizeParticularDescriptionForSharing,
  translateParticularFeaturesForSharing,
} from "@/lib/services/particulares/sanitize-description";

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

  // Limpiamos (y traducimos a español) la descripción y las características
  // UNA VEZ, al crear el enlace (no en cada visita): quita teléfono/email/
  // "particular, sin agencias" y traduce el texto si no está ya en español,
  // antes de que sea visible fuera del equipo — ver
  // lib/services/particulares/sanitize-description.ts y migraciones 0157/0163.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partRes = await (supabase as any)
    .from("particulares")
    .select("description, features")
    .eq("id", particularId)
    .maybeSingle();
  const rawParticular = partRes.data as
    | { description: string | null; features: string[] | null }
    | null;
  const sanitizedDescription = rawParticular?.description
    ? await sanitizeParticularDescriptionForSharing(rawParticular.description)
    : null;
  const sanitizedFeatures =
    rawParticular?.features && rawParticular.features.length > 0
      ? await translateParticularFeaturesForSharing(rawParticular.features)
      : null;

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
      sanitized_description: sanitizedDescription,
      sanitized_features: sanitizedFeatures,
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
//
// `sanitizeIfMissing`: para enlaces SIN descripción limpia guardada (los
// creados antes de la migración 0157), la limpia al vuelo y la persiste,
// de modo que el texto crudo del portal ("particular", "sin agencias",
// teléfono…) no llegue a nadie ni siquiera en esos enlaces antiguos. Solo
// lo pide el render de la página; generateMetadata no lo necesita (no usa
// la descripción) y así no se paga la IA dos veces por visita.
export async function getParticularByShareToken(
  token: string,
  opts: { sanitizeIfMissing?: boolean } = {},
): Promise<{ shareId: string; particular: Record<string, unknown> } | null> {
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shareRes = await (supabase as any)
    .from("particulares_share_links")
    .select("id, particular_id, expires_at, sanitized_description, sanitized_features")
    .eq("token", token)
    .maybeSingle();
  if (shareRes.error) throw new Error(shareRes.error.message);
  const share = shareRes.data as {
    id: string;
    particular_id: string;
    expires_at: string | null;
    sanitized_description: string | null;
    sanitized_features: string[] | null;
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

  const particular = partRes.data as Record<string, unknown>;

  if (share.sanitized_description) {
    // Camino normal: la descripción ya se limpió al crear el enlace.
    particular.description = share.sanitized_description;
  } else if (opts.sanitizeIfMissing) {
    // Enlace anterior a la migración 0157 (o creado cuando la columna aún
    // no existía): se limpia AHORA y se guarda, así la próxima visita ya
    // no paga la IA. Nunca se sirve el texto crudo del portal: el
    // destinatario está fuera del equipo y ese texto suele traer teléfono
    // y "particular / sin agencias".
    const raw = typeof particular.description === "string" ? particular.description : null;
    if (raw && raw.trim()) {
      // No lanza nunca: si la IA falla o no está configurada, cae al
      // limpiado por regex (ver sanitize-description.ts).
      const cleaned = await sanitizeParticularDescriptionForSharing(raw);
      particular.description = cleaned;
      // Persistir es best-effort: si falla, la página se sirve igual de
      // limpia y simplemente se reintentará en la siguiente visita.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("particulares_share_links")
          .update({ sanitized_description: cleaned })
          .eq("id", share.id);
      } catch (err) {
        console.error("[particulares] No se pudo guardar la descripción limpia:", err);
      }
    }
  }

  if (share.sanitized_features && share.sanitized_features.length > 0) {
    // Camino normal: las características ya se tradujeron al crear el enlace.
    particular.features = share.sanitized_features;
  } else if (opts.sanitizeIfMissing) {
    // Enlace anterior a la migración 0163: se traducen AHORA y se guardan,
    // igual que la descripción arriba (mismo criterio: nunca mostrar al
    // destinatario externo las etiquetas tal cual las devolvió el portal si
    // podemos evitarlo).
    const raw = Array.isArray(particular.features)
      ? (particular.features as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    if (raw.length > 0) {
      const translated = await translateParticularFeaturesForSharing(raw);
      particular.features = translated;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("particulares_share_links")
          .update({ sanitized_features: translated })
          .eq("id", share.id);
      } catch (err) {
        console.error("[particulares] No se pudieron guardar las características traducidas:", err);
      }
    }
  }

  return {
    shareId: share.id,
    particular,
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
