import {
  decryptWithKey,
  decryptWithKeyring,
  encryptWithKeyring,
  type Keyring,
} from "./keyring";

/**
 * Lógica PURA del re-cifrado de secretos (fase D de
 * docs/PLAN_REKEY_EMAIL_ENCRYPTION.md): decide qué hacer con cada valor cifrado
 * y recorre las tablas a través de una interfaz de E/S inyectable. Así se prueba
 * entera con una base de datos falsa (`npm run test:rekey`) sin tocar la real; el
 * script `scripts/rekey-secrets.mts` solo aporta la E/S contra Supabase.
 *
 * Garantías:
 *   - Nunca devuelve ni registra un valor en claro: el informe solo lleva
 *     recuentos e ids de fila.
 *   - Idempotente: un valor que ya se descifra con la clave actual no se toca,
 *     así que repetir la ejecución no hace nada.
 *   - Antes de escribir comprueba, en memoria, que el valor nuevo se descifra
 *     con la clave ACTUAL y da el mismo texto.
 *   - La escritura es optimista (solo si la fila sigue como se leyó).
 */

export type RekeyTarget = {
  table: string;
  idColumn: string;
  /** Nombre lógico del secreto (para el informe). */
  field: string;
  encColumn: string;
  ivColumn: string;
};

/** Todas las columnas cifradas con `encryptSecret` (ver el inventario del plan). */
export const REKEY_TARGETS: RekeyTarget[] = [
  { table: "email_config", idColumn: "id", field: "aws_secret_access_key", encColumn: "aws_secret_access_key_encrypted", ivColumn: "aws_secret_access_key_iv" },
  { table: "zinto_config", idColumn: "id", field: "api_key", encColumn: "api_key_encrypted", ivColumn: "api_key_iv" },
  { table: "zinto_config", idColumn: "id", field: "webhook_secret", encColumn: "webhook_secret_encrypted", ivColumn: "webhook_secret_iv" },
  { table: "zinto_config", idColumn: "id", field: "inbound_token", encColumn: "inbound_token_encrypted", ivColumn: "inbound_token_iv" },
  { table: "zinto_config", idColumn: "id", field: "api_key_v2", encColumn: "api_key_v2_encrypted", ivColumn: "api_key_v2_iv" },
  { table: "zinto_config", idColumn: "id", field: "webhook_secret_v2", encColumn: "webhook_secret_v2_encrypted", ivColumn: "webhook_secret_v2_iv" },
  { table: "zinto_config", idColumn: "id", field: "integration_api_key", encColumn: "integration_api_key_encrypted", ivColumn: "integration_api_key_iv" },
  { table: "zinto_config", idColumn: "id", field: "integration_webhook_secret", encColumn: "integration_webhook_secret_encrypted", ivColumn: "integration_webhook_secret_iv" },
  { table: "idealista_config", idColumn: "id", field: "api_client_secret", encColumn: "api_client_secret_encrypted", ivColumn: "api_client_secret_iv" },
  { table: "user_mailboxes", idColumn: "user_id", field: "password", encColumn: "password_encrypted", ivColumn: "password_iv" },
];

export type RawRow = { id: string; enc: string | null; iv: string | null };
export type Cipher = { encrypted: string; iv: string };

export type RowState = "empty" | "already_current" | "migrate" | "unreadable";
export type RowPlan = { id: string; state: RowState; from?: Cipher; to?: Cipher };

/** Decide qué hacer con un valor cifrado. No escribe nada. */
export function planRow(row: RawRow, keyring: Keyring): RowPlan {
  if (!row.enc || !row.iv) return { id: row.id, state: "empty" };

  let value: string;
  let keyIndex: number;
  try {
    ({ value, keyIndex } = decryptWithKeyring(row.enc, row.iv, keyring));
  } catch {
    return { id: row.id, state: "unreadable" };
  }
  if (keyIndex === 0) return { id: row.id, state: "already_current" };

  const to = encryptWithKeyring(value, keyring);
  // Comprobación de ida y vuelta con la clave ACTUAL antes de proponer escribir.
  let roundTrip: string | null = null;
  try {
    roundTrip = decryptWithKey(to.encrypted, to.iv, keyring.current);
  } catch {
    roundTrip = null;
  }
  if (roundTrip !== value) return { id: row.id, state: "unreadable" };

  return { id: row.id, state: "migrate", from: { encrypted: row.enc, iv: row.iv }, to };
}

