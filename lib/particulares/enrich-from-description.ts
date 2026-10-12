/**
 * Enriquecer un anuncio de `particulares` con lo que el propio anunciante escribe
 * en la DESCRIPCIÓN: teléfono, dirección exacta (calle + número) y responsable.
 *
 * MÓDULO PURO (sin BD, sin red, sin `server-only`): lo usa el job
 * (`enrich-runner.ts`, POST /api/cron/particulares/enrich) y se prueba con
 * `npm run test:particulares-enrich`. Decide por REGLAS con tres niveles de
 * confianza; solo `alta` se aplica sola, `media`/`baja` quedan como candidatos
 * (con el fragmento de evidencia) para que una persona acepte o descarte.
 *
 * Principios (medidos sobre ~21.500 particulares el 2026-10-12, ver CLAUDE.md):
 *  - Un falso positivo cuesta más que un dato que falta: ante la duda, candidato.
 *  - Nunca se pisa un dato verificado (teléfono del portal, pin exacto, nombre real).
 *  - Un número que aparece en anuncios de varias direcciones, o en anuncios de
 *    agencia, es de una agencia aunque la descripción diga «abstenerse agencias».
 */
import { phoneKey, streetKey } from "./linking-core";
import { normalizeContactPhone } from "../sync/particulares/phone-international";
import {
  AMBIGUOUS_NAMES,
  FIRST_NAMES,
  NAME_STOPWORDS,
  foldWord,
  isGenericOwnerName,
  titleCaseName,
} from "./enrich-names";

/** Súbela al cambiar las reglas: el job vuelve a procesar las filas con otra versión. */
export const ENRICH_RULES_VERSION = 1;

export type Confidence = "alta" | "media" | "baja";
export type EnrichField = "phone" | "phone2" | "address" | "owner_name";

