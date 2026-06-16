"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import type { Operation, StayType } from "@/lib/types";

export type SaveClientPreferencesInput = {
  clientId: string;
  operation: Operation;
  stayType: StayType;
  preferredZone: string;
  budgetMin: number;
  budgetMax: number;
  occupants: number;
  students: number;
  workers: number;
  pets: boolean;
  universities?: string;
};

export type SaveClientPreferencesResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveClientPreferences(
  input: SaveClientPreferencesInput,
): Promise<SaveClientPreferencesResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth;

  const payload = {
    client_id: input.clientId,
    operation: input.operation === "alquiler" ? "rent" : "sale",
    stay: input.stayType === "corta" ? "short" : "long",
    zones: input.preferredZone ? [input.preferredZone] : [],
    min_price: input.budgetMin,
    max_price: input.budgetMax,
    occupants: input.occupants,
    students: input.students,
    workers: input.workers,
    pets: input.pets,
    universities: input.universities || null,
  };

  // client_preferences tiene PK = client_id, así que UPDATE si existe, INSERT si no.
  const existingResult = await supabase
    .from("client_preferences")
    .select("client_id")
    .eq("client_id", input.clientId)
    .maybeSingle();

  const existingRow = existingResult.data as { client_id: string } | null;

  // supabase-js no infiere bien Insert/Update tras chains tipadas.
  const prefs = supabase.from("client_preferences") as unknown as {
    update: (
      payload: Record<string, unknown>,
    ) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message: string } | null }>;
    };
    insert: (
      payload: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  };

  const writeResult = existingRow
    ? await prefs.update(payload).eq("client_id", input.clientId)
    : await prefs.insert(payload);

  if (writeResult.error) {
    return { ok: false, error: writeResult.error.message };
  }

  revalidatePath("/admin/clientes");
  return { ok: true };
}

export type CreateClientInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  operation: Operation;
  stayType: StayType;
  preferredZone: string;
  budgetMin: number;
  budgetMax: number;
  universities?: string;
  occupants: number;
  students: number;
  workers: number;
  pets: boolean;
};

export type CreateClientResult =
  | { ok: true; clientId: string }
  | { ok: false; error: string };

export async function createNewClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return auth as CreateClientResult;

  const adminClient = createAdminClient();

  // Crear usuario en auth (esto dispara el trigger handle_new_user, que crea
  // la fila en profiles) y enviar invitación por email para que fije su contraseña.
  const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    input.email,
    {
      data: {
        full_name: `${input.firstName} ${input.lastName}`,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
      },
    },
  );

  if (inviteError || !data?.user) {
    return {
      ok: false,
      error: inviteError?.message || "Error creating profile",
    };
  }

  const clientId = data.user.id;

  if (input.phone) {
    const { error: phoneError } = await (adminClient as any)
      .from("profiles")
      .update({ phone: input.phone })
      .eq("id", clientId);

    if (phoneError) {
      return { ok: false, error: phoneError.message };
    }
  }

  // Create preferences
  const { error: prefsError } = await adminClient
    .from("client_preferences")
    .insert({
      client_id: clientId,
      operation: input.operation === "alquiler" ? "rent" : "sale",
      stay: input.stayType === "corta" ? "short" : "long",
      zones: input.preferredZone ? [input.preferredZone] : [],
      min_price: input.budgetMin,
      max_price: input.budgetMax,
      occupants: input.occupants,
      students: input.students,
      workers: input.workers,
      pets: input.pets,
      universities: input.universities || null,
    } as any);

  if (prefsError) {
    return { ok: false, error: prefsError.message };
  }

  revalidatePath("/admin/clientes");
  return { ok: true, clientId };
}
