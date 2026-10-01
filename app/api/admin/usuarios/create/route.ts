import "server-only";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { createInvitedUser } from "@/lib/email/password-reset";

// Tope por llamada a GoTrue/PostgREST. Sin él, un GoTrue o un Kong colgado deja
// la petición abierta hasta que algo de por medio la corta (undici a los 300 s,
// el proxy antes) y el modal acaba sin una respuesta que enseñar. Con todas las
// llamadas en serie del peor caso (crear + perfil + reintento + deshacer) se
// sigue quedando por debajo de los ~60 s del proxy.
const SUPABASE_CALL_TIMEOUT_MS = 10_000;
// La auditoría es best-effort: no puede retener la respuesta de un usuario que
// YA se creó bien.
const AUDIT_WAIT_MS = 5_000;

// `authAttempted`: ya se llamó a GoTrue — si algo falla desde ahí, la cuenta
// puede existir en auth aunque la respuesta sea un error.
type Progress = { authAttempted: boolean };

/**
 * Esta ruta SIEMPRE contesta JSON. Una excepción sin capturar sale de Next como
 * 500 sin cuerpo, y el modal solo podía enseñar "Unexpected end of JSON input".
 * Y como la cuenta puede haberse creado antes del fallo, la respuesta dice si
 * conviene revisar la lista antes de reintentar (`mayExist`).
 */
export async function POST(req: Request) {
  const progress: Progress = { authAttempted: false };
  try {
    return await handleCreate(req, progress);
  } catch (err) {
    console.error("[usuarios/create] Error inesperado:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        error: progress.authAttempted
          ? `Error inesperado al crear el usuario (${detail}). Puede que la cuenta se haya creado igualmente: revisa la lista antes de reintentar.`
          : `Error inesperado al crear el usuario (${detail}). No se llegó a crear nada: puedes reintentar.`,
        code: "internal_error",
        mayExist: progress.authAttempted,
      },
      { status: 500 }
    );
  }
}

// GoTrue: `email_exists` (API 2024-01-01) o, en versiones sin código, el texto
// "A user with this email address has already been registered".
function isDuplicateEmail(message: string | null | undefined, code?: string): boolean {
  return code === "email_exists" || /already (been )?registered/i.test(message ?? "");
}

/**
 * El correo ya tiene cuenta. Nunca se duplica (GoTrue no lo permite), pero el
 * caso típico es un reintento tras un "Failed to fetch": el primer intento sí
 * llegó y creó la cuenta. Se devuelve el rol actual para que el panel diga si
 * quedó bien o a medias (p. ej. como 'client', el default del trigger).
 */
async function emailExistsResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  email: string
): Promise<Response> {
  const candidates = Array.from(new Set([email.trim(), email.trim().toLowerCase()]));
  const { data: existing } = await supabase
    .from("profiles")
    .select("role")
    .in("email", candidates)
    .limit(1)
    .maybeSingle()
    .retry(false);

  return Response.json(
    {
      error: `Ya existe un usuario con el correo ${email}; no se ha creado otro. Si un intento anterior dio error de conexión, seguramente se creó entonces: búscalo en la lista y edítalo (rol, países, contraseña) en vez de crearlo de nuevo.`,
      code: "email_exists",
      mayExist: true,
      existingRole: existing?.role ?? null,
    },
    { status: 409 }
  );
}

