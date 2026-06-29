import { Page } from "playwright";
import { createAdminClient } from "@/lib/db/admin";
import { closeBrowserSession, createBrowserSession, navigateToPage, checkElementExists } from "./browser-manager";
import { IDEALISTA_SELECTORS, PROPERTY_TYPE_MAP } from "./selectors";

const NEW_LISTING_URL = "https://www.idealista.com/tools/propiedad/nuevo";

export interface PublishResult {
  success: boolean;
  propertyId: string;
  idealistaPropertyId?: string;
  error?: string;
  attemptCount: number;
}

interface PropertyData {
  id: string;
  title: string;
  description: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareMeters?: number;
  address?: string;
  zone?: string;
  operation: string;
  propertyType?: string;
  features?: string[];
  photos?: Array<{ url: string; storagePath?: string }>;
}

export async function publishPropertyToIdealista(propertyId: string): Promise<PublishResult> {
  let attemptCount = 0;

  await createPendingLog(propertyId);

  try {
    const property = await fetchPropertyData(propertyId);
    if (!property) {
      await updateLog(propertyId, undefined, "failed", "Propiedad no encontrada en BD");
      return { success: false, propertyId, error: "Propiedad no encontrada", attemptCount: 0 };
    }

    // Create browser with saved cookies (session must exist)
    const session = await createBrowserSession(true);
    const { page } = session;
    attemptCount = 1;

    try {
      // Navigate to new listing form
      await navigateToPage(page, NEW_LISTING_URL);
      await page.waitForTimeout(2000);

      // Detect session expired (redirected to login)
      const currentUrl = page.url();
      if (currentUrl.includes("/login")) {
        await updateLog(propertyId, undefined, "failed", "Sesión de Idealista expirada. Re-autentícate desde Configuración.");
        return {
          success: false,
          propertyId,
          error: "Sesión de Idealista expirada. Ve a Configuración → Idealista y vuelve a conectar.",
          attemptCount,
        };
      }

      console.log("[Publisher] Form loaded, filling property data...");

      // Fill the form
      await fillPropertyType(page, property);
      await page.waitForTimeout(1000); // Wait for dynamic fields to appear

      await fillLocation(page, property);
      await fillDescription(page, property);
      await fillPublicationSettings(page);

      // Submit
      const submitted = await submitForm(page);
      if (!submitted) {
        await updateLog(propertyId, undefined, "failed", "No se pudo enviar el formulario");
        return { success: false, propertyId, error: "Error al enviar formulario", attemptCount };
      }

      // Extract Idealista property ID from redirect URL
      await page.waitForTimeout(3000);
      const idealistaId = extractIdealistaId(page.url());

      await updateLog(propertyId, idealistaId, "published");

      console.log(`[Publisher] Property ${propertyId} published as Idealista ID: ${idealistaId}`);
      return { success: true, propertyId, idealistaPropertyId: idealistaId, attemptCount };
    } finally {
      await closeBrowserSession(session);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Publisher] Error:", msg);
    await updateLog(propertyId, undefined, "failed", msg);
    return { success: false, propertyId, error: msg, attemptCount };
  }
}

async function fillPropertyType(page: Page, property: PropertyData): Promise<void> {
  const idealistaType = property.propertyType
    ? PROPERTY_TYPE_MAP[property.propertyType.toLowerCase()] ?? "Piso"
    : "Piso";

  const typeSelector = IDEALISTA_SELECTORS.form.propertyTypeLabel(idealistaType);
  if (await checkElementExists(page, typeSelector)) {
    await page.click(typeSelector);
    console.log(`[Publisher] Selected property type: ${idealistaType}`);
  } else {
    console.warn(`[Publisher] Property type label not found: ${idealistaType}`);
  }
}

async function fillLocation(page: Page, property: PropertyData): Promise<void> {
  if (!property.address) return;

  const addressParts = parseAddress(property.address);

  if (addressParts.localidad) {
    const localidadInput = await page.$(IDEALISTA_SELECTORS.form.localidadInput);
    if (localidadInput) {
      await localidadInput.fill(addressParts.localidad);
      await page.waitForTimeout(500);
      const suggestion = await page.$('[class*="autocomplete"] li:first-child, [class*="suggestion"]:first-child');
      if (suggestion) await suggestion.click();
    }
  }

  if (addressParts.calle) {
    const calleInput = await page.$(IDEALISTA_SELECTORS.form.calleInput);
    if (calleInput) {
      await calleInput.fill(addressParts.calle);
      await page.waitForTimeout(300);
    }
  }

  if (addressParts.numero) {
    const numInput = await page.$(IDEALISTA_SELECTORS.form.numeroInput);
    if (numInput) await numInput.fill(addressParts.numero);
  }

  const validarBtn = await page.$(IDEALISTA_SELECTORS.form.validarDireccionBtn);
  if (validarBtn) {
    await validarBtn.click();
    await page.waitForTimeout(2000);
  }

  console.log("[Publisher] Location filled");
}

