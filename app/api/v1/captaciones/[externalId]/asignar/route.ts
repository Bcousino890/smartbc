import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/db/admin";
import { withApiRoute } from "@/lib/api/handler";
import { apiErrors } from "@/lib/api/errors";
import { requireCaptacionId } from "@/lib/api/v1/captaciones/service";
import { applyCaptacionAssignment } from "@/lib/captaciones/assign";
import { isStaffRole } from "@/lib/permissions";

/**
 * POST /api/v1/captaciones/{external_id}/asignar
 *
 * Asigna la captación a un usuario del equipo por email (los ids internos no
 * salen de SmartBC). Reutiliza applyCaptacionAssignment, así que deja el mismo
 * rastro que una asignación hecha a mano: mueve a la etapa de asignación,
 * registra el log y notifica al usuario.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AssignSchema = z
  .object({ email: z.string().trim().email().max(255) })
  .strict();

export const POST = withApiRoute({
  scope: "captaciones:write",
  schema: AssignSchema,
  handler: async (input, ctx) => {
    const captacion = await requireCaptacionId(ctx.client, ctx.params.externalId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const { data: profile } = await db
      .from("profiles")
      .select("id, full_name, role")
      .ilike("email", input.email)
      .maybeSingle();

    if (!profile) {
      throw apiErrors.notFound(`No hay ningún usuario con el email ${input.email}`);
    }
    if (!isStaffRole(profile.role)) {
      throw apiErrors.validation(
        "Solo se pueden asignar captaciones a usuarios del equipo",
        [{ field: "email", message: `El rol "${profile.role}" no es de staff` }]
      );
    }

    if (ctx.dryRun) {
      ctx.counters.total = 1;
      ctx.counters.updated = 1;
      return {
        data: { id: captacion.id, assigned_to: profile.id, dry_run: true },
      };
    }

    const { data: full } = await db
      .from("captaciones")
      .select("id, title, pipeline_id")
      .eq("id", captacion.id)
      .single();

    const updated = await applyCaptacionAssignment(db, {
      captacion: full,
      assigneeId: profile.id,
      assigneeName: profile.full_name ?? null,
      assignedBy: { id: ctx.client.default_created_by, full_name: ctx.client.name },
    });

    ctx.counters.total = 1;
    ctx.counters.updated = 1;

    return {
      data: {
        id: captacion.id,
        assigned_to: profile.id,
        assigned_to_name: profile.full_name,
        assigned_at: updated?.assigned_at ?? null,
      },
    };
  },
});
