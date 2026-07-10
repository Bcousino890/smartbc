import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export type IdealistaLeadRow = {
  id: string;
  conversation_id: string;
  name: string;
  phone: string | null;
  phone_country: string | null;
  is_international: boolean;
  message: string | null;
  profile: { bullets?: string[]; presentacion?: string | null } | null;
  property_title: string | null;
  property_price: string | null;
  property_type: string | null;
  idealista_code: string | null;
  property_ref: string | null;
  matched_property_id: string | null;
  message_date: string | null;
  detail_captured: boolean;
  suggested_type: "particular" | "agencia" | "relocation" | null;
  suggestion_keywords: string[];
  lead_type: "particular" | "agencia" | "relocation" | null;
  status: "nuevo" | "fichado" | "descartado";
  created_at: string;
  updated_at: string;
};

// Leads del inbox de Idealista capturados por la extensión de Chrome.
// Solo existe inbox en España, así que el listado es global (sin filtro país).
export async function getIdealistaLeads(): Promise<IdealistaLeadRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("idealista_leads")
    .select(
      "id, conversation_id, name, phone, phone_country, is_international, message, profile, property_title, property_price, property_type, idealista_code, property_ref, matched_property_id, message_date, detail_captured, suggested_type, suggestion_keywords, lead_type, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    // La migración 0080 puede no estar aplicada aún en el VPS
    console.error("getIdealistaLeads error:", error);
    return [];
  }
  return (data ?? []) as IdealistaLeadRow[];
}
