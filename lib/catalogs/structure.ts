import type { StoryChapter } from "@/lib/services/story/types";
import { countWords, fold, sentences } from "./text-rules";

// ============================================================================
// Organizador de la descripción del catálogo (expediente
// 2026-10-21-bcp-01-descripcion-estructurada, DE1–DE9). PURO y determinista:
// sin IA, sin red. Lo usan editorial.ts (lector y PDF, al proyectar la
// instantánea) y el editor (vista previa en vivo): UNA sola representación.
//
// Qué hace: reparte un texto escrito (a mano, por la IA o la descripción
// limpia) en la estructura estándar, frase a frase, por palabras clave,
// sinónimos y contexto. Nunca reescribe, resume ni añade nada: cada frase se
// mueve LITERAL a un único sitio. Lo que no casa con ningún tema se queda en
// la introducción. Las negaciones («sin ascensor») viajan tal cual.
// ============================================================================

export type SectionKey = "living" | "kitchen" | "finishes" | "building" | "barrio";

/** Orden fijo de la estructura (DE1). */
export const SECTION_ORDER: readonly SectionKey[] = ["living", "kitchen", "finishes", "building", "barrio"];

/** Vocabulario cerrado de los títulos (el de las historias, D6). */
export const SECTION_HEADINGS: Record<SectionKey, string> = {
  living: "Salón y luz",
  kitchen: "Cocina y comedor",
  finishes: "Acabados y confort",
  building: "La finca",
  barrio: "El barrio",
};

/** Para el aviso del editor: «Sin material sobre: la cocina, la finca». */
export const SECTION_LABELS: Record<SectionKey, string> = {
  living: "el salón y la luz",
  kitchen: "la cocina",
  finishes: "los acabados",
  building: "la finca",
  barrio: "la zona",
};

/** Título de la parte; «Vivir en …» con la zona VERIFICADA de la ficha (DE9). */
export function sectionHeading(key: SectionKey, area: string | null): string {
  if (key === "barrio") {
    const a = (area ?? "").replace(/\s+/g, " ").trim();
    return a ? `Vivir en ${a}` : SECTION_HEADINGS.barrio;
  }
  return SECTION_HEADINGS[key];
}

/** PR6 (DA18): clave del bloque. «intro» es la introducción sin título. */
export type CopyKey = "intro" | SectionKey;

export interface CopyBlock {
  heading: string | null;
  text: string;
  /** PR6 · Clave de sección del bloque (la traducción la conserva y el título
   *  sale del diccionario del idioma; nunca se reclasifica texto traducido). */
  key: CopyKey;
}

export interface StructureInput {
  /** Entrada propia (si la hay): abre la introducción tal cual. */
  lead: string | null;
  /** Párrafos del texto escrito, en orden (ya sin contacto). */
  paragraphs: string[];
  /** Capítulos aprobados de una historia: se conservan sin reclasificar (DE7). */
  chapters?: Array<{ chapter: StoryChapter; text: string }>;
  /** Zona verificada de la ficha (subzona o zona), o null. */
  area: string | null;
  /** 0222 · Plantilla «Vivir en…» de este catálogo: solo se usa si el texto
   *  no tiene ya material de la zona (DA25). */
  areaText?: string | null;
}

export interface Structured {
  copy: CopyBlock[];
  /** Partes de la estructura sin material (para el aviso del editor, DE10). */
  missing: SectionKey[];
  /** PR6 · El bloque «barrio» es la plantilla «Vivir en…» de este catálogo
   *  (se traduce aparte, por su versión: DA27). */
  areaTextUsed?: boolean;
}

