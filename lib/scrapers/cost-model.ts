/**
 * Coste REAL en créditos de Crawio: tipos y cálculo (puro, sin servidor: lo usan la API y el navegador).
 *
 * El crawler mide cada petición (libro de gasto, `crawio_gate.record`) y publica en `scraper_stats_daily`
 * (contrato: /opt/idealista-dev/CONTRATO-CONTROL.md, «GASTO REAL EN CRÉDITOS»):
 *   - zona '*' · tarea '*'            → total del portal por día
 *   - zona '*' · tarea concreta       → créditos por tarea
 *   - zona HOJA · tarea 'cmp:<comp>'  → créditos por zona y componente (solo la hoja, sin sumar a los padres)
 *   - zona '(sin zona)'               → gasto que no se puede atribuir a una zona (listado raíz, árbol…)
 *   - zona '*' · tarea 'cov:minutes'  → cobertura: minutos de ese día que el libro midió de verdad (en `credits`)
 * Aquí se suman las hojas por el árbol de zonas (`parent_key`) y se proyecta a 30 días con TODO el periodo medido:
 *   proyección = créditos medidos / días cubiertos × 30   (días cubiertos = Σ minutos / 1440; medio día cuenta medio)
 * («reactivación» es puntual: no se extrapola).
 */
import { creditsPerListing, zoneEstimateCredits, zoneListings, type ScraperPortal, type ScraperZone } from "./control-types";

export const COST_COMPONENTS = ["listado", "fichas", "verificacion", "refresco", "reactivacion", "otros"] as const;
export type CostComponent = (typeof COST_COMPONENTS)[number];

export const COMPONENT_LABEL: Record<CostComponent, string> = {
  listado: "Listado",
  fichas: "Fichas nuevas",
  verificacion: "Verificación de bajas",
  refresco: "Refresco",
  reactivacion: "Reactivaciones (puntual)",
  otros: "Otros",
};

export const COMPONENT_HELP: Record<CostComponent, string> = {
  listado: "Páginas de resultados que se recorren para ver lo publicado.",
  fichas: "Ficha (y teléfono) de cada anuncio nuevo que se encuentra, agencias incluidas.",
  verificacion: "Comprobar uno a uno si un anuncio sigue publicado (cuenta también los 404, que se cobran).",
  refresco: "Volver a abrir fichas conocidas para ver cambios, y reintentar teléfonos.",
  reactivacion: "Barrido de puesta al día al marcar una zona: es un gasto puntual, no se multiplica por el mes.",
  otros: "Recorrer el árbol de zonas, inicios de sesión y peticiones sin tarea.",
};

/** Zona que el crawler usa cuando no sabe a qué zona atribuir una petición. */
export const NO_ZONE_KEY = "(sin zona)";
export const COMPONENT_PREFIX = "cmp:";
/** Fila de cobertura del libro (zona '*'): `credits` = minutos medidos ese día. No es gasto. */
export const COVERAGE_TASK = "cov:minutes";
/** Plan de Crawio contratado (créditos al mes). El presupuesto guardado en ajustes es otra cosa. */
export const PLAN_CREDITS = 750_000;
/** Por debajo de estos días medidos la proyección es frágil: faltan tareas periódicas (barridos cada varios días). */
export const MIN_RELIABLE_DAYS = 7;

export type ComponentCredits = Record<CostComponent, number>;
export const emptyComponents = (): ComponentCredits => ({ listado: 0, fichas: 0, verificacion: 0, refresco: 0, reactivacion: 0, otros: 0 });
export const sumComponents = (c: ComponentCredits): number => COST_COMPONENTS.reduce((n, k) => n + c[k], 0);
export const isComponent = (v: string): v is CostComponent => (COST_COMPONENTS as readonly string[]).includes(v);

