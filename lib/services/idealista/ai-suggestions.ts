import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { PROPERTY_TYPE_MAP } from "@/lib/services/idealista/selectors";

// Sugerencias de IA a partir de "Fichas guardadas": cruza fichas publicadas
// sin leads recientes, fichas en cartera sin publicar y la demanda reciente
// (leads matcheados a fichas propias) para sugerir qué bajar, qué subir de
// precio y qué publicar en su lugar. Es puro análisis — nunca cambia el
// estado de ninguna ficha, eso lo decide el equipo a mano con los controles
// que ya existen. Dos presentaciones del mismo análisis comparten los datos
// (gatherSignals): la lista detallada de /admin/idealista y el saludo corto
// del Dashboard.
//
// Los números de cada sugerencia (leads, días) SIEMPRE vienen calculados
// aquí, nunca del texto de la IA — el modelo solo elige QUÉ ficha señalar
// (por su "key") y POR QUÉ en una frase corta. Así ninguna cifra mostrada
// puede ser una alucinación: si la IA cita una key que no existe, esa
// sugerencia concreta se descarta en vez de mostrarse con datos inventados.

export type SuggestionAction = "publicar" | "bajar_precio" | "despublicar";

export type SuggestionTarget = {
  listingId: string;
  label: string;
  typeLabel: string;
  operation: string | null;
  priceLabel: string;
  zone: string | null;
  leadsTotal: number;
  daysSinceLastLead: number | null;
};

export type ListingSuggestion = {
  action: SuggestionAction;
  reason: string;
  target: SuggestionTarget;
  replacement: SuggestionTarget | null;
};

export type SuggestionsResult =
  | { ok: true; summary: string; suggestions: ListingSuggestion[]; generatedAt: string }
  | { ok: false; error: string };

export type DashboardGreetingResult =
  | { ok: true; text: string; generatedAt: string }
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
  return l.reference_code || l.inspo_title || `ficha-${l.id.slice(0, 8)}`;
}

function typeLabel(l: ListingRow): string {
  return PROPERTY_TYPE_MAP[l.property_type ?? "flat"] ?? "inmueble";
}

const IDLE_STATE_LABEL: Record<string, string> = {
  draft: "borrador, nunca publicada",
  unpublished: "despublicada",
  failed: "con error al publicar",
};

type Signals = {
  publishedCount: number;
  idleCount: number;
  publishedLines: string;
  idleLines: string;
  demandLines: string;
  todayCount: number;
  byKey: Map<string, SuggestionTarget>;
};

async function gatherSignals(): Promise<{ ok: true; signals: Signals } | { ok: false; error: string }> {
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
  if (rows.length === 0) {
    return { ok: false, error: "No hay fichas guardadas todavía — nada que analizar." };
  }
  const published = rows.filter((r) => r.idealista_state === "published");
  const idle = rows.filter((r) => r.idealista_state !== "published");

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

  // Un solo lugar donde se calculan los números reales de cada ficha (leads,
  // días desde el último) — tanto el texto para el prompt como la resolución
  // de las keys que devuelva la IA leen de aquí, nunca de la respuesta del
  // modelo.
  const byKey = new Map<string, SuggestionTarget>();
  for (const l of rows) {
    const last = lastLeadAt.get(l.id) ?? null;
    byKey.set(label(l), {
      listingId: l.id,
      label: label(l),
      typeLabel: typeLabel(l),
      operation: l.operation,
      priceLabel: fmtPrice(l.operation, l.price, l.total_rental_price),
      zone: l.address_city,
      leadsTotal: leadCount.get(l.id) ?? 0,
      daysSinceLastLead: last ? daysAgo(last) : null,
    });
  }

  const publishedLines = published
    .map((l) => {
      const t = byKey.get(label(l))!;
      const sincePublished = daysAgo(l.published_at) ?? daysAgo(l.created_at);
      return `- key: ${t.label} | ${t.typeLabel} | ${t.operation === "sale" ? "venta" : "alquiler"} | ${t.priceLabel} | ${t.zone ?? "zona sin indicar"} | ${t.leadsTotal} lead(s) en los últimos ${LEAD_LOOKBACK_DAYS} días | último lead: ${t.daysSinceLastLead != null ? `hace ${t.daysSinceLastLead} días` : `nunca (publicada hace ${sincePublished ?? "?"} días)`}`;
    })
    .join("\n");

  const idleLines = idle
    .map((l) => {
      const t = byKey.get(label(l))!;
      return `- key: ${t.label} | ${t.typeLabel} | ${t.operation === "sale" ? "venta" : "alquiler"} | ${t.priceLabel} | ${t.zone ?? "zona sin indicar"} | estado: ${IDLE_STATE_LABEL[l.idealista_state ?? ""] ?? l.idealista_state}`;
    })
    .join("\n");

  const todayStr = new Date().toISOString().slice(0, 10);
  const demandCutoff = Date.now() - RECENT_DEMAND_DAYS * 24 * 60 * 60 * 1000;
  let todayCount = 0;
  const demandLines = leadRows
    .filter((l) => new Date(l.created_at).getTime() >= demandCutoff)
    .map((lead) => {
      const listingId = resolveListingId(lead);
      const listing = listingId ? rows.find((r) => r.id === listingId) : null;
      if (!listing) return null;
      const day = lead.created_at.slice(0, 10);
      if (day === todayStr) todayCount++;
      return `${day} | ${listing.operation === "sale" ? "venta" : "alquiler"} | ${fmtPrice(listing.operation, listing.price, listing.total_rental_price)} | ${listing.address_city ?? "zona sin indicar"}`;
    })
    .filter((x): x is string => !!x)
    .join("\n");

  return {
    ok: true,
    signals: {
      publishedCount: published.length,
      idleCount: idle.length,
      publishedLines,
      idleLines,
      demandLines,
      todayCount,
      byKey,
    },
  };
}

