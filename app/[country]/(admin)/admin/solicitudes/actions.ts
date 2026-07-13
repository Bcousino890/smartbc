"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";

export async function markContactRead(id: string) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  await supabase
    .from("contact_requests")
    .update({ status: "read", updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin/solicitudes");
  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

export async function updateIdealistaLeadStatus(
  id: string,
  status: "nuevo" | "fichado" | "descartado",
) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("idealista_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateIdealistaLeadStatus error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/solicitudes");
  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

export async function setIdealistaLeadType(
  id: string,
  leadType: "particular" | "agencia" | "relocation",
) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("idealista_leads")
    .update({ lead_type: leadType, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("setIdealistaLeadType error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/solicitudes");
  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

export async function assignIdealistaLead(id: string, advisorId: string | null) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("idealista_leads")
    .update({
      assigned_to: advisorId,
      assigned_at: advisorId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("assignIdealistaLead error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

// Vínculo manual a una ficha del sistema cuando el match automático (por
// Ref./Cód. de Idealista, ver api/extension/idealista-leads/route.ts) no
// encontró nada — o para corregirlo si emparejó con la propiedad equivocada.
export async function setIdealistaLeadMatchedProperty(
  id: string,
  propertyId: string | null,
) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("idealista_leads")
    .update({ matched_property_id: propertyId, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("setIdealistaLeadMatchedProperty error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

export async function updateIdealistaLeadContactStatus(
  id: string,
  contactStatus:
    | "ninguno"
    | "contactado_whatsapp"
    | "contactado_llamada"
    | "contactado_email"
    | "sin_respuesta",
) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("idealista_leads")
    .update({ contact_status: contactStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateIdealistaLeadContactStatus error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}

export async function updateVisitStatus(
  id: string,
  status: "confirmed" | "cancelled" | "completed",
) {
  // Server actions son endpoints públicos: verificar que quien llama es staff
  // antes de tocar nada con el cliente service-role.
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false, error: auth.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { error } = await supabase
    .from("visit_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("updateVisitStatus error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/solicitudes");
  revalidatePath("/es/admin/solicitudes");
  revalidatePath("/cl/admin/solicitudes");
  return { ok: true };
}
