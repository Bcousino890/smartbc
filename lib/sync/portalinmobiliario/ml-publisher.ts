import "server-only";
import { getValidAccessToken } from "./ml-config";

const ML_API = "https://api.mercadolibre.com";

export type MlPublishResult = {
  success: boolean;
  itemId?: string;
  permalink?: string;
  error?: string;
};

// Maps SmartBC property types to MercadoLibre Chile category IDs
const CATEGORY_MAP: Record<string, string> = {
  apartment: "MLC1459",
  house: "MLC1545",
  office: "MLC1467",
  commercial: "MLC1468",
  land: "MLC1578",
  warehouse: "MLC101719",
  parking: "MLC101720",
};

// Maps SmartBC operation types
const OPERATION_MAP: Record<string, string> = {
  sale: "Venta",
  rent: "Arriendo",
};

export type MlPropertyInput = {
  title: string;
  description: string;
  price: number;
  currency: "CLP" | "UF" | "USD";
  operation: "sale" | "rent";
  propertyType: string;
  address: string;
  commune: string;
  region: string;
  bedrooms: number;
  bathrooms: number;
  totalAreaM2?: number;
  coveredAreaM2?: number;
  parkingLots?: number;
  imageUrls: string[];
  listingType?: "free" | "bronze" | "silver" | "gold" | "gold_special";
};

export async function publishPropertyToML(
  property: MlPropertyInput
): Promise<MlPublishResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { success: false, error: "MercadoLibre no autenticado. Autoriza la app primero en /cl/admin/configuracion." };
  }

  const categoryId = CATEGORY_MAP[property.propertyType] ?? "MLC1459";
  const operationName = OPERATION_MAP[property.operation] ?? "Venta";

  const attributes: Array<{ id: string; value_name: string }> = [
    { id: "BEDROOMS", value_name: String(property.bedrooms) },
    { id: "BATHROOMS", value_name: String(property.bathrooms) },
    { id: "OPERATION", value_name: operationName },
    { id: "PROPERTY_TYPE", value_name: propertyTypeName(property.propertyType) },
    { id: "FULL_ADDRESS", value_name: `${property.address}, ${property.commune}, ${property.region}` },
  ];

  if (property.totalAreaM2) {
    attributes.push({ id: "TOTAL_AREA", value_name: String(property.totalAreaM2) });
  }
  if (property.coveredAreaM2) {
    attributes.push({ id: "COVERED_AREA", value_name: String(property.coveredAreaM2) });
  }
  if (property.parkingLots) {
    attributes.push({ id: "PARKING_LOTS", value_name: String(property.parkingLots) });
  }

  const body = {
    site_id: "MLC",
    title: property.title.slice(0, 60),
    category_id: categoryId,
    price: property.price,
    currency_id: property.currency,
    available_quantity: 1,
    buying_mode: "classified",
    listing_type_id: property.listingType ?? "gold_special",
    condition: "not_specified",
    description: { plain_text: property.description },
    pictures: property.imageUrls.slice(0, 24).map((url) => ({ source: url })),
    attributes,
    sale_terms: [{ id: "OPERATION", value_name: operationName }],
  };

  console.log(`[ml-publisher] Publishing: ${property.title.slice(0, 40)}`);

  const res = await fetch(`${ML_API}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ml-publisher] POST /items ${res.status}: ${text.slice(0, 300)}`);
    return {
      success: false,
      error: `ML API error ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as any;
  console.log(`[ml-publisher] ✓ Published: ${data.id} → ${data.permalink}`);

  return {
    success: true,
    itemId: data.id,
    permalink: data.permalink,
  };
}

export async function updatePropertyInML(
  mlItemId: string,
  updates: Partial<Pick<MlPropertyInput, "title" | "price" | "description" | "imageUrls">>
): Promise<MlPublishResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { success: false, error: "MercadoLibre no autenticado" };
  }

  const body: Record<string, any> = {};
  if (updates.title) body.title = updates.title.slice(0, 60);
  if (updates.price !== undefined) body.price = updates.price;
  if (updates.description) body.description = { plain_text: updates.description };
  if (updates.imageUrls) body.pictures = updates.imageUrls.map((url) => ({ source: url }));

  const res = await fetch(`${ML_API}/items/${mlItemId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[ml-publisher] PUT /items/${mlItemId} ${res.status}: ${text.slice(0, 200)}`);
    return { success: false, error: `ML API error ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as any;
  return { success: true, itemId: data.id, permalink: data.permalink };
}

export async function unpublishPropertyFromML(mlItemId: string): Promise<MlPublishResult> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { success: false, error: "MercadoLibre no autenticado" };
  }

  // ML uses status=closed to archive/unpublish
  const res = await fetch(`${ML_API}/items/${mlItemId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: "closed" }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `ML API error ${res.status}: ${text.slice(0, 200)}` };
  }

  return { success: true, itemId: mlItemId };
}

function propertyTypeName(type: string): string {
  const names: Record<string, string> = {
    apartment: "Departamento",
    house: "Casa",
    office: "Oficina",
    commercial: "Local comercial",
    land: "Terreno",
    warehouse: "Bodega",
    parking: "Estacionamiento",
  };
  return names[type] ?? "Departamento";
}
