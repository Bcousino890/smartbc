import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export type CaptacionExtraPhone = {
  phone: string;
  has_whatsapp: boolean;
  label?: string | null;
};

export type CaptacionContact = {
  id: string;
  captacion_id: string;
  contact_type: "owner" | "spouse" | "family" | "other";
  contact_name: string | null;
  rut: string | null;
  phone: string | null;
  email: string | null;
  has_whatsapp: boolean;
  relationship: string | null;
  extra_phones: CaptacionExtraPhone[] | null;
  created_at: string;
  updated_at: string;
};

export type Captacion = {
  id: string;
  created_by: string;
  created_at: string;
  source_url: string;
  source_site: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  useful_square_meters: number | null;
  cover_photo_url: string | null;
  region: string | null;
  commune: string | null;
  zone: string | null;
  subzone: string | null;
  address_scraped: string | null;
  latitude: number | null;
  longitude: number | null;
  owner_phone: string | null;
  owner_name: string | null;
  owner_contact: string | null;
  address_real: string | null;
  owner_confirmed: boolean;
  assigned_to: string | null;
  assigned_at: string | null;
  status: "draft" | "assigned" | "preliminary_data" | "contacting" | "field_visit" | "revision" | "confirmed" | "converted_to_property" | "rejected";
  scrape_status: "pending" | "scraped" | "failed" | "not_available" | null;
  scrape_error: string | null;
  notes: string | null;
  revision_notes: string | null;
  last_contact_attempt_at: string | null;
  property_type: 'house' | 'apartment' | 'land' | 'office' | 'commercial' | 'other' | null;
  address_verified: boolean;
  rol_propiedad: string | null;
  features: string[] | null;
  broker_name: string | null;
  external_reference: string | null;
  operation: "venta" | "arriendo" | null;
  portal_publication_number: string | null;
  published_ago: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  updated_at: string;
  contacts?: CaptacionContact[];
};

// La creación de captaciones vive en POST /api/admin/cl/captaciones/create
// (fija country, created_by y status 'draft', y dispara el scrape). La antigua
// función createCaptacion de este archivo insertaba status 'pending' (estado
// eliminado en la migración 0051) y sin created_by (NOT NULL): fallaba siempre.

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

export async function getCaptacionesAll() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
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

  // Cargar contactos (tabla puede no existir si migración pendiente)
  let contacts: any[] = [];
  try {
    const { data: contactsData } = await db
      .from("captacion_contacts")
      .select("*")
      .eq("captacion_id", id)
      .order("created_at", { ascending: true });
    contacts = contactsData || [];
  } catch {
    // Migración 0057 pendiente — continuar sin contactos
  }

  return {
    ...data,
    property_type: data.property_type ?? null,
    address_verified: data.address_verified ?? false,
    rol_propiedad: data.rol_propiedad ?? null,
    features: data.features ?? null,
    broker_name: data.broker_name ?? null,
    external_reference: data.external_reference ?? null,
    useful_square_meters: data.useful_square_meters ?? null,
    contacts,
  } as Captacion;
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

export async function getCaptacionesPendingAssignment() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("status", "draft")
    .eq("country", "cl")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as Captacion[];
}

export async function getCaptacionesConfirmed() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("status", "confirmed")
    .eq("country", "cl")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data as Captacion[];
}

export async function getCaptacionesByStatus(status: string) {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captaciones")
    .select("*")
    .eq("status", status)
    .eq("country", "cl")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data as Captacion[];
}

export async function getCaptadoras() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("role", "captadora")
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data as Array<{ id: string; full_name: string | null }>;
}

// Cualquier usuario staff de Chile puede recibir una captación para llamar
// (no solo captadoras): agentes, admins, etc. Se usa en el selector "Asignar
// a" del pipeline.
export async function getChileAssignableUsers() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("country", "cl")
    .in("role", [
      "owner",
      "admin",
      "advisor",
      "agent_junior",
      "agent_senior",
      "agent_admin",
      "captadora",
    ])
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data as Array<{ id: string; full_name: string | null; role: string }>;
}