// ── Recorrido ────────────────────────────────────────────────────────────────

/** La tabla o la columna no existe todavía en esta base (migración sin aplicar). */
export class TargetUnavailableError extends Error {}

export interface RekeyIO {
  /** Lee las filas de un objetivo. Lanza `TargetUnavailableError` si no existe. */
  fetchRows(target: RekeyTarget): Promise<RawRow[]>;
  /**
   * Escribe `to` solo si la fila sigue con `from` (escritura optimista).
   * Devuelve true si cambió una fila, false si alguien la cambió entretanto.
   */
  updateRow(target: RekeyTarget, id: string, from: Cipher, to: Cipher): Promise<boolean>;
}

export type TargetReport = {
  table: string;
  field: string;
  available: boolean;
  total: number;
  alreadyCurrent: number;
  migratable: number;
  unreadableIds: string[];
  migrated: number;
  conflicts: number;
  failed: number;
};

export type RekeyReport = {
  apply: boolean;
  targets: TargetReport[];
  totals: {
    alreadyCurrent: number;
    migratable: number;
    unreadable: number;
    migrated: number;
    conflicts: number;
    failed: number;
  };
};

export async function runRekey(
  io: RekeyIO,
  keyring: Keyring,
  opts: { apply: boolean; targets?: RekeyTarget[] },
): Promise<RekeyReport> {
  const reports: TargetReport[] = [];

  for (const target of opts.targets ?? REKEY_TARGETS) {
    const rep: TargetReport = {
      table: target.table,
      field: target.field,
      available: true,
      total: 0,
      alreadyCurrent: 0,
      migratable: 0,
      unreadableIds: [],
      migrated: 0,
      conflicts: 0,
      failed: 0,
    };

    let rows: RawRow[];
    try {
      rows = await io.fetchRows(target);
    } catch (err) {
      if (err instanceof TargetUnavailableError) {
        rep.available = false;
        reports.push(rep);
        continue;
      }
      throw err;
    }

    for (const row of rows) {
      const plan = planRow(row, keyring);
      if (plan.state === "empty") continue;
      rep.total++;
      if (plan.state === "already_current") {
        rep.alreadyCurrent++;
      } else if (plan.state === "unreadable") {
        rep.unreadableIds.push(plan.id);
      } else {
        rep.migratable++;
        if (opts.apply && plan.from && plan.to) {
          try {
            const changed = await io.updateRow(target, plan.id, plan.from, plan.to);
            if (changed) rep.migrated++;
            else rep.conflicts++;
          } catch {
            rep.failed++;
          }
        }
      }
    }
    reports.push(rep);
  }

  const sum = (f: (r: TargetReport) => number) => reports.reduce((a, r) => a + f(r), 0);
  return {
    apply: opts.apply,
    targets: reports,
    totals: {
      alreadyCurrent: sum((r) => r.alreadyCurrent),
      migratable: sum((r) => r.migratable),
      unreadable: sum((r) => r.unreadableIds.length),
      migrated: sum((r) => r.migrated),
      conflicts: sum((r) => r.conflicts),
      failed: sum((r) => r.failed),
    },
  };
}

/** ¿Queda algo sin migrar o ilegible tras esta ejecución? */
export function hasPendingWork(report: RekeyReport): boolean {
  const t = report.totals;
  const pendingMigrations = report.apply ? t.migratable - t.migrated : t.migratable;
  return pendingMigrations > 0 || t.unreadable > 0 || t.failed > 0;
}
