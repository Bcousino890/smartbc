import "server-only";
import {
  findCrossPortalPhone,
  type MatchableListing,
} from "./cross-match-phone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface CrossMatchSummary {
  ok: boolean;
  timestamp: string;
  targets_sin_telefono: number;
  candidatos_con_telefono: number;
  rellenados: number;
  ejemplos: Array<{ id: string; phone: string; matched_portal: string | null }>;
  error?: string;
}

const SELECT_COLS = "id, portal, operation, zone, address, price, bedrooms, square_meters, phone";

/**
 * Rellena teléfonos por cross-match entre portales (enfoque "Casafari"): para
 * cada anuncio sin teléfono, busca en la BD otro anuncio CON teléfono que sea,
 * con alta confianza, la misma propiedad física (misma operación + precio
 * exacto + habitaciones + m² + zona, o misma dirección con número) y copia el
 * teléfono. NO usa red ni DataDome — solo datos que ya tenemos.
 *
 * Por qué funciona: pisos.com expone el teléfono sin DataDome, y muchos
 * particulares publican el mismo piso en Idealista y en pisos.com. Así
 * convertimos los teléfonos "gratis" de pisos.com en teléfonos de Idealista.
 */
export async function crossMatchPhones(
  supabase: SupabaseLike,
  opts?: { limit?: number },
): Promise<CrossMatchSummary> {
  const now = new Date().toISOString();
  const limit = Math.min(5000, Math.max(1, opts?.limit ?? 2000));

  try {
    // Candidatos: TODOS los anuncios activos CON teléfono (cualquier portal;
    // sobre todo pisos.com). Suelen ser pocos (~miles), caben en memoria.
    const { data: candidatesRaw, error: candErr } = await supabase
      .from("particulares")
      .select(SELECT_COLS)
      .eq("is_active", true)
      .not("phone", "is", null);
    if (candErr) return errSummary(now, candErr.message);
    const candidates = (candidatesRaw ?? []) as MatchableListing[];

    // Índice por precio exacto (el precio SIEMPRE debe coincidir), para no
    // comparar todos contra todos.
    const byPrice = new Map<number, MatchableListing[]>();
    for (const c of candidates) {
      if (c.price == null || !c.phone) continue;
      const arr = byPrice.get(c.price) ?? [];
      arr.push(c);
      byPrice.set(c.price, arr);
    }

    // Targets: anuncios activos SIN teléfono y con precio (sin precio no hay
    // clave de emparejamiento). Priorizamos los más recientes.
    const { data: targetsRaw, error: tgtErr } = await supabase
      .from("particulares")
      .select(SELECT_COLS)
      .eq("is_active", true)
      .is("phone", null)
      .not("price", "is", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (tgtErr) return errSummary(now, tgtErr.message);
    const targets = (targetsRaw ?? []) as MatchableListing[];

    let rellenados = 0;
    const ejemplos: CrossMatchSummary["ejemplos"] = [];

    for (const target of targets) {
      if (target.price == null) continue;
      const pool = byPrice.get(target.price);
      if (!pool || pool.length === 0) continue;

      const match = findCrossPortalPhone(target, pool);
      if (!match) continue;

      const { error: updErr } = await supabase
        .from("particulares")
        .update({
          phone: match.phone,
          phone_confidence: "medium", // cross-portal: alta probabilidad, no verificado en origen
          chat_only: false,
          updated_at: now,
        })
        .eq("id", target.id)
        .is("phone", null); // no pisar si otro proceso ya lo rellenó
      if (updErr) continue;

      // Historial: teléfono nuevo por cross-match.
      await supabase.from("particulares_changes").insert({
        particular_id: target.id,
        change_type: "phone_added",
        old_value: null,
        new_value: { phone: match.phone, source: "cross-match", matched_id: match.matchedId, matched_portal: match.matchedPortal },
        changed_at: now,
      });

      rellenados++;
      if (ejemplos.length < 10) {
        ejemplos.push({ id: target.id, phone: match.phone, matched_portal: match.matchedPortal });
      }
    }

    return {
      ok: true,
      timestamp: now,
      targets_sin_telefono: targets.length,
      candidatos_con_telefono: candidates.length,
      rellenados,
      ejemplos,
    };
  } catch (err) {
    return errSummary(now, err instanceof Error ? err.message : String(err));
  }
}

function errSummary(timestamp: string, error: string): CrossMatchSummary {
  return { ok: false, timestamp, targets_sin_telefono: 0, candidatos_con_telefono: 0, rellenados: 0, ejemplos: [], error };
}
