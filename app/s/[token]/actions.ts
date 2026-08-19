"use server";

// ============================================================================
// Private Client Shortlist · MUTACIONES PÚBLICAS
//
// Esta es la única superficie del producto en la que escribe alguien sin
// sesión. Todas las reglas viven aquí, en servidor, y ninguna depende de lo
// que mande el navegador:
//
//   1. El shortlist se resuelve SIEMPRE desde el token. Nunca se acepta un
//      client_id ni un shortlist_id del cliente.
//   2. Cada item se comprueba contra ESE shortlist antes de tocarlo. Con el
//      token de Paul no se puede escribir en la lista de otro.
//   3. Caducado o revocado bloquea también la escritura, no solo la lectura.
//   4. Solo se pueden añadir propiedades disponibles, no archivadas y del
//      país del shortlist.
//   5. Freno por token para que un bucle no llene las tablas.
//
// Todas devuelven la revisión nueva: es lo que permite al navegador saber que
// su copia se quedó atrás sin montar colaboración en tiempo real.
// ============================================================================

import { createAdminClient } from "@/lib/db/admin";
import { resolveShortlistByToken } from "@/lib/db/queries/client-shortlists";
import { allowShortlistWrite } from "@/lib/client-shortlist/rate-limit";
import type { ShortlistDecision } from "@/lib/client-shortlist/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export type ShortlistWriteResult =
  | { ok: true; revision: number }
  | { ok: false; error: string };

const DECISIONS: ShortlistDecision[] = [
  "undecided",
  "must_visit",
  "maybe",
  "not_for_me",
];

/** Puerta común: freno, token válido y enlace vivo. */
async function open(token: string) {
  if (!allowShortlistWrite(token)) {
    return { gate: null, error: "Demasiados cambios seguidos. Prueba en un momento." };
  }
  const shortlist = await resolveShortlistByToken(token);
  if (!shortlist) {
    // Mismo mensaje para caducado, revocado e inexistente.
    return { gate: null, error: "Esta selección ya no está disponible." };
  }
  return { gate: shortlist, error: null as string | null };
}

/** Comprueba que el item es de ESTE shortlist. El corazón del aislamiento. */
async function itemOf(shortlistId: string, itemId: string) {
  if (!itemId || itemId.length > 64) return null;
  const { data } = await db()
    .from("client_shortlist_items")
    .select("id, decision, rank, property_id")
    .eq("id", itemId)
    .eq("shortlist_id", shortlistId)
    .maybeSingle();
  return data ?? null;
}

/** Sube la revisión y marca que el cliente tocó algo. */
async function touch(shortlistId: string, revision: number): Promise<number> {
  const next = revision + 1;
  await db()
    .from("client_shortlists")
    .update({
      revision: next,
      client_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shortlistId);
  return next;
}

/**
 * Renumera las prioritarias 1..N respetando el orden pedido.
 *
 * Se hace entero en cada cambio en vez de parchear ranks sueltos: con 14
 * propiedades el coste es irrelevante y así no existe el estado intermedio
 * "dos con el mismo número" que tendría que limpiar alguien después.
 */
async function renumber(shortlistId: string, orderedIds?: string[]) {
  const { data } = await db()
    .from("client_shortlist_items")
    .select("id, rank, position")
    .eq("shortlist_id", shortlistId)
    .eq("decision", "must_visit");

  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  let ordered: any[];
  if (orderedIds?.length) {
    // El orden que pide el cliente, y detrás lo que no haya nombrado.
    const named = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    const rest = rows
      .filter((r) => !orderedIds.includes(r.id))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.position - b.position);
    ordered = [...named, ...rest];
  } else {
    ordered = rows.sort(
      (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.position - b.position,
    );
  }

  await Promise.all(
    ordered.map((r, i) =>
      r.rank === i + 1
        ? Promise.resolve()
        : db()
            .from("client_shortlist_items")
            .update({ rank: i + 1, updated_at: new Date().toISOString() })
            .eq("id", r.id),
    ),
  );
}

/** Marcar una residencia como prioritaria, alternativa o descartada. */
export async function setShortlistDecision(
  token: string,
  itemId: string,
  decision: ShortlistDecision,
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };
  if (!DECISIONS.includes(decision)) {
    return { ok: false, error: "Decisión no válida." };
  }

  const item = await itemOf(gate.id, itemId);
  if (!item) return { ok: false, error: "Esa residencia no está en tu selección." };

  // El rank solo existe entre las prioritarias: salir de ahí lo borra. Lo
  // exige además un CHECK, así que esto evita el error en vez de provocarlo.
  const patch: Record<string, unknown> = {
    decision,
    rank: null,
    decided_at: decision === "undecided" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: dbError } = await db()
    .from("client_shortlist_items")
    .update(patch)
    .eq("id", itemId)
    .eq("shortlist_id", gate.id);
  if (dbError) return { ok: false, error: "No se pudo guardar." };

  // Entra al final de las prioritarias; salir deja el resto sin huecos.
  await renumber(gate.id);
  return { ok: true, revision: await touch(gate.id, gate.revision) };
}

