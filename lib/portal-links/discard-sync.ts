import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { syncDraftBook } from "@/lib/viewing-collections/auto-book";

// ============================================================================
// Descartar un anuncio lo saca de lo que VE el cliente, sin borrar nada
// (2026-10-08).
//
// Antes "Descartado" solo cambiaba la etiqueta del panel: el piso seguía en la
// selección privada que el cliente estaba ordenando y en el book. Ahora se
// marca, y el registro se queda entero en el CRM:
//
// · Selección del cliente: pasa a "discarded" (así el book automático no lo
//   vuelve a meter en el siguiente alta).
// · Book (borrador o publicado): la parada se cancela y se oculta al cliente.
//   No se borra: guarda su historial de visita.
// · Selección privada: no se toca la fila. El cliente deja de verla porque la
//   lectura pública filtra los anuncios descartados
//   (lib/db/queries/client-shortlists.ts → hideTeamDiscarded). Su decisión y
//   su nota, si las había, siguen en el CRM.
//
// Quitar el descarte lo devuelve: la selección vuelve a "selected", las
// paradas de BORRADOR vuelven a "pendiente" y visibles, y la selección privada
// lo enseña otra vez sola. En un book PUBLICADO la parada se queda cancelada:
// reactivar una visita que el cliente ya vio desaparecer lo decide el agente.
//
// Best-effort, como el book automático: si algo falla se registra, pero el
// cambio de estado del anuncio ya está hecho y no se deshace.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function syncDiscardedLink(args: {
  clientId: string;
  userId: string;
  linkId: string;
  propertyId: string | null;
  discarded: boolean;
}): Promise<void> {
  const { clientId, userId, linkId, propertyId, discarded } = args;
  // Un anuncio sin ficha no está en el book ni en la selección del cliente:
  // en la selección privada lo oculta la lectura pública, sin nada que hacer.
  if (!propertyId) return;
  const db = createAdminClient() as any;

  try {
    const { data: selection } = await db
      .from("client_property_selections")
      .update({
        status: discarded ? "discarded" : "selected",
        updated_at: new Date().toISOString(),
      })
      .eq("client_id", clientId)
      .eq("property_id", propertyId)
      .select("id")
      .maybeSingle();
    if (!selection) return;

    const { data: stops } = await db
      .from("viewing_stops")
      .select("id, confirmation_status, itinerary:viewing_itineraries!inner(status)")
      .eq("selection_id", selection.id);

    for (const stop of (stops ?? []) as any[]) {
      const itineraryStatus = stop.itinerary?.status;
      if (discarded) {
        if (itineraryStatus !== "draft" && itineraryStatus !== "published") continue;
        // address_visibility vuelve a area_only en el mismo UPDATE: el CHECK
        // vs_exact_address_requires_confirmation lo exige al cancelar.
        await db
          .from("viewing_stops")
          .update({
            confirmation_status: "cancelled",
            address_visibility: "area_only",
            hidden_from_client: true,
          })
          .eq("id", stop.id);
      } else if (itineraryStatus === "draft" && stop.confirmation_status === "cancelled") {
        await db
          .from("viewing_stops")
          .update({ confirmation_status: "pending", hidden_from_client: false })
          .eq("id", stop.id);
      }
    }

    // Si nunca tuvo parada (se descartó antes de llegar al book), entra ahora.
    if (!discarded) await syncDraftBook(clientId, userId);
  } catch (err) {
    console.error(
      "[portal-links] no se pudo sincronizar el descarte con el book",
      linkId,
      err instanceof Error ? err.message : err,
    );
  }
}
