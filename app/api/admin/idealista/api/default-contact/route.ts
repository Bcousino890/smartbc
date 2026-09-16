import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { setDefaultContactId } from "@/lib/services/idealista/partner-api/config";

// Contacto por defecto del Partner API: se usa en toda ficha que no tenga
// contacto propio (nuevas y ya creadas). Ver `setDefaultContactId()`.

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { contactId?: number };
    const contactId = Number(body.contactId);
    if (!Number.isInteger(contactId) || contactId <= 0) {
      return Response.json({ error: "Falta un contactId válido." }, { status: 400 });
    }

    const { backfilled } = await setDefaultContactId(contactId);
    return Response.json({ ok: true, backfilled });
  } catch (err) {
    console.error("[idealista-api/default-contact] POST:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo guardar el contacto por defecto" },
      { status: 500 }
    );
  }
}
