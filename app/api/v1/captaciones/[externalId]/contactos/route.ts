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
      .select("id, external_id, contact_type, contact_name, phone, email, has_whatsapp, relationship, rut, photo_url, extra_phones, created_at, updated_at")
      .eq("captacion_id", captacion.id)
      .order("created_at", { ascending: true });
    ctx.counters.total = (data ?? []).length;
    return { data: data ?? [] };
  },
});

const ContactsPayloadSchema = z
  .object({ contacts: z.array(ContactSchema).min(1).max(20) })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: ContactsPayloadSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await syncCaptacionContacts(db, captacion.id, input.contacts, {
      dryRun: ctx.dryRun,
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
        errors: result.errors,
      },
      status: result.created > 0 && !ctx.dryRun ? 201 : 200,
    };
  },
});
