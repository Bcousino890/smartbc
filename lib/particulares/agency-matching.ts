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
  type Feats,
  type LinkDecision,
  type LinkOptions,
  type LinkRow,
  type LinkingResult,
  type RefinedClass,
  type RowGroupState,
} from "./linking-core";
import type { LinkOffer, LinkSummaryLite } from "./links-types";
import {
  agencyCore,
  buildDescIndex,
  jaccardSets,
  normRef,
  photoKey,
  photoOverlap,
  sameAgency,
} from "./similarity";
import { kindOfAdvertiser } from "./source-kind";

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
  /** Texto de la web de la agencia (recortado). */
  description?: string | null;
  /** `external_id` (a menudo el id de Idealista), `property_reference`, `bc_reference`. */
  external_id?: string | null;
  property_reference?: string | null;
  bc_reference?: string | null;
  cover_photo_url?: string | null;
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
    n_photos: p.cover_photo_url ? 1 : 0,
    created_at: p.created_at,
    kind: "agencia_web",
    agency_name: p.agency_name,
    agency_key: agencyCore(p.agency_name),
    description: p.description ?? null,
    refs: refsOf([p.external_id, p.property_reference, p.bc_reference]),
    photo_keys: p.cover_photo_url ? [photoKey(p.cover_photo_url)].filter((k): k is string => !!k) : [],
    block_keys: blockKeys(refsOf([p.external_id, p.property_reference, p.bc_reference]), [], {
      core: agencyCore(p.agency_name),
      m2: num(p.square_meters),
      beds: p.bedrooms,
    }),
  };
}

/** Referencias normalizadas + el id numérico del portal al final de «idealista-123456789». */
export function refsOf(raw: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    const n = normRef(r);
    if (n) out.add(n);
    const tail = String(r ?? "").match(/(\d{6,})\s*$/);
    if (tail) out.add(tail[1]);
  }
  return [...out];
}

const blockKeys = (
  refs: string[],
  photos: string[],
  agency?: { core: string | null; m2: number | null; beds: number | null },
): string[] => [
  ...refs.map((r) => `ref:${r}`),
  ...photos.slice(0, 12).map((k) => `ph:${k}`),
  // Misma agencia, mismos m² y habitaciones: candidatos aunque falte la dirección en un lado.
  ...(agency?.core && agency.m2 && agency.beds != null ? [`ag:${agency.core}|${agency.m2}|${agency.beds}`] : []),
];

/** Fila cruda de `particulares_link_rows` / `particulares_agency_rows` (vistas 0199) → LinkRow con la taxonomía y las señales. */
export type ViewRow = Omit<LinkRow, "kind" | "refs" | "photo_keys" | "block_keys" | "agency_name" | "agency_key"> & {
  advertiser_type?: string | null;
  agency_key?: string | null;
  reference?: string | null;
  external_id?: string | null;
  portal_id?: string | null;
  agency_reference?: string | null;
  /** URLs (string u objetos {url}) de las primeras fotos. */
  photos_head?: unknown;
};

export function viewRowToLinkRow(v: ViewRow): LinkRow {
  const kind = kindOfAdvertiser(v.advertiser_type);
  const urls: string[] = Array.isArray(v.photos_head)
    ? (v.photos_head as unknown[]).map((p) => (typeof p === "string" ? p : (p as { url?: string })?.url ?? "")).filter(Boolean)
    : [];
  const photo_keys = [...new Set(urls.map(photoKey).filter((k): k is string => !!k))];
  const refs = refsOf([v.reference, v.agency_reference, v.portal_id, v.external_id]);
  const row: LinkRow = { ...v, kind, photo_keys, refs, block_keys: [] };
  if (kind === "agencia_portal") {
    row.agency_name = v.owner_name;
    row.agency_key = agencyCore(v.owner_name);
    row.block_keys = blockKeys(refs, photo_keys, { core: row.agency_key, m2: v.square_meters, beds: v.bedrooms });
  } else {
    row.block_keys = blockKeys(refs, photo_keys);
  }
  return row;
}

// ── Decisión de un par con señales extra ────────────────────────────────────

const hardVeto = (f: Feats): boolean =>
  f.m2Conflict || f.bConflict || f.baConflict || f.fConflict || f.eConflict || f.far;

/**
 * `refine` para `computeLinks` con agencias. Suma a la geometría del núcleo:
 *  · descripción: shingles de 4 palabras con poda de frases comunes (Jaccard);
 *  · referencia del anunciante / id del portal (la de una agencia solo vale entre
 *    la MISMA agencia; el id numérico del portal vale siempre);
 *  · nombre de agencia, fotos en común (identificador de fichero o hash) y coordenadas.
 *
 * Niveles:
 *  · cierto: misma referencia · mismas fotos · descripción casi idéntica (≥ 0,5) con
 *    calle/pin o m² + habitaciones · o lo que ya era cierto por geometría. Sin
 *    contradicción de m², habitaciones, baños, planta ni distancia; otra calle
 *    distinta descarta. La prueba propia NO se degrada por «varios pisos iguales»
 *    (es justo lo que desempata un edificio con pisos idénticos).
 *  · probable: el resto de coincidencias parciales (descripción ≥ 0,3 + m² …).
 *  · otra operación: como mucho probable salvo misma referencia.
 */
