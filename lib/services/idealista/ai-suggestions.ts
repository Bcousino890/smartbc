import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { PROPERTY_TYPE_MAP } from "@/lib/services/idealista/selectors";

// Sugerencias de IA para "Fichas guardadas" (/admin/idealista): cruza fichas
// publicadas sin leads recientes, fichas en cartera sin publicar y la
// demanda reciente (leads matcheados a fichas propias) para sugerir qué
// bajar, qué subir de precio y qué publicar en su lugar. Es puro análisis —
// nunca cambia el estado de ninguna ficha, eso lo decide el equipo a mano
// con los controles que ya existen.

export type ListingSuggestion = {
  priority: "alta" | "media" | "baja";
  text: string;
  reference_code?: string | null;
};

export type SuggestionsResult =
  | { ok: true; summary: string; suggestions: ListingSuggestion[]; generatedAt: string }
  | { ok: false; error: string };

const LEAD_LOOKBACK_DAYS = 30; // ventana para "último lead" / total de leads
const RECENT_DEMAND_DAYS = 14; // ventana para "qué se está pidiendo ahora"
const MAX_LEAD_ROWS = 250; // cota de coste/tokens — de sobra para el volumen real
const MAX_LISTING_ROWS = 300;

type ListingRow = {
  id: string;
  reference_code: string | null;
  inspo_title: string | null;
  property_type: string | null;
  operation: string | null;
  price: number | null;
  total_rental_price: number | null;
  address_city: string | null;
  idealista_state: string | null;
  published_at: string | null;
  created_at: string;
  property_id: string | null;
};

