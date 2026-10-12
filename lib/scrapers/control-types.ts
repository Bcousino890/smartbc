/**
 * Control del crawler desde el panel: tipos, constantes y validaciones COMPARTIDAS
 * entre la API (servidor) y el diálogo «Configuración de scrapers» (navegador).
 * Aquí no hay nada de servidor ni de base de datos: se importa desde ambos lados.
 *
 * Contrato con el crawler: /opt/idealista-dev/CONTRATO-CONTROL.md
 */

export type ScraperPortal = "idealista" | "fotocasa";
export const SCRAPER_PORTALS: readonly ScraperPortal[] = ["idealista", "fotocasa"];
export const PORTAL_LABEL: Record<ScraperPortal, string> = { idealista: "Idealista", fotocasa: "Fotocasa" };

/** Identificador con el que cada crawler firma su latido en `idealista_scraper_workers`. */
export const WORKER_ID: Record<ScraperPortal, string> = { idealista: "vps-crawler", fotocasa: "vps-fotocasa" };

export type ZonePriority = "alta" | "normal" | "off";
export const ZONE_PRIORITIES: readonly ZonePriority[] = ["alta", "normal", "off"];

export type ZoneScope = "capital" | "provincia";

export type ScraperZone = {
  portal: ScraperPortal;
  zone_key: string;
  label: string;
  scope: ZoneScope;
  /** zone_key del padre (distrito de un barrio…); null = zona de primer nivel. Lo publica el crawler. */
  parent_key: string | null;
  /** 'off' = sin marcar = NO se scrapea. 'normal' y 'alta' = marcada. */
  priority: ZonePriority;
  sale_active: boolean;
  rent_active: boolean;
  /** Los rellena el crawler; null = todavía no ha contado. */
  listings_sale: number | null;
  listings_rent: number | null;
  listings_private: number | null;
};

export type KeyInfo = {
  configured: boolean;
  /** «rk-5ee…fad4»: lo único que se ve de la clave. */
  hint: string | null;
  label: string | null;
};

export type ScraperOperations = { sale: boolean; rent: boolean };

/** Ajustes que el panel muestra/edita (sin ninguna clave completa). */
export type ScraperSettingsPublic = {
  planCredits: number;
  budgetCredits: number;
  reserveCredits: number;
  billingDay: number;
  idealistaEnabled: boolean;
  idealistaOperations: ScraperOperations;
  agenciesEnabled: boolean;
  verifyDays: number;
  fotocasaEnabled: boolean;
  fotocasaOperations: ScraperOperations;
};

export const DEFAULT_SETTINGS: ScraperSettingsPublic = {
  planCredits: 750_000,
  budgetCredits: 350_000,
  reserveCredits: 30_000,
  billingDay: 8,
  idealistaEnabled: true,
  idealistaOperations: { sale: true, rent: true },
  agenciesEnabled: true,
  verifyDays: 2,
  fotocasaEnabled: false,
  fotocasaOperations: { sale: true, rent: true },
};

export type ScraperMode = "normal" | "ahorro" | "pausa";
export type Light = "verde" | "ambar" | "rojo" | "apagado";

