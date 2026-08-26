import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { signExtensionToken } from "@/lib/services/idealista/extension-token";

// Genera el token de larga duración que se pega una vez en las opciones de la
// extensión de Chrome para poder enviar leads del inbox de Idealista.
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { token, expiresAt } = signExtensionToken();
  return Response.json({ token, expiresAt });
}
