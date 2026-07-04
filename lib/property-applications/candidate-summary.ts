import "server-only";
import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PropertyApplicationWithDetails } from "./types";
import { formatCLP, formatEUR } from "./currency";
import { getRecommendationLabel } from "./scoring";
import { CandidateSummaryPdfDocument, type CandidateSummaryPdfData } from "@/lib/pdf/candidate-summary-pdf";

// Construye los datos del PDF de resumen para el propietario a partir de
// una solicitud completa. Usado tanto por la descarga manual (export-summary)
// como por el envío automático por email al propietario.
export function buildCandidateSummaryPdfData(
  application: PropertyApplicationWithDetails
): CandidateSummaryPdfData {
  const score = application.score;
  const docs = application.documents ?? [];

  const incomeDisplay = score?.income_amount
    ? score.income_currency === "CLP"
      ? `${formatCLP(score.income_amount)}${score.income_amount_eur ? ` ≈ ${formatEUR(score.income_amount_eur)}` : ""}`
      : formatEUR(score.income_amount)
    : null;

  return {
    clientName: application.client?.full_name ?? application.client?.email ?? "—",
    clientEmail: application.client?.email ?? "—",
    operationLabel: application.operation === "rent" ? "Alquiler" : "Compra",
    countryLabel: application.country === "ES" ? "España" : "Chile",
    propertyTitle: application.property?.title ?? null,
    generatedAt: new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }),
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
