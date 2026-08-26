import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { getStagesForPipeline } from "@/lib/captaciones/pipeline";
import { findStageByKey } from "@/lib/captaciones/write/stage-transitions";

/**
 * POST /api/v1/captaciones/{external_id}/etapa
 *
 * Mueve la captación de etapa por la `key` del pipeline (las mismas que
 * devuelve GET /api/v1/catalogos/pipelines).
 *
 * La etapa terminal `converted` NO se puede fijar por API: convertir una
 * captación en propiedad crea una propiedad real y solo lo hace el endpoint de
 * conversión del panel.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StageSchema = z
  .object({
    stage: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: StageSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    if (!captacion.pipeline_id) {
      throw apiErrors.conflict("La captación no tiene pipeline asignado");
    }

    const stages = await getStagesForPipeline(captacion.pipeline_id);
    const stage = findStageByKey(stages, input.stage);

    if (!stage) {
      throw apiErrors.validation(
        `No existe la etapa "${input.stage}" en el pipeline de esta captación`,
        [
          {
            field: "stage",
            message: `Etapas válidas: ${stages.map((s) => s.key).join(", ")}`,
          },
        ]
      );
    }

    if (stage.stage_type === "converted") {
      throw apiErrors.forbidden(
        'La etapa "converted" solo se alcanza convirtiendo la captación en propiedad desde el panel'
      );
    }

    if (stage.requires_notes && !input.notes) {
      throw apiErrors.validation(`La etapa "${stage.label}" exige indicar notas`, [
        { field: "notes", message: "Campo obligatorio para esta etapa" },
      ]);
    }

    if (captacion.stage_id === stage.id) {
      ctx.counters.total = 1;
      ctx.counters.unchanged = 1;
      return { data: { id: captacion.id, stage: stage.key, action: "unchanged" } };
    }

    if (!ctx.dryRun) {
      const patch: Record<string, unknown> = {
        stage_id: stage.id,
        updated_at: new Date().toISOString(),
        external_synced_at: new Date().toISOString(),
      };
      if (input.notes) patch.revision_notes = input.notes;
      if (stage.stage_type === "rejected") {
        patch.status = "rejected";
        patch.rejected_by = "api";
      } else if (captacion.status === "rejected") {
        // Sale de "rechazada" por una petición explícita: no se queda a
        // medias con el legado `status` desactualizado ni con `rejected_by`
        // apuntando a un rechazo que ya no aplica.
        patch.status = "draft";
        patch.rejected_by = null;
      }

      const { error } = await db.from("captaciones").update(patch).eq("id", captacion.id);
      if (error) throw error;

      // Traza del cambio de estado en la pestaña Intentos (no crítico).
      await db
        .from("captacion_logs")
        .insert({
          captacion_id: captacion.id,
          created_by: ctx.client.default_created_by,
          attempt_type: "status_change",
          result: stage.key,
          notes: input.notes ?? `Etapa cambiada a "${stage.label}" por ${ctx.client.name}`,
        })
        .then(
          () => undefined,
          () => undefined
        );
    }

    ctx.counters.total = 1;
    ctx.counters.updated = 1;

    return {
      data: {
        id: captacion.id,
        stage: stage.key,
        stage_label: stage.label,
        stage_type: stage.stage_type,
        action: "updated",
        dry_run: ctx.dryRun,
      },
    };
  },
});