export type EnrichRow = {
  id: string;
  /** Título del anuncio, si ya está separado de `address` (migración 0186 de la otra rama). Opcional. */
  title?: string | null;
  portal: string;
  advertiser_type: string | null;
  is_ad_professional?: boolean | null;
  description: string | null;
  address: string | null;
  zone: string | null;
  municipality: string | null;
  owner_name: string | null;
  phone: string | null;
  phone2: string | null;
  chat_only?: boolean | null;
  phone_source?: string | null;
  location_precision: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type PhoneSpreadEntry = { props: number; pro: number };
export type SpreadLookup = (key: string) => PhoneSpreadEntry | undefined;

export type GeoCheck = {
  query: string;
  /** Número que debe devolver Nominatim como house_number. */
  number: string;
  /** Calle del texto (para comparar con la calle que devuelva Nominatim). */
  street: string;
  /** Si Nominatim confirma el portal, se guardan coordenadas con precisión 'exact'. */
  saveCoords: boolean;
  /**
   * La dirección ya es «alta» sin necesidad de Nominatim (la calle coincide con la de la ficha o es el título del
   * portal): Nominatim solo decide si se guardan coordenadas. Si es false, sin confirmación no pasa de candidato.
   */
  trusted: boolean;
};

export type Proposal = {
  field: EnrichField;
  value: string;
  confidence: Confidence;
  rule: string;
  /** Fragmento del texto que lo justifica (≤ 200 caracteres). */
  evidence: string;
  /** apply = se aplica sola; candidate = queda para revisión; drop = descartado (solo para medir). */
  decision: "apply" | "candidate" | "drop";
  reason?: string;
  /** Para dirección: el valor de `address` que se leyó (control de concurrencia al guardar). */
  expectedBefore?: string | null;
  geo?: GeoCheck;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de texto
// ─────────────────────────────────────────────────────────────────────────────

/** Minúsculas sin tildes MANTENIENDO la longitud (para que los índices valgan en el original). */
export function foldKeepLen(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.normalize("NFD")[0] ?? ch;
    out += base.toLowerCase();
  }
  // `for…of` itera por code points: si hubiera pares sustitutos la longitud podría variar.
  return out.length === s.length ? out : s.toLowerCase();
}

export function hashDescription(text: string): string {
  // FNV-1a de 2×32 bits: suficiente para «¿cambió el texto?» y sin dependencias.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}${text.length.toString(16)}`;
}

function snippet(text: string, start: number, end: number, pad = 70): string {
  const a = Math.max(0, start - pad);
  const b = Math.min(text.length, end + pad);
  return (a > 0 ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ").trim() + (b < text.length ? "…" : "");
}

/** Cambia los paréntesis/llaves por espacios (misma longitud): «(+34) 635 129 061». */
function blankBrackets(s: string): string {
  return s.replace(/[(){}\[\]]/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Señales de agencia en el texto
// ─────────────────────────────────────────────────────────────────────────────

const AGENCY_WORD =
  "(?:agencias?|agentes?|inmobiliari\\w+|intermediari\\w+|comision\\w*|agenc\\w+|agents?|realtors?|empresas?|profesionales)";
const NEGATED_AGENCY = new RegExp(
  "\\b(?:sin|no|ni|nada de|abstener\\w*|evitar|excluid\\w*|rechaz\\w*|prohibid\\w*|not|without|refrain\\w*|ningun\\w*)\\s+(?:\\w+\\s+){0,4}?" +
    AGENCY_WORD +
    "(?:\\s*(?:,|y|e|o|ni|\\/|de(?:\\s+la)?)?\\s*(?:" + AGENCY_WORD + "|comerciales|ofertas|publicidad))*",
  "g",
);

/** Texto plegado en el que se han borrado las frases negadas («sin comisión de agencia»). */
function withoutNegatedAgency(folded: string): string {
  return folded.replace(NEGATED_AGENCY, (m) => " ".repeat(m.length));
}

const COMPANY_MARKER =
  /(?:\bs\.\s?l\.?u?\.?(?=\W|$)|\bs\.\s?a\.?(?=\W|$)|\bsl\b|\binmobiliarias?\b|\breal estate\b|\brealty\b|\bgroup\b|\bgrupo\b|\bagencia\b|\bagency\b|\basesores\b|\bconsultores\b|\bproperties\b|\bgesti[o]n inmobiliaria\b|\bnuestro equipo\b|\bour team\b)/;

/** El texto habla como una empresa («somos una agencia», «honorarios»…). */
const LISTING_AGENCY =
  /(?:somos\s+(?:una\s+)?(?:agencia|inmobiliaria|empresa|equipo|profesionales)|nuestra\s+(?:agencia|inmobiliaria|empresa|cartera)|nuestros?\s+(?:asesor\w*|agentes?|equipo|clientes)|honorarios\s+(?:de\s+(?:agencia|gesti[o]n)\s+)?a\s+cargo|gastos\s+de\s+gesti[o]n\s+a\s+cargo|comision\s+de\s+agencia\s+a\s+cargo|we\s+are\s+(?:an?\s+)?(?:agency|real estate)|our\s+(?:agency|team|clients|portfolio)|cartera\s+de\s+(?:inmuebles|propiedades))/;

/**
 * Plantillas de estafa de alquiler repetidas (medido: «el apartamento es de mi hermana… escríbele por
 * WhatsApp +34…», con un teléfono distinto en cada copia y nombres inventados): no se enriquece NADA.
 */
const SCAM_TEMPLATE =
  /(?:(?:apartamento|piso|casa|vivienda)\s+(?:es|pertenece)\s+(?:de\s+)?(?:a\s+)?mi\s+(?:hermana|hermano|madre|padre|t[ií]a|t[ií]o|esposa|marido)|belongs\s+to\s+my\s+(?:sister|brother|mother|father|aunt|uncle|wife|husband)|enviar(?:te)?\s+las\s+llaves|send\s+(?:you\s+)?the\s+keys|me\s+encuentro\s+(?:fuera\s+de\s+(?:espa[nñ]a|el\s+pa[ií]s)|en\s+el\s+extranjero)|i\s+am\s+(?:currently\s+)?(?:abroad|out\s+of\s+(?:the\s+)?country)|ahora\s+vivo\s+en\s+(?:el\s+extranjero|londres|dubai))/;

export function looksLikeScamTemplate(text: string): boolean {
  return SCAM_TEMPLATE.test(foldKeepLen(text));
}

export function looksLikeAgencyText(text: string): boolean {
  const folded = withoutNegatedAgency(foldKeepLen(text));
  return LISTING_AGENCY.test(folded);
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Teléfono
// ─────────────────────────────────────────────────────────────────────────────

export type PhoneMention = {
  /** E.164 (+34… para España). */
  value: string;
  key: string;
  international: boolean;
  start: number;
  end: number;
  raw: string;
  /** hay una palabra de contacto (teléfono, whatsapp, llamar…) justo antes. */
  cue: boolean;
  /** hay un nombre de pila pegado al número («Javi 659979697»). */
  nameAdjacent: boolean;
  /** el dígito-a-dígito se escribió con espacios entre CADA cifra («6 1 0 5 6…»): ofuscado a propósito. */
  spelled: boolean;
  /** motivo por el que NO es un teléfono de contacto de esta vivienda. */
  bad?: string;
  /** de la ventana de 9 cifras tomada de una racha más larga. */
  ambiguousRun?: boolean;
};

const ES_NATIONAL = /^(?:6\d|7[1-4]|8[1-8]|9[1-8])\d{7}$/;

const CUE_RE =
  /(?:\btel[eé]fon\w*|\btelf?\w*|\btlf\w*|\btfno|\btlfn|\btf\b|\btl\b|\bm[oó]vil|\bcelular|\bwh?a?t?s?\s?a+p+\w*|\bwhats\w*|\bwass?ap\w*|\bwas?ap\w*|\bwsp\b|\bwa\b|\bllam\w*|\bcontact\w*|\binform\w*|\bvisit\w*|\bescrib\w*|\bn[uú]mero\b|\bphone\b|\bcall\b|\bmobile\b|\bcita\b|\batiend\w*|\bpregunt\w*|\binteresad\w*|\bcomunicar\w*|\bdirectamente|\bwhats)/i;

const DIRECT_NUMBER_BAD_CTX: Array<[RegExp, string]> = [
  [/(?:\bref(?:erencia)?\b|\bcod(?:igo)?\b|catastral|\bnra\b|\bregistro\b|licencia|\bvut\b|expediente|\biban\b|\bdni\b|\bnif\b|\bcif\b|n\.?[º°o]?\s*de\s*(?:anuncio|inmueble|ref\w*)|\bid\b)\W{0,6}$/, "referencia"],
  [/(?:atencion al cliente|servicio de atencion|soporte|centralita|call center|servicio al cliente|customer (?:service|support))\W{0,25}$/, "atencion_cliente"],
];

function lastChars(s: string, n: number): string {
  return s.slice(Math.max(0, s.length - n));
}

/**
 * Todas las «cosas con pinta de teléfono» del texto, con su contexto. No decide
 * nada: `planPhones` aplica las reglas de confianza.
 */
export function findPhoneMentions(text: string): PhoneMention[] {
  const t = blankBrackets(text);
  const folded = foldKeepLen(t);
  const negated = withoutNegatedAgency(folded);
  const out: PhoneMention[] = [];
  // «+34 663-041-932», «6 3 0 08 25 66», «610-56-15-12»: cifras separadas por UN o DOS separadores.
  const RUN = /(?<![\d])(\+\s{0,2}|00(?=\s?\d))?(\d(?:[ \t.\-·]{0,2}\d){6,17})(?![\d])/g;
  let m: RegExpExecArray | null;
  while ((m = RUN.exec(t)) !== null) {
    const hasPlus = !!m[1] && m[1].startsWith("+");
    const has00 = !!m[1] && m[1].startsWith("00");
    const digits = m[2].replace(/\D/g, "");
    const start = m.index;
    const end = m.index + m[0].length;
    const raw = m[0];
    const seps = m[2].replace(/\d/g, "");
    const groups = m[2].split(/[ \t.\-·]+/);
    const interpreted: Array<{ value: string; international: boolean; ambiguousRun?: boolean }> = [];

    const pushEs = (nine: string, ambiguousRun = false) => {
      const v = normalizeContactPhone(nine);
      if (v && ES_NATIONAL.test(nine)) interpreted.push({ value: v, international: false, ambiguousRun });
    };

    if (hasPlus || has00) {
      if (digits.startsWith("34") && digits.length === 11) pushEs(digits.slice(2));
      else if (!digits.startsWith("34") && digits.length >= 8 && digits.length <= 15) {
        const v = normalizeContactPhone(`+${digits}`);
        if (v) interpreted.push({ value: v, international: true });
      }
    } else if (digits.length === 9) pushEs(digits);
    else if (digits.length === 11 && digits.startsWith("34")) pushEs(digits.slice(2));
    else if (digits.length === 18) {
      pushEs(digits.slice(0, 9));
      pushEs(digits.slice(9));
    } else if (digits.length >= 10 && digits.length <= 14 && /\s/.test(m[2])) {
      // «2026 630 746 816»: quita grupos por la izquierda hasta que queden 9 cifras válidas.
      let acc = digits;
      for (const g of groups) {
        if (acc.length <= 9) break;
        acc = acc.slice(g.replace(/\D/g, "").length);
        if (acc.length === 9) {
          pushEs(acc, true);
          break;
        }
      }
    }
    if (!interpreted.length) continue;

    const before = lastChars(folded.slice(0, start), 90);
    const after = folded.slice(end, end + 45);
    const origBefore = lastChars(t.slice(0, start), 40);
    const origAfter = t.slice(end, end + 40);

    for (const it of interpreted) {
      const key = phoneKey(it.value) ?? "";
      if (!key) continue;
      const mention: PhoneMention = {
        value: it.value,
        key,
        international: it.international,
        start,
        end,
        raw,
        cue: CUE_RE.test(lastChars(before, 48)),
        nameAdjacent: false,
        spelled: groups.length >= 6 && groups.filter((g) => g.length === 1).length >= 4,
        ambiguousRun: it.ambiguousRun,
      };

      // Nombre de pila pegado al número, antes («Javi 659979697», «ELVIRA- 663…») o después («(Carmen)», «-Paco)»).
      const nb = origBefore.match(/([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})[\s:\-–.,]{0,4}$/);
      const na = origAfter.match(/^[\s\-–.,(]{0,4}([A-Za-zÁÉÍÓÚÑáéíóúñ]{3,})/);
      if (nb && FIRST_NAMES.has(foldWord(nb[1])) && !AMBIGUOUS_NAMES.has(foldWord(nb[1]))) mention.nameAdjacent = true;
      if (na && FIRST_NAMES.has(foldWord(na[1])) && !AMBIGUOUS_NAMES.has(foldWord(na[1]))) mention.nameAdjacent = true;

      // ── descartes duros: no es un teléfono de contacto de esta vivienda ──
      if (!it.international && /^(?:90|80)/.test(key.slice(2))) mention.bad = "numero_no_geografico";
      for (const [re, why] of DIRECT_NUMBER_BAD_CTX) {
        if (!mention.bad && re.test(lastChars(before, 40))) mention.bad = why;
      }
      if (!mention.bad && /^\s*(?:€|eur\b|euros?\b|\$|\/\s?mes|m2\b|m²|mt2\b|metros\b|%)/.test(after)) mention.bad = "precio_o_superficie";
      if (!mention.bad && /(?:precio|importe|renta|€|eur)\W{0,3}$/.test(lastChars(before, 12))) mention.bad = "precio_o_superficie";
      // «Servicios cercanos: Farmacia - Calle X 0,15 km · Tel: +34 91…»: teléfonos de comercios, no del anunciante.
      if (!mention.bad && /\d[,.]\d{1,3}\s?km/i.test(text.slice(Math.max(0, start - 70), end + 70))) mention.bad = "listado_de_servicios_cercanos";
      // Líneas de autobús / metro: «líneas 1-9-72-73-40-43», «EMT: 70-11-72-73-9-53-7».
      const transport = /(?:autobus\w*|\blineas?\b|\bemt\b|\bbuses\b|\bbus\b|metro|cercanias|interurban\w*|nocturn\w*|paradas?)\W{0,4}(?:\w{1,3}\W{0,3})?$/.test(lastChars(before, 22));
      const allSingle = groups.length >= 8 && groups.every((g) => g.length === 1);
      const hyphenMulti =
        !allSingle && !/\s/.test(seps) && seps.length >= 4 && groups.length >= 5 && groups.filter((g) => g.length <= 2).length >= 4;
      if (!mention.bad && (transport || hyphenMulti) && !lastChars(before, 26).match(/(?:telef\w*|tlf\w*|telf\w*|whats\w*|wasap|llam\w*|movil|contact\w*)\W{0,4}$/)) {
        mention.bad = "lineas_de_transporte";
      }
      // Bloque de empresa pegado al número (tras quitar «sin agencia», «abstenerse inmobiliarias»…).
      if (!mention.bad) {
        const near = negated.slice(Math.max(0, start - 45), start) + " " + negated.slice(end, end + 12);
        if (COMPANY_MARKER.test(near)) mention.bad = "bloque_de_empresa";
      }
      out.push(mention);
    }
  }
  return out;
}

/** Todas las claves de teléfono que aparecen en un texto (sin filtrar contexto): índice para saber si un número está repartido. */
export function allPhoneKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const keys = new Set<string>();
  for (const m of findPhoneMentions(text)) keys.add(m.key);
  return [...keys];
}

export type SpreadRow = {
  id: string;
  advertiser_type: string | null;
  duplicate_of?: string | null;
  address?: string | null;
  zone?: string | null;
  square_meters?: number | null;
  bedrooms?: number | null;
};

/** Clave del INMUEBLE (no del anuncio): el mismo piso en dos portales o en venta y alquiler cuenta una vez. */
export function propertyKeyOf(r: SpreadRow): string {
  const sk = streetKey(r.address);
  if (sk.tokens.size && sk.number) return `s:${[...sk.tokens].sort().join(" ")}#${sk.number}`;
  if (r.square_meters && r.zone) return `z:${foldWord(r.zone)}|${r.square_meters}|${r.bedrooms ?? ""}`;
  return `i:${r.duplicate_of ?? r.id}`;
}

export function spreadFromRows(rows: SpreadRow[]): PhoneSpreadEntry {
  const props = new Set<string>();
  let pro = 0;
  for (const r of rows) {
    if (r.advertiser_type === "professional") pro++;
    else props.add(propertyKeyOf(r));
  }
  return { props: props.size, pro };
}

function keyOfStored(raw: string | null | undefined): string | null {
  return phoneKey(raw);
}

/** Distancia de edición ≤ 2 (typos y transposiciones) entre dos teléfonos de la misma longitud. */
function nearlySamePhone(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff <= 2;
}

function proposePhones(row: EnrichRow, text: string, spread: SpreadLookup | undefined, agencyText: boolean): Proposal[] {
  const out: Proposal[] = [];
  const mentions = findPhoneMentions(text);
  const good = mentions.filter((m) => !m.bad);
  const byKey = new Map<string, PhoneMention>();
  for (const m of good) {
    const prev = byKey.get(m.key);
    if (!prev || (!prev.cue && m.cue) || (!prev.nameAdjacent && m.nameAdjacent)) byKey.set(m.key, m);
  }
  const distinct = [...byKey.values()];
  const ownKeys = new Set([keyOfStored(row.phone), keyOfStored(row.phone2)].filter(Boolean) as string[]);
  const isPro = row.advertiser_type === "professional" || row.is_ad_professional === true;

  for (const m of mentions.filter((x) => x.bad && !byKey.has(x.key))) {
    out.push({
      field: "phone",
      value: m.value,
      confidence: "baja",
      rule: `phone.${m.bad}`,
      evidence: snippet(text, m.start, m.end),
      decision: "drop",
      reason: m.bad,
    });
  }

  const others = distinct.filter((d) => !ownKeys.has(d.key));
  const ownInText = distinct.length !== others.length;
  const phoneIsForeign = !!row.phone && /^\+(?!34)\d/.test(row.phone.trim().replace(/[\s\-()]/g, ""));
  for (const m of others) {
    const evidence = snippet(text, m.start, m.end);
    const base = { field: "phone" as EnrichField, value: m.value, evidence };
    const drop = (rule: string, reason: string): void => {
      out.push({ ...base, confidence: "baja", rule, decision: "drop", reason });
    };
    if (isPro) {
      drop("phone.anuncio_profesional", "anuncio_profesional");
      continue;
    }
    const sp = spread?.(m.key);
    if (sp && sp.pro >= 1) {
      drop("phone.numero_de_agencia", "aparece_en_anuncios_profesionales");
      continue;
    }
    if (sp && sp.props >= 3) {
      drop("phone.numero_repartido", `aparece_en_${sp.props}_inmuebles`);
      continue;
    }
    if (agencyText) {
      drop("phone.texto_de_agencia", "la_descripcion_habla_como_una_agencia");
      continue;
    }
    // «alta»: UN solo número nuevo, con etiqueta de contacto o nombre pegado, y como mucho el del registro al lado.
    let conf: Confidence;
    let rule: string;
    const labeled = m.cue || m.nameAdjacent;
    if (others.length === 1 && distinct.length <= 2 && labeled && !m.international && !m.ambiguousRun && !m.spelled) {
      conf = "alta";
      rule = ownInText ? "phone.junto_al_telefono_del_registro" : m.cue ? "phone.etiquetado" : "phone.nombre_pegado";
    } else if (others.length === 1 && (labeled || m.spelled)) {
      conf = "media";
      rule = m.international ? "phone.internacional" : m.ambiguousRun ? "phone.racha_ambigua" : m.spelled ? "phone.cifras_separadas" : "phone.mas_de_dos_numeros";
    } else if (others.length === 1) {
      conf = "media";
      rule = "phone.sin_etiqueta";
    } else if (others.every((d) => d.cue || d.nameAdjacent)) {
      conf = "media";
      rule = "phone.varios_etiquetados";
    } else {
      conf = "baja";
      rule = "phone.varios_sin_etiqueta";
    }
    if (conf === "alta" && !sp) {
      conf = "media";
      rule = "phone.sin_dato_de_reparto";
    }
    if (conf === "alta" && phoneIsForeign) {
      // un teléfono extranjero en la ficha + uno español en el texto es el patrón típico de la estafa: que decida una persona
      conf = "media";
      rule = "phone.ficha_con_telefono_extranjero";
    }

    // ¿dónde va? principal vacío → phone; si no, phone2 libre; nunca se pisa lo que hay.
    const hasPhone = !!(row.phone && row.phone.trim());
    const hasPhone2 = !!(row.phone2 && row.phone2.trim());
    let field: EnrichField = "phone";
    let decision: Proposal["decision"] = conf === "alta" ? "apply" : "candidate";
    let reason: string | undefined;
    if (hasPhone) {
      field = "phone2";
      const cur = keyOfStored(row.phone) ?? "";
      if (cur && nearlySamePhone(cur, m.key)) {
        conf = conf === "alta" ? "media" : conf;
        decision = "candidate";
        reason = "casi_igual_al_principal(posible_errata)";
      } else if (hasPhone2) {
        decision = "candidate";
        reason = "phone2_ocupado";
        if (conf === "alta") conf = "media";
      }
    }
    out.push({ ...base, field, confidence: conf, rule, decision, reason });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// B) Dirección exacta (calle + número)
// ─────────────────────────────────────────────────────────────────────────────

export type AddressMention = {
  /** Texto de la vía tal y como está escrito, sin el número («Calle de Orense»). */
  streetText: string;
  via: string;
  number: string;
  start: number;
  end: number;
  raw: string;
  /** location = «situado en…», proximity = «a 5 min de…», neutral = sin señal, portal_title = el título del anuncio del portal copiado en la descripción. */
  context: "location" | "proximity" | "neutral" | "poi" | "portal_title";
  /** «23 y 25», «45-47»: el anuncio abarca varios portales; no es un nº exacto. */
  range?: boolean;
};

// Vías escritas con palabra completa exigen un espacio detrás («climalit» no es «cl»); las abreviaturas con
// punto o barra («C/», «Avda.», «Pza.») no.
const VIA =
  "(?:calle|avenida|paseo|plaza|camino|ronda|traves[ií]a|glorieta|carretera|cuesta|bulevar|v[ií]a|pasaje)(?=\\s)|(?:c\\/|c\\.|cl\\.|avda\\.|avd\\.|av\\.|p\\.?[º°]|pso\\.|pza\\.|cmno\\.|ctra\\.|pje\\.)";
const ADDRESS_RE = new RegExp(
  `(?<![\\p{L}\\d])(${VIA})\\s*((?:[\\p{L}'’]+\\.?\\s+){0,6}?[\\p{L}'’]+\\.?)\\s*,?\\s*(?:n[º°o]?\\.?\\s*|num\\.?\\s*|n[uú]mero\\s+)?(\\d{1,3})(?![\\d.,]?\\d)(?:\\s?(?:bis|duplicado|[a-d](?![\\p{L}])))?`,
  "giu",
);

const NOT_STREET_WORD = new Set(
  `tranquila principal peatonal comercial ruidosa cortada concurrida transitada ancha estrecha cercana ... garaje aparcamiento parking trastero moto motos coche coches toros`.split(
    " ",
  ),
);
const POI_BEFORE =
  /(?:centro comercial|c\.\s?c\.|\bcc\b|estacion|metro|hospital|colegio|instituto|universidad|parque|mercadona|supermercado|clinica|iglesia|mercado|campus|aeropuerto|polideportivo|cine|teatro|museo|parada|intercambiador|biblioteca|residencia|gimnasio)\W{0,4}(?:de |del |la |el )?$/;
const PROXIMITY_BEFORE =
  /(?:a\s+\d+\s*(?:min\w*|metros|m\b|km)\w*\s*(?:andando\s*)?(?:de|del|a)?|cerca\s+(?:de|del)|junto\s+(?:a|al)|pr[o]xim[oa]\s+(?:a|al)|frente\s+(?:a|al)|enfrente|al\s+lado\s+(?:de|del)|esquina\s+(?:con|a)?|cruce\s+(?:con|de)|inmediaciones|alrededores|entre\s+(?:la\s+)?(?:calle|c\/)?|a\s+(?:escasos|pocos|unos)\s+metros|a\s+un\s+paso\s+(?:de|del)|colindante|zona\s+de|saliendo|detras\s+(?:de|del)|delante\s+(?:de|del)|cercan[ií]a|paralela\s+a|perpendicular\s+a|(?:calle|c\/)\s+\w+\s+y)(?:\s+(?:la|el|los|las|una|un))?\W{0,6}$/;
const LOCATION_BEFORE =
  /(?:situad[oa]s?\s+(?:en|sobre)|ubicad[oa]s?\s+(?:en|sobre)|sit[o]\s+en|localizad[oa]\s+en|se\s+encuentra\s+(?:en|sobre)|emplazad[oa]\s+en|direccion|domicilio|(?:piso|vivienda|apartamento|atico|estudio|local|chalet|casa|duplex|inmueble|propiedad|loft|plaza\s+de\s+garaje|garaje|trastero)\s+(?:en|de\s+\w+\s+en)|(?:se\s+)?(?:alquila|vende|alquilo|vendo)\s+(?:\w+\s+){0,4}?en|located\s+(?:on|at|in)|situated\s+(?:on|at|in)|(?:at|on)|en)\s+(?:la\s+|el\s+)?$/;

const AFTER_UNIT = /^\s*(?:m2|m²|mt|mts|metros|min\b|minutos|euros|€|%|hab\w*|dorm\w*|ba[nñ]os?|aseos?|plantas?|personas|meses|anos|años|km|kms|[ºª°]|a[nñ]os|tras|veces|pisos|viviendas|portales?|piso\b|planta\b|pta\b|puerta|escalera|esc\b|portal\b|exterior|interior|izq|dcha|derecha|izquierda|centro\b|bajo\b|th\b|st\b|nd\b|rd\b|floor)/;

export function findAddressMentions(text: string): AddressMention[] {
  const folded = foldKeepLen(text);
  const out: AddressMention[] = [];
  ADDRESS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ADDRESS_RE.exec(text)) !== null) {
    const via = m[1];
    const name = m[2];
    const number = m[3];
    const end = m.index + m[0].length;
    const nameTokens = name.split(/\s+/).filter(Boolean);
    const nameFolded = foldWord(name);
    // Tokens que delatan una frase y no un nombre de calle.
    const ABBR = new Set(["avda", "avd", "av", "gral", "gen", "dr", "dra", "pza", "pl", "sta", "sto", "ntra", "sra", "cmno", "ctra", "pje", "pso", "mª", "cdad", "pte", "tte", "cmdt", "fdez", "gmez", "rguez", "mtro", "ppe"]);
    if (
      nameTokens.some((t, i) => {
        if (!t.endsWith(".")) return false;
        const bare = foldWord(t).replace(/\.$/, "");
        return i === nameTokens.length - 1 || !ABBR.has(bare); // fin de frase o «palabra.» que no es abreviatura de calle
      })
    )
      continue;
    if (nameTokens.some((t) => foldWord(t).replace(/\.$/, "").length < 2)) continue; // «C. C Plaza», «Toledo A»
    if (/^(?:y|e|de|del|la|las|los|el|a|en)$/.test(foldWord(nameTokens[nameTokens.length - 1]))) continue; // «Plaza de Callao y»
    if (nameTokens.some((t) => /^(?:linea|lineas|metro|estacion|hospital|parada|autobus|bus|unos|unas|aprox|aproximadamente|minutos|metros|andando|coche|cerca|junto|muy|bien|esta|este|estos|estas|se|es|con|en|a)$/.test(foldWord(t).replace(/\.$/, "")))) continue;
    // «plaza de garaje», «calle de 4 carriles»…
    if (/^(?:plaza|pza\.?)$/i.test(via) && /^(?:de\s+)?(?:garaje|aparcamiento|parking|trastero|moto)/.test(nameFolded)) continue;
    if (AFTER_UNIT.test(foldKeepLen(text.slice(end, end + 18)))) continue;
    // ¿el número es un año/código en vez de portal? (portal 1-3 cifras ya forzado por la regex)
    const before = lastChars(folded.slice(0, m.index), 70);
    let context: AddressMention["context"] = "neutral";
    if (POI_BEFORE.test(lastChars(before, 30))) context = "poi";
    else if (PROXIMITY_BEFORE.test(before)) context = "proximity";
    else if (LOCATION_BEFORE.test(before)) context = "location";
    // El título del anuncio del portal copiado en la descripción («Alquiler de piso en C. de Galileo, 7, Arapiles…»).
    if (
      m.index < 140 &&
      /^(?:[\p{L} ]{3,30}\s+de\s+\d[\d.]*\s?m²,?\s*)?(?:(?:alquiler|venta)\s+de\s+[\p{L}\/ ]{2,40}\s+en|[\p{L}\/ ]{3,40}\s+en\s+(?:venta|alquiler)\s+en|[\p{L}\/ ]{3,40}\s+for\s+(?:rent|sale)\s+in)\s*$/iu.test(
        text.slice(0, m.index),
      )
    ) {
      context = "portal_title";
    }
    // «(esquina calle Hortaleza)» o «entre calle X y calle Y» → proximidad aunque no lleve la palabra al lado
    if (/[(]\s*$/.test(lastChars(text.slice(0, m.index), 3))) context = "proximity";
    out.push({
      streetText: `${via} ${name}`.replace(/\s+/g, " ").trim(),
      via,
      number,
      start: m.index,
      end,
      raw: m[0],
      context,
      range: /^\s*(?:y|e|-|–|\/|al)\s*\d{1,3}\b/i.test(text.slice(end, end + 12)) || undefined,
    });
  }
  return out;
}

/** «C/ orense» → «Calle Orense»; «AVDA. DE AMÉRICA» → «Avenida de América». */
export function prettyStreet(streetText: string): string {
  const t = streetText.replace(/\s+/g, " ").trim();
  const viaMap: Array<[RegExp, string]> = [
    [/^(?:c\/|c\.|cl\.?|calle)\s*/i, "Calle "],
    [/^(?:avda\.?|avd\.?|av\.|avenida)\s*/i, "Avenida "],
    [/^(?:pso\.?|p\.?[º°]|paseo)\s*/i, "Paseo "],
    [/^(?:pza\.?|plaza)\s*/i, "Plaza "],
    [/^(?:cmno\.?|camino)\s*/i, "Camino "],
    [/^(?:ctra\.?|carretera)\s*/i, "Carretera "],
    [/^(?:pje\.?|pasaje)\s*/i, "Pasaje "],
    [/^traves[ií]a\s*/i, "Travesía "],
    [/^v[ií]a\s*/i, "Vía "],
    [/^ronda\s*/i, "Ronda "],
    [/^glorieta\s*/i, "Glorieta "],
    [/^cuesta\s*/i, "Cuesta "],
    [/^bulevar\s*/i, "Bulevar "],
  ];
  let via = "";
  let rest = t;
  for (const [re, label] of viaMap) {
    if (re.test(t)) {
      via = label;
      rest = t.replace(re, "");
      break;
    }
  }
  const small = new Set(["de", "del", "la", "las", "los", "el", "y"]);
  const isShout = rest === rest.toUpperCase() || rest === rest.toLowerCase();
  const words = rest.split(" ").map((w, i) => {
    const f = w.toLowerCase();
    if (i > 0 && small.has(f)) return f;
    if (isShout) return f.charAt(0).toUpperCase() + f.slice(1);
    return w;
  });
  return `${via}${words.join(" ")}`.trim();
}

const TITLE_PREFIX =
  /^(?:(?:alquiler|venta)\s+de\s+)?(?:piso|apartamento|ático|atico|chalet|casa|dúplex|duplex|estudio|loft|local|finca|flat|apartment|house|studio|penthouse|villa|casa o chalet|casa de pueblo|casa rural)(?:\s+[\p{L}]+){0,3}?(?:\s*\/\s*(?:apartment|piso))?(?:\s+(?:en|for)\s+(?:venta|alquiler|sale|rent))?\s+(?:en|in)\s+/iu;

function stripTitlePrefix(address: string): string {
  return address.replace(TITLE_PREFIX, "").trim();
}

function tokenCloseEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  // 1 edición (inserción, borrado o sustitución)
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Las dos calles son la misma (tokens de una contenidos en la otra, tolerando 1 errata en nombres largos). */
export function sameStreet(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) {
    let hit = big.has(t);
    if (!hit) for (const u of big) if (tokenCloseEnough(t, u)) { hit = true; break; }
    if (!hit) return false;
  }
  return true;
}

function foldSet(s: string | null | undefined): string {
  return foldWord(s ?? "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** `address` ya trae el nº de portal («Calle Mayor, 5», «Piso en venta en Calle X, 12», «s/n»). */
export function addressHasNumber(address: string | null | undefined): boolean {
  if (!address) return false;
  const a = stripTitlePrefix(address);
  if (/\bs\/n\b/i.test(a)) return true;
  // «Calle X, 5», «Calle X, Madrid, 38», «Calle X 5 2ºB»: cualquier grupo de 1-3 cifras es un número de portal
  // (un código postal de 5 cifras no cuenta).
  return /(?<![\d])\d{1,3}(?![\d])/.test(a.replace(/\b\d{5}\b/g, " "));
}
function addressStreetInfo(row: EnrichRow): { tokens: Set<string>; hasStreet: boolean; clean: string } {
  const clean = stripTitlePrefix(row.address ?? "");
  const first = clean.split(",")[0] ?? "";
  const tokens = streetKey(first).tokens;
  const f = foldSet(first);
  // Si lo que hay es la zona o el municipio («Legazpi», «Sol»), no es una calle.
  const zoneLast = foldSet((row.zone ?? "").split("/").pop());
  const muni = foldSet(row.municipality);
  const isZoneOnly = !f || f === zoneLast || f === muni || (zoneLast && f === `${zoneLast} madrid`);
  const hasViaWord = /\b(?:calle|c\/|cl|avenida|avda|avd|av|paseo|plaza|pza|camino|ronda|travesia|glorieta|carretera|ctra|cuesta|bulevar|via|pasaje)\b/.test(foldWord(first));
  return { tokens, hasStreet: !isZoneOnly && tokens.size > 0 && (hasViaWord || tokens.size >= 2 || true), clean };
}

/** Inserta el nº tras la calle («Calle Mayor» → «Calle Mayor, 5»; «Calle Mayor, Sol, Madrid» → «Calle Mayor, 5, Sol, Madrid»). */
export function addNumberToAddress(address: string, number: string): string {
  const parts = address.split(",");
  parts[0] = `${parts[0].trim()}, ${number}`;
  return parts.map((p, i) => (i === 0 ? p : p.trim())).join(", ");
}

function distinctAddressMentions(ms: AddressMention[]): AddressMention[] {
  const seen = new Set<string>();
  const out: AddressMention[] = [];
  for (const m of ms) {
    const k = `${[...streetKey(m.streetText).tokens].sort().join(" ")}#${m.number}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(m);
    }
  }
  return out;
}

/** Título/rótulo del anuncio del portal que aún viaja en otro campo («Alquiler de piso en Calle X, 15» en `title` o `owner_name`). */
function listingTitles(row: EnrichRow): string[] {
  const out: string[] = [];
  if (row.title) out.push(row.title);
  if (row.owner_name && /\b(?:en|in)\s+(?:calle|c\/|c\.|avenida|avda|av\.|paseo|plaza|camino|ronda|carretera|v[ií]a)/i.test(row.owner_name)) out.push(row.owner_name);
  return out;
}

function proposeAddress(row: EnrichRow, text: string): Proposal[] {
  const out: Proposal[] = [];
  if (row.location_precision === "exact" && addressHasNumber(row.address)) return out;
  if (addressHasNumber(row.address)) return out; // la dirección ya trae número: no se toca
  const all = findAddressMentions(text);
  if (!all.length) return out;
  const info = addressStreetInfo(row);

  // El portal ya dio la dirección exacta en el título: la descripción solo puede coincidir (nada que añadir) o
  // contradecirla (se descarta). Que el título llegue a `address` es cosa de la limpieza de la migración 0186.
  const titleMentions = listingTitles(row).flatMap((t) => findAddressMentions(t));
  if (titleMentions.length) {
    for (const m of all) {
      const same = titleMentions.some(
        (t) => sameStreet(streetKey(t.streetText).tokens, streetKey(m.streetText).tokens) && t.number === m.number,
      );
      if (!same) {
        out.push({
          field: "address",
          value: `${prettyStreet(m.streetText)}, ${m.number}`,
          confidence: "baja",
          rule: "address.contradice_titulo_del_portal",
          evidence: snippet(text, m.start, m.end),
          decision: "drop",
          reason: "el_titulo_del_anuncio_ya_trae_otra_direccion",
        });
      }
    }
    return out;
  }

  for (const m of all) {
    if (m.context === "proximity" || m.context === "poi") {
      out.push({
        field: "address",
        value: `${prettyStreet(m.streetText)}, ${m.number}`,
        confidence: "baja",
        rule: `address.${m.context}`,
        evidence: snippet(text, m.start, m.end),
        decision: "drop",
        reason: m.context === "poi" ? "punto_de_interes_cercano" : "referencia_de_proximidad",
      });
    }
  }
  const usable = distinctAddressMentions(
    all.filter((m) => m.context === "location" || m.context === "neutral" || m.context === "portal_title"),
  );
  if (!usable.length) return out;

  const muniOrMadrid = row.municipality?.trim() || "Madrid";
  const zone = (row.zone ?? "").split("/").pop()?.replace(/-/g, " ").trim() ?? "";

  if (info.hasStreet) {
    const matching = usable.filter((m) => sameStreet(info.tokens, streetKey(m.streetText).tokens));
    for (const m of usable) {
      if (!matching.includes(m)) {
        out.push({
          field: "address",
          value: `${prettyStreet(m.streetText)}, ${m.number}`,
          confidence: "baja",
          rule: "address.calle_distinta",
          evidence: snippet(text, m.start, m.end),
          decision: "drop",
          reason: "la_calle_del_texto_no_es_la_del_anuncio",
        });
      }
    }
    if (!matching.length) return out;
    const exactlyOne = matching.length === 1 && !matching[0].range;
    for (const m of matching) {
      const value = addNumberToAddress(info.clean === (row.address ?? "").trim() ? info.clean : (row.address ?? "").trim(), m.number);
      const conf: Confidence = exactlyOne ? "alta" : "media";
      out.push({
        field: "address",
        value,
        confidence: conf,
        rule: exactlyOne
          ? m.context === "location"
            ? "address.calle_coincide_y_ubicacion"
            : "address.calle_coincide"
          : m.range
            ? "address.rango_de_numeros"
            : "address.varios_numeros_misma_calle",
        evidence: snippet(text, m.start, m.end),
        decision: conf === "alta" ? "apply" : "candidate",
        reason: exactlyOne ? undefined : m.range ? "rango_de_numeros" : "mas_de_un_numero_para_la_calle",
        expectedBefore: row.address,
        geo: {
          query: [prettyStreet(m.streetText) + ", " + m.number, zone, muniOrMadrid, "España"].filter(Boolean).join(", "),
          number: m.number,
          street: m.streetText,
          saveCoords: true,
          trusted: exactlyOne,
        },
      });
    }
    return out;
  }

  // Sin calle en `address` (vacío, solo zona/municipio): hace falta ubicación inequívoca + Nominatim.
  for (const m of usable.slice(0, 2)) {
    if (m.context === "portal_title" && usable.length === 1) {
      out.push({
        field: "address",
        value: `${prettyStreet(m.streetText)}, ${m.number}`,
        confidence: "alta",
        rule: "address.titulo_del_portal_en_descripcion",
        evidence: snippet(text, m.start, m.end),
        decision: "apply",
        expectedBefore: row.address,
        geo: {
          query: [prettyStreet(m.streetText) + ", " + m.number, zone, muniOrMadrid, "España"].filter(Boolean).join(", "),
          number: m.number,
          street: m.streetText,
          saveCoords: true,
          trusted: true,
        },
      });
      continue;
    }
    const strong = m.context === "location" && usable.length === 1;
    out.push({
      field: "address",
      value: `${prettyStreet(m.streetText)}, ${m.number}`,
      confidence: strong ? "media" : "baja",
      rule: strong ? "address.sin_calle_en_ficha.ubicacion" : "address.sin_calle_en_ficha.sin_confirmar",
      evidence: snippet(text, m.start, m.end),
      decision: "candidate",
      reason: "sin_calle_en_la_ficha_solo_sube_a_alta_si_nominatim_lo_confirma",
      expectedBefore: row.address,
      geo: {
        query: [prettyStreet(m.streetText) + ", " + m.number, zone, muniOrMadrid, "España"].filter(Boolean).join(", "),
        number: m.number,
        street: m.streetText,
        saveCoords: true,
        trusted: false,
      },
    });
  }
  return out;
}

// ── Confirmación con Nominatim ──────────────────────────────────────────────

export type GeoHit = {
  lat: number;
  lng: number;
  hasHouseNumber: boolean;
  houseNumber?: string;
  road?: string;
  city?: string;
};

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type GeoVerdict = {
  confirmed: boolean;
  /** hay pin guardado y Nominatim lo contradice (>1,5 km): la dirección no es fiable. */
  conflictsWithPin: boolean;
  why: string;
};

const MAX_PIN_DISTANCE_M = 1500;

/**
 * ¿Nominatim confirma «calle + número» en este municipio? Exige: house_number
 * igual, calle parecida, mismo municipio (si se conoce) y, si ya hay pin del
 * portal, a ≤1,5 km de él.
 */
export function verifyWithGeocode(row: EnrichRow, geo: GeoCheck, hit: GeoHit | null): GeoVerdict {
  if (!hit) return { confirmed: false, conflictsWithPin: false, why: "nominatim_sin_resultado" };
  const hasPin = typeof row.latitude === "number" && typeof row.longitude === "number";
  const dist = hasPin ? distanceMeters(row.latitude as number, row.longitude as number, hit.lat, hit.lng) : null;
  if (dist !== null && dist > MAX_PIN_DISTANCE_M) {
    return { confirmed: false, conflictsWithPin: true, why: `a_${Math.round(dist)}_m_del_pin_del_portal` };
  }
  if (!hit.hasHouseNumber || !hit.houseNumber) return { confirmed: false, conflictsWithPin: false, why: "nominatim_sin_numero_de_portal" };
  const hn = hit.houseNumber.match(/\d+/)?.[0];
  if (hn !== geo.number) return { confirmed: false, conflictsWithPin: false, why: `numero_devuelto_${hit.houseNumber}` };
  if (!hit.road || !sameStreet(streetKey(hit.road).tokens, streetKey(geo.street).tokens)) {
    return { confirmed: false, conflictsWithPin: false, why: `calle_devuelta_${hit.road ?? "ninguna"}` };
  }
  const muni = foldSet(row.municipality);
  if (muni) {
    const city = foldSet(hit.city);
    if (!city || !(city === muni || city.includes(muni) || muni.includes(city))) {
      return { confirmed: false, conflictsWithPin: false, why: `municipio_devuelto_${hit.city ?? "ninguno"}` };
    }
  } else if (!hasPin) {
    // Sin municipio ni pin no hay con qué contrastar la ciudad: no se sube a alta.
    return { confirmed: false, conflictsWithPin: false, why: "sin_municipio_ni_pin_para_contrastar" };
  }
  return { confirmed: true, conflictsWithPin: false, why: "nominatim_confirma_calle_numero_y_municipio" };
}

/**
 * Ajusta la propuesta de dirección con el veredicto de Nominatim y dice si se pueden guardar coordenadas
 * (precision 'exact'):
 *  - confirmada → alta (si ya lo era, sigue siéndolo; si era candidata sin calle en la ficha, SUBE a alta) y con coordenadas;
 *  - contradice el pin del portal (>1,5 km) → candidato de confianza media, sin tocar nada;
 *  - sin confirmar → la dirección «trusted» (calle de la ficha / título del portal) se aplica solo como texto,
 *    sin coordenadas; la que dependía de Nominatim sigue siendo candidata.
 */
export function applyGeoVerdict(p: Proposal, verdict: GeoVerdict): { proposal: Proposal; saveCoords: boolean } {
  if (verdict.confirmed) {
    return {
      proposal: {
        ...p,
        confidence: "alta",
        decision: "apply",
        rule: p.geo?.trusted ? p.rule : "address.nominatim_confirma",
        reason: verdict.why,
      },
      saveCoords: true,
    };
  }
  if (verdict.conflictsWithPin) {
    return {
      proposal: { ...p, confidence: "media", decision: "candidate", rule: "address.contradice_pin_del_portal", reason: verdict.why },
      saveCoords: false,
    };
  }
  return { proposal: { ...p, reason: verdict.why }, saveCoords: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// C) Responsable (nombre de la persona)
// ─────────────────────────────────────────────────────────────────────────────

export type NameMention = { name: string; rule: string; strongPersonal: boolean; known: boolean; start: number; end: number };

const NAME_TOKEN = "[A-Za-zÁÉÍÓÚÑáéíóúñÜü]{2,}";
const PERSONAL_CUE =
  /(?:\bsoy|\bme\s+llamo|\bmi\s+nombre\s+es|\bllam(?:ar|a|ad|e|en|arme|adme)\s+(?:a|con|directamente\s+a|al\s+(?:propietario|dueno)\s+)|\bpregunt(?:ar|a|e|ad)\s+por|\bhablar\s+con|\bhabla\s+con|\bun\s+(?:cordial\s+)?saludo|\bsaludos|\batentamente|\bcordialmente|\bbesos|\babrazos)\s*[,:.;!\-–]?\s*/gi;
const SOFT_CUE =
  /(?:\bcontact(?:ar|a|ad|e|o|os)?\s*(?:con|a)?|\batiende[n]?|\batender[aá]|\bense[nñ]a|\bmuestra|\bresponsable|\bpersona\s+de\s+contacto|\bpropietari[oa]|\bvendedor[a]?|\bnombre|\binteresados\s+(?:contactar|llamar)\s+(?:con|a))\s*[:\-–]?\s*/gi;

function readNameAfter(text: string, from: number): { name: string; end: number; known: boolean } | null {
  const rest = text.slice(from, from + 60);
  const re = new RegExp(`^(${NAME_TOKEN})((?:\\s+(?:y\\s+)?${NAME_TOKEN}){0,2})`);
  const m = rest.match(re);
  if (!m) return null;
  const first = m[1];
  const f1 = foldWord(first);
  if (NAME_STOPWORDS.has(f1)) return null;
  // El nombre debe empezar en mayúscula o venir TODO en mayúsculas («ELVIRA»).
  if (!/^[A-ZÁÉÍÓÚÑ]/.test(first)) return null;
  const known = FIRST_NAMES.has(f1);
  const tokens = [first];
  let end = from + first.length;
  // Segundos tokens: solo si también son nombres de pila («María José», «Juan Manuel»).
  const extra = (m[2] ?? "").trim().split(/\s+/).filter(Boolean);
  for (const t of extra) {
    const ft = foldWord(t);
    if (ft === "y") break;
    if (FIRST_NAMES.has(ft) && /^[A-ZÁÉÍÓÚÑ]/.test(t) && known) {
      tokens.push(t);
      const idx = text.indexOf(t, end);
      end = idx >= 0 ? idx + t.length : end + t.length + 1;
    } else break;
  }
  // Tras el nombre no puede venir una razón social o un apellido que lo convierta en empresa.
  const tail = foldWord(text.slice(end, end + 20));
  if (/^\s+(?:inmobiliaria|real estate|s\.?l\b|s\.?a\b|group|grupo|asesor|propiedades|homes|properties|gestion)/.test(tail)) return null;
  if (/^[@.]\w/.test(text.slice(end, end + 3))) return null;
  return { name: titleCaseName(tokens.join(" ")), end, known };
}

export function findNameMentions(text: string, phoneMentions: PhoneMention[]): NameMention[] {
  const out: NameMention[] = [];
  const scan = (re: RegExp, strongPersonal: boolean, rule: string) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const from = m.index + m[0].length;
      const r = readNameAfter(text, from);
      if (r) out.push({ name: r.name, rule, strongPersonal, known: r.known, start: m.index, end: r.end });
    }
  };
  scan(PERSONAL_CUE, true, "name.formula_personal");
  scan(/(?<=[a-zñáéíóú])Soy\s+/g, true, "name.formula_personal"); // «Madrid RíoSoy Elena» (sin espacio)
  scan(SOFT_CUE, false, "name.contacto");
  // «Javi 659979697», «605600935-Yolanda»: nombre pegado a un teléfono etiquetado.
  for (const p of phoneMentions) {
    if (p.bad || !(p.cue || p.nameAdjacent)) continue;
    const before = text.slice(Math.max(0, p.start - 24), p.start);
    const mb = before.match(new RegExp(`(${NAME_TOKEN})[\\s:\\-–.,]{0,4}$`));
    const after = text.slice(p.end, p.end + 24);
    const ma = after.match(new RegExp(`^[\\s\\-–.,(]{0,4}(${NAME_TOKEN})`));
    for (const [mm, start, end] of [
      [mb, p.start - (mb?.[0].length ?? 0), p.end],
      [ma, p.start, p.end + (ma?.[0].length ?? 0)],
    ] as const) {
      if (!mm || !/^[A-ZÁÉÍÓÚÑ]/.test(mm[1])) continue;
      const f = foldWord(mm[1]);
      if (NAME_STOPWORDS.has(f) || /^(?:contacto|tel|tlf|whatsapp|llamar|llamadas?|visitas?|info)$/.test(f)) continue;
      const known = FIRST_NAMES.has(f);
      // Un nombre que no está en la lista solo cuenta (para saber si hay VARIOS nombres) si parece un nombre:
      // «Massimo» sí, «ESCRIBEME» o «Abstenerse» no.
      if (!known && !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,11}$/.test(mm[1])) continue;
      out.push({
        name: titleCaseName(mm[1]),
        rule: "name.pegado_al_telefono",
        strongPersonal: known && !AMBIGUOUS_NAMES.has(f),
        known,
        start,
        end,
      });
    }
  }
  return out;
}

function proposeOwner(row: EnrichRow, text: string, phoneMentions: PhoneMention[], agencyText: boolean): Proposal[] {
  if (!isGenericOwnerName(row.owner_name)) return [];
  if (row.advertiser_type === "professional" || row.is_ad_professional === true) return [];
  const mentions = findNameMentions(text, phoneMentions);
  if (!mentions.length) return [];
  const byFirst = new Map<string, NameMention[]>();
  for (const n of mentions) {
    const k = foldWord(n.name.split(" ")[0]);
    byFirst.set(k, [...(byFirst.get(k) ?? []), n]);
  }
  const out: Proposal[] = [];
  const distinctCount = byFirst.size;
  for (const [k, list] of byFirst) {
    if (!list.some((x) => x.known)) continue; // «Gencias», «Exclusivo»: no es un nombre de pila, ni como candidato
    const best = list.find((x) => x.known && x.strongPersonal) ?? list.find((x) => x.known) ?? list[0];
    const ambiguous = AMBIGUOUS_NAMES.has(k);
    let conf: Confidence;
    let rule = best.rule;
    if (agencyText) {
      out.push({ field: "owner_name", value: best.name, confidence: "baja", rule: "name.texto_de_agencia", evidence: snippet(text, best.start, best.end, 50), decision: "drop", reason: "la_descripcion_habla_como_una_agencia" });
      continue;
    }
    if (best.known && distinctCount === 1 && (!ambiguous || best.strongPersonal)) conf = "alta";
    else if (best.known) {
      conf = "media";
      rule = distinctCount > 1 ? "name.varios_nombres" : "name.ambiguo";
    } else {
      conf = "baja";
      rule = "name.no_es_nombre_de_pila_conocido";
    }
    out.push({
      field: "owner_name",
      value: best.name,
      confidence: conf,
      rule,
      evidence: snippet(text, best.start, best.end, 50),
      decision: conf === "alta" ? "apply" : "candidate",
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan completo
// ─────────────────────────────────────────────────────────────────────────────

export type EnrichPlan = {
  proposals: Proposal[];
  skipped?: string;
};

/**
 * Decide qué se puede añadir a una fila. NO escribe nada ni usa red: la dirección
 * trae `geo` para que el job la confirme con Nominatim y llame a `applyGeoVerdict`.
 */
export function planEnrichment(row: EnrichRow, opts: { spread?: SpreadLookup | null } = {}): EnrichPlan {
  const text = (row.description ?? "").trim();
  if (text.length < 15) return { proposals: [], skipped: "sin_descripcion" };
  if (row.advertiser_type === "professional" || row.is_ad_professional === true) {
    return { proposals: [], skipped: "anuncio_de_agencia" };
  }
  if (looksLikeScamTemplate(text)) return { proposals: [], skipped: "plantilla_de_estafa" };
  const agencyText = looksLikeAgencyText(text);
  const phoneMentions = findPhoneMentions(text);
  const proposals = [
    ...proposePhones(row, text, opts.spread ?? undefined, agencyText),
    ...proposeAddress(row, text),
    ...proposeOwner(row, text, phoneMentions, agencyText),
  ];
  return { proposals };
}

/** Clave estable de un candidato (para aceptar/descartar sin que cambie al reprocesar). */
export function candidateKey(p: Pick<Proposal, "field" | "value">): string {
  return `${p.field}:${foldWord(p.value).replace(/[^a-z0-9+]+/g, "")}`;
}
