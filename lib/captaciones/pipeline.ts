import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { StageType } from "./pipeline-stage-types";

export type PipelineStage = {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  color_key: string;
  position: number;
  stage_type: StageType;
  requires_notes: boolean;
};

export type Pipeline = {
  id: string;
  country: string;
  name: string;
  is_default: boolean;
};

export async function getPipelinesForCountry(country: string): Promise<Pipeline[]> {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captacion_pipelines")
    .select("*")
    .eq("country", country)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Pipeline[];
}

export async function getStagesForPipeline(pipelineId: string): Promise<PipelineStage[]> {
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("captacion_pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data as PipelineStage[];
}

export async function getDefaultPipeline(country: string): Promise<{ pipeline: Pipeline; stages: PipelineStage[] } | null> {
  const db = createAdminClient() as any;
  const { data: pipeline } = await db
    .from("captacion_pipelines")
    .select("*")
    .eq("country", country)
    .eq("is_default", true)
    .maybeSingle();
  if (!pipeline) return null;
  const stages = await getStagesForPipeline(pipeline.id);
  return { pipeline, stages };
}

export async function getStageById(stageId: string): Promise<PipelineStage | null> {
  const db = createAdminClient() as any;
  const { data } = await db
    .from("captacion_pipeline_stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle();
  return (data as PipelineStage) || null;
}

// Etapa "de vuelta al trabajo" cuando se desconfirma una captación: la de
// menor posición que no sea de entrada, confirmación ni terminal (o sea, la
// primera etapa de "trabajo en curso" del pipeline). Si no hay ninguna,
// cae a la etapa de asignación o de entrada.
export function pickWorkingStage(stages: PipelineStage[]): PipelineStage | null {
  const working = stages
    .filter((s) => s.stage_type === "normal")
    .sort((a, b) => a.position - b.position)[0];
  if (working) return working;
  const assign = stages.find((s) => s.stage_type === "assign");
  if (assign) return assign;
  return stages.find((s) => s.stage_type === "draft") || null;
}
