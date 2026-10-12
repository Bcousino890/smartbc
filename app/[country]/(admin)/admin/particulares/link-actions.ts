"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { runParticularesLinking } from "@/lib/particulares/linking-runner";

export type SetLinkStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Una persona confirma («sí, es el mismo inmueble») o descarta («no lo es») un
 * enlace propuesto por el algoritmo. A partir de ahí el cálculo automático ya
 * no lo toca (ver apply_particulares_links) y la agrupación se actualiza ya,
 * sin esperar al cron.
 */
export async function setParticularLinkStatus(
  linkId: string,
  status: "confirmado" | "descartado" | "auto",
): Promise<SetLinkStatusResult> {
  await assertPermission("particulares", "edit");
  if (!linkId) return { ok: false, error: "id_required" };
  if (!["confirmado", "descartado", "auto"].includes(status)) return { ok: false, error: "estado_invalido" };

  const profile = await getCurrentProfile();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("particulares_links")
    .update({
      status,
      decided_by: status === "auto" ? null : (profile?.id ?? null),
      decided_at: status === "auto" ? null : new Date().toISOString(),
    })
    .eq("id", linkId);
  if (error) return { ok: false, error: error.message };

  const run = await runParticularesLinking();
  if (!run.ok) return { ok: false, error: run.error ?? "No se pudo recalcular la agrupación" };

  revalidatePath("/admin/particulares");
  return { ok: true };
}
