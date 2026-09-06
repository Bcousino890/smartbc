// ============================================================================
// SALES INBOX · derivaciones puras
//
// Estado comercial y motivos de atención. Nada de esto se guarda: se calcula
// cada vez a partir de hechos comprobables, y por eso no puede desincronizarse
// del trabajo real.
//
// `now` entra por parámetro para que las pruebas no dependan del reloj.
// ============================================================================

import {
  ASSIGNED_IDLE_DAYS,
  FRESH_WINDOW_DAYS,
  REASON_PRIORITY,
  SALE_PRICE_FLOOR,
  type AttentionReason,
  type CommercialState,
  type LeadOperation,
  type WhatsAppFacts,
} from "./types";

const DAY = 86_400_000;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  const t = ms(iso);
  return t === null ? null : (now.getTime() - t) / DAY;
}

// ─── Lo que entra ────────────────────────────────────────────────────────────

/**
 * El retrato de un lead. Se declara campo a campo (en vez de aceptar la fila
 * entera) para dejar escrito qué se mira de verdad: si mañana cambia una
 * consulta, el compilador dice qué señal se queda sin dato.
 */
export type LeadFacts = {
  createdAt: string;
  /** Estado heredado. Solo se lee para respetar un descarte explícito. */
  legacyStatus: string | null;
  assignedTo: string | null;
  clientId: string | null;
  nextActionAt: string | null;
  matchedPropertyId: string | null;
  /** Emparejado a un anuncio de Idealista sin ficha propia (las "inspo"). */
  matchedListingId: string | null;
  name: string | null;
  phone: string | null;
  whatsapp: WhatsAppFacts;
  /** Actividad registrada a mano, de más reciente a más antigua. */
  activity: Array<{ kind: string; outcome: string | null; createdAt: string }>;
  /** Otro lead con el mismo teléfono. */
  duplicatePhone: boolean;
  /** Hay un cliente que parece la misma persona y el lead no está vinculado. */
  clientCandidate: boolean;
};

// ─── Estado comercial ────────────────────────────────────────────────────────

/**
 * En orden de fuerza de la evidencia:
 *
 *   CONVERTED  hay vínculo con un cliente. Es un hecho consumado y gana a todo:
 *              descartar después no deshace la conversión.
 *   DISCARDED  decisión explícita del agente.
 *   ENGAGED    él contestó: mensaje entrante, o una llamada 'answered'.
 *   CONTACTED  salimos a buscarle: WhatsApp enviado, o llamada/email/WhatsApp
 *              registrados a mano.
 *   NEW        nada de lo anterior.
 *
 * ⚠️ Abrir el chat NO es contactar. Nueve leads tienen conversación abierta y
 * cero mensajes: eso es una intención a medias, y sale como motivo de atención
 * (`chat_opened_no_message`), no como contacto.
 */
export function deriveCommercialState(f: LeadFacts): CommercialState {
  if (f.clientId) return "converted";
  if (f.legacyStatus === "descartado") return "discarded";

  const answeredCall = f.activity.some(
    (a) => a.kind === "call" && a.outcome === "answered",
  );
  if (f.whatsapp.inbound > 0 || answeredCall) return "engaged";

  const loggedTouch = f.activity.some(
    (a) => a.kind === "call" || a.kind === "whatsapp" || a.kind === "email",
  );
  if (f.whatsapp.outbound > 0 || loggedTouch) return "contacted";

  return "new";
}

/** Cuándo se le contactó por primera vez, si consta. */
export function deriveFirstContactAt(f: LeadFacts): string | null {
  const candidates = [f.whatsapp.firstOutboundAt];
  for (const a of f.activity) {
    if (a.kind === "call" || a.kind === "whatsapp" || a.kind === "email") {
      candidates.push(a.createdAt);
    }
  }
  let best: string | null = null;
  for (const c of candidates) {
    const t = ms(c);
    if (t === null) continue;
    if (!best || t < (ms(best) as number)) best = c;
  }
  return best;
}

