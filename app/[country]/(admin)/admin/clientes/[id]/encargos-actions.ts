"use server";

// Encargos múltiples del cliente (España): crear, editar, pausar/cerrar/reactivar
// y cambiar el principal. Sesión de staff con permiso de edición de clientes y,
// además, alcance sobre ESE cliente (un asesor solo toca lo suyo).

import { revalidatePath } from "next/cache";
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

const refresh = (clientId: string) => revalidatePath(`/es/admin/clientes/${clientId}`);

/** Autoriza sobre el cliente dueño del encargo y ejecuta `run`; revalida la ficha si fue bien. */
async function onEncargo(
  encargoId: string,
  run: () => Promise<EncargoResult>,
): Promise<EncargoResult> {
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
  const gate = await allowed(clientId);
  if (!gate.ok) return gate;
  const r = await createEncargo(clientId, input);
  if (r.ok) refresh(clientId);
  return r;
}

export async function updateEncargoAction(
  encargoId: string,
  patch: { label?: string; endClientLabel?: string | null; brief?: BriefInput },
): Promise<EncargoResult> {
  return onEncargo(encargoId, () => updateEncargo(encargoId, patch));
}

export async function setEncargoStatusAction(encargoId: string, next: EncargoStatus): Promise<EncargoResult> {
  return onEncargo(encargoId, () => setEncargoStatus(encargoId, next));
}

export async function makePrimaryAction(encargoId: string): Promise<EncargoResult> {
  return onEncargo(encargoId, () => makePrimary(encargoId));
}
