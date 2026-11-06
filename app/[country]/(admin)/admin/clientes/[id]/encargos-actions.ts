"use server";

// Encargos múltiples del cliente (España): crear, editar, pausar/cerrar/reactivar
// y cambiar el principal. Sesión de staff con permiso de edición de clientes y,
// además, alcance sobre ESE cliente (un asesor solo toca lo suyo).

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { assertPermission } from "@/lib/auth/guard";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import {
  createEncargo, getEncargo, makePrimary, setEncargoStatus, updateEncargo, type EncargoResult,
} from "@/lib/db/queries/encargos";
import type { BriefInput } from "@/lib/clients/brief";
import type { EncargoStatus } from "@/lib/encargos/model";

async function allowed(clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!(await canActOnClient(clientId, "clientes", "edit"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }
  return { ok: true };
}

/**
 * Pase inicial del encargo sobre todo el stock actual (un único aviso agrupado), DESPUÉS de responder
 * y sin que un fallo rompa la acción. El runner se importa al ejecutarse para no cargar el motor de
 * matching en cada acción. La elegibilidad (activo, brief suficiente, cliente de España) la decide
 * el propio pase.
 */
function scheduleInitialPass(encargoId: string): void {
  try {
    after(async () => {
      try {
        const { runEncargoInitialPass } = await import("@/lib/encargos/runner");
        await runEncargoInitialPass(encargoId);
      } catch (e) {
        console.error(`[encargos] pase inicial del encargo ${encargoId} falló`, e);
      }
    });
  } catch (e) {
    console.error("[encargos] no se pudo programar el pase inicial", e);
  }
}

const refresh = (clientId: string) => revalidatePath(`/es/admin/clientes/${clientId}`);

/** Autoriza sobre el cliente dueño del encargo y ejecuta `run`; revalida la ficha si fue bien. */
async function onEncargo(
  encargoId: string,
  run: () => Promise<EncargoResult>,
): Promise<EncargoResult> {
  if (typeof encargoId !== "string") return { ok: false, error: "Encargo no válido." };
  const e = await getEncargo(encargoId);
  if (!e) return { ok: false, error: "El encargo no existe." };
  const gate = await allowed(e.clientId);
  if (!gate.ok) return gate;
  const r = await run();
  if (r.ok) refresh(e.clientId);
  return r;
}

export async function createEncargoAction(
  clientId: string,
  input: { label: string; endClientLabel?: string | null; brief: BriefInput },
): Promise<EncargoResult> {
  if (typeof clientId !== "string" || !input || typeof input.label !== "string" || !input.brief || typeof input.brief !== "object") {
    return { ok: false, error: "Datos del encargo no válidos." };
  }
  const gate = await allowed(clientId);
  if (!gate.ok) return gate;
  const r = await createEncargo(clientId, input);
  if (r.ok) {
    refresh(clientId);
    scheduleInitialPass(r.encargo.id);
  }
  return r;
}

export async function updateEncargoAction(
  encargoId: string,
  patch: { label?: string; endClientLabel?: string | null; brief?: BriefInput },
): Promise<EncargoResult> {
  if (!patch || typeof patch !== "object" || (patch.brief !== undefined && (!patch.brief || typeof patch.brief !== "object"))) {
    return { ok: false, error: "Datos del encargo no válidos." };
  }
  const r = await onEncargo(encargoId, () => updateEncargo(encargoId, patch));
  // Editar el brief reinicia baseline_at: se vuelve a evaluar el stock (si el patch trae `brief`;
  // una edición solo de etiqueta no lo programa).
  if (r.ok && patch.brief !== undefined) scheduleInitialPass(encargoId);
  return r;
}

export async function setEncargoStatusAction(encargoId: string, next: EncargoStatus): Promise<EncargoResult> {
  if (typeof encargoId !== "string") return { ok: false, error: "Encargo no válido." };
  const prev: { status: EncargoStatus | null } = { status: null };
  const r = await onEncargo(encargoId, async () => {
    // Ya autorizado por onEncargo: el estado previo se lee aquí, no antes del guard.
    prev.status = (await getEncargo(encargoId))?.status ?? null;
    return setEncargoStatus(encargoId, next);
  });
  // Reactivar (de pausado/cerrado a activo) reinicia baseline_at: pase inicial.
  if (r.ok && next === "active" && prev.status !== null && prev.status !== "active") scheduleInitialPass(encargoId);
  return r;
}

export async function makePrimaryAction(encargoId: string): Promise<EncargoResult> {
  return onEncargo(encargoId, () => makePrimary(encargoId));
}
