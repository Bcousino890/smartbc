import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { parsePortalUrl } from "@/lib/portal-links/portals";
import { syncDiscardedLink } from "@/lib/portal-links/discard-sync";
import { addLinksToActiveShortlist } from "@/lib/client-shortlist/auto-add";
import type { PortalLinkInput } from "@/lib/portal-links/types";

// ============================================================================
// Volver a mandar un anuncio que el cliente ya tenía (2026-10-09).
//
// Antes, marcar en la extensión un piso que ya estaba en la ficha del cliente
// no hacía nada: el panel lo bloqueaba con un aviso pequeño y, aunque llegara
// al servidor, el alta lo saltaba en silencio (UNIQUE client_id + url_key). Un
// piso descartado hace semanas no podía volver a proponerse, y parecía un
// error ("no me deja seleccionarlo").
//
// Ahora, al reenviar un anuncio que YA existe en la ficha:
//   · Descartado → vuelve a "Por llamar", se reactiva en la selección del
//     cliente y en el borrador del book, y queda anotado en su hilo.
//   · Con una nota nueva → se añade al hilo (antes se perdía).
//   · Siempre → se asegura de que esté en la selección privada que el cliente
//     tiene abierta.
// Los anuncios NUEVOS (los que acaba de insertar insertPortalLinks) no se
// tocan: ya traen su nota y entran solos en la selección.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReviveResult = { reactivated: number; existing: number };

export async function reviveExistingLinks(args: {
  clientId: string;
  userId: string | null;
  links: PortalLinkInput[];
  /** Ids de los enlaces recién creados por esta misma llamada (se excluyen). */
  insertedIds?: string[];
}): Promise<ReviveResult> {
  const { clientId, userId, links } = args;
  const db = createAdminClient() as any;
  const none: ReviveResult = { reactivated: 0, existing: 0 };

  try {
    // url_key → nota que traía el envío (si la había).
    const noteByKey = new Map<string, string | null>();
    for (const l of links) {
      const parsed = parsePortalUrl(l.url);
      if (!parsed) continue;
      const note = typeof l.notes === "string" && l.notes.trim() ? l.notes.trim() : null;
      if (!noteByKey.has(parsed.urlKey) || note) noteByKey.set(parsed.urlKey, note);
    }
    if (noteByKey.size === 0) return none;

    const { data } = await db
      .from("client_portal_links")
      .select("id, status, property_id, url_key")
      .eq("client_id", clientId)
      .in("url_key", [...noteByKey.keys()]);
    const fresh = new Set(args.insertedIds ?? []);
    const rows = ((data ?? []) as Array<{
      id: string;
      status: string;
      property_id: string | null;
      url_key: string;
    }>).filter((r) => !fresh.has(r.id));
    if (rows.length === 0) return none;

    let reactivated = 0;
    for (const row of rows) {
      const note = noteByKey.get(row.url_key) ?? null;

      if (row.status === "discarded") {
        // Con ficha vuelve como "con ficha"; sin ella, "por llamar".
        const status = row.property_id ? "converted" : "pending";
        const { error } = await db
          .from("client_portal_links")
          .update({ status })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
        await db.from("client_portal_link_notes").insert({
          link_id: row.id,
          author_id: userId,
          kind: "status",
          body: "Vuelto a marcar desde la extensión: reactivado (estaba descartado).",
          status_after: status,
        });
        await syncDiscardedLink({
          clientId,
          userId,
          linkId: row.id,
          propertyId: row.property_id,
          discarded: false,
        });
        reactivated++;
      }

      if (note) {
        await db.from("client_portal_link_notes").insert({
          link_id: row.id,
          author_id: userId,
          kind: "note",
          body: note.slice(0, 2000),
        });
      }
    }

    await addLinksToActiveShortlist(
      clientId,
      rows.map((r) => r.id),
    );
    return { reactivated, existing: rows.length };
  } catch (err) {
    console.error(
      "[portal-links] no se pudo reactivar/anotar enlaces ya existentes",
      clientId,
      err instanceof Error ? err.message : err,
    );
    return none;
  }
}
