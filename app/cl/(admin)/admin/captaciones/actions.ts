import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export type Captacion = {
  id: string;
  created_by: string;
  created_at: string;
  source_url: string;
  source_site: string | null;
  title: string | null;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  cover_photo_url: string | null;
  region: string | null;
  commune: string | null;
  zone: string | null;
  owner_phone: string | null;
  owner_name: string | null;
  owner_contact: string | null;
  address_real: string | null;
  owner_confirmed: boolean;
  assigned_to: string | null;
  assigned_at: string | null;
  status: "pending" | "completed" | "converted_to_property" | "rejected";
  notes: string | null;
  updated_at: string;
};

export async function createCaptacion(input: {
  source_url: string;
  source_site?: string;
  title?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  square_meters?: number;
  cover_photo_url?: string;
  region?: string;
  commune?: string;
  zone?: string;
  notes?: string;
}) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .insert({
      source_url: input.source_url,
      source_site: input.source_site || null,
      title: input.title || null,
      price: input.price || null,
      bedrooms: input.bedrooms || null,
      bathrooms: input.bathrooms || null,
      square_meters: input.square_meters || null,
      cover_photo_url: input.cover_photo_url || null,
      region: input.region || null,
      commune: input.commune || null,
      zone: input.zone || null,
      notes: input.notes || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Captacion;
}

export async function getCaptacionesForAgent(userId: string) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("created_by", userId)
    .eq("country", "cl")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Captacion[];
}

export async function getCaptacionesForCaptadora(userId: string) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("assigned_to", userId)
    .eq("country", "cl")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Captacion[];
}

export async function getCaptacion(id: string) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Captacion;
}

export async function updateCaptacionData(id: string, updates: {
  owner_phone?: string;
  owner_name?: string;
  owner_contact?: string;
  address_real?: string;
  owner_confirmed?: boolean;
  notes?: string;
  status?: string;
}) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Captacion;
}
