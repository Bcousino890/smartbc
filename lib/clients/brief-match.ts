// ============================================================================
// Cruce encargo ↔ propiedad. Puro: sin base de datos, se prueba en
// scripts/test-client-brief.mts.
//
// Tres salidas por propiedad, y no deben mezclarse:
//  · DESCARTADA — choca con algo que el cliente dijo que no acepta. Solo se
//    descarta con evidencia EXPLÍCITA ("sin ascensor", "Interior", planta 1ª
//    con mínimo 3ª). Que la ficha no mencione algo no la descarta: la mitad de
//    las fichas no listan el ascensor aunque lo tengan.
//  · `reasons` — por qué encaja. Las VE EL CLIENTE en su portal
//    (components/cliente/suggested-properties-grid.tsx): solo cosas positivas
//    y verificables.
//  · `warnings` — lo que el agente tiene que confirmar antes de enseñarla
//    (dato que falta, se pasa del presupuesto, la renta no cuadra con los
//    ingresos…). NUNCA salen hacia el cliente: la ruta del portal del cliente
//    las quita (app/api/cliente/suggested-properties/route.ts).
// ============================================================================

import { ATICO_FLOOR, floorLabel, resolveFloor } from "../floor";
import {
  FEATURES,
  FEATURE_LABEL,
  MORTGAGE_FINANCING,
  TYPE_ACCEPTS,
  type BriefInput,
  type FeatureKey,
  type PropertyTypeKey,
} from "./brief";

export type MatchProperty = {
  zone: string | null;
  subzone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  price: number | string;
  rent_price?: number | string | null;
  operation: "rent" | "sale";
  operations?: string[] | null;
  stay?: string | null;
  property_type?: string | null;
  title?: string | null;
  description?: string | null;
  features?: string[] | null;
  features_manual?: string[] | null;
  floor_override?: string | null;
  available_from?: string | null;
  photoCount?: number;
};

export type ExclusionReason =
  | "operation"
  | "price"
  | "zone"
  | "stay"
  | "bedrooms"
  | "bathrooms"
  | "area"
  | "type"
  | "floor"
  | "furnished"
  | "pets"
  | "condition"
  | "new_build"
  | "tenanted"
  | `must:${FeatureKey}`;

export type MatchOutcome =
  | { excluded: true; reason: ExclusionReason }
  | { excluded: false; score: number; reasons: string[]; warnings: string[] };

/** Cómo se cuenta cada descarte en el resumen que ve el agente. */
export function exclusionLabel(reason: ExclusionReason): string {
  if (reason.startsWith("must:")) {
    const key = reason.slice(5) as FeatureKey;
    return `Sin ${FEATURE_LABEL[key]?.toLowerCase() ?? key}`;
  }
  const labels: Record<string, string> = {
    operation: "Otra operación",
    price: "Fuera de presupuesto",
    zone: "Fuera de zona",
    stay: "Otro tipo de estancia",
    bedrooms: "Dormitorios",
    bathrooms: "Baños",
    area: "Superficie",
    type: "Tipo de vivienda",
    floor: "Planta",
    furnished: "Sin amueblar",
    pets: "No admite mascotas",
    condition: "A reformar",
    new_build: "Obra nueva / segunda mano",
    tenanted: "Con inquilino",
  };
  return labels[reason] ?? reason;
}

// ─── Lectura del texto libre de la propiedad ─────────────────────────────────

export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type Evidence = "yes" | "no" | null;
type Detector = { pos: RegExp; neg?: RegExp; negShort?: RegExp };

type Texts = { short: string[]; long: string[] };

function textsOf(p: MatchProperty): Texts {
  return {
    short: [...(p.features ?? []), ...(p.features_manual ?? [])].filter(Boolean).map(fold),
    long: [p.title, p.description].filter((t): t is string => !!t).map(fold),
  };
}

/**
 * "yes" / "no" / null (no se dice). Los atributos cortos mandan sobre el texto
 * largo, y dentro de cada uno la negación se mira antes: "sin ascensor"
 * también contiene "ascensor".
 */
function detect(d: Detector, t: Texts): Evidence {
  for (const s of t.short) if (d.neg?.test(s) || d.negShort?.test(s)) return "no";
  for (const s of t.short) if (d.pos.test(s)) return "yes";
  for (const s of t.long) if (d.neg?.test(s)) return "no";
  for (const s of t.long) if (d.pos.test(s)) return "yes";
  return null;
}

const FEATURE_BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

