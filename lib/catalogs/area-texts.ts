import { textBlockers, type TextBlocker } from "./text-rules";
import { areaById, areaForName, areaLabel, type Area } from "./areas";
import { catalogFold } from "./zones";

// ============================================================================
// Plantillas «Vivir en…» (0222, expediente 2026-10-21-bcp-01-ampliacion-
// textos-idiomas, PR3, DA22–DA28). PURO: sin red ni base de datos.
//
// · Una plantilla describe la ZONA en general (DA26): sin distancias desde la
//   vivienda, vistas, servicios del edificio ni características de la
//   vivienda. Contacto, URL y precio bloquean (los vuelve a comprobar SQL); lo
//   demás son avisos que el dueño revisa antes de aprobar.
// · La siembra lee los textos de `neighborhoods` (SmartLink) y los asigna a
//   una zona del registro SOLO por nombre exacto y distrito compatible. Lo que
//   no encaja (fuera de Madrid, nombres que no están) se enseña y no se siembra.
// · «Borrador con IA» solo al pulsar: la IA se inyecta (en las pruebas, una
//   falsa) y el resultado es un BORRADOR que nunca se aprueba solo.
// ============================================================================

export interface AreaTextVersion {
  id: string;
  seq: number;
  body: string;
  origin: "neighborhoods" | "manual" | "ai_draft";
  sourceKey: string | null;
  updatedAt: string | null;
  approvedAt: string | null;
}

export interface AreaTextEntry {
  areaId: string;
  draft: AreaTextVersion | null;
  approved: AreaTextVersion | null;
}

const ORIGINS = ["neighborhoods", "manual", "ai_draft"] as const;

/** Filas de catalog_area_text_state → una entrada por zona. */
export function areaTextEntriesFromRows(rows: Array<Record<string, unknown>>): Map<string, AreaTextEntry> {
  const out = new Map<string, AreaTextEntry>();
  for (const r of rows) {
    const areaId = String(r.area_id ?? "");
    if (!areaId) continue;
    const v: AreaTextVersion = {
      id: String(r.id),
      seq: Number(r.seq),
      body: String(r.body ?? ""),
      origin: (ORIGINS as readonly string[]).includes(String(r.origin)) ? (r.origin as AreaTextVersion["origin"]) : "manual",
      sourceKey: typeof r.source_key === "string" ? r.source_key : null,
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
      approvedAt: typeof r.approved_at === "string" ? r.approved_at : null,
    };
    const e = out.get(areaId) ?? { areaId, draft: null, approved: null };
    if (r.status === "draft") e.draft = v;
    else if (r.status === "approved") e.approved = v;
    out.set(areaId, e);
  }
  return out;
}

/** Plantilla aprobada para una zona confirmada: la del barrio o, si no hay,
 *  la de su distrito (DA23; misma regla que catalog_area_text_for). */
export function templateFor(entries: Map<string, AreaTextEntry>, confirmedAreaId: string | null): { area: Area; version: AreaTextVersion } | null {
  const a = areaById(confirmedAreaId);
  if (!a) return null;
  for (const id of [a.id, a.districtId]) {
    const e = id ? entries.get(id) : undefined;
    const area = id ? areaById(id) : null;
    if (e?.approved && area) return { area, version: e.approved };
  }
  return null;
}

/** ¿Se ve una copia de este catálogo? Solo si su zona es la confirmada y
 *  vigente o su distrito (igual que la instantánea de 0222). */
export function copyShown(copyAreaId: string, confirmed: { areaId: string | null; current: boolean } | null): boolean {
  if (!confirmed?.current || !confirmed.areaId) return false;
  const a = areaById(confirmed.areaId);
  return !!a && (copyAreaId === a.id || copyAreaId === a.districtId);
}

// ── Comprobación (DA26) ─────────────────────────────────────────────────────

export interface AreaTextWarning {
  id: "distance" | "views" | "building" | "home" | "agency";
  label: string;
  excerpt: string;
}

