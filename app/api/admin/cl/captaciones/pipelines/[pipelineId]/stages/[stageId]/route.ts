import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { STAGE_TYPES } from "@/lib/captaciones/pipeline-stage-types";
import { PIPELINE_COLOR_KEYS } from "@/lib/captaciones/pipeline-colors";

const CONFIG_ROLES = ["admin", "owner", "agent_admin"];

// PATCH { label?, color_key?, stage_type?, requires_notes? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pipelineId: string; stageId: string }> }
) {
  const { pipelineId, stageId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    const { data: stage } = await db
      .from("captacion_pipeline_stages")
      .select("*")
      .eq("id", stageId)
      .eq("pipeline_id", pipelineId)
      .single();
    if (!stage) {
      return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
    }

    // Si se le quita el tipo "draft" (punto de entrada), debe quedar otra
    // etapa draft en el pipeline; si no, las captaciones nuevas no tendrían
    // dónde entrar.
    if (stage.stage_type === "draft" && body.stage_type && body.stage_type !== "draft") {
      const { count } = await db
        .from("captacion_pipeline_stages")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pipelineId)
        .eq("stage_type", "draft")
        .neq("id", stageId);
      if ((count || 0) === 0) {
        return NextResponse.json(
          { error: "Debe quedar al menos una etapa de entrada (draft) en el pipeline" },
          { status: 400 }
        );
      }
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (typeof body.label === "string" && body.label.trim()) updates.label = body.label.trim();
    if (PIPELINE_COLOR_KEYS.includes(body.color_key)) updates.color_key = body.color_key;
    if (STAGE_TYPES.includes(body.stage_type)) updates.stage_type = body.stage_type;
    if (typeof body.requires_notes === "boolean") updates.requires_notes = body.requires_notes;

    const { data, error } = await db
      .from("captacion_pipeline_stages")
      .update(updates)
      .eq("id", stageId)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error("[pipeline stage PATCH]", err);
    const msg = err instanceof Error ? err.message : "Error al actualizar la etapa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: bloquea si es la única etapa "draft" del pipeline o si hay
// captaciones actualmente en ella (hay que moverlas primero).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pipelineId: string; stageId: string }> }
) {
  const { pipelineId, stageId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { data: stage } = await db
      .from("captacion_pipeline_stages")
      .select("*")
      .eq("id", stageId)
      .eq("pipeline_id", pipelineId)
      .single();
    if (!stage) {
      return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });
    }

    if (stage.stage_type === "draft") {
      const { count } = await db
        .from("captacion_pipeline_stages")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pipelineId)
        .eq("stage_type", "draft")
        .neq("id", stageId);
      if ((count || 0) === 0) {
        return NextResponse.json(
          { error: "No puedes eliminar la única etapa de entrada (draft) del pipeline" },
          { status: 400 }
        );
      }
    }

    const { count: inUse } = await db
      .from("captaciones")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);
    if ((inUse || 0) > 0) {
      return NextResponse.json(
        { error: `Hay ${inUse} captación(es) en esta etapa. Muévelas antes de eliminarla.` },
        { status: 400 }
      );
    }

    const { error } = await db.from("captacion_pipeline_stages").delete().eq("id", stageId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pipeline stage DELETE]", err);
    const msg = err instanceof Error ? err.message : "Error al eliminar la etapa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
