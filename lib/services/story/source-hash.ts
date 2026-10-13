import { createHash } from "node:crypto";

// Huella de la FUENTE de una historia (SmartLink 2.0). Extraída de engine.ts
// (BCP-01 C2, Z2) para poder comprobar, sin generar nada, si una historia
// aprobada sigue correspondiendo a la ficha actual. engine.ts la importa: el
// resultado es exactamente el de antes (test en test-catalogs-public.mts).
//
// La huella incluye la versión de la lógica del motor: una historia generada
// con una versión anterior y la MISMA fuente sigue siendo válida, así que la
// comprobación acepta todas las versiones que el motor ha usado (historial de
// git de engine.ts): 4.1, 4, 3, 2 y la primera, sin versión.

/** Versión actual de la lógica del motor (ver el historial en engine.ts). */
export const ENGINE_VERSION = 4.1;

/** Versiones con las que se han generado historias (null = la primera, sin versión). */
export const KNOWN_ENGINE_VERSIONS: ReadonlyArray<number | null> = [4.1, 4, 3, 2, null];

export interface StorySourceInput {
  description: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  /** Características + características manuales, en ese orden. */
  features: string[];
}

export function storySourceHash(input: StorySourceInput, version: number | null = ENGINE_VERSION): string {
  const description = (input.description ?? "").trim();
  const rest = [description, input.bedrooms ?? null, input.bathrooms ?? null, input.squareMeters ?? null, input.features];
  return createHash("sha256")
    .update(JSON.stringify(version === null ? rest : [version, ...rest]))
    .digest("hex");
}

/** ¿La historia con esta huella corresponde a la fuente actual? */
export function isStorySourceCurrent(hash: string | null | undefined, input: StorySourceInput): boolean {
  if (!hash) return false;
  return KNOWN_ENGINE_VERSIONS.some((v) => storySourceHash(input, v) === hash);
}
