import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { STAFF_ROLES } from "@/lib/permissions";

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

export type CaptacionStage = {
  id: string;
  key: string;
  label: string;
  color_key: string;
  stage_type: "draft" | "assign" | "normal" | "confirmed" | "rejected" | "converted";
  position: number;
  requires_notes: boolean;
};

export type Captacion = {
  id: string;
  created_by: string;
  created_at: string;
  pipeline_id: string | null;
  stage_id: string | null;
  stage?: CaptacionStage | null;
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
  // Indicadores de calidad de datos para los filtros del listado (se
  // calculan aparte con attachDataQualityFlags; opcionales porque no todas
  // las consultas los necesitan).
  has_phone?: boolean;
  has_name?: boolean;
  has_address?: boolean;
  has_rol?: boolean;
};

// La creación de captaciones vive en POST /api/admin/cl/captaciones/create
// (fija country, created_by y status 'draft', y dispara el scrape). La antigua
// función createCaptacion de este archivo insertaba status 'pending' (estado
// eliminado en la migración 0051) y sin created_by (NOT NULL): fallaba siempre.

// Trae también la etapa embebida (nombre/color/tipo) para pintar el tablero
// sin una consulta aparte por captación.
const CAPTACION_SELECT_WITH_STAGE = "*, stage:captacion_pipeline_stages(id, key, label, color_key, stage_type, position, requires_notes)";

// Corre la query con el embed de etapa; si falla (ej. la migración 0078 de
// pipelines todavía no se aplicó en este VPS y la relación no existe todavía
// para PostgREST), reintenta sin el embed en vez de tirar toda la página con
// un error 500. El listado se ve igual, solo sin datos de etapa hasta que se
// aplique la migración.
async function queryCaptaciones(
  build: (query: any) => any
): Promise<Captacion[]> {
  const db = createAdminClient() as any;
  try {
    const { data, error } = await build(db.from("captaciones").select(CAPTACION_SELECT_WITH_STAGE));
    if (error) throw error;
    return data as Captacion[];
  } catch (err) {
    console.warn("[captaciones] embed de etapa falló, usando fallback sin pipeline:", err);
    const db2 = createAdminClient() as any;
    const { data, error } = await build(db2.from("captaciones").select("*"));
    if (error) throw error;
    return data as Captacion[];
  }
}

// Un agente (viewRestriction "confirmed_and_own") ve: las que creó, las
// confirmadas (para poder convertirlas) y las que le asignaron a él —
// esto último importa desde que cualquier staff puede recibir una
// asignación, no solo captadoras: si no se incluye assigned_to, una
// captación asignada a un agente simplemente no le aparece.
export async function getCaptacionesForAgent(userId: string) {
  return queryCaptaciones((q) =>
    q
      .eq("country", "cl")
      .or(`created_by.eq.${userId},assigned_to.eq.${userId},owner_confirmed.eq.true`)
      .order("created_at", { ascending: false })
  );
}

export async function getCaptacionesForCaptadora(userId: string) {
  return queryCaptaciones((q) =>
    q.eq("assigned_to", userId).eq("country", "cl").order("created_at", { ascending: false })
  );
}

export async function getCaptacionesAll() {
  return queryCaptaciones((q) => q.eq("country", "cl").order("created_at", { ascending: false }));
}

export async function getCaptacion(id: string) {
  const db = createAdminClient() as any;
  let data: any;
  {
    const { data: withStage, error } = await db
      .from("captaciones")
      .select(CAPTACION_SELECT_WITH_STAGE)
      .eq("id", id)
      .single();
    if (error) {
      // Fallback si la migración 0078 (pipelines) todavía no se aplicó
      console.warn("[captaciones] embed de etapa falló en getCaptacion, usando fallback:", error);
      const { data: plain, error: plainError } = await db
        .from("captaciones")
        .select("*")
        .eq("id", id)
        .single();
      if (plainError) throw plainError;
      data = plain;
    } else {
      data = withStage;
    }
  }

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

// Calcula los indicadores de calidad de datos para el listado (filtros "sin
// dirección", "con rol SII", "sin teléfono", "con nombre"). Teléfono/nombre
// consideran tanto los campos heredados (owner_phone/owner_name) como los
// contactos nuevos (captacion_contacts), ya que una captación reciente puede
// tener el dato solo en un contacto y no en la columna vieja.
export async function attachDataQualityFlags(captaciones: Captacion[]): Promise<Captacion[]> {
  if (captaciones.length === 0) return captaciones;

  const db = createAdminClient() as any;
  const ids = captaciones.map((c) => c.id);
  const { data: contacts } = await db
    .from("captacion_contacts")
    .select("captacion_id, phone, contact_name")
    .in("captacion_id", ids);

  const contactsByCaptacion = new Map<string, { phone: string | null; contact_name: string | null }[]>();
  for (const contact of contacts || []) {
    const list = contactsByCaptacion.get(contact.captacion_id) || [];
    list.push(contact);
    contactsByCaptacion.set(contact.captacion_id, list);
  }

  return captaciones.map((c) => {
    const ownContacts = contactsByCaptacion.get(c.id) || [];
    return {
      ...c,
      has_phone: Boolean(c.owner_phone) || ownContacts.some((ct) => ct.phone),
      has_name: Boolean(c.owner_name) || ownContacts.some((ct) => ct.contact_name),
      has_address: Boolean(c.address_real),
      has_rol: Boolean(c.rol_propiedad),
    };
  });
}

// Cualquier usuario staff de Chile puede recibir una captación para llamar
// (no solo captadoras): agentes, admins, etc. Se usa en el selector "Asignar
// a" del pipeline.
//
// IMPORTANTE: NO filtramos por rol dentro de la query con .in("role", [...]).
// Ese filtro construye literales del enum `user_role` en Postgres y, si algún
// valor todavía no existe en el enum de la BD (p. ej. 'owner' antes de aplicar
// la migración 0079, o 'captadora' antes de la 0065), la query ENTERA falla
// con "invalid input value for enum user_role" y el selector "Asignar a"
// aparecía vacío. Traemos todos los perfiles y filtramos los roles staff en
// JS, así el selector funciona aunque el enum de la BD esté desincronizado.
export async function getChileAssignableUsers() {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name", { ascending: true });

  if (error) throw error;
  const staff = new Set<string>(STAFF_ROLES as readonly string[]);
  return (data || []).filter((u: { role: string | null }) =>
    u.role != null && staff.has(u.role)
  ) as Array<{ id: string; full_name: string | null; role: string }>;
}
