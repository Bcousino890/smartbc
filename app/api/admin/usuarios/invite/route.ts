import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createInvitedUser } from "@/lib/email/password-reset";

export async function POST(req: Request) {
  // Gate de autorización: invitar usuarios requiere usuarios/create.
  // (Sin gate, cualquiera podía crear un usuario con rol arbitrario, incl. admin.)
  const gate = await requirePermission("usuarios", "create");
  if (!gate.ok) return gate.response;

  let body: { email: string; role: string; firstName?: string; lastName?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const { email, role, firstName, lastName } = body;
  if (!email || !role) {
    return Response.json({ error: "Email y rol son obligatorios" }, { status: 400 });
  }

  const validRoles = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin", "client", "viewer"];
  if (!validRoles.includes(role)) {
    return Response.json({ error: "Rol inválido" }, { status: 400 });
  }

  // Crea el usuario ya confirmado (el acceso no depende de que llegue el
  // correo) y manda por AWS SES un enlace para fijar contraseña, en vez de
  // pasar por el mailer propio de Supabase Auth/GoTrue.
  const result = await createInvitedUser({
    email,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    userMetadata: { role },
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    ok: true,
    userId: result.userId,
    emailSent: result.emailSent,
    ...(result.emailSent ? {} : { tempPassword: result.tempPassword }),
  });
}