export function makeAgencyRefine(rows: LinkRow[]): NonNullable<LinkOptions["refine"]> {
  const desc = buildDescIndex(rows.map((r) => ({ id: r.id, description: r.description })));
  return (a: LinkRow, b: LinkRow, base: RefinedClass | null, f: Feats): RefinedClass | null => {
    const dA = desc.of(a.id);
    const dB = desc.of(b.id);
    const sim = dA && dB && dA.size >= 8 && dB.size >= 8 ? jaccardSets(dA, dB) : null;
    const descStrong = sim != null && sim >= 0.5;
    const descMed = sim != null && sim >= 0.3;
    const shared = (a.refs ?? []).filter((r) => (b.refs ?? []).includes(r));
    const globalId = shared.some((r) => /^\d{6,}$/.test(r));
    const agencySame = sameAgency(a.agency_name, b.agency_name);
    const refEq = shared.length > 0 && (globalId || agencySame);
    const ph = photoOverlap(a.photo_keys, b.photo_keys);
    const addr = f.S || f.near60;
    const streetOk = !(f.streetBoth && !f.nameSame);
    const veto = hardVeto(f);

    const evidence: Record<string, unknown> = {};
    const reasons: string[] = [];
    if (refEq) (evidence.ref_equal = true), reasons.push(globalId ? "mismo id de portal" : "misma referencia de la agencia");
    if (sim != null) (evidence.desc_sim = Math.round(sim * 100) / 100), sim >= 0.3 && reasons.push(`descripción ${Math.round(sim * 100)} % parecida`);
    if (ph.shared > 0) (evidence.photos_shared = ph.shared), ph.strong && reasons.push(`${ph.shared} fotos iguales`);
    if (agencySame) (evidence.same_agency = true), reasons.push("misma agencia");
    if (reasons.length) evidence.reasons = reasons;

    if (veto) return null;
    const strongText = refEq || ph.strong || descStrong;
    if (strongText && streetOk) {
      const sure = refEq || (ph.strong && (addr || f.M || !!base)) || (descStrong && (addr || (f.M && (f.B || !f.bKnown))));
      const level = sure && (f.sameOp || refEq) ? "cierto" : "probable";
      const rule = refEq
        ? "X1 misma referencia"
        : ph.strong
          ? "X3 mismas fotos"
          : "X2 descripción casi idéntica";
      return { relation: "mismo_inmueble", level, rule, evidence, extraStrong: level === "cierto" };
    }
    if (base) {
      return { ...base, evidence: { ...(base.evidence ?? {}), ...evidence } };
    }
    if (descMed && f.M && (addr || agencySame) && streetOk) {
      return { relation: "mismo_inmueble", level: "probable", rule: "X7 descripción parecida + metros", evidence };
    }
    return null;
  };
}

/** Enlaces entre anuncios de agencias en portales (la misma agencia en varios portales, republicaciones): agrupa y resume. */
export function computeAgencyPortalLinks(
  proRows: LinkRow[],
  decisions: LinkDecision[] = [],
): LinkingResult {
  // El teléfono de una agencia es de la agencia, no del piso: no prueba nada.
  // Ni el nombre: el de todos los anuncios de una agencia es el mismo y no prueba el piso.
  const rows = proRows.map((r) => ({ ...r, phone: null, phone2: null, owner_name: null }));
  return computeLinks(rows, decisions, { refine: makeAgencyRefine(rows) });
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
  // Sin teléfonos en ningún lado: una agencia no prueba el piso con el suyo.
  const all = [...particulares.map((r) => ({ ...r, phone: null, phone2: null, owner_name: null })), ...properties.map(propertyToLinkRow)];
  const res = computeLinks(
    all,
    decisions.map((d): LinkDecision => ({ a: d.particular_id, b: d.property_id, relation: "mismo_inmueble", status: d.status })),
    { refine: makeAgencyRefine(all) },
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
          offers: [
            {
              op: r.operation,
              portal: r.portal,
              price: r.price,
              active: r.is_active,
              ...(r.kind ? { kind: r.kind } : {}),
              ...(r.agency_name ? { agency: r.agency_name } : {}),
            },
          ],
        };
    const props = [...propIds].map((id) => propById.get(id) as AgencyPropertyInput).slice(0, 3);
    const agencyOffers: LinkOffer[] = props.map((p) => {
      const lr = propertyToLinkRow(p);
      return { op: lr.operation, portal: AGENCY_PORTAL, price: lr.price, active: lr.is_active, kind: "agencia_web", ...(p.agency_name ? { agency: p.agency_name } : {}) };
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
