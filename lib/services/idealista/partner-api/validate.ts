import "server-only";
import { join } from "node:path";
import {
  createFsSchemaStore,
  formatSchemaIssues,
  validateAgainstSchema,
  type SchemaStore,
} from "./schema-validator";

// Validación del payload contra los JSON Schema oficiales ANTES de llamar a
// Idealista. Es barato y evita quemar llamadas (y huecos) con cuerpos que ya
// sabemos que van a devolver 400.

const SCHEMAS_ROOT = join(process.cwd(), "lib", "services", "idealista", "partner-api", "schemas");

let store: SchemaStore | null = null;
let storeFailed = false;

function getStore(): SchemaStore | null {
  if (store) return store;
  if (storeFailed) return null;
  try {
    const candidate = createFsSchemaStore(SCHEMAS_ROOT);
    // Prueba de humo: si los .json no están donde creemos, mejor saberlo aquí.
    candidate.load("property/property_create.json");
    store = candidate;
    return store;
  } catch (err) {
    // Que no se pueda validar en local no debe impedir publicar: Idealista
    // validará igualmente. Se anota y se sigue.
    console.error("[idealista-api] No se pudieron cargar los JSON Schema para validar:", err);
    storeFailed = true;
    return null;
  }
}

export interface PayloadValidation {
  /** `false` sólo cuando el schema dice que el cuerpo está mal. */
  valid: boolean;
  errors: string[];
  /** `true` si no se pudo cargar el contrato y no se ha validado nada. */
  skipped: boolean;
}

function validateWith(value: unknown, schemaPath: string): PayloadValidation {
  const activeStore = getStore();
  if (!activeStore) return { valid: true, errors: [], skipped: true };

  try {
    const issues = validateAgainstSchema(value, schemaPath, activeStore);
    return { valid: issues.length === 0, errors: formatSchemaIssues(issues), skipped: false };
  } catch (err) {
    console.error(`[idealista-api] Falló la validación contra ${schemaPath}:`, err);
    return { valid: true, errors: [], skipped: true };
  }
}

export const validatePropertyCreate = (payload: unknown): PayloadValidation =>
  validateWith(payload, "property/property_create.json");

export const validatePropertyModify = (payload: unknown): PayloadValidation =>
  validateWith(payload, "property/property_modify.json");

export const validateContact = (payload: unknown): PayloadValidation =>
  validateWith(payload, "contact/contact_create.json");

export const validateImages = (payload: unknown): PayloadValidation =>
  validateWith(payload, "image/images_process.json");

export const validateVideo = (payload: unknown): PayloadValidation =>
  validateWith(payload, "video/video_create.json");

export const validateVirtualTour = (payload: unknown): PayloadValidation =>
  validateWith(payload, "virtualtour/virtualtour_create.json");
