import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  DEFAULT_SETTINGS,
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  TASKS,
  WORKER_ID,
  ZONE_PRIORITIES,
  billingPeriod,
  runPortal,
  isValidCrawioKey,
  keyHint,
  type KeyInfo,
  type Light,
  type ScraperControlPayload,
  type ScraperControlUpdate,
  type ScraperHealth,
  type ScraperMode,
  type ScraperOperations,
  type ScraperPortal,
  type ScraperSettingsPublic,
  type ScraperTask,
  type ScraperZone,
} from "./control-types";

/**
 * Lado servidor del control del crawler (tablas `scraper_settings` y
 * `scraper_zones`, migración 0181) + estado que el crawler escribe en
 * `idealista_scraper_workers` / `idealista_scraper_runs`.
 *
 * Reglas de seguridad:
 *  - Se usa el service role, así que el permiso se comprueba SIEMPRE antes (en la ruta).
 *  - La clave completa de Crawio entra por `applyUpdate` y se guarda, pero NINGUNA
 *    función de lectura la devuelve: solo `hint` y `label`.
 *  - El panel solo escribe priority de las zonas; los listings_* son del crawler.
 */

// Sin tipos generados para estas tablas nuevas: cast laxo como el resto de ajustes del repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Un latido más viejo que esto = «sin señal» (el mismo umbral del contrato). */
const STALE_MINUTES = 30;

/** Error de entrada del usuario: la ruta lo convierte en un 400 con el mensaje en español. */
export class ControlInputError extends Error {}

function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  // 42P01 = tabla no existe (Postgres); PGRST205 = PostgREST aún no la ve en su caché.
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message ?? "");
}

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
function ops(v: unknown, fallback: ScraperOperations): ScraperOperations {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { sale: bool(o.sale, fallback.sale), rent: bool(o.rent, fallback.rent) };
  }
  return fallback;
}

type SettingRow = { key: string; value: unknown };

function parseSettings(rows: SettingRow[]): { settings: ScraperSettingsPublic; keys: Record<ScraperPortal, KeyInfo> } {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_SETTINGS;
  const settings: ScraperSettingsPublic = {
    planCredits: num(m.get("crawio.plan_credits"), d.planCredits),
    budgetCredits: num(m.get("crawio.budget_credits"), d.budgetCredits),
    reserveCredits: num(m.get("crawio.reserve_credits"), d.reserveCredits),
    billingDay: num(m.get("crawio.billing_day"), d.billingDay),
    idealistaEnabled: bool(m.get("idealista.enabled"), d.idealistaEnabled),
    idealistaOperations: ops(m.get("idealista.operations"), d.idealistaOperations),
    agenciesEnabled: bool(m.get("idealista.agencies_enabled"), d.agenciesEnabled),
    verifyDays: num(m.get("idealista.verify_days"), d.verifyDays),
    fotocasaEnabled: bool(m.get("fotocasa.enabled"), d.fotocasaEnabled),
    fotocasaOperations: ops(m.get("fotocasa.operations"), d.fotocasaOperations),
    pisosEnabled: bool(m.get("pisos.enabled"), d.pisosEnabled),
    pisosOperations: ops(m.get("pisos.operations"), d.pisosOperations),
    habitacliaEnabled: bool(m.get("habitaclia.enabled"), d.habitacliaEnabled),
    habitacliaOperations: ops(m.get("habitaclia.operations"), d.habitacliaOperations),
  };
  const keyInfo = (portal: ScraperPortal): KeyInfo => {
    const v = m.get(`crawio.key.${portal}`) as { key?: unknown; hint?: unknown; label?: unknown } | undefined;
    // «Configurada» = hay una clave guardada; el valor en sí no sale de aquí.
    const configured = !!v && typeof v.key === "string" && v.key.length > 0;
    return {
      configured,
      hint: configured ? (typeof v?.hint === "string" ? v.hint : keyHint(v!.key as string)) : null,
      label: configured && typeof v?.label === "string" ? v.label : null,
    };
  };
  return { settings, keys: { idealista: keyInfo("idealista"), fotocasa: keyInfo("fotocasa"), pisos: keyInfo("pisos"), habitaclia: keyInfo("habitaclia") } };
}

type WorkerRow = {
  worker_id: string;
  status: string | null;
  last_heartbeat_at: string | null;
  current_run_type: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};
