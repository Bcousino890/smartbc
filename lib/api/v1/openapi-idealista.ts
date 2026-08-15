import { z } from "zod";
import {
  IdealistaBatchSchema,
  IdealistaHeartbeatSchema,
  IdealistaLinkSchema,
  IdealistaListingSchema,
  IdealistaObservationSchema,
  IdealistaPhoneSchema,
  IdealistaPhotoSchema,
  IdealistaRunSchema,
} from "./idealista/schema";

/**
 * Bloque OpenAPI de la ingesta del scraper de Idealista.
 *
 * Vive aparte del de captaciones porque son dos contratos con dos consumidores
 * distintos (el proveedor de Chile y el scraper de España), pero se publica en
 * el mismo documento: un solo `GET /api/v1/openapi` del que cualquiera de los
 * dos genera su cliente.
 *
 * Se deriva de los mismos esquemas zod que validan las peticiones, así que no
 * puede quedar desfasado: si alguien añade un campo al contrato, aparece aquí
 * solo.
 */

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
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
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
              request_id: { type: "string" },
            },
          },
        },
      },
    },
  },
};

function okResponse(description: string, dataSchema?: Record<string, unknown>) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: dataSchema ?? { type: "object" },
            request_id: { type: "string" },
            meta: { type: "object" },
          },
        },
      },
    },
  };
}

const listingSaved = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    idealista_id: { type: "string" },
    action: {
      type: "string",
      enum: ["created", "updated", "unchanged"],
      description:
        "unchanged significa que el payload era idéntico al último recibido: no se ha escrito nada ni se han emitido eventos.",
    },
    internal_id: { type: "string", format: "uuid" },
    events_created: {
      type: "array",
      items: { type: "string" },
      description: "Cambios detectados en este envío (PRICE_DOWN, PHOTOS_CHANGED…).",
    },
    sections: {
      type: "object",
      properties: {
        photos: { type: "object" },
        phones: { type: "object" },
        links: { type: "object" },
        observations: { type: "object" },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    dry_run: { type: "boolean" },
  },
};

export const IDEALISTA_SCHEMAS: Record<string, unknown> = {
  IdealistaListing: jsonSchema(IdealistaListingSchema),
  IdealistaBatch: jsonSchema(IdealistaBatchSchema),
  IdealistaPhoto: jsonSchema(IdealistaPhotoSchema),
  IdealistaPhone: jsonSchema(IdealistaPhoneSchema),
  IdealistaLink: jsonSchema(IdealistaLinkSchema),
  IdealistaObservation: jsonSchema(IdealistaObservationSchema),
  IdealistaHeartbeat: jsonSchema(IdealistaHeartbeatSchema),
  IdealistaRun: jsonSchema(IdealistaRunSchema),
  IdealistaListingSaved: listingSaved,
};

