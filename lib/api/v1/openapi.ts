import { z } from "zod";
import {
  AttemptSchema,
  CaptacionBatchSchema,
  CaptacionInputSchema,
  CaptacionPatchSchema,
  ContactSchema,
  ListingSchema,
  PhotoCollectionSchema,
} from "./captaciones/schema";

/**
 * Especificación OpenAPI 3.1 generada a partir de los mismos esquemas zod que
 * validan las peticiones. Al derivarse del código no puede quedar desfasada:
 * si alguien añade un campo al contrato, aparece aquí solo.
 */

function jsonSchema(schema: z.ZodType, name: string): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown> & { title?: string; $id?: string } & { [k: string]: unknown } & {
    name?: typeof name;
  };
}

const BEARER = [{ ApiKeyAuth: [] }];

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "unauthorized",
                  "forbidden",
                  "not_found",
                  "validation_error",
                  "conflict",
                  "rate_limited",
                  "payload_too_large",
                  "unsupported_media_type",
                  "service_unavailable",
                  "internal_error",
                ],
              },
              message: { type: "string" },
              request_id: { type: "string" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
            required: ["code", "message", "request_id"],
          },
        },
      },
    },
  },
};

function okResponse(description: string, dataSchema: Record<string, unknown> = { type: "object" }) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: dataSchema,
            request_id: { type: "string" },
            meta: { type: "object" },
          },
          required: ["data", "request_id"],
        },
      },
    },
  };
}

function jsonBody(ref: string) {
  return {
    required: true,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } },
  };
}

const externalIdParam = {
  name: "external_id",
  in: "path",
  required: true,
  description: "Identificador de la captación en el sistema del proveedor.",
  schema: { type: "string" },
};

const dryRunHeader = {
  name: "X-SmartBC-Dry-Run",
  in: "header",
  required: false,
  description: "Con valor 1 se valida y se devuelve el resultado previsto sin escribir nada.",
  schema: { type: "string", enum: ["1"] },
};

const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description:
    "Clave única de la petición. Repetirla con el mismo cuerpo devuelve la respuesta original sin volver a escribir.",
  schema: { type: "string" },
};