/** La señal de vida más reciente, venga de donde venga. */
export function deriveLastActivityAt(f: LeadFacts): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  const push = (iso: string | null | undefined) => {
    const t = ms(iso);
    if (t === null) return;
    if (best === null || t > best) {
      best = t;
      bestIso = iso as string;
    }
  };
  push(f.whatsapp.lastMessageAt);
  for (const a of f.activity) push(a.createdAt);
  return bestIso;
}

// ─── Atención ────────────────────────────────────────────────────────────────

/**
 * Por qué este lead pide atención hoy. La regla completa está aquí y se lee
 * de arriba abajo: sin puntuaciones ocultas y sin IA.
 */
export function deriveAttention(
  f: LeadFacts,
  now: Date = new Date(),
): AttentionReason[] {
  const out: AttentionReason[] = [];
  const state = deriveCommercialState(f);

  // Un lead cerrado no reclama nada. Las pistas de calidad (P3) tampoco
  // aplican: ya no se va a trabajar.
  if (state === "converted" || state === "discarded") return out;

  // ── P1 · hay alguien esperando ──
  if (f.whatsapp.awaitingReply) out.push("reply_unanswered");

  const dueIn = daysSince(f.nextActionAt, now);
  if (dueIn !== null && dueIn > 0) out.push("follow_up_overdue");

  // ── P2 · trabajo propio con fecha ──
  if (dueIn !== null && dueIn <= 0 && dueIn > -1) out.push("follow_up_due_today");

  if (f.whatsapp.conversationId && f.whatsapp.outbound === 0) {
    out.push("chat_opened_no_message");
  }

  const age = daysSince(f.createdAt, now) ?? 0;
  if (state === "new" && age <= FRESH_WINDOW_DAYS && !f.whatsapp.conversationId) {
    // Recién llegado y nadie ha salido a por él. Pasada la ventana deja de
    // ser "atención" y pasa a ser cola de fondo: perseguir un lead de hace
    // dos meses no es lo que toca hoy.
    out.push("fresh_uncontacted");
  }

  if (f.assignedTo && state === "new") {
    const last = deriveLastActivityAt(f);
    const idle = daysSince(last ?? f.createdAt, now) ?? 0;
    if (idle >= ASSIGNED_IDLE_DAYS) out.push("assigned_untouched");
  }

  // ── P3 · pistas ──
  // Emparejado a un anuncio de Idealista cuenta como emparejado: la mayoría de
  // esta cartera son fichas "inspo" sin fila en `properties`, y marcarlas como
  // huérfanas llenaba la pista de ruido hasta volverla inútil.
  if (!f.matchedPropertyId && !f.matchedListingId) out.push("unmatched_property");
  if (f.duplicatePhone) out.push("possible_duplicate");
  if (!f.name?.trim() || !f.phone?.trim()) out.push("missing_contact");
  if (f.clientCandidate) out.push("client_exists_unlinked");

  return out;
}

/** ¿Entra en la cola de "Necesitan atención"? Solo P1 y P2. */
export function needsAttention(reasons: AttentionReason[]): boolean {
  return reasons.some((r) => REASON_PRIORITY[r] <= 2);
}

/**
 * Orden de la cola. Primero la prioridad más alta que tenga el lead; a igual
 * prioridad, el más viejo delante — quien lleva más esperando va antes.
 */
export function attentionScore(
  reasons: AttentionReason[],
  createdAt: string,
  now: Date = new Date(),
): number {
  if (reasons.length === 0) return 0;
  const top = Math.min(...reasons.map((r) => REASON_PRIORITY[r]));
  const base = (4 - top) * 1_000_000; // P1 → 3M, P2 → 2M, P3 → 1M
  const age = Math.min(daysSince(createdAt, now) ?? 0, 999);
  // Un empujón extra por cada motivo adicional del mismo nivel.
  const extra = reasons.filter((r) => REASON_PRIORITY[r] === top).length * 1_000;
  return base + extra + Math.round(age * 10);
}