/** Párrafos de un texto (separados por una línea en blanco), sin vacíos. */
export function paragraphsOf(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const LEAD_MAX_WORDS = 45;

/** 1–2 primeras frases literales, de 45 palabras como máximo (o null). */
export function leadFrom(text: string | null): { lead: string | null; rest: string } {
  const all = sentences(text ?? "");
  if (all.length === 0) return { lead: null, rest: "" };
  if (countWords(all[0]) > LEAD_MAX_WORDS) return { lead: null, rest: all.join(" ") };
  let n = 1;
  if (all.length > 1 && countWords(all[0]) < 20 && countWords(`${all[0]} ${all[1]}`) <= LEAD_MAX_WORDS) n = 2;
  return { lead: all.slice(0, n).join(" "), rest: all.slice(n).join(" ") };
}

// ── Palabras clave (sobre texto SIN tildes y en minúsculas: fold) ───────────
// Las frases hechas se evalúan antes que las palabras sueltas y se consumen:
// «plaza de garaje» cuenta para la finca y no deja «plaza» al barrio.

type Rule = [SectionKey, RegExp, number];

const PHRASES: Rule[] = [
  ["living", /\bsal[oa]n[- ]comedor\b/g, 2],
  ["living", /\b(sala|zona|cuarto) de estar\b/g, 2],
  ["living", /\bdoble altura\b/g, 2],
  ["living", /\borientaci[oó]n (sur|norte|este|oeste|sureste|suroeste|noreste|noroeste)\b/g, 2],
  ["living", /\borientad[oa]s? al? (sur|norte|este|oeste|sureste|suroeste|noreste|noroeste|mediodia)\b/g, 2],
  ["living", /\bluz natural\b/g, 2],
  ["kitchen", /\bcocina[- ]office\b/g, 2],
  ["kitchen", /\bzona de desayuno\b/g, 2],
  ["finishes", /\bsuelo radiante\b/g, 2],
  ["finishes", /\baire acondicionado\b/g, 2],
  ["finishes", /\bdoble acristalamiento\b/g, 2],
  ["finishes", /\bgas natural\b/g, 2],
  ["finishes", /\barmarios? empotrados?\b/g, 2],
  ["finishes", /\btechos? altos?\b/g, 2],
  ["finishes", /\ba estrenar\b/g, 2],
  ["finishes", /\bparque de (roble|madera)\b/g, 2],
  ["building", /\bplazas? de (garaje|aparcamiento|parking)\b/g, 2],
  ["building", /\bzonas? comunes\b/g, 2],
  ["building", /\bpiscina comunitaria\b/g, 2],
  ["building", /\bjardines? comunitarios?\b/g, 2],
  ["building", /\b(ano|fecha) de construccion\b/g, 2],
  ["building", /\bconstruid[oa] en\b/g, 2],
  ["building", /\b(planta|piso) (baja|primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima|alta|\d+)\b/g, 1],
  ["building", /\b(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima|ultima) planta\b/g, 1],
  ["barrio", /\ba (pocos|dos|cinco|diez|quince) (minutos|pasos)\b/g, 2],
  ["barrio", /\ba un paso\b/g, 2],
  ["barrio", /\bzona (residencial|tranquila|consolidada)\b/g, 2],
  ["barrio", /\bbien comunicad[oa]\b/g, 2],
  ["barrio", /\ben pleno\b/g, 1],
  ["barrio", /\bcorazon de\b/g, 1],
  ["barrio", /\bse encuentra\b/g, 1],
  ["barrio", /\bcerca de\b/g, 1],
  ["barrio", /\bjunto a\b/g, 1],
  ["barrio", /\bproxim[oa] a\b/g, 1],
];

const WORDS: Rule[] = [
  ["living", /\bsalon(es|cito)?\b/g, 2],
  ["living", /\bventanal?(es)?\b/g, 1],
  ["living", /\bmirador\b/g, 1],
  ["living", /\bgaleria\b/g, 1],
  ["living", /\bbalcon(es)?\b/g, 1],
  ["living", /\borientaci[oó]n\b/g, 1],
  ["living", /\borientad[oa]s?\b/g, 1],
  ["living", /\bluz\b/g, 1],
  ["living", /\bluminos[oa]s?\b/g, 1],
  ["living", /\bluminosidad\b/g, 1],
  ["living", /\bsolead[oa]s?\b/g, 1],
  ["living", /\bsol\b/g, 1],
  ["living", /\bclaridad\b/g, 1],
  ["living", /\bexterior\b/g, 1],
  ["living", /\bvistas\b/g, 1],
  ["kitchen", /\bcocinas?\b/g, 2],
  ["kitchen", /\boffice\b/g, 1],
  ["kitchen", /\bcomedor\b/g, 1],
  ["kitchen", /\belectrodomesticos?\b/g, 1],
  ["kitchen", /\bhorno\b/g, 1],
  ["kitchen", /\bmicroondas\b/g, 1],
  ["kitchen", /\bvitroceramica\b/g, 1],
  ["kitchen", /\binduccion\b/g, 1],
  ["kitchen", /\b(frigorifico|nevera)\b/g, 1],
  ["kitchen", /\blavavajillas\b/g, 1],
  ["kitchen", /\b(lavadora|secadora)\b/g, 1],
  ["kitchen", /\bcampana\b/g, 1],
  ["kitchen", /\bencimera\b/g, 1],
  ["kitchen", /\bisla\b/g, 1],
  ["kitchen", /\bdespensa\b/g, 1],
  ["kitchen", /\blavadero\b/g, 1],
  ["finishes", /\bacabados?\b/g, 1],
  ["finishes", /\bmateriales?\b/g, 1],
  ["finishes", /\bcalidad(es)?\b/g, 1],
  ["finishes", /\bsuelos?\b/g, 1],
  ["finishes", /\btarima\b/g, 1],
  ["finishes", /\bparquet\b/g, 1],
  ["finishes", /\bmarmol\b/g, 1],
  ["finishes", /\bmadera\b/g, 1],
  ["finishes", /\bcarpinteria\b/g, 1],
  ["finishes", /\bclimalit\b/g, 1],
  ["finishes", /\baluminio\b/g, 1],
  ["finishes", /\bpvc\b/g, 1],
  ["finishes", /\baislamiento\b/g, 1],
  ["finishes", /\bcalefaccion\b/g, 1],
  ["finishes", /\bradiador(es)?\b/g, 1],
  ["finishes", /\bcaldera\b/g, 1],
  ["finishes", /\bclimatiza(cion|d[oa]s?)\b/g, 1],
  ["finishes", /\baerotermia\b/g, 1],
  ["finishes", /\bdomotica\b/g, 1],
  ["finishes", /\barmarios?\b/g, 1],
  ["finishes", /\breforma(d[oa]s?)?\b/g, 1],
  ["finishes", /\brehabilitad[oa]s?\b/g, 1],
  ["finishes", /\bconfort\b/g, 1],
  ["finishes", /\bchimenea\b/g, 1],
  ["finishes", /\bmolduras\b/g, 1],
  ["finishes", /\bpuertas\b/g, 1],
  ["finishes", /\biluminacion\b/g, 1],
  ["finishes", /\binsonoriza(cion|d[oa]s?)\b/g, 1],
  ["finishes", /\bgriferia\b/g, 1],
  ["finishes", /\bsanitarios\b/g, 1],
  ["finishes", /\bazulejos?\b/g, 1],
  ["building", /\bfinca\b/g, 2],
  ["building", /\bedificio\b/g, 2],
  ["building", /\bportal\b/g, 1],
  ["building", /\bascensor(es)?\b/g, 2],
  ["building", /\bporter[oa]\b/g, 2],
  ["building", /\bporteria\b/g, 2],
  ["building", /\bconserjer?[iì]a?\b/g, 2],
  ["building", /\bcomunidad\b/g, 1],
  ["building", /\bcomunitari[oa]s?\b/g, 1],
  ["building", /\bgaraje\b/g, 1],
  ["building", /\bparking\b/g, 1],
  ["building", /\btrastero\b/g, 1],
  ["building", /\bfachada\b/g, 1],
  ["building", /\bescalera\b/g, 1],
  ["building", /\bvecinos\b/g, 1],
  ["building", /\bsiglo\b/g, 1],
  ["building", /\burbanizacion\b/g, 1],
  ["building", /\bazotea\b/g, 1],
  ["building", /\bgimnasio\b/g, 1],
  ["building", /\bvideoportero\b/g, 1],
  ["building", /\bseguridad\b/g, 1],
  ["barrio", /\bbarrio\b/g, 2],
  ["barrio", /\bcalle\b/g, 1],
  ["barrio", /\bavenida\b/g, 1],
  ["barrio", /\bpaseo\b/g, 1],
  ["barrio", /\bplaza\b/g, 1],
  ["barrio", /\bmetro\b/g, 1],
  ["barrio", /\bparada\b/g, 1],
  ["barrio", /\b(autobus(es)?|bus)\b/g, 1],
  ["barrio", /\bcercanias\b/g, 1],
  ["barrio", /\btransportes?\b/g, 1],
  ["barrio", /\bcomercios?\b/g, 1],
  ["barrio", /\btiendas?\b/g, 1],
  ["barrio", /\bcolegios?\b/g, 1],
  ["barrio", /\buniversidad\b/g, 1],
  ["barrio", /\bhospital\b/g, 1],
  ["barrio", /\bparques?\b/g, 1],
  ["barrio", /\brestaurantes?\b/g, 1],
  ["barrio", /\bservicios\b/g, 1],
  ["barrio", /\bmercado\b/g, 1],
  ["barrio", /\brodead[oa]s?\b/g, 1],
  ["barrio", /\bentorno\b/g, 1],
  ["barrio", /\bubicad[oa]s?\b/g, 1],
  ["barrio", /\bubicacion\b/g, 1],
  ["barrio", /\bsituad[oa]s?\b/g, 1],
  ["barrio", /\bsituacion\b/g, 1],
  ["barrio", /\bcomunicad[oa]s?\b/g, 1],
  ["barrio", /\bcomunicaciones\b/g, 1],
  ["barrio", /\bambiente\b/g, 1],
  ["barrio", /\bvecindario\b/g, 1],
];

/** Frases que continúan la anterior (contexto, DE3): sin palabra clave,
 *  heredan su tema. */
const CONTINUATION_RE =
  /^(ademas|tambien|asimismo|igualmente|todo ello|este|esta|estos|estas|ese|esa|esos|esas|sus?|dich[oa]s?|el cual|la cual|los cuales|las cuales|lo que|cuenta con|dispone de|tiene|incluye|con|y|e|ambos|ambas|aqui|alli|todo|desde (el|ella|ellos|ellas|ahi|aqui))\b/;

/** Una calle con el nombre de la zona no habla del barrio (DA37): «la calle
 *  Goya», «el paseo de la Castellana», «la plaza de Olavide». */
const STREET_BEFORE = "(?<!\\b(?:calle|c\\/|paseo|avenida|avda\\.?|plaza|pza\\.?|glorieta|ronda|travesia)\\s+(?:(?:de|del|la|las|los|el)\\s+){0,2})";

/** Nombres de la zona verificada que cuentan como palabra clave (DE9). */
function areaRules(area: string | null): Rule[] {
  const words = fold(area ?? "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4);
  return words.map((w) => ["barrio", new RegExp(`${STREET_BEFORE}\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), 2]);
}

/** Puntuación por tema de una frase: frases hechas (consumidas) y palabras. */
function scores(sentence: string, extra: Rule[]): { best: SectionKey | null; firstAt: number } {
  let text = fold(sentence);
  const total: Record<SectionKey, number> = { living: 0, kitchen: 0, finishes: 0, building: 0, barrio: 0 };
  const first: Record<SectionKey, number> = { living: Infinity, kitchen: Infinity, finishes: Infinity, building: Infinity, barrio: Infinity };
  const apply = (rules: Rule[], consume: boolean) => {
    for (const [key, re, w] of rules) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let hit = false;
      while ((m = re.exec(text))) {
        hit = true;
        first[key] = Math.min(first[key], m.index);
        if (consume) text = text.slice(0, m.index) + " ".repeat(m[0].length) + text.slice(m.index + m[0].length);
      }
      if (hit) total[key] += w;
    }
  };
  apply(PHRASES, true);
  apply(extra, false);
  apply(WORDS, false);
  let best: SectionKey | null = null;
  for (const key of SECTION_ORDER) {
    if (total[key] === 0) continue;
    if (!best || total[key] > total[best] || (total[key] === total[best] && first[key] < first[best])) best = key;
  }
  return { best, firstAt: best ? first[best] : Infinity };
}

// ── Títulos escritos por el autor (DE6) ─────────────────────────────────────

const HEADING_ALIASES: Array<[SectionKey, RegExp]> = [
  ["living", /^(el )?salon( y (la )?luz| y comedor|[- ]comedor)?$|^(la )?luz$|^(sala|zona) de estar$|^estar$/],
  ["kitchen", /^(la )?cocina( y (el )?comedor| y office|[- ]office)?$|^(el )?comedor$/],
  ["finishes", /^(los )?acabados( y (el )?confort)?$|^confort$|^calidades$|^equipamiento$|^instalaciones$|^materiales$/],
  ["building", /^(la )?finca$|^(el )?edificio$|^zonas comunes$|^(la )?comunidad$/],
  ["barrio", /^(el )?barrio( de .+)?$|^(la )?zona$|^(el )?entorno$|^ubicacion$|^localizacion$|^situacion$|^vivir en .+$/],
];

/** Si la línea es un título: la parte (o "other" si es un título ajeno a la
 *  estructura). null si es texto normal. */
function headingOf(line: string, onlyLine: boolean): SectionKey | "other" | null {
  const raw = line.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^[#*\-–•\s]+/, "").replace(/[*_\s]+$/, "").trim();
  const colon = /:$/.test(cleaned);
  const label = fold(cleaned.replace(/:$/, "")).trim();
  if (!label || countWords(label) > 5 || /[.!?]/.test(label)) return null;
  for (const [key, re] of HEADING_ALIASES) if (re.test(label)) return key;
  // Un título que no es de la estructura: solo si lo parece de verdad (acaba
  // en dos puntos, o es una línea corta sin punto final que precede a más
  // texto y empieza en mayúscula).
  if (colon) return "other";
  if (!onlyLine && countWords(label) <= 4 && /^[A-ZÁÉÍÓÚÑ]/.test(cleaned)) return "other";
  return null;
}

interface Unit {
  text: string;
  forced: SectionKey | null;
}

/** Párrafos → unidades de texto con la parte forzada por un título previo. */
function unitsOf(paragraphs: string[]): Unit[] {
  const out: Unit[] = [];
  let forced: SectionKey | null = null;
  for (const p of paragraphs) {
    const lines = p.split(/\n/).map((l) => l.trim()).filter(Boolean);
    let buf: string[] = [];
    const flush = () => {
      if (buf.length) out.push({ text: buf.join(" "), forced });
      buf = [];
    };
    for (const line of lines) {
      const h = headingOf(line, lines.length === 1);
      if (h === null) {
        buf.push(line);
        continue;
      }
      flush();
      forced = h === "other" ? null : h;
    }
    flush();
  }
  return out;
}

const SUPPORTED_CHAPTERS: Partial<Record<StoryChapter, SectionKey>> = {
  living: "living",
  kitchen: "kitchen",
  finishes: "finishes",
  building: "building",
  barrio: "barrio",
};

/** Organiza la descripción (DE1–DE9). Cada frase, una sola vez. */
export function organizeDescription(input: StructureInput): Structured {
  const extra = areaRules(input.area);
  const intro: string[] = [];
  const parts: Record<SectionKey, string[]> = { living: [], kitchen: [], finishes: [], building: [], barrio: [] };

  const units = unitsOf(input.paragraphs);
  let lead = (input.lead ?? "").replace(/\s+/g, " ").trim() || null;
  // Sin entrada propia, la PRIMERA frase es la apertura (DE4), aunque nombre
  // un tema: el autor la escribió para abrir. Las demás se clasifican.
  let leadUnit = -1;
  if (!lead && units.length && units[0].forced === null) {
    const all = sentences(units[0].text);
    if (all.length && countWords(all[0]) <= LEAD_MAX_WORDS) {
      lead = all[0];
      leadUnit = 0;
      units[0] = { ...units[0], text: all.slice(1).join(" ") };
    }
  }
  if (lead) intro.push(lead);

  for (const [ui, u] of units.entries()) {
    const bucket: Record<SectionKey | "intro", string[]> = { intro: [], living: [], kitchen: [], finishes: [], building: [], barrio: [] };
    let prev: SectionKey | "intro" | null = null;
    for (const s of sentences(u.text)) {
      let topic: SectionKey | "intro";
      if (u.forced) topic = u.forced;
      else {
        const sc = scores(s, extra);
        if (sc.best) topic = sc.best;
        else if (prev && CONTINUATION_RE.test(fold(s))) topic = prev;
        else topic = "intro";
      }
      bucket[topic].push(s);
      prev = topic;
    }
    // Lo que no casa y venía en el MISMO párrafo que la apertura sigue en
    // su párrafo (no se inventa un salto de párrafo).
    if (bucket.intro.length) {
      if (ui === leadUnit) intro[0] = `${intro[0]} ${bucket.intro.join(" ")}`;
      else intro.push(bucket.intro.join(" "));
    }
    for (const key of SECTION_ORDER) if (bucket[key].length) parts[key].push(bucket[key].join(" "));
  }

  for (const ch of input.chapters ?? []) {
    const text = ch.text.trim();
    if (!text) continue;
    const key = SUPPORTED_CHAPTERS[ch.chapter];
    if (key) parts[key].push(text);
    else intro.push(text);
  }

  // DA25: la plantilla de la zona entra solo si la descripción propia no
  // habla ya de la zona (nunca se repite ni sustituye a lo propio).
  const tpl = (input.areaText ?? "").trim();
  const areaTextUsed = !!tpl && parts.barrio.length === 0;
  if (areaTextUsed) parts.barrio.push(tpl);

  const copy: CopyBlock[] = [];
  if (intro.length) copy.push({ heading: null, text: intro.join("\n\n"), key: "intro" });
  const missing: SectionKey[] = [];
  for (const key of SECTION_ORDER) {
    if (parts[key].length) copy.push({ heading: sectionHeading(key, input.area), text: parts[key].join("\n\n"), key });
    else missing.push(key);
  }
  return areaTextUsed ? { copy, missing, areaTextUsed } : { copy, missing };
}

/** Texto plano de los bloques (comparaciones y pruebas). */
export function flattenCopy(copy: CopyBlock[]): string {
  return copy.map((b) => b.text).join("\n\n");
}