/**
 * Renumera "Por revisar" 1..N respetando el orden pedido. Hermana de
 * `renumber`, pero escribe `position` en vez de `rank`: el rank tiene un
 * CHECK que solo lo permite en 'must_visit' (csi_rank_only_must_visit), y
 * aquí el cliente todavía no ha decidido nada.
 */
async function renumberUndecided(shortlistId: string, orderedIds: string[]) {
  const { data } = await db()
    .from("client_shortlist_items")
    .select("id, position")
    .eq("shortlist_id", shortlistId)
    .eq("decision", "undecided");

  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  const named = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const rest = rows
    .filter((r) => !orderedIds.includes(r.id))
    .sort((a, b) => a.position - b.position);
  const ordered = [...named, ...rest];

  await Promise.all(
    ordered.map((r, i) =>
      r.position === i + 1
        ? Promise.resolve()
        : db()
            .from("client_shortlist_items")
            .update({ position: i + 1, updated_at: new Date().toISOString() })
            .eq("id", r.id),
    ),
  );
}

/**
 * Reordenar "Por revisar", ANTES de decidir nada. Mismo contrato que
 * `setShortlistOrder`: llega la lista completa en el orden deseado, y solo se
 * aceptan ids que sean de este shortlist y sigan sin decidir — si alguna se
 * decidió a mitad de un arrastre (dos pestañas abiertas), se ignora en vez de
 * reventar.
 */
export async function setShortlistReviewOrder(
  token: string,
  orderedItemIds: string[],
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };
  if (!Array.isArray(orderedItemIds) || orderedItemIds.length > 200) {
    return { ok: false, error: "Orden no válido." };
  }

  const { data } = await db()
    .from("client_shortlist_items")
    .select("id")
    .eq("shortlist_id", gate.id)
    .eq("decision", "undecided");
  const mine = new Set((data ?? []).map((r: any) => r.id));
  const clean = orderedItemIds.filter((id) => mine.has(id));

  await renumberUndecided(gate.id, clean);
  return { ok: true, revision: await touch(gate.id, gate.revision) };
}

/** Reordenar las prioritarias. Llega la lista completa, en el orden deseado. */
export async function setShortlistOrder(
  token: string,
  orderedItemIds: string[],
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };
  if (!Array.isArray(orderedItemIds) || orderedItemIds.length > 200) {
    return { ok: false, error: "Orden no válido." };
  }

  // Solo se aceptan ids que pertenezcan a este shortlist Y sean prioritarias.
  const { data } = await db()
    .from("client_shortlist_items")
    .select("id")
    .eq("shortlist_id", gate.id)
    .eq("decision", "must_visit");
  const mine = new Set((data ?? []).map((r: any) => r.id));
  const clean = orderedItemIds.filter((id) => mine.has(id));

  await renumber(gate.id, clean);
  return { ok: true, revision: await touch(gate.id, gate.revision) };
}

