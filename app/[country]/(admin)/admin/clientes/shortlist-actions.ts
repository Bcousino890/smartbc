"use server";

// ============================================================================
// Private Client Shortlist · acciones del AGENTE.
//
// La otra cara de app/s/[token]/actions.ts. Allí escribe el cliente sin
// sesión y todo se resuelve desde el token; aquí escribe el agente y todo
// pasa por los permisos del CRM.
//
// Se reutiliza el recurso `viewing_collections`: el shortlist es la fase
// anterior del MISMO journey privado, lo gestiona la misma gente y separarlo
// habría obligado a un recurso nuevo y a rellenar la matriz de todos los roles
// para no dejar a nadie fuera sin querer.
// ============================================================================

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { checkPermission } from "@/lib/auth/guard";
import { isCollectionLanguage } from "@/lib/viewing-collections/i18n";
import { createItinerary } from "./viewing-collections-actions";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };
type ActionResult<T = object> = Ok<T> | Fail;

const DEFAULT_EXPIRY_DAYS = 60;

/** Mismo alfabeto y longitud que el enlace de la colección (ver 0132): corto,
 *  legible en voz alta y con 79 bits de entropía. */
function shortlistToken(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function gate(action: "view" | "create" | "edit" | "delete") {
  const res = await checkPermission("viewing_collections", action);
  if (!res.ok) return { ok: false as const, error: res.error };
  return { ok: true as const, userId: res.profile.id };
}

function revalidateClient(clientId: string) {
  revalidatePath(`/es/admin/clientes/${clientId}`);
  revalidatePath(`/cl/admin/clientes/${clientId}`);
}

/**
 * Crea la selección privada con una INSTANTÁNEA de las propiedades elegidas.
 *
 * Se copian los property_id a los items a propósito: si BCP retoca su
 * selección mañana, lo que el cliente está ordenando no puede cambiarle
 * debajo. Esa es toda la diferencia entre una lista de trabajo y un enlace
 * que se mueve solo.
 */
export async function createClientShortlist(
  clientId: string,
  input: { propertyIds: string[]; language?: string; title?: string },
): Promise<ActionResult<{ shortlistId: string; token: string }>> {
  const g = await gate("create");
  if (!g.ok) return g;

  const propertyIds = [...new Set(input.propertyIds ?? [])];
  if (propertyIds.length === 0) {
    return { ok: false, error: "Elige al menos una propiedad." };
  }

  const { data: client } = await db()
    .from("profiles")
    .select("country")
    .eq("id", clientId)
    .maybeSingle();
  const country = client?.country === "cl" ? "cl" : "es";

  const expires = new Date();
  expires.setDate(expires.getDate() + DEFAULT_EXPIRY_DAYS);

  const { data: shortlist, error } = await db()
    .from("client_shortlists")
    .insert({
      client_id: clientId,
      title: input.title?.trim() || null,
      language: isCollectionLanguage(input.language) ? input.language : "es",
      country,
      token: shortlistToken(),
      expires_at: expires.toISOString(),
      created_by: g.userId,
    })
    .select("id, token")
    .single();

  if (error) return { ok: false, error: error.message };

  const rows = propertyIds.map((propertyId, i) => ({
    shortlist_id: shortlist.id,
    property_id: propertyId,
    origin: "bcp_curated",
    position: i + 1,
  }));
  const { error: itemsError } = await db()
    .from("client_shortlist_items")
    .insert(rows);

  if (itemsError) {
    // Sin propiedades no sirve de nada: se deshace en vez de dejar un enlace
    // que abriría vacío.
    await db().from("client_shortlists").delete().eq("id", shortlist.id);
    return { ok: false, error: itemsError.message };
  }

  revalidateClient(clientId);
  return { ok: true, shortlistId: shortlist.id, token: shortlist.token };
}

/** Renueva la caducidad. El enlace que el cliente ya tiene sigue valiendo. */
export async function renewClientShortlist(
  shortlistId: string,
  days = DEFAULT_EXPIRY_DAYS,
): Promise<ActionResult<object>> {
  const g = await gate("edit");
  if (!g.ok) return g;

  const expires = new Date();
  expires.setDate(expires.getDate() + Math.max(1, Math.min(days, 365)));

  const { data, error } = await db()
    .from("client_shortlists")
    .update({ expires_at: expires.toISOString(), revoked_at: null })
    .eq("id", shortlistId)
    .select("client_id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateClient(data.client_id);
  return { ok: true };
}

/** Corta el acceso. No borra nada: la respuesta del cliente se conserva. */
export async function revokeClientShortlist(
  shortlistId: string,
): Promise<ActionResult<object>> {
  const g = await gate("edit");
  if (!g.ok) return g;

  const { data, error } = await db()
    .from("client_shortlists")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shortlistId)
    .select("client_id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateClient(data.client_id);
  return { ok: true };
}

/** Archiva: sale del primer plano de la ficha, se conserva el histórico. */
export async function archiveClientShortlist(
  shortlistId: string,
): Promise<ActionResult<object>> {
  const g = await gate("edit");
  if (!g.ok) return g;

  const { data, error } = await db()
    .from("client_shortlists")
    .update({ status: "archived" })
    .eq("id", shortlistId)
    .select("client_id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateClient(data.client_id);
  return { ok: true };
}

/**
 * Convierte las prioridades del cliente en un itinerario BORRADOR.
 *
 * · Entran las `must_visit`, en el orden que puso el cliente.
 * · Las `maybe` solo si el agente lo pide explícitamente.
 * · Las descartadas nunca.
 * · Sin fecha, sin horas y sin confirmaciones: el ranking del cliente es un
 *   PUNTO DE PARTIDA, no una agenda. Eso lo decide el agente después.
 *
 * Las que añadió el cliente no tienen fila en client_property_selections —una
 * parada la exige— así que se crean aquí con `source: 'client_shortlist'`, que
 * es lo que impide que acaben pareciendo una recomendación de BCP.
 */
export async function createItineraryFromShortlist(
  shortlistId: string,
  options: { includeMaybe?: boolean; title?: string } = {},
): Promise<ActionResult<{ itineraryId: string }>> {
  const g = await gate("create");
  if (!g.ok) return g;

  const { data: shortlist } = await db()
    .from("client_shortlists")
    .select(
      `id, client_id, language, country,
       client_shortlist_items ( property_id, decision, rank, position, origin )`,
    )
    .eq("id", shortlistId)
    .maybeSingle();

  if (!shortlist) return { ok: false, error: "Selección no encontrada." };

  const wanted = (shortlist.client_shortlist_items ?? [])
    .filter(
      (i: any) =>
        i.decision === "must_visit" ||
        (options.includeMaybe && i.decision === "maybe"),
    )
    .sort((a: any, b: any) => {
      // Prioritarias primero y por el rank del cliente; las "quizá" detrás.
      const rank = (x: any) =>
        x.decision === "must_visit" ? (x.rank ?? 1e6) : 1e7 + x.position;
      return rank(a) - rank(b);
    });

  if (wanted.length === 0) {
    return { ok: false, error: "El cliente no ha marcado ninguna para visitar." };
  }

  // Las propiedades archivadas no pueden ser una parada (lo impide la propia
  // publicación). Se descartan aquí con un aviso claro en vez de fallar luego.
  const propertyIds = wanted.map((i: any) => i.property_id);
  const { data: props } = await db()
    .from("properties")
    .select("id, archived_at, status")
    .in("id", propertyIds);
  const usable = new Set(
    (props ?? [])
      .filter((p: any) => !p.archived_at && p.status !== "archived")
      .map((p: any) => p.id),
  );
  const ordered = wanted.filter((i: any) => usable.has(i.property_id));
  if (ordered.length === 0) {
    return {
      ok: false,
      error: "Ninguna de las elegidas sigue disponible.",
    };
  }

  // Reconciliación con la selección de BCP: cada parada necesita su fila.
  const { data: existing } = await db()
    .from("client_property_selections")
    .select("id, property_id")
    .eq("client_id", shortlist.client_id)
    .in("property_id", ordered.map((i: any) => i.property_id));

  const selectionByProperty = new Map<string, string>(
    (existing ?? []).map((s: any) => [s.property_id, s.id]),
  );

  const missing = ordered.filter(
    (i: any) => !selectionByProperty.has(i.property_id),
  );
  if (missing.length > 0) {
    const { data: created, error: selError } = await db()
      .from("client_property_selections")
      .insert(
        missing.map((i: any) => ({
          client_id: shortlist.client_id,
          property_id: i.property_id,
          // El origen NO se disfraza: se sabrá siempre que salió de aquí.
          source: "client_shortlist",
          country: shortlist.country,
          added_by: g.userId,
        })),
      )
      .select("id, property_id");

    if (selError) return { ok: false, error: selError.message };
    for (const s of created ?? []) {
      selectionByProperty.set(s.property_id, s.id);
    }
  }

  const selectionIds = ordered
    .map((i: any) => selectionByProperty.get(i.property_id))
    .filter(Boolean) as string[];

  // Se reutiliza la creación de itinerarios de siempre: mismas invariantes,
  // mismos permisos, misma protección cruzada entre clientes.
  const res = await createItinerary(shortlist.client_id, {
    title: options.title,
    language: shortlist.language,
    selectionIds,
  });
  if (!res.ok) return res;

  revalidateClient(shortlist.client_id);
  return { ok: true, itineraryId: res.itineraryId };
}
