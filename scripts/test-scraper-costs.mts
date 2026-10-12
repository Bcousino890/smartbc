/**
 * Test de lib/scrapers/cost-model.ts (coste real en créditos: suma por el árbol de zonas, proyección a
 * 30 días y comparación con el presupuesto). Sin red ni base de datos.
 *
 *   npm run test:scraper-costs
 */
import assert from "node:assert/strict";
import {
  NO_ZONE_KEY,
  emptyComponents,
  listingOnlyEstimate,
  monthView,
  project30,
  rollupZoneCosts,
  sumComponents,
  type ComponentCredits,
  type CostsPayload,
  type PortalCosts,
} from "../lib/scrapers/cost-model.ts";
import {
  CREDITS_PER_REQUEST,
  DEFAULT_SETTINGS,
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  SUGGESTED_KEY_LIMIT,
  TASKS,
  WORKER_ID,
  ZONE_PORTALS,
  runPortal,
  type ScraperZone,
} from "../lib/scrapers/control-types.ts";

const zone = (zone_key: string, parent_key: string | null, extra: Partial<ScraperZone> = {}): ScraperZone => ({
  portal: "idealista",
  zone_key,
  label: zone_key,
  scope: "capital",
  parent_key,
  priority: "normal",
  sale_active: true,
  rent_active: true,
  listings_sale: null,
  listings_rent: null,
  listings_private: null,
  ...extra,
});
const comps = (o: Partial<ComponentCredits>): ComponentCredits => ({ ...emptyComponents(), ...o });

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ok  ${name}`);
};

test("project30: ritmo × 30 / días, reactivación sin extrapolar", () => {
  const p = project30(comps({ listado: 70, fichas: 14, reactivacion: 40 }), 7);
  assert.equal(p.listado, 300);
  assert.equal(p.fichas, 60);
  assert.equal(p.reactivacion, 40);
  assert.equal(sumComponents(p), 400);
  assert.equal(sumComponents(project30(comps({ listado: 10 }), 0)), 0, "sin días medidos no se proyecta");
});

test("rollup: cada zona suma lo suyo y lo de todos sus descendientes", () => {
  const zones = [zone("madrid/chamberi", null, { listings_private: 100 }), zone("madrid/chamberi/gaztambide", "madrid/chamberi"), zone("madrid/centro", null)];
  const pc: PortalCosts = {
    totalCredits: 0,
    components: emptyComponents(),
    tasks: [],
    unattributed: emptyComponents(),
    leaves: [
      { zone_key: "madrid/chamberi", components: comps({ listado: 70 }) }, // páginas del distrito
      { zone_key: "madrid/chamberi/gaztambide", components: comps({ fichas: 14 }) },
      { zone_key: "madrid/centro", components: comps({ verificacion: 7 }) },
      { zone_key: "alcobendas-madrid", components: comps({ otros: 7 }) }, // no está en scraper_zones: solo suma a sí misma
    ],
  };
  const r = rollupZoneCosts(zones, pc, 7);
  assert.equal(r.get("madrid/chamberi")!.total, 84);
  assert.equal(r.get("madrid/chamberi")!.projectedTotal, 360);
  assert.equal(r.get("madrid/chamberi")!.perListing, 3.6, "créditos/mes por anuncio de particular");
  assert.equal(r.get("madrid/chamberi/gaztambide")!.total, 14);
  assert.equal(r.get("madrid/centro")!.total, 7);
  assert.equal(r.get("alcobendas-madrid")!.total, 7);
  assert.equal(rollupZoneCosts(zones, null, 7).size, 0);
});

test("rollup: un ciclo en parent_key no cuelga", () => {
  const zones = [zone("a", "b"), zone("b", "a")];
  const pc: PortalCosts = { totalCredits: 0, components: emptyComponents(), tasks: [], unattributed: emptyComponents(), leaves: [{ zone_key: "a", components: comps({ listado: 7 }) }] };
  const r = rollupZoneCosts(zones, pc, 7);
  assert.equal(r.get("a")!.total, 7);
  assert.equal(r.get("b")!.total, 7);
});

test("cota baja antigua: solo listado, nunca inventa", () => {
  assert.equal(listingOnlyEstimate({ portal: "idealista", listings_sale: 300, listings_rent: 0 }), 201);
  assert.equal(listingOnlyEstimate({ portal: "fotocasa", listings_sale: 300, listings_rent: 0 }), 99);
  assert.equal(listingOnlyEstimate({ portal: "idealista", listings_sale: null, listings_rent: null }), null);
});

const payload = (idealista: ComponentCredits, fotocasa: ComponentCredits | null, days = 7): CostsPayload => ({
  tableReady: true,
  hasData: true,
  from: "2026-10-05",
  to: "2026-10-12",
  daysMeasured: days,
  provisional: false,
  projectionDays: days,
  portals: {
    idealista: { totalCredits: sumComponents(idealista), components: idealista, tasks: [], leaves: [], unattributed: emptyComponents() },
    fotocasa: fotocasa ? { totalCredits: sumComponents(fotocasa), components: fotocasa, tasks: [], leaves: [], unattributed: emptyComponents() } : null,
  },
});

test("monthView: total del mes frente al presupuesto", () => {
  // 7 días: 175.000 (Idealista) + 35.000 (Fotocasa) => 750.000 + 150.000 a 30 días
  const m = monthView(payload(comps({ listado: 175_000 }), comps({ fichas: 35_000 })), 750_000, 118_000, 20)!;
  assert.equal(m.projected30, 900_000);
  assert.equal(m.pctOfBudget, 120);
  assert.equal(m.tone, "over");
  assert.equal(m.endOfPeriod, 118_000 + 30_000 * 20);
  const ok = monthView(payload(comps({ listado: 70_000 }), null), 750_000, 50_000, 10)!;
  assert.equal(ok.projected30, 300_000);
  assert.equal(ok.tone, "ok");
  const warn = monthView(payload(comps({ listado: 150_000 }), null), 750_000, 300_000, 10)!;
  assert.equal(warn.projected30, 642_857);
  assert.equal(warn.tone, "warn");
  assert.equal(monthView({ ...payload(comps({}), null), hasData: false }, 750_000, null, 10), null);
});

test("el gasto sin zona no entra en ninguna zona", () => {
  assert.equal(NO_ZONE_KEY, "(sin zona)");
});

test("portales nuevos: pisos y habitaclia", () => {
  assert.deepEqual([...SCRAPER_PORTALS], ["idealista", "fotocasa", "pisos", "habitaclia"]);
  assert.deepEqual([...ZONE_PORTALS], ["idealista", "fotocasa"]);
  assert.equal(PORTAL_LABEL.pisos, "Pisos.com");
  assert.equal(WORKER_ID.pisos, "vps-pisos");
  assert.equal(WORKER_ID.habitaclia, "vps-habitaclia");
  assert.deepEqual(CREDITS_PER_REQUEST, { idealista: 2, fotocasa: 1, pisos: 1, habitaclia: 1 });
  assert.deepEqual(TASKS.pisos.map((t) => t.type), ["pisos-radar", "pisos-verify"]);
  assert.deepEqual(TASKS.habitaclia.map((t) => t.type), ["habitaclia-sweep", "habitaclia-verify"]);
  assert.equal(SUGGESTED_KEY_LIMIT.pisos, 15_000);
  assert.equal(SUGGESTED_KEY_LIMIT.habitaclia, 5_000);
  // Apagados por defecto.
  assert.equal(DEFAULT_SETTINGS.pisosEnabled, false);
  assert.equal(DEFAULT_SETTINGS.habitacliaEnabled, false);
});

test("las ejecuciones se reparten por portal según el run_type", () => {
  assert.equal(runPortal("discovery"), "idealista");
  assert.equal(runPortal("verify"), "idealista");
  assert.equal(runPortal("fotocasa-radar"), "fotocasa");
  assert.equal(runPortal("pisos-radar"), "pisos");
  assert.equal(runPortal("pisos-verify"), "pisos");
  assert.equal(runPortal("habitaclia-sweep"), "habitaclia");
  assert.equal(runPortal("habitaclia-verify"), "habitaclia");
  // Cada tarea declarada pertenece a su portal.
  for (const p of SCRAPER_PORTALS) for (const t of TASKS[p]) assert.equal(runPortal(t.type), p);
});

console.log(`${n} pruebas OK`);
