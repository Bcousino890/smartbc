import "server-only";
import { catalogPhotoData } from "./photo-data";
import { createAdminClient } from "@/lib/db/admin";
import { isStorySourceCurrent } from "@/lib/services/story/source-hash";
import { floorLabel, operationLabel } from "./format";
import { clientDescriptionSrc } from "./to-public";
import { deriveEditorial, highlightCandidates, type EditorialLevel, type EditorialPhoto } from "./editorial";
import type { DraftSource } from "./ai-draft";
import { isPublicSafe } from "./text-rules";
import { getCopyLibraryState } from "./copy-library";
import type { CopyLibraryView } from "./copy-rules";
import { getAreaDecisions } from "./area-data";
import { areaViewOf, confirmedAreaOf, type AreaDecision, type AreaView } from "./areas";

// ============================================================================
// Textos del catálogo en la gestión (BCP-01 ampliación C2, Z5). Solo LEE:
// las escrituras van por las funciones SQL de 0197 (con la guarda del dueño).
// Nunca lee ni escribe fuera de las tablas que ya consulta el lector:
// properties, property_photos, property_client_descriptions y las historias.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

const CHANGED_LABEL: Record<string, string> = {
  description: "el texto de la ficha",
  features: "las características",
  features_manual: "las características manuales",
  square_meters: "los m²",
  bedrooms: "los dormitorios",
  bathrooms: "los baños",
  floor_override: "la planta",
  operation: "la operación",
  operations: "las operaciones",
};

export type CleanStatus = "none" | "stale" | "current" | "empty";
export type StoryStatus = "none" | "pending" | "current" | "stale";

export interface CatalogTextView {
  propertyId: string;
  slug: string;
  /** Título de la ficha del CRM (el título propio del catálogo va en draft/published). */
  title: string;
  bcReference: string | null;
  /** Zona de «Vivir en …» (DE9): la confirmada y vigente (0220) o, sin
   *  confirmación, la subzona o la zona de la ficha. null → «El barrio». */
  area: string | null;
  /** 0220 · Sugerencia y confirmación de la zona (null: 0220 aún no está
   *  aplicada). Nada de esto escribe en la ficha del CRM. */
  zone: AreaView | null;
  inList: boolean;
  /** Lo que ve hoy el lector para esta vivienda. */
  level: EditorialLevel;
  source: { hasText: boolean; clean: CleanStatus; story: StoryStatus };
  /** 0217: `title` es el título propio de la vivienda en ESTE catálogo (null = el de la ficha). */
  draft: { title: string | null; body: string | null; lead: string | null; highlights: string[]; rev: number; origin: string; updatedAt: string | null } | null;
  /** `current`: el texto publicado se ve (su fuente no cambió). El título
   *  publicado se ve siempre (DC6). */
  published: { title: string | null; body: string | null; lead: string | null; highlights: string[]; at: string | null; current: boolean; changed: string[] } | null;
  /** Puntos verificados que se pueden elegir (literales de la ficha). */
  candidates: string[];
  /** 0219 · Texto aprobado de la vivienda en la biblioteca del dueño (null:
   *  no hay, o 0219 aún no está aplicada). Nunca se publica solo aquí. */
  library: CopyLibraryView | null;
}

const PROP_COLUMNS =
  "id, slug, title, bc_reference, zone, subzone, address, operation, operations, bedrooms, bathrooms, square_meters, floor_override, description, features, features_manual";

interface PropertyRow {
  id: string;
  slug: string;
  title: string;
  bc_reference: string | null;
  zone: string | null;
  subzone: string | null;
  address: string | null;
  operation: string | null;
  operations: string[] | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  floor_override: string | null;
  description: string | null;
  features: string[] | null;
  features_manual: string[] | null;
}

function cleanOf(p: PropertyRow, row: any): { status: CleanStatus; description: string | null; features: string[] } {
  const hasSource = !!(p.description ?? "").trim() || (p.features ?? []).some((f) => f && f.trim());
  if (!row) return { status: hasSource ? "none" : "empty", description: null, features: [] };
  if (row.src !== clientDescriptionSrc(p.description, p.features)) return { status: "stale", description: null, features: [] };
  const description = (row.description ?? "").trim() || null;
  const features = Array.isArray(row.features) ? row.features.filter((f: unknown) => typeof f === "string" && f.trim()) : [];
  return { status: description ? "current" : "empty", description, features };
}