export function detectFeature(key: FeatureKey, p: MatchProperty): Evidence {
  const def = FEATURE_BY_KEY.get(key);
  return def ? detect(def, textsOf(p)) : null;
}

const FURNISHED: Detector = {
  pos: /\bamueblad[oa]s?\b|\bamoblad[oa]s?\b|\bfurnished\b/,
  neg: /\bsin\s+amueblar\b|\bno\s+amueblad[oa]\b|\bsin\s+muebles\b|\bunfurnished\b|\bvacio\s+de\s+muebles\b/,
};

const PETS: Detector = {
  pos: /\b(se\s+)?admiten?\s+mascotas\b|\bmascotas\s+(permitidas|bienvenidas|si)\b|^mascotas$|\bpet[-\s]?friendly\b|\bpets?\s+allowed\b/,
  neg: /\bno\s+(se\s+)?admiten?\s+mascotas\b|\bsin\s+mascotas\b|\bmascotas\s+no\b|\bno\s+pets\b/,
};

const NEW_BUILD: Detector = {
  pos: /\bobra\s+nueva\b|\bnew\s+build\b|\ba\s+estrenar\b|\bpromocion\s+(de\s+)?obra\s+nueva\b/,
  neg: /\bsegunda\s+mano\b/,
};

const TO_RENOVATE: Detector = {
  pos: /\b(a|para)\s+reformar\b|\bnecesita\s+(una\s+)?reforma\b|\bpara\s+actualizar\b/,
};

const RENOVATED: Detector = {
  pos: /\breformad[oa]\b|\brecien\s+reformad[oa]\b|\breforma\s+integral\b|\bentrar\s+a\s+vivir\b|\bbuen\s+estado\b/,
};

const TENANTED: Detector = {
  pos: /\bcon\s+inquilinos?\b|\bactualmente\s+alquilad[oa]\b|\bvendid[oa]\s+con\s+inquilino\b|\bnuda\s+propiedad\b|\bocupad[oa]\b/,
};

const ORIENTATION_LONG_RE = /\borientacion\s+(norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)\b/g;
const ORIENTATION_SHORT_RE = /\b(norte|sur|este|oeste|noreste|noroeste|sureste|suroeste)\b/g;

/**
 * Patrón `ilike` para PREFILTRAR una zona en SQL sin depender de tildes ni
 * mayúsculas: cada vocal (y la n, por la ñ) pasa a `_`, el comodín de un
 * carácter. "chamberi" escrito a mano encuentra "Chamberí". Es deliberadamente
 * permisivo: la comparación exacta (sin tildes) la hace `evaluateMatch`.
 */
