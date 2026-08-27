"use client";

/**
 * Caché + prefetch de /api/admin/particulares/detail.
 *
 * El listado solo trae la portada de cada anuncio; la galería completa y la
 * ficha técnica (precio/m², rebaja, planta, año, estado, energía…) las pide
 * el modal AL ABRIRSE. Eso hacía que abrir un anuncio se sintiera lento: el
 * modal aparecía con una sola foto y el resto entraba un momento después.
 *
 * Aquí se guarda la promesa (no el resultado) por id:
 *  - `prefetchParticularDetail` se dispara al pasar el ratón / tocar la
 *    tarjeta, así que para cuando se hace clic la petición suele estar ya
 *    resuelta y el modal abre con todo puesto.
 *  - Guardar la PROMESA y no el dato evita la petición duplicada cuando el
 *    hover y el clic caen casi a la vez.
 *  - Un fallo no se cachea: se borra la entrada para poder reintentar.
 *
 * Vive en memoria de la pestaña y muere con ella: son datos de solo lectura
 * que además se refrescan al recargar la página.
 */

export type ParticularDetail = Record<string, unknown> & { id: string };

const cache = new Map<string, Promise<ParticularDetail | null>>();

// Techo de seguridad: recorrer muchas páginas pasando el ratón por encima
// no debe hacer crecer el mapa sin límite. Al llegar, se vacía entero (es
// una caché de conveniencia, no una fuente de verdad).
const MAX_ENTRIES = 300;

export function prefetchParticularDetail(id: string): Promise<ParticularDetail | null> {
  const hit = cache.get(id);
  if (hit) return hit;

  if (cache.size >= MAX_ENTRIES) cache.clear();

  const p = (async () => {
    try {
      const res = await fetch(`/api/admin/particulares/detail?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        cache.delete(id);
        return null;
      }
      const data = await res.json();
      if (!data || typeof data !== "object") {
        cache.delete(id);
        return null;
      }
      return data as ParticularDetail;
    } catch {
      // Sin galería/ficha: el modal se queda con la portada. No merece
      // romper nada, pero sí permitir reintento.
      cache.delete(id);
      return null;
    }
  })();

  cache.set(id, p);
  return p;
}
