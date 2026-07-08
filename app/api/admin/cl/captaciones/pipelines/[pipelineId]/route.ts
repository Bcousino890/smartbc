import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

const CONFIG_ROLES = ["admin", "owner", "agent_admin"];

// PATCH { name?, is_default? }: renombra el pipeline o lo marca como default
// (el que se usa para captaciones nuevas; desmarca cualquier otro default
// del mismo país).
export async function PATCH(
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
    const db = createAdminClient() as any;

    const { data: pipeline } = await db
      .from("captacion_pipelines")
      .select("id, country")
      .eq("id", pipelineId)
      .single();
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline no encontrado" }, { status: 404 });
    }

    if (body.is_default === true) {
      await db
        .from("captacion_pipelines")
        .update({ is_default: false })
        .eq("country", pipeline.country)
        .neq("id", pipelineId);
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.is_default === "boolean") updates.is_default = body.is_default;

    const { data, error } = await db
      .from("captacion_pipelines")
      .update(updates)
      .eq("id", pipelineId)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error("[pipeline PATCH]", err);
    const msg = err instanceof Error ? err.message : "Error al actualizar el pipeline";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: solo si no es el default y no tiene captaciones activas (para no
// dejar registros huérfanos sin pipeline/etapa).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ pipelineId: string }> }
) {
  const { pipelineId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { data: pipeline } = await db
      .from("captacion_pipelines")
      .select("id, is_default")
      .eq("id", pipelineId)
      .single();
    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline no encontrado" }, { status: 404 });
    }
    if (pipeline.is_default) {
      return NextResponse.json(
        { error: "No puedes eliminar el pipeline default. Marca otro como default primero." },
        { status: 400 }
      );
    }

    const { count } = await db
      .from("captaciones")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", pipelineId);
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `Este pipeline tiene ${count} captación(es). Muévelas a otro pipeline antes de eliminarlo.` },
        { status: 400 }
      );
    }

    const { error } = await db.from("captacion_pipelines").delete().eq("id", pipelineId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pipeline DELETE]", err);
    const msg = err instanceof Error ? err.message : "Error al eliminar el pipeline";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
