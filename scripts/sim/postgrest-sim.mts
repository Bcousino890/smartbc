// SOLO PRUEBAS LOCALES. Simulador mínimo de PostgREST (la API REST de
// Supabase) para probar el build de producción sin ninguna base de datos real.
//
//   · Escucha SOLO en 127.0.0.1. No se conecta a nada.
//   · RPC: si el JSON trae `rpc.<función>`, responde con ese valor; si es un
//     objeto con la clave `byArg`, elige la respuesta por el valor del primer
//     argumento del cuerpo (p. ej. el token). Si no, null.
//   · `/img/<archivo>`: sirve imágenes de la carpeta indicada (4.º argumento);
//     si no existe, 404.
//   · Sirve tablas en memoria cargadas de un JSON sintético.
//   · Respeta lo que la app pide de verdad: las columnas del `select` (con las
//     relaciones anidadas tal como están en el JSON) y los filtros eq, neq,
//     in, is, gt, gte, lt, lte, ilike y `or=(…)` de condiciones simples,
//     además de order, limit y offset.
//     Si la app pide una columna, la recibe; si no la pide, no.
//   · `Accept: application/vnd.pgrst.object+json` (single) → un objeto, o 406.
//   · Una tabla desconocida devuelve []. Una escritura devuelve 201/204 sin
//     guardar. Las RPC devuelven null. Todo queda en el registro de
//     peticiones, para poder comprobar qué consultas hizo la app.
//
//   · Opcional `--auth`: sirve `GET /auth/v1/user` SOLO para los tokens
//     sintéticos de la clave `auth.users` del JSON (token → usuario). Cualquier
//     otro token, o ninguno, recibe 401. No hay login, refresco ni escrituras.
//   · Opcional `--latency <ms>`: espera SIMULADA antes de cada respuesta, para
//     modelar el viaje de red a Supabase. Queda anotada en cada línea del
//     registro (`simLatencyMs`): un tiempo medido así no es un tiempo real.
//
//   node --experimental-strip-types scripts/sim/postgrest-sim.mts <puerto> <datos.json> <registro.jsonl> [carpeta-imágenes] [--auth] [--latency <ms>]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
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
    // `or=(a.eq.1,b.eq.2)`: basta con que una condición simple se cumpla.
    // Las anidadas (`and(…)`, `or(…)`) no se simulan y quedan como desconocidas.
    if (col === "or" && /^\(.*\)$/s.test(raw)) {
      const parts = splitTop(raw.slice(1, -1)).map((c) => {
        const i = c.indexOf(".");
        return [c.slice(0, i), c.slice(i + 1)] as const;
      });
      if (parts.some(([c, v]) => !c || /^(and|or)\(/.test(c) || v.startsWith("("))) {
        unknown.push(`${col}=${raw}`);
        continue;
      }
      out = out.filter((r) => parts.some(([c, v]) => applyFilters([r], new URLSearchParams([[c, v]])).rows.length === 1));
      continue;
    }
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

type Options = { auth: boolean; latencyMs: number };

function startServer(port: number, dataFile: string, logFile: string, imgDir: string | null, opts: Options) {
  const all = JSON.parse(readFileSync(dataFile, "utf8")) as Record<string, unknown>;
  const rpcs = (all.rpc ?? {}) as Record<string, unknown>;
  const authUsers = ((all.auth as { users?: Record<string, Row> } | undefined)?.users ?? {}) as Record<string, Row>;
  const tables = Object.fromEntries(Object.entries(all).filter(([k]) => k !== "rpc" && k !== "auth")) as Record<string, Row[]>;
  const log = (entry: Record<string, unknown>) =>
    appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...entry, ...(opts.latencyMs ? { simLatencyMs: opts.latencyMs } : {}) }) + "\n");

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const method = req.method ?? "GET";
    const path = url.pathname;
    if (path.startsWith("/img/")) {
      const file = imgDir ? join(imgDir, basename(path)) : "";
      req.resume();
      if (!imgDir || !existsSync(file)) {
        log({ method, path, kind: "img", status: 404 });
        res.writeHead(404);
        return res.end();
      }
      const body = readFileSync(file);
      log({ method, path, kind: "img", status: 200, bytes: body.length });
      res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(body.length) });
      return res.end(body);
    }
    if (opts.auth && path === "/auth/v1/user" && method === "GET") {
      req.resume();
      const token = (req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
      const user = token ? authUsers[token] : undefined;
      log({ method, path, kind: "auth", hit: Boolean(user) });
      if (!user) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, user);
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.slice("/rest/v1/rpc/".length);
      let raw = "";
      req.setEncoding("utf8");
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        let args: Record<string, unknown> = {};
        try {
          args = raw ? JSON.parse(raw) : {};
        } catch {
          /* cuerpo vacío o no JSON */
        }
        const def = rpcs[fn] as { byArg?: Record<string, unknown> } | undefined;
        const first = Object.values(args)[0];
        const out = def && typeof def === "object" && "byArg" in def ? (def.byArg?.[String(first)] ?? null) : (def ?? null);
        log({ method, path, kind: "rpc", fn, arg: typeof first === "string" ? first.slice(0, 6) + "…" : null, hit: out !== null });
        send(res, 200, out);
      });
      return;
    }
    // Se consume el cuerpo (escrituras) sin guardarlo.
    req.resume();
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
    // `bytes`: tamaño del JSON SERIALIZADO que devuelve esta lectura (sin
    // comprimir), con los datos sintéticos. No es el tamaño almacenado en la BD.
    const bytes = Buffer.byteLength(JSON.stringify(projected));
    log({ method, path, table, known, query: url.search, returned: projected.length, bytes, unknown });
    const accept = req.headers["accept"] ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      if (projected.length !== 1) return send(res, 406, { code: "PGRST116", details: `Results contain ${projected.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
      return send(res, 200, projected[0]);
    }
    return send(res, 200, projected, { "Content-Range": `0-${Math.max(0, projected.length - 1)}/${filtered.length}` });
  };
  const server = createServer((req, res) => {
    if (opts.latencyMs > 0) setTimeout(() => handle(req, res), opts.latencyMs);
    else handle(req, res);
  });
  server.listen(port, "127.0.0.1", () => console.log(`postgrest-sim en http://127.0.0.1:${port} (${Object.keys(tables).join(", ")})`));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  const args = process.argv.slice(2);
  const auth = args.includes("--auth");
  const li = args.indexOf("--latency");
  const latencyMs = li >= 0 ? Number(args[li + 1]) || 0 : 0;
  const positional = args.filter((a, i) => !a.startsWith("--") && !(li >= 0 && i === li + 1));
  const [port, dataFile, logFile, imgDir] = positional;
  startServer(Number(port), dataFile, logFile, imgDir ?? null, { auth, latencyMs });
}
