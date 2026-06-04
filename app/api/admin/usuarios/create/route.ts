import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(req: Request) {
  let body: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    role: "admin" | "advisor" | "client";
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

  const validRoles = ["admin", "advisor", "client"];
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

  // Validar permisos
  // Admin: puede crear admin, advisor, client
  // Advisor: puede crear client solamente
  // Client: no puede crear nada
  if (currentProfile.role === "client") {
    return Response.json(
      { error: "No tienes permisos para crear usuarios" },
      { status: 403 }
    );
  }

  if (currentProfile.role === "advisor" && role !== "client") {
    return Response.json(
      {
        error:
          "Los asesores solo pueden crear clientes",
      },
      { status: 403 }
    );
  }

  // Validaciones específicas por rol
  if (role === "advisor" && !password) {
    return Response.json(
      { error: "La contraseña es obligatoria para crear asesores" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Crear usuario en auth
  let userId: string = "";
  let authError: string | null = null;

  if (role === "advisor") {
    // Para asesores, crear con contraseña
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
  } else if (role === "client") {
    // Para clientes, crear y enviar invitación
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
    // Admin: similar a advisor
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

  // Actualizar profile con rol y email (por si el trigger no existe en el VPS).
  // Usa el cliente admin (service role) para garantizar que bypasea RLS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileUpdate: Record<string, any> = {
    role,
    // Fallback: si no hay trigger que copie el email desde auth.users, lo seteamos aquí
    email,
  };

  if (role === "client") {
    profileUpdate.assigned_advisor_id = assignedAdvisorId || null;
    if (phone) {
      profileUpdate.phone = phone;
    }
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);

  if (profileError) {
    // El usuario fue creado en auth pero falló la actualización en DB
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