export function zoneLikePattern(name: string): string {
  return fold(name.trim())
    .replace(/[%*_\\"]/g, "")
    .replace(/[aeioun]/g, "_");
}

/** Tipo de vivienda a partir de `property_type` y del arranque del título ("Ático en …"). */
export function detectPropertyType(p: MatchProperty): PropertyTypeKey | null {
  const sources = [
    fold(p.property_type ?? ""),
    // Los títulos siguen el patrón "<Tipo> en <calle>"; mirar solo el
    // arranque evita que "Piso en Casa de Campo" se lea como una casa.
    fold((p.title ?? "").split(/\s+en\s+/i)[0] ?? ""),
  ].filter(Boolean);
  const specific: Array<[PropertyTypeKey, RegExp]> = [
    ["atico", /\batico\b|\bpenthouse\b/],
    ["duplex", /\b(duplex|triplex)\b/],
    ["estudio", /\b(estudio|loft|studio)\b/],
    ["chalet", /\b(chalet|casa|villa|adosado|pareado|unifamiliar|house|masia|cortijo)\b/],
  ];
  for (const [key, re] of specific) if (sources.some((s) => re.test(s))) return key;
  if (sources.some((s) => /\b(piso|apartamento|bajo|planta\s+baja|flat|apartment|vivienda)\b/.test(s))) {
    return "piso";
  }
  return null;
}

/**
 * El precio que hay que comparar. En las propiedades duales (venta Y
 * alquiler, migración 0085) `price` es el de VENTA y el de alquiler va en
 * `rent_price`: comparar el presupuesto de un inquilino con `price` las
 * descartaba todas.
 */
export function effectivePrice(p: MatchProperty, operation: "rent" | "sale"): number | null {
  const ops = p.operations ?? [];
  if (operation === "rent") {
    if (p.operation === "rent") return Number(p.price);
    if (ops.includes("rent") && p.rent_price != null) return Number(p.rent_price);
    return null;
  }
  if (p.operation === "sale" || ops.includes("sale")) return Number(p.price);
  return null;
}

function supportsOperation(p: MatchProperty, op: "rent" | "sale"): boolean {
  return p.operation === op || (p.operations ?? []).includes(op);
}

const fmtMoney = (n: number) => new Intl.NumberFormat("es-ES").format(Math.round(n)) + " €";

/** Cuota mensual de una hipoteca a 30 años al 3 %: orientativa, para avisar. */
function mortgagePayment(principal: number): number {
  const r = 0.03 / 12;
  const n = 360;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

// ─── El cruce ────────────────────────────────────────────────────────────────

export function evaluateMatch(brief: BriefInput, p: MatchProperty, today = new Date()): MatchOutcome {
  const op = brief.operation;
  const rent = op === "rent";
  const t = textsOf(p);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let earned = 0;
  let possible = 0;
  const component = (weight: number, got: number) => {
    possible += weight;
    earned += Math.max(0, Math.min(weight, got));
  };

  if (!supportsOperation(p, op)) return { excluded: true, reason: "operation" };

  // ── Estancia (solo alquiler) ──
  if (rent && brief.stay && p.stay && p.stay !== brief.stay) {
    return { excluded: true, reason: "stay" };
  }

  // ── Precio ──
  const price = effectivePrice(p, op);
  if (brief.minPrice !== null || brief.maxPrice !== null) {
    if (price === null) return { excluded: true, reason: "price" };
    const flex = brief.maxPriceFlexPct ?? 0;
    const ceiling = brief.maxPrice !== null ? brief.maxPrice * (1 + flex / 100) : null;
    if (brief.minPrice !== null && price < brief.minPrice) return { excluded: true, reason: "price" };
    if (ceiling !== null && price > ceiling) return { excluded: true, reason: "price" };
    if (brief.maxPrice !== null && price > brief.maxPrice) {
      warnings.push(`Supera el presupuesto en ${fmtMoney(price - brief.maxPrice)}`);
      component(20, 8);
    } else {
      reasons.push("Dentro del presupuesto");
      component(20, 20);
    }
  }

  // ── Zona ──
  const wanted = [...brief.zones, ...brief.subzones].map(fold);
  if (wanted.length) {
    const zone = p.zone ? fold(p.zone) : null;
    const sub = p.subzone ? fold(p.subzone) : null;
    const hitSub = sub !== null && brief.subzones.map(fold).includes(sub);
    const inZone = (zone !== null && wanted.includes(zone)) || (sub !== null && wanted.includes(sub));
    if (!inZone) {
      if (!brief.zonesFlexible) return { excluded: true, reason: "zone" };
      warnings.push("Fuera de sus zonas (está abierto a otras)");
      component(25, 5);
    } else {
      const place = [p.zone, p.subzone].filter(Boolean).join(" · ");
      reasons.unshift(`En ${place}`);
      if (brief.subzones.length && !hitSub && sub !== null) {
        warnings.push("Fuera de los barrios que marcó");
        component(25, 18);
      } else {
        component(25, 25);
      }
    }
  }

  // ── Tamaño ──
  const beds = p.bedrooms ?? 0;
  if (brief.minBedrooms !== null && beds < brief.minBedrooms) return { excluded: true, reason: "bedrooms" };
  if (brief.maxBedrooms !== null && beds > brief.maxBedrooms) return { excluded: true, reason: "bedrooms" };
  if (brief.minBedrooms !== null || brief.maxBedrooms !== null) {
    component(6, 6);
    if (beds > 0) reasons.push(beds === 1 ? "1 dormitorio" : `${beds} dormitorios`);
  }

  const baths = p.bathrooms ?? 0;
  if (brief.minBathrooms !== null) {
    // 0 es el DEFAULT de la columna: casi siempre "no se sabe", no "sin baño".
    if (baths === 0) {
      warnings.push("Baños sin dato");
      component(4, 2);
    } else if (baths < brief.minBathrooms) {
      return { excluded: true, reason: "bathrooms" };
    } else {
      component(4, 4);
    }
  }

  const area = p.square_meters ?? null;
  if (brief.minSquareMeters !== null || brief.maxSquareMeters !== null) {
    if (!area) {
      warnings.push("Superficie sin dato");
      component(5, 2);
    } else {
      // Un 5 % de margen por abajo: 78 m² para alguien que dijo "80" no es
      // un descarte, es una conversación.
      if (brief.minSquareMeters !== null && area < brief.minSquareMeters * 0.95) {
        return { excluded: true, reason: "area" };
      }
      if (brief.maxSquareMeters !== null && area > brief.maxSquareMeters * 1.1) {
        return { excluded: true, reason: "area" };
      }
      if (brief.minSquareMeters !== null && area < brief.minSquareMeters) {
        warnings.push(`${area} m², algo menos de los ${brief.minSquareMeters} que pide`);
        component(5, 3);
      } else {
        component(5, 5);
      }
    }
  }

  // ── Tipo de vivienda ──
  const type = detectPropertyType(p);
  if (brief.propertyTypes.length) {
    const accepted = new Set(
      brief.propertyTypes.flatMap((k) => TYPE_ACCEPTS[k as PropertyTypeKey] ?? []),
    );
    if (type === null) {
      warnings.push("Tipo de vivienda sin confirmar");
      component(5, 2);
    } else if (!accepted.has(type)) {
      return { excluded: true, reason: "type" };
    } else {
      component(5, 5);
    }
  }

  // ── Imprescindibles ──
  if (brief.mustHave.length) {
    let got = 0;
    for (const key of brief.mustHave as FeatureKey[]) {
      const ev = detectFeature(key, p);
      if (ev === "no") return { excluded: true, reason: `must:${key}` };
      if (ev === "yes") {
        got += 1;
        reasons.push(FEATURE_LABEL[key]);
      } else {
        got += 0.4;
        warnings.push(`Confirmar: ${FEATURE_LABEL[key]?.toLowerCase() ?? key}`);
      }
    }
    component(15, (15 * got) / brief.mustHave.length);
  }

  // ── Planta ──
  if (brief.minFloor !== null && type !== "chalet") {
    const floor = resolveFloor(
      p.floor_override,
      [...(p.features ?? []), ...(p.features_manual ?? [])],
      p.title,
      p.description,
    );
    if (floor === null) {
      if (brief.minFloor > 0) warnings.push(`Planta sin dato (pide ${brief.minFloor === 1 ? "no bajo" : `${brief.minFloor}ª o más`})`);
      component(3, 1);
    } else if (floor < brief.minFloor) {
      return { excluded: true, reason: "floor" };
    } else {
      component(3, 3);
      if (floor >= 1) reasons.push(floor === ATICO_FLOOR ? "Ático" : `Planta ${floorLabel(floor)}`);
    }
  }

  // ── Solo alquiler ──
  if (rent) {
    if (brief.furnished) {
      const ev = detect(FURNISHED, t);
      if (brief.furnished === "furnished") {
        if (ev === "no") return { excluded: true, reason: "furnished" };
        if (ev === "yes") reasons.push("Amueblado");
        else warnings.push("Confirmar si está amueblado");
        component(3, ev === "yes" ? 3 : 1);
      } else {
        // Muchos propietarios retiran los muebles si se les pide: se avisa,
        // no se descarta.
        if (ev === "yes") warnings.push("Está amueblado y lo quiere sin amueblar");
        else if (ev === "no") reasons.push("Sin amueblar");
        component(3, ev === "no" ? 3 : ev === "yes" ? 0 : 1);
      }
    }
    if (brief.pets) {
      const ev = detect(PETS, t);
      if (ev === "no") return { excluded: true, reason: "pets" };
      if (ev === "yes") reasons.push("Admite mascotas");
      else warnings.push("Confirmar mascotas con el propietario");
      component(3, ev === "yes" ? 3 : 1);
    }
    const people = brief.occupants ?? 0;
    const sharers = (brief.students ?? 0) + (brief.workers ?? 0);
    if (sharers > 1 && beds > 0 && beds < sharers) {
      warnings.push(`${beds} dormitorios para ${sharers} personas que comparten`);
    } else if (people > 0 && beds > 0 && people > beds * 2) {
      warnings.push(`${beds} dormitorios para ${people} personas`);
    }
    if (brief.monthlyIncome && price && price * 3 > brief.monthlyIncome) {
      // Regla habitual de las agencias en España: ingresos ≥ 3 veces la renta.
      warnings.push(
        `La renta supera 1/3 de sus ingresos (${fmtMoney(brief.monthlyIncome)}/mes)` +
          (brief.guarantees.length ? " · tiene garantías" : ""),
      );
    }
  }

  // ── Solo venta ──
  if (!rent) {
    const isNew = detect(NEW_BUILD, t);
    if (brief.newBuild === "only_new") {
      // Aquí sí hace falta evidencia positiva: casi ninguna ficha de segunda
      // mano lo dice, y "no lo dice" es justo lo que distingue a la obra nueva.
      if (isNew !== "yes") return { excluded: true, reason: "new_build" };
      reasons.push("Obra nueva");
      component(3, 3);
    } else if (brief.newBuild === "only_resale") {
      if (isNew === "yes") return { excluded: true, reason: "new_build" };
      component(3, 3);
    }

    const toRenovate = detect(TO_RENOVATE, t) === "yes";
    const renovated = detect(RENOVATED, t) === "yes";
    if (brief.conditionPref === "move_in" || brief.conditionPref === "renovated") {
      if (toRenovate) return { excluded: true, reason: "condition" };
      if (renovated) reasons.push(brief.conditionPref === "renovated" ? "Reformado" : "Para entrar a vivir");
      else if (brief.conditionPref === "renovated") warnings.push("Confirmar estado (lo quiere reformado)");
      component(3, renovated ? 3 : 1);
    } else if (brief.conditionPref === "to_renovate") {
      if (toRenovate) reasons.push("Para reformar");
      component(3, toRenovate ? 3 : 1);
    }

    if (detect(TENANTED, t) === "yes") {
      if (brief.acceptsTenanted === false) return { excluded: true, reason: "tenanted" };
      warnings.push("Se vende con inquilino u ocupada");
    }

    if (price && brief.financing && MORTGAGE_FINANCING.has(brief.financing)) {
      // Un banco financia como mucho el 80 %, y los gastos de compra rondan
      // el 10 %: hace falta ~30 % de ahorro.
      if (brief.downPayment !== null && brief.downPayment < price * 0.3) {
        warnings.push(`Ahorro por debajo del 30 % del precio (${fmtMoney(price * 0.3)})`);
      }
      if (brief.monthlyIncome) {
        const loan = Math.max(0, price - (brief.downPayment ?? price * 0.3) + price * 0.1);
        const payment = mortgagePayment(loan);
        if (payment > brief.monthlyIncome * 0.35) {
          warnings.push(`Cuota estimada ${fmtMoney(payment)}/mes: más del 35 % de sus ingresos`);
        }
      }
    }
  }

  // ── Deseables ──
  if (brief.niceToHave.length) {
    let got = 0;
    for (const key of brief.niceToHave as FeatureKey[]) {
      if (detectFeature(key, p) === "yes") {
        got += 1;
        reasons.push(FEATURE_LABEL[key]);
      }
    }
    component(10, (10 * got) / brief.niceToHave.length);
  }

  // ── Orientación ──
  if (brief.orientations.length) {
    const wantedOr = brief.orientations.map(fold);
    let hit: string | null = null;
    // En un atributo corto basta con "Sur"; en la descripción hace falta
    // "orientación sur": "este" suelto es casi siempre "este piso".
    const candidates = [
      ...t.short.flatMap((s) => [...s.matchAll(ORIENTATION_SHORT_RE)].map((m) => m[1])),
      ...t.long.flatMap((s) => [...s.matchAll(ORIENTATION_LONG_RE)].map((m) => m[1])),
    ];
    for (const dir of candidates) {
      if (wantedOr.some((w) => dir.includes(w))) {
        hit = dir;
        break;
      }
    }
    if (hit) reasons.push(`Orientación ${hit}`);
    component(3, hit ? 3 : 0);
  }

  // ── Fecha de entrada ──
  const wantedDate = brief.availableFrom ? new Date(brief.availableFrom) : null;
  if (p.available_from) {
    const from = new Date(p.available_from);
    const ref = wantedDate ?? today;
    // Más de un mes después de cuando la necesita: hay que decírselo.
    if (from.getTime() - ref.getTime() > 31 * 86400000) {
      warnings.push(`Disponible desde el ${from.toLocaleDateString("es-ES")}`);
    }
  }

  // ── Fotos ──
  if ((p.photoCount ?? 0) >= 3) component(3, 3);
  else component(3, 0);

  // Sin nada del encargo con lo que comparar, el número no significa nada:
  // se deja en un neutro en vez de un 100 % o un 0 % engañosos.
  const score = possible <= 3 ? 50 : Math.round((100 * earned) / possible);

  return {
    excluded: false,
    score,
    reasons: dedupe(reasons).slice(0, 6),
    warnings: dedupe(warnings),
  };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