function storyInput(p: PropertyRow) {
  return {
    description: p.description,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    squareMeters: p.square_meters === null ? null : Number(p.square_meters),
    features: [...(p.features ?? []), ...(p.features_manual ?? [])],
  };
}

async function loadSources(ids: string[]) {
  if (ids.length === 0) return { props: new Map<string, PropertyRow>(), clean: new Map<string, any>(), stories: new Map<string, any[]>() };
  const [{ data: props }, { data: clean }, { data: stories }] = await Promise.all([
    db().from("properties").select(PROP_COLUMNS).in("id", ids),
    db().from("property_client_descriptions").select("property_id, src, description, features").eq("language", "es").in("property_id", ids),
    db().from("property_story_versions").select("property_id, status, source_hash").in("property_id", ids).in("status", ["approved", "generated"]),
  ]);
  const storyMap = new Map<string, any[]>();
  for (const s of (stories ?? []) as any[]) storyMap.set(s.property_id, [...(storyMap.get(s.property_id) ?? []), s]);
  return {
    props: new Map(((props ?? []) as PropertyRow[]).map((p) => [p.id, p])),
    clean: new Map(((clean ?? []) as any[]).map((c) => [c.property_id, c])),
    stories: storyMap,
  };
}

/** Estado de los textos de un catálogo (viviendas de la lista + reserva). */
export async function listCatalogTexts(ownerId: string, catalogId: string): Promise<CatalogTextView[]> {
  const { data: states, error } = await db().rpc("catalog_text_states", { p_actor: ownerId, p_catalog: catalogId });
  if (error) throw new Error(`catalog_text_states: ${error.message}`);
  const rows = (states ?? []) as any[];
  const ids = rows.map((r) => r.property_id as string);
  const { data: texts } = await db().from("catalog_texts").select("*").eq("catalog_id", catalogId);
  const byText = new Map(((texts ?? []) as any[]).map((t) => [t.property_id, t]));
  const src = await loadSources(ids);
  const out: CatalogTextView[] = [];
  for (const r of rows) {
    const p = src.props.get(r.property_id);
    if (!p) continue;
    const t = byText.get(r.property_id);
    const clean = cleanOf(p, src.clean.get(p.id));
    const versions = src.stories.get(p.id) ?? [];
    const approved = versions.find((v) => v.status === "approved");
    const story: StoryStatus = approved
      ? isStorySourceCurrent(approved.source_hash, storyInput(p)) ? "current" : "stale"
      : versions.length ? "pending" : "none";
    const publishedCurrent = r.published_current === true;
    const manual = (p.features_manual ?? []).filter((f) => f && f.trim() && isPublicSafe(f));
    out.push({
      propertyId: p.id,
      slug: p.slug,
      title: p.title,
      bcReference: p.bc_reference ?? null,
      area: (p.subzone ?? "").trim() || (p.zone ?? "").trim() || null,
      zone: null,
      inList: r.in_list === true,
      level: publishedCurrent && (t?.pub_body || t?.pub_lead) ? "text" : story === "current" ? "story" : clean.status === "current" ? "clean" : "facts",
      source: { hasText: !!(p.description ?? "").trim(), clean: clean.status, story },
      draft: t && (t.draft_body || t.draft_lead || t.draft_title)
        ? { title: t.draft_title ?? null, body: t.draft_body, lead: t.draft_lead, highlights: t.draft_highlights ?? [], rev: Number(t.draft_rev), origin: t.draft_origin, updatedAt: t.draft_updated_at }
        : t ? { title: null, body: null, lead: null, highlights: [], rev: Number(t.draft_rev), origin: t.draft_origin, updatedAt: t.draft_updated_at } : null,
      published: t && (t.pub_body || t.pub_lead || t.pub_title)
        ? {
            title: t.pub_title ?? null,
            body: t.pub_body,
            lead: t.pub_lead,
            highlights: t.pub_highlights ?? [],
            at: t.published_at,
            current: publishedCurrent,
            changed: ((r.changed ?? []) as string[]).map((k) => CHANGED_LABEL[k] ?? k),
          }
        : null,
      candidates: highlightCandidates(clean.features, manual),
      library: null,
    });
  }
  // 0219 · Texto aprobado de cada vivienda. Si la lectura falla (p. ej. 0219
  // sin aplicar), el gestor funciona igual, sin el bloque de la biblioteca.
  try {
    const lib = await getCopyLibraryState(ownerId, out.map((v) => v.propertyId));
    for (const v of out) v.library = lib.get(v.propertyId) ?? null;
  } catch (err) {
    console.warn("[catalogos] biblioteca de textos:", err instanceof Error ? err.message : err);
  }
  // 0220 · Zona de cada vivienda. Si la lectura falla (p. ej. 0220 sin
  // aplicar), el gestor funciona igual, sin el bloque de la zona.
  try {
    const decisions = await getAreaDecisions(ownerId, out.map((v) => v.propertyId));
    for (const v of out) {
      const p = src.props.get(v.propertyId)!;
      v.zone = areaViewOf(p, decisions.get(v.propertyId) ?? null);
      v.area = v.zone.living;
    }
  } catch (err) {
    console.warn("[catalogos] zonas:", err instanceof Error ? err.message : err);
  }
  // Primero las de la lista (en el orden en que llegan), después la reserva.
  return out.sort((a, b) => Number(b.inList) - Number(a.inList));
}

