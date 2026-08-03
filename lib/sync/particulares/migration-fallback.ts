import "server-only";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseResult = { error: { message?: string } | null; data?: any };

// Columnas de las migraciones 0035 (address, phone_confidence) y 0036
// (has_floor_plan, floor_plan_url, has_video, video_url) que pueden no
// estar aplicadas todavía en el VPS cuando corre este código (se aplican
// con psql en el post-deploy, ver scripts/apply-migrations.sh).
const MIGRATION_0035_COLUMNS = [
  "address",
  "phone_confidence",
  "has_floor_plan",
  "floor_plan_url",
  "has_video",
  "video_url",
] as const;

function isMissing0035ColumnError(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message ?? "";
  if (!/column|does not exist|schema cache/i.test(msg)) return false;
  return MIGRATION_0035_COLUMNS.some((col) => msg.includes(col));
}

/**
 * Reintenta una escritura sobre `particulares` sin las columnas de las
 * migraciones 0035/0036 si el VPS todavía no las tiene aplicadas, en vez de
 * fallar duro con "column does not exist". Compartido por todos los
 * escritores del módulo de particulares (antes había una copia en
 * cron/particulares/scrape/route.ts y otra casi idéntica en
 * verify-phones/route.ts).
 */
export async function withMigration0035Fallback<T extends SupabaseResult>(
  values: Record<string, unknown>,
  run: (values: Record<string, unknown>) => PromiseLike<T>,
): Promise<T> {
  const first = await run(values);
  if (first.error && isMissing0035ColumnError(first.error)) {
    console.warn(
      "[migration-fallback] Migración 0035/0036 no aplicada — reintentando sin esas columnas",
    );
    const stripped = { ...values };
    for (const col of MIGRATION_0035_COLUMNS) delete stripped[col];
    return run(stripped);
  }
  return first;
}
