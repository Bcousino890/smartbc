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

// ─── Preferencias ────────────────────────────────────────────────────────────

export type SavePreferencesInput = {
  clientId: string;
  country: "es" | "cl";
  operation: "rent" | "sale";
  stay: "short" | "long";
  zones: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minSquareMeters: number | null;
  maxSquareMeters: number | null;
  availableFrom: string | null;
  occupants: number | null;
  students: number | null;
  workers: number | null;
  pets: boolean;
  universities: string | null;
  notes: string | null;
  // Chile
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

const num = (v: number | null): number | null =>
  v === null || Number.isNaN(v) ? null : v;

/**
 * Un único upsert con las 34 columnas. `client_preferences` tiene la clave
 * primaria en `client_id`, así que se comprueba antes si la fila existe: sin
 * fila, INSERT; con fila, UPDATE.
 *
 * Los campos chilenos se guardan siempre que vengan; que se PINTEN o no lo
 * decide el país del cliente, no esta función. Así, cambiar a un cliente de
 * país no le borra en silencio lo que ya tenía puesto.
 */
export async function saveClientPreferencesFull(
  input: SavePreferencesInput,
): Promise<ActionResult> {
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  if (
    input.minPrice !== null &&
    input.maxPrice !== null &&
    input.minPrice > input.maxPrice
  ) {
    return { ok: false, error: "El presupuesto mínimo no puede superar al máximo." };
  }

  const payload: Record<string, unknown> = {
    client_id: input.clientId,
    country: input.country,
    operation: input.operation,
    stay: input.stay,
    zones: input.zones,
    min_price: num(input.minPrice),
    max_price: num(input.maxPrice),
    min_bedrooms: num(input.minBedrooms),
    min_bathrooms: num(input.minBathrooms),
    min_square_meters: num(input.minSquareMeters),
    max_square_meters: num(input.maxSquareMeters),
    available_from: input.availableFrom || null,
    occupants: num(input.occupants),
    students: num(input.students),
    workers: num(input.workers),
    pets: input.pets,
    universities: input.universities?.trim() || null,
    notes: input.notes?.trim() || null,
    preferred_regions: input.preferredRegions,
    preferred_communes: input.preferredCommunes,
    requires_service_bedroom: input.requiresServiceBedroom,
    min_parking_spaces: num(input.minParkingSpaces),
    prefers_condominium: input.prefersCondominium,
    min_floors: num(input.minFloors),
    currency_preference: input.currencyPreference,
    min_price_uf: num(input.minPriceUf),
    max_price_uf: num(input.maxPriceUf),
    updated_at: new Date().toISOString(),
  };

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
  refresh(input.clientId);
  return { ok: true };
}