type LeadRow = {
  matched_property_id: string | null;
  matched_listing_id: string | null;
  created_at: string;
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function fmtPrice(operation: string | null, price: number | null, rentalPrice: number | null): string {
  const p = operation === "rent" ? rentalPrice : price;
  if (!p) return "sin precio";
  const formatted = new Intl.NumberFormat("es-ES").format(p);
  return operation === "rent" ? `${formatted} €/mes` : `${formatted} €`;
}

function label(l: ListingRow): string {
  return l.reference_code || l.inspo_title || `ficha ${l.id.slice(0, 8)}`;
}

function typeLabel(l: ListingRow): string {
  return PROPERTY_TYPE_MAP[l.property_type ?? "flat"] ?? "inmueble";
}

const IDLE_STATE_LABEL: Record<string, string> = {
  draft: "borrador, nunca publicada",
  unpublished: "despublicada",
  failed: "con error al publicar",
};

export async function generateListingSuggestions(): Promise<SuggestionsResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: listings, error: listingsErr } = await db
    .from("idealista_listings")
    .select(
      "id, reference_code, inspo_title, property_type, operation, price, total_rental_price, address_city, idealista_state, published_at, created_at, property_id",
    )
    .is("archived_at", null)
    .in("idealista_state", ["published", "draft", "unpublished", "failed"])
    .order("updated_at", { ascending: false })
    .limit(MAX_LISTING_ROWS);
  if (listingsErr) return { ok: false, error: listingsErr.message };

  const rows = (listings ?? []) as ListingRow[];
  const published = rows.filter((r) => r.idealista_state === "published");
  const idle = rows.filter((r) => r.idealista_state !== "published");

  if (rows.length === 0) {
    return { ok: false, error: "No hay fichas guardadas todavía — nada que analizar." };
  }

  const leadsSince = new Date(Date.now() - LEAD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: leads, error: leadsErr } = await db
    .from("idealista_leads")
    .select("matched_property_id, matched_listing_id, created_at")
    .gte("created_at", leadsSince)
    .or("matched_property_id.not.is.null,matched_listing_id.not.is.null")
    .order("created_at", { ascending: false })
    .limit(MAX_LEAD_ROWS);
  if (leadsErr) return { ok: false, error: leadsErr.message };

  const leadRows = (leads ?? []) as LeadRow[];

  // Los leads del inbox matchean por ficha directa (matched_listing_id, el
  // caso normal: la mayoría de fichas de este negocio son "inspo" sin fila en
  // properties) o por propiedad (matched_property_id, cuando la ficha sí está
  // linkeada) — se resuelve todo a un idealista_listings.id para no separar
  // el análisis en dos mundos.
  const listingIdByPropertyId = new Map(
    rows.filter((r) => r.property_id).map((r) => [r.property_id as string, r.id]),
  );
  function resolveListingId(lead: LeadRow): string | null {
    return lead.matched_listing_id || (lead.matched_property_id ? listingIdByPropertyId.get(lead.matched_property_id) ?? null : null);
  }

  const lastLeadAt = new Map<string, string>();
  const leadCount = new Map<string, number>();
  for (const lead of leadRows) {
    const listingId = resolveListingId(lead);
    if (!listingId) continue;
    const prev = lastLeadAt.get(listingId);
    if (!prev || lead.created_at > prev) lastLeadAt.set(listingId, lead.created_at);
    leadCount.set(listingId, (leadCount.get(listingId) ?? 0) + 1);
  }

  const publishedLines = published
    .map((l) => {
      const last = lastLeadAt.get(l.id) ?? null;
      const since = last ? daysAgo(last) : daysAgo(l.published_at) ?? daysAgo(l.created_at);
      const total = leadCount.get(l.id) ?? 0;
      return `- ${label(l)} | ${typeLabel(l)} | ${l.operation === "sale" ? "venta" : "alquiler"} | ${fmtPrice(l.operation, l.price, l.total_rental_price)} | ${l.address_city ?? "zona sin indicar"} | ${total} lead(s) en los últimos ${LEAD_LOOKBACK_DAYS} días | último lead: ${last ? `hace ${since} días` : `nunca (publicada hace ${since ?? "?"} días)`}`;
    })
    .join("\n");

  const idleLines = idle
    .map(
      (l) =>
        `- ${label(l)} | ${typeLabel(l)} | ${l.operation === "sale" ? "venta" : "alquiler"} | ${fmtPrice(l.operation, l.price, l.total_rental_price)} | ${l.address_city ?? "zona sin indicar"} | estado: ${IDLE_STATE_LABEL[l.idealista_state ?? ""] ?? l.idealista_state}`,
    )
    .join("\n");

  const demandCutoff = Date.now() - RECENT_DEMAND_DAYS * 24 * 60 * 60 * 1000;
  const demandLines = leadRows
    .filter((l) => new Date(l.created_at).getTime() >= demandCutoff)
    .map((lead) => {
      const listingId = resolveListingId(lead);
      const listing = listingId ? rows.find((r) => r.id === listingId) : null;
      if (!listing) return null;
      const day = lead.created_at.slice(0, 10);
      return `${day} | ${listing.operation === "sale" ? "venta" : "alquiler"} | ${fmtPrice(listing.operation, listing.price, listing.total_rental_price)} | ${listing.address_city ?? "zona sin indicar"}`;
    })
    .filter((x): x is string => !!x)
    .join("\n");

  const system = `Eres un asesor comercial senior de una inmobiliaria premium en España, especializado en decidir qué mantener publicado en Idealista, qué retirar y qué publicar a continuación según la demanda real (leads recibidos).

Con los datos de abajo, da sugerencias CONCRETAS y ACCIONABLES en español, con el criterio de un buen director comercial:
- Una ficha PUBLICADA que lleva muchos días sin ningún lead es candidata a bajar de precio o despublicar. Si hay algo en cartera (borrador/despublicada/con error) que encaje con la demanda reciente, sugiere publicarla en su lugar.
- Si una ficha en cartera coincide en operación/precio/zona con lo que más demanda tuvo recientemente, sugiere publicarla.
- Si es útil, resume cuántos leads llegaron recientemente por operación (venta/alquiler) y en qué rango de precio, para dar contexto de mercado.
- No inventes datos que no estén abajo. Si una categoría no tiene datos (p. ej. no hay nada en cartera), simplemente no la menciones.
- Máximo 6 sugerencias, ordenadas por prioridad. Cada una en 1-2 frases, como un mensaje directo al equipo comercial, citando siempre la referencia de la ficha cuando exista.

FICHAS PUBLICADAS ACTUALMENTE (${published.length}):
${publishedLines || "(ninguna)"}

FICHAS EN CARTERA SIN PUBLICAR — borrador, despublicadas o con error (${idle.length}):
${idleLines || "(ninguna)"}

LEADS RECIENTES MATCHEADOS A FICHAS PROPIAS, últimos ${RECENT_DEMAND_DAYS} días, uno por línea (fecha | operación | precio de la ficha a la que llegó | zona) — usa esto para ver qué se está pidiendo ahora:
${demandLines || "(sin leads en este periodo)"}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional:
{
  "summary": "<1-2 frases con el diagnóstico general>",
  "suggestions": [
    { "priority": "alta" | "media" | "baja", "text": "<sugerencia concreta en español>", "reference_code": "<referencia de la ficha si aplica, si no null>" }
  ]
}`;

  try {
    const raw = await aiComplete({
      system,
      userText: "Analiza los datos anteriores y da tus sugerencias respondiendo solo con el JSON solicitado.",
      maxTokens: 1500,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Respuesta IA sin JSON: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { summary?: string; suggestions?: ListingSuggestion[] };
    return {
      ok: true,
      summary: parsed.summary ?? "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AINotConfiguredError) return { ok: false, error: err.message };
    console.error("[idealista-ai-suggestions]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al generar sugerencias" };
  }
}
