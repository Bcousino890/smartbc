import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";
import { STAFF_ROLES } from "@/lib/permissions";

export async function PATCH(req: Request) {
  let body: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: "owner" | "admin" | "advisor" | "agent_junior" | "agent_senior" | "agent_admin" | "client";
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

  if (!["owner", "admin", "agent_admin"].includes(currentProfile.role)) {
    return Response.json({ error: "Solo owner/admin pueden editar usuarios" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Snapshot previo del perfil para auditar SOLO cambios reales de rol/país.
  // Best-effort: si falla la lectura, seguimos sin auditar esos campos.
  let prevProfile: {
    role?: string | null;
    country?: string | null;
    countries?: string[] | null;
  } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prev } = await (supabase as any)
      .from("profiles")
      .select("role, country, countries")
      .eq("id", userId)
      .maybeSingle();
    prevProfile = prev ?? null;
  } catch {
    prevProfile = null;
  }

  const updates: Record<string, string | boolean | string[] | null> = {};
  if (firstName !== undefined || lastName !== undefined) {
    const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    if (fullName) updates.full_name = fullName;
  }
  if (role !== undefined) updates.role = role;
  if (phone !== undefined) updates.phone = phone;

  // customRoleId: string (uuid) para asignar, "" o null para quitar.
  let hasCustomRoleId = false;
  if (customRoleId !== undefined) {
    updates.custom_role_id = customRoleId || (null as unknown as string);
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
      for (const [c, r] of Object.entries(countryRoles)) {
        try {
          if (r === null) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("profiles_country_roles")
              .delete()
              .eq("user_id", userId)
              .eq("country", c);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("profiles_country_roles")
              .upsert(
                { user_id: userId, country: c, role: r, created_by: currentProfile.id },
                { onConflict: "user_id,country" },
              );
          }
        } catch {
          // profiles_country_roles aún no existe: se ignora, sin romper el resto.
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
