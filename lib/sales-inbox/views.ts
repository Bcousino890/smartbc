// ============================================================================
// SALES INBOX · las tres vistas (puro)
//
// A · Tarjetas, B · Por inmueble y C · Prioridades enseñan las MISMAS
// solicitudes con los mismos filtros de servidor; solo cambia cómo se ordenan
// y agrupan. Aquí viven las dos reglas que lo deciden, sin consultas, para
// poder probarlas: a qué grupo va una solicitud (B) y a qué columna (C).
// ============================================================================

import { deriveFollowUpState, needsAttention } from "./derive";
import type { CommercialState, InboxSort, InboxView, LeadListItem, LeadOperation, PriorityColumn } from "./types";
import { isInboxSort } from "./types";

/**
 * B · Por inmueble. Un grupo = un anuncio (o ficha) EXACTO + una operación.
 *
 *   · Sin vínculo exacto no hay grupo propio: todas van a «Por verificar»
 *     (`v:`). Agrupar por título o dirección es justo lo que juntaba consultas
 *     de pisos distintos de la misma calle.
 *   · La ficha propia manda sobre el anuncio: las republicaciones de un mismo
 *     inmueble caen en el mismo grupo.
 *   · Venta y alquiler del mismo inmueble son dos grupos.
 */
export function groupKeyFor(lead: {
  linkStatus: LeadListItem["linkStatus"];
  matchedPropertyId: string | null;
  matchedListingId: string | null;
  operation: LeadOperation | null;
}): string {
  if (lead.linkStatus !== "exact") return "v:";
  const subject = lead.matchedPropertyId
    ? `p:${lead.matchedPropertyId}`
    : lead.matchedListingId
      ? `l:${lead.matchedListingId}`
      : null;
  if (!subject) return "v:";
  return `${subject}|${lead.operation ?? "unknown"}`;
}

/**
 * C · Prioridades. Cada solicitud abierta va a UNA columna, por su próximo
 * paso:
 *
 *   today      lo que la bandeja ya considera «Necesita atención» (respuesta
 *              sin contestar, tarea vencida o de hoy, primer contacto
 *              pendiente…). Misma regla que la vista Atención: no hay dos
 *              definiciones.
 *   scheduled  tiene una tarea con fecha futura.
 *   awaiting   ya se le escribió o llamó (o contestó y se le respondió) y no
 *              hay tarea: la pelota está en su tejado.
 *
 * Las cerradas (cliente vinculado o descartadas) y las nuevas fuera de la
 * ventana de frescura sin tarea devuelven `null`: no tienen próximo paso y el
 * tablero lo dice con un contador, sin inventarles uno. Arrastrar una tarjeta
 * NO cambia nada: los estados cambian con acciones reales.
 */
export function priorityColumn(lead: LeadListItem, now: Date = new Date()): PriorityColumn | null {
  if (lead.state === "converted" || lead.state === "discarded") return null;
  if (needsAttention(lead.reasons)) return "today";
  if (deriveFollowUpState(lead.nextActionAt, now) === "later") return "scheduled";
  if (lead.state === "contacted" || lead.state === "engaged") return "awaiting";
  return null;
}

// ─── Ficha y orden ───────────────────────────────────────────────────────────

/**
 * Acciones de trabajo de la ficha. NO dependen del estado comercial:
 *   · «Registrar contacto» solo exige poder editar. Una solicitud con cliente
 *     vinculado cuenta como «converted» y se sigue trabajando; una descartada
 *     se puede volver a contactar.
 *   · Zinto se ofrece siempre que haya teléfono: el permiso de mensajes lo
 *     comprueba el servidor al abrir la conversación.
 */
export function fichaActions(
  lead: { phone: string | null; state?: CommercialState },
  canEdit: boolean,
): { registerContact: boolean; openZinto: boolean } {
  return { registerContact: canEdit, openZinto: !!lead.phone?.trim() };
}

/**
 * Orden efectivo de la bandeja: el elegido si es válido; si no, el de la
 * vista (la cola de atención por prioridad; el resto, lo más reciente arriba).
 */
export function effectiveSort(param: string | null | undefined, view: InboxView): InboxSort {
  if (isInboxSort(param)) return param;
  return view === "needs-attention" ? "attention" : "newest";
}

/** Texto «Primero …» del orden efectivo. */
export function orderLabelKey(sort: InboxSort): string {
  return `inbox.order.${sort}`;
}
