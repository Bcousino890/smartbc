import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { calculateScore } from "./scoring";
import { upsertScore } from "@/lib/db/queries/property-applications";
import type { AiDocumentAnalysis, PropertyApplicationDocument } from "./types";

// Este archivo es server-only (usa el cliente admin) y por eso vive
// separado de scoring.ts, que sí se importa desde componentes "use client"
// (candidate-score-card.tsx) para sus helpers de formato/color puros.

const INCOME_DOC_PRIORITY = ["payslips", "employment_or_income", "employment_contract", "tax_certificate"];

type DocWithTypeKey = PropertyApplicationDocument & {
  property_application_document_types: { document_key: string } | null;
};

// Recalcula y guarda el score de una solicitud. Se llama tras cada subida,
// cada análisis IA y cada verificación manual de documento, y de forma
// perezosa al abrir el detalle de una solicitud sin score todavía (cubre
// las solicitudes que quedaron con "Calculando..." antes de que este
// pipeline existiera).
export async function recalculateApplicationScore(applicationId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: appRow } = await supabase
    .from("property_applications")
    .select("country, operation, properties:property_id(price)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRow) return;

  const country = appRow.country as "ES" | "CL";
  const property = appRow.properties as { price: number | string } | null;

  const { data: docsRaw } = await supabase
    .from("property_application_documents")
    .select("*, property_application_document_types(document_key)")
    .eq("property_application_id", applicationId);
  const docs = (docsRaw ?? []) as DocWithTypeKey[];

  const { count: coApplicantCount } = await supabase
    .from("property_application_co_applicants")
    .select("id", { count: "exact", head: true })
    .eq("property_application_id", applicationId)
    .not("accepted_at", "is", null);

  const hasReferences =
    docs.some(
      (d) =>
        d.property_application_document_types?.document_key === "rental_references" &&
        d.status !== "rejected"
    ) || (coApplicantCount ?? 0) > 0;

  const rentCurrency: "CLP" | "EUR" = country === "CL" ? "CLP" : "EUR";
  const rentPrice = property?.price ? Number(property.price) : undefined;

  // Elegimos el ingreso detectado por IA más confiable entre los
  // documentos analizados: preferimos nóminas/certificados de ingresos
  // sobre el contrato de trabajo, e ignoramos análisis poco legibles.
  const incomeCandidates = docs
    .filter((d): d is DocWithTypeKey & { ai_analysis: AiDocumentAnalysis } =>
      Boolean(d.ai_analysis?.income_amount && d.ai_analysis.readability !== "unclear")
    )
    .map((d) => {
      const key = d.property_application_document_types?.document_key ?? "";
      const priority = INCOME_DOC_PRIORITY.indexOf(key);
      return {
        amount: Number(d.ai_analysis.income_amount),
        currency: (d.ai_analysis.income_currency as "CLP" | "EUR" | undefined) ?? rentCurrency,
        priority: priority === -1 ? 99 : priority,
      };
    })
    .sort((a, b) => a.priority - b.priority);

  const bestIncome = incomeCandidates[0];

  const score = await calculateScore({
    application_id: applicationId,
    documents: docs,
    income_amount: bestIncome?.amount,
    income_currency: bestIncome?.currency,
    rent_price: rentPrice,
    rent_currency: rentCurrency,
    has_references: hasReferences,
    country,
  });

  await upsertScore(applicationId, score);
}
