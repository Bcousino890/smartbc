"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
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

  // Create profile with role='client'
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone: input.phone || null,
      role: "client",
      status: "active",
    })
    .select("id")
    .single();

  if (profileError || !profile) {
    return {
      ok: false,
      error: profileError?.message || "Error creating profile",
    };
  }

  // Create preferences
  const { error: prefsError } = await supabase
    .from("client_preferences")
    .insert({
      client_id: profile.id,
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
    });

  if (prefsError) {
    return { ok: false, error: prefsError.message };
  }

  revalidatePath("/admin/clientes");
  return { ok: true, clientId: profile.id };
}
