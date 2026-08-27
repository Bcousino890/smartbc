import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { planGroupMerge, phoneTail, type MergeCandidate } from "./merge";

/**
 * Aplica la unificación automática a los leads que acaban de entrar.
 *
 * Se llama DESPUÉS del upsert de la ingesta (app/api/extension/idealista-leads),
 * acotado a los teléfonos que ha tocado esa tanda: no recorre la tabla entera
 * en cada captura de la extensión.
 *
 * Nunca borra. Marca `merged_into_id` en el absorbido —que así desaparece de
 * la bandeja (ver migración 0160)— y le pasa el historial al superviviente,
 * porque las llamadas y los WhatsApps son de la misma persona y separados no
 * cuentan la conversación completa.
 *
 * Es best-effort: si algo falla, se registra y la ingesta responde OK igual.
 * Un fallo aquí deja dos leads a la vista, que es exactamente como estaba
 * antes de esta función — nunca deja datos a medias que haya que reparar.
 */
export async function autoMergeLeadsByPhone(phoneDigitsTouched: string[]): Promise<{
  merged: number;
  blocked: number;
}> {
  const tails = [...new Set(phoneDigitsTouched.map(phoneTail).filter((t): t is string => !!t))];
  if (tails.length === 0) return { merged: 0, blocked: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  let merged = 0;
  let blocked = 0;

  for (const tail of tails) {
    try {
      const { data, error } = await db
        .from("idealista_leads")
        .select("id, name, phone_digits, created_at")
        .like("phone_digits", `%${tail}`)
        .is("merged_into_id", null)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error || !data || data.length < 2) continue;

      // `like %tail` puede traer de más (un número más largo que TERMINA en
      // los mismos 9 dígitos), así que se vuelve a comprobar en memoria con
      // el mismo criterio exacto que usa decideMerge.
      const group: MergeCandidate[] = (data as any[])
        .map((r) => ({
          id: r.id as string,
          name: (r.name ?? null) as string | null,
          phoneDigits: (r.phone_digits ?? null) as string | null,
          createdAt: r.created_at as string,
        }))
        .filter((c) => phoneTail(c.phoneDigits) === tail);

      const plan = planGroupMerge(group);
      if (!plan) continue;
      blocked += plan.blocked.length;
      if (plan.absorb.length === 0) continue;

      const ids = plan.absorb.map((l) => l.id);
      const now = new Date().toISOString();

      // El historial va PRIMERO: si el proceso muere entre las dos
      // escrituras, quedan dos leads visibles con el historial ya junto
      // (raro pero inocuo) en vez de un lead escondido con su historial
      // colgando de él, que sí sería una pérdida de información a la vista.
      await db.from("lead_activity").update({ lead_id: plan.survivor.id }).in("lead_id", ids);
      await db.from("zinto_conversations").update({ lead_id: plan.survivor.id }).in("lead_id", ids);

      const { error: mergeError } = await db
        .from("idealista_leads")
        .update({ merged_into_id: plan.survivor.id, merged_at: now })
        .in("id", ids);
      if (mergeError) {
        console.error("[auto-merge] no se pudo marcar la fusión:", mergeError.message);
        continue;
      }
      merged += ids.length;
    } catch (err) {
      console.error("[auto-merge] fallo con el teléfono", tail, err);
    }
  }

  return { merged, blocked };
}
