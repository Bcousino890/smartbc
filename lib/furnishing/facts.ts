import { PRICE_ON_REQUEST_LABEL } from "@/lib/country-config";
import { formatPrice } from "@/lib/format";
import type { Property } from "@/lib/types";

/**
 * Datos de la vivienda que enseña el visor, sacados del REGISTRO de la
 * propiedad (nunca de la propuesta). Mismas reglas que la ficha compartida:
 * zona y ciudad, nunca la dirección exacta; precio 0 = «a consultar».
 */
export function buildFurnishingFacts(property: Property): string[] {
  const hasPrice = property.price > 0;
  const isRent = property.operation === "alquiler";
  const price = hasPrice
    ? `${formatPrice(property.price)} €${isRent ? "/mes" : ""}`
    : PRICE_ON_REQUEST_LABEL;
  const place = [property.zone, property.city].filter(Boolean).join(", ");
  return [
    [isRent ? "Alquiler" : "Venta", property.propertyTypeLabel].filter(Boolean).join(" · "),
    price,
    place,
    property.squareMeters ? `${property.squareMeters} m²` : "",
    property.bedrooms ? `${property.bedrooms} ${property.bedrooms === 1 ? "dormitorio" : "dormitorios"}` : "",
    property.bathrooms ? `${property.bathrooms} ${property.bathrooms === 1 ? "baño" : "baños"}` : "",
  ].filter((f) => f.length > 0);
}
