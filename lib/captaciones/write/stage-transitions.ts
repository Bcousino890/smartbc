import "server-only";
import { pickWorkingStage, type PipelineStage } from "../pipeline";

/**
 * Auto-transiciones de etapa de una captación.
 *
 * Extraído de app/api/admin/cl/captaciones/[id]/update/route.ts para que la API
 * pública produzca EXACTAMENTE el mismo comportamiento que el panel: una
 * captación que llega confirmada por API tiene que acabar en la misma etapa que
 * si la hubiera confirmado una persona.
 */

export type StageTransitionInput = {
  stages: PipelineStage[];
  currentStage: PipelineStage | null;
  /** Valor de owner_confirmed que va a quedar tras el update. */
  nextOwnerConfirmed: boolean;
  /** Valor de owner_confirmed que había antes. */
  wasOwnerConfirmed: boolean;
  /** ¿La actualización aporta los primeros datos del dueño? */
  bringsOwnerData: boolean;
};

export type StageTransition = {
  stage_id?: string;
  completed_at?: string | null;
};

/**
 * Devuelve el parche de etapa que corresponde, o `{}` si no hay transición.
 *
 * Reglas (idénticas a las del panel):
 *  1. Se marca el dueño como confirmado → salta a la etapa `confirmed` y se
 *     sella `completed_at`.
 *  2. Se desmarca estando en `confirmed` → vuelve a la primera etapa de trabajo
 *     en curso y se limpia `completed_at`.
 *  3. Llegan los primeros datos del dueño estando en la etapa de asignación →
 *     avanza a la primera etapa de trabajo (el trabajo ya empezó).
 */
export function resolveStageTransition(input: StageTransitionInput): StageTransition {
  const { stages, currentStage, nextOwnerConfirmed, bringsOwnerData } = input;
  if (stages.length === 0) return {};

  const isCurrentlyConfirmed = currentStage?.stage_type === "confirmed";

  if (nextOwnerConfirmed && !isCurrentlyConfirmed) {
    const confirmedStage = stages.find((s) => s.stage_type === "confirmed");
    return {
      ...(confirmedStage ? { stage_id: confirmedStage.id } : {}),
      completed_at: new Date().toISOString(),
    };
  }

  if (!nextOwnerConfirmed && isCurrentlyConfirmed) {
    const workingStage = pickWorkingStage(stages);
    return {
      ...(workingStage ? { stage_id: workingStage.id } : {}),
      completed_at: null,
    };
  }

  if (currentStage?.stage_type === "assign" && bringsOwnerData) {
    const workingStage = pickWorkingStage(stages);
    return workingStage ? { stage_id: workingStage.id } : {};
  }

  return {};
}

/** Resuelve una etapa por su `key` dentro de un pipeline. */
export function findStageByKey(
  stages: PipelineStage[],
  key: string
): PipelineStage | null {
  const normalized = key.trim().toLowerCase();
  return (
    stages.find((s) => s.key.toLowerCase() === normalized) ??
    stages.find((s) => s.label.toLowerCase() === normalized) ??
    null
  );
}

/** Etapa de entrada del pipeline (`draft`), o la primera por posición. */
export function findEntryStage(stages: PipelineStage[]): PipelineStage | null {
  return (
    stages.find((s) => s.stage_type === "draft") ??
    [...stages].sort((a, b) => a.position - b.position)[0] ??
    null
  );
}
