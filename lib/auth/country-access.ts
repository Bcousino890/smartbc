/**
 * A qué países del panel puede entrar un usuario. Lo usan el layout del panel
 * (`app/[country]/(admin)/layout.tsx`: redirige y decide si salen las
 * banderas) y la Guía de inicio (para explicárselo), así que las dos dicen
 * siempre lo mismo.
 *
 *   - owner/admin: los dos países, siempre.
 *   - el resto: `profiles.countries` (migración 0088); si viene vacío, su
 *     país único `profiles.country`.
 *   - `multi_country` es el booleano antiguo (hoy se deriva de
 *     `countries.length > 1`); solo decide si se enseñan las banderas.
 */
export type CountryAccessProfile = {
  role: string;
  country?: string | null;
  countries?: string[] | null;
  multi_country?: boolean | null;
};

export type CountryAccess = {
  /** Países con acceso. */
  countries: string[];
  /** País de aterrizaje (`profiles.country`, o España). */
  defaultCountry: "es" | "cl";
  /** Si el menú enseña el selector de banderas. */
  canSwitchCountry: boolean;
  isOwnerOrAdmin: boolean;
};

export function resolveCountryAccess(profile: CountryAccessProfile): CountryAccess {
  const isOwnerOrAdmin = profile.role === "admin" || profile.role === "owner";
  const defaultCountry = profile.country === "cl" ? "cl" : "es";

  let countries: string[] =
    Array.isArray(profile.countries) && profile.countries.length
      ? profile.countries
      : [profile.country ?? "es"];
  if (isOwnerOrAdmin) {
    countries = Array.from(new Set([...countries, "es", "cl"]));
  }

  const canSwitchCountry =
    isOwnerOrAdmin || Boolean(profile.multi_country) || countries.length > 1;

  return { countries, defaultCountry, canSwitchCountry, isOwnerOrAdmin };
}
