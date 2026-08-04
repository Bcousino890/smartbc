import "server-only";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PropertyApplicationWithDetails } from "./types";
import { formatEUR, formatMoney, isSupportedCurrency } from "./currency";
import { getRecommendationLabel } from "./scoring";
import { CandidateSummaryPdfDocument, type CandidateSummaryPdfData } from "@/lib/pdf/candidate-summary-pdf";
import { loadLogoDataUri } from "@/lib/pdf/load-logo";

// Construye los datos del PDF de resumen para el propietario a partir de
// una solicitud completa. Usado tanto por la descarga manual (export-summary)
// como por el envío automático por email al propietario.
export async function buildCandidateSummaryPdfData(
  application: PropertyApplicationWithDetails
): Promise<CandidateSummaryPdfData> {
  const score = application.score;
  const docs = application.documents ?? [];

  // El importe original se muestra en su moneda real (no solo CLP: puede
  // ser USD, DOP, COP... cualquiera que la IA haya reconocido) y, si se
  // pudo convertir, su equivalente en EUR. Antes cualquier moneda que no
  // fuera "CLP" se formateaba como si ya fuera EUR — con una nómina en
  // dólares o pesos dominicanos eso mostraba un importe falso al propietario.
  const incomeCurrency = score?.income_currency;
  const incomeDisplay = score?.income_amount
    ? isSupportedCurrency(incomeCurrency) && incomeCurrency !== "EUR"
      ? `${formatMoney(score.income_amount, incomeCurrency)}${score.income_amount_eur ? ` ≈ ${formatEUR(score.income_amount_eur)}` : ""}`
      : formatEUR(score.income_amount)
    : null;

  const logoDataUri = await loadLogoDataUri();

  return {
    clientName: application.client?.full_name ?? application.client?.email ?? "—",
    clientEmail: application.client?.email ?? "—",
    operationLabel: application.operation === "rent" ? "Alquiler" : "Compra",
    countryLabel: application.country === "ES" ? "España" : "Chile",
    propertyTitle: application.property?.title ?? null,
    generatedAt: new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
    logoDataUri,
    score: score
      ? {
          total: score.total_score,
          recommendationLabel: getRecommendationLabel(score.ai_recommendation),
          summary: score.ai_summary,
          incomeDisplay,
          incomeRatio: score.income_ratio,
          currencyContext: score.currency_context,
        }
      : null,
    documents: docs.map((d) => ({
      name: d.document_type?.display_name ?? "Documento",
      status: d.status,
      notes: d.verification_notes,
      // Explicación de la IA lista para el propietario (qué es el documento
      // y qué confirma) — si el equipo ya dejó una nota manual, esa nota
      // manda; si no, se usa la explicación automática.
      explanation: d.verification_notes ? null : (d.ai_analysis?.owner_explanation ?? null),
      personName: d.ai_analysis?.extracted_data?.name ?? null,
    })),
  };
}

export async function renderCandidateSummaryPdfBuffer(data: CandidateSummaryPdfData): Promise<Buffer> {
  const element = createElement(CandidateSummaryPdfDocument, { data }) as unknown as ReactElement<{
    children?: unknown;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);
  return buffer as unknown as Buffer;
}
