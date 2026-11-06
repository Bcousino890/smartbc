// ============================================================================
// SOLO PRUEBAS LOCALES (BCP-01 P5). Un cliente con la forma mínima de
// supabase-js (from/select/filtros/insert/update/delete/rpc y storage) que
// traduce cada llamada a SQL y la ejecuta con `psql` contra el Postgres
// TEMPORAL de scripts/sql/run-local.sh (127.0.0.1:54329, base bcp_test), con
// SET ROLE service_role — así se prueban también los permisos de 0214.
// Storage: en memoria (buckets → ruta → bytes).
//
// Se niega a funcionar con cualquier otro destino y limpia del entorno las
// variables de conexión heredadas. Nunca lee .env. Solo cubre lo que usan
// lib/imports/drafts.ts, lib/catalogs/owner.ts y lib/sync/watermark.ts.
// ============================================================================
import { execFile } from "node:child_process";

const PSQL = "/opt/homebrew/opt/postgresql@16/bin/psql";
const ENV: Record<string, string> = {
  PATH: "/usr/bin:/bin",
  PGHOST: "127.0.0.1",
  PGPORT: "54329",
  PGUSER: "bcp_test",
  PGDATABASE: "bcp_test",
};
// Opt-in: sin psql local, ejecuta el mismo SQL dentro de un contenedor Postgres
// DESECHABLE (solo nombres encargos-pg-test*; nunca `supabase-db`).
const DOCKER = process.env.ENCARGOS_PG_CONTAINER ?? "";
if (DOCKER && !/^encargos-pg-test[a-z0-9-]*$/.test(DOCKER)) throw new Error("shim: contenedor no permitido");
const PSQL_CMD = DOCKER ? "/usr/bin/docker" : PSQL;
const PSQL_ARGS = DOCKER ? ["exec", "-i", DOCKER, "psql", "-U", "postgres", "-d", "postgres"] : [];
if (ENV.PGHOST !== "127.0.0.1" || ENV.PGPORT !== "54329" || ENV.PGDATABASE !== "bcp_test") throw new Error("shim: destino inesperado");

type Err = { message: string; code: string };
type Res<T = any> = { data: T; error: Err | null };

export const sqlLog: string[] = [];

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`shim: identificador no válido ${s}`);
  return `"${s}"`;
};

export function runSql(sql: string): Promise<Res<string>> {
  sqlLog.push(sql);
  const input = `\\set ON_ERROR_STOP 1\n\\set VERBOSITY verbose\nSET ROLE service_role;\n${sql};\n`;
  return new Promise((resolve) => {
    const p = execFile(PSQL_CMD, [...PSQL_ARGS, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"], { env: ENV, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const m = stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/);
        return resolve({ data: "", error: { code: m?.[1] ?? "XX000", message: m?.[2]?.trim() ?? stderr.trim() } });
      }
      resolve({ data: stdout.trim(), error: null });
    });
    p.stdin!.end(input);
  });
}

