// Galería de fotos bajo demanda de la lista de Propiedades del admin (CRM-02,
// E1). Puro: lo prueban scripts/test-admin-properties-gallery.mts.

/**
 * ¿Puede este perfil ver el admin del país `country`? Copia literal de la
 * regla con la que `app/[country]/(admin)/layout.tsx` deja entrar (o redirige)
 * a cada país: owner/admin, o el país está en `countries` (o es su `country`
 * cuando `countries` no viene). La ruta de la galería la usa para no ampliar
 * el acceso de la lista. Si la regla del layout cambia, cambia aquí también.
 */
export function canSeeAdminCountry(
  profile: { role: string; country?: string | null; countries?: unknown },
  country: string,
): boolean {
  if (profile.role === "owner" || profile.role === "admin") return true;
  const own = profile.country ?? "es";
  const countries =
    Array.isArray(profile.countries) && profile.countries.length ? (profile.countries as string[]) : [own];
  return countries.includes(country);
}

/** URL de la galería de una propiedad para el modal (solo lectura). */
export function galleryApiUrl(slug: string, country: string): string {
  return `/api/admin/properties/${encodeURIComponent(slug)}/photos?country=${encodeURIComponent(country)}`;
}

/**
 * Turnos de petición de la galería. Cada apertura (o reintento) pide un turno;
 * una respuesta solo se aplica si su turno sigue siendo el último, el modal
 * sigue abierto para la misma propiedad y nadie ha editado la galería desde
 * que se pidió. Así una respuesta tardía nunca pisa otra galería ni cambios
 * más nuevos.
 */
export function createGalleryTurns() {
  let turn = 0;
  let edits = 0;
  return {
    /** Nueva petición: devuelve el sello que hay que comprobar al responder. */
    start: (slug: string) => ({ turn: ++turn, edits, slug }),
    /** El modal se cerró o cambió de propiedad: invalida lo que esté en vuelo. */
    invalidate: () => {
      turn++;
    },
    /** Se editó la galería (subir, borrar, reordenar, portada). */
    edited: () => {
      edits++;
    },
    /** ¿Se puede aplicar la respuesta con este sello? */
    accepts: (stamp: { turn: number; edits: number; slug: string }, slug: string) =>
      stamp.turn === turn && stamp.edits === edits && stamp.slug === slug,
  };
}
