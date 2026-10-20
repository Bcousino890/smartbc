import { CLEAN_SCHEMA, cleanSystemPrompt, parseCleanCompletion } from "@/lib/services/properties/client-text";
import { countWords, fold, sentences, textBlockers, type TextBlocker } from "./text-rules";

// ============================================================================
// Borradores de texto del catálogo con IA (BCP-01 ampliación C2, Z4).
//
// · La IA se INYECTA (`ai`): en la app es aiComplete con el proveedor ya
//   configurado en Configuración → IA; en las pruebas, una IA falsa. Los
//   agentes nunca llaman a una IA real ni usan datos reales.
// · Nada se guarda ni se publica desde aquí: se devuelve una PROPUESTA que el
//   editor solo coloca si el texto no cambió mientras tanto, y que el dueño
//   guarda y publica a mano (con la comprobación de abajo).
// · «Preparar desde la ficha» usa la MISMA limpieza que la descripción para
//   clientes (client-text.ts) pero NO escribe en property_client_descriptions.
// · «Borrador con IA» solo recibe hechos conocidos (datos de la ficha,
//   características y texto ya limpio): sin precios, sin fotos, sin contacto.
// · checkDraft: comprobación determinista. Contacto, URL o precio BLOQUEAN;
//   cifras y elementos que no están en la ficha son AVISOS que el dueño
//   corrige o confirma uno a uno.
// ============================================================================

export type AiFn = (opts: {
  system: string;
  userText: string;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}) => Promise<string>;

export const AI_TIMEOUT_MS = 60_000;

export interface DraftSource {
  title: string | null;
  operation: string | null;
  place: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  floor: string | null;
  /** Características ya verificadas (limpias + manuales). */
  features: string[];
  /** Descripción limpia vigente, si la hay. */
  cleanDescription: string | null;
}

export interface DraftProposal {
  /** Título propuesto para ESTE catálogo (solo «Borrador con IA»; null si no). */
  title?: string | null;
  body: string;
  lead: string | null;
  origin: "ai_clean" | "ai_draft";
}

/** «Preparar desde la ficha»: limpia el texto de la ficha (sin guardar nada). */
export async function prepareFromSource(
  src: { description: string | null; features: string[] },
  ai: AiFn,
  signal?: AbortSignal,
): Promise<DraftProposal> {
  const description = (src.description ?? "").trim();
  const features = src.features.filter((f) => typeof f === "string" && f.trim());
  if (!description && features.length === 0) throw new Error("source_empty");
  let last: unknown = null;
  // Dos intentos, como la limpieza de siempre (a veces el JSON llega cortado).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await ai({
        system: cleanSystemPrompt("es"),
        userText: JSON.stringify({ description, features }),
        maxTokens: 4000,
        jsonSchema: CLEAN_SCHEMA as unknown as Record<string, unknown>,
        signal,
      });
      const clean = parseCleanCompletion(raw);
      if (!clean.description) throw new Error("source_empty");
      return { body: clean.description, lead: null, origin: "ai_clean" };
    } catch (err) {
      if (signal?.aborted) throw err;
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("ai_failed");
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, lead: { type: "string" }, body: { type: "string" } },
  required: ["title", "lead", "body"],
} as const;

export const TITLE_MAX = 160;

export function draftSystemPrompt(): string {
  return `Escribe en español el texto de una vivienda para el catálogo privado de un personal shopper inmobiliario.

Usa SOLO los hechos que te doy. Reglas estrictas:
- No inventes nada: ni estancias, ni equipamiento, ni orientación, ni vistas, ni reformas, ni cifras que no estén en los hechos.
- No menciones precios, gastos, honorarios ni condiciones económicas.
- No incluyas teléfonos, correos, webs, nombres de agencias ni de personas.
- Tono sobrio y elegante, sin superlativos vacíos ni exclamaciones.
- "title": un título breve para el catálogo (máximo 80 caracteres), con el tipo de vivienda y la zona si se conocen; sin precio ni adjetivos vacíos.
- "lead": una entrada de una o dos frases (máximo 40 palabras).
- "body": de 3 a 6 párrafos cortos, separados por una línea en blanco.
- Si hay pocos hechos, escribe poco: es mejor un texto corto que uno inventado.
Responde en JSON conforme al esquema pedido.`;
}