/** Tareas reales del crawler: una fila en idealista_scraper_runs por ejecución, con este run_type. */
export const TASKS: Record<ScraperPortal, Array<{ type: string; label: string; help: string }>> = {
  idealista: [
    { type: "discovery", label: "Buscar anuncios nuevos", help: "Mira lo recién publicado en venta y alquiler (cada pocos minutos)." },
    { type: "agencies", label: "Vigilar agencias", help: "Controla precio y bajas de las agencias." },
    { type: "sweep", label: "Barrido completo", help: "Recorre todo el mercado para detectar cambios." },
    { type: "refresh", label: "Refrescar fichas", help: "Vuelve a abrir fichas antiguas para ver si cambiaron." },
    { type: "phones", label: "Reintentar teléfonos", help: "Intenta de nuevo conseguir teléfonos que faltaban." },
    { type: "verify", label: "Comprobar bajas", help: "Confirma si un anuncio sigue publicado." },
    { type: "sync", label: "Enviar al CRM", help: "Pasa lo encontrado a la lista de particulares." },
  ],
  fotocasa: [
    { type: "fotocasa-radar", label: "Radar de particulares", help: "Los particulares más recientes, cada pocos minutos." },
    { type: "fotocasa-safety", label: "Red de seguridad", help: "Segunda vigilancia por si el radar se deja algo." },
    { type: "fotocasa-sweep", label: "Barrido por zonas", help: "Recorre zona por zona." },
    { type: "fotocasa-verify", label: "Comprobar bajas", help: "Confirma si un anuncio sigue publicado." },
  ],
};

export type ScraperTask = {
  runType: string;
  label: string;
  help: string;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  requestsUsed: number | null;
  newListings: number | null;
  errorsCount: number | null;
  errorSummary: string | null;
  /** De `metadata.next_runs` del latido; null si el crawler no la publica. */
  nextRunAt: string | null;
};

export type ScraperHealth = {
  portal: ScraperPortal;
  light: Light;
  /** Frase corta para el semáforo: «Funcionando», «Sin señal»… */
  headline: string;
  lastHeartbeatAt: string | null;
  minutesSinceHeartbeat: number | null;
  mode: ScraperMode | null;
  /** Estado que escribe el propio crawler ('ok', 'degradado', 'relay_down'…). */
  reportedStatus: string | null;
  message: string | null;
  currentRunType: string | null;
  creditsPeriod: number | null;
  keyHint: string | null;
  lastPrivateFoundAt: string | null;
  tasks: ScraperTask[];
  alarms: string[];
};

export type ScraperControlPayload = {
  /** false si la migración 0181 aún no se ha aplicado (no existen las tablas). */
  tablesReady: boolean;
  canEdit: boolean;
  zones: Record<ScraperPortal, ScraperZone[]>;
  settings: ScraperSettingsPublic;
  keys: Record<ScraperPortal, KeyInfo>;
  health: Record<ScraperPortal, ScraperHealth>;
  /** Créditos consumidos en el periodo actual según el último latido con dato. */
  creditsPeriod: number | null;
  /** Modo global que calcula el crawler (o se deduce del consumo). */
  mode: ScraperMode | null;
  periodStart: string;
  periodEnd: string;
  serverNow: string;
};

/** Cuerpo del PUT/POST. Todo opcional: solo se guarda lo que venga. */
export type ScraperControlUpdate = {
  zones?: Array<{ portal: ScraperPortal; zone_key: string; priority: ZonePriority }>;
  settings?: Partial<{
    budgetCredits: number;
    reserveCredits: number;
    idealistaEnabled: boolean;
    idealistaOperations: ScraperOperations;
    agenciesEnabled: boolean;
    fotocasaEnabled: boolean;
    fotocasaOperations: ScraperOperations;
  }>;
  keys?: Partial<Record<ScraperPortal, { key: string; label?: string }>>;
};

// ── Validación de la clave de Crawio ────────────────────────────────────────

/** Formato «rk-…»: letras, números, guion y guion bajo; sin espacios. */
export const CRAWIO_KEY_RE = /^rk-[A-Za-z0-9_-]{8,200}$/;

export function isValidCrawioKey(key: string): boolean {
  return CRAWIO_KEY_RE.test(key);
}

