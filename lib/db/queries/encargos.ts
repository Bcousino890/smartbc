import { createAdminClient } from "../admin";
import { buildPreferencesPayload, validateBrief, type BriefInput } from "@/lib/clients/brief";
import { encargoFromRow, validateStatusChange, type Encargo, type EncargoStatus } from "@/lib/encargos/model";

// Los encargos son filas de `client_preferences` (una por encargo; una sola
// principal por cliente). Esta es la única capa que escribe varias filas por
// cliente. Solo España: los clientes con profiles.country = 'cl' conservan su
// única preferencia principal y no admiten encargos extra.

export type EncargoResult = { ok: true; encargo: Encargo } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any;

const CHILE = "Los encargos múltiples son solo para clientes de España.";
const MISSING = "El encargo no existe.";
const MAX_LABEL = 80;

/** Principal primero y después por `position`. */
function sorted(rows: Record<string, unknown>[]): Encargo[] {
  return rows
    .map(encargoFromRow)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position);
}

export async function listEncargos(clientId: string): Promise<Encargo[]> {
  const { data } = await db().from("client_preferences").select("*").eq("client_id", clientId);
  return sorted((data ?? []) as Record<string, unknown>[]);
}

export async function getEncargo(encargoId: string): Promise<Encargo | null> {
  const { data } = await db().from("client_preferences").select("*").eq("id", encargoId).maybeSingle();
  return data ? encargoFromRow(data as Record<string, unknown>) : null;
}

/** ¿El cliente es de Chile? Si no se puede leer el perfil, se rechaza (más seguro). */
async function isChile(clientId: string): Promise<boolean | "unknown"> {
  const { data, error } = await db().from("profiles").select("country").eq("id", clientId).maybeSingle();
  if (error || !data) return "unknown";
  return (data as { country: string | null }).country === "cl";
}

async function spainOnly(clientId: string): Promise<string | null> {
  const cl = await isChile(clientId);
  if (cl === "unknown") return "Cliente no encontrado.";
  return cl ? CHILE : null;
}

function cleanLabel(label: string | undefined): { ok: true; label: string } | { ok: false; error: string } {
  const l = (label ?? "").trim();
  if (!l) return { ok: false, error: "El encargo necesita un nombre." };
  if (l.length > MAX_LABEL) return { ok: false, error: `El nombre no puede pasar de ${MAX_LABEL} caracteres.` };
  return { ok: true, label: l };
}

const cleanEnd = (v: string | null | undefined) => (v && v.trim() ? v.trim().slice(0, MAX_LABEL) : null);

export async function createEncargo(
  clientId: string,
  input: { label: string; endClientLabel?: string | null; brief: BriefInput },
): Promise<EncargoResult> {
  const blocked = await spainOnly(clientId);
  if (blocked) return { ok: false, error: blocked };
  const label = cleanLabel(input.label);
  if (!label.ok) return label;
  const valid = validateBrief(input.brief);
  if (!valid.ok) return valid;

  const existing = await listEncargos(clientId);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("client_preferences")
    .insert({
      client_id: clientId,
      country: "es",
      ...buildPreferencesPayload(input.brief),
      label: label.label,
      end_client_label: cleanEnd(input.endClientLabel),
      status: "active",
      is_primary: existing.length === 0,
      position: existing.reduce((m, e) => Math.max(m, e.position), -1) + 1,
      baseline_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el encargo." };
  return { ok: true, encargo: encargoFromRow(data as Record<string, unknown>) };
}

async function writable(encargoId: string): Promise<{ e: Encargo } | { error: string }> {
  const e = await getEncargo(encargoId);
  if (!e) return { error: MISSING };
  const blocked = await spainOnly(e.clientId);
  return blocked ? { error: blocked } : { e };
}

async function patchRow(encargoId: string, patch: Record<string, unknown>): Promise<EncargoResult> {
  const { data, error } = await db()
    .from("client_preferences")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", encargoId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? MISSING };
  return { ok: true, encargo: encargoFromRow(data as Record<string, unknown>) };
}

/** Si cambia `brief`, `baseline_at = now()` dispara el pase inicial de matches. */
export async function updateEncargo(
  encargoId: string,
  patch: { label?: string; endClientLabel?: string | null; brief?: BriefInput },
): Promise<EncargoResult> {
  const w = await writable(encargoId);
  if ("error" in w) return { ok: false, error: w.error };
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const l = cleanLabel(patch.label);
    if (!l.ok) return l;
    row.label = l.label;
  }
  if (patch.endClientLabel !== undefined) row.end_client_label = cleanEnd(patch.endClientLabel);
  if (patch.brief) {
    const valid = validateBrief(patch.brief);
    if (!valid.ok) return valid;
    Object.assign(row, buildPreferencesPayload(patch.brief), { baseline_at: new Date().toISOString() });
  }
  if (!Object.keys(row).length) return { ok: true, encargo: w.e };
  return patchRow(encargoId, row);
}

/** El principal siempre está activo. Reactivar un encargo pone `baseline_at = now()`. */
export async function setEncargoStatus(encargoId: string, next: EncargoStatus): Promise<EncargoResult> {
  const w = await writable(encargoId);
  if ("error" in w) return { ok: false, error: w.error };
  const v = validateStatusChange(w.e, next);
  if (!v.ok) return v;
  if (w.e.status === next) return { ok: true, encargo: w.e };
  return patchRow(encargoId, {
    status: next,
    ...(next === "active" ? { baseline_at: new Date().toISOString() } : {}),
  });
}

/**
 * Cambia el principal del cliente. El índice único parcial impide dos
 * principales a la vez, así que primero se quita al actual y luego se pone al
 * nuevo; si lo segundo falla se devuelve el principal al anterior (cliente
 * PostgREST sin transacciones multi-sentencia).
 */
export async function makePrimary(encargoId: string): Promise<EncargoResult> {
  const w = await writable(encargoId);
  if ("error" in w) return { ok: false, error: w.error };
  if (w.e.isPrimary) return { ok: true, encargo: w.e };
  if (w.e.status !== "active") return { ok: false, error: "Solo un encargo activo puede ser el principal." };

  const current = (await listEncargos(w.e.clientId)).find((e) => e.isPrimary);
  if (current) {
    const demoted = await patchRow(current.id, { is_primary: false });
    if (!demoted.ok) return demoted;
  }
  const promoted = await patchRow(encargoId, { is_primary: true });
  if (!promoted.ok && current) await patchRow(current.id, { is_primary: true });
  return promoted;
}
