import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export type IdealistaLeadRow = {
  id: string;
  conversation_id: string;
  name: string;
  phone: string | null;
  phone_country: string | null;
  avatar_url: string | null;
  is_international: boolean;
  message: string | null;
  profile: { bullets?: string[]; presentacion?: string | null } | null;
  property_title: string | null;
  property_price: string | null;
  property_type: string | null;
  property_image_url: string | null;
  properties: { title: string | null; price: string | null; type: string | null; imageUrl: string | null }[];
  idealista_code: string | null;
  property_ref: string | null;
  matched_property_id: string | null;
  message_date: string | null;
  detail_captured: boolean;
  suggested_type: "particular" | "agencia" | "relocation" | null;
  suggestion_keywords: string[];
  lead_type: "particular" | "agencia" | "relocation" | null;
  status: "nuevo" | "fichado" | "descartado";
  contact_status:
    | "ninguno"
    | "contactado_whatsapp"
    | "contactado_llamada"
    | "contactado_email"
    | "sin_respuesta";
  assigned_to: string | null;
  assigned_name: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
};

const BASE_SELECT =
  "id, conversation_id, name, phone, phone_country, avatar_url, is_international, message, profile, property_title, property_price, property_type, property_image_url, properties, idealista_code, property_ref, matched_property_id, message_date, detail_captured, suggested_type, suggestion_keywords, lead_type, status, created_at, updated_at";

// Leads del inbox de Idealista capturados por la extensión de Chrome.
// Solo existe inbox en España, así que el listado es global (sin filtro país).
export async function getIdealistaLeads(): Promise<IdealistaLeadRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Intenta con las columnas de asignación/contacto (migración 0086); si esa
  // migración no está aplicada aún en el VPS, cae a las columnas base para no
  // romper el inbox mientras tanto.
  let usingAssignment = true;
  let { data, error } = await admin
    .from("idealista_leads")
    .select(`${BASE_SELECT}, contact_status, assigned_to, assigned_at`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    usingAssignment = false;
    ({ data, error } = await admin
      .from("idealista_leads")
      .select(BASE_SELECT)
      .order("created_at", { ascending: false })
      .limit(500));
  }

  if (error) {
    // La migración 0080 puede no estar aplicada aún en el VPS
    console.error("getIdealistaLeads error:", error);
    return [];
  }

  const rows = (data ?? []) as Array<
    Omit<IdealistaLeadRow, "assigned_name">
  >;

  const assignedIds = usingAssignment
    ? Array.from(
        new Set(rows.map((r) => r.assigned_to).filter((id): id is string => !!id)),
      )
    : [];
  const names = new Map<string, string>();
  if (assignedIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", assignedIds);
    for (const p of profs ?? []) {
      names.set(p.id, (p.full_name as string) || (p.email as string));
    }
  }

  return rows.map((r) => ({
    ...r,
    contact_status: r.contact_status ?? "ninguno",
    assigned_to: r.assigned_to ?? null,
    assigned_at: r.assigned_at ?? null,
    assigned_name: r.assigned_to ? (names.get(r.assigned_to) ?? null) : null,
  })) as IdealistaLeadRow[];
}
