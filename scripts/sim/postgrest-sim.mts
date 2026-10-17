// SOLO PRUEBAS LOCALES. Simulador mínimo de PostgREST (la API REST de
// Supabase) para probar el build de producción sin ninguna base de datos real.
//
//   · Escucha SOLO en 127.0.0.1. No se conecta a nada.
//   · Sirve tablas en memoria cargadas de un JSON sintético.
//   · Respeta lo que la app pide de verdad: las columnas del `select` (con las
//     relaciones anidadas tal como están en el JSON) y los filtros eq, neq,
//     in, is, gt, gte, lt, lte, ilike, además de order, limit y offset.
//     Si la app pide una columna, la recibe; si no la pide, no.
//   · `Accept: application/vnd.pgrst.object+json` (single) → un objeto, o 406.
//   · Una tabla desconocida devuelve []. Una escritura devuelve 201/204 sin
//     guardar. Las RPC devuelven null. Todo queda en el registro de
//     peticiones, para poder comprobar qué consultas hizo la app.
//
//   node --experimental-strip-types scripts/sim/postgrest-sim.mts <puerto> <datos.json> <registro.jsonl>
import { appendFileSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type Row = Record<string, unknown>;

/** Divide por comas de primer nivel (respeta paréntesis). */
export function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Proyecta una fila según el `select` de PostgREST (sin renombres de tipo). */
export function project(row: Row, select: string | null): Row {
  if (!select || select.trim() === "*") return { ...row };
  const out: Row = {};
  for (const part of splitTop(select)) {
    if (part === "*") {
      for (const [k, v] of Object.entries(row)) if (!(k in out)) out[k] = v;
      continue;
    }
    const m = part.match(/^(?:([a-zA-Z_][\w]*):)?([a-zA-Z_][\w]*)(?:!\w+)?(?:\((.*)\))?$/s);
    if (!m) continue;
    const [, alias, name, inner] = m;
    const key = alias ?? name;
    if (!(name in row)) continue;
    const v = row[name];
    if (inner === undefined) out[key] = v;
    else if (Array.isArray(v)) out[key] = v.map((x) => (x && typeof x === "object" ? project(x as Row, inner) : x));
    else if (v && typeof v === "object") out[key] = project(v as Row, inner);
    else out[key] = v ?? null;
  }
  return out;
}

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function same(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null;
  return String(a) === String(b);
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** Aplica los filtros de la query string. Devuelve también los no entendidos. */
export function applyFilters(rows: Row[], params: URLSearchParams): { rows: Row[]; unknown: string[] } {
  const unknown: string[] = [];
  let out = rows;
  for (const [col, raw] of params) {
    if (RESERVED.has(col)) continue;
    const dot = raw.indexOf(".");
    const neg = raw.startsWith("not.");
    const expr = neg ? raw.slice(4) : raw;
    const d = neg ? expr.indexOf(".") : dot;
    const op = expr.slice(0, d);
    const val = expr.slice(d + 1);
    let test: ((r: Row) => boolean) | null = null;
    const get = (r: Row) => r[col];
    switch (op) {
      case "eq":
        test = (r) => same(get(r), parseValue(val));
        break;
      case "neq":
        test = (r) => !same(get(r), parseValue(val));
        break;
      case "is":
        test = (r) => (val === "null" ? get(r) === null || get(r) === undefined : get(r) === parseValue(val));
        break;
      case "in": {
        const list = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
        test = (r) => list.some((x) => same(get(r), x));
        break;
      }
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const cmp = (r: Row) => {
          const a = get(r);
          if (a === null || a === undefined) return false;
          const na = Number(a);
          const nb = Number(val);
          const [x, y] = Number.isNaN(na) || Number.isNaN(nb) ? [String(a), val] : [na, nb];
          return op === "gt" ? x > y : op === "gte" ? x >= y : op === "lt" ? x < y : x <= y;
        };
        test = cmp;
        break;
      }
      case "ilike": {
        const re = new RegExp("^" + val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*") + "$", "i");
        test = (r) => re.test(String(get(r) ?? ""));
        break;
      }
      default:
        unknown.push(`${col}=${raw}`);
    }
    if (test) {
      const t = test;
      out = out.filter((r) => (neg ? !t(r) : t(r)));
    }
  }
  return { rows: out, unknown };
}

export function applyOrder(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const keys = order.split(",").map((o) => {
    const [col, dir = "asc"] = o.split(".");
    return { col, desc: dir === "desc" };
  });
  return rows.slice().sort((a, b) => {
    for (const { col, desc } of keys) {
      const x = a[col] as string | number | null;
      const y = b[col] as string | number | null;
      if (x === y) continue;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const c = x < y ? -1 : 1;
      return desc ? -c : c;
    }
    return 0;
  });
}

function startServer(port: number, dataFile: string, logFile: string) {
  const tables = JSON.parse(readFileSync(dataFile, "utf8")) as Record<string, Row[]>;
  const log = (entry: Record<string, unknown>) => appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...entry }) + "\n");

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const method = req.method ?? "GET";
    const path = url.pathname;
    // Se consume el cuerpo (escrituras y RPC) sin guardarlo.
    req.resume();

    if (path.startsWith("/rest/v1/rpc/")) {
      log({ method, path, kind: "rpc" });
      return send(res, 200, null);
    }
    const m = path.match(/^\/rest\/v1\/([a-zA-Z_]\w*)$/);
    if (!m) {
      log({ method, path, kind: "other" });
      return send(res, 404, { message: "no simulado" });
    }
    const table = m[1];
    if (method !== "GET" && method !== "HEAD") {
      log({ method, path, table, kind: "write" });
      return send(res, method === "DELETE" ? 204 : 201, method === "DELETE" ? undefined : []);
    }
    const known = table in tables;
    const { rows: filtered, unknown } = applyFilters(known ? tables[table] : [], url.searchParams);
    let rows = applyOrder(filtered, url.searchParams.get("order"));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.get("limit");
    rows = rows.slice(offset, limit ? offset + Number(limit) : undefined);
    const projected = rows.map((r) => project(r, url.searchParams.get("select")));
    log({ method, path, table, known, query: url.search, returned: projected.length, unknown });
    const accept = req.headers["accept"] ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      if (projected.length !== 1) return send(res, 406, { code: "PGRST116", details: `Results contain ${projected.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
      return send(res, 200, projected[0]);
    }
    return send(res, 200, projected, { "Content-Range": `0-${Math.max(0, projected.length - 1)}/${filtered.length}` });
  });
  server.listen(port, "127.0.0.1", () => console.log(`postgrest-sim en http://127.0.0.1:${port} (${Object.keys(tables).join(", ")})`));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const [port, dataFile, logFile] = process.argv.slice(2);
  startServer(Number(port), dataFile, logFile);
}
