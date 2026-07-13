"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

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

// Traduce al español el mensaje de un lead (Idealista recibe consultas en
// inglés, francés, alemán…). Usa el cliente de IA multi-proveedor ya
// configurado en el panel (ver lib/services/ai/chat.ts). On-demand: solo se
// llama al pulsar "Traducir" en el modal, no en cada carga del inbox.
export async function translateLeadMessage(text: string) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false as const, error: "Mensaje vacío" };

  try {
    const out = await aiComplete({
      system:
        "Eres un traductor profesional. Traduce al español de España el texto que te envíe el usuario. " +
        "Devuelve ÚNICAMENTE la traducción: sin comillas, sin notas, sin explicaciones y sin el texto original. " +
        "Conserva los saltos de línea. Si el texto ya está en español, devuélvelo tal cual.",
      userText: trimmed,
      maxTokens: 1200,
    });
    const translation = (out ?? "").trim();
    if (!translation) return { ok: false as const, error: "No se pudo traducir" };
    return { ok: true as const, translation };
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return {
        ok: false as const,
        error: "IA no configurada. Ve a Configuración → IA para activar la traducción.",
      };
    }
    console.error("translateLeadMessage error:", err);
    return { ok: false as const, error: "Error al traducir el mensaje" };
  }
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
