import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { randomBytes } from "crypto";

function generatePassword(length = 12): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  const bytes = randomBytes(length);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  // Mismo modelo de autorización que /api/admin/usuarios/create: solo
  // owner/admin/agent_admin pueden crear staff con rol arbitrario; los
  // asesores/agentes solo pueden crear clientes. Antes bastaba con ser staff
  // (incluido agent_junior), lo que permitía escalar creando cuentas con
  // cualquier rol. El chequeo por rol concreto se hace tras parsear el body.
  const isOwnerOrAdmin = !!profile && ["owner", "admin", "agent_admin"].includes(profile.role);
  const isAdvisorOrAgent = !!profile && ["advisor", "agent_senior", "agent_junior"].includes(profile.role);
  if (!isOwnerOrAdmin && !isAdvisorOrAgent) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { firstName, lastName = "", email: emailInput, phone, role = "client" } = body;

    if (!firstName) {
      return Response.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }

    // Si no hay email, se genera uno interno temporal no-reply
    const email = emailInput?.trim() || `sin-email-${Date.now()}@interno.smartbc.local`;

    const validRoles = ["client", "owner", "advisor", "agent_junior", "agent_senior"];
    if (!validRoles.includes(role)) {
      return Response.json({ error: "Rol inválido" }, { status: 400 });
    }
    // Asesores/agentes solo pueden crear clientes (no escalar a staff).
    if (!isOwnerOrAdmin && role !== "client") {
      return Response.json(
        { error: "Los asesores y agentes solo pueden crear clientes" },
        { status: 403 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    const tempPassword = generatePassword(12);

    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (createError || !data.user) {
      return Response.json({ error: createError?.message ?? "Error creando usuario" }, { status: 400 });
    }

    const userId = data.user.id;

    const profileUpdate: Record<string, string | null> = { role, email };
    if (phone) profileUpdate.phone = phone;

    await supabase.from("profiles").update(profileUpdate).eq("id", userId);

    return Response.json({ ok: true, userId, email, password: tempPassword });
  } catch (err) {
    console.error("[create-with-password] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
