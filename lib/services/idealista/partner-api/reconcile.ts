import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getIdealistaApiConfig } from "./config";
import { IdealistaNotConfiguredError } from "./client";
import { createContact, findEveryContact, findEveryProperty, updateContact } from "./endpoints";
import { normalizePhone } from "./mapper";
import type { IdealistaContactInput } from "./types";

// Reconstrucción de relaciones con Idealista.
//
// Es el paso que Idealista pide expresamente antes de pasar a producción: hay
// que recorrer sus anuncios y contactos con los métodos "find all" y dejar
// guardada la correspondencia con lo que tenemos nosotros, sin perder contenido
// por el camino.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ReconcileResult {
  ok: boolean;
  /** Anuncios que hay en Idealista bajo este feedKey. */
  totalRemote: number;
  /** Fichas del CRM que se han emparejado. */
  matched: number;
  /** Anuncios de Idealista sin ficha equivalente en el CRM. */
  orphans: Array<{ propertyId: number; code: string; state: string; address: string }>;
  errors: string[];
}

/**
 * Empareja los anuncios de Idealista con las fichas del CRM.
 *
 * El puente es el `code` (nuestra referencia, que mandamos en el alta). Los que
 * no casan se devuelven como huérfanos para poder revisarlos a mano: no se
 * borra ni se toca nada en Idealista.
 */