// ── Filtros lógicos de PostgREST: .or("a.eq.1,and(b.gt.2,c.is.null)") ───────
function splitTop(str: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = false, cur = "";
  for (const ch of str) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
const colExpr = (c: string) => (c.includes("->>") ? c.split("->>").map((x, i) => (i === 0 ? ident(x) : lit(x))).join("->>") : ident(c));
function logicSql(term: string, joiner: "AND" | "OR"): string {
  const t = term.trim();
  const g = t.match(/^(and|or)\((.*)\)$/s);
  if (g) return `(${splitTop(g[2]).map((x) => logicSql(x, g[1] === "and" ? "AND" : "OR")).join(` ${g[1].toUpperCase()} `)})`;
  void joiner;
  const m = t.match(/^([^.]+)\.([a-z]+)\.(.*)$/s);
  if (!m) throw new Error(`shim: filtro no soportado ${t}`);
  const [, c, op, raw] = m;
  const col = colExpr(c);
  let v = raw;
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  const sqlOps: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
  if (op === "is") return `${col} IS ${v === "null" ? "NULL" : v}`;
  if (op === "ilike" || op === "like") return `${col} ${op.toUpperCase()} ${lit(v.replace(/\*/g, "%"))}`;
  if (op === "cs") return `${col}::text[] @> ${lit(v)}::text[]`;
  if (sqlOps[op]) return `${col} ${sqlOps[op]} ${lit(v)}`;
  throw new Error(`shim: operador no soportado ${op}`);
}

class Query implements PromiseLike<Res> {
  private where: string[] = [];
  private orderBy = "";
  private lim = "";
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private payload: any = null;
  private returning = false;
  private single = false;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private table: string;
  constructor(table: string) {
    this.table = table;
  }
  select(cols = "*") {
    if (this.mode === "select") this.cols = cols;
    else this.returning = true;
    return this;
  }
  insert(row: any) {
    this.mode = "insert";
    this.payload = row;
    return this;
  }
  upsert(rows: any, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = "upsert";
    this.payload = rows;
    this.upsertOpts = opts;
    return this;
  }
  update(patch: any) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.where.push(v === null ? `${ident(c)} IS NULL` : `${ident(c)} = ${lit(v)}`);
    return this;
  }
  neq(c: string, v: unknown) {
    this.where.push(`${ident(c)} IS DISTINCT FROM ${lit(v)}`);
    return this;
  }
  is(c: string, v: null) {
    this.where.push(`${ident(c)} IS ${v === null ? "NULL" : lit(v)}`);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.where.push(vs.length ? `${ident(c)}::text IN (${vs.map(lit).join(", ")})` : "false");
    return this;
  }
  lt(c: string, v: unknown) {
    this.where.push(`${ident(c)} < ${lit(v)}`);
    return this;
  }
  gt(c: string, v: unknown) {
    this.where.push(`${ident(c)} > ${lit(v)}`);
    return this;
  }
  gte(c: string, v: unknown) {
    this.where.push(`${ident(c)} >= ${lit(v)}`);
    return this;
  }
  lte(c: string, v: unknown) {
    this.where.push(`${ident(c)} <= ${lit(v)}`);
    return this;
  }
  or(expr: string) {
    this.where.push(`(${splitTop(expr).map((x) => logicSql(x, "OR")).join(" OR ")})`);
    return this;
  }
  not(c: string, op: string, v: unknown) {
    if (op !== "is" && op !== "eq") throw new Error(`shim: not.${op} no soportado`);
    this.where.push(`NOT (${ident(c)} ${op === "is" ? "IS" : "="} ${v === null ? "NULL" : lit(v)})`);
    return this;
  }
  ilike(c: string, v: string) {
    this.where.push(`${ident(c)} ILIKE ${lit(v)}`);
    return this;
  }
  order(c: string, o: { ascending?: boolean } = {}) {
    this.orderBy = ` ORDER BY ${ident(c)} ${o.ascending === false ? "DESC" : "ASC"}`;
    return this;
  }
  limit(n: number) {
    this.lim = ` LIMIT ${Math.floor(n)}`;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  private colList() {
    if (this.cols.trim() === "*") return "*";
    return this.cols
      .split(",")
      .map((c) => {
        const x = c.trim();
        // Incrustación mínima: property_photos(id) → lista JSON de sus filas.
        const emb = x.match(/^(property_photos)\(([a-z_]+)\)$/);
        if (emb) return `(SELECT coalesce(json_agg(json_build_object('${emb[2]}', c.${ident(emb[2])})), '[]'::json) FROM ${ident(emb[1])} c WHERE c.property_id = ${ident(this.table)}.id) AS ${ident(emb[1])}`;
        // Alias: nombre:columna->>clave
        const al = x.match(/^([a-z_]+):(.+)$/);
        if (al) return `${colExpr(al[2])} AS ${ident(al[1])}`;
        return ident(x);
      })
      .join(", ");
  }
  private sql(): string {
    const t = ident(this.table);
    const w = this.where.length ? ` WHERE ${this.where.join(" AND ")}` : "";
    const ret = this.returning || this.single ? " RETURNING *" : "";
    if (this.mode === "select") return `SELECT coalesce(json_agg(x), '[]') FROM (SELECT ${this.colList()} FROM ${t}${w}${this.orderBy}${this.lim}) x`;
    if (this.mode === "delete") return `WITH d AS (DELETE FROM ${t}${w} RETURNING *) SELECT coalesce(json_agg(d), '[]') FROM d`;
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
    const keys = [...new Set(rows.flatMap((r: object) => Object.keys(r)))].map(ident);
    const json = lit(JSON.stringify(rows));
    if (this.mode === "update") {
      const tuple = keys.length === 1 ? keys[0] : `(${keys.join(", ")})`;
      const sub = keys.length === 1 ? `(SELECT ${keys[0]} FROM json_populate_record(null::${t}, (${json}::json)->0))` : `(SELECT ${keys.join(", ")} FROM json_populate_record(null::${t}, (${json}::json)->0))`;
      return `WITH u AS (UPDATE ${t} SET ${tuple} = ${sub}${w} RETURNING *) SELECT coalesce(json_agg(u), '[]') FROM u`;
    }
    const conflict = this.mode === "upsert" ? ` ON CONFLICT (${(this.upsertOpts.onConflict ?? "id").split(",").map((c) => ident(c.trim())).join(", ")}) DO NOTHING` : "";
    return `WITH i AS (INSERT INTO ${t} (${keys.join(", ")}) SELECT ${keys.join(", ")} FROM json_populate_recordset(null::${t}, ${json}::json)${conflict} RETURNING *) SELECT coalesce(json_agg(i), '[]') FROM i`;
  }
  async run(): Promise<Res> {
    const r = await runSql(this.sql());
    if (r.error) return { data: null, error: r.error };
    const rows = JSON.parse(r.data || "[]");
    return { data: this.single ? rows[0] ?? null : this.mode === "select" || this.returning ? rows : null, error: null };
  }
  then<A, B>(ok?: ((v: Res) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, ko);
  }
}

const argCache = new Map<string, { names: string[]; types: string[] }>();
async function rpc(fn: string, args: Record<string, unknown>): Promise<Res> {
  if (!argCache.has(fn)) {
    const r = await runSql(`SELECT json_build_object('n', proargnames, 't', proargtypes::regtype[]::text[]) FROM pg_proc WHERE proname = ${lit(fn)} LIMIT 1`);
    if (r.error || !r.data) return { data: null, error: r.error ?? { message: `función ${fn} no existe`, code: "42883" } };
    const j = JSON.parse(r.data);
    argCache.set(fn, { names: j.n ?? [], types: j.t ?? [] });
  }
  const { names, types } = argCache.get(fn)!;
  const parts = Object.entries(args).map(([k, v]) => {
    const i = names.indexOf(k);
    if (i < 0) throw new Error(`shim: ${fn} no tiene el argumento ${k}`);
    const ty = types[i];
    if (v === null || v === undefined) return `${ident(k)} => NULL::${ty}`;
    if (ty === "jsonb" || ty === "json") return `${ident(k)} => ${lit(JSON.stringify(v))}::${ty}`;
    if (ty.endsWith("[]")) return `${ident(k)} => ARRAY[${(v as unknown[]).map(lit).join(", ")}]::${ty}`;
    return `${ident(k)} => ${lit(typeof v === "object" ? JSON.stringify(v) : v)}::${ty}`;
  });
  const r = await runSql(`SELECT json_build_object('v', ${ident(fn)}(${parts.join(", ")}))`);
  if (r.error) return { data: null, error: r.error };
  return { data: JSON.parse(r.data).v, error: null };
}

// ── Storage en memoria ──────────────────────────────────────────────────────
export const storage = new Map<string, Map<string, Buffer>>();
const bucket = (b: string) => {
  if (!storage.has(b)) storage.set(b, new Map());
  return storage.get(b)!;
};
export let storageFailNext = 0;
export function __failStorage(n: number) {
  storageFailNext = n;
}
const storageApi = {
  from(b: string) {
    return {
      async upload(path: string, data: Buffer | Uint8Array, _o?: unknown) {
        if (storageFailNext > 0) {
          storageFailNext--;
          return { data: null, error: { message: "storage caído (simulado)" } };
        }
        bucket(b).set(path, Buffer.from(data));
        return { data: { path }, error: null };
      },
      async download(path: string) {
        const v = bucket(b).get(path);
        return v ? { data: new Blob([new Uint8Array(v)]), error: null } : { data: null, error: { message: "not found" } };
      },
      async remove(paths: string[]) {
        for (const p of paths) bucket(b).delete(p);
        return { data: paths, error: null };
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `https://storage.test/${b}/${path}` } };
      },
    };
  },
};

export function createAdminClient() {
  return { from: (t: string) => new Query(t), rpc, storage: storageApi };
}
export const createClient = async () => createAdminClient();
