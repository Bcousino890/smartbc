// SOLO PRUEBAS LOCALES. Sustituye lib/db/admin.ts para probar publish.ts sin
// base: idealista_listings / idealista_api_log en memoria y las RPC de la
// sincronización resueltas por globalThis.__db.rpc (por defecto, éxito).
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
g.__db ??= { tables: {} as Record<string, any[]>, rpcCalls: [] as any[], failWrites: new Set<string>(), rpc: null as any };
function table(t: string) {
  return (g.__db.tables[t] ??= []);
}
class Q implements PromiseLike<any> {
  t: string; op = "select"; payload: any = null; filters: Array<[string, unknown]> = []; single = false;
  constructor(t: string) { this.t = t; }
  select() { return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.single = true; return this; }
  then<A, B>(ok?: (v: any) => A, ko?: (e: unknown) => B) { return this.run().then(ok, ko); }
  async run() {
    g.__idealista?.events?.push(`db:${this.op}:${this.t}`);
    const rows = table(this.t);
    const match = (r: any) => this.filters.every(([c, v]) => r[c] === v);
    if (this.op !== "select" && g.__db.failWrites.has(`${this.op}:${this.t}`)) return { data: null, error: { message: `fallo simulado ${this.op} ${this.t}` } };
    if (this.op === "insert") { (Array.isArray(this.payload) ? this.payload : [this.payload]).forEach((r: any) => rows.push({ ...r })); return { data: null, error: null }; }
    if (this.op === "update") { rows.filter(match).forEach((r: any) => Object.assign(r, this.payload)); return { data: null, error: null }; }
    if (this.op === "delete") { g.__db.tables[this.t] = rows.filter((r: any) => !match(r)); return { data: null, error: null }; }
    const found = rows.filter(match);
    return { data: this.single ? found[0] ?? null : found, error: null };
  }
}
export function createAdminClient() {
  return {
    from: (t: string) => new Q(t),
    rpc: async (fn: string, args: any) => {
      g.__db.rpcCalls.push({ fn, args });
      g.__idealista?.events?.push(`rpc:${fn}`);
      if (g.__db.rpc) return g.__db.rpc(fn, args);
      return { data: null, error: { message: "sin rpc configurada" } };
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://s.test/${p}` } }), remove: async () => ({}) , download: async () => ({ data: null, error: { message: "no" } }) }) },
  };
}