const WARNINGS: Array<[AreaTextWarning["id"], string, RegExp]> = [
  ["distance", "Distancias o tiempos desde la vivienda", /\b((\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|pocos) (minutos?|min|metros|km|kilometros?)\b|\d+\s*(m|km)\b|a (un|dos|pocos) pasos?\b|a un paseo\b|cerca de (la|esta) (vivienda|casa|finca)\b)/],
  ["views", "Vistas", /\bvistas?\b/],
  ["building", "Servicios del edificio", /\b(porter[oi]a?|conserje|ascensor|piscina|garajes?|trasteros?|gimnasio|zonas comunes)\b/],
  ["home", "Características de la vivienda", /\b(dormitorios?|habitaciones|salon|cocina|terrazas?|banos?|m2|metros cuadrados|esta vivienda|este piso|este inmueble)\b/],
  // Como AGENCY_RE pero sin «referencia» (en un barrio, «su referencia verde»
  // no es la referencia de un anuncio).
  ["agency", "Menciones de agencia o contacto", /(inmobiliaria|real\s+estate|\bagencia\b|\bagency\b|cont[áa]ctenos|ll[áa]menos|whatsapp|honorarios|comisi[oó]n)/i],
];

/** Avisos que el dueño revisa antes de aprobar (no bloquean). */
export function areaTextWarnings(body: string | null | undefined): AreaTextWarning[] {
  const raw = (body ?? "").trim();
  if (!raw) return [];
  // Misma longitud que el original (sin tildes y en minúsculas) para poder
  // citar el fragmento tal como está escrito.
  const src = raw.normalize("NFC");
  const t = src.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const out: AreaTextWarning[] = [];
  for (const [id, label, re] of WARNINGS) {
    const m = (id === "agency" ? src : t).match(re);
    if (m) {
      const i = m.index ?? 0;
      out.push({ id, label, excerpt: src.slice(Math.max(0, i - 25), i + m[0].length + 25).replace(/\s+/g, " ").trim() });
    }
  }
  return out;
}

/** Bloqueos (contacto, URL, precio): mismas reglas que SQL. */
export function areaTextBlockers(body: string | null | undefined): TextBlocker[] {
  return textBlockers(body);
}

export const AREA_TEXT_MAX = 1500;

// ── Siembra desde `neighborhoods` (sin IA) ──────────────────────────────────

export interface NeighborhoodRow {
  zone_key: string;
  display_name: string;
  intro: string;
  aliases?: string[] | null;
  district?: string | null;
  municipality?: string | null;
}

export interface SeedPlan {
  items: Array<{ area: string; body: string; key: string }>;
  /** Ya tienen alguna versión de este dueño: no se tocan. */
  existing: Array<{ key: string; areaId: string }>;
  /** No se asignan a ninguna zona del registro (y por qué). */
  unmapped: Array<{ key: string; name: string; reason: string }>;
}

/** Zona del registro de un barrio de `neighborhoods`: solo por nombre exacto
 *  (nombre, clave o alias) y con distrito compatible. */
export function neighborhoodArea(n: NeighborhoodRow): { area: Area | null; reason: string | null } {
  if (n.municipality && catalogFold(n.municipality) !== "madrid") return { area: null, reason: "Fuera del municipio de Madrid." };
  const names = [n.display_name, n.zone_key.replace(/-/g, " "), ...(n.aliases ?? []).map((a) => a.replace(/-/g, " "))];
  const area = names.map(areaForName).find((a): a is Area => !!a) ?? null;
  if (!area) return { area: null, reason: "No coincide con ningún distrito ni barrio del registro." };
  if (n.district) {
    const d = area.level === "distrito" ? area : areaById(area.districtId);
    if (!d || catalogFold(d.name) !== catalogFold(n.district)) return { area: null, reason: `El registro la sitúa en ${d?.name ?? "otro distrito"}, no en ${n.district}.` };
  }
  return { area, reason: null };
}

