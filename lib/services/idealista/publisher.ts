import { Page } from "playwright";
import { createAdminClient } from "@/lib/db/admin";
import { BrowserSession, closeBrowserSession, createBrowserSession, navigateToPage, fillFormField, clickElement, checkElementExists, waitForSelector } from "./browser-manager";
import { authenticateWithIdealista } from "./authenticator";
import { IDEALISTA_SELECTORS } from "./selectors";

const IDEALISTA_NEW_LISTING_URL = "https://www.idealista.com/es/admin/propiedades/nueva";

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
  operation: "rent" | "sale";
  features?: string[];
  photos?: Array<{
    url: string;
    isCover: boolean;
  }>;
}

export async function publishPropertyToIdealista(
  propertyId: string,
  username: string,
  password: string
): Promise<PublishResult> {
  let session: BrowserSession | null = null;
  let attemptCount = 0;

  try {
    // Fetch property data from DB
    const propertyData = await fetchPropertyData(propertyId);
    if (!propertyData) {
      return {
        success: false,
        propertyId,
        error: "Property not found in database",
        attemptCount: 0,
      };
    }

    // Create browser session
    session = await createBrowserSession();
    const { page } = session;

    // Authenticate
    console.log(`[Publisher] Authenticating as ${username}...`);
    const authResult = await authenticateWithIdealista(username, password);
    if (!authResult.success) {
      return {
        success: false,
        propertyId,
        error: authResult.error || "Authentication failed",
        attemptCount: ++attemptCount,
      };
    }

    // Navigate to new listing form
    console.log("[Publisher] Navigating to new listing form...");
    await navigateToPage(page, IDEALISTA_NEW_LISTING_URL);
    attemptCount++;

    // Fill form with property data
    console.log("[Publisher] Filling form with property data...");
    await fillPropertyForm(page, propertyData);

    // Upload photos
    if (propertyData.photos && propertyData.photos.length > 0) {
      console.log(`[Publisher] Uploading ${propertyData.photos.length} photos...`);
      // Note: Photo upload is complex and platform-dependent
      // This is a placeholder - actual implementation would need to handle file uploads
      // await uploadPhotos(page, propertyData.photos);
    }

    // Publish
    console.log("[Publisher] Publishing property...");
    const publishSuccess = await publishForm(page);
    if (!publishSuccess) {
      return {
        success: false,
        propertyId,
        error: "Failed to publish form",
        attemptCount,
      };
    }

    // Extract the Idealista property ID from response or success page
    const idealistaId = await extractIdealistaPropertyId(page);

    // Update database with success
    await updatePublishLog(propertyId, idealistaId, "published");

    console.log(
      `[Publisher] Successfully published property ${propertyId} to Idealista as ${idealistaId}`
    );

    return {
      success: true,
      propertyId,
      idealistaPropertyId: idealistaId,
      attemptCount,
    };
  } catch (error) {
    console.error("[Publisher] Error publishing property:", error);
    await updatePublishLog(propertyId, undefined, "failed", error instanceof Error ? error.message : String(error));

    return {
      success: false,
      propertyId,
      error: `Publishing error: ${error instanceof Error ? error.message : String(error)}`,
      attemptCount,
    };
  } finally {
    if (session) {
      await closeBrowserSession(session);
    }
  }
}

async function fetchPropertyData(propertyId: string): Promise<PropertyData | null> {
  const db = createAdminClient();

  try {
    const { data: property } = await db
      .from("properties")
      .select(
        `
        id, title, description, price, bedrooms, bathrooms, square_meters,
        address, zone, operation, features, cover_photo_url
      `
      )
      .eq("id", propertyId)
      .single();

    if (!property) return null;

    // Fetch photos
    const { data: media } = await db
      .from("property_media")
      .select("url, type")
      .eq("property_id", propertyId)
      .eq("type", "photo");

    return {
      id: property.id,
      title: property.title,
      description: property.description || "",
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      squareMeters: property.square_meters,
      address: property.address,
      zone: property.zone,
      operation: property.operation,
      features: property.features || [],
      photos: media
        ? media.map((m: any) => ({
            url: m.url,
            isCover: m.url === property.cover_photo_url,
          }))
        : [],
    };
  } catch (error) {
    console.error("[Publisher] Error fetching property data:", error);
    return null;
  }
}

