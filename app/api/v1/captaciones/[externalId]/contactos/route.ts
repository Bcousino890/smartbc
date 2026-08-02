import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { ContactSchema } from "@/lib/api/v1/captaciones/schema";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { syncCaptacionContacts } from "@/lib/captaciones/write/sync-contacts";

/**
 * /api/v1/captaciones/{external_id}/contactos
 *
 * Pestaña «Info» de la ficha: dueño, cónyuge, familiares y otros contactos, con
 * sus teléfonos adicionales, WhatsApp y RUT. El POST es un upsert por
 * `external_id` (o por teléfono normalizado si el proveedor no lleva ids), así
 * que reenviar la lista corrige en vez de duplicar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("captacion_contacts")
      .select("id, external_id, contact_type, contact_name, phone, email, has_whatsapp, relationship, rut, photo_url, extra_phones, api_client_id, created_at, updated_at")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: true });
    // `source` distingue lo que añadió el equipo en el panel de lo que envió
    // una integración; el id interno del cliente API no sale de aquí.
    const rows = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ api_client_id, ...rest }: any) => ({ ...rest, source: api_client_id ? "api" : "panel" })
    );
    ctx.counters.total = rows.length;
    return { data: rows };
  },
});

const ContactsPayloadSchema = z
  .object({
    contacts: z.array(ContactSchema).max(20),
    /**
     * append (por defecto) solo da de alta y actualiza. sync además retira los
     * contactos que esta integración creó antes y ya no envía — nunca los que
     * dio de alta el equipo desde el panel.
     */
    mode: z.enum(["sync", "append"]).nullable().optional(),
  })
  .strict()
  .refine((v) => v.contacts.length > 0 || v.mode === "sync", {
    message: "La lista solo puede ir vacía con mode=sync (retirar todos los míos)",
    path: ["contacts"],
  });

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: ContactsPayloadSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await syncCaptacionContacts(db, captacion.id, input.contacts, {
      dryRun: ctx.dryRun,
      mode: input.mode ?? "append",
      apiClientId: ctx.client.id,
    });

    ctx.counters.total = input.contacts.length;
    ctx.counters.created = result.created;
    ctx.counters.updated = result.updated;
    ctx.counters.unchanged = result.unchanged;
    ctx.counters.failed = result.errors.length;

    return {
      data: {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        removed: result.removed,
        photos_queued: result.photosQueued,
        errors: result.errors,
      },
      status: result.created > 0 && !ctx.dryRun ? 201 : 200,
    };
  },
});