export async function reconcileProperties(): Promise<ReconcileResult> {
  const config = await getIdealistaApiConfig();
  if (!config) {
    return { ok: false, totalRemote: 0, matched: 0, orphans: [], errors: [new IdealistaNotConfiguredError().message] };
  }

  const db = createAdminClient() as any;
  const errors: string[] = [];
  const orphans: ReconcileResult["orphans"] = [];
  let matched = 0;

  let remote;
  try {
    remote = await findEveryProperty(undefined, config);
  } catch (err) {
    return {
      ok: false,
      totalRemote: 0,
      matched: 0,
      orphans: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  const { data: listings, error: listingsError } = await db
    .from("idealista_listings")
    .select("id, reference_code, api_property_id, api_clone_property_id");

  if (listingsError) {
    return { ok: false, totalRemote: remote.length, matched: 0, orphans: [], errors: [listingsError.message] };
  }

  interface LocalListing {
    id: string;
    reference_code: string | null;
    api_property_id: number | null;
    api_clone_property_id: number | null;
  }

  const byReference = new Map<string, LocalListing>();
  const byPropertyId = new Map<number, LocalListing>();
  for (const listing of (listings ?? []) as LocalListing[]) {
    if (listing.reference_code) {
      // El `code` de Idealista no distingue mayúsculas de minúsculas.
      byReference.set(listing.reference_code.trim().toLowerCase(), listing);
    }
    if (listing.api_property_id) byPropertyId.set(listing.api_property_id, listing);
    // Los clonados (mismo inmueble en venta y alquiler) comparten `code` con su
    // original: sin esto saldrían como huérfanos en cada pasada, y el clon
    // podría llegar a pisar el `api_property_id` del original.
    if (listing.api_clone_property_id) byPropertyId.set(listing.api_clone_property_id, listing);
  }

  // Una ficha sólo se empareja una vez por pasada: si dos anuncios remotos
  // llevan el mismo `code` (original y clon), el segundo no puede sobreescribir
  // el `api_property_id` que acaba de fijar el primero.
  const claimed = new Set<string>();

  for (const property of remote) {
    const propertyId = property.propertyId;
    if (!propertyId) continue;

    const code = (property.code ?? "").trim();
    const knownById = byPropertyId.get(propertyId);
    const local = knownById ?? byReference.get(code.toLowerCase());

    // Ya conocido (como anuncio o como clon): nada que reasignar.
    if (knownById?.api_clone_property_id === propertyId) {
      matched++;
      continue;
    }

    if (!local || (claimed.has(local.id) && !knownById)) {
      orphans.push({
        propertyId,
        code,
        state: property.state,
        address: [property.address?.streetName, property.address?.streetNumber, property.address?.town]
          .filter(Boolean)
          .join(" "),
      });
      continue;
    }

    // supabase-js no lanza: devuelve `{ error }`. Sin mirarlo, un choque con el
    // índice único de `api_property_id` se contaría como emparejado.
    const { error } = await db
      .from("idealista_listings")
      .update({
        api_property_id: propertyId,
        api_state: property.state,
        api_last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", local.id);

    if (error) {
      errors.push(`No se pudo guardar la relación de ${code || propertyId}: ${error.message}`);
      continue;
    }
    claimed.add(local.id);
    matched++;
  }

  return { ok: errors.length === 0, totalRemote: remote.length, matched, orphans, errors };
}

export interface ContactSyncResult {
  ok: boolean;
  total: number;
  errors: string[];
}

/** Baja el catálogo de contactos de Idealista y lo deja espejado en el CRM. */
export async function syncContacts(): Promise<ContactSyncResult> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, total: 0, errors: [new IdealistaNotConfiguredError().message] };

  let contacts;
  try {
    contacts = await findEveryContact(config);
  } catch (err) {
    return { ok: false, total: 0, errors: [err instanceof Error ? err.message : String(err)] };
  }

  const db = createAdminClient() as any;
  const errors: string[] = [];
  let synced = 0;

  for (const contact of contacts) {
    const record = {
      contact_id: contact.contactId,
      name: contact.name ?? "",
      last_name: contact.lastName ?? null,
      email: contact.email ?? "",
      phone_prefix: contact.primaryPhonePrefix ?? null,
      phone: contact.primaryPhoneNumber ?? null,
      secondary_phone_prefix: contact.secondaryPhonePrefix ?? null,
      secondary_phone: contact.secondaryPhoneNumber ?? null,
      is_agent: contact.agent === true,
      agent_email: contact.agentEmail ?? null,
      active: contact.active !== false,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("idealista_api_contacts").upsert(record, { onConflict: "contact_id" });
    if (error) errors.push(`Contacto ${contact.contactId}: ${error.message}`);
    else synced++;
  }

  // `total` es lo que se ha guardado de verdad, no lo que vino de Idealista.
  return { ok: errors.length === 0, total: synced, errors };
}

export interface ContactUpsertResult {
  ok: boolean;
  contactId?: number;
  /** Idealista devuelve el contacto del agente si el email ya era de uno. */
  isAgent?: boolean;
  errors: string[];
}

/**
 * Crea o actualiza un contacto en Idealista y lo guarda en el espejo local.
 *
 * Si el email coincide con el de un agente ya configurado en Idealista, ellos
 * devuelven el contacto del agente con `agent: true`; ese no se puede modificar
 * (responden 409), así que aquí ni se intenta.
 */
export async function upsertContact(input: {
  contactId?: number;
  name: string;
  lastName?: string;
  email: string;
  phone: string;
  phonePrefix?: string;
  secondaryPhone?: string;
  secondaryPhonePrefix?: string;
}): Promise<ContactUpsertResult> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, errors: [new IdealistaNotConfiguredError().message] };

  const phone = normalizePhone(input.phone);
  if (!phone) {
    return { ok: false, errors: ["El teléfono principal tiene que ser de 5 a 12 dígitos (sin prefijo)."] };
  }
  const secondaryPhone = normalizePhone(input.secondaryPhone);

  const payload: IdealistaContactInput = {
    name: input.name.trim().slice(0, 60),
    email: input.email.trim(),
    primaryPhoneNumber: phone,
    primaryPhonePrefix: input.phonePrefix?.trim() || "34",
  };
  if (input.lastName?.trim()) payload.lastName = input.lastName.trim().slice(0, 60);
  if (secondaryPhone) {
    payload.secondaryPhoneNumber = secondaryPhone;
    payload.secondaryPhonePrefix = input.secondaryPhonePrefix?.trim() || "34";
  }

  const db = createAdminClient() as any;

  try {
    if (input.contactId) {
      const { data: existing } = await db
        .from("idealista_api_contacts")
        .select("is_agent")
        .eq("contact_id", input.contactId)
        .maybeSingle();

      if (existing?.is_agent) {
        return {
          ok: false,
          contactId: input.contactId,
          isAgent: true,
          errors: [
            "Ese contacto pertenece a un agente configurado en Idealista y no se puede modificar por API. Cámbialo desde el área privada de Idealista o usa otro contacto.",
          ],
        };
      }

      await updateContact(input.contactId, payload, config);
      await db.from("idealista_api_contacts").upsert(
        {
          contact_id: input.contactId,
          name: payload.name,
          last_name: payload.lastName ?? null,
          email: payload.email,
          phone_prefix: payload.primaryPhonePrefix ?? null,
          phone: payload.primaryPhoneNumber,
          secondary_phone_prefix: payload.secondaryPhonePrefix ?? null,
          secondary_phone: payload.secondaryPhoneNumber ?? null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "contact_id" }
      );
      return { ok: true, contactId: input.contactId, errors: [] };
    }

    const created = await createContact(payload, config);
    await db.from("idealista_api_contacts").upsert(
      {
        contact_id: created.contactId,
        name: payload.name,
        last_name: payload.lastName ?? null,
        email: payload.email,
        phone_prefix: payload.primaryPhonePrefix ?? null,
        phone: payload.primaryPhoneNumber,
        secondary_phone_prefix: payload.secondaryPhonePrefix ?? null,
        secondary_phone: payload.secondaryPhoneNumber ?? null,
        is_agent: created.agent,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" }
    );

    return { ok: true, contactId: created.contactId, isAgent: created.agent, errors: [] };
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

/** Contactos guardados en el espejo local, para el desplegable del formulario. */
export async function listLocalContacts(): Promise<
  Array<{ contactId: number; name: string; email: string; isAgent: boolean; active: boolean }>
> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("idealista_api_contacts")
    .select("contact_id, name, last_name, email, is_agent, active")
    .order("name", { ascending: true });

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    contactId: Number(row.contact_id),
    name: [row.name, row.last_name].filter(Boolean).join(" ").trim(),
    email: String(row.email ?? ""),
    isAgent: row.is_agent === true,
    active: row.active !== false,
  }));
}