export function draftUserText(src: DraftSource): string {
  const facts: Record<string, unknown> = {
    titulo: src.title,
    operacion: src.operation,
    zona: src.place,
    dormitorios: src.bedrooms,
    banos: src.bathrooms,
    metros: src.squareMeters,
    planta: src.floor,
    caracteristicas: src.features,
    descripcion_limpia: src.cleanDescription,
  };
  return JSON.stringify(Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))));
}

/** «Borrador con IA» a partir de hechos conocidos (sin guardar nada). */
export async function draftFromFacts(src: DraftSource, ai: AiFn, signal?: AbortSignal): Promise<DraftProposal> {
  const raw = await ai({ system: draftSystemPrompt(), userText: draftUserText(src), maxTokens: 1500, jsonSchema: DRAFT_SCHEMA as unknown as Record<string, unknown>, signal });
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as { title?: unknown; lead?: unknown; body?: unknown };
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const lead = typeof parsed.lead === "string" && parsed.lead.trim() ? parsed.lead.trim() : null;
  const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) : null;
  if (!body && !lead && !title) throw new Error("ai_failed");
  // La entrada se incorpora al principio de la descripción: el editor ya no
  // la pide aparte (DC7).
  return { title, body: lead && body ? `${lead}\n\n${body}` : body || lead || "", lead: null, origin: "ai_draft" };
}

// ── Comprobación determinista ───────────────────────────────────────────────

export interface DraftBlocker {
  code: TextBlocker;
  where: "title" | "body" | "lead" | "highlight";
}
export interface DraftWarning {
  /** Estable: lo que el dueño confirma («number:110», «feature:piscina»). */
  id: string;
  kind: "number" | "feature";
  message: string;
}
export interface DraftCheck {
  blockers: DraftBlocker[];
  warnings: DraftWarning[];
}

/** Elementos que no se pueden afirmar si la ficha no los dice. */
const FEATURE_TERMS = [
  "terraza", "piscina", "garaje", "plaza de garaje", "parking", "ascensor", "trastero", "jardin", "portero", "conserje",
  "aire acondicionado", "calefaccion", "chimenea", "vistas", "amueblado", "balcon", "patio", "reformado", "reforma",
  "gimnasio", "suelo radiante", "domotica", "exterior", "atico", "duplex", "porteria",
];

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
}

export function checkDraft(
  draft: { title?: string | null; body: string | null; lead: string | null; highlights: string[] },
  src: DraftSource,
): DraftCheck {
  const blockers: DraftBlocker[] = [];
  const add = (t: string | null, where: DraftBlocker["where"]) => {
    for (const b of textBlockers(t)) {
      if (!blockers.some((x) => x.code === b && x.where === where)) blockers.push({ code: b, where });
    }
  };
  add(draft.title ?? null, "title");
  add(draft.body, "body");
  add(draft.lead, "lead");
  for (const h of draft.highlights) add(h, "highlight");

  const text = [draft.title ?? "", draft.lead ?? "", draft.body ?? ""].join(" ");
  const sourceText = [src.title, src.place, src.floor, src.operation, src.cleanDescription, ...src.features].filter(Boolean).join(" ");
  const known = new Set<string>([
    ...numbersIn(sourceText),
    ...[src.bedrooms, src.bathrooms, src.squareMeters].filter((n): n is number => typeof n === "number").map((n) => String(Math.round(n))),
  ]);
  const warnings: DraftWarning[] = [];
  for (const n of new Set(numbersIn(text))) {
    if (!known.has(n)) warnings.push({ id: `number:${n}`, kind: "number", message: `La cifra «${n}» no aparece en los datos de la ficha.` });
  }
  const ft = fold(text);
  const fs = fold(sourceText);
  for (const term of FEATURE_TERMS) {
    const re = new RegExp(`\\b${term}\\b`);
    if (re.test(ft) && !re.test(fs)) warnings.push({ id: `feature:${term}`, kind: "feature", message: `«${term}» no aparece en la ficha: comprueba que es cierto.` });
  }
  return { blockers, warnings };
}

/** Avisos que siguen sin confirmar. */
export function pendingWarnings(check: DraftCheck, confirmed: string[]): DraftWarning[] {
  const ok = new Set(confirmed);
  return check.warnings.filter((w) => !ok.has(w.id));
}

/** Vista rápida para el editor: número de palabras y frases. */
export function draftStats(body: string | null): { words: number; sentences: number } {
  return { words: countWords(body ?? ""), sentences: sentences(body ?? "").length };
}
