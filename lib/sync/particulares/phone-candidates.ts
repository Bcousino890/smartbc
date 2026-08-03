import "server-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type PhoneCandidateMode =
  | "missing" // activos sin teléfono, sin distinguir chat_only (refresh-phones, verify-phones?mode=missing)
  | "missing_unclassified" // activos sin teléfono Y no marcados chat_only=true (fase "general" del cron, tras la ya tratada por chat_only)
  | "chat_only" // activos marcados chat_only=true (fase 1 del cron: más probable que tengan teléfono oculto)
  | "all"; // todos los activos, tengan o no teléfono (verify-phones?mode=all)

/**
 * Query de "qué anuncios activos necesitan revisión de teléfono", en un
 * solo lugar. Antes cada sitio la reimplementaba a mano; una de esas
 * copias (la fase "general" del backfill del cron) tenía un bug real de
 * supabase-js: `.is("chat_only", null).or("chat_only.eq.false")` genera un
 * AND de ambas condiciones (nunca satisfacible), no un OR, así que esa fase
 * procesaba 0 filas siempre. El fix vive acá, en modo
 * "missing_unclassified", para que no pueda reaparecer suelto en otro sitio.
 */
export function buildPhoneCandidateQuery(
  supabase: SupabaseLike,
  mode: PhoneCandidateMode,
  opts: { limit: number; onlyId?: string | null; columns?: string },
) {
  const columns = opts.columns ?? "id, source_url, phone";
  let query = supabase
    .from("particulares")
    .select(columns)
    .order("updated_at", { ascending: true })
    .limit(opts.limit);

  if (opts.onlyId) {
    return query.eq("id", opts.onlyId);
  }

  query = query.eq("is_active", true);
  if (mode === "missing") {
    query = query.is("phone", null);
  } else if (mode === "missing_unclassified") {
    query = query.is("phone", null).or("chat_only.is.null,chat_only.eq.false");
  } else if (mode === "chat_only") {
    query = query.eq("chat_only", true);
  }
  return query;
}