type RunRow = {
  worker_id: string | null;
  run_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  new_listings: number;
  errors_count: number;
  requests_used: number;
  error_summary: string | null;
};

function modeOf(v: unknown): ScraperMode | null {
  return v === "normal" || v === "ahorro" || v === "pausa" ? v : null;
}

function buildHealth(
  portal: ScraperPortal,
  enabled: boolean,
  worker: WorkerRow | undefined,
  runs: RunRow[],
  nowMs: number,
): ScraperHealth {
  const meta = (worker?.metadata ?? {}) as Record<string, unknown>;
  const beat = worker?.last_heartbeat_at ?? null;
  const minutes = beat ? Math.max(0, (nowMs - new Date(beat).getTime()) / 60_000) : null;
  const reported = worker?.status ?? null;
  const mode = modeOf(meta.mode) ?? (reported === "pausa" ? "pausa" : reported === "ahorro" ? "ahorro" : worker ? "normal" : null);
  const alarms: string[] = [];

  // Una fila por tarea real; `runs` viene de más nueva a más vieja, así que la primera de cada tipo es la última.
  const nextRuns = (meta.next_runs && typeof meta.next_runs === "object" ? meta.next_runs : {}) as Record<string, unknown>;
  const tasks: ScraperTask[] = TASKS[portal].map((t) => {
    const r = runs.find((x) => x.run_type === t.type);
    const next = nextRuns[t.type];
    return {
      runType: t.type,
      label: t.label,
      help: t.help,
      status: r?.status ?? null,
      startedAt: r?.started_at ?? null,
      finishedAt: r?.finished_at ?? null,
      requestsUsed: r?.requests_used ?? null,
      newListings: r?.new_listings ?? null,
      errorsCount: r?.errors_count ?? null,
      errorSummary: r?.error_summary ?? null,
      nextRunAt: typeof next === "string" ? next : null,
    };
  });
  const run = runs[0];

  let light: Light = "verde";
  let headline = "Funcionando";

  if (!worker || minutes == null) {
    light = "rojo";
    headline = "Sin señal";
    alarms.push("El crawler todavía no ha dado ninguna señal de vida.");
  } else if (minutes > STALE_MINUTES) {
    light = "rojo";
    headline = "Sin señal";
    alarms.push(`Hace más de ${STALE_MINUTES} minutos que no da señales: puede estar parado o caído.`);
  } else if (reported === "relay_down") {
    light = "rojo";
    headline = "Crawio no responde";
    alarms.push("El crawler no consigue hablar con Crawio. No se está descargando nada.");
  } else if (mode === "pausa") {
    light = "rojo";
    headline = "En pausa";
    alarms.push("Se ha alcanzado el presupuesto mensual de créditos: no se escanea hasta la próxima renovación o hasta que lo subas.");
  } else if (mode === "ahorro") {
    light = "ambar";
    headline = "Modo ahorro";
    alarms.push("Quedan pocos créditos del presupuesto: solo se hace lo esencial (altas de particulares).");
  } else if (reported === "degradado") {
    light = "ambar";
    headline = "Funcionando con fallos";
    alarms.push("El crawler avisa de que algo no va del todo bien.");
  }

  if (run && run.status === "failed" && light === "verde") {
    light = "ambar";
    headline = "Última tarea fallida";
  }
  if (run && run.status === "failed") alarms.push(`La última tarea (${run.run_type}) terminó con error${run.error_summary ? `: ${run.error_summary.slice(0, 160)}` : "."}`);
  if (worker?.message && light !== "verde") alarms.push(worker.message.slice(0, 200));

  // Un scraper apagado desde el panel no es una avería: se muestra aparte y sin alarmas.
  if (!enabled) {
    light = "apagado";
    headline = "Desactivado en el panel";
    alarms.length = 0;
  }

  return {
    portal,
    light,
    headline,
    lastHeartbeatAt: beat,
    minutesSinceHeartbeat: minutes,
    mode,
    reportedStatus: reported,
    message: worker?.message ?? null,
    currentRunType: worker?.current_run_type ?? null,
    creditsPeriod: typeof meta.credits_period === "number" ? meta.credits_period : null,
    keyHint: typeof meta.key_hint === "string" ? meta.key_hint : null,
    lastPrivateFoundAt: typeof meta.last_private_found_at === "string" ? meta.last_private_found_at : null,
    tasks,
    alarms,
  };
}

