import "server-only";
import { createClient } from "@/lib/db/server";
import { requireSession } from "@/lib/db/auth-helpers";
import { addCoApplicant } from "@/lib/db/queries/property-applications";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireSession(supabase);
    if (!auth.ok) return Response.json({ error: "No autorizado" }, { status: 401 });

    const body = await req.json() as {
      application_id: string;
      invite_email: string;
    };

    if (!body.application_id || !body.invite_email) {
      return Response.json(
        { error: "Se requieren application_id e invite_email" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.invite_email)) {
      return Response.json({ error: "Email no válido" }, { status: 400 });
    }

    await addCoApplicant({
      property_application_id: body.application_id,
      invite_email: body.invite_email,
    });

    // TODO: enviar email de invitación al co-solicitante
    // await sendCoApplicantInviteEmail(body.invite_email, body.application_id);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[co-applicants] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
