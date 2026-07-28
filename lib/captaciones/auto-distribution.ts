import "server-only";
import { applyCaptacionAssignment } from "./assign";

/**
 * Reparto automático de captaciones nuevas entre un pool de usuarios que el
 * admin elige. Cuando entra una captación nueva se asigna al usuario del pool
 * con MENOS captaciones activas (equitativo: equilibra la carga total, no solo
 * las nuevas). La config vive en `app_settings["captaciones.auto_distribution"]`.
 */
export const AUTO_DISTRIBUTION_KEY = "captaciones.auto_distribution";

export type AutoDistributionConfig = {
  enabled: boolean;
  /** Ids de perfil (auth.users) que participan en el reparto. */
  user_ids: string[];
};

const EMPTY_CONFIG: AutoDistributionConfig = { enabled: false, user_ids: [] };

/** Etapas terminales: una captación aquí ya no cuenta como carga activa. */
const TERMINAL_STAGE_TYPES = new Set(["converted", "rejected"]);

export async function getAutoDistributionConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<AutoDistributionConfig> {
  try {
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", AUTO_DISTRIBUTION_KEY)
      .maybeSingle();

    const value = data?.value;
    if (!value || typeof value !== "object") return { ...EMPTY_CONFIG };

    return {
      enabled: Boolean(value.enabled),
      user_ids: Array.isArray(value.user_ids)
        ? value.user_ids.filter((id: unknown): id is string => typeof id === "string")
        : [],
    };
  } catch {
    // La tabla app_settings existe desde la migración 0030; si por lo que sea
    // falla, el reparto queda apagado en vez de tirar la página.
    return { ...EMPTY_CONFIG };
  }
}

export async function setAutoDistributionConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  config: AutoDistributionConfig
): Promise<void> {
  await db.from("app_settings").upsert(
    {
      key: AUTO_DISTRIBUTION_KEY,
      value: { enabled: config.enabled, user_ids: config.user_ids },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

/**
 * Elige al siguiente usuario del pool: el que tiene MENOS captaciones activas
 * (no convertidas ni rechazadas). En empate gana el que aparezca antes en
 * `userIds`; como al asignarle sube su cuenta, en la práctica va rotando solo.
 * Devuelve `null` si el pool está vacío.
 */
export async function pickNextAssignee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userIds: string[]
): Promise<string | null> {
  if (userIds.length === 0) return null;

  // Ids de etapas terminales (para no contar captaciones ya cerradas).
  const { data: stages } = await db
    .from("captacion_pipeline_stages")
    .select("id, stage_type");
  const terminalStageIds = new Set<string>(
    (stages || [])
      .filter((s: { stage_type: string }) => TERMINAL_STAGE_TYPES.has(s.stage_type))
      .map((s: { id: string }) => s.id)
  );

  const { data: rows } = await db
    .from("captaciones")
    .select("assigned_to, stage_id")
    .eq("country", "cl")
    .in("assigned_to", userIds);

  const counts = new Map<string, number>();
  for (const id of userIds) counts.set(id, 0);
  for (const row of rows || []) {
    const uid: string | null = row.assigned_to;
    if (!uid || !counts.has(uid)) continue;
    if (row.stage_id && terminalStageIds.has(row.stage_id)) continue;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const id of userIds) {
    const c = counts.get(id) ?? 0;
    if (c < bestCount) {
      bestCount = c;
      best = id;
    }
  }
  return best;
}

/**
 * Reparte automáticamente una captación recién creada, si el reparto está
 * activo y hay pool. No crítico: si algo falla la captación se crea igual, solo
 * queda sin asignar (el admin la puede asignar a mano). Devuelve la fila
 * actualizada si la asignó, o `null` si no tocó nada.
 */
export async function autoDistributeNewCaptacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacion: { id: string; title: string | null; pipeline_id: string | null; assigned_to: string | null },
  createdBy: { id: string; full_name?: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  if (captacion.assigned_to) return null; // ya venía asignada, respetarlo

  const config = await getAutoDistributionConfig(db);
  if (!config.enabled || config.user_ids.length === 0) return null;

  const assigneeId = await pickNextAssignee(db, config.user_ids);
  if (!assigneeId) return null;

  const { data: assignee } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("id", assigneeId)
    .maybeSingle();

  return applyCaptacionAssignment(db, {
    captacion,
    assigneeId,
    assigneeName: assignee?.full_name ?? null,
    assignedBy: createdBy,
    auto: true,
  });
}
