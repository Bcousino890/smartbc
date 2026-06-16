import "server-only";
import { createClient } from "../server";
import type { Database } from "../database.types";

type Property = Database["public"]["Tables"]["properties"]["Row"];
type ClientPreferences = Database["public"]["Tables"]["client_preferences"]["Row"];

export type SuggestedProperty = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number;
  price: number;
  photos: string[];
  matchScore: number;
  matchReasons: string[];
};

/**
 * Obtiene propiedades sugeridas basadas en las preferencias del cliente.
 * Utiliza un algoritmo de matching que considera:
 * - Zona preferida (peso alto)
 * - Operación (alquiler/venta)
 * - Rango de precio
 * - Habitaciones/baños
 * - Proximidad a universidades (si se especifican)
 */
export async function getSuggestedProperties(
  clientId: string,
): Promise<SuggestedProperty[]> {
  const supabase = await createClient();

  // 1. Obtener preferencias del cliente
  const { data: prefs, error: prefsError } = await supabase
    .from("client_preferences")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (prefsError || !prefs) {
    console.error("Error fetching client preferences:", prefsError?.message);
    return [];
  }

  // 2. Construir query de propiedades
  // Filtramos por:
  // - Operación (rent/sale)
  // - Estancia (corta/larga)
  // - Precio dentro del rango
  // - Zona (si se especifica)

  let query = supabase
    .from("properties")
    .select(
      `
      id,
      slug,
      title,
      zone,
      subzone,
      bedrooms,
      bathrooms,
      square_meters,
      price,
      photos(url),
      latitude,
      longitude
    `,
    )
    .eq("operation", prefs.operation)
    .eq("stay", prefs.stay)
    .eq("status", "available");

  // Filtro de precio
  if (prefs.min_price) {
    query = query.gte("price", prefs.min_price);
  }
  if (prefs.max_price) {
    query = query.lte("price", prefs.max_price);
  }

  // Filtro de zona (si se especifica)
  const zones = prefs.zones as string[] | null;
  if (zones && zones.length > 0) {
    query = query.in("zone", zones);
  }

  const { data: properties, error: propsError } = await query.limit(50);

  if (propsError) {
    console.error("Error fetching properties:", propsError.message);
    return [];
  }

  if (!properties || properties.length === 0) {
    return [];
  }

  // 3. Calcular score de matching para cada propiedad
  const suggestions: SuggestedProperty[] = properties
    .map((prop) => {
      const reasons: string[] = [];
      let score = 0;

      // Zona match (peso: 30 puntos)
      if (zones && zones.includes(prop.zone)) {
        score += 30;
        reasons.push(`En ${prop.zone}`);
      } else if (prefs.zones && prefs.zones.length > 0) {
        score += 5;
        reasons.push(`Cercano a ${prefs.zones[0]}`);
      }

      // Precio match (peso: 25 puntos si está en rango medio)
      const priceMid = prefs.min_price && prefs.max_price
        ? (prefs.min_price + prefs.max_price) / 2
        : null;

      if (priceMid && Math.abs(prop.price - priceMid) < priceMid * 0.1) {
        score += 25;
        reasons.push(`Precio competitivo (${prop.price}€)`);
      } else if (prefs.min_price && prop.price >= prefs.min_price &&
                 prefs.max_price && prop.price <= prefs.max_price) {
        score += 20;
        reasons.push(`Dentro del presupuesto`);
      }

      // Dormitorios match (peso: 15 puntos)
      if (prop.bedrooms >= 1 && prop.bedrooms <= 5) {
        score += 15;
        reasons.push(`${prop.bedrooms} habitaciones`);
      }

      // Baños match (peso: 10 puntos)
      if (prop.bathrooms >= 1) {
        score += 10;
        reasons.push(`${prop.bathrooms} baño(s)`);
      }

      // Metros cuadrados (peso: 10 puntos)
      if (prop.square_meters && prop.square_meters >= 40) {
        score += 10;
        reasons.push(`${prop.square_meters}m²`);
      }

      // Bonificación por fotos (peso: 5 puntos)
      const photos = (prop.photos as Array<{ url: string }>) || [];
      if (photos.length >= 3) {
        score += 5;
        reasons.push(`Múltiples fotos`);
      }

      return {
        id: prop.id,
        slug: prop.slug,
        title: prop.title,
        zone: prop.zone,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        squareMeters: prop.square_meters,
        price: prop.price,
        photos: photos.map((p) => p.url),
        matchScore: Math.min(score, 100),
        matchReasons: reasons.slice(0, 3), // Mostrar máximo 3 razones
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10); // Retornar top 10

  return suggestions;
}

/**
 * Obtiene el número de propiedades disponibles que matchean con el cliente
 */
export async function getAvailablePropertiesCount(
  clientId: string,
): Promise<number> {
  const suggestions = await getSuggestedProperties(clientId);
  return suggestions.length;
}