export const IDEALISTA_PATHS: Record<string, unknown> = {
  "/api/v1/idealista/listings": {
    post: {
      summary: "Crear o actualizar un anuncio",
      description: [
        "Ingesta de un anuncio del mercado de Idealista.",
        "",
        "**Deduplicación**: por `idealista_id`. Reenviar el mismo anuncio lo",
        "actualiza; si el contenido es idéntico devuelve `unchanged` sin escribir.",
        "",
        "**Ausente ≠ null**: un campo que no se envía NO se toca; un campo a",
        "`null` se borra. Así un envío parcial (solo precio) no vacía la ficha.",
        "",
        "**Fotos**: las URLs se normalizan al perfil del CDN que Idealista sirve",
        "sin marca de agua. Da igual el perfil que se envíe.",
      ].join("\n"),
      tags: ["Idealista · ingesta"],
      security: BEARER,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdealistaListing" } } },
      },
      responses: {
        "200": okResponse("Anuncio actualizado o sin cambios", {
          $ref: "#/components/schemas/IdealistaListingSaved",
        }),
        "201": okResponse("Anuncio creado", {
          $ref: "#/components/schemas/IdealistaListingSaved",
        }),
        default: errorResponse,
      },
    },
    get: {
      summary: "Listar anuncios ingeridos",
      description:
        "Reconciliación y cola de refresco. Cursor opaco en `meta.next_cursor`.",
      tags: ["Idealista · ingesta"],
      security: BEARER,
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200 } },
        { name: "cursor", in: "query", schema: { type: "string" } },
        {
          name: "status",
          in: "query",
          schema: { type: "string", enum: ["active", "missing", "off_market"] },
        },
        {
          name: "advertiser_type",
          in: "query",
          schema: { type: "string", enum: ["particular", "professional", "unknown"] },
        },
        { name: "updated_since", in: "query", schema: { type: "string", format: "date-time" } },
        {
          name: "stale_hours",
          in: "query",
          description: "Solo los que no se scrapean en detalle desde hace N horas.",
          schema: { type: "integer", minimum: 1 },
        },
      ],
      responses: { "200": okResponse("Listado"), default: errorResponse },
    },
  },

  "/api/v1/idealista/listings/batch": {
    post: {
      summary: "Crear o actualizar hasta 200 anuncios",
      description: [
        "Responde **siempre 200**. Cada elemento trae su propio resultado o su",
        "propio error con el índice, de modo que un anuncio mal formado no tumbe",
        "el resto del lote.",
      ].join("\n"),
      tags: ["Idealista · ingesta"],
      security: BEARER,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdealistaBatch" } } },
      },
      responses: { "200": okResponse("Resultado por elemento"), default: errorResponse },
    },
  },

  "/api/v1/idealista/config": {
    get: {
      summary: "Leer la configuración del scraper",
      description: [
        "Frecuencias, umbrales y cuotas que debe respetar el scraper. Se editan",
        "en el panel de SmartBC.",
        "",
        "`version` sube en cada cambio: basta con comparar ese entero para saber",
        "si hay que releer. `scraping_enabled: false` significa parada inmediata.",
      ].join("\n"),
      tags: ["Idealista · control"],
      security: BEARER,
      responses: { "200": okResponse("Configuración vigente"), default: errorResponse },
    },
  },

  "/api/v1/idealista/heartbeat": {
    post: {
      summary: "Reportar que el scraper sigue vivo",
      description: [
        "Una fila por `worker_id`, siempre la misma: es el último estado conocido,",
        "no un log.",
        "",
        "La respuesta incluye `config_version` y `scraping_enabled`, así que el",
        "heartbeat vale también como sondeo de configuración.",
      ].join("\n"),
      tags: ["Idealista · control"],
      security: BEARER,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdealistaHeartbeat" } } },
      },
      responses: { "200": okResponse("Heartbeat registrado"), default: errorResponse },
    },
  },

  "/api/v1/idealista/runs": {
    post: {
      summary: "Abrir, actualizar o cerrar una ejecución",
      description: [
        "Upsert por `external_run_id`: el mismo id con `status: \"running\"` y luego",
        "con `status: \"completed\"` actualiza el mismo run en vez de crear dos.",
        "",
        "No hay endpoints separados de start/finish a propósito: con uno solo, un",
        "reintento tras un timeout no puede duplicar el run ni dejar uno huérfano.",
      ].join("\n"),
      tags: ["Idealista · control"],
      security: BEARER,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/IdealistaRun" } } },
      },
      responses: {
        "200": okResponse("Ejecución actualizada"),
        "201": okResponse("Ejecución creada"),
        default: errorResponse,
      },
    },
    get: {
      summary: "Últimas ejecuciones",
      tags: ["Idealista · control"],
      security: BEARER,
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "run_type", in: "query", schema: { type: "string" } },
      ],
      responses: { "200": okResponse("Listado de ejecuciones"), default: errorResponse },
    },
  },
};
