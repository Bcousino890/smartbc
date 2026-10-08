import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCountryRolesMap } from "@/lib/db/queries/permissions";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import {
  countOwners,
  customRoleExists,
  loadTargetProfile,
  requireUserAdmin,
} from "@/lib/auth/user-admin";
import {
  canAssignCustomRole,
  canAssignRole,
  canChangeOwnAccess,
  canManageUser,
  COUNTRY_ASSIGNABLE_ROLES,
  keepsAnOwner,
} from "@/lib/auth/user-admin-rules";

/** Mínimo de caracteres de una contraseña puesta por un administrador. */
const MIN_PASSWORD_LENGTH = 8;

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

  // Permiso efectivo usuarios.edit (antes: lista fija owner/admin/agent_admin,
  // sin más reglas — un agent_admin podía hacerse propietario a sí mismo o
  // cambiar el correo y la contraseña del propietario).
  const gate = await requireUserAdmin("edit");
  if (!gate.ok) return gate.response;
  const currentProfile = gate.actor;

  const target = await loadTargetProfile(userId);
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }
  const forbid = (error: string) => Response.json({ error }, { status: 403 });

  // A quién puede tocar (propietario solo otro propietario; admin solo
  // propietario/admin). Aplica a CUALQUIER cambio: nombre, correo, contraseña…
  const manage = canManageUser({ id: currentProfile.id, role: currentProfile.role }, target);
  if (!manage.ok) return forbid(manage.error);

  const isSelf = currentProfile.id === userId;
  // El formulario de edición manda SIEMPRE rol, países y rol por país, aunque
  // no se hayan tocado: se compara con lo guardado para saber qué cambia de
  // verdad (si no, nadie podría editar ni su propio nombre).
  const roleChanges = role !== undefined && role !== target.role;
  const storedCountries =
    target.countries && target.countries.length > 0 ? target.countries : [target.country ?? "es"];
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const countriesChange =
    countries !== undefined &&
    (!Array.isArray(countries) || !sameSet(Array.from(new Set(countries)), storedCountries));
  const multiCountryChange =
    countries === undefined && multiCountry !== undefined && Boolean(multiCountry) !== Boolean(target.multi_country);
  let countryRolesChange = false;
  if (countryRoles !== undefined) {
    const map: Record<string, Record<string, string>> = await getCountryRolesMap([userId]).catch(() => ({}));
    const current = map[userId] ?? {};
    countryRolesChange =
      !countryRoles ||
      typeof countryRoles !== "object" ||
      Object.entries(countryRoles).some(([c, r]) => (current[c] ?? null) !== (r || null));
  }
  const customRoleChange =
    customRoleId !== undefined && (customRoleId || null) !== (target.custom_role_id ?? null);
  const accessChanges =
    roleChanges || countriesChange || multiCountryChange || countryRolesChange || customRoleChange;
  // Nadie cambia su propio acceso (rol, países, rol por país, rol personalizado).
  if (isSelf && accessChanges) {
    const own = canChangeOwnAccess(currentProfile.id, userId);
    if (!own.ok) return forbid(own.error);
  }

  if (roleChanges) {
    const assign = canAssignRole(currentProfile.role, role);
    if (!assign.ok) {
      return Response.json({ error: assign.error }, { status: assign.error.startsWith("Rol inválido") ? 400 : 403 });
    }
    if (roleChanges && target.role === "owner") {
      const keep = keepsAnOwner({ targetCurrentRole: target.role, nextRole: role, ownerCount: await countOwners() });
      if (!keep.ok) return forbid(keep.error);
    }
  }

  if (customRoleChange) {
    const custom = canAssignCustomRole(currentProfile.role);
    if (!custom.ok) return forbid(custom.error);
    if (customRoleId && !(await customRoleExists(customRoleId))) {
      return Response.json({ error: "Rol personalizado no encontrado" }, { status: 400 });
    }
  }

  if (password !== undefined && password !== "" && (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH)) {
    return Response.json(
      { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Snapshot previo del perfil para auditar SOLO cambios reales de rol/país.
  // Best-effort: si falla la lectura, seguimos sin auditar esos campos.
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

  // ── Email ────────────────────────────────────────────────────────────────
  // Se cambia primero en GoTrue: si el correo ya lo usa otro usuario falla
  // ahí, y así no dejamos el perfil apuntando a un email con el que nadie
  // puede entrar. `email_confirm` lo da por verificado (lo cambia un admin,
  // no el propio usuario, así que no hay email de confirmación que abrir).
  const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined;
  if (nextEmail !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return Response.json({ error: "Email inválido" }, { status: 400 });
    }
    if (nextEmail !== (prevProfile?.email ?? "").toLowerCase()) {
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
    }
  }

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

  // Validación de countryRoles: solo países válidos y roles de staff que no
  // sean propietario/admin (esos son globales: tienen los dos países y acceso
  // total; por país permitirían colarse un rol alto sin pasar por las reglas).
  if (countryRoles !== undefined) {
    if (!countryRoles || typeof countryRoles !== "object" || Array.isArray(countryRoles)) {
      return Response.json({ error: "countryRoles inválido" }, { status: 400 });
    }
    for (const [c, r] of Object.entries(countryRoles)) {
      if (c !== "es" && c !== "cl") {
        return Response.json({ error: `País inválido en countryRoles: ${c}` }, { status: 400 });
      }
      if (r !== null && !(COUNTRY_ASSIGNABLE_ROLES as readonly string[]).includes(r)) {
        return Response.json({ error: `Rol inválido en countryRoles: ${r}` }, { status: 400 });
      }
    }
  }

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

  if (Object.keys(updates).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    // Escritura defensiva: si `countries` y/o `custom_role_id` aún no existen
    // en el VPS (migraciones 0084/0090 pendientes), reintentamos sin esas
    // columnas para no bloquear el resto de la actualización.
    if (error && (hasCountries || hasCustomRoleId)) {
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

    // ── Rol por país (best-effort, defensivo) ──────────────────────────────
    // Upsertea/borra filas de profiles_country_roles según countryRoles. Si
    // la tabla aún no existe (migración 0090 pendiente), se ignora en
    // silencio: el resto de la actualización ya se aplicó arriba.
    if (countryRoles !== undefined) {
      const failed: string[] = [];
      for (const [c, r] of Object.entries(countryRoles)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = (supabase as any).from("profiles_country_roles");
        const { error: crError } =
          r === null
            ? await table.delete().eq("user_id", userId).eq("country", c)
            : await table.upsert(
                { user_id: userId, country: c, role: r, created_by: currentProfile.id },
                { onConflict: "user_id,country" },
              );
        // 42P01 = la tabla aún no existe (migración 0090 sin aplicar): se
        // ignora como antes. Cualquier otro error se avisa: antes se tragaba
        // y el panel decía "guardado" con el rol por país sin cambiar.
        if (crError && crError.code !== "42P01") failed.push(`${c}: ${crError.message}`);
      }
      if (failed.length > 0) {
        return Response.json(
          { error: `Se guardó el resto, pero no el rol por país (${failed.join("; ")})` },
          { status: 500 },
        );
      }
    }

    // ── Auditoría (best-effort) de cambios de acceso ──────────────────────────
    // Solo registramos cuando el valor realmente cambia respecto al snapshot.
    if (nextEmail !== undefined && prevProfile && nextEmail !== (prevProfile.email ?? "").toLowerCase()) {
      await logPermissionEvent({
        actorId: currentProfile.id,
        targetUserId: userId,
        eventType: "email_changed",
        oldValue: { email: prevProfile.email ?? null },
        newValue: { email: nextEmail },
      });
    }
    if (countryRolesChange) {
      await logPermissionEvent({
        actorId: currentProfile.id,
        targetUserId: userId,
        eventType: "country_roles_changed",
        newValue: { countryRoles },
      });
    }
    if (customRoleChange) {
      await logPermissionEvent({
        actorId: currentProfile.id,
        targetUserId: userId,
        eventType: "custom_role_changed",
        oldValue: { customRoleId: target.custom_role_id ?? null },
        newValue: { customRoleId: customRoleId || null },
      });
    }
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
    await logPermissionEvent({
      actorId: currentProfile.id,
      targetUserId: userId,
      eventType: "password_changed",
    });
  }

  return Response.json({ ok: true });
}
