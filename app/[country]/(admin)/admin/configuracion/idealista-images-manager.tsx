"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, ImageIcon } from "lucide-react";

type Result = {
  leadsScanned: number;
  coverImagesRehosted: number;
  propertyImagesRehosted: number;
  failed: number;
};

export function IdealistaImagesManager() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/idealista-leads/backfill-images", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Error al recuperar las imágenes");
        return;
      }
      setStatus("success");
      setResult({
        leadsScanned: data.leadsScanned ?? 0,
        coverImagesRehosted: data.coverImagesRehosted ?? 0,
        propertyImagesRehosted: data.propertyImagesRehosted ?? 0,
        failed: data.failed ?? 0,
      });
      setMessage("Recuperación completada.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon size={20} className="text-gold" />
        <h2 className="text-lg font-semibold text-ink">
          Recuperar imágenes de leads de Idealista
        </h2>
      </div>

      <p className="text-sm text-ink/60 mb-4">
        Las imágenes de los leads capturados por la extensión son enlaces directos
        al CDN de idealista.com: si el anuncio se da de baja o caduca, dejan de
        cargar. Esto descarga esas fotos y guarda una copia permanente en nuestro
        almacenamiento. Es seguro ejecutarlo varias veces: no vuelve a descargar
        las que ya están guardadas. Los leads nuevos se guardan así automáticamente;
        este botón es solo para recuperar los que ya estaban capturados.
      </p>

      {status === "success" && result && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">{message}</p>
            <ul className="mt-1 text-sm text-emerald-700">
              <li>Leads revisados: {result.leadsScanned}</li>
              <li>Fotos de portada recuperadas: {result.coverImagesRehosted}</li>
              <li>Fotos de propiedades recuperadas: {result.propertyImagesRehosted}</li>
              {result.failed > 0 && (
                <li className="text-amber-700">
                  No se pudieron recuperar: {result.failed} (el anuncio ya podría estar caído)
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="font-medium text-red-800 text-sm">{message}</p>
        </div>
      )}

      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        <span>{loading ? "Recuperando..." : "Recuperar imágenes ahora"}</span>
      </button>

      <p className="mt-4 text-xs text-ink/55">
        ⚠️ Puede tardar según cuántos leads e imágenes haya. Descarga las fotos una
        a una desde idealista.com.
      </p>
    </div>
  );
}
