import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { listLocalContacts, syncContacts, upsertContact } from "@/lib/services/idealista/partner-api/reconcile";

// Contactos de Idealista. Un anuncio necesita un contactId existente antes de
// poder publicarse, así que esto es requisito previo, no un extra.

export const maxDuration = 60;

async function guard() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Contactos ya conocidos (espejo local). */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  try {
    return Response.json({ contacts: await listLocalContacts() });
  } catch (err) {
    console.error("[idealista-api/contacts] GET:", err);
    return Response.json({ error: "No se pudieron leer los contactos" }, { status: 500 });
  }
}

/** Crea o actualiza un contacto en Idealista. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      contactId?: number;
      name?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      phonePrefix?: string;
      secondaryPhone?: string;
      secondaryPhonePrefix?: string;
    };

    if (!body.name?.trim()) return Response.json({ error: "Falta el nombre." }, { status: 400 });
    if (!body.email?.trim()) return Response.json({ error: "Falta el email." }, { status: 400 });
    if (!body.phone?.trim()) return Response.json({ error: "Falta el teléfono." }, { status: 400 });

    const result = await upsertContact({
      contactId: body.contactId,
      name: body.name,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      phonePrefix: body.phonePrefix,
      secondaryPhone: body.secondaryPhone,
      secondaryPhonePrefix: body.secondaryPhonePrefix,
    });

    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[idealista-api/contacts] POST:", err);
    return Response.json({ error: "No se pudo guardar el contacto" }, { status: 500 });
  }
}

/** Baja de Idealista todos los contactos del feedKey ("Find All Contacts"). */
export async function PUT() {
  const denied = await guard();
  if (denied) return denied;

  try {
    const result = await syncContacts();
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[idealista-api/contacts] PUT:", err);
    return Response.json({ error: "No se pudieron sincronizar los contactos" }, { status: 500 });
  }
}
