/**
 * Puntuaciones del mapa de captaciones. Módulo PURO.
 *
 * Solo se importa el TIPO de `suggested-particulares`: ese módulo es
 * `server-only` y un import de valor reventaría el bundle del cliente.
 */
import type { SuggestedParticular } from "@/lib/db/queries/suggested-particulares";

/** id del anuncio → puntuación de encaje con el encargo del cliente elegido. */
export function buildScoreMap(suggestions: SuggestedParticular[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of suggestions) out.set(s.id, s.matchScore);
  return out;
}
