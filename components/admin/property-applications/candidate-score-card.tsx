"use client";

import { TrendingUp } from "lucide-react";
import type { PropertyApplicationScore } from "@/lib/property-applications/types";
import { getScoreBgColor, getRecommendationLabel } from "@/lib/property-applications/scoring";
import { formatCLP, formatEUR } from "@/lib/property-applications/currency";

type Props = {
  score: Pick<
    PropertyApplicationScore,
    | "total_score"
    | "income_score"
    | "document_completeness_score"
    | "document_quality_score"
    | "history_score"
    | "ai_recommendation"
    | "ai_summary"
    | "currency_context"
    | "income_amount"
    | "income_currency"
    | "income_amount_eur"
    | "income_ratio"
  >;
  country: "ES" | "CL";
};

function ScoreBar({ label, value, max = 40 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink/60">
        <span>{label}</span>
        <span className="font-medium">{value}/{max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full transition-all ${pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CandidateScoreCard({ score, country }: Props) {
  const scoreBg = getScoreBgColor(score.total_score);
  const recLabel = getRecommendationLabel(score.ai_recommendation);

  return (
    <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="crm-label-sm text-ink/40">Score del candidato</p>
          {score.ai_summary && (
            <p className="mt-1 text-sm text-ink/70">{score.ai_summary}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${scoreBg}`}>
            <span className="text-xl font-bold">{score.total_score}</span>
            <span className="text-xs">/100</span>
          </div>
          <p className="mt-1 text-xs font-medium text-ink/60">{recLabel}</p>
        </div>
      </div>

      {/* Ingresos */}
      {score.income_amount && (
        <div className="mt-3 rounded-lg bg-white/60 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div>
              <span className="text-ink/40 text-xs">Ingresos:</span>{" "}
              <span className="font-semibold text-ink">
                {score.income_currency === "CLP"
                  ? formatCLP(score.income_amount)
                  : formatEUR(score.income_amount)}
              </span>
            </div>
            {score.income_amount_eur && score.income_currency === "CLP" && (
              <div className="text-xs text-ink/50">
                ≈ {formatEUR(score.income_amount_eur)}
              </div>
            )}
            {score.income_ratio && (
              <div className={`flex items-center gap-1 text-xs font-medium ${
                score.income_ratio >= 3 ? "text-green-600" : "text-amber-600"
              }`}>
                <TrendingUp size={11} />
                {score.income_ratio.toFixed(1)}x la renta
              </div>
            )}
          </div>
          {score.currency_context && (
            <p className="mt-1.5 text-xs text-ink/40">{score.currency_context}</p>
          )}
        </div>
      )}

      {/* Barras de score */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
        <ScoreBar label="Ingresos / ratio" value={score.income_score} max={40} />
        <ScoreBar label="Completitud docs" value={score.document_completeness_score} max={20} />
        <ScoreBar label="Calidad docs" value={score.document_quality_score} max={20} />
        <ScoreBar label="Historial / refs" value={score.history_score} max={20} />
      </div>
    </div>
  );
}
