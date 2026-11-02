"use server";

// ============================================================================
// REPARTO COMERCIAL · escritura (solo administradores)
//
// El permiso se comprueba DOS veces: aquí (rol efectivo en el país, igual que
// requireRoles) y dentro de cada función de la base (routing_actor_is_admin),
// que además lleva el control de versión. La pantalla solo oculta botones.
// ============================================================================

import { revalidatePath } from "next/cache";
import { checkRoles } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { isCountry } from "@/lib/country-config";
import {
  ADMIN_ROLES,
  parseRuleOutcomes,
  parseSubjectKey,
  routingErrorMessage,
  type RuleItemOutcome,
} from "@/lib/sales-inbox/routing";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type RuleChangeResult =
  | { ok: true; outcomes: RuleItemOutcome[] }
  | { ok: false; error: string };

type Item = { key: string; expectedVersion: number };

function toPayload(items: Item[]) {
  const out: Array<Record<string, unknown>> = [];
  for (const it of items) {
    const s = parseSubjectKey(it.key);
    if (!s) continue;
    out.push({
      [s.kind === "property" ? "property_id" : "listing_id"]: s.id,
      expected_version: Math.max(0, Math.trunc(Number(it.expectedVersion) || 0)),
    });
  }
  return out;
}

function refresh(country: string) {
  revalidatePath(`/${country}/admin/reparto`);
}

/** Asigna uno o varios inmuebles a un asesor, con resultado por elemento. */
export async function setRoutingRules(input: {
  country: string;
  advisorId: string;
  items: Item[];
  reason?: string;
}): Promise<RuleChangeResult> {
  if (!isCountry(input.country)) return { ok: false, error: "País no válido." };
  const gate = await checkRoles(ADMIN_ROLES, { country: input.country });
  if (!gate.ok) return gate;
  const items = toPayload(input.items);
  if (items.length === 0) return { ok: false, error: "No hay nada seleccionado." };

  const { data, error } = await db().rpc("routing_set_rules", {
    p_actor: gate.profile.id,
    p_country: input.country,
    p_advisor: input.advisorId,
    p_items: items,
    p_reason: input.reason?.trim() || null,
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  refresh(input.country);
  return { ok: true, outcomes: parseRuleOutcomes(data) };
}

/** Quita el reparto de uno o varios inmuebles (lo nuevo irá a Pendiente). */
export async function clearRoutingRules(input: {
  country: string;
  items: Item[];
  reason?: string;
}): Promise<RuleChangeResult> {
  if (!isCountry(input.country)) return { ok: false, error: "País no válido." };
  const gate = await checkRoles(ADMIN_ROLES, { country: input.country });
  if (!gate.ok) return gate;
  const items = toPayload(input.items);
  if (items.length === 0) return { ok: false, error: "No hay nada seleccionado." };

  const { data, error } = await db().rpc("routing_clear_rules", {
    p_actor: gate.profile.id,
    p_country: input.country,
    p_items: items,
    p_reason: input.reason?.trim() || null,
  });
  if (error) return { ok: false, error: routingErrorMessage(error) };
  refresh(input.country);
  return { ok: true, outcomes: parseRuleOutcomes(data) };
}
