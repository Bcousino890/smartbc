// SmartLink 2.0 · invariantes deterministas de la capa editorial (engine v4).
//
// Tres invariantes descubiertas en el piloto BC-1416 y cerradas aquí, DESPUÉS
// del compresor y ANTES de persistir — la IA propone, este módulo garantiza:
//
//  1. UN bloque por capítulo canónico como máximo.
//  2. OWNERSHIP: un claim alimenta solo bloques de SU categoría, y un mismo
//     claim no puede alimentar dos bloques.
//  3. ENTIDADES: los nombres propios del copy deben estar respaldados por los
//     claims del bloque ("Almagro" no puede convertirse en "Madrid"). Un
//     bloque con entidad sin respaldo pasa a estado 'conflict': la puerta ya
//     existente obliga a editarlo antes de poder aprobarlo. Nunca se publica
//     solo.

import type { StoryChapter, StoryClaim } from "./types";
import { copyWordCount } from "./validate";

export type DraftBlock = {
  chapter: StoryChapter;
  copy: string;
  claim_indexes: number[];
};

export type EnforcedBlock = DraftBlock & {
  status: "generated" | "conflict";
  conflictNote?: string;
};

// Palabras con mayúscula que NO son entidades (arranques de frase aparte):
// conectores, meses y genéricos frecuentes en copy inmobiliario.
const NON_ENTITY = new Set([
  "la", "el", "los", "las", "un", "una", "de", "del", "en", "con", "y", "e",
  "se", "su", "sus", "este", "esta", "cuenta", "dispone", "situada", "situado",
  "ubicada", "ubicado", "vivienda", "edificio", "proyecto", "cocina", "salón",
  "zona", "reforma", "prioridad", "espacios", "suelos", "techos", "carpinterías",
]);

function properNouns(text: string): string[] {
  const out: string[] = [];
  // Frases → tokens; se ignora la primera palabra de cada frase (mayúscula
  // sintáctica, no entidad).
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const tokens = sentence.trim().split(/\s+/);
    tokens.forEach((raw, i) => {
      const word = raw.replace(/[^\p{L}\p{N}-]/gu, "");
      if (!word || i === 0) return;
      if (!/^\p{Lu}/u.test(word)) return;
      if (NON_ENTITY.has(word.toLowerCase())) return;
      out.push(word);
    });
  }
  return out;
}

/**
 * Nombres propios del copy que NO aparecen en ningún texto de respaldo
 * (fact + frase origen de los claims del bloque). Vacío = copy respaldado.
 */
export function unsupportedEntities(copy: string, supportTexts: string[]): string[] {
  const support = supportTexts.join(" ").toLowerCase();
  return [...new Set(properNouns(copy))].filter(
    (e) => !support.includes(e.toLowerCase()),
  );
}

/**
 * Aplica las tres invariantes al output del compresor. Determinista y puro.
 * Devuelve los bloques definitivos + los índices de claims válidos que quedan
 * sin renderizar (para el informe de revisión; siguen siendo evidencia).
 */
export function enforceStoryInvariants(
  drafts: DraftBlock[],
  claims: StoryClaim[],
): { blocks: EnforcedBlock[]; unusedValid: number[] } {
  // Pasada 1 · competición por capítulo: para cada draft, sus claims PROPIOS
  // (categoría === capítulo). Gana el draft con más claims propios; empate →
  // el primero. Sin claims propios o >70 palabras → descalificado.
  const candidates = drafts
    .map((d) => ({
      ...d,
      owned: d.claim_indexes.filter(
        (i) => claims[i] && claims[i].category === d.chapter,
      ),
    }))
    .filter((d) => d.owned.length > 0 && copyWordCount(d.copy) <= 70);

  const byChapter = new Map<StoryChapter, (typeof candidates)[number]>();
  for (const c of candidates) {
    const existing = byChapter.get(c.chapter);
    if (!existing || c.owned.length > existing.owned.length) {
      byChapter.set(c.chapter, c);
    }
  }

  // Pasada 2 · unicidad global de claims entre los bloques ganadores (orden
  // determinista de capítulos canónicos) + chequeo de entidades.
  const usedClaims = new Set<number>();
  const blocks: EnforcedBlock[] = [];
  const chapters = [...byChapter.keys()].sort();
  for (const chapter of chapters) {
    const winner = byChapter.get(chapter)!;
    const owned = winner.owned.filter((i) => !usedClaims.has(i));
    if (owned.length === 0) continue;
    for (const i of owned) usedClaims.add(i);

    // 3 · ENTIDADES: nombres propios sin respaldo → 'conflict' (obliga a
    // editar antes de aprobar; jamás publicable en silencio).
    const support = owned.flatMap((i) => [claims[i].fact, claims[i].source_text]);
    const bad = unsupportedEntities(winner.copy, support);

    blocks.push({
      chapter,
      copy: winner.copy,
      claim_indexes: owned,
      status: bad.length > 0 ? "conflict" : "generated",
      conflictNote: bad.length > 0
        ? `Entidades sin respaldo en la evidencia: ${bad.join(", ")}. Edita el texto para corregirlas.`
        : undefined,
    });
  }

  const unusedValid = claims
    .map((_, i) => i)
    .filter(
      (i) =>
        !usedClaims.has(i) &&
        !claims[i].conflict &&
        !claims[i].is_duplicate &&
        claims[i].category !== "boilerplate" &&
        claims[i].category !== "other",
    );

  return { blocks, unusedValid };
}
