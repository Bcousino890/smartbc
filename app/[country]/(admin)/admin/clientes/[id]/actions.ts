"use server";

// ============================================================================
// CLIENT COMMAND CENTER · escritura
//
// Lo que la ficha nunca pudo tocar: la identidad del cliente, su asesor y sus
// preferencias completas. Hasta ahora las preferencias solo se editaban desde
// el panel lateral del LISTADO —con seis campos y sin las columnas chilenas—
// y el asesor no se editaba en ninguna parte.
//
// ⚠️ El correo NO se edita aquí. `profiles.email` es el identificador con el
// que el cliente entra (GoTrue guarda el suyo aparte): cambiar solo esta
// columna dejaría a la persona con un correo en pantalla y otro para entrar.
// Mientras no haya un cambio de correo de verdad —los dos lados a la vez— es
// preferible que el campo esté bloqueado a que mienta.
// ============================================================================

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { isCountry } from "@/lib/country-config";
import {
  buildPreferencesPayload,
  validateBrief,
  type BriefInput,
  type BriefProfile,
} from "@/lib/clients/brief";
import { setClientProfileTag } from "@/lib/clients/profile-tag";

export type ActionResult = { ok: true } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

function refresh(clientId: string) {
  for (const c of ["es", "cl"]) {
    revalidatePath(`/${c}/admin/clientes/${clientId}`);
    revalidatePath(`/${c}/admin/clientes`);
  }
}

// ─── Identidad ───────────────────────────────────────────────────────────────

export type UpdateClientIdentityInput = {
  clientId: string;
  fullName: string;
  phone: string | null;
  country: string;
};

export async function updateClientIdentity(
  input: UpdateClientIdentityInput,
): Promise<ActionResult> {
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    return { ok: false, error: "El nombre no puede quedar vacío." };
  }
  if (!isCountry(input.country)) {
    return { ok: false, error: "País no válido." };
  }

  const phone = input.phone?.trim() || null;

  const { error } = await db()
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      country: input.country,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.clientId)
    .eq("role", "client");

  if (error) return { ok: false, error: error.message };
  refresh(input.clientId);
  return { ok: true };
}

// ─── Asesor ──────────────────────────────────────────────────────────────────

/**
 * `assigned_advisor_id` existía desde el principio y estaba a NULL en los siete
 * clientes, porque no había ninguna pantalla que lo escribiera. Los listados sí
 * lo usan para acotar por cartera (`resolveViewScope`), así que asignarlo tiene
 * efecto inmediato en quién ve a quién.
 */
export async function assignClientAdvisor(
  clientId: string,
  advisorId: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (advisorId) {
    const { data: advisor } = await db()
      .from("profiles")
      .select("id, role")
      .eq("id", advisorId)
      .maybeSingle();
    // Asignar a alguien que no es del equipo dejaría al cliente sin dueño real
    // y, de paso, fuera del alcance de todos los filtros por cartera.
    if (!advisor || advisor.role === "client") {
      return { ok: false, error: "Ese usuario no puede ser asesor." };
    }
  }

  const { error } = await db()
    .from("profiles")
    .update({ assigned_advisor_id: advisorId, updated_at: new Date().toISOString() })
    .eq("id", clientId)
    .eq("role", "client");

  if (error) return { ok: false, error: error.message };
  refresh(clientId);
  return { ok: true };
}

// ─── Preferencias (el encargo) ───────────────────────────────────────────────

/** Lo que solo existe en Chile. NULL = no se toca lo que ya hubiera. */
export type ChilePreferencesInput = {
  preferredRegions: string[];
  preferredCommunes: string[];
  requiresServiceBedroom: boolean | null;
  minParkingSpaces: number | null;
  prefersCondominium: boolean | null;
  minFloors: number | null;
  currencyPreference: string | null;
  minPriceUf: number | null;
  maxPriceUf: number | null;
};

export type SavePreferencesInput = {
  clientId: string;
  country: "es" | "cl";
  brief: BriefInput;
  /** El perfil (etiqueta). NULL = no se cambia. */
  profile: BriefProfile | null;
  chile: ChilePreferencesInput | null;
};

const num = (v: number | null): number | null =>
  v === null || Number.isNaN(v) ? null : v;

/**
 * Guarda el encargo con `buildPreferencesPayload` — EXACTAMENTE la misma
 * función que usa "Nuevo cliente" (`createClientWithBrief`), así que los dos
 * guardan lo mismo y de la misma forma. Lo que no aplica a la operación va a
 * NULL: un cliente que pasa de alquiler a venta no arrastra estudiantes ni
 * estancia.
 *
 * Las columnas chilenas solo se escriben si vienen (`chile`): guardar desde
 * España no le borra a nadie lo que ya tenía puesto. Tampoco se tocan los
 * avisos de propiedades nuevas, que tienen su propio interruptor.
 */
export async function saveClientPreferencesFull(
  input: SavePreferencesInput,
): Promise<ActionResult> {
  let staffId: string | null = null;
  try {
    const me = await assertPermission("clientes", "edit");
    staffId = me.id ?? null;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const valid = validateBrief(input.brief);
  if (!valid.ok) return valid;

  const payload: Record<string, unknown> = {
    client_id: input.clientId,
    country: input.country,
    ...buildPreferencesPayload(input.brief),
    updated_at: new Date().toISOString(),
  };

  if (input.chile) {
    const c = input.chile;
    Object.assign(payload, {
      preferred_regions: c.preferredRegions,
      preferred_communes: c.preferredCommunes,
      requires_service_bedroom: c.requiresServiceBedroom,
      min_parking_spaces: num(c.minParkingSpaces),
      prefers_condominium: c.prefersCondominium,
      min_floors: num(c.minFloors),
      currency_preference: c.currencyPreference,
      min_price_uf: num(c.minPriceUf),
      max_price_uf: num(c.maxPriceUf),
    });
  }

  const { data: existing } = await db()
    .from("client_preferences")
    .select("client_id")
    .eq("client_id", input.clientId)
    .maybeSingle();

  const { error } = existing
    ? await db()
        .from("client_preferences")
        .update(payload)
        .eq("client_id", input.clientId)
    : await db().from("client_preferences").insert(payload);

  if (error) return { ok: false, error: error.message };

  if (input.profile) {
    const tag = await setClientProfileTag(db(), input.clientId, input.profile, staffId);
    if (!tag.ok) return { ok: false, error: `Encargo guardado, pero no el perfil: ${tag.error}` };
  }

  refresh(input.clientId);
  return { ok: true };
}