const VALID_ACTIONS = new Set<SuggestionAction>(["publicar", "bajar_precio", "despublicar"]);

export async function generateListingSuggestions(): Promise<SuggestionsResult> {
  const gathered = await gatherSignals();
  if (!gathered.ok) return gathered;
  const { publishedCount, idleCount, publishedLines, idleLines, demandLines, byKey } = gathered.signals;

  const system = `Eres un asesor comercial senior de una inmobiliaria premium en España, especializado en decidir qué mantener publicado en Idealista, qué retirar y qué publicar a continuación según la demanda real (leads recibidos).

Con los datos de abajo, identifica hasta 6 acciones CONCRETAS, cada una sobre UNA sola ficha:
- "bajar_precio" o "despublicar": una ficha PUBLICADA que lleva muchos días sin ningún lead (o muy pocos frente a otras). Si hay algo en cartera que podría publicarse en su lugar, indícalo en replacement_key.
- "publicar": una ficha EN CARTERA cuya operación/precio/zona coincide con la demanda reciente. Si sustituye a una ficha publicada de bajo rendimiento, indícalo en replacement_key.
- target_key es SIEMPRE la ficha sobre la que hay que actuar (la que se publicaría, bajaría de precio o despublicaría). Debe ser EXACTAMENTE uno de los valores que aparecen tras "key:" en las listas de abajo, copiado tal cual — nunca inventes uno.
- replacement_key es opcional: la otra ficha relacionada, si la sugerencia compara dos. Si no aplica, usa null.
- "reason" es una frase breve con el POR QUÉ (zona, precio, tipo de demanda) — NO repitas cifras de leads o días, esas ya se muestran aparte automáticamente.
- No inventes datos que no estén abajo. Si una categoría no tiene datos suficientes, no sugieras nada de esa categoría.

FICHAS PUBLICADAS ACTUALMENTE (${publishedCount}):
${publishedLines || "(ninguna)"}

FICHAS EN CARTERA SIN PUBLICAR — borrador, despublicadas o con error (${idleCount}):
${idleLines || "(ninguna)"}

LEADS RECIENTES MATCHEADOS A FICHAS PROPIAS, últimos ${RECENT_DEMAND_DAYS} días, uno por línea (fecha | operación | precio de la ficha a la que llegó | zona) — usa esto para ver qué se está pidiendo ahora:
${demandLines || "(sin leads en este periodo)"}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional:
{
  "summary": "<1-2 frases con el diagnóstico general>",
  "suggestions": [
    { "action": "bajar_precio" | "despublicar" | "publicar", "target_key": "<key exacta>", "replacement_key": "<key exacta o null>", "reason": "<frase breve>" }
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
    const parsed = JSON.parse(match[0]) as {
      summary?: string;
      suggestions?: Array<{ action?: string; target_key?: string | null; replacement_key?: string | null; reason?: string }>;
    };

    const suggestions: ListingSuggestion[] = [];
    for (const item of parsed.suggestions ?? []) {
      if (!item.action || !VALID_ACTIONS.has(item.action as SuggestionAction)) continue;
      const target = item.target_key ? byKey.get(item.target_key) : undefined;
      if (!target) continue; // key inventada, mal copiada o vacía — se descarta en vez de mostrar datos inventados
      const replacement = item.replacement_key ? byKey.get(item.replacement_key) ?? null : null;
      suggestions.push({
        action: item.action as SuggestionAction,
        reason: typeof item.reason === "string" ? item.reason : "",
        target,
        replacement,
      });
    }

    return { ok: true, summary: parsed.summary ?? "", suggestions, generatedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof AINotConfiguredError) return { ok: false, error: err.message };
    console.error("[idealista-ai-suggestions]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al generar sugerencias" };
  }
}

// Saludo corto para el Dashboard — mismo análisis que
// generateListingSuggestions() pero condensado en un único párrafo de
// prosa, sin viñetas. El texto NUNCA incluye el saludo ("Hola...") ni un
// nombre: quien llama antepone eso, porque el resultado se cachea de forma
// global (ver dashboard-greeting.ts) y no sabe quién lo va a leer.
export async function generateDashboardGreeting(): Promise<DashboardGreetingResult> {
  const gathered = await gatherSignals();
  if (!gathered.ok) return gathered;
  const { publishedCount, idleCount, publishedLines, idleLines, demandLines, todayCount } = gathered.signals;
  const todayStr = new Date().toISOString().slice(0, 10);

  const system = `Eres el asistente del panel de una inmobiliaria premium en España. Vas a escribir el cuerpo de un saludo breve para el Dashboard: UN SOLO PÁRRAFO corto (2-4 frases), en español, tono cercano y directo, sin viñetas, sin markdown, sin emoji.

NO escribas ningún saludo ni nombre (ni "Hola", ni "Buenos días") — eso lo añade la interfaz antes de tu texto. Empieza directo con la información.

Con los datos de abajo:
- Si hoy llegó algún lead, menciónalo con el número exacto (LEADS DE HOY, dato ya calculado, no lo recalcules). Si hoy no llegó ninguno, no lo menciones como algo negativo — pasa directamente a lo siguiente.
- Da COMO MÁXIMO una recomendación concreta y accionable sobre una ficha en concreto: la publicada que lleva más días sin ningún lead es la más urgente, sobre todo si hay algo en cartera que podría publicarse en su lugar. Cita su referencia.
- Si no hay ninguna señal clara (todo bien, o no hay datos suficientes), dilo en una frase breve y positiva — no inventes un problema que no existe.
- No inventes datos que no estén abajo.

HOY es ${todayStr}. LEADS DE HOY: ${todayCount}.

FICHAS PUBLICADAS ACTUALMENTE (${publishedCount}):
${publishedLines || "(ninguna)"}

FICHAS EN CARTERA SIN PUBLICAR (${idleCount}):
${idleLines || "(ninguna)"}

LEADS RECIENTES MATCHEADOS A FICHAS PROPIAS, últimos ${RECENT_DEMAND_DAYS} días (fecha | operación | precio | zona):
${demandLines || "(sin leads en este periodo)"}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional:
{ "text": "<el párrafo>" }`;

  try {
    const raw = await aiComplete({
      system,
      userText: "Escribe el párrafo respondiendo solo con el JSON solicitado.",
      maxTokens: 400,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Respuesta IA sin JSON: ${raw.slice(0, 200)}`);
    const parsed = JSON.parse(match[0]) as { text?: string };
    if (!parsed.text) throw new Error("Respuesta IA sin texto");
    return { ok: true, text: parsed.text, generatedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof AINotConfiguredError) return { ok: false, error: err.message };
    console.error("[idealista-dashboard-greeting]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al generar el saludo" };
  }
}
