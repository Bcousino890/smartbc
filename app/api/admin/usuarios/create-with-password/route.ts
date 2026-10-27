import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { createInvitedUser } from "@/lib/email/password-reset";
import { randomBytes } from "crypto";

/**
 * Alta rápida de un cliente desde "Solicitudes → Nueva solicitud".
 *
 * Antes:
 *   - Aceptaba `role` del cuerpo (incluido `owner`): con "Crear propietario" en
 *     la interfaz, cualquiera con acceso a Solicitudes (hasta un agent_junior)
 *     podía crear una cuenta con rol owner.
 *   - Devolvía la contraseña temporal en claro en la respuesta (y la
 *     interfaz la mostraba y se compartía a mano).
 *
 * Ahora:
 *   - Siempre crea un CLIENTE: el rol lo fija el servidor, el cuerpo no cuenta.
 *     "Propietario" aquí es la persona dueña de un inmueble, no un rol de acceso.
 *   - Exige `clientes.create` (matriz efectiva), como el resto de altas de cliente.
 *   - No devuelve ninguna contraseña. Con email, el cliente recibe un enlace para
 *     fijar la suya (mismo camino que el alta normal de clientes); sin email se
 *     crea la ficha sin acceso al portal hasta que se le añada un correo.
 *   - Queda auditado.
 */
export async function POST(req: Request) {
  const gate = await requirePermission("clientes", "create");
  if (!gate.ok) return gate.response;
  const actor = gate.profile;

  try {
    const body = await req.json();
    const { firstName, lastName = "", email: emailInput, phone } = body ?? {};

    if (!firstName || typeof firstName !== "string") {
      return Response.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    const cleanLast = typeof lastName === "string" ? lastName : "";

    const realEmail =
      typeof emailInput === "string" && emailInput.trim() ? emailInput.trim().toLowerCase() : null;
    if (realEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail)) {
      return Response.json({ error: "Email inválido" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;

    let userId: string;
    let email: string;
    let accessMode: "invite_sent" | "invite_failed" | "no_email";

    if (realEmail) {
      // Cuenta confirmada + enlace de "fijar contraseña" por SES. La contraseña
      // temporal que genera createInvitedUser NO sale de aquí.
      const invited = await createInvitedUser({
        email: realEmail,
        firstName,
        lastName: cleanLast,
        userMetadata: { phone },
      });
      if (!invited.ok) {
        return Response.json({ error: invited.error }, { status: 400 });
      }
      userId = invited.userId;
      email = realEmail;
      accessMode = invited.emailSent ? "invite_sent" : "invite_failed";
    } else {
      // Sin correo: ficha de cliente con un login interno que nadie conoce
      // (contraseña aleatoria que no se devuelve ni se guarda).
      email = `sin-email-${Date.now()}@interno.smartbc.local`;
      const { data, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: randomBytes(18).toString("base64url"),
        email_confirm: true,
        user_metadata: {
          full_name: `${firstName} ${cleanLast}`.trim(),
          first_name: firstName,
          last_name: cleanLast,
        },
      });
      if (createError || !data?.user) {
        return Response.json({ error: createError?.message ?? "Error creando usuario" }, { status: 400 });
      }
      userId = data.user.id;
      accessMode = "no_email";
    }

    // El rol lo fija el servidor: siempre cliente.
    const profileUpdate: Record<string, string | null> = { role: "client", email };
    if (phone) profileUpdate.phone = phone;
    // Quién lo creó, y a quién queda asignado si es un asesor/agente (cartera propia).
    profileUpdate.created_by = actor.id;
    if (!["owner", "admin", "agent_admin"].includes(actor.role)) profileUpdate.assigned_advisor_id = actor.id;
    await supabase.from("profiles").update(profileUpdate).eq("id", userId);

    await logPermissionEvent({
      actorId: actor.id,
      targetUserId: userId,
      eventType: "user_created",
      newValue: { role: "client", via: "solicitudes/create-with-password", accessMode },
    });

    return Response.json({ ok: true, userId, email, accessMode });
  } catch (err) {
    console.error("[create-with-password] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