async function handleCreate(req: Request, progress: Progress): Promise<Response> {
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

  // Modelo multi-país: `countries` ⊆ {'es','cl'} y no vacío. Se valida ANTES de
  // crear la cuenta: validarlo después devolvía el 400 con la cuenta ya creada
  // en auth y el perfil sin rol.
  if (
    countries !== undefined &&
    !(
      Array.isArray(countries) &&
      countries.length > 0 &&
      countries.every((c) => c === "es" || c === "cl")
    )
  ) {
    return Response.json(
      { error: "countries debe ser un array no vacío de 'es' | 'cl'" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient({ timeoutMs: SUPABASE_CALL_TIMEOUT_MS });

  // Crear usuario en auth
  let userId: string = "";
  let authError: string | null = null;
  let clientEmailSent: boolean | undefined;
  let clientTempPassword: string | undefined;

  progress.authAttempted = true;
  if (role === "client") {
    // Cliente: cuenta ya confirmada (el acceso no depende de que llegue el
    // correo) + enlace de fijar contraseña por AWS SES, en vez del mailer
    // propio de Supabase Auth/GoTrue.
    const inviteResult = await createInvitedUser({
      email,
      firstName,
      lastName,
      userMetadata: { phone },
    });

    if (!inviteResult.ok) {
      if (isDuplicateEmail(inviteResult.error)) {
        return emailExistsResponse(supabase, email);
      }
      authError = inviteResult.error;
    } else {
      userId = inviteResult.userId;
      clientEmailSent = inviteResult.emailSent;
      clientTempPassword = inviteResult.emailSent ? undefined : inviteResult.tempPassword;
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
      if (isAuthRetryableFetchError(error)) {
        // GoTrue no contestó (timeout, red, 502/504 de Kong): la petición pudo
        // llegar y crear la cuenta igualmente — no lo sabemos.
        console.error("[usuarios/create] GoTrue no respondió:", error.message);
        return Response.json(
          {
            error: `El servidor de autenticación no respondió (${error.message}). Puede que la cuenta se haya creado igualmente: revisa la lista antes de reintentar.`,
            code: "auth_unreachable",
            mayExist: true,
          },
          { status: 504 }
        );
      }
      if (isDuplicateEmail(error.message, error.code)) {
        return emailExistsResponse(supabase, email);
      }
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
  // country/multiCountry (ya validado arriba, antes de crear la cuenta).
  let hasCountries = false;
  if (countries !== undefined) {
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
  }

  // El teléfono también para staff: el formulario lo pide a todos y es lo que
  // ve el cliente en la ficha de asesor de una colección de visitas.
  if (phone) {
    profileUpdate.phone = phone;
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
    console.error("[usuarios/create] Error actualizando perfil:", profileError.message);

    // Staff: la cuenta ya existe en auth pero SIN su rol — el trigger
    // handle_new_user la deja como 'client', sin acceso al panel y sin países.
    // Se deshace para que reintentar funcione, en vez de chocar con "ya existe"
    // y dejar un agente convertido en cliente. Los clientes no se deshacen: su
    // correo de invitación puede haber salido ya, y su rol es el correcto.
    if (role !== "client") {
      const { error: rollbackError } = await supabase.auth.admin.deleteUser(userId);
      if (rollbackError) {
        console.error("[usuarios/create] No se pudo deshacer la cuenta:", rollbackError.message);
        return Response.json(
          {
            error: `No se pudo guardar el perfil (${profileError.message}) y tampoco deshacer la cuenta: existe en la lista sin su rol. Edítala para asignarle rol y países en vez de crearla de nuevo.`,
            code: "profile_failed",
            mayExist: true,
          },
          { status: 500 }
        );
      }
      return Response.json(
        {
          error: `No se pudo guardar el perfil (${profileError.message}). Se ha deshecho la creación de la cuenta: puedes reintentar.`,
          code: "profile_failed",
          mayExist: false,
        },
        { status: 500 }
      );
    }

    return Response.json(
      {
        error: `Error actualizando perfil: ${profileError.message}`,
        code: "profile_failed",
        mayExist: true,
      },
      { status: 500 }
    );
  }

  // Auditoría (best-effort): registra la creación del usuario con su rol y país.
  // Con tope de espera: si PostgREST se cuelga, el insert sigue en segundo
  // plano pero la respuesta de un usuario ya creado no se queda retenida.
  await Promise.race([
    logPermissionEvent({
      actorId: currentProfile.id,
      targetUserId: userId,
      eventType: "user_created",
      country:
        typeof profileUpdate.country === "string" ? profileUpdate.country : null,
      newValue: {
        role,
        country: profileUpdate.country ?? null,
        countries: profileUpdate.countries ?? null,
      },
    }),
    new Promise<void>((resolve) => setTimeout(resolve, AUDIT_WAIT_MS)),
  ]);

  return Response.json({
    ok: true,
    userId,
    role,
    email,
    ...(clientEmailSent !== undefined ? { emailSent: clientEmailSent } : {}),
    ...(clientTempPassword ? { tempPassword: clientTempPassword } : {}),
  });
}
