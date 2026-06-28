import type {
  AiRecommendation,
  PropertyApplicationDocument,
  PropertyApplicationScore,
} from "./types";
import { buildCurrencyContext, convertCLPtoEUR } from "./currency";

type ScoringInput = {
  application_id: string;
  documents: PropertyApplicationDocument[];
  income_amount?: number;
  income_currency?: "CLP" | "EUR";
  rent_price?: number;
  rent_currency?: "CLP" | "EUR";
  has_references?: boolean;
  country: "ES" | "CL";
};

export async function calculateScore(
  input: ScoringInput
): Promise<Omit<PropertyApplicationScore, "id" | "property_application_id" | "created_at" | "updated_at" | "calculated_at">> {
  const docs = input.documents;

  // 1. Completitud documental (max 20 pts)
  const totalDocs = docs.length;
  const verifiedDocs = docs.filter((d) => d.status === "verified").length;
  const pendingDocs = docs.filter((d) => d.status === "pending" || d.status === "needs_correction").length;
  const document_completeness_score = totalDocs > 0
    ? Math.round((verifiedDocs / totalDocs) * 20)
    : 0;

  // 2. Calidad IA de documentos (max 20 pts)
  const docsWithAi = docs.filter((d) => d.ai_analysis);
  const avgReadability = docsWithAi.length > 0
    ? docsWithAi.reduce((acc, d) => {
        const r = d.ai_analysis?.readability;
        return acc + (r === "clear" ? 1 : r === "partially_clear" ? 0.5 : 0);
      }, 0) / docsWithAi.length
    : 0;
  const document_quality_score = Math.round(avgReadability * 20);

  // 3. Referencias (max 20 pts)
  const history_score = input.has_references ? 20 : 0;

  // 4. Ingresos / ratio (max 40 pts)
  let income_score = 0;
  let income_amount_eur: number | null = null;
  let income_ratio: number | null = null;
  let currency_context: string | null = null;

  if (input.income_amount && input.rent_price) {
    const incomeCur = input.income_currency ?? "EUR";
    const rentCur = input.rent_currency ?? "EUR";

    // Normalizar ambos a EUR
    const incomeEur = incomeCur === "CLP"
      ? await convertCLPtoEUR(input.income_amount)
      : input.income_amount;
    const rentEur = rentCur === "CLP"
      ? await convertCLPtoEUR(input.rent_price)
      : input.rent_price;

    income_amount_eur = incomeEur;
    income_ratio = rentEur > 0 ? incomeEur / rentEur : null;

    if (income_ratio !== null) {
      if (income_ratio >= 4) income_score = 40;
      else if (income_ratio >= 3.5) income_score = 35;
      else if (income_ratio >= 3) income_score = 25;
      else if (income_ratio >= 2) income_score = 15;
      else income_score = 5;
    }

    currency_context = await buildCurrencyContext(
      input.income_amount,
      incomeCur as "CLP" | "EUR"
    );
  }

  const total_score = Math.min(
    100,
    income_score + document_completeness_score + document_quality_score + history_score
  );

  // Recomendación IA basada en score + flags
  let ai_recommendation: AiRecommendation;
  if (total_score >= 80 && pendingDocs === 0) {
    ai_recommendation = "strong_approve";
  } else if (total_score >= 65 && pendingDocs <= 1) {
    ai_recommendation = "approve";
  } else if (total_score >= 45) {
    ai_recommendation = "review";
  } else {
    ai_recommendation = "reject";
  }

  // Resumen textual en español
  const ratioText = income_ratio
    ? `${income_ratio.toFixed(1)}x la renta`
    : "no determinado";
  const refsText = input.has_references ? "con referencias previas" : "sin referencias";
  const docsText = document_completeness_score >= 20
    ? "documentación completa"
    : `${verifiedDocs}/${totalDocs} documentos verificados`;

  const summaryMap: Record<AiRecommendation, string> = {
    strong_approve: `Candidato sólido. Ingresos verificados de ${ratioText}, ${docsText}, ${refsText}. Riesgo bajo.`,
    approve: `Candidato aceptable. Ingresos de ${ratioText}, ${docsText}, ${refsText}.`,
    review: `Revisar manualmente. Ingresos de ${ratioText}, ${docsText}. Requiere análisis adicional.`,
    reject: `Candidato no recomendado. Ingresos de ${ratioText}, documentación insuficiente.`,
  };

  return {
    total_score,
    income_score,
    document_completeness_score,
    document_quality_score,
    history_score,
    ai_recommendation,
    ai_summary: summaryMap[ai_recommendation],
    currency_context,
    income_amount: input.income_amount ?? null,
    income_currency: input.income_currency ?? null,
    income_amount_eur,
    income_ratio,
  };
}

export function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

export function getScoreBgColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-700";
  if (score >= 50) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export function getRecommendationLabel(rec: AiRecommendation | null): string {
  if (!rec) return "Sin análisis";
  const labels: Record<AiRecommendation, string> = {
    strong_approve: "Aprobar",
    approve: "Aprobar",
    review: "Revisar",
    reject: "Rechazar",
  };
  return labels[rec];
}
