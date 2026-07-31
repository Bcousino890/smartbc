import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { PhotoCollectionSchema } from "@/lib/api/v1/captaciones/schema";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { syncCaptacionPhotos } from "@/lib/captaciones/write/sync-photos";

/**
 * /api/v1/captaciones/{external_id}/fotos
 *
 * Pestaña «Fotos». Las imágenes se descargan de la URL del proveedor y se
 * re-alojan en el bucket, porque las URLs de los portales caducan y la galería
 * se quedaría en blanco.
 *
 * A diferencia del POST de la ficha, aquí la descarga se hace EN PRIMER PLANO:
 * quien llama a este endpoint concreto quiere saber cuántas fotos entraron de
 * verdad. `maxDuration` está subido en consecuencia.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withApiRoute({
  scope: "captaciones:read",
  handler: async (_input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("captacion_photos")
      .select("id, external_id, url, source_url, position, created_at")
      .eq("captacion_id", captacion.id)
      .order("position", { ascending: true });
    ctx.counters.total = (data ?? []).length;
    return { data: data ?? [] };
  },
});

export const PUT = withApiRoute({
  scope: "captaciones:write",
  schema: PhotoCollectionSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const result = await syncCaptacionPhotos(
      db,
      captacion.id,
      input.items,
      input.mode ?? "sync",
      { dryRun: ctx.dryRun }
    );

    ctx.counters.total = input.items.length;
    ctx.counters.created = result.added;
    ctx.counters.unchanged = result.kept;

    return { data: result };
  },
});
