// Centralizes CSS/XPath selectors for Idealista form elements
// These need to be maintained if Idealista changes their DOM structure

export const IDEALISTA_SELECTORS = {
  // Login page
  login: {
    emailInput: 'input[name="email"], input[type="email"]',
    passwordInput: 'input[name="password"], input[type="password"]',
    submitButton: 'button[type="submit"], button:has-text("Entrar")',
  },

  // Property listing form (main form)
  form: {
    // Basic info tab
    titleInput: 'input[name="title"], input[placeholder*="título" i]',
    descriptionInput: 'textarea[name="description"], textarea[placeholder*="descripción" i]',
    priceInput: 'input[name="price"], input[name="precio"], input[type="number"]',

    // Property details
    operationType: 'select[name="operationType"], select[name="operation"]', // rent | sale
    propertyType: 'select[name="propertyType"], select[name="type"]', // apartment, house, etc
    bedrooms: 'input[name="bedrooms"], select[name="bedrooms"]',
    bathrooms: 'input[name="bathrooms"], select[name="bathrooms"]',
    squareMeters: 'input[name="squareMeters"], input[name="size"]',

    // Location
    street: 'input[name="street"], input[placeholder*="calle" i]',
    number: 'input[name="number"], input[placeholder*="número" i]',
    city: 'input[name="city"], select[name="city"]',
    postalCode: 'input[name="postalCode"], input[placeholder*="código postal" i]',
    district: 'select[name="district"]',
    neighborhood: 'select[name="neighborhood"]',

    // Features/Amenities (checkboxes)
    pool: 'input[name="pool"][type="checkbox"]',
    garden: 'input[name="garden"][type="checkbox"]',
    parking: 'input[name="parking"][type="checkbox"]',
    balcony: 'input[name="balcony"][type="checkbox"]',
    terrace: 'input[name="terrace"][type="checkbox"]',
    airConditioning: 'input[name="airConditioning"][type="checkbox"]',
    heating: 'input[name="heating"][type="checkbox"]',
    storage: 'input[name="storage"][type="checkbox"]',

    // Energy certificate
    energyPerformance: 'select[name="energyPerformance"]',
    emissionRating: 'select[name="emissionRating"]',

    // Photos/Media section
    photoUploadButton: 'button:has-text("Añadir fotos"), label:has-text("Fotos"), input[type="file"][accept*="image"]',
    videoUploadButton: 'button:has-text("Añadir video"), input[type="file"][accept*="video"]',
    planUploadButton: 'button:has-text("Planos"), input[type="file"][accept*="pdf"]',

    // Action buttons
    publishButton: 'button:has-text("Publicar"), button[type="submit"]:has-text("Publicar")',
    saveButton: 'button:has-text("Guardar"), button[type="submit"]:has-text("Guardar")',
    nextButton: 'button:has-text("Siguiente"), button[type="button"]:has-text("Siguiente")',
    prevButton: 'button:has-text("Anterior"), button[type="button"]:has-text("Anterior")',

    // Rental specific
    rentalType: 'select[name="rentalType"], input[name="rentalType"]', // long-term | short-term
  },

  // Success/Error states
  feedback: {
    successMessage: '.success-message, [class*="success"], text=/publicado|éxito/i',
    errorMessage: '.error-message, [class*="error"], text=/error|falló/i',
    captchaElement: 'iframe[src*="recaptcha"], [class*="captcha"]',
    loadingSpinner: '[class*="loading"], [class*="spinner"]',
  },

  // Navigation
  navigation: {
    dashboard: 'a[href*="/mis-anuncios"], a[href*="/dashboard"]',
    myListings: 'a[href*="/mis-anuncios"]',
  },
};

export type IdealistaSelector = keyof typeof IDEALISTA_SELECTORS;

// Helper to get selector fallback chain
export function getSelector(path: string): string[] {
  const keys = path.split(".");
  let obj: any = IDEALISTA_SELECTORS;

  for (const key of keys) {
    obj = obj[key];
    if (!obj) return [];
  }

  return typeof obj === "string" ? [obj] : [];
}