/** Fuente de una vivienda para preparar o redactar su texto (solo lectura).
 *  E3: con `catalogId`, las fotos son las que se usan en ESE catálogo, con su
 *  apertura (la misma regla que el lector). */
export async function textSourceFor(propertyId: string, catalogId: string | null): Promise<{
  property: PropertyRow;
  source: DraftSource;
  photos: EditorialPhoto[];
  coverIndex: number;
  clean: { description: string | null; features: string[] };
} | null> {
  const src = await loadSources([propertyId]);
  const p = src.props.get(propertyId);
  if (!p) return null;
  const clean = cleanOf(p, src.clean.get(propertyId));
  const manual = (p.features_manual ?? []).filter((f) => f && f.trim() && isPublicSafe(f));
  const eff = (await catalogPhotoData(catalogId, [propertyId])).get(propertyId)?.eff;
  const list: EditorialPhoto[] = (eff?.photos ?? []).map((ph, i) => ({ u: String(i), k: ph.k }));
  const coverIndex = eff?.openingIndex ?? 0;
  return {
    property: p,
    clean,
    photos: list,
    coverIndex,
    source: {
      title: p.title,
      operation: operationLabel(p.operation, p.operations),
      place: [p.subzone, p.zone].filter(Boolean).join(", ") || null,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      squareMeters: p.square_meters === null ? null : Number(p.square_meters),
      floor: p.floor_override ? floorLabel(Number(p.floor_override) || null) : null,
      features: [...clean.features, ...manual],
      cleanDescription: clean.description,
    },
  };
}

/** Vista previa con un texto del catálogo (borrador o no): la descripción
 *  organizada (DE2, la misma función que el lector) y las partes sin material. */
export async function previewJourney(
  propertyId: string,
  catalogId: string | null,
  text: { body: string | null; lead: string | null; highlights: string[] },
  ownerId?: string,
): Promise<{ lead: string | null; highlights: string[]; sections: Array<{ heading: string | null; text: string; photo: boolean }>; words: number; copy: Array<{ heading: string | null; text: string }>; missing: string[] } | null> {
  const s = await textSourceFor(propertyId, catalogId);
  if (!s) return null;
  let decision: AreaDecision | null = null;
  if (ownerId) {
    try {
      decision = (await getAreaDecisions(ownerId, [propertyId])).get(propertyId) ?? null;
    } catch {
      decision = null;
    }
  }
  const ed = deriveEditorial({
    description: s.property.description,
    features: s.property.features,
    features_manual: s.property.features_manual,
    bedrooms: s.property.bedrooms,
    bathrooms: s.property.bathrooms,
    square_meters: s.property.square_meters,
    zone: s.property.zone,
    subzone: s.property.subzone,
    area: confirmedAreaOf(decision),
    cleanDescription: s.clean.description,
    cleanFeatures: s.clean.features,
    text: text.body || text.lead ? { b: text.body, l: text.lead, h: text.highlights } : null,
    story: null,
    photos: s.photos,
    coverIndex: s.coverIndex,
  });
  return {
    lead: ed.lead,
    highlights: ed.highlights,
    sections: ed.sections.map((x) => ({ heading: x.heading, text: x.text, photo: x.photo !== null })),
    words: (text.body ?? "").trim().split(/\s+/).filter(Boolean).length,
    copy: ed.copy,
    missing: ed.missing,
  };
}