/** Comentario del cliente sobre una residencia. */
export async function setShortlistComment(
  token: string,
  itemId: string,
  comment: string,
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };

  const clean = (comment ?? "").trim().slice(0, 500);
  const item = await itemOf(gate.id, itemId);
  if (!item) return { ok: false, error: "Esa residencia no está en tu selección." };

  const { error: dbError } = await db()
    .from("client_shortlist_items")
    .update({
      client_comment: clean || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("shortlist_id", gate.id);
  if (dbError) return { ok: false, error: "No se pudo guardar el comentario." };

  return { ok: true, revision: await touch(gate.id, gate.revision) };
}

/**
 * Añadir una residencia que el cliente ha encontrado.
 *
 * Queda marcada como `client_added` para siempre: no puede acabar pareciendo
 * una recomendación de BCP. NO se toca client_property_selections aquí — la
 * curación de BCP es suya, y la reconciliación ocurre cuando el agente decide
 * convertir esto en un itinerario.
 */
export async function addShortlistProperty(
  token: string,
  propertyId: string,
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };
  if (!propertyId || propertyId.length > 64) {
    return { ok: false, error: "Residencia no válida." };
  }

  // La propiedad tiene que existir, estar disponible, no archivada y ser del
  // país del shortlist. Se comprueba en servidor: el id llega del navegador.
  const { data: prop } = await db()
    .from("properties")
    .select("id, status, archived_at, country")
    .eq("id", propertyId)
    .maybeSingle();

  if (
    !prop ||
    prop.archived_at ||
    prop.status !== "available" ||
    (prop.country && prop.country !== gate.country)
  ) {
    return { ok: false, error: "Esa residencia no está disponible." };
  }

  const { data: last } = await db()
    .from("client_shortlist_items")
    .select("position")
    .eq("shortlist_id", gate.id)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = ((last ?? [])[0]?.position ?? 0) + 1;

  const { error: dbError } = await db()
    .from("client_shortlist_items")
    .insert({
      shortlist_id: gate.id,
      property_id: propertyId,
      origin: "client_added",
      decision: "undecided",
      position: nextPos,
    });

  if (dbError) {
    // El UNIQUE (shortlist_id, property_id) hace que añadir dos veces sea
    // inofensivo: ya estaba.
    if (String(dbError.message).includes("csi_unique_property")) {
      return { ok: true, revision: gate.revision };
    }
    return { ok: false, error: "No se pudo añadir." };
  }

  return { ok: true, revision: await touch(gate.id, gate.revision) };
}

/** Enviar las prioridades. No cierra el enlace: el cliente puede seguir. */
export async function submitShortlist(
  token: string,
): Promise<ShortlistWriteResult> {
  const { gate, error } = await open(token);
  if (!gate) return { ok: false, error: error! };

  const now = new Date().toISOString();
  const { error: dbError } = await db()
    .from("client_shortlists")
    .update({
      status: "submitted",
      submitted_at: now,
      // Se iguala para que "modificado después de enviar" empiece limpio.
      client_updated_at: now,
      updated_at: now,
      revision: gate.revision + 1,
    })
    .eq("id", gate.id);
  if (dbError) return { ok: false, error: "No se pudo enviar." };

  return { ok: true, revision: gate.revision + 1 };
}

/**
 * Búsqueda para "añadir otra residencia".
 *
 * Consulta PROPIA, no el endpoint del panel: devuelve una proyección mínima y
 * client-safe. Aquí no hay propietarios, ni origen, ni notas, ni comisiones —
 * ni siquiera se piden esas columnas. Respeta país, disponibilidad y
 * archivadas, y también se resuelve desde el token.
 */
export type ShortlistSearchHit = {
  propertyId: string;
  title: string;
  zoneLabel: string;
  priceLabel: string;
  coverPhotoUrl: string | null;
  bcReference: string | null;
  alreadyIn: boolean;
};

export async function searchShortlistProperties(
  token: string,
  query: string,
): Promise<ShortlistSearchHit[]> {
  const shortlist = await resolveShortlistByToken(token);
  if (!shortlist) return [];

  const q = (query ?? "").trim().slice(0, 60);
  if (q.length < 2) return [];

  const { getCountryConfig } = await import("@/lib/country-config");
  const { editorialResidenceTitle, proxyPhotoUrls } = await import(
    "@/lib/viewing-collections/to-public"
  );
  const { shortlistZoneLabel } = await import("@/lib/client-shortlist/to-public");

  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { data } = await db()
    .from("properties")
    .select(
      `id, slug, title, zone, subzone, price, currency, operation, status,
       archived_at, bc_reference, country, last_synced_at, updated_at,
       property_photos ( url, position )`,
    )
    .eq("country", shortlist.country)
    .eq("status", "available")
    .is("archived_at", null)
    .or(`title.ilike.${like},bc_reference.ilike.${like},zone.ilike.${like}`)
    .limit(8);

  const { data: existing } = await db()
    .from("client_shortlist_items")
    .select("property_id")
    .eq("shortlist_id", shortlist.id);
  const already = new Set((existing ?? []).map((r: any) => r.property_id));

  const cfg = getCountryConfig(shortlist.country === "cl" ? "cl" : "es");

  return ((data ?? []) as any[]).map((prop) => {
    const photos = proxyPhotoUrls(prop);
    return {
      propertyId: prop.id,
      title: editorialResidenceTitle(prop.title),
      zoneLabel: shortlistZoneLabel(prop),
      priceLabel: cfg.formatPrice(
        Number(prop.price),
        prop.currency,
        prop.operation,
      ),
      coverPhotoUrl: photos[0] ?? null,
      bcReference: prop.bc_reference ?? null,
      alreadyIn: already.has(prop.id),
    };
  });
}
