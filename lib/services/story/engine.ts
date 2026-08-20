// SmartLink 2.0 · Content Intelligence Engine.
//
//   EXTRACT → VALIDATE → STRUCTURE → COMPRESS → (HUMAN REVIEW) → RENDER
//
// Dos llamadas a IA con contrato JSON estricto y trabajo determinista entre
// medias. La IA NUNCA redacta desde cero: extrae claims CITANDO la frase
// origen, y después comprime SOLO los claims que sobrevivieron a la
// validación. Todo lo publicado es trazable a evidencia (regla dura 9).
// Corre exclusivamente server-side desde acciones admin (bajo demanda, D7).

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AI_SETTINGS_KEY } from "@/lib/services/ai/chat";
import { validateClaims, copyWordCount, type StructuredFacts } from "./validate";
import { STORY_CHAPTERS, type StoryChapter, type StoryClaim } from "./types";

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_text", "category", "fact", "confidence"],
        properties: {
          source_text: { type: "string", description: "Frase LITERAL de la descripción de la que sale el hecho" },
          category: { enum: [...STORY_CHAPTERS, "boilerplate", "other"] },
          fact: { type: "string", description: "El hecho, reformulado corto y neutro" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

const COMPRESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chapter", "copy", "claim_indexes"],
        properties: {
          chapter: { enum: [...STORY_CHAPTERS] },
          copy: { type: "string" },
          claim_indexes: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
} as const;

const EXTRACT_SYSTEM = `Eres un extractor de hechos para fichas inmobiliarias de lujo en Madrid.
Recibes la descripción cruda de UNA vivienda. Tu única tarea: trocearla en claims ATÓMICOS.
Reglas absolutas:
- Cada claim CITA la frase literal de la que sale (source_text). Nada sin cita.
- No inventes NADA: ni habitaciones, ni materiales, ni vistas, ni estado, ni cercanías.
- category: overview (qué es la vivienda), living (salón/luz/distribución social), kitchen (cocina/comedor), private (dormitorios/baños/vestidores), outdoor (terraza/balcón/jardín), finishes (materiales/suelos/techos/clima/reforma), building (finca/época/ascensor/portero/zonas comunes), barrio (ubicación/entorno/servicios de la zona), boilerplate (marketing de la agencia: web, call center, off-market…), other (no encaja).
- ATOMICIDAD ESTRICTA: un claim = UN solo hecho. PROHIBIDO combinar dos hechos en
  un fact. "Edificio de 1945 con ascensor y trastero" son TRES claims (época /
  ascensor / trastero) con la misma cita. Las enumeraciones se separan SIEMPRE.
- Si te doy una lista de ATRIBUTOS YA ESTRUCTURADOS, cada mención de uno de
  ellos va en su PROPIO claim, nunca mezclada con hechos nuevos de la frase.
- confidence baja (<0.6) si la frase es ambigua.`;

const COMPRESS_SYSTEM = `Eres el editor de los SmartLinks de BCP (inmobiliaria de lujo, Madrid). Tono sobrio y factual, español.
Recibes claims VALIDADOS agrupados por capítulo. Redacta un bloque por capítulo con ≥1 claim.
Reglas absolutas:
- Usa SOLO los claims recibidos. Prohibido añadir cualquier dato que no esté en ellos.
- PROHIBIDO amplificar: nada de intensificadores temporales, cuantitativos o
  sensoriales que no estén en el claim ("durante todo el día", "abundante",
  "espectacular"…). Parafrasear ≠ embellecer.
- 20–60 palabras por bloque. NUNCA más de 70.
- Una idea central por bloque. Sin listas, sin superlativos vacíos, sin mayúsculas gritadas.
- No repitas cifras de dormitorios/baños/m² (ya se muestran aparte).
- Devuelve claim_indexes con los índices de los claims usados en cada bloque.`;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Versión de la LÓGICA del motor (extractor+validador+compresor). Entra en la
// huella de caché: cambiar la lógica invalida las versiones generadas con la
// anterior y fuerza regeneración limpia — nunca se reutiliza silenciosamente
// un story producido por un motor ya corregido.
// v2: dedupe sobre el hecho extraído (no la frase origen completa) +
//     conflictos con respaldo de frase acotado por categoría.
// v3: extractor con atomicidad estricta (features estructuradas en claims
//     propios) + compresor sin amplificaciones sin evidencia.
const ENGINE_VERSION = 3;

export type GenerateResult =
  | { ok: true; versionId: string; blocks: number; conflicts: number; reused: boolean }
  | { ok: false; error: string };

export async function generateStoryForProperty(propertyId: string): Promise<GenerateResult> {
  const db = createAdminClient() as any;

  const { data: row, error } = await db
    .from("properties")
    .select("id, description, bedrooms, bathrooms, square_meters, zone, subzone, features, features_manual, title")
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Propiedad no encontrada" };
  const description: string = (row.description ?? "").trim();
  if (countWords(description) < 25) {
    return { ok: false, error: "La descripción es demasiado corta para generar story (se usará el fallback)." };
  }

  const facts: StructuredFacts = {
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    squareMeters: row.square_meters ?? null,
    floor: null,
    features: [...(row.features ?? []), ...(row.features_manual ?? [])],
  };
  const sourceHash = sha256(
    JSON.stringify([ENGINE_VERSION, description, facts.bedrooms, facts.bathrooms, facts.squareMeters, facts.features]),
  );

  // Caché por huella: si ya existe una versión de esta misma fuente, no se
  // vuelve a llamar a la IA (mismo patrón que photos_fingerprint del vídeo).
  const { data: existing } = await db
    .from("property_story_versions")
    .select("id, status")
    .eq("property_id", propertyId)
    .eq("source_hash", sourceHash)
    .in("status", ["generated", "approved"])
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, versionId: existing.id, blocks: 0, conflicts: 0, reused: true };

  // ── EXTRACT ──
  let claims: StoryClaim[];
  try {
    const raw = await aiComplete({
      system: EXTRACT_SYSTEM,
      userText:
        `Descripción de la vivienda "${row.title}" (zona ${row.subzone ?? row.zone}):\n\n${description}` +
        (facts.features.length
          ? `\n\nATRIBUTOS YA ESTRUCTURADOS (cada mención → claim propio, separado): ${facts.features.join(", ")}.`
          : ""),
      maxTokens: 6000,
      jsonSchema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
    });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as { claims: Array<Record<string, unknown>> };
    claims = (parsed.claims ?? []).map((c) => ({
      source_text: String(c.source_text ?? ""),
      source_field: "description" as const,
      category: (c.category ?? "other") as StoryClaim["category"],
      fact: String(c.fact ?? ""),
      confidence: Number(c.confidence ?? 0),
      is_duplicate: false,
      conflict: false,
    })).filter((c) => c.source_text && c.fact);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fallo en la extracción IA" };
  }
  if (claims.length === 0) return { ok: false, error: "La IA no extrajo ningún claim con evidencia." };

  // ── VALIDATE (determinista) ──
  validateClaims(claims, facts);

  // ── STRUCTURE + COMPRESS ──
  // Solo claims publicables: sin conflicto, sin duplicado, sin boilerplate,
  // con confianza suficiente. Los capítulos con conflicto se registran como
  // bloque 'conflict' SIN copy publicable (bloquea solo ese bloque, regla 9).
  const usable = claims
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => !c.conflict && !c.is_duplicate && c.category !== "boilerplate" && c.category !== "other" && c.confidence >= 0.5);
  const conflictChapters = new Set(
    claims.filter((c) => c.conflict && STORY_CHAPTERS.includes(c.category as StoryChapter)).map((c) => c.category as StoryChapter),
  );

  let blocks: Array<{ chapter: StoryChapter; copy: string; claim_indexes: number[] }> = [];
  if (usable.length > 0) {
    try {
      const raw = await aiComplete({
        system: COMPRESS_SYSTEM,
        userText:
          "Claims validados (index · capítulo · hecho):\n" +
          usable.map((c) => `${c.index} · ${c.category} · ${c.fact}`).join("\n"),
        maxTokens: 3000,
        jsonSchema: COMPRESS_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
        blocks: Array<{ chapter: StoryChapter; copy: string; claim_indexes: number[] }>;
      };
      blocks = (parsed.blocks ?? []).filter(
        (b) => STORY_CHAPTERS.includes(b.chapter) && b.copy && copyWordCount(b.copy) <= 70,
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Fallo en la compresión IA" };
    }
  }

  // ── PERSIST (capa 1+2+3) ──
  // Metadatos de trazabilidad del modelo: mismo lugar que la config del panel.
  const cfg = await db
    .from("app_settings")
    .select("value")
    .eq("key", AI_SETTINGS_KEY)
    .maybeSingle()
    .then((r: any) => (r.data?.value ?? null) as { provider?: string; model?: string } | null)
    .catch(() => null);
  const { data: version, error: vErr } = await db
    .from("property_story_versions")
    .insert({
      property_id: propertyId,
      source_hash: sourceHash,
      status: "generated",
      model: cfg?.model ?? null,
      provider: cfg?.provider ?? null,
    })
    .select("id")
    .single();
  if (vErr || !version) return { ok: false, error: vErr?.message ?? "No se pudo crear la versión" };

  const { data: savedClaims, error: cErr } = await db
    .from("property_story_claims")
    .insert(claims.map((c) => ({
      version_id: version.id,
      source_text: c.source_text,
      source_field: c.source_field,
      category: c.category,
      fact: c.fact,
      confidence: c.confidence,
      is_duplicate: c.is_duplicate,
      conflict: c.conflict,
      conflict_reason: c.conflict_reason ?? null,
    })))
    .select("id");
  if (cErr) return { ok: false, error: cErr.message };
  const claimIdByIndex = (i: number) => savedClaims?.[i]?.id as string | undefined;

  const chapterOrder = (ch: StoryChapter) => STORY_CHAPTERS.indexOf(ch);
  const rowsToInsert = [
    ...blocks.map((b, i) => ({
      version_id: version.id,
      chapter: b.chapter,
      copy: b.copy,
      position: chapterOrder(b.chapter) * 10 + i,
      status: conflictChapters.has(b.chapter) ? "conflict" : "generated",
      confidence: Math.min(...b.claim_indexes.map((idx) => claims[idx]?.confidence ?? 0.5), 1),
      claim_ids: b.claim_indexes.map(claimIdByIndex).filter(Boolean),
    })),
    // Capítulos SOLO en conflicto (sin bloque publicable): fila 'conflict'
    // vacía de copy publicable para que el revisor la vea con su motivo.
    ...[...conflictChapters]
      .filter((ch) => !blocks.some((b) => b.chapter === ch))
      .map((ch) => ({
        version_id: version.id,
        chapter: ch,
        copy: "",
        position: chapterOrder(ch) * 10 + 9,
        status: "conflict",
        confidence: 0,
        claim_ids: claims
          .map((c, i) => (c.conflict && c.category === ch ? claimIdByIndex(i) : null))
          .filter(Boolean),
      })),
  ];
  if (rowsToInsert.length > 0) {
    const { error: bErr } = await db.from("property_story_blocks").insert(rowsToInsert);
    if (bErr) return { ok: false, error: bErr.message };
  }

  return {
    ok: true,
    versionId: version.id,
    blocks: blocks.length,
    conflicts: conflictChapters.size,
    reused: false,
  };
}

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}
