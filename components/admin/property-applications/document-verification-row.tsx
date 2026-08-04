"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  MessageSquare,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { ApplicationCountry, PropertyApplicationDocumentWithType } from "@/lib/property-applications/types";

type Props = {
  document: PropertyApplicationDocumentWithType;
  onVerified: () => void;
  // País de la solicitud: si el tipo del documento pertenece a otro país
  // (documentación extranjera, p.ej. nóminas chilenas para alquilar en
  // España), se muestra una insignia con su bandera.
  applicationCountry?: ApplicationCountry;
};

const STATUS_COLORS = {
  pending: "border-blue-200 bg-blue-50/30",
  verified: "border-green-200 bg-green-50/40",
  rejected: "border-red-200 bg-red-50/30",
  needs_correction: "border-amber-200 bg-amber-50/30",
};

export function DocumentVerificationRow({ document: doc, onVerified, applicationCountry }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationType, setAnnotationType] = useState<"info" | "warning" | "error">("warning");
  const [notes, setNotes] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  async function handleReanalyze() {
    setError(null);
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/property-application-documents/${doc.id}/analyze`, {
        method: "POST",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al analizar el documento");
        return;
      }
      onVerified();
    } catch {
      setError("Error de conexión");
    } finally {
      setAnalyzing(false);
    }
  }

  const docType = doc.document_type;
  const analysis = doc.ai_analysis;
  const annotations = doc.annotations ?? [];
  const pendingAnnotations = annotations.filter((a) => !a.resolved_at);

  async function handleVerify(status: "verified" | "rejected" | "needs_correction") {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/property-application-documents/${doc.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          notes: notes || undefined,
          annotation: showAnnotation && annotationText ? {
            text: annotationText,
            type: annotationType,
          } : undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al verificar");
        return;
      }
      setNotes("");
      setAnnotationText("");
      setShowAnnotation(false);
      onVerified();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${STATUS_COLORS[doc.status]}`}>
      <div className="flex items-start gap-3">
        {/* Estado icono */}
        <div className="mt-0.5 shrink-0">
          {doc.status === "verified" ? (
            <CheckCircle size={18} className="text-green-600" />
          ) : doc.status === "rejected" ? (
            <XCircle size={18} className="text-red-600" />
          ) : doc.status === "needs_correction" ? (
            <AlertCircle size={18} className="text-amber-600" />
          ) : (
            <Clock size={18} className="text-blue-500" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">
              {docType?.display_name ?? "Documento"}
            </p>
            {!docType?.is_required && (
              <span className="rounded-full bg-ink/8 px-1.5 py-0.5 text-[10px] text-ink/50">Opcional</span>
            )}
            {docType?.country && applicationCountry && docType.country !== applicationCountry && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                {docType.country === "CL" ? "🇨🇱 Doc. de Chile" : "🇪🇸 Doc. de España"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-ink/50">{doc.file_name}</p>

          {/* Análisis IA */}
          <div className="mt-2 flex items-center gap-3">
            {analysis && (
              <button
                onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                className="flex items-center gap-1 text-[11px] font-medium text-ink/60 transition hover:text-ink"
              >
                Análisis IA
                {showAiAnalysis ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
            <button
              onClick={handleReanalyze}
              disabled={analyzing}
              className="flex items-center gap-1 text-[11px] font-medium text-ink/40 transition hover:text-ink disabled:opacity-50"
            >
              <Sparkles size={11} />
              {analyzing ? "Analizando..." : analysis ? "Reanalizar con IA" : "Analizar con IA"}
            </button>
          </div>

          {analysis && (
            <div className="mt-1">
              {showAiAnalysis && (
                <div className="mt-2 rounded-lg bg-white/60 p-3 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div>
                      <span className="text-ink/40">Legibilidad:</span>{" "}
                      <span className={`font-medium ${
                        analysis.readability === "clear"
                          ? "text-green-600"
                          : analysis.readability === "partially_clear"
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}>
                        {analysis.readability === "clear"
                          ? "Clara"
                          : analysis.readability === "partially_clear"
                          ? "Parcialmente clara"
                          : "Poco clara"}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink/40">Completitud:</span>{" "}
                      <span className="font-medium text-ink">{analysis.completeness}%</span>
                    </div>
                    <div>
                      <span className="text-ink/40">Tipo detectado:</span>{" "}
                      <span className="font-medium text-ink">{analysis.document_type_detected}</span>
                    </div>
                    {analysis.income_amount && (
                      <div>
                        <span className="text-ink/40">Ingreso detectado:</span>{" "}
                        <span className="font-medium text-ink">
                          {analysis.income_currency} {analysis.income_amount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {analysis.extracted_data?.name && (
                      <div className="col-span-2">
                        <span className="text-ink/40">Titular del documento:</span>{" "}
                        <span className="font-medium text-ink">{analysis.extracted_data.name}</span>
                      </div>
                    )}
                    {analysis.extracted_data?.document_number && (
                      <div>
                        <span className="text-ink/40">Nº documento:</span>{" "}
                        <span className="font-medium text-ink">{analysis.extracted_data.document_number}</span>
                      </div>
                    )}
                    {analysis.extracted_data?.employer && (
                      <div>
                        <span className="text-ink/40">Empleador:</span>{" "}
                        <span className="font-medium text-ink">{analysis.extracted_data.employer}</span>
                      </div>
                    )}
                  </div>
                  {analysis.owner_explanation && (
                    <p className="mt-2 rounded-md bg-gold/10 px-2 py-1.5 text-ink/70">
                      <span className="font-medium">Para el propietario:</span> {analysis.owner_explanation}
                    </p>
                  )}
                  {analysis.warnings.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {analysis.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1 text-amber-700">
                          <AlertCircle size={11} className="mt-0.5 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {analysis.recommendation && (
                    <p className="mt-2 text-ink/60">
                      <span className="font-medium">Recomendación IA:</span> {analysis.recommendation}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Anotaciones existentes */}
          {pendingAnnotations.length > 0 && (
            <div className="mt-2 space-y-1">
              {pendingAnnotations.map((ann) => (
                <div key={ann.id} className="flex items-start gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs text-amber-800">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  {ann.annotation_text}
                </div>
              ))}
            </div>
          )}

          {/* Notas de verificación */}
          {doc.verification_notes && (
            <p className="mt-1.5 text-xs text-ink/50">
              Nota: {doc.verification_notes}
            </p>
          )}

          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

          {/* Formulario verificación (solo si no está verificado) */}
          {doc.status !== "verified" && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas (opcional)..."
                className="w-full rounded-lg border border-ink/15 bg-white/80 px-3 py-1.5 text-xs text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-gold"
              />

              {/* Toggle anotación al cliente */}
              <div>
                <button
                  onClick={() => setShowAnnotation(!showAnnotation)}
                  className="flex items-center gap-1.5 text-[11px] text-ink/50 transition hover:text-ink"
                >
                  <MessageSquare size={11} />
                  {showAnnotation ? "Cancelar anotación" : "Añadir anotación al cliente"}
                </button>
                {showAnnotation && (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="text"
                      value={annotationText}
                      onChange={(e) => setAnnotationText(e.target.value)}
                      placeholder="Mensaje al cliente sobre este documento..."
                      className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <select
                      value={annotationType}
                      onChange={(e) => setAnnotationType(e.target.value as typeof annotationType)}
                      className="rounded-lg border border-ink/15 bg-white/80 px-2 py-1 text-xs text-ink"
                    >
                      <option value="info">ℹ️ Información</option>
                      <option value="warning">⚠️ Advertencia</option>
                      <option value="error">❌ Error</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {/* Ver documento */}
          <a
            href={doc.signed_url ?? doc.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white/70 px-2.5 py-1.5 text-[11px] font-medium text-ink/60 transition hover:text-ink"
          >
            <ExternalLink size={11} />
            Ver doc
          </a>

          {/* Botones verificación */}
          {doc.status !== "verified" && (
            <button
              onClick={() => handleVerify("verified")}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={11} />
              {loading ? "..." : "Verificar"}
            </button>
          )}

          {doc.status !== "needs_correction" && doc.status !== "rejected" && (
            <button
              onClick={() => handleVerify("needs_correction")}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
            >
              <AlertCircle size={11} />
              Corregir
            </button>
          )}

          {doc.status !== "rejected" && (
            <button
              onClick={() => handleVerify("rejected")}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle size={11} />
              Rechazar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