async function fillDescription(page: Page, property: PropertyData): Promise<void> {
  const descInput = await page.$(IDEALISTA_SELECTORS.form.descriptionTextarea);
  if (descInput && property.description) {
    await descInput.fill(property.description.substring(0, 2000));
    console.log("[Publisher] Description filled");
  }
}

async function fillPublicationSettings(page: Page): Promise<void> {
  const exactaRadio = await page.$(IDEALISTA_SELECTORS.form.visibilidadExacta);
  if (exactaRadio) await exactaRadio.click();

  const publicarRadio = await page.$(IDEALISTA_SELECTORS.form.publicarIdealista);
  if (publicarRadio) await publicarRadio.click();

  console.log("[Publisher] Publication settings configured");
}

async function submitForm(page: Page): Promise<boolean> {
  try {
    const submitBtn = await page.$(IDEALISTA_SELECTORS.form.guardarPublicarBtn);
    if (!submitBtn) {
      console.error("[Publisher] Submit button not found");
      return false;
    }
    await submitBtn.click();
    await page.waitForTimeout(5000);
    return true;
  } catch (err) {
    console.error("[Publisher] Submit error:", err);
    return false;
  }
}

function extractIdealistaId(url: string): string {
  const match = url.match(/propiedad[^\d]*(\d+)/);
  return match?.[1] ?? `tmp_${Date.now()}`;
}

function parseAddress(address: string): { calle?: string; numero?: string; localidad?: string } {
  const cityMatch = address.match(/,\s*([^,]+)$/);
  const localidad = cityMatch?.[1]?.trim();

  const numMatch = address.match(/\s+(\d+[A-Za-z]?)\s*(?:,|$)/);
  const numero = numMatch?.[1];

  const calleRaw = address
    .replace(/,\s*[^,]+$/, "")
    .replace(/\s+\d+[A-Za-z]?\s*$/, "")
    .trim();

  return { calle: calleRaw || undefined, numero, localidad };
}

async function fetchPropertyData(propertyId: string): Promise<PropertyData | null> {
  const db = createAdminClient();
  try {
    const { data: p } = await db
      .from("properties")
      .select("id, title, description, price, bedrooms, bathrooms, square_meters, address, zone, operation, features")
      .eq("id", propertyId)
      .single();

    if (!p) return null;

    const { data: media } = await db
      .from("property_media")
      .select("url, storage_path")
      .eq("property_id", propertyId)
      .eq("type", "photo");

    return {
      id: (p as any).id,
      title: (p as any).title,
      description: (p as any).description ?? "",
      price: (p as any).price,
      bedrooms: (p as any).bedrooms,
      bathrooms: (p as any).bathrooms,
      squareMeters: (p as any).square_meters,
      address: (p as any).address,
      zone: (p as any).zone,
      operation: (p as any).operation,
      features: (p as any).features ?? [],
      photos: media?.map((m: any) => ({ url: m.url, storagePath: m.storage_path })) ?? [],
    };
  } catch (err) {
    console.error("[Publisher] fetchPropertyData error:", err);
    return null;
  }
}

async function createPendingLog(propertyId: string): Promise<void> {
  const db = createAdminClient();
  try {
    const { data: existing } = await (db as any)
      .from("idealista_publish_log")
      .select("id, attempt_count")
      .eq("property_id", propertyId)
      .single();

    if (!existing) {
      await (db as any).from("idealista_publish_log").insert({
        property_id: propertyId,
        status: "pending",
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      });
    } else {
      await (db as any).from("idealista_publish_log").update({
        status: "pending",
        last_attempt_at: new Date().toISOString(),
        attempt_count: (existing as any).attempt_count + 1,
      }).eq("id", (existing as any).id);
    }
  } catch (err) {
    console.error("[Publisher] createPendingLog error:", err);
  }
}

async function updateLog(
  propertyId: string,
  idealistaPropertyId: string | undefined,
  status: "pending" | "published" | "failed",
  errorMessage?: string
): Promise<void> {
  const db = createAdminClient();
  try {
    await (db as any)
      .from("idealista_publish_log")
      .update({
        idealista_property_id: idealistaPropertyId,
        status,
        error_message: errorMessage ?? null,
        last_attempt_at: new Date().toISOString(),
        published_at: status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("property_id", propertyId);
  } catch (err) {
    console.error("[Publisher] updateLog error:", err);
  }
}