export function seedPlan(rows: NeighborhoodRow[], withVersions: Set<string>): SeedPlan {
  const plan: SeedPlan = { items: [], existing: [], unmapped: [] };
  const taken = new Set<string>();
  for (const n of [...rows].sort((a, b) => a.zone_key.localeCompare(b.zone_key))) {
    const { area, reason } = neighborhoodArea(n);
    const body = (n.intro ?? "").trim();
    if (!area) {
      plan.unmapped.push({ key: n.zone_key, name: n.display_name, reason: reason ?? "" });
      continue;
    }
    if (withVersions.has(area.id)) {
      plan.existing.push({ key: n.zone_key, areaId: area.id });
      continue;
    }
    if (!body || body.length > AREA_TEXT_MAX || taken.has(area.id)) continue;
    taken.add(area.id);
    plan.items.push({ area: area.id, body, key: n.zone_key });
  }
  return plan;
}

// ── «Borrador con IA» (solo al pulsar; IA inyectada) ────────────────────────

export type AreaAiFn = (opts: { system: string; userText: string; maxTokens?: number; jsonSchema?: Record<string, unknown>; signal?: AbortSignal }) => Promise<string>;

export const AREA_DRAFT_SCHEMA = {
  type: "object",
  properties: { body: { type: "string" } },
  required: ["body"],
  additionalProperties: false,
} as const;

export function areaDraftSystemPrompt(): string {
  return `Escribe en español una descripción GENERAL de una zona de Madrid para la sección «Vivir en…» del catálogo privado de un personal shopper inmobiliario.

Reglas estrictas:
- Describe la zona en general: su carácter, su trama urbana y el tipo de edificación, su ambiente y su vida de barrio.
- No hables de ninguna vivienda concreta: ni distancias o tiempos desde una casa, ni vistas, ni servicios de un edificio, ni estancias o características de una vivienda.
- No inventes: si no estás seguro de un dato concreto (fechas, nombres de calles, plazas, parques, museos, líneas de transporte), no lo pongas. Es mejor un texto breve y general que uno con datos dudosos.
- No menciones precios ni condiciones económicas, ni teléfonos, correos, webs, agencias o personas.
- Tono sobrio y elegante, sin superlativos vacíos ni exclamaciones.
- "body": entre 50 y 110 palabras, en uno o dos párrafos.
Responde en JSON conforme al esquema pedido.`;
}

export function areaDraftUserText(area: Area): string {
  const district = area.districtId ? areaById(area.districtId) : null;
  return JSON.stringify({ zona: area.name, nivel: area.level, distrito: district?.name ?? null, ciudad: "Madrid" });
}

/** Propuesta de borrador (no guarda nada). */
export async function draftAreaText(area: Area, ai: AreaAiFn, signal?: AbortSignal): Promise<string> {
  const raw = await ai({ system: areaDraftSystemPrompt(), userText: areaDraftUserText(area), maxTokens: 600, jsonSchema: AREA_DRAFT_SCHEMA as unknown as Record<string, unknown>, signal });
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as { body?: unknown };
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (!body) throw new Error("ai_failed");
  return body.slice(0, AREA_TEXT_MAX);
}

// ── Errores de 0222 → mensajes ──────────────────────────────────────────────

const AREA_TEXT_ERRORS: Record<string, string> = {
  area_text_unavailable: "No hay plantilla aprobada para la zona confirmada de esta vivienda (ni para su distrito). Confirma la zona y aprueba su plantilla en «Plantillas de zona».",
  area_text_not_found: "Esa plantilla ya no existe o ya se quitó.",
  area_text_empty: "Escribe el texto de la zona.",
  draft_changed: "El borrador cambió mientras lo revisabas. Vuelve a cargarlo y revísalo antes de aprobar.",
  text_has_contact: "El texto tiene un teléfono, un correo o una web.",
  text_has_price: "El texto menciona un precio.",
  text_too_long: `El texto pasa de ${AREA_TEXT_MAX} caracteres.`,
};

export function areaTextErrorMessage(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/area_text_unavailable|area_text_not_found|area_text_empty|draft_changed|text_has_contact|text_has_price|text_too_long/);
  return m ? AREA_TEXT_ERRORS[m[0]] : null;
}

/** «Recoletos (Salamanca)» o el id si no está en el registro. */
export function areaTextLabel(areaId: string): string {
  const a = areaById(areaId);
  return a ? areaLabel(a) : areaId;
}
