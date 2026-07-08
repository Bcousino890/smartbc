import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { STAGE_TYPES } from "@/lib/captaciones/pipeline-stage-types";
import { PIPELINE_COLOR_KEYS } from "@/lib/captaciones/pipeline-colors";

const CONFIG_ROLES = ["admin", "owner", "agent_admin"];

// POST { label, color_key?, stage_type?, requires_notes? }: agrega una etapa
// al final del pipeline. key se deriva del label (slug) y debe ser único
// dentro del pipeline.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pipelineId: string }> }
) {
  const { pipelineId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "El nombre de la etapa es requerido" }, { status: 400 });
    }
    const stage_type = STAGE_TYPES.includes(body.stage_type) ? body.stage_type : "normal";
    const color_key = PIPELINE_COLOR_KEYS.includes(body.color_key) ? body.color_key : "slate";
    const requires_notes = Boolean(body.requires_notes);

    const db = createAdminClient() as any;

    const { data: pipeline } = await db
      .from("captacion_pipelines")
      .select("id")
      .eq("id", pipelineId)
      .single();
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline no encontrado" }, { status: 404 });
    }

    const { data: existing } = await db
      .from("captacion_pipeline_stages")
      .select("key, position")
      .eq("pipeline_id", pipelineId);

    const baseKey = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "etapa";
    let key = baseKey;
    let suffix = 1;
    const existingKeys = new Set((existing || []).map((s: any) => s.key));
    while (existingKeys.has(key)) {
      key = `${baseKey}_${++suffix}`;
    }
    const nextPosition = Math.max(-1, ...(existing || []).map((s: any) => s.position)) + 1;

    const { data, error } = await db
      .from("captacion_pipeline_stages")
      .insert({ pipeline_id: pipelineId, key, label, color_key, stage_type, requires_notes, position: nextPosition })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[pipeline stages POST]", err);
    const msg = err instanceof Error ? err.message : "Error al crear la etapa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT { order: string[] }: reordena las etapas del pipeline (arrastrar en el
// administrador de pipelines). order trae los ids en el orden deseado.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pipelineId: string }> }
) {
  const { pipelineId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const body = await request.json();
    const order: string[] = Array.isArray(body.order) ? body.order : [];
    if (order.length === 0) {
      return NextResponse.json({ error: "order es requerido" }, { status: 400 });
    }

    const db = createAdminClient() as any;
    await Promise.all(
      order.map((stageId, i) =>
        db
          .from("captacion_pipeline_stages")
          .update({ position: i, updated_at: new Date().toISOString() })
          .eq("id", stageId)
          .eq("pipeline_id", pipelineId)
      )
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pipeline stages PUT]", err);
    const msg = err instanceof Error ? err.message : "Error al reordenar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