/** Lo que devuelve `GET …/scraper-control?costs=1` (sumado en la ventana, sin proyectar). */
export type PortalCosts = {
  /** Créditos medidos en la ventana según el total del portal (zona '*', tarea '*'). */
  totalCredits: number;
  /** Suma por componente de TODAS las zonas hoja y de «(sin zona)». */
  components: ComponentCredits;
  /** Créditos por tarea (zona '*', tarea concreta). */
  tasks: Array<{ task: string; credits: number }>;
  /** Créditos por zona hoja y componente (sin «(sin zona)»). */
  leaves: Array<{ zone_key: string; components: ComponentCredits }>;
  /** «(sin zona)»: gasto sin zona atribuible. */
  unattributed: ComponentCredits;
};

export type CostsPayload = {
  /** false si la tabla aún no existe. */
  tableReady: boolean;
  /** false mientras el crawler no haya publicado NADA medido con el libro de gasto. */
  hasData: boolean;
  from: string;
  to: string;
  /** Días con datos del libro (naturales, cualquiera que sea su cobertura). */
  daysMeasured: number;
  /** true si lo medido no llega a un día entero: la proyección es provisional. */
  provisional: boolean;
  /** Divisor de la proyección: días CUBIERTOS por el libro (Σ minutos medidos / 1440). */
  projectionDays: number;
  portals: Record<ScraperPortal, PortalCosts | null>;
};

/** Créditos de un conjunto de componentes proyectados a 30 días (reactivación = lo medido, sin extrapolar). */
export function project30(c: ComponentCredits, projectionDays: number): ComponentCredits {
  const out = emptyComponents();
  if (!(projectionDays > 0)) return out;
  for (const k of COST_COMPONENTS) out[k] = k === "reactivacion" ? c[k] : Math.round((c[k] * 30) / projectionDays);
  return out;
}

export type ZoneCost = {
  /** Medido en la ventana, con todos sus descendientes. */
  measured: ComponentCredits;
  total: number;
  /** Proyección a 30 días, con todos sus descendientes. */
  projected: ComponentCredits;
  projectedTotal: number;
  /** Créditos al mes por anuncio de particular/activo conocido (null si no se conoce el nº de anuncios). */
  perListing: number | null;
};

const add = (a: ComponentCredits, b: ComponentCredits) => {
  for (const k of COST_COMPONENTS) a[k] += b[k];
};

/**
 * Suma las hojas por el árbol: cada zona incluye lo suyo y lo de todos sus descendientes.
 * Una clave del libro que no está en `scraper_zones` no suma a nadie más que a sí misma (se devuelve igual).
 */
export function rollupZoneCosts(zones: ScraperZone[], pc: PortalCosts | null, projectionDays: number): Map<string, ZoneCost> {
  const out = new Map<string, ZoneCost>();
  if (!pc) return out;
  const parent = new Map(zones.map((z) => [z.zone_key, z.parent_key]));
  const own = new Map<string, ComponentCredits>();
  for (const leaf of pc.leaves) {
    const acc = own.get(leaf.zone_key) ?? emptyComponents();
    add(acc, leaf.components);
    own.set(leaf.zone_key, acc);
  }
  const rolled = new Map<string, ComponentCredits>();
  for (const [key, comps] of own) {
    // Se sube por parent_key con protección contra ciclos.
    const seen = new Set<string>();
    for (let k: string | null | undefined = key; k && !seen.has(k); k = parent.get(k)) {
      seen.add(k);
      const acc = rolled.get(k) ?? emptyComponents();
      add(acc, comps);
      rolled.set(k, acc);
    }
  }
  const byKey = new Map(zones.map((z) => [z.zone_key, z]));
  for (const [key, measured] of rolled) {
    const projected = project30(measured, projectionDays);
    const projectedTotal = sumComponents(projected);
    const z = byKey.get(key);
    const n = z ? (z.listings_private ?? zoneListings(z)) : null;
    out.set(key, {
      measured,
      total: sumComponents(measured),
      projected,
      projectedTotal,
      perListing: n && n > 0 && projectionDays > 0 ? Math.round((projectedTotal / n) * 100) / 100 : null,
    });
  }
  return out;
}

