import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { buildExtensionZip, currentExtensionVersion } from "@/lib/services/idealista/extension-package";

// Paquete de la extensión de Chrome que acompaña a este despliegue, para
// instalarla o actualizarla desde el propio panel (Solicitudes avisa cuando
// la que captura el inbox se ha quedado atrás). Solo administradores, igual
// que el token.
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const zip = buildExtensionZip();
  const version = currentExtensionVersion();
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="smartbc-extension-${version}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
