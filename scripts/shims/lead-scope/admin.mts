// Doble en memoria de createAdminClient para las pruebas de alcance de leads.
// Evalúa el subconjunto de PostgREST que usa la bandeja y apunta cada consulta
// (tabla, filtros y filas devueltas) en globalThis.__leadDb.log.
type Row = Record<string, unknown>;
type Db = { tables: Record<string, Row[]>; log: Array<{ table: string; ops: string[]; returned: number }> };
const g = globalThis as unknown as { __leadDb: Db };

function query(table: string) {
  let rows: Row[] = [...(g.__leadDb.tables[table] ?? [])];
  const ops: string[] = [];
  let head = false;
  let single = false;
  const finish = () => {
    g.__leadDb.log.push({ table, ops, returned: rows.length });
    const data = single ? (rows[0] ?? null) : head ? null : rows;
    return { data, count: rows.length, error: null };
  };
  const api: Record<string, unknown> = {
    select(_c: string, o?: { head?: boolean }) { head = !!o?.head; ops.push("select"); return api; },
    eq(c: string, v: unknown) { ops.push(`eq:${c}`); rows = rows.filter((r) => r[c] === v); return api; },
    neq(c: string, v: unknown) { ops.push(`neq:${c}`); rows = rows.filter((r) => r[c] !== v); return api; },
    is(c: string, v: unknown) { ops.push(`is:${c}`); rows = rows.filter((r) => (r[c] ?? null) === v); return api; },
    in(c: string, vs: unknown[]) { ops.push(`in:${c}:${vs.length}`); rows = rows.filter((r) => vs.includes(r[c])); return api; },
    not(c: string, op: string, v: unknown) {
      ops.push(`not:${c}`);
      if (op === "is") rows = rows.filter((r) => (r[c] ?? null) !== v);
      else if (op === "in") { const vs = String(v).replace(/[()]/g, "").split(","); rows = rows.filter((r) => !vs.includes(String(r[c]))); }
      return api;
    },
    or(expr: string) {
      ops.push(`or:${expr}`);
      const parts = expr.split(",").map((p) => p.split("."));
      rows = rows.filter((r) => parts.some(([c, op, v]) => (op === "eq" ? r[c] === v : op === "is" && v === "null" ? (r[c] ?? null) === null : false)));
      return api;
    },
    order() { return api; },
    limit(n: number) { rows = rows.slice(0, n); return api; },
    range(a: number, b: number) { rows = rows.slice(a, b + 1); return api; },
    maybeSingle() { single = true; return Promise.resolve(finish()); },
    single() { single = true; return Promise.resolve(finish()); },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(finish()).then(res, rej); },
  };
  return api;
}

export function createAdminClient() {
  return { from: (t: string) => query(t), rpc: () => Promise.resolve({ data: null, error: null }) };
}