/** Cota baja anterior: solo páginas de listado (Idealista ≈ 0,67 créditos/mes por anuncio, Fotocasa ≈ 0,33). */
export function listingOnlyEstimate(
  z: Pick<ScraperZone, "portal" | "listings_sale" | "listings_rent" | "listings_private" | "sale_active" | "rent_active">,
): number | null {
  // Pisos.com / Habitaclia: estimación del modelo (no hace falta tener anuncios contados).
  const est = zoneEstimateCredits(z);
  if (est != null) return est;
  const n = zoneListings(z);
  return n == null ? null : Math.round(n * creditsPerListing(z.portal));
}

/** «3,5 días» / «1 día» con coma decimal. */
export function fmtDays(d: number): string {
  const r = Math.round(d * 10) / 10;
  return `${String(r).replace(".", ",")} ${r === 1 ? "día" : "días"}`;
}

/** Aviso «solo N días medidos» mientras el libro cubra poco tiempo (null si ya es fiable). */
export function shortWindowWarning(projectionDays: number): string | null {
  if (!(projectionDays > 0) || projectionDays >= MIN_RELIABLE_DAYS) return null;
  const lead = projectionDays < 1 ? "Solo se ha medido menos de 1 día" : `Solo se han medido ${fmtDays(projectionDays)}`;
  return `${lead}: la proyección extrapola ese tramo y no incluye los barridos que corren cada varios días ni los picos puntuales. Se afina sola con los días; es fiable a partir de ${MIN_RELIABLE_DAYS}.`;
}

/** Suma de lo proyectado por portal a anuncio activo y mes, por componente (null si no se conoce el nº de anuncios). */
export function perListingByComponent(projected: ComponentCredits, listings: number | null): ComponentCredits | null {
  if (!listings || listings <= 0) return null;
  const out = emptyComponents();
  for (const k of COST_COMPONENTS) out[k] = Math.round((projected[k] / listings) * 100) / 100;
  return out;
}

export type MonthView = {
  /** Proyección a 30 días de todos los portales (créditos). */
  projected30: number;
  /** Lo gastado en el periodo de facturación hasta ahora (null si el crawler no lo ha publicado). */
  spentPeriod: number | null;
  /** Gastado + ritmo diario × días que quedan: lo que se llevaría al renovar. */
  endOfPeriod: number | null;
  budget: number;
  /** % del presupuesto con la proyección a 30 días. */
  pctOfBudget: number;
  /** Plan de Crawio (750.000) y % que supone la proyección. */
  plan: number;
  pctOfPlan: number;
  tone: "ok" | "warn" | "over";
};

/** Total del mes proyectado frente al presupuesto. `daysLeft` = días hasta la renovación. */
export function monthView(payload: CostsPayload, budget: number, spentPeriod: number | null, daysLeft: number): MonthView | null {
  if (!payload.hasData || !(payload.projectionDays > 0)) return null;
  let projected30 = 0;
  for (const p of Object.values(payload.portals)) if (p) projected30 += sumComponents(project30(p.components, payload.projectionDays));
  const daily = projected30 / 30;
  const endOfPeriod = spentPeriod == null ? null : Math.round(spentPeriod + daily * Math.max(0, daysLeft));
  const ref = Math.max(projected30, endOfPeriod ?? 0);
  const pctOfBudget = budget > 0 ? Math.round((projected30 / budget) * 100) : 0;
  const pctOfPlan = Math.round((projected30 / PLAN_CREDITS) * 100);
  return { projected30, spentPeriod, endOfPeriod, budget, pctOfBudget, plan: PLAN_CREDITS, pctOfPlan, tone: ref >= budget ? "over" : ref >= budget * 0.85 ? "warn" : "ok" };
}