// ─── Venta o alquiler ────────────────────────────────────────────────────────
//
// ⚠️ Esta regla, como la del estado comercial, está escrita DOS veces: aquí y
// en `lead_price_operation()` (migración 0155), porque la bandeja necesita
// poder FILTRAR en SQL sin traerse los leads al navegador. `npm run
// test:sales-inbox` compara las dos lead a lead contra producción. Si tocas
// una, toca la otra y ejecuta el test.
//
// Asimetría deliberada: aquí solo vive la rama del PRECIO. Las otras dos
// (ficha de Idealista, ficha propia) necesitan columnas de `idealista_listings`
// y `properties` que la lista no baja, y replicarlas obligaría a un N+1 por
// fila. Por eso la vista expone `operation_source`: el test solo exige paridad
// donde el TypeScript puede opinar.

/**
 * Venta o alquiler a partir del precio crudo de una tarjeta de Idealista.
 *
 * El texto llega tal cual lo pinta el portal —`"2.400 €/mes"`, `"450.000 €"`—
 * porque la extensión lo captura con un regex acotado
 * (`chrome-extension/inbox-leads.js`), no como frase libre.
 *
 * Solo contesta cuando el precio es **inequívoco**:
 *
 *   · lleva "/mes"                  → alquiler (ninguna ficha de venta lo lleva)
 *   · importe ≥ SALE_PRICE_FLOOR    → venta    (ningún alquiler de esta cartera
 *                                               llega ahí)
 *
 * En medio **calla** y devuelve `null`, para que decida la siguiente señal.
 * Adivinar aquí contamina un filtro que se usa todos los días.
 */
export function deriveOperationFromPrice(
  price: string | null | undefined,
): "sale" | "rent" | null {
  if (!price) return null;
  const text = price.trim();
  if (!text) return null;

  if (/\/\s*mes/i.test(text)) return "rent";
  if (!text.includes("€")) return null;

  // "1.250,50 €" → 1250, no 125050: se corta en el € (nunca se mira lo que
  // venga detrás) y se tira la parte decimal antes de quitar los puntos de
  // millar.
  const digits = text.split("€")[0].split(",")[0].replace(/[^0-9]/g, "");
  if (!digits) return null;

  return Number(digits) >= SALE_PRICE_FLOOR ? "sale" : null;
}

/**
 * La operación de un lead a partir de TODAS las tarjetas que consultó.
 *
 * Un hilo puede preguntar por varios pisos (`idealista_leads.properties`). Si
 * las tarjetas que sí opinan no se ponen de acuerdo, el resultado es `mixed`:
 * es lo único cierto, y entra en los dos filtros.
 *
 * Con una sola tarjeta —el caso normal— se cae a `primaryPrice`, que es el
 * precio principal ya desnormalizado en la fila.
 */
export function deriveOperationFromCards(
  cards: ReadonlyArray<{ price?: string | null }> | null | undefined,
  primaryPrice: string | null | undefined,
): LeadOperation | null {
  if (Array.isArray(cards) && cards.length > 1) {
    const opinions = new Set<"sale" | "rent">();
    for (const c of cards) {
      const op = deriveOperationFromPrice(c?.price);
      if (op) opinions.add(op);
    }
    if (opinions.size > 1) return "mixed";
    if (opinions.size === 1) return [...opinions][0];
  }
  return deriveOperationFromPrice(primaryPrice);
}

// ─── Vistas ──────────────────────────────────────────────────────────────────

/** Estado del seguimiento de un lead respecto a hoy. */
export type FollowUpState = "overdue" | "today" | "later" | "none";

export function deriveFollowUpState(
  nextActionAt: string | null,
  now: Date = new Date(),
): FollowUpState {
  const d = daysSince(nextActionAt, now);
  if (d === null) return "none";
  if (d > 0) return "overdue";
  if (d > -1) return "today";
  return "later";
}
