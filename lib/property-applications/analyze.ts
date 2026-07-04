import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { upsertScore } from "@/lib/db/queries/property-applications";
import { calculateScore } from "./scoring";
import type { AiDocumentAnalysis, PropertyApplicationDocument } from "./types";

export const APPLICATION_DOCS_BUCKET = "property-application-documents";

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    readability: { type: "string", enum: ["clear", "partially_clear", "unclear"] },
    completeness: { type: "integer", minimum: 0, maximum: 100 },
    document_type_detected: { type: "string" },
    income_amount: { type: ["number", "null"] },
    income_currency: { type: ["string", "null"] },
    warnings: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
    is_valid: { type: "boolean" },
    extracted_data: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        document_number: { type: ["string", "null"] },
        expiry_date: { type: ["string", "null"] },
        employer: { type: ["string", "null"] },
        salary: { type: ["string", "null"] },
      },
      required: ["name", "document_number", "expiry_date", "employer", "salary"],
      additionalProperties: false,
    },
  },
  required: [
    "readability",
    "completeness",
    "document_type_detected",
    "income_amount",
    "income_currency",
    "warnings",
    "recommendation",
    "is_valid",
    "extracted_data",
  ],
  additionalProperties: false,
} as const;

type DocumentForAnalysis = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  status: string;
  property_application_id: string;
  document_type: {
    display_name: string;
    document_key: string;
    validation_rules: Record<string, unknown> | null;
    help_text: string | null;
  } | null;
  application: {
    country: "ES" | "CL";
    operation: "rent" | "sale";
  } | null;
};

function first<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

/**
 * Analiza un documento subido con el proveedor de IA configurado
 * (Configuración → IA). Guarda el resultado en ai_analysis, ajusta el
 * estado del documento cuando el veredicto es claro y recalcula el score
 * de la solicitud. Devuelve el análisis o el error (best-effort: nunca lanza).
 */
