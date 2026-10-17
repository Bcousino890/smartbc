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
// Requisitos (el script los exige y se niega si no se cumplen):
//   - EMAIL_ENCRYPTION_KEY definida (≥ 32 caracteres, distinta de la de por
//     defecto): es la clave NUEVA con la que se re-cifra. Sin ella ni siquiera
//     simula (desde la fase F no existe clave por defecto).
//   - Para leer lo que aún esté con la clave anterior, declararla en
//     EMAIL_ENCRYPTION_KEY_PREVIOUS (la de por defecto del repositorio es
//     default-insecure-key-change-this).
//   - --apply además exige --backup-confirmed: confirmas la copia previa (5.2).
//
// Idempotente: lo que ya se descifra con la clave nueva no se toca; se puede
// parar y repetir. Escritura optimista por fila (solo si no cambió entretanto).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KeyringConfigError, getKeyring } from "../lib/crypto/keyring.ts";
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

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Desde la fase F no hay clave por defecto: EMAIL_ENCRYPTION_KEY (la NUEVA) es
// obligatoria incluso para simular. Los datos que aún estén con la clave
// anterior se leen declarándola en EMAIL_ENCRYPTION_KEY_PREVIOUS (para los que
// siguen con la clave por defecto del repositorio:
// EMAIL_ENCRYPTION_KEY_PREVIOUS=default-insecure-key-change-this).
let keyring: ReturnType<typeof getKeyring>;
try {
  keyring = getKeyring(process.env);
} catch (err) {
  if (err instanceof KeyringConfigError) fail(err.message);
  throw err;
}

if (apply && !backupConfirmed) {
  fail("Falta --backup-confirmed: confirma que has hecho la copia previa (plan, apartado 5.2) y vuelve a lanzar.");
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
    `clave actual: definida · claves anteriores aceptadas: ${keyring.previous.length}\n`,
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
