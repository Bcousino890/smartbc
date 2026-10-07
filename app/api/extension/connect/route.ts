import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createExtensionSession, EXTENSION_ROLES } from "@/lib/extension/sessions";

// ============================================================================
// Conectar la extensión con el usuario del CRM.
//
// Lo llama la página /{país}/admin/extension con la sesión normal del CRM
// (cookie, mismo origen): quien conecta es quien ya entró en el CRM, con su
// contraseña. La extensión nunca ve ni guarda una contraseña.
//
// El token se devuelve UNA vez y la página se lo pasa al content script de la
// extensión (chrome-extension/crm-connect.js). En la base solo queda su hash.
// ============================================================================

export async function POST(request: Request) {
  // Solo desde el propio CRM: un formulario de otra web no puede pedir un
  // token en nombre del usuario aprovechando su cookie (que además es
  // SameSite=Lax y no viaja en un POST de otro sitio). Se compara con el host
  // que ve el navegador: detrás de nginx `host` puede llegar como
  // localhost:3000, así que valen también x-forwarded-host y el dominio real.
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* Origin ilegible: se rechaza abajo */
    }
    const ours = new Set(
      [request.headers.get("host"), request.headers.get("x-forwarded-host"), "portal.bcousinoprop.com"].filter(
        (h): h is string => Boolean(h),
      ),
    );
    if (!ours.has(originHost)) {
      return Response.json({ error: "Origen no permitido" }, { status: 403 });
    }
  }

  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Inicia sesión en el CRM." }, { status: 401 });
  if (!(EXTENSION_ROLES as readonly string[]).includes(profile.role)) {
    return Response.json({ error: "Tu usuario no puede usar la extensión." }, { status: 403 });
  }

  let body: { extensionId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* sin cuerpo: se responde abajo */
  }
  const extensionId = typeof body.extensionId === "string" ? body.extensionId : "";

  const res = await createExtensionSession(profile.id, request.headers.get("user-agent"), extensionId);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });

  return Response.json({
    token: res.token,
    user: { id: profile.id, name: profile.full_name || profile.email || "—" },
  });
}