export async function analyzeDocument(
  documentId: string
): Promise<{ ok: boolean; analysis?: AiDocumentAnalysis; error?: string }> {
  const admin = createAdminClient();
  try {
    const { data: raw, error: fetchError } = await admin
      .from("property_application_documents")
      .select(
        `id, storage_path, file_name, mime_type, status, property_application_id,
        document_type:property_application_document_types(display_name, document_key, validation_rules, help_text),
        application:property_application_id(country, operation)`
      )
      .eq("id", documentId)
      .single();
    if (fetchError || !raw) {
      return { ok: false, error: "Documento no encontrado" };
    }

    const rawDoc = raw as unknown as Record<string, unknown>;
    const doc: DocumentForAnalysis = {
      ...(rawDoc as unknown as DocumentForAnalysis),
      document_type: first(rawDoc.document_type),
      application: first(rawDoc.application),
    };

    const ext = doc.file_name.split(".").pop()?.toLowerCase() ?? "";
    const mime = doc.mime_type || EXT_MIME[ext] || "";
    if (!mime.startsWith("image/") && mime !== "application/pdf") {
      const analysis: AiDocumentAnalysis = {
        readability: "unclear",
        completeness: 0,
        document_type_detected: "Formato no soportado",
        extracted_data: {},
        warnings: ["Formato de archivo no soportado para análisis automático — revisión manual necesaria"],
        is_valid: false,
        recommendation: "Revisar manualmente",
      };
      await saveAnalysis(documentId, analysis);
      return { ok: true, analysis };
    }

    // Descargar el archivo desde el storage self-hosted (no depende de URL pública)
    const { data: blob, error: downloadError } = await admin.storage
      .from(APPLICATION_DOCS_BUCKET)
      .download(doc.storage_path);
    if (downloadError || !blob) {
      console.error("[analyze-doc] Download error:", downloadError);
      return { ok: false, error: "No se pudo descargar el archivo del storage" };
    }
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    const country = doc.application?.country ?? "ES";
    const operation = doc.application?.operation ?? "rent";
    const countryLabel = country === "CL" ? "Chile" : "España";
    const currencyNote = country === "CL"
      ? "Todos los importes deben estar en pesos chilenos (CLP). Añade una advertencia si detectas USD o EUR."
      : "Todos los importes deben estar en euros (EUR).";
    const docType = doc.document_type;

    const system = `Eres un experto en verificación de documentación inmobiliaria de ${countryLabel}.
Analiza el documento adjunto de tipo "${docType?.display_name ?? "desconocido"}" para una solicitud de ${operation === "rent" ? "alquiler" : "compra"}.

${currencyNote}
${docType?.validation_rules ? `Requisitos de validación: ${JSON.stringify(docType.validation_rules)}` : ""}
${docType?.help_text ? `Contexto para el solicitante: ${docType.help_text}` : ""}

Reglas:
- "income_amount": ingreso NETO MENSUAL detectado (número, sin separadores) o null si no aplica.
- "income_currency": moneda del ingreso detectado (CLP, EUR, USD) o null.
- "completeness": 0-100 según cuánta información requerida contiene.
- "is_valid": true solo si el documento corresponde al tipo pedido, es legible y está vigente.
- "warnings": lista de problemas concretos (caducado, borroso, moneda incorrecta, tipo distinto, datos tapados...).
- "recommendation": recomendación breve en español para el revisor.
Responde ÚNICAMENTE con el JSON pedido, sin markdown ni explicaciones.`;

    const rawText = await aiComplete({
      system,
      userText: "Analiza este documento y responde solo con el JSON.",
      files: [{ mime, base64 }],
      maxTokens: 1200,
      jsonSchema: ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
    });

    const jsonMatch = rawText.replace(/```(?:json)?/g, "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: "La IA no devolvió un JSON válido" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as AiDocumentAnalysis;
    const analysis: AiDocumentAnalysis = {
      readability: parsed.readability ?? "unclear",
      completeness: Math.max(0, Math.min(100, Number(parsed.completeness) || 0)),
      document_type_detected: parsed.document_type_detected ?? "—",
      extracted_data: parsed.extracted_data ?? {},
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      is_valid: Boolean(parsed.is_valid),
      recommendation: parsed.recommendation ?? "",
      income_amount: typeof parsed.income_amount === "number" ? parsed.income_amount : undefined,
      income_currency: parsed.income_currency ?? undefined,
    };

    await saveAnalysis(documentId, analysis);

    // Auto-estado solo sobre documentos aún pendientes (no pisa decisiones del admin)
    if (doc.status === "pending") {
      if (analysis.is_valid && analysis.readability === "clear" && analysis.completeness >= 80) {
        await setDocumentStatus(documentId, "verified", "Verificado automáticamente por análisis IA");
      } else if (!analysis.is_valid || analysis.readability === "unclear") {
        await setDocumentStatus(documentId, "needs_correction", analysis.warnings[0] ?? "Revisión necesaria según análisis IA");
      }
    }

    await recalculateApplicationScore(doc.property_application_id);
    return { ok: true, analysis };
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      console.warn("[analyze-doc] IA no configurada:", err.message);
      return { ok: false, error: err.message };
    }
    console.error("[analyze-doc] Error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error analizando el documento" };
  }
}

async function saveAnalysis(documentId: string, analysis: AiDocumentAnalysis) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("property_application_documents")
    .update({ ai_analysis: analysis })
    .eq("id", documentId);
  if (error) throw error;
}

async function setDocumentStatus(documentId: string, status: string, notes?: string) {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("property_application_documents")
    .update({
      status,
      verification_notes: notes ?? null,
      verification_timestamp: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw error;
}

type DocWithKey = PropertyApplicationDocument & {
  document_type: { document_key: string; is_required: boolean } | null;
};

/**
 * Recalcula el score de una solicitud a partir de sus documentos,
 * el análisis IA (ingresos detectados) y el precio de la propiedad.
 * Se invoca tras subir, analizar, verificar o eliminar documentos.
 */
export async function recalculateApplicationScore(applicationId: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const { data: appRaw, error: appError } = await admin
      .from("property_applications")
      .select("id, country, operation, property_id, property:property_id(price)")
      .eq("id", applicationId)
      .single();
    if (appError || !appRaw) return;
    const app = appRaw as unknown as {
      country: "ES" | "CL";
      operation: "rent" | "sale";
      property: { price: number | null } | { price: number | null }[] | null;
    };
    const property = first<{ price: number | null }>(app.property);

    const { data: docsRaw, error: docsError } = await admin
      .from("property_application_documents")
      .select("*, document_type:property_application_document_types(document_key, is_required)")
      .eq("property_application_id", applicationId);
    if (docsError) return;

    const docs = ((docsRaw ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
      ...(d as unknown as DocWithKey),
      document_type: first<{ document_key: string; is_required: boolean }>(d.document_type),
    })) as DocWithKey[];

    if (docs.length === 0) {
      // Sin documentos no hay nada que puntuar: eliminamos el score si existiera
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("property_application_scores")
        .delete()
        .eq("property_application_id", applicationId);
      return;
    }

    // Ingresos: mayor ingreso mensual detectado por la IA en los documentos
    let incomeAmount: number | undefined;
    let incomeCurrency: "CLP" | "EUR" | undefined;
    const defaultCurrency: "CLP" | "EUR" = app.country === "CL" ? "CLP" : "EUR";
    for (const d of docs) {
      const ai = d.ai_analysis;
      if (ai?.income_amount && ai.income_amount > 0) {
        if (!incomeAmount || ai.income_amount > incomeAmount) {
          incomeAmount = ai.income_amount;
          incomeCurrency = ai.income_currency === "CLP" || ai.income_currency === "EUR"
            ? ai.income_currency
            : defaultCurrency;
        }
      }
    }

    const hasKey = (key: string) => docs.some((d) => d.document_type?.document_key === key);
    const hasVerifiedKey = (key: string) =>
      docs.some((d) => d.document_type?.document_key === key && d.status === "verified");

    const rentPrice = app.operation === "rent" && property?.price && property.price > 0
      ? property.price
      : undefined;

    const score = await calculateScore({
      application_id: applicationId,
      documents: docs,
      income_amount: incomeAmount,
      income_currency: incomeCurrency,
      rent_price: rentPrice,
      rent_currency: defaultCurrency,
      has_references: hasKey("rental_references") || hasKey("aval_letter"),
      country: app.country,
      operation: app.operation,
      has_preapproval: hasKey("mortgage_preapproval"),
      preapproval_verified: hasVerifiedKey("mortgage_preapproval"),
      has_funds_proof: hasKey("proof_of_funds"),
      funds_proof_verified: hasVerifiedKey("proof_of_funds"),
    });

    await upsertScore(applicationId, score);
  } catch (err) {
    console.error("[recalc-score] Error:", err);
  }
}
