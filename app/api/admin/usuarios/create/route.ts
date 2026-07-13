import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(req: Request) {
  let body: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
    role: "owner" | "admin" | "advisor" | "agent_junior" | "agent_senior" | "agent_admin" | "client";
    password?: string;
    assignedAdvisorId?: string;
    // Opcional: país del nuevo perfil ('es' | 'cl'). Si se omite, se
    // mantiene el default histórico de la tabla ('es') — así los árboles
    // raíz y España no cambian de comportamiento. El árbol de Chile envía
    // siempre 'cl'.
    country?: "es" | "cl";
    // Usuarios que trabajan en ambos países (ej. algunos asesores/agentes)
    // pueden alternar entre /es/admin y /cl/admin igual que un admin.
    multiCountry?: boolean;
    // Conjunto de países con acceso ('es' | 'cl'). Si viene, tiene prioridad:
    // se escribe `countries`, `country` = default (body.country ?? countries[0])
    // y `multi_country` se deriva (countries.length > 1).
    countries?: string[];
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
    country,
    multiCountry,
    countries,
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

  // Validar permisos: solo owner/admin/agent_admin pueden crear staff
  if (!isOwnerOrAdmin && !isAdvisorOrAgent) {
    return Response.json(
      { error: "No tienes permisos para crear usuarios" },
      { status: 403 }
    );
  }

  if (isAdvisorOrAgent && role !== "client") {
    return Response.json(
      { error: "Los asesores y agentes solo pueden crear clientes" },
      { status: 403 }
    );
  }

  // Contraseña obligatoria para roles de staff (no clients — estos reciben invitación)
  const staffRoles = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  if (staffRoles.includes(role) && !password) {
    return Response.json(
      { error: "La contraseña es obligatoria para crear usuarios de tipo staff" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Crear usuario en auth
  let userId: string = "";
  let authError: string | null = null;

  if (role === "client") {
    // Clientes reciben email de invitación (sin contraseña)
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
    // Staff (owner, admin, advisor, agent_*): crear con contraseña confirmada
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

  // Actualizar profile con rol y email usando el cliente admin (service role) para bypassear RLS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profileUpdate: Record<string, any> = {
    role,
    email,
  };

  // Modelo multi-país (nuevo): si viene `countries`, tiene prioridad sobre
  // country/multiCountry. Se valida ⊆ {'es','cl'} y no vacío.
  let hasCountries = false;
  if (countries !== undefined) {
    const valid =
      Array.isArray(countries) &&
      countries.length > 0 &&
      countries.every((c) => c === "es" || c === "cl");
    if (!valid) {
      return Response.json(
        { error: "countries debe ser un array no vacío de 'es' | 'cl'" },
        { status: 400 }
      );
    }
    const unique = Array.from(new Set(countries));
    profileUpdate.countries = unique;
    // País por defecto/landing: el enviado explícitamente o el primero del set.
    profileUpdate.country =
      country === "es" || country === "cl" ? country : unique[0];
    // multi_country se deriva del tamaño del set (retrocompat).
    profileUpdate.multi_country = unique.length > 1;
    hasCountries = true;
  } else {
    if (country === "es" || country === "cl") {
      profileUpdate.country = country;
    }
    if (staffRoles.includes(role) && multiCountry !== undefined) {
      profileUpdate.multi_country = !!multiCountry;
    }
  }

  if (role === "client") {
    profileUpdate.assigned_advisor_id = assignedAdvisorId || null;
    if (phone) {
      profileUpdate.phone = phone;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { error: profileError } = await (supabase as any)
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);

  // Escritura defensiva: si la columna `countries` aún no existe en el VPS, el
  // UPDATE falla. Reintentamos sin ella conservando country + multi_country
  // (derivados), para no bloquear la creación del usuario.
  if (profileError && hasCountries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const { countries: _omitCountries, ...fallbackUpdate } = profileUpdate;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ error: profileError } = await (supabase as any)
      .from("profiles")
      .update(fallbackUpdate)
      .eq("id", userId));
  }

  if (profileError) {
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
