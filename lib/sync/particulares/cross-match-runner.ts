import "server-only";
import {
  findCrossPortalPhone,
  PRICE_TOLERANCE_PCT,
  type MatchableListing,
} from "./cross-match-phone";
import { withMigration0035Fallback } from "./migration-fallback";

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

// `bathrooms` y `description` entran en el SELECT porque el emparejamiento ya
// no se conforma con dirección + precio: necesita corroborar características y
// texto del anuncio (ver `isConfidentMatch`).
const SELECT_COLS =
  "id, portal, operation, zone, address, price, bedrooms, bathrooms, square_meters, description, phone";

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
    // Candidatos: TODOS los anuncios activos CON teléfono (cualquier portal).
    // Caben de sobra en memoria (unos pocos miles).
    //
    // ⚠️ Hay que pedirlos por páginas con `.range()`: PostgREST devuelve como
    // mucho 1.000 filas por consulta y NO avisa de que ha recortado. Sin esto,
    // el cruce sólo miraba los 1.000 primeros candidatos y los gemelos que
    // quedaban fuera no se emparejaban nunca — un fallo invisible, porque el
    // resumen daba "ok" igualmente.
    const PAGE = 1000;
    const candidates: MatchableListing[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: candErr } = await supabase
        .from("particulares")
        .select(SELECT_COLS)
        .eq("is_active", true)
        .not("phone", "is", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (candErr) return errSummary(now, candErr.message);
      const rows = (page ?? []) as MatchableListing[];
      candidates.push(...rows);
      if (rows.length < PAGE) break;
    }

    // Candidatos ordenados por precio: como el precio ya no tiene que coincidir
    // al euro sino caer dentro de un margen (`PRICE_TOLERANCE_PCT`), un índice
    // por precio exacto se dejaría fuera los gemelos con el precio actualizado
    // en un solo portal. Con el array ordenado se busca la ventana por bisección
    // y se comparan sólo los candidatos de ese tramo.
    const sorted = candidates
      .filter((c) => c.price != null && c.phone)
      .sort((a, b) => (a.price as number) - (b.price as number));
    const prices = sorted.map((c) => c.price as number);

    /** Primer índice cuyo precio es >= `value` (bisección). */
    const lowerBound = (value: number): number => {
      let lo = 0;
      let hi = prices.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (prices[mid] < value) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    /** Candidatos cuyo precio está dentro del margen de `price`. */
    const candidatesNearPrice = (price: number): MatchableListing[] => {
      const margin = (price * PRICE_TOLERANCE_PCT) / 100;
      const out: MatchableListing[] = [];
      for (let i = lowerBound(price - margin); i < sorted.length; i++) {
        if (prices[i] > price + margin) break;
        out.push(sorted[i]);
      }
      return out;
    };

    // Targets: anuncios activos SIN teléfono y con precio (sin precio no hay
    // clave de emparejamiento). Priorizamos los más recientes.
    //
    // También por páginas, y por el mismo motivo que los candidatos: `.limit()`
    // no puede saltarse el tope de 1.000 filas de PostgREST, así que pedir 5.000
    // devolvía 1.000 y los ~4.000 restantes no se miraban nunca.
    const targets: MatchableListing[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      const size = Math.min(PAGE, limit - from);
      const { data: page, error: tgtErr } = await supabase
        .from("particulares")
        .select(SELECT_COLS)
        .eq("is_active", true)
        .is("phone", null)
        .not("price", "is", null)
        .order("updated_at", { ascending: false })
        .range(from, from + size - 1);
      if (tgtErr) return errSummary(now, tgtErr.message);
      const rows = (page ?? []) as MatchableListing[];
      targets.push(...rows);
      if (rows.length < size) break;
    }

    let rellenados = 0;
    const ejemplos: CrossMatchSummary["ejemplos"] = [];

    for (const target of targets) {
      if (target.price == null) continue;
      const pool = candidatesNearPrice(target.price);
      if (pool.length === 0) continue;

      const match = findCrossPortalPhone(target, pool);
      if (!match) continue;

      const { error: updErr } = await withMigration0035Fallback(
        {
          phone: match.phone,
          phone_confidence: "medium", // cross-portal: alta probabilidad, no verificado en origen
          chat_only: false,
          updated_at: now,
        },
        (values) =>
          supabase
            .from("particulares")
            .update(values)
            .eq("id", target.id)
            .is("phone", null), // no pisar si otro proceso ya lo rellenó
      );
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
