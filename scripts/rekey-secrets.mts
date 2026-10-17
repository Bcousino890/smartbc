// Re-cifrado de secretos con la clave nueva (fase D de
// docs/PLAN_REKEY_EMAIL_ENCRYPTION.md).
//
// POR DEFECTO ES UNA SIMULACIÓN: lee, descifra en memoria y cuenta; no escribe.
// Nunca imprime valores en claro ni cifrados: solo recuentos e ids de fila.
//
//   Simulación:        node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/rekey-secrets.mts
//   Comprobar (exit 1 si queda algo):   ... scripts/rekey-secrets.mts --check
//   Aplicar:           ... scripts/rekey-secrets.mts --apply --backup-confirmed
//
// Requisitos para --apply (el script los exige y se niega si no se cumplen):
//   - EMAIL_ENCRYPTION_KEY definida (≥ 32 caracteres) y distinta de la de por
//     defecto: es la clave NUEVA con la que se re-cifra.
//   - --backup-confirmed: confirmas que has hecho la copia previa del plan (5.2).
//
// Idempotente: lo que ya se descifra con la clave nueva no se toca; se puede
// parar y repetir. Escritura optimista por fila (solo si no cambió entretanto).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ENCRYPTION_KEY, getKeyring } from "../lib/crypto/keyring.ts";
import {
  TargetUnavailableError,
  hasPendingWork,
  runRekey,
  type RekeyIO,
  type RekeyReport,
} from "../lib/crypto/rekey-plan.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Carga mínima de .env.local / .env.production (el script corre fuera de Next).
for (const file of [".env.local", ".env.production"]) {
  try {
    for (const line of readFileSync(join(ROOT, file), "utf-8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* el fichero puede no existir */
  }
}

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const check = args.has("--check");
const backupConfirmed = args.has("--backup-confirmed");

const keyring = getKeyring(process.env);

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (apply) {
  if (!process.env.EMAIL_ENCRYPTION_KEY) {
    fail("Para --apply hace falta EMAIL_ENCRYPTION_KEY (la clave NUEVA). Sin ella no hay nada que migrar.");
  }
  if (keyring.current === DEFAULT_ENCRYPTION_KEY) {
    fail("EMAIL_ENCRYPTION_KEY es igual a la clave por defecto: define una clave nueva.");
  }
  if (keyring.current.length < 32) {
    fail("EMAIL_ENCRYPTION_KEY es demasiado corta (mínimo 32 caracteres). Genera una con: openssl rand -base64 48");
  }
  if (!backupConfirmed) {
    fail("Falta --backup-confirmed: confirma que has hecho la copia previa (plan, apartado 5.2) y vuelve a lanzar.");
  }
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno / .env.local.");
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

// 42P01 = tabla inexistente, 42703 = columna inexistente (migración sin aplicar).
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const io: RekeyIO = {
  async fetchRows(t) {
    const { data, error } = await db
      .from(t.table)
      .select(`${t.idColumn}, ${t.encColumn}, ${t.ivColumn}`);
    if (error) {
      if (MISSING.has(error.code)) throw new TargetUnavailableError(t.table);
      throw new Error(`Error leyendo ${t.table}: ${error.code ?? ""} ${error.message}`);
    }
    return (data ?? []).map((r: Record<string, string | null>) => ({
      id: String(r[t.idColumn]),
      enc: r[t.encColumn],
      iv: r[t.ivColumn],
    }));
  },
  async updateRow(t, id, from, to) {
    const { data, error } = await db
      .from(t.table)
      .update({ [t.encColumn]: to.encrypted, [t.ivColumn]: to.iv })
      .eq(t.idColumn, id)
      .eq(t.encColumn, from.encrypted)
      .eq(t.ivColumn, from.iv)
      .select(t.idColumn);
    if (error) throw new Error(`Error escribiendo ${t.table}`);
    return Array.isArray(data) && data.length === 1;
  },
};

function print(report: RekeyReport): void {
  console.log(report.apply ? "\n== RE-CIFRADO (APLICADO) ==" : "\n== SIMULACIÓN (no se ha escrito nada) ==");
  console.log(
    `clave actual: ${keyring.current === DEFAULT_ENCRYPTION_KEY ? "POR DEFECTO (EMAIL_ENCRYPTION_KEY sin definir)" : "definida"} · claves anteriores aceptadas: ${keyring.previous.length}\n`,
  );
  for (const t of report.targets) {
    const name = `${t.table}.${t.field}`.padEnd(46);
    if (!t.available) {
      console.log(`${name} no existe en esta base (migración sin aplicar)`);
      continue;
    }
    if (t.total === 0) {
      console.log(`${name} vacío`);
      continue;
    }
    const parts = [
      `total ${t.total}`,
      `ya con la clave nueva ${t.alreadyCurrent}`,
      `migrables ${t.migratable}`,
      `ilegibles ${t.unreadableIds.length}`,
    ];
    if (report.apply) parts.push(`migrados ${t.migrated}`, `conflictos ${t.conflicts}`, `fallos ${t.failed}`);
    console.log(`${name} ${parts.join(" · ")}`);
    if (t.unreadableIds.length > 0) {
      console.log(`    ilegibles (ids): ${t.unreadableIds.join(", ")}`);
    }
  }
  const x = report.totals;
  console.log(
    `\nTOTAL · ya con la clave nueva ${x.alreadyCurrent} · migrables ${x.migratable} · ilegibles ${x.unreadable}` +
      (report.apply ? ` · migrados ${x.migrated} · conflictos ${x.conflicts} · fallos ${x.failed}` : ""),
  );
}

const report = await runRekey(io, keyring, { apply });
print(report);

const pending = hasPendingWork(report);
if (apply) {
  if (pending) {
    console.error("\n✗ Queda trabajo pendiente (conflictos, fallos o valores ilegibles). Revisa lo anterior y repite: es idempotente.");
    process.exit(1);
  }
  console.log("\n✓ Todo migrado. Repite sin --apply para confirmar que no queda nada.");
} else if (check) {
  if (pending) {
    console.error("\n✗ --check: todavía queda algo por migrar o ilegible.");
    process.exit(1);
  }
  console.log("\n✓ --check: nada pendiente.");
} else {
  console.log(
    report.totals.migratable > 0
      ? "\nSimulación terminada. Para aplicar: --apply --backup-confirmed (tras la copia previa)."
      : "\nSimulación terminada: nada que migrar.",
  );
}
