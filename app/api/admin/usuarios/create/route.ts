import "server-only";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(req: Request) {
  let body: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    role: string;
    password?: string;
    assignedAdvisorId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const {
    email,
    firstName,
    lastName = "",
    phone,
    role: roleInput,
    password,
    assignedAdvisorId,
  } = body;

  const role = roleInput;

  // Validaciones básicas
  if (!email || !firstName) {
    return Response.json(
      { error: "Email y nombre son obligatorios" },
      { status: 400 }
    );
  }

  const validRoles = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin", "client"];
  if (!validRoles.includes(role)) {
    return Response.json({ error: "Rol inválido" }, { status: 400 });
  }

  // Obtener perfil actual para validar permisos
  const currentProfile = await getCurrentProfile();
  if (!currentProfile) {
    return Response.json(
      { error: "No autenticado" },
      { status: 401 }
    );
  }

  const isOwnerOrAdmin = ["owner", "admin", "agent_admin"].includes(currentProfile.role);
  const isAdvisorOrAgent = ["advisor", "agent_junior", "agent_senior"].includes(currentProfile.role);

  if (!isOwnerOrAdmin && !isAdvisorOrAgent) {
    return Response.json(
      { error: "No tienes permisos para crear usuarios" },
      { status: 403 }
    );
  }

  if (isAdvisorOrAgent && role !== "client") {
    return Response.json(
      { error: "Los asesores solo pueden crear clientes" },
      { status: 403 }
    );
  }

  const staffRoles = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  if (staffRoles.includes(role) && !password) {
    return Response.json(
      { error: "La contraseña es obligatoria para crear usuarios de staff" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userClient = (await createClient()) as any;

  // Crear usuario en auth
  let userId: string = "";
  let authError: string | null = null;

  if (role === "client") {
    // Para clientes, enviar invitación por email
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
      },
    });

    if (error) {
      authError = error.message;
    } else {
      userId = data.user?.id || "";
    }
  } else {
    // Staff: crear con contraseña
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (error) {
      authError = error.message;
    } else {
      userId = data.user?.id || "";
    }
  }

  if (authError) {
    return Response.json({ error: authError }, { status: 400 });
  }

  if (!userId) {
    return Response.json(
      { error: "Error creando usuario" },
      { status: 500 }
    );
  }

  // Actualizar profile con rol, assigned_advisor_id y created_by
  // Nota: la migración 0020 agrega la columna created_by, pero no todas las bases de datos pueden tenerla
  // Si falla, continuamos de todas formas porque el usuario fue creado exitosamente en auth
  const profileUpdate: any = {
    role,
  };

  if (role === "client") {
    profileUpdate.assigned_advisor_id = assignedAdvisorId || null;
    if (phone) {
      profileUpdate.phone = phone;
    }
  }

  // Intentar agregar created_by si existe la columna
  profileUpdate.created_by = currentProfile.id;

  const { error: profileError } = await userClient
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);

  if (profileError) {
    // El usuario fue creado en auth pero falló la actualización en DB
    // Por ahora retornamos el error, en prod podrías tener un cleanup
    return Response.json(
      { error: `Error actualizando perfil: ${profileError.message}` },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    userId,
    role,
    email,
  });
}
