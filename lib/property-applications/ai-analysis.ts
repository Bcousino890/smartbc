import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { updateDocumentAiAnalysis } from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "./scoring-engine";
import type { AiDocumentAnalysis } from "./types";

const BUCKET = "property-application-documents";
const SIGNED_URL_TTL_SECONDS = 600;

type DocForAnalysis = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  property_application_id: string;
  property_applications: { country: "ES" | "CL"; operation: "rent" | "sale" } | null;
  property_application_document_types: {
    display_name: string;
    country: "ES" | "CL";
    validation_rules: Record<string, unknown> | null;
    help_text: string | null;
  } | null;
};

function fallbackAnalysis(warning: string): AiDocumentAnalysis {
  return {
    readability: "unclear",
    completeness: 0,
    document_type_detected: "Sin analizar",
    extracted_data: {},
    warnings: [warning],
    is_valid: false,
    recommendation: "Revisar manualmente",
  };
}

// Analiza un documento recién subido con el proveedor de IA configurado en
// Configuración → IA (Anthropic / OpenRouter / NVIDIA / Ollama...). Sustituye
// a la función edge "analyze-property-application-document", que nunca
// llegó a invocarse desde ningún sitio del código y quedó como código
// muerto. El análisis es puramente informativo: nunca cambia el estado del
// documento (eso sigue siendo una decisión humana vía "Verificar"/"Corregir"),
// pero sí alimenta el recálculo del score de la solicitud.
export async function analyzeApplicationDocument(documentId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: doc, error } = await supabase
    .from("property_application_documents")
    .select(
      `id, storage_path, mime_type, property_application_id,
      property_applications(country, operation),
      property_application_document_types(display_name, country, validation_rules, help_text)`
    )
    .eq("id", documentId)
    .single();
  if (error || !doc) return;
  const d = doc as DocForAnalysis;

  const mimeType = d.mime_type ?? "";
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    await updateDocumentAiAnalysis(
      documentId,
      fallbackAnalysis("Formato no compatible con el análisis automático — revisión manual necesaria")
    );
    await recalculateApplicationScore(d.property_application_id);
    return;
  }

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(d.storage_path, SIGNED_URL_TTL_SECONDS);
  if (!signed?.signedUrl) {
    await updateDocumentAiAnalysis(
      documentId,
      fallbackAnalysis("No se pudo acceder al archivo para analizarlo — revisión manual necesaria")
    );
    await recalculateApplicationScore(d.property_application_id);
    return;
  }

  const app = d.property_applications;
  const docType = d.property_application_document_types;
  const countryLabel = app?.country === "CL" ? "Chile" : "España";

  // El país del TIPO de documento puede diferir del de la solicitud: los
  // candidatos pueden aportar documentación extranjera (p.ej. nóminas
  // chilenas en CLP para alquilar en España). En ese caso la moneda
  // extranjera NO es un error — se reporta y la plataforma la convierte.
  const docCountry = docType?.country ?? app?.country ?? "ES";
  const docCountryLabel = docCountry === "CL" ? "Chile" : "España";
  const expectedCurrency = docCountry === "CL" ? "pesos chilenos (CLP)" : "euros (EUR)";
  const isForeignDoc = Boolean(app?.country && docType?.country && app.country !== docType.country);
  const currencyNote = isForeignDoc
    ? `Este es un documento de ${docCountryLabel} aportado para una solicitud en ${countryLabel}. Los valores monetarios estarán normalmente en ${expectedCurrency}: NO lo marques como error ni como advertencia — indica el importe y la moneda reales en income_amount/income_currency y la plataforma hará la conversión de divisa automáticamente. Solo advierte si la moneda no corresponde a ninguno de los dos países (p.ej. USD).`
    : `Los valores monetarios deben estar en ${expectedCurrency}. Marca una advertencia si detectas otra moneda.`;

  const system = `Eres un experto en verificación de documentos inmobiliarios para ${countryLabel}.
Analiza el documento adjunto de tipo "${docType?.display_name ?? "documento"}" (documentación de ${docCountryLabel}) para una solicitud de ${app?.operation === "rent" ? "alquiler" : "compra"} en ${countryLabel}.

${currencyNote}
${docType?.validation_rules ? `Requisitos de validación: ${JSON.stringify(docType.validation_rules)}` : ""}
${docType?.help_text ? `Contexto: ${docType.help_text}` : ""}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional. Escribe los textos (warnings, recommendation, document_type_detected) en español:
{
  "readability": "clear" | "partially_clear" | "unclear",
  "completeness": <número 0-100>,
  "document_type_detected": "<tipo de documento detectado>",
  "income_amount": <número o null>,
  "income_currency": "<CLP|EUR|USD|null>",
  "warnings": ["<advertencia si aplica>"],
  "recommendation": "<recomendación breve y clara para el revisor humano>",
  "is_valid": <true|false>,
  "extracted_data": {
    "name": "<si se encuentra>",
    "document_number": "<DNI/RUT/pasaporte si se encuentra>",
    "expiry_date": "<si se encuentra>",
    "employer": "<si se encuentra>",
    "salary": "<texto del salario si se encuentra>"
  }
}`;

  try {
    const raw = await aiComplete({
      system,
      userText: "Analiza este documento y responde solo con el JSON solicitado.",
      images: [signed.signedUrl],
      fileMediaType: isPdf ? "application/pdf" : mimeType,
      maxTokens: 900,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Respuesta IA sin JSON: ${raw.slice(0, 200)}`);
    const analysis = JSON.parse(match[0]) as AiDocumentAnalysis;
    await updateDocumentAiAnalysis(documentId, analysis);
  } catch (err) {
    const message =
      err instanceof AINotConfiguredError
        ? err.message
        : "No se pudo completar el análisis automático — revisión manual necesaria.";
    console.error("[ai-analysis] Error analizando documento", documentId, err);
    await updateDocumentAiAnalysis(documentId, fallbackAnalysis(message));
  }

  await recalculateApplicationScore(d.property_application_id);
}
