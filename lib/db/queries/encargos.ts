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
const PRIMARY_LOCKED = "El encargo principal no se puede pausar ni cerrar.";

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

/** Solo clientes de España (country = 'es', role = 'client'); cualquier otra cosa se rechaza. */
async function spainOnly(clientId: string): Promise<string | null> {
  const { data, error } = await db().from("profiles").select("country, role").eq("id", clientId).maybeSingle();
  if (error || !data) return "Cliente no encontrado.";
  const p = data as { country: string | null; role: string | null };
  if (p.role !== "client") return "El perfil no es un cliente.";
  return p.country === "es" ? null : CHILE;
}

function cleanLabel(label: unknown): { ok: true; label: string } | { ok: false; error: string } {
  const l = typeof label === "string" ? label.trim() : "";
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
  const position = existing.reduce((m, e) => Math.max(m, e.position), -1) + 1;
  const now = new Date().toISOString();
  const insert = (isPrimary: boolean) =>
    db()
      .from("client_preferences")
      .insert({
        client_id: clientId,
        country: "es",
        ...buildPreferencesPayload(input.brief),
        label: label.label,
        end_client_label: cleanEnd(input.endClientLabel),
        status: "active",
        is_primary: isPrimary,
        position,
        baseline_at: now,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
  const wantPrimary = existing.length === 0;
  let { data, error } = await insert(wantPrimary);
  // Dos altas a la vez sobre un cliente sin encargos: las dos piden ser principal
  // y la segunda choca con el índice único parcial → se reintenta como secundaria.
  if (error && wantPrimary && (error as { code?: string }).code === "23505") {
    ({ data, error } = await insert(false));
  }
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el encargo." };
  return { ok: true, encargo: encargoFromRow(data as Record<string, unknown>) };
}

async function writable(encargoId: string): Promise<{ e: Encargo } | { error: string }> {
  const e = await getEncargo(encargoId);
  if (!e) return { error: MISSING };
  const blocked = await spainOnly(e.clientId);
  return blocked ? { error: blocked } : { e };
}

async function patchRow(
  encargoId: string,
  patch: Record<string, unknown>,
  opts: { nonPrimary?: boolean } = {},
): Promise<EncargoResult> {
  let q = db()
    .from("client_preferences")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", encargoId);
  if (opts.nonPrimary) q = q.eq("is_primary", false);
  const { data, error } = await q.select("*").maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? MISSING };
  return { ok: true, encargo: encargoFromRow(data as Record<string, unknown>) };
}

/**
 * Si cambia `brief`, `baseline_at = now()` dispara el pase inicial de matches.
 * Se puede editar un encargo pausado o cerrado: también reinicia `baseline_at`
 * (no genera matches mientras no esté activo; al reactivarlo se reinicia otra vez).
 */
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

/**
 * Pone el estado sabiendo (copia posiblemente vieja) si es principal. Pausar o
 * cerrar va CONDICIONADO en el propio UPDATE (`is_primary = false`): si un
 * `makePrimary` concurrente convirtió a este encargo en principal, no se toca.
 * Reactivar no necesita esa condición.
 */
export async function applyEncargoStatus(
  e: Pick<Encargo, "id" | "isPrimary" | "status">,
  next: EncargoStatus,
): Promise<EncargoResult> {
  const v = validateStatusChange(e, next);
  if (!v.ok) return v;
  if (next === "active") {
    return patchRow(e.id, { status: next, ...(e.status !== "active" ? { baseline_at: new Date().toISOString() } : {}) });
  }
  const r = await patchRow(e.id, { status: next }, { nonPrimary: true });
  if (r.ok) return r;
  // Cero filas: o ya es el principal (carrera con makePrimary) o no existe.
  return (await getEncargo(e.id))?.isPrimary ? { ok: false, error: PRIMARY_LOCKED } : r;
}

/** El principal siempre está activo. Reactivar un encargo pone `baseline_at = now()`. */
export async function setEncargoStatus(encargoId: string, next: EncargoStatus): Promise<EncargoResult> {
  const w = await writable(encargoId);
  if ("error" in w) return { ok: false, error: w.error };
  if (w.e.status === next) return { ok: true, encargo: w.e };
  return applyEncargoStatus(w.e, next);
}

/**
 * Cambia el principal del cliente con `make_encargo_primary` (migración 0244):
 * una sola transacción en BD, con las filas del cliente bloqueadas.
 */
export async function makePrimary(encargoId: string): Promise<EncargoResult> {
  const w = await writable(encargoId);
  if ("error" in w) return { ok: false, error: w.error };
  if (w.e.isPrimary) return { ok: true, encargo: w.e };
  const { error } = await db().rpc("make_encargo_primary", { p_encargo_id: encargoId });
  if (error) {
    const m = String(error.message ?? "");
    if (m.includes("ENCARGO_NO_ACTIVO")) return { ok: false, error: "Solo un encargo activo puede ser el principal." };
    if (m.includes("CLIENTE_NO_ES")) return { ok: false, error: CHILE };
    if (m.includes("ENCARGO_NO_EXISTE")) return { ok: false, error: MISSING };
    return { ok: false, error: m || "No se pudo cambiar el principal." };
  }
  const now = await getEncargo(encargoId);
  return now ? { ok: true, encargo: now } : { ok: false, error: MISSING };
}
