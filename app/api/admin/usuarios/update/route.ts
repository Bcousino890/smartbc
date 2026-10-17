import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { STAFF_ROLES } from "@/lib/permissions";
import { countryRolesError, resolveRoleCountries } from "@/lib/auth/role-model";
import { sendEmailChangedNotice } from "@/lib/email/password-reset";

// PostgREST/Postgres: columna o tabla que aún no existe en este VPS (migraciones
// antiguas sin aplicar). Solo esos errores justifican reintentar sin la columna
// o ignorar la tabla; cualquier otro (red, permisos, bloqueo) es un fallo real.
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
import {
  canAssignRole,
  canManageUser,
  canSetPasswordDirectly,
  isKnownRole,
  isUserAdminRole,
  changedPrivilegeFields,
} from "@/lib/auth/user-rank";

export async function PATCH(req: Request) {
  let body: {
    userId: string;
    firstName?: string;
    lastName?: string;
    // Correo de acceso. Cambia la credencial en GoTrue Y la columna del
    // perfil (que es la que se muestra en el panel y en la ficha de asesor).
    email?: string;
    // null = borrar el teléfono (el formulario lo manda vacío a propósito).
    phone?: string | null;
    // Los roles que se asignan son los del modelo visible (ver
    // lib/auth/role-model.ts); se admite también reenviar el rol actual, que
    // puede ser el de un Propietario o un perfil heredado.
    role?: string;
    password?: string;
    country?: "es" | "cl";
    multiCountry?: boolean;
    // Conjunto de países con acceso ('es' | 'cl'). Si viene, tiene prioridad:
    // se escribe `countries`, `country` = default y `multi_country` derivado.
    countries?: string[];
    // Rol efectivo por país (opcional): { es: "agent_senior", cl: null }.
    // Un valor de rol upsertea profiles_country_roles(user_id,country); null
    // borra la fila (vuelve a usar `role` para ese país). Solo tiene sentido
    // para usuarios con acceso a más de un país.
    countryRoles?: Record<string, string | null>;
    // Rol personalizado (custom_roles.id) o null para quitarlo. Cuando está
    // definido, gana sobre `role`/countryRoles para la MATRIZ de permisos
    // (ver resolveBaseMatrix); `role` se conserva para el acceso staff/país.
    customRoleId?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const {
    userId,
    firstName,
    lastName,
    email,
    phone,
    role,
    password,
    country,
    multiCountry,
    countries,
    countryRoles,
    customRoleId,
  } = body;

  if (!userId) {
    return Response.json({ error: "userId requerido" }, { status: 400 });
  }

  const currentProfile = await getCurrentProfile();
  if (!currentProfile) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isUserAdminRole(currentProfile.role)) {
    return Response.json({ error: "Solo owner/admin pueden editar usuarios" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Snapshot previo del perfil. Ahora es OBLIGATORIO: necesitamos el rol actual
  // de la cuenta destino para decidir si el actor puede tocarla (antes la
  // lectura era "best-effort" y la ruta no miraba a quién se editaba: un
  // agent_admin podía cambiar el correo y la contraseña de un owner y entrar
  // como él, o promover a cualquiera a owner).
  let prevProfile: {
    role?: string | null;
    email?: string | null;
    country?: string | null;
    countries?: string[] | null;
  } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from("profiles")
      .select("role, email, country, countries")
      .eq("id", userId)
      .maybeSingle();
    prevProfile = prev ?? null;
  } catch {
    prevProfile = null;
  }
  if (!prevProfile) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Estado actual de los campos de privilegio (best-effort por columna/tabla:
  // `custom_role_id` y `profiles_country_roles` pueden no existir en el VPS).
  const currentCountryRoles: Record<string, string> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (supabase as any)
      .from("profiles_country_roles")
      .select("country, role")
      .eq("user_id", userId);
    for (const r of (rows ?? []) as { country: string; role: string }[]) {
      currentCountryRoles[r.country] = r.role;
    }
  } catch {
    // tabla ausente: sin roles por país guardados
  }
  let currentCustomRoleId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cr } = await (supabase as any)
      .from("profiles")
      .select("custom_role_id")
      .eq("id", userId)
      .maybeSingle();
    currentCustomRoleId = (cr?.custom_role_id as string | null | undefined) ?? null;
  } catch {
    // columna ausente
  }

  // Autorización por rango sobre la cuenta destino.
  const isSelf = currentProfile.id === userId;
  if (isSelf) {
    // Cada uno puede corregir sus propios datos, pero no darse más poder.
    const privileged = changedPrivilegeFields(body as unknown as Record<string, unknown>, {
      role: prevProfile.role ?? null,
      country: prevProfile.country ?? null,
      countries: prevProfile.countries ?? null,
      countryRoles: currentCountryRoles,
      customRoleId: currentCustomRoleId,
    });
    if (privileged.length > 0) {
      return Response.json(
        { error: "No puedes cambiar tu propio rol, países ni permisos" },
        { status: 403 },
      );
    }
  } else if (
    !canManageUser(
      { id: currentProfile.id, role: currentProfile.role },
      { id: userId, role: prevProfile.role },
    )
  ) {
    return Response.json(
      { error: "No puedes modificar a un usuario de rango igual o superior al tuyo" },
      { status: 403 },
    );
  }

  // Nadie fija la contraseña de OTRA cuenta (ni el Propietario): a esa persona
  // se le envía un enlace para que la elija ella (`/[id]/reset-password`). Se
  // comprueba antes de cualquier cambio. Cada uno sí puede cambiar la suya.
  if (password && !canSetPasswordDirectly(currentProfile.id, userId)) {
    return Response.json(
      {
        error:
          "Nadie fija la contraseña de otra persona. Usa «Enviar enlace para elegir contraseña» y la propia persona la elige.",
        code: "password_not_allowed",
      },
      { status: 403 },
    );
  }

  // Un rol solo se asigna si el actor puede crear ese rol (solo el Propietario
  // asigna owner/admin) y si es un rol que existe.
  if (role !== undefined) {
    if (!isKnownRole(role)) {
      return Response.json({ error: "Rol inválido" }, { status: 400 });
    }
    // Guardar el mismo rol que ya tiene no es una asignación nueva.
    if (role !== prevProfile.role && !canAssignRole(currentProfile.role, role)) {
      return Response.json(
        { error: "No tienes permiso para asignar ese rol" },
        { status: 403 },
      );
    }
  }
  if (countryRoles !== undefined) {
    for (const [c, r] of Object.entries(countryRoles)) {
      if (r !== null && r !== currentCountryRoles[c] && !canAssignRole(currentProfile.role, r)) {
        return Response.json(
          { error: "No tienes permiso para asignar ese rol por país" },
          { status: 403 },
        );
      }
    }
  }
  // Un rol personalizado trae su propia matriz (puede ser más amplia que la del
  // actor): solo Propietario y Administrador (no agent_admin) pueden asignarlo.
  if (
    customRoleId !== undefined &&
    (customRoleId || null) !== (currentCustomRoleId || null) &&
    currentProfile.role !== "owner" &&
    currentProfile.role !== "admin"
  ) {
    return Response.json(
      { error: "Solo owner/admin pueden asignar roles personalizados" },
      { status: 403 },
    );
  }

  // La captadora trabaja solo en Chile. Se comprueba cuando se le da ese rol o
  // cuando se tocan sus países; guardar otros datos de una captadora que aún
  // tenga España guardada no se bloquea (se arregla al editar sus países).
  const nextRole = role ?? prevProfile.role ?? null;
  const roleBecomesCaptadora = role === "captadora" && prevProfile.role !== "captadora";
  const touchesCountries =
    countries !== undefined || country !== undefined || multiCountry !== undefined;
  if (nextRole === "captadora" && multiCountry === true) {
    return Response.json(
      { error: "Las captadoras solo trabajan en Chile: no pueden tener acceso a los dos países." },
      { status: 400 },
    );
  }

  // Una captadora no tiene rol por país, y «captadora» no se asigna por país:
  // el rol por país gana sobre el de la cuenta, así que una captadora con un
  // rol por país de Asesor seguiría viendo y editando como Asesor en Chile.
  const countryRolesProblem = countryRolesError(nextRole, countryRoles, currentCountryRoles);
  if (countryRolesProblem) {
    return Response.json({ error: countryRolesProblem }, { status: 400 });
  }

  let captadoraCountries: { country: string; countries: string[] } | null = null;
  if (nextRole === "captadora" && (roleBecomesCaptadora || touchesCountries)) {
    const resolved = resolveRoleCountries("captadora", { country, countries });
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: 400 });
    }
    captadoraCountries = {
      country: resolved.country as string,
      countries: resolved.countries as string[],
    };
  }

  // ── Email ────────────────────────────────────────────────────────────────
  // Aquí solo se valida el formato; el cambio en GoTrue se hace más abajo,
  // cuando TODO lo demás ya está validado (antes se cambiaba el correo de acceso
  // y después una petición con países mal formados daba 400, dejando el correo
  // de acceso cambiado y el del perfil sin cambiar).
  const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
  if (nextEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return Response.json({ error: "Email inválido" }, { status: 400 });
  }
  const emailChanged =
    nextEmail !== undefined && nextEmail !== (prevProfile?.email ?? "").toLowerCase();

  const updates: Record<string, string | boolean | string[] | null> = {};
  if (firstName !== undefined || lastName !== undefined) {
    const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    if (fullName) updates.full_name = fullName;
  }
  if (role !== undefined) updates.role = role;
  if (phone !== undefined) updates.phone = phone;
  if (nextEmail !== undefined) updates.email = nextEmail;

  // customRoleId: string (uuid) para asignar, "" o null para quitar.
  let hasCustomRoleId = false;
  if (customRoleId !== undefined) {
    updates.custom_role_id = customRoleId || (null as unknown as string);
    hasCustomRoleId = true;
  }

  // Al pasar una cuenta a Captadora se limpia lo que la haría seguir siendo otra
  // cosa: el rol personalizado (gana sobre todo) y los roles por país (se borran
  // más abajo, tras guardar el perfil).
  if (captadoraCountries && currentCustomRoleId && customRoleId === undefined) {
    updates.custom_role_id = null;
    hasCustomRoleId = true;
  }

  // Validación de countryRoles: solo países válidos y roles de staff
  // conocidos (no tiene sentido asignar "client"/"viewer" como rol de país).
  if (countryRoles !== undefined) {
    for (const [c, r] of Object.entries(countryRoles)) {
      if (c !== "es" && c !== "cl") {
        return Response.json({ error: `País inválido en countryRoles: ${c}` }, { status: 400 });
      }
      if (r !== null && !STAFF_ROLES.includes(r as (typeof STAFF_ROLES)[number])) {
        return Response.json({ error: `Rol inválido en countryRoles: ${r}` }, { status: 400 });
      }
    }
  }

  // Modelo multi-país (nuevo): si viene `countries`, tiene prioridad sobre
  // country/multiCountry. Se valida ⊆ {'es','cl'} y no vacío.
  let hasCountries = false;
  if (captadoraCountries) {
    updates.countries = captadoraCountries.countries;
    updates.country = captadoraCountries.country;
    updates.multi_country = false;
    hasCountries = true;
  } else if (countries !== undefined) {
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
    updates.countries = unique;
    // País por defecto/landing: el enviado explícitamente o el primero del set.
    updates.country = country === "es" || country === "cl" ? country : unique[0];
    // multi_country se deriva del tamaño del set (retrocompat).
    updates.multi_country = unique.length > 1;
    hasCountries = true;
  } else {
    if (country !== undefined) {
      if (country !== "es" && country !== "cl") {
        return Response.json({ error: "País inválido" }, { status: 400 });
      }
      updates.country = country;
    }
    if (multiCountry !== undefined) updates.multi_country = !!multiCountry;
  }

  // Se cambia primero en GoTrue: si el correo ya lo usa otro usuario falla
  // ahí, y así no dejamos el perfil apuntando a un email con el que nadie
  // puede entrar. `email_confirm` lo da por verificado (lo cambia un admin,
  // no el propio usuario, así que no hay email de confirmación que abrir).
  if (emailChanged && nextEmail !== undefined) {
    const { error: authEmailError } = await supabase.auth.admin.updateUserById(userId, {
      email: nextEmail,
      email_confirm: true,
    });
    if (authEmailError) {
      return Response.json(
        { error: `Error cambiando el email: ${authEmailError.message}` },
        { status: 400 },
      );
    }
    // El correo es a donde llegan los enlaces de contraseña: cambiar el de otra
    // cuenta deja rastro de quién lo hizo y de qué a qué, y se avisa al correo
    // anterior (best-effort).
    await logPermissionEvent({
      actorId: currentProfile.id,
      targetUserId: userId,
      eventType: "email_changed",
      oldValue: { email: prevProfile?.email ?? null },
      newValue: { email: nextEmail },
    });
    if (prevProfile?.email && currentProfile.id !== userId) {
      await Promise.race([
        sendEmailChangedNotice({
          oldEmail: prevProfile.email,
          newEmail: nextEmail,
          userName: (typeof firstName === "string" && firstName.trim()) || prevProfile.email,
        }).catch(() => ({ success: false })),
        new Promise((resolve) => setTimeout(resolve, 8_000)),
      ]);
    }
  }

  if (Object.keys(updates).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    // Escritura defensiva: si `countries` y/o `custom_role_id` aún no existen
    // en el VPS (migraciones 0084/0090 pendientes), reintentamos sin esas
    // columnas para no bloquear el resto de la actualización.
    if (error && (hasCountries || hasCustomRoleId) && isMissingColumn(error)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
      const { countries: _omitCountries, custom_role_id: _omitCustomRoleId, ...fallbackUpdates } =
        updates as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase as any)
        .from("profiles")
        .update(fallbackUpdates)
        .eq("id", userId));
    }

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Una captadora no tiene roles por país: fuera todos los que tuviera (el rol
    // por país gana sobre el de la cuenta). Se repite en cada guardado suyo, no
    // solo al pasar a Captadora, para que un fallo aquí se arregle al reintentar.
    // supabase-js no lanza: devuelve el error, y hay que mirarlo.
    if (captadoraCountries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cleanupError } = await (supabase as any)
        .from("profiles_country_roles")
        .delete()
        .eq("user_id", userId);
      if (cleanupError && !isMissingTable(cleanupError)) {
        return Response.json(
          {
            error: `La cuenta pasó a Captadora, pero no se pudieron quitar sus roles por país (${cleanupError.message}). Vuelve a guardarla para terminar el cambio.`,
            code: "partial",
          },
          { status: 500 },
        );
      }
    }

    // ── Rol por país (best-effort, defensivo) ──────────────────────────────
    // Upsertea/borra filas de profiles_country_roles según countryRoles. Si
    // la tabla aún no existe (migración 0090 pendiente), se ignora en
    // silencio: el resto de la actualización ya se aplicó arriba.
    if (countryRoles !== undefined) {
      for (const [c, r] of Object.entries(countryRoles)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = (supabase as any).from("profiles_country_roles");
        const { error: countryRoleError } =
          r === null
            ? await table.delete().eq("user_id", userId).eq("country", c)
            : await table.upsert(
                { user_id: userId, country: c, role: r, created_by: currentProfile.id },
                { onConflict: "user_id,country" },
              );
        // Tabla que aún no existe (migración 0090 pendiente): se ignora. Cualquier
        // otro error es real: no se da por guardado un rol por país que no lo está.
        if (countryRoleError && !isMissingTable(countryRoleError)) {
          return Response.json(
            {
              error: `Se guardó el resto, pero no el rol por país de ${c.toUpperCase()} (${countryRoleError.message}). Vuelve a guardar.`,
              code: "partial",
            },
            { status: 500 },
          );
        }
      }
    }

    // ── Auditoría (best-effort) de cambios de rol y país ──────────────────────
    // Solo registramos cuando el valor realmente cambia respecto al snapshot.
    if (role !== undefined && prevProfile && role !== prevProfile.role) {
      await logPermissionEvent({
        actorId: currentProfile.id,
        targetUserId: userId,
        eventType: "role_changed",
        oldValue: { role: prevProfile.role ?? null },
        newValue: { role },
      });
    }

    if (prevProfile) {
      // País por defecto (landing).
      const nextCountry =
        typeof updates.country === "string" ? updates.country : undefined;
      // Conjunto de países.
      const nextCountries = Array.isArray(updates.countries)
        ? updates.countries
        : undefined;

      const prevCountries = prevProfile.countries ?? null;
      const countryChanged =
        nextCountry !== undefined && nextCountry !== prevProfile.country;
      const countriesChanged =
        nextCountries !== undefined &&
        JSON.stringify([...nextCountries].sort()) !==
          JSON.stringify([...(prevCountries ?? [])].sort());

      if (countryChanged || countriesChanged) {
        await logPermissionEvent({
          actorId: currentProfile.id,
          targetUserId: userId,
          eventType: "country_changed",
          country: nextCountry ?? null,
          oldValue: {
            country: prevProfile.country ?? null,
            countries: prevCountries,
          },
          newValue: {
            country: nextCountry ?? prevProfile.country ?? null,
            countries: nextCountries ?? prevCountries,
          },
        });
      }
    }
  }

  if (password) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) {
      return Response.json({ error: `Error cambiando contraseña: ${error.message}` }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
