"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { requireStaff } from "@/lib/db/auth-helpers";
import { createClient } from "@/lib/db/server";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { detectLanguage } from "@/lib/lang-detect";

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

// Traductor gratuito sin clave: endpoint público de Google Translate (el mismo
// que usa translate.google.com). Auto-detecta el idioma origen (sl=auto) y
// traduce al español. Sin API key, sin configurar nada. Suficiente para el
// volumen del inbox. Devuelve null si falla (para caer al fallback de IA).
async function freeTranslateToSpanish(text: string): Promise<string | null> {
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=" +
      encodeURIComponent(text);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // No cachear: cada mensaje es distinto.
      cache: "no-store",
    });
    if (!res.ok) return null;
    // Respuesta: [[[traducido, original, ...], ...], ..., "en", ...]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const segments: unknown[] = Array.isArray(data?.[0]) ? data[0] : [];
    const translated = segments
      .map((s) => (Array.isArray(s) && typeof s[0] === "string" ? s[0] : ""))
      .join("");
    const trimmed = translated.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

// Segundo traductor gratuito: API oficial de MyMemory (sin clave en su tier
// anónimo). Necesita el idioma origen, que detectamos con lib/lang-detect.
// Sirve de red de seguridad si el endpoint de Google limita la IP del VPS.
async function myMemoryTranslateToSpanish(
  text: string,
  sourceCode: string,
): Promise<string | null> {
  try {
    const url =
      "https://api.mymemory.translated.net/get?langpair=" +
      encodeURIComponent(`${sourceCode}|es`) +
      "&q=" +
      encodeURIComponent(text);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const status = data?.responseStatus;
    const t = data?.responseData?.translatedText;
    if ((status === 200 || status === "200") && typeof t === "string") {
      const clean = t.trim();
      if (clean && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(clean)) {
        return clean;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Traduce al español el mensaje de un lead (Idealista recibe consultas en
// inglés, francés, alemán…). On-demand: solo se llama al pulsar "Traducir" en
// el modal, no en cada carga del inbox. Estrategia (todo gratis primero):
//   1) Traductor gratuito de Google (sin clave, auto-detección).
//   2) Traductor gratuito de MyMemory (sin clave; idioma origen detectado).
//   3) Fallback: cliente de IA del panel (si hay proveedor configurado).
export async function translateLeadMessage(text: string) {
  const session = await createClient();
  const auth = await requireStaff(session);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false as const, error: "Mensaje vacío" };

  // 1) Traductor gratuito de Google.
  const free = await freeTranslateToSpanish(trimmed);
  if (free) return { ok: true as const, translation: free };

  // 2) Traductor gratuito de MyMemory (necesita idioma origen).
  const lang = detectLanguage(trimmed);
  if (lang && lang.code !== "unknown" && lang.code !== "es") {
    const mm = await myMemoryTranslateToSpanish(trimmed, lang.code);
    if (mm) return { ok: true as const, translation: mm };
  }

  // 3) Fallback a IA (si los traductores gratuitos no están disponibles).
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
    if (translation) return { ok: true as const, translation };
  } catch (err) {
    if (!(err instanceof AINotConfiguredError)) {
      console.error("translateLeadMessage AI fallback error:", err);
    }
  }

  return {
    ok: false as const,
    error: "No se pudo traducir el mensaje ahora mismo. Inténtalo de nuevo en un momento.",
  };
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
