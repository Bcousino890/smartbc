import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { updateDocumentAiAnalysis } from "@/lib/db/queries/property-applications";
import { recalculateApplicationScore } from "./scoring-engine";
import type { AiDocumentAnalysis, ApplicationCountry } from "./types";

const BUCKET = "property-application-documents";
const SIGNED_URL_TTL_SECONDS = 600;

type DocForAnalysis = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  client_note: string | null;
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
    owner_explanation: null,
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
      `id, storage_path, mime_type, client_note, property_application_id,
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

  // El candidato puede ser de cualquier nacionalidad y aportar documentos de
  // cualquier país (p.ej. un extracto bancario dominicano, una nómina
  // chilena para alquilar en España, un contrato colombiano...). El tipo de
  // documento (docType) es solo la CATEGORÍA del checklist en la que el
  // equipo lo archivó — nunca un requisito de que el documento en sí sea de
  // España o Chile. Por eso la moneda real jamás se trata como un error:
  // se reporta tal cual (con su código ISO) y la plataforma la convierte
  // automáticamente a EUR con la tasa del día.
  const system = `Eres un experto en verificación de documentos inmobiliarios para ${countryLabel}, acostumbrado a revisar documentación de candidatos de cualquier nacionalidad (española, latinoamericana o de cualquier otro país).

Analiza el documento adjunto, archivado en el checklist como "${docType?.display_name ?? "documento"}", para una solicitud de ${app?.operation === "rent" ? "alquiler" : "compra"} en ${countryLabel}.

IMPORTANTE sobre el origen del documento: el candidato puede ser extranjero y aportar documentos emitidos en cualquier país (p.ej. un extracto bancario de República Dominicana, una nómina chilena, un contrato colombiano...). Eso es NORMAL y NUNCA es un error ni una advertencia — identifica el documento por lo que ES (identidad, nómina, contrato, extracto bancario, comprobante de domicilio, certificado de impuestos, referencias, aval...) sin importar el país que lo emitió.

MONEDA: reporta el importe y la moneda REALES que ves en el documento, usando su código ISO de 3 letras (EUR, USD, CLP, ARS, BOB, BRL, COP, CRC, DOP, GTQ, HNL, MXN, NIO, PAB, PEN, PYG, UYU, VES, u otra si reconoces cuál es). NUNCA marques una moneda distinta a la esperada como error — la plataforma la convierte automáticamente a EUR con la tasa de cambio del día. Solo marca una advertencia si el importe o la moneda son genuinamente ilegibles o ambiguos.

PERSONA: extrae siempre el nombre completo que aparece en el documento (titular de la cuenta, del contrato, de la identidad...) en extracted_data.name — es la forma de saber de quién es cada documento, especialmente cuando hay varios solicitantes.
${docType?.validation_rules ? `Requisitos de validación: ${JSON.stringify(docType.validation_rules)}` : ""}
${docType?.help_text ? `Contexto: ${docType.help_text}` : ""}
${d.client_note ? `El propio cliente describió este documento así al subirlo: "${d.client_note}" — tenlo en cuenta para identificarlo (especialmente si está archivado como "Otro documento"), pero confirma tú mismo qué es a partir del contenido real del archivo.` : ""}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional. Escribe los textos en español:
{
  "readability": "clear" | "partially_clear" | "unclear",
  "completeness": <número 0-100>,
  "document_type_detected": "<qué tipo de documento es realmente, en lenguaje llano>",
  "income_amount": <número o null>,
  "income_currency": "<código ISO de 3 letras (EUR, USD, CLP, DOP...) o null>",
  "warnings": ["<advertencia si aplica — solo problemas reales, no la nacionalidad ni el país de origen>"],
  "recommendation": "<recomendación breve y clara para el revisor humano>",
  "owner_explanation": "<1-2 frases en tono profesional y positivo, listas para mostrarle al propietario, explicando qué es este documento y qué confirma sobre el candidato (p.ej. 'Extracto bancario que confirma actividad financiera regular y saldo disponible acorde a sus ingresos declarados'). Sé honesto: si hay algo relevante a revisar, menciónalo con tono neutro, no alarmista.>",
  "is_valid": <true|false>,
  "extracted_data": {
    "name": "<nombre completo del titular del documento, si se encuentra>",
    "document_number": "<DNI/RUT/pasaporte/cédula si se encuentra>",
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
      strictImages: true,
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

export type DocumentClassificationCandidate = {
  id: string;
  country: ApplicationCountry;
  display_name: string;
  description: string | null;
};

export type DocumentClassificationResult = {
  document_type_id: string | null;
  confidence: "high" | "medium" | "low";
  reason?: string;
};

// Identifica a qué tipo de documento (de la lista del propio país de la
// solicitud — los paneles ES y CL son independientes, nunca se mezclan)
// corresponde un archivo recién subido sin que el equipo tenga que
// elegirlo a mano. Se usa antes de crear la fila del documento: solo
// necesita la URL firmada del archivo ya subido a storage.
export async function classifyApplicationDocument(
  signedUrl: string,
  mimeType: string,
  candidates: DocumentClassificationCandidate[]
): Promise<DocumentClassificationResult> {
  const isPdf = mimeType === "application/pdf";
  const list = candidates
    .map((c) => `- id: "${c.id}" | nombre: "${c.display_name}"${c.description ? ` | descripción: ${c.description}` : ""}`)
    .join("\n");

  const system = `Eres un clasificador de documentos para solicitudes inmobiliarias, acostumbrado a documentación de candidatos de CUALQUIER nacionalidad (española, latinoamericana o de cualquier otro país: pasaportes, nóminas, extractos bancarios o contratos de República Dominicana, Colombia, EE.UU., etc. son igual de válidos y frecuentes) — el candidato puede ser extranjero aunque la solicitud sea de este país.

Se te da un archivo aportado por un candidato y la lista de tipos de documento posibles para esta solicitud. Clasifica por CATEGORÍA real del documento (identidad/pasaporte, nómina o comprobante de ingresos, contrato de trabajo, extracto bancario, comprobante de domicilio, certificado de impuestos, referencias de alquiler, aval...), sin importar el país que lo emitió, el idioma o la moneda que muestre — un extracto bancario de otro país sigue siendo "extracto bancario".

Usa confianza "high" o "medium" siempre que la categoría del documento sea reconocible, aunque el documento en sí venga de otro país — eso es normal, no un motivo de duda. Reserva confianza "low" o document_type_id null SOLO para cuando el archivo sea realmente ilegible, o no corresponda a NINGUNA de las categorías de la lista (p.ej. un justificante escolar, una matrícula de vehículo, una foto no relacionada).

Tipos posibles:
${list}

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicación adicional:
{
  "document_type_id": "<id exacto de la lista, o null>",
  "confidence": "high" | "medium" | "low",
  "reason": "<breve explicación en español>"
}`;

  try {
    const raw = await aiComplete({
      system,
      userText: "Clasifica este documento y responde solo con el JSON solicitado.",
      images: [signedUrl],
      fileMediaType: isPdf ? "application/pdf" : mimeType,
      maxTokens: 300,
      strictImages: true,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { document_type_id: null, confidence: "low" };
    const parsed = JSON.parse(match[0]) as DocumentClassificationResult;
    const validIds = new Set(candidates.map((c) => c.id));
    if (parsed.document_type_id && !validIds.has(parsed.document_type_id)) {
      parsed.document_type_id = null;
    }
    return parsed;
  } catch (err) {
    console.error("[ai-classify] Error clasificando documento", err);
    return { document_type_id: null, confidence: "low" };
  }
}