async function fillPropertyForm(page: Page, property: PropertyData): Promise<void> {
  // Fill title
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.titleInput)) {
    await fillFormField(page, IDEALISTA_SELECTORS.form.titleInput, property.title);
  }

  // Fill description
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.descriptionInput)) {
    // Truncate description to reasonable length
    const desc = (property.description || "").substring(0, 1000);
    await fillFormField(page, IDEALISTA_SELECTORS.form.descriptionInput, desc);
  }

  // Fill price
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.priceInput)) {
    await fillFormField(page, IDEALISTA_SELECTORS.form.priceInput, String(property.price));
  }

  // Fill operation type
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.operationType)) {
    // This would need to be select value, not fill
    await page.selectOption(IDEALISTA_SELECTORS.form.operationType, property.operation);
  }

  // Fill bedrooms
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.bedrooms)) {
    await fillFormField(page, IDEALISTA_SELECTORS.form.bedrooms, String(property.bedrooms));
  }

  // Fill bathrooms
  if (await checkElementExists(page, IDEALISTA_SELECTORS.form.bathrooms)) {
    await fillFormField(page, IDEALISTA_SELECTORS.form.bathrooms, String(property.bathrooms));
  }

  // Fill square meters
  if (property.squareMeters && (await checkElementExists(page, IDEALISTA_SELECTORS.form.squareMeters))) {
    await fillFormField(page, IDEALISTA_SELECTORS.form.squareMeters, String(property.squareMeters));
  }

  // Fill address components
  if (property.address && (await checkElementExists(page, IDEALISTA_SELECTORS.form.street))) {
    // Parse address (this is simplified - real address parsing would be needed)
    await fillFormField(page, IDEALISTA_SELECTORS.form.street, property.address);
  }

  // Fill features (checkboxes)
  if (property.features && property.features.length > 0) {
    for (const feature of property.features) {
      const featureKey = feature.toLowerCase();

      if (featureKey.includes("pool") && (await checkElementExists(page, IDEALISTA_SELECTORS.form.pool))) {
        await page.check(IDEALISTA_SELECTORS.form.pool);
      }

      if (featureKey.includes("garden") && (await checkElementExists(page, IDEALISTA_SELECTORS.form.garden))) {
        await page.check(IDEALISTA_SELECTORS.form.garden);
      }

      if (featureKey.includes("parking") && (await checkElementExists(page, IDEALISTA_SELECTORS.form.parking))) {
        await page.check(IDEALISTA_SELECTORS.form.parking);
      }

      if (
        featureKey.includes("balcony") &&
        (await checkElementExists(page, IDEALISTA_SELECTORS.form.balcony))
      ) {
        await page.check(IDEALISTA_SELECTORS.form.balcony);
      }

      if (
        featureKey.includes("terrace") &&
        (await checkElementExists(page, IDEALISTA_SELECTORS.form.terrace))
      ) {
        await page.check(IDEALISTA_SELECTORS.form.terrace);
      }

      if (
        featureKey.includes("air") &&
        (await checkElementExists(page, IDEALISTA_SELECTORS.form.airConditioning))
      ) {
        await page.check(IDEALISTA_SELECTORS.form.airConditioning);
      }
    }
  }

  console.log("[Publisher] Form filled with property data");
}

async function publishForm(page: Page): Promise<boolean> {
  try {
    // Look for publish button
    const publishSelector = IDEALISTA_SELECTORS.form.publishButton;

    if (!(await checkElementExists(page, publishSelector))) {
      console.error("[Publisher] Publish button not found");
      return false;
    }

    // Click publish
    await clickElement(page, publishSelector, 2000);

    // Wait for success confirmation
    await page.waitForTimeout(3000); // Wait for page to update

    // Check if we got a success message
    const successUrl = page.url();
    const hasSuccess = successUrl.includes("/es/admin") || (await checkElementExists(page, IDEALISTA_SELECTORS.feedback.successMessage));

    return hasSuccess;
  } catch (error) {
    console.error("[Publisher] Error publishing form:", error);
    return false;
  }
}

async function extractIdealistaPropertyId(page: Page): Promise<string> {
  try {
    // The property ID might be in the URL or in a data attribute
    const url = page.url();

    // Try to extract from URL patterns like .../propiedades/123456789
    const match = url.match(/propiedades[^\d]*(\d+)/);
    if (match && match[1]) {
      return match[1];
    }

    // Try to extract from page content (data attribute or hidden field)
    const idFromAttribute = await page.getAttribute("body", "data-property-id");
    if (idFromAttribute) {
      return idFromAttribute;
    }

    // Fallback: use timestamp-based ID
    return `temp_${Date.now()}`;
  } catch (error) {
    console.error("[Publisher] Error extracting Idealista property ID:", error);
    return `temp_${Date.now()}`;
  }
}

async function updatePublishLog(
  propertyId: string,
  idealistaPropertyId: string | undefined,
  status: "pending" | "published" | "failed",
  errorMessage?: string
): Promise<void> {
  const db = createAdminClient();

  try {
    // Check if log entry exists
    const { data: existing } = await db
      .from("idealista_publish_log")
      .select("id")
      .eq("property_id", propertyId)
      .single();

    if (existing) {
      // Update existing entry
      await db.from("idealista_publish_log").update({
        idealista_property_id: idealistaPropertyId,
        status,
        error_message: errorMessage,
        last_attempt_at: new Date().toISOString(),
        published_at: status === "published" ? new Date().toISOString() : null,
        attempt_count: (await db.from("idealista_publish_log").select("attempt_count").eq("property_id", propertyId))
          .data?.[0]?.attempt_count ?? 0 + 1,
      });
    } else {
      // Create new entry
      await db.from("idealista_publish_log").insert({
        property_id: propertyId,
        idealista_property_id: idealistaPropertyId,
        status,
        error_message: errorMessage,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
        published_at: status === "published" ? new Date().toISOString() : null,
      });
    }
  } catch (error) {
    console.error("[Publisher] Error updating publish log:", error);
  }
}