/** «rk-5ee…fad4»: los 6 primeros y los 4 últimos caracteres. */
export function keyHint(key: string): string {
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

// ── Coste estimado por zona (créditos de Crawio al mes) ─────────────────────
//
// Fuente: /opt/idealista-dev/research/Uso-Crawio-proyecciones-2026-10-12.xlsx,
// hoja «Zonas», columna «B créditos/mes» (diseño propuesto, 2 créditos por
// petición a Idealista) y hoja «Fotocasa» (1 crédito por petición). Son
// estimaciones por anuncio, no mediciones: la interfaz las rotula «aprox.».

export const IDEALISTA_ZONE_CREDITS: Record<string, number> = {
  "madrid/centro": 29861,
  "madrid/salamanca": 20354,
  "madrid/chamberi": 16928,
  "madrid/tetuan": 15535,
  "madrid/chamartin": 10943,
  "madrid/ciudad-lineal": 10305,
  "madrid/arganzuela": 9572,
  "madrid/carabanchel": 8935,
  "madrid/retiro": 8822,
  "madrid/fuencarral-el-pardo": 8346,
  "madrid/hortaleza": 8180,
  "madrid/moncloa-aravaca": 7863,
  "madrid/puente-de-vallecas": 7802,
  "madrid/latina": 7169,
  "madrid/san-blas-canillejas": 5546,
  "madrid/usera": 4924,
  "madrid/villaverde": 4616,
  "madrid/villa-de-vallecas": 3862,
  "madrid/vicalvaro": 2758,
  "madrid/moratalaz": 2035,
  "madrid/barajas": 1719,
};

/** «Resto de la Comunidad» sale en el Excel como una sola zona; se reparte a partes iguales. */
const IDEALISTA_PROVINCIA_TOTAL = 63682;
const IDEALISTA_PROVINCIA_ZONES = 6;
/** Fotocasa: ≈3 páginas × venta/alquiler cada 6 h = 720 créditos/mes por zona. */
const FOTOCASA_ZONE_CREDITS = 720;

/** Créditos/mes que cuesta una zona en prioridad «Normal». */
export function baseZoneCredits(portal: ScraperPortal, zoneKey: string, scope: ZoneScope): number {
  if (portal === "fotocasa") return FOTOCASA_ZONE_CREDITS;
  // Las zonas las publica el crawler con la ruta real de Idealista: algunas difieren del
  // slug del Excel (barrio-de-salamanca = Salamanca). Los barrios (3 tramos) no tienen estimación propia.
  const parts = zoneKey.split("/");
  if (parts.length > 2) return 0;
  const slug = ZONE_ALIAS[zoneKey] ?? zoneKey;
  const known = IDEALISTA_ZONE_CREDITS[slug];
  if (known != null) return known;
  return scope === "provincia" ? Math.round(IDEALISTA_PROVINCIA_TOTAL / IDEALISTA_PROVINCIA_ZONES) : 0;
}

const ZONE_ALIAS: Record<string, string> = {
  "madrid/barrio-de-salamanca": "madrid/salamanca",
  "madrid/san-blas": "madrid/san-blas-canillejas",
};

/** Hay estimación para esta zona (si no, la interfaz no inventa un coste). */
export function hasZoneEstimate(portal: ScraperPortal, zoneKey: string, scope: ZoneScope): boolean {
  return baseZoneCredits(portal, zoneKey, scope) > 0;
}

/** Normal = coste base; Alta = como mucho el doble (se revisa el doble de seguido); No escanear = 0. */
export function zoneCredits(base: number, priority: ZonePriority): number {
  return priority === "off" ? 0 : priority === "alta" ? base * 2 : base;
}

// ── Periodo de facturación ──────────────────────────────────────────────────

/** Inicio y fin (inclusive) del periodo de Crawio que contiene `now`, según el día de renovación. */
export function billingPeriod(now: Date, billingDay: number): { start: Date; end: Date } {
  const day = Math.min(Math.max(Math.trunc(billingDay) || 1, 1), 28);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startThisMonth = new Date(Date.UTC(y, m, day));
  const start = now >= startThisMonth ? startThisMonth : new Date(Date.UTC(y, m - 1, day));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  return { start, end: new Date(next.getTime() - 86_400_000) };
}
