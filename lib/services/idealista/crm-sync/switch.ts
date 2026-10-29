// Interruptor de la sincronización Idealista API → CRM, desde el CRM (0234).
// La regla «solo se enciende si todas las comprobaciones salen bien» vive en
// la base (idealista_crm_set_enabled); aquí solo se lee y se pide el cambio.
// No llama a Idealista (I1).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SwitchCheck {
  check: string;
  expected: string;
  found: string;
  ok: boolean;
}

export interface SwitchStatus {
  available: boolean;
  enabled: boolean;
  checks: SwitchCheck[];
  allOk: boolean;
  lastChange: { enabled: boolean; at: string; by: string | null } | null;
  error?: string;
}

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>; from: (t: string) => any };

async function db(d?: Db): Promise<Db> {
  if (d) return d;
  const { createAdminClient } = await import("@/lib/db/admin");
  return createAdminClient() as any;
}

export async function getSwitchStatus(d?: Db): Promise<SwitchStatus> {
  const x = await db(d);
  const report = await x.rpc("idealista_crm_activation_report");
  if (report.error) {
    // Sin 0234 (o sin 0232/0233) la función no existe: el despliegue no ha entrado.
    return { available: false, enabled: false, checks: [], allOk: false, lastChange: null, error: report.error.message };
  }
  const checks: SwitchCheck[] = (report.data ?? []).map((r: any) => ({
    check: String(r.comprobacion), expected: String(r.esperado), found: String(r.encontrado), ok: r.ok === true,
  }));
  const { data: setting } = await x.from("app_settings").select("value").eq("key", "idealista_crm_sync").maybeSingle();
  const { data: last } = await x
    .from("idealista_crm_switch_log")
    .select("enabled, changed_at, actor_id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  let by: string | null = null;
  if (last?.actor_id) {
    const { data: p } = await x.from("profiles").select("full_name, email").eq("id", last.actor_id).maybeSingle();
    by = p?.full_name ?? p?.email ?? null;
  }
  return {
    available: true,
    enabled: setting?.value?.enabled === true,
    checks,
    allOk: checks.length > 0 && checks.every((c) => c.ok),
    lastChange: last ? { enabled: last.enabled === true, at: String(last.changed_at), by } : null,
  };
}

export async function setSwitch(
  enabled: boolean,
  actorId: string,
  d?: Db,
): Promise<{ ok: boolean; enabled?: boolean; failing?: string[]; error?: string }> {
  const x = await db(d);
  const { data, error } = await x.rpc("idealista_crm_set_enabled", { p_enabled: enabled, p_actor: actorId });
  if (error || !data) return { ok: false, error: error?.message ?? "sin respuesta" };
  return { ok: data.ok === true, enabled: data.enabled, failing: data.failing ?? undefined, error: data.error ?? undefined };
}