export function buildOpenApiDocument(baseUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "SmartBC · API pública",
      version: "1.0.0",
      description: [
        "API de ingesta de SmartBC. Permite que un sistema externo cree y",
        "mantenga actualizadas las captaciones de Chile con la ficha completa:",
        "datos del anuncio, ubicación, propietario y contactos, avisos de",
        "corredoras con su histórico de precios, galería de fotos e intentos de",
        "contacto.",
        "",
        "**Autenticación**: cabecera `Authorization: Bearer <clave>`.",
        "",
        "**Deduplicación**: cada captación se identifica por `external_id`, el id",
        "que use el proveedor. Reenviar el mismo `external_id` actualiza la",
        "captación existente en vez de duplicarla.",
        "",
        "**Campos protegidos**: los datos que rellena el equipo de SmartBC",
        "(teléfono del propietario, dirección real, notas, etapa, asignación) no",
        "se sobrescriben si ya tienen valor.",
      ].join("\n"),
    },
    servers: [{ url: baseUrl }],
    security: BEARER,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "http",
          scheme: "bearer",
          description: "Clave de API con formato sbc_live_XXXXXXXX_…",
        },
      },
      schemas: {
        Captacion: jsonSchema(CaptacionInputSchema, "Captacion"),
        CaptacionPatch: jsonSchema(CaptacionPatchSchema, "CaptacionPatch"),
        CaptacionBatch: jsonSchema(CaptacionBatchSchema, "CaptacionBatch"),
        Contacto: jsonSchema(ContactSchema, "Contacto"),
        Aviso: jsonSchema(ListingSchema, "Aviso"),
        Intento: jsonSchema(AttemptSchema, "Intento"),
        Fotos: jsonSchema(PhotoCollectionSchema, "Fotos"),
      },
    },
    paths: {
      "/api/v1/ping": {
        get: {
          summary: "Comprobar credenciales",
          description: "Devuelve el cliente, sus permisos y la hora del servidor.",
          responses: { "200": okResponse("Credenciales válidas"), default: errorResponse },
        },
      },
      "/api/v1/captaciones": {
        post: {
          summary: "Crear o actualizar una captación completa",
          parameters: [dryRunHeader, idempotencyHeader],
          requestBody: jsonBody("Captacion"),
          responses: {
            "200": okResponse("Captación actualizada"),
            "201": okResponse("Captación creada"),
            default: errorResponse,
          },
        },
        get: {
          summary: "Listar las captaciones enviadas por este cliente",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "updated_since",
              in: "query",
              description: "Fecha ISO 8601: solo captaciones modificadas después.",
              schema: { type: "string", format: "date-time" },
            },
            { name: "stage", in: "query", description: "Filtra por `key` de etapa.", schema: { type: "string" } },
          ],
          responses: {
            "200": okResponse("Listado", { type: "array", items: { type: "object" } }),
            default: errorResponse,
          },
        },
      },
      "/api/v1/captaciones/batch": {
        post: {
          summary: "Crear o actualizar hasta 100 captaciones",
          description:
            "Siempre responde 200. Cada elemento lleva su propio resultado o su error: un item inválido no afecta al resto.",
          parameters: [dryRunHeader, idempotencyHeader],
          requestBody: jsonBody("CaptacionBatch"),
          responses: {
            "200": okResponse("Resultado por elemento", { type: "array", items: { type: "object" } }),
            default: errorResponse,
          },
        },
      },
      "/api/v1/captaciones/{external_id}": {
        get: {
          summary: "Ficha completa",
          description: "Devuelve la captación con contactos, fotos, avisos, histórico de precios e intentos.",
          parameters: [externalIdParam],
          responses: { "200": okResponse("Ficha completa"), default: errorResponse },
        },
        patch: {
          summary: "Actualización parcial",
          parameters: [externalIdParam, dryRunHeader, idempotencyHeader],
          requestBody: jsonBody("CaptacionPatch"),
          responses: { "200": okResponse("Captación actualizada"), default: errorResponse },
        },
        delete: {
          summary: "Baja lógica",
          description: "Mueve la captación a la etapa de rechazo. No borra nada físicamente.",
          parameters: [externalIdParam, dryRunHeader],
          responses: { "200": okResponse("Captación dada de baja"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/contactos": {
        get: {
          summary: "Listar contactos",
          parameters: [externalIdParam],
          responses: { "200": okResponse("Contactos"), default: errorResponse },
        },
        post: {
          summary: "Crear o actualizar contactos",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    contacts: { type: "array", items: { $ref: "#/components/schemas/Contacto" } },
                  },
                  required: ["contacts"],
                },
              },
            },
          },
          responses: { "200": okResponse("Contactos sincronizados"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/contactos/{contact_id}": {
        delete: {
          summary: "Eliminar un contacto",
          parameters: [
            externalIdParam,
            { name: "contact_id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": okResponse("Contacto eliminado"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/fotos": {
        get: {
          summary: "Listar fotos",
          parameters: [externalIdParam],
          responses: { "200": okResponse("Galería"), default: errorResponse },
        },
        put: {
          summary: "Sincronizar la galería",
          description:
            "Las imágenes se descargan y se re-alojan en el almacenamiento de SmartBC. Modos: sync (por defecto), append, replace.",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: jsonBody("Fotos"),
          responses: { "200": okResponse("Galería sincronizada"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/fotos/{photo_id}": {
        delete: {
          summary: "Eliminar una foto",
          parameters: [
            externalIdParam,
            { name: "photo_id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": okResponse("Foto eliminada"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/avisos": {
        get: {
          summary: "Listar avisos de corredoras",
          parameters: [externalIdParam],
          responses: { "200": okResponse("Avisos con su histórico"), default: errorResponse },
        },
        post: {
          summary: "Crear o actualizar avisos",
          description: "Deduplicado por source_url. Cada cambio de precio genera un punto de histórico.",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    listings: { type: "array", items: { $ref: "#/components/schemas/Aviso" } },
                  },
                  required: ["listings"],
                },
              },
            },
          },
          responses: { "200": okResponse("Avisos sincronizados"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/avisos/{listing_id}": {
        delete: {
          summary: "Eliminar un aviso",
          parameters: [
            externalIdParam,
            {
              name: "listing_id",
              in: "path",
              required: true,
              description: "Id interno, external_id del proveedor o la source_url codificada.",
              schema: { type: "string" },
            },
          ],
          responses: { "200": okResponse("Aviso eliminado"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/avisos/{listing_id}/precios": {
        get: {
          summary: "Histórico de precios de un aviso",
          parameters: [
            externalIdParam,
            { name: "listing_id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": okResponse("Histórico"), default: errorResponse },
        },
        post: {
          summary: "Añadir un punto al histórico",
          parameters: [
            externalIdParam,
            { name: "listing_id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    price: { type: "number" },
                    currency: { type: "string", enum: ["clp", "uf", "usd", "eur"] },
                    source: { type: "string", enum: ["portal", "broker_web"] },
                  },
                  required: ["price"],
                },
              },
            },
          },
          responses: { "201": okResponse("Precio registrado"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/intentos": {
        get: {
          summary: "Listar intentos de contacto",
          parameters: [externalIdParam],
          responses: { "200": okResponse("Intentos"), default: errorResponse },
        },
        post: {
          summary: "Registrar intentos de contacto",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    attempts: { type: "array", items: { $ref: "#/components/schemas/Intento" } },
                  },
                  required: ["attempts"],
                },
              },
            },
          },
          responses: { "201": okResponse("Intentos registrados"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/etapa": {
        post: {
          summary: "Mover de etapa",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { stage: { type: "string" }, notes: { type: "string" } },
                  required: ["stage"],
                },
              },
            },
          },
          responses: { "200": okResponse("Etapa actualizada"), default: errorResponse },
        },
      },
      "/api/v1/captaciones/{external_id}/asignar": {
        post: {
          summary: "Asignar a un usuario del equipo",
          parameters: [externalIdParam, dryRunHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { email: { type: "string", format: "email" } },
                  required: ["email"],
                },
              },
            },
          },
          responses: { "200": okResponse("Captación asignada"), default: errorResponse },
        },
      },
      "/api/v1/catalogos": {
        get: {
          summary: "Valores válidos (enums, pipelines, regiones, comunas, zonas, usuarios)",
          parameters: [
            {
              name: "tipo",
              in: "query",
              schema: {
                type: "string",
                enum: ["enums", "pipelines", "regiones", "comunas", "zonas", "usuarios"],
              },
            },
            { name: "region", in: "query", schema: { type: "string" } },
            { name: "comuna", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": okResponse("Catálogo"), default: errorResponse },
        },
      },
    },
  };
}
