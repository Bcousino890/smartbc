// ─────────────────────────────────────────────────────────────────────────────
// Enlace entre anuncios de particulares y propiedades de agencias del CRM
// (`properties`: Housingo, Level, Portales externos… con referencia de Idealista).
//
// Un mismo piso puede estar como anuncio de particular en Idealista/Fotocasa y
// como propiedad de una agencia colaboradora en el CRM. Aquí se reutiliza el
// núcleo de `linking-core.ts` (mismas reglas, mismo rigor) tratando cada
// propiedad como una fila más SIN teléfono: el teléfono de una agencia es el de
// la agencia, no el del propietario, así que nunca puede ser la prueba. Solo
// valen dirección + m² + habitaciones + baños + precio (reglas R2/R3 del core).
//
// PURO (sin red ni BD) → `scripts/test-particulares-agency-matching.mts`.
// La parte que lee/escribe en la BD es `linking-runner.ts`.
//
// Solo un enlace «cierto» toca la ficha (suma una fuente «Agencia» al resumen);
// los «probable» se guardan y se ven como sugerencia en la ficha, sin agrupar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeLinks,
  type ComputedLink,
  type LinkDecision,
  type LinkRow,
  type LinkingResult,
  type RowGroupState,
} from "./linking-core";
import type { LinkOffer, LinkSummaryLite } from "./links-types";

/** Portal ficticio con el que las propiedades del CRM entran en el enlazador y en `link_summary`. */
export const AGENCY_PORTAL = "agencia";

/** Lo mínimo de `properties` (+ nombre de agencia) que necesita el enlazador. */
export type AgencyPropertyInput = {
  id: string;
  agency_name: string | null;
  operation: "rent" | "sale" | null;
  /** `available` | `reserved` | `sold` | `archived` */
  status: string | null;
  archived_at: string | null;
  price: number | string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision?: string | null;
  created_at: string | null;
};

export type AgencyMatch = {
  particular_id: string;
  property_id: string;
  level: "cierto" | "probable";
  rule: string;
  score: number;
  evidence: Record<string, unknown>;
};

export type AgencyDecision = { particular_id: string; property_id: string; status: "confirmado" | "descartado" };

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Propiedad → fila del enlazador. `bathrooms`/`m²`/precio a 0 son «sin dato»
 * (las columnas del CRM tienen DEFAULT 0), no «0 baños»: si no, contradecirían
 * a cualquier anuncio. El teléfono y el nombre se omiten a propósito.
 */
export function propertyToLinkRow(p: AgencyPropertyInput): LinkRow {
  const active = p.archived_at == null && (p.status === "available" || p.status === "reserved");
  return {
    id: p.id,
    portal: AGENCY_PORTAL,
    operation: p.operation,
    is_active: active,
    price: num(p.price),
    bedrooms: p.bedrooms,
    bathrooms: num(p.bathrooms),
    square_meters: num(p.square_meters),
    floor: null,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    location_precision: p.location_precision ?? null,
    phone: null,
    phone2: null,
    owner_name: null,
    assigned_to: null,
    n_photos: 0,
    created_at: p.created_at,
  };
}

/**
 * Pares (anuncio de particular, propiedad de agencia) que son el mismo piso.
 * `particulares` son las filas de `particulares_link_rows`. Respeta las decisiones
 * humanas (descartado = nunca; confirmado = siempre «cierto»).
 */
export function computeAgencyMatches(
  particulares: LinkRow[],
  properties: AgencyPropertyInput[],
  decisions: AgencyDecision[] = [],
): AgencyMatch[] {
  if (particulares.length === 0 || properties.length === 0) return [];
  const propIds = new Set(properties.map((p) => p.id));
  const parIds = new Set(particulares.map((r) => r.id));
  const res = computeLinks(
    [...particulares, ...properties.map(propertyToLinkRow)],
    decisions.map((d): LinkDecision => ({ a: d.particular_id, b: d.property_id, relation: "mismo_inmueble", status: d.status })),
  );
  const out: AgencyMatch[] = [];
  for (const l of res.links as ComputedLink[]) {
    if (l.relation !== "mismo_inmueble" || l.level === "informativo") continue;
    const aIsProp = propIds.has(l.a);
    const bIsProp = propIds.has(l.b);
    if (aIsProp === bIsProp) continue; // particular↔particular o propiedad↔propiedad: no es de este módulo
    const particular_id = aIsProp ? l.b : l.a;
    const property_id = aIsProp ? l.a : l.b;
    if (!parIds.has(particular_id)) continue;
    out.push({ particular_id, property_id, level: l.level, rule: l.rule, score: l.score, evidence: l.evidence });
  }
  return out;
}

/**
 * Suma la fuente «Agencia» al `link_summary` del anuncio PRINCIPAL de cada grupo
 * (solo con enlaces «cierto»). Modifica `state` y lo devuelve. Un anuncio suelto
 * sin resumen recibe uno nuevo (n ≥ 2: él + la agencia), que es lo que el listado
 * necesita para pintar las fuentes.
 */
export function applyAgencyToState(
  result: LinkingResult,
  particulares: LinkRow[],
  properties: AgencyPropertyInput[],
  matches: AgencyMatch[],
): Map<string, RowGroupState> {
  const { state } = result;
  const rowById = new Map(particulares.map((r) => [r.id, r]));
  const propById = new Map(properties.map((p) => [p.id, p]));
  const byRoot = new Map<string, Set<string>>();
  for (const m of matches) {
    if (m.level !== "cierto") continue;
    const st = state.get(m.particular_id);
    const root = st?.duplicate_of ?? m.particular_id;
    if (!rowById.has(root) || !propById.has(m.property_id)) continue;
    let s = byRoot.get(root);
    if (!s) byRoot.set(root, (s = new Set()));
    s.add(m.property_id);
  }
  for (const [root, propIds] of byRoot) {
    const r = rowById.get(root) as LinkRow;
    const cur = state.get(root);
    const base: LinkSummaryLite = cur?.link_summary
      ? { ...cur.link_summary }
      : {
          n: 1,
          portals: [r.portal],
          ops: r.operation ? [r.operation] : [],
          active_ops: r.is_active && r.operation ? [r.operation] : [],
          phones: 0,
          names: [],
          offers: [{ op: r.operation, portal: r.portal, price: r.price, active: r.is_active }],
        };
    const props = [...propIds].map((id) => propById.get(id) as AgencyPropertyInput).slice(0, 3);
    const agencyOffers: LinkOffer[] = props.map((p) => {
      const lr = propertyToLinkRow(p);
      return { op: lr.operation, portal: AGENCY_PORTAL, price: lr.price, active: lr.is_active };
    });
    const names = [...new Set(props.map((p) => (p.agency_name ?? "").trim()).filter(Boolean))];
    state.set(root, {
      duplicate_of: cur?.duplicate_of ?? null,
      link_ops: cur?.link_ops ?? null,
      link_summary: {
        ...base,
        n: base.n + propIds.size,
        portals: [...new Set([...base.portals, AGENCY_PORTAL])].sort(),
        offers: [...(base.offers ?? []), ...agencyOffers].slice(0, 6),
        agencies: names,
      },
    });
  }
  return state;
}
