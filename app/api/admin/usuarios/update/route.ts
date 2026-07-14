import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { logPermissionEvent } from "@/lib/db/queries/audit";

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
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const { userId, firstName, lastName, phone, role, password, country, multiCountry, countries } = body;

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

  const updates: Record<string, string | boolean | string[]> = {};
  if (firstName !== undefined || lastName !== undefined) {
    const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    if (fullName) updates.full_name = fullName;
  }
  if (role !== undefined) updates.role = role;
  if (phone !== undefined) updates.phone = phone;

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

    // Escritura defensiva: si la columna `countries` aún no existe en el VPS,
    // reintentamos sin ella conservando country + multi_country (derivados).
    if (error && hasCountries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
      const { countries: _omitCountries, ...fallbackUpdates } = updates;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (supabase as any)
        .from("profiles")
        .update(fallbackUpdates)
        .eq("id", userId));
    }

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
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