/** PostgREST devuelve como mucho 1.000 filas por petición y hay más zonas que eso: se lee por páginas. */
async function readAllZones(db: Db, columns: string): Promise<{ data: unknown[]; error: { code?: string; message?: string } | null }> {
  const out: unknown[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await db
      .from("scraper_zones")
      .select(columns)
      .order("portal", { ascending: true })
      .order("zone_key", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

/** Lee todo lo que necesita el diálogo. Nunca incluye la clave de Crawio. */
export async function loadControl(canEdit: boolean): Promise<ScraperControlPayload> {
  const db = createAdminClient() as Db;
  const now = new Date();

  const [settingsRes, zonesRes, workersRes] = await Promise.all([
    db.from("scraper_settings").select("key,value"),
    readAllZones(db, "portal,zone_key,label,scope,parent_key,priority,sale_active,rent_active,listings_sale,listings_rent,listings_private"),
    db
      .from("idealista_scraper_workers")
      .select("worker_id,status,last_heartbeat_at,current_run_type,message,metadata")
      .in("worker_id", Object.values(WORKER_ID)),
  ]);

  const tablesReady = !isMissingTable(settingsRes.error) && !isMissingTable(zonesRes.error);
  if (tablesReady && (settingsRes.error || zonesRes.error)) {
    // Cualquier otro fallo (red, permisos) sí es un error real: que lo vea la interfaz.
    console.error("[scraper-control] error leyendo:", settingsRes.error?.message ?? zonesRes.error?.message);
    throw new Error("No se pudo leer la configuración");
  }

  const { settings, keys } = parseSettings((settingsRes.data ?? []) as SettingRow[]);
  const zones: Record<ScraperPortal, ScraperZone[]> = { idealista: [], fotocasa: [], pisos: [], habitaclia: [] };
  for (const z of (zonesRes.data ?? []) as ScraperZone[]) {
    if (SCRAPER_PORTALS.includes(z.portal)) zones[z.portal].push(z);
  }

  // Últimas ejecuciones (de todas las tareas) y reparto por portal según el run_type.
  const runsRes = await db
    .from("idealista_scraper_runs")
    .select("worker_id,run_type,status,started_at,finished_at,new_listings,errors_count,requests_used,error_summary")
    .order("started_at", { ascending: false })
    .limit(300);
  const allRuns = ((runsRes.data ?? []) as RunRow[]);
  const runBy: Record<ScraperPortal, RunRow[]> = {
    idealista: allRuns.filter((r) => runPortal(r.run_type) === "idealista"),
    fotocasa: allRuns.filter((r) => runPortal(r.run_type) === "fotocasa"),
    pisos: allRuns.filter((r) => runPortal(r.run_type) === "pisos"),
    habitaclia: allRuns.filter((r) => runPortal(r.run_type) === "habitaclia"),
  };
  const workerBy = new Map(((workersRes.data ?? []) as WorkerRow[]).map((w) => [w.worker_id, w]));

  const enabledBy: Record<ScraperPortal, boolean> = {
    idealista: settings.idealistaEnabled,
    fotocasa: settings.fotocasaEnabled,
    pisos: settings.pisosEnabled,
    habitaclia: settings.habitacliaEnabled,
  };
  const health = Object.fromEntries(
    SCRAPER_PORTALS.map((p) => [p, buildHealth(p, enabledBy[p], workerBy.get(WORKER_ID[p]), runBy[p], now.getTime())]),
  ) as Record<ScraperPortal, ScraperHealth>;

  // Créditos del periodo: el crawler escribe el consumo total de la cuenta de Crawio en su latido.
  // Se toma el dato del latido más reciente que lo traiga.
  const withCredits = SCRAPER_PORTALS.map((p) => health[p])
    .filter((h) => h.creditsPeriod != null && h.lastHeartbeatAt)
    .sort((a, b) => new Date(b.lastHeartbeatAt!).getTime() - new Date(a.lastHeartbeatAt!).getTime())[0];
  const creditsPeriod = withCredits?.creditsPeriod ?? null;

  let mode: ScraperMode | null = SCRAPER_PORTALS.map((p) => health[p].mode).find((m) => m != null) ?? null;
  if (creditsPeriod != null) {
    mode =
      creditsPeriod >= settings.budgetCredits ? "pausa" : creditsPeriod >= settings.budgetCredits - settings.reserveCredits ? "ahorro" : "normal";
  }

  const period = billingPeriod(now, settings.billingDay);
  return {
    tablesReady,
    canEdit,
    zones,
    settings,
    keys,
    health,
    creditsPeriod,
    mode,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    serverNow: now.toISOString(),
  };
}

// ── Escritura ───────────────────────────────────────────────────────────────

function intIn(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new ControlInputError(`${what}: tiene que ser un número entero entre ${min.toLocaleString("es-ES")} y ${max.toLocaleString("es-ES")}.`);
  }
  return v;
}

function parseOps(v: unknown, what: string): ScraperOperations {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.sale !== "boolean" || typeof o.rent !== "boolean") {
    throw new ControlInputError(`${what}: formato no válido.`);
  }
  return { sale: o.sale, rent: o.rent };
}

function mustBool(v: unknown, what: string): boolean {
  if (typeof v !== "boolean") throw new ControlInputError(`${what}: formato no válido.`);
  return v;
}

/** Tope de zonas por petición (hay 50 en total; margen para crecer). */
const MAX_ZONE_UPDATES = 300;

/**
 * Valida TODO el cuerpo y luego guarda. Si algo no vale no se escribe nada
 * (la validación va entera antes de la primera escritura).
 */
export async function applyUpdate(body: unknown, profileId: string): Promise<void> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ControlInputError("Cuerpo no válido.");
  const upd = body as ScraperControlUpdate;
  const db = createAdminClient() as Db;
  const nowIso = new Date().toISOString();

  // Estado actual, para validar combinaciones (reserva < presupuesto) y etiquetas de clave.
  const cur = await db.from("scraper_settings").select("key,value");
  if (cur.error) {
    if (isMissingTable(cur.error)) throw new ControlInputError("La configuración aún no está instalada en el servidor (falta aplicar la migración 0181).");
    throw new Error("No se pudo leer la configuración");
  }
  const curRows = (cur.data ?? []) as SettingRow[];
  const { settings: curSettings } = parseSettings(curRows);
  const curMap = new Map(curRows.map((r) => [r.key, r.value as Record<string, unknown> | undefined]));

  // 1) Ajustes
  const settingRows: Array<{ key: string; value: unknown }> = [];
  const s = upd.settings;
  if (s !== undefined) {
    if (!s || typeof s !== "object" || Array.isArray(s)) throw new ControlInputError("Ajustes: formato no válido.");
    const known = ["budgetCredits", "reserveCredits", "idealistaEnabled", "idealistaOperations", "agenciesEnabled", "fotocasaEnabled", "fotocasaOperations", "pisosEnabled", "pisosOperations", "habitacliaEnabled", "habitacliaOperations"];
    for (const k of Object.keys(s)) if (!known.includes(k)) throw new ControlInputError(`Ajuste desconocido: ${k.slice(0, 40)}`);

    const budget = s.budgetCredits !== undefined ? intIn(s.budgetCredits, 10_000, 100_000_000, "Presupuesto mensual") : curSettings.budgetCredits;
    const reserve = s.reserveCredits !== undefined ? intIn(s.reserveCredits, 0, 100_000_000, "Reserva") : curSettings.reserveCredits;
    if (reserve >= budget) throw new ControlInputError("La reserva tiene que ser menor que el presupuesto mensual.");
    if (s.budgetCredits !== undefined) settingRows.push({ key: "crawio.budget_credits", value: budget });
    if (s.reserveCredits !== undefined) settingRows.push({ key: "crawio.reserve_credits", value: reserve });
    if (s.idealistaEnabled !== undefined) settingRows.push({ key: "idealista.enabled", value: mustBool(s.idealistaEnabled, "Idealista activo") });
    if (s.idealistaOperations !== undefined) settingRows.push({ key: "idealista.operations", value: parseOps(s.idealistaOperations, "Operaciones de Idealista") });
    if (s.agenciesEnabled !== undefined) settingRows.push({ key: "idealista.agencies_enabled", value: mustBool(s.agenciesEnabled, "Escanear agencias") });
    if (s.fotocasaEnabled !== undefined) settingRows.push({ key: "fotocasa.enabled", value: mustBool(s.fotocasaEnabled, "Fotocasa activo") });
    if (s.fotocasaOperations !== undefined) settingRows.push({ key: "fotocasa.operations", value: parseOps(s.fotocasaOperations, "Operaciones de Fotocasa") });
  }

  // 2) Claves de Crawio (la clave se recibe aquí y solo aquí; nunca se devuelve ni se registra)
  if (upd.keys !== undefined) {
    if (!upd.keys || typeof upd.keys !== "object" || Array.isArray(upd.keys)) throw new ControlInputError("Claves: formato no válido.");
    for (const portalKey of Object.keys(upd.keys)) {
      if (!(SCRAPER_PORTALS as readonly string[]).includes(portalKey)) throw new ControlInputError("Clave para un portal desconocido.");
      const portal = portalKey as ScraperPortal;
      const entry = (upd.keys as Record<string, { key?: unknown; label?: unknown }>)[portalKey];
      if (!entry || typeof entry.key !== "string") throw new ControlInputError(`Clave de ${PORTAL_LABEL[portal]}: formato no válido.`);
      const key = entry.key.trim();
      if (!isValidCrawioKey(key)) {
        throw new ControlInputError(`La clave de ${PORTAL_LABEL[portal]} no tiene el formato de Crawio (empieza por «rk-» y no lleva espacios).`);
      }
      let label: string;
      if (entry.label === undefined || entry.label === null || entry.label === "") {
        const prev = curMap.get(`crawio.key.${portal}`)?.label;
        label = typeof prev === "string" && prev ? prev : PORTAL_LABEL[portal];
      } else if (typeof entry.label === "string" && entry.label.trim().length <= 40) {
        label = entry.label.trim();
      } else {
        throw new ControlInputError("El nombre de la clave no puede pasar de 40 caracteres.");
      }
      settingRows.push({ key: `crawio.key.${portal}`, value: { key, hint: keyHint(key), label } });
    }
  }

  // 3) Zonas: solo prioridad, y solo de zonas que existen (una zona inventada no crea filas).
  const zoneGroups = new Map<string, string[]>(); // "portal|priority" → zone_keys
  if (upd.zones !== undefined) {
    if (!Array.isArray(upd.zones) || upd.zones.length > MAX_ZONE_UPDATES) throw new ControlInputError("Lista de zonas no válida.");
    const existing = await readAllZones(db, "portal,zone_key");
    if (existing.error) {
      if (isMissingTable(existing.error)) throw new ControlInputError("Las zonas aún no están instaladas en el servidor (falta aplicar la migración 0181).");
      throw new Error("No se pudieron leer las zonas");
    }
    const valid = new Set((existing.data as Array<{ portal: string; zone_key: string }>).map((z) => `${z.portal}|${z.zone_key}`));
    for (const z of upd.zones) {
      if (!z || typeof z !== "object") throw new ControlInputError("Zona no válida.");
      if (!SCRAPER_PORTALS.includes(z.portal)) throw new ControlInputError("Portal de zona no válido.");
      if (typeof z.zone_key !== "string" || !valid.has(`${z.portal}|${z.zone_key}`)) {
        throw new ControlInputError(`Zona desconocida: ${String((z as { zone_key?: unknown }).zone_key).slice(0, 60)}`);
      }
      if (!ZONE_PRIORITIES.includes(z.priority)) throw new ControlInputError("Prioridad no válida (usa alta, normal o off).");
      const gk = `${z.portal}|${z.priority}`;
      const list = zoneGroups.get(gk) ?? [];
      list.push(z.zone_key);
      zoneGroups.set(gk, list);
    }
  }

  // ── Todo validado: ahora sí se escribe ──
  if (settingRows.length > 0) {
    const { error } = await db
      .from("scraper_settings")
      .upsert(settingRows.map((r) => ({ ...r, updated_at: nowIso, updated_by: profileId })), { onConflict: "key" });
    if (error) {
      console.error("[scraper-control] error guardando ajustes:", error.message);
      throw new Error("No se pudieron guardar los ajustes");
    }
  }
  for (const [gk, keys] of zoneGroups) {
    const [portal, priority] = gk.split("|");
    // En trozos: cientos de claves en una sola URL pasarían el límite de tamaño de la API.
    for (let i = 0; i < keys.length; i += 60) {
      const { error } = await db
        .from("scraper_zones")
        .update({ priority, updated_at: nowIso, updated_by: profileId })
        .eq("portal", portal)
        .in("zone_key", keys.slice(i, i + 60));
      if (error) {
        console.error("[scraper-control] error guardando zonas:", error.message);
        throw new Error("No se pudieron guardar las zonas");
      }
    }
  }
}
