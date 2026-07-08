import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { getPipelinesForCountry, getStagesForPipeline } from "@/lib/captaciones/pipeline";

const CONFIG_ROLES = ["admin", "owner", "agent_admin"];

// GET: pipelines de Chile con sus etapas (para el selector del tablero y el
// administrador de pipelines). Cualquier staff puede leerlos.
export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const pipelines = await getPipelinesForCountry("cl");
    const withStages = await Promise.all(
      pipelines.map(async (p) => ({ ...p, stages: await getStagesForPipeline(p.id) }))
    );

    return NextResponse.json(withStages);
  } catch (err) {
    console.error("[pipelines GET]", err);
    const msg = err instanceof Error ? err.message : "Error al obtener pipelines";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST { name }: crea un pipeline nuevo con un esqueleto mínimo de etapas
// (entrada, asignación, en progreso, confirmada, rechazada, convertida) para
// que quede usable de inmediato; el admin lo termina de ajustar después.
export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || !CONFIG_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No tienes permisos para configurar pipelines" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const db = createAdminClient() as any;
    const { data: pipeline, error } = await db
      .from("captacion_pipelines")
      .insert({ country: "cl", name, is_default: false })
      .select()
      .single();
    if (error) throw error;

    const skeleton = [
      { key: "draft", label: "Borrador", color_key: "slate", position: 0, stage_type: "draft", requires_notes: false },
      { key: "assigned", label: "Asignada", color_key: "blue", position: 1, stage_type: "assign", requires_notes: false },
      { key: "in_progress", label: "En progreso", color_key: "purple", position: 2, stage_type: "normal", requires_notes: false },
      { key: "confirmed", label: "Confirmada", color_key: "emerald", position: 3, stage_type: "confirmed", requires_notes: false },
      { key: "converted", label: "Convertida", color_key: "cyan", position: 4, stage_type: "converted", requires_notes: false },
      { key: "rejected", label: "Rechazada", color_key: "red", position: 5, stage_type: "rejected", requires_notes: false },
    ].map((s) => ({ ...s, pipeline_id: pipeline.id }));

    const { error: stagesError } = await db.from("captacion_pipeline_stages").insert(skeleton);
    if (stagesError) throw stagesError;

    const stages = await getStagesForPipeline(pipeline.id);
    return NextResponse.json({ ...pipeline, stages }, { status: 201 });
  } catch (err) {
    console.error("[pipelines POST]", err);
    const msg = err instanceof Error ? err.message : "Error al crear el pipeline";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
