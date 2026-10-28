// SOLO PRUEBAS LOCALES (Idealista API → CRM, I2). Escenarios de publish.ts con
// los fakes de scripts/shims/idealista-publish/: misma ficha y mismas
// respuestas de Idealista para la versión base (3f8ad3b2) y la nueva, para
// comparar EXACTAMENTE las llamadas a Idealista (nombre + argumentos).
// Lo usan scripts/gen-idealista-publish-baseline.mts y test-idealista-crm-sync.mts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { IdealistaApiError } from "../lib/services/idealista/partner-api/client.ts";

const g = globalThis as any;

export const LISTING_ID = "00000000-0000-4000-8000-0000000a1001";

export function baseListing(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LISTING_ID,
    property_id: null,
    is_inspo: true,
    inspo_title: "Piso luminoso en Chamberí",
    reference_code: "BC-7001",
    property_type: "flat",
    operation: "rent",
    price: 2400,
    square_meters: 80,
    built_square_meters: 90,
    bedrooms: 2,
    bathrooms: 1,
    floor: "3",
    is_last_floor: false,
    condition: "good",
    address_street: "Calle de Prueba",
    address_number: "12",
    address_postal_code: "28010",
    address_city: "Madrid",
    address_visibility: "street",
    latitude: 40.433,
    longitude: -3.704,
    windows_location: "external",
    description: "Piso exterior de dos dormitorios.",
    contact_id: null,
    has_elevator: true,
    has_terrace: true,
    photo_ids: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
    plan_ids: ["https://cdn.test/plano.jpg"],
    video_ids: ["https://cdn.test/v.mp4"],
    api_property_id: null,
    api_clone_property_id: null,
    api_virtual_tour_url: null,
    api_state: null,
    ...extra,
  };
}

type Scenario = { name: string; action: string; listing: Record<string, unknown>; respond: (n: string, a: unknown[]) => unknown };

export const SCENARIOS: Scenario[] = [
  {
    name: "alta",
    action: "publish",
    listing: baseListing(),
    respond: (n) =>
      n === "createProperty" ? { propertyId: 9001, state: "active", success: true }
      : n === "findImages" || n === "findVideos" ? []
      : {},
  },
  {
    name: "actualización",
    action: "publish",
    listing: baseListing({ api_property_id: 9001, api_state: "active" }),
    respond: (n) =>
      n === "updateProperty" ? { propertyId: 9001, state: "active", success: true }
      : n === "findImages" || n === "findVideos" ? [{ videoId: 5 }].filter(() => n === "findVideos")
      : {},
  },
  {
    name: "alta rechazada (400)",
    action: "publish",
    listing: baseListing(),
    respond: (n) => (n === "createProperty" ? new IdealistaApiError("Bad request", 400, "{}", ["campo"]) : {}),
  },
  {
    name: "baja",
    action: "deactivate",
    listing: baseListing({ api_property_id: 9001, api_state: "active" }),
    respond: () => ({ state: "inactive" }),
  },
  {
    name: "reactivación",
    action: "reactivate",
    listing: baseListing({ api_property_id: 9001, api_state: "inactive" }),
    respond: () => ({ state: "active" }),
  },
  {
    name: "comprobar estado",
    action: "refresh",
    listing: baseListing({ api_property_id: 9001, api_state: "active" }),
    respond: (n) => (n === "findProperty" ? { propertyId: 9001, state: "active" } : n === "findImages" ? [] : {}),
  },
];

/** Respuestas por defecto de las RPC de la sincronización (versión nueva). */
export function defaultRpc() {
  let seq = 100;
  return async (fn: string) => {
    switch (fn) {
      case "idealista_create_guard": return { data: { allowed: true }, error: null };
      case "idealista_op_begin": return { data: ++seq, error: null };
      case "idealista_op_finish": return { data: "recorded", error: null };
      case "idealista_op_step": return { data: null, error: null };
      case "idealista_crm_plan": return { data: { target: { state: "none" }, enabled: false, applied_seq: 0 }, error: null };
      case "apply_idealista_crm_sync": return { data: { status: "disabled" }, error: null };
      default: return { data: null, error: null };
    }
  };
}

export async function runScenario(mod: any, s: Scenario, opts: { rpc?: any; failWrites?: string[] } = {}) {
  process.env.NEXT_PUBLIC_PORTAL_URL = "https://portal.test";
  g.__idealista = { calls: [], events: [], respond: s.respond, sandbox: false };
  g.__db = { tables: { idealista_listings: [{ ...s.listing }], idealista_api_log: [] }, rpcCalls: [], failWrites: new Set(opts.failWrites ?? []), rpc: opts.rpc ?? defaultRpc() };
  const fn =
    s.action === "publish" ? mod.publishListingViaApi
    : s.action === "deactivate" ? mod.deactivateListingViaApi
    : s.action === "reactivate" ? mod.reactivateListingViaApi
    : mod.refreshListingStateViaApi;
  const outcome = await fn(LISTING_ID);
  return { outcome, calls: g.__idealista.calls as Array<{ name: string; args: unknown[] }>, events: g.__idealista.events as string[], rpcCalls: g.__db.rpcCalls as Array<{ fn: string; args: any }>, db: g.__db.tables };
}
