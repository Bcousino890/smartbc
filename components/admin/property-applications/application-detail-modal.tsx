"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Download, Loader2, Mail, MessageSquare, Star, X, XCircle } from "lucide-react";
import type { PropertyApplicationWithDetails } from "@/lib/property-applications/types";
import { getScoreBgColor } from "@/lib/property-applications/scoring";
import { DocumentVerificationRow } from "./document-verification-row";
import { CandidateScoreCard } from "./candidate-score-card";
import { AdminDocumentUploader } from "./admin-document-uploader";

type Props = {
  applicationId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export function ApplicationDetailModal({ applicationId, onClose, onUpdated }: Props) {
  const [application, setApplication] = useState<PropertyApplicationWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [sendingToOwner, setSendingToOwner] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSendToOwner() {
    setSendingToOwner(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}/export-summary/send`, {
        method: "POST",
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSendResult({ ok: false, message: data.error ?? "No se pudo enviar" });
        return;
      }
      setSendResult({ ok: true, message: "Resumen enviado al propietario" });
    } catch {
      setSendResult({ ok: false, message: "Error de conexión" });
    } finally {
      setSendingToOwner(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/property-applications/${applicationId}`);
        const data = await res.json() as PropertyApplicationWithDetails & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Error al cargar la solicitud");
          return;
        }
        setApplication(data);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [applicationId]);

  async function handleApprove() {
    if (!application) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al aprobar");
        return;
      }
      onUpdated();
    } catch {
      setError("Error de conexión");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setError("Debes indicar el motivo del rechazo");
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/property-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes: rejectNotes }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al rechazar");
        return;
      }
      onUpdated();
    } catch {
      setError("Error de conexión");
    } finally {
      setActionLoading(false);
    }
  }

  function handleDocUpdated() {
    // Recargar la solicitud al verificar un documento
    setLoading(true);
    fetch(`/api/property-applications/${applicationId}`)
      .then((r) => r.json())
      .then((data: PropertyApplicationWithDetails) => setApplication(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const score = application?.score;
  const docs = application?.documents ?? [];
  const verifiedCount = docs.filter((d) => d.status === "verified").length;
  const allVerified = docs.length > 0 && verifiedCount === docs.length;
  const opLabel = application?.operation === "rent" ? "Alquiler" : "Compra";
  const countryFlag = application?.country === "ES" ? "🇪🇸" : "🇨🇱";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="font-serif text-lg text-ink">
              Solicitud de {opLabel} {countryFlag}
            </h2>
            {application && (
              <p className="mt-0.5 text-sm text-ink/50">
                {application.client?.full_name ?? application.client?.email}
                {application.property && ` · ${application.property.title}`}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {loading && (
            <div className="py-16 text-center text-sm text-ink/40">Cargando...</div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}

          {!loading && application && (
            <div className="space-y-6">
              {/* Score */}
              {score && <CandidateScoreCard score={score} country={application.country} />}

              {/* Documentos */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    Documentos ({verifiedCount}/{docs.length} verificados)
                  </h3>
                  {allVerified && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                      <CheckCircle size={11} />
                      Todo verificado
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {docs.map((doc) => (
                    <DocumentVerificationRow
                      key={doc.id}
                      document={doc}
                      onVerified={handleDocUpdated}
                    />
                  ))}
                </div>

                {docs.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink/40">
                    No hay documentos subidos todavía
                  </p>
                )}

                {application && (
                  <div className="mt-3">
                    <AdminDocumentUploader
                      applicationId={application.id}
                      country={application.country}
                      operation={application.operation}
                      existingDocumentTypeIds={docs.map((d) => d.document_type_id)}
                      onUploaded={handleDocUpdated}
                    />
                  </div>
                )}
              </div>

              {/* Acciones principales */}
              {(application.status === "pending_review" || application.status === "draft") && (
                <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Decisión</h3>

                  {error && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={14} />
                      {error}
                    </div>
                  )}

                  {!showRejectForm ? (
                    <div className="flex gap-3">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle size={15} />
                        {actionLoading ? "..." : "Aprobar solicitud"}
                      </button>
                      <button
                        onClick={() => setShowRejectForm(true)}
                        disabled={actionLoading}
                        className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle size={15} />
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={rejectNotes}
                        onChange={(e) => setRejectNotes(e.target.value)}
                        placeholder="Indica el motivo del rechazo (será visible para el cliente)..."
                        rows={3}
                        className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleReject}
                          disabled={actionLoading}
                          className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                        >
                          <XCircle size={15} />
                          {actionLoading ? "..." : "Confirmar rechazo"}
                        </button>
                        <button
                          onClick={() => { setShowRejectForm(false); setRejectNotes(""); setError(null); }}
                          className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm text-ink/60 transition hover:text-ink"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PDF para dueño */}
              <div className="rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Resumen para el propietario</p>
                    <p className="text-xs text-ink/50">
                      PDF con análisis explicado, sin documentos crudos
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/api/property-applications/${applicationId}/export-summary`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink"
                    >
                      <Download size={12} />
                      Descargar PDF
                    </a>
                    <button
                      onClick={handleSendToOwner}
                      disabled={sendingToOwner}
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:text-ink disabled:opacity-50"
                    >
                      {sendingToOwner ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                      Enviar al propietario
                    </button>
                  </div>
                </div>
                {sendResult && (
                  <p className={`mt-2 text-xs ${sendResult.ok ? "text-green-600" : "text-red-600"}`}>
                    {sendResult.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
