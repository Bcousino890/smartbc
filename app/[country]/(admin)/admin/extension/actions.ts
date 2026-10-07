"use server";

// ============================================================================
// Desconectar navegadores y ajustar la seguridad de la extensión.
//
// Cualquiera del equipo puede cerrar SUS sesiones; owner/admin pueden cerrar
// las de cualquiera (alguien deja la empresa, pierde el portátil…) y decidir
// si se sigue aceptando el token compartido antiguo.
// ============================================================================

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  revokeAllForUser,
  revokeExtensionSession,
  setExtensionSecurity,
} from "@/lib/extension/sessions";

type Result = { ok: true } | { ok: false; error: string };

const ADMIN = ["owner", "admin"];

function refresh() {
  revalidatePath("/es/admin/extension");
  revalidatePath("/cl/admin/extension");
}

export async function revokeSession(sessionId: string): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "No autenticado" };
  const res = await revokeExtensionSession(
    sessionId,
    me.id,
    ADMIN.includes(me.role) ? undefined : me.id,
  );
  if (res.ok) refresh();
  return res;
}

export async function revokeUserSessions(userId: string): Promise<Result & { count?: number }> {
  const me = await getCurrentProfile();
  if (!me || !ADMIN.includes(me.role)) return { ok: false, error: "Solo owner/admin." };
  const count = await revokeAllForUser(userId, me.id);
  refresh();
  return { ok: true, count };
}

export async function saveExtensionSecurity(input: {
  legacyTokenEnabled: boolean;
  allowedExtensionIds: string[];
  storeUrl: string | null;
}): Promise<Result> {
  const me = await getCurrentProfile();
  if (!me || !ADMIN.includes(me.role)) return { ok: false, error: "Solo owner/admin." };

  const ids = input.allowedExtensionIds.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = ids.find((id) => !/^[a-p]{32}$/.test(id));
  if (bad) return { ok: false, error: `"${bad}" no es un ID de extensión (32 letras de la a a la p).` };
  if (input.storeUrl && !/^https:\/\/chromewebstore\.google\.com\//.test(input.storeUrl.trim())) {
    return { ok: false, error: "El enlace tiene que ser de chromewebstore.google.com." };
  }

  const res = await setExtensionSecurity({
    legacyTokenEnabled: input.legacyTokenEnabled,
    allowedExtensionIds: ids,
    storeUrl: input.storeUrl?.trim() || null,
  });
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}
