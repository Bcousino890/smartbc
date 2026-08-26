import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { generateListingSuggestions } from "@/lib/services/idealista/ai-suggestions";

// Dispara el análisis de IA sobre "Fichas guardadas" (ver ai-suggestions.ts).
// Es una llamada con coste real a la IA (aunque no escribe nada), así que
// usa el mismo permiso que el resto de acciones de IA de este módulo
// (generate-description, analyze-photos): properties/edit, no solo "ver".
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await generateListingSuggestions();
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }
  return Response.json(result);
}
