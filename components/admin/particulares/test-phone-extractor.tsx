"use client";

import { useState } from "react";
import { Search, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type AjaxDebugEntry = { endpoint: string; status: number; bodySnippet: string };

type ExtractionResult = {
  ok: boolean;
  adId?: string;
  advertiserType?: string;
  phone?: string | null;
  phoneConfidence?: string;
  contactName?: string;
  title?: string;
  address?: string;
  price?: number;
  error?: string;
  debug?: {
    htmlLength: number;
    datadomeBlocked: boolean;
    hasPhoneContainer: boolean;
    hasTelHref: boolean;
    hasAppCallback: boolean;
    telHrefs: string[];
    ajax: AjaxDebugEntry[];
  };
};

export function TestPhoneExtractor() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleTest = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/particulares/extract-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json() as ExtractionResult;
      setResult(data);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-gold/15 bg-white/60 p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-ink">
        🔍 Testear extracción de teléfono
      </h3>

      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleTest()}
          placeholder="Pega URL de Idealista (ej: https://www.idealista.com/inmueble/111772866/)"
          className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={handleTest}
          disabled={loading || !url.trim()}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            loading || !url.trim()
              ? "cursor-not-allowed bg-ink/10 text-ink/40"
              : "bg-ink text-cream-50 hover:bg-ink/90"
          )}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          {loading ? "Extrayendo…" : "Testear"}
        </button>
      </div>

      {result && (
        <div className="mt-3 rounded-lg border border-ink/10 bg-white p-3">
          {result.ok ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span className="font-medium text-ink">✓ Extracción exitosa</span>
              </div>

              {result.title && (
                <div className="text-xs text-ink/70">
                  <span className="font-medium">Título:</span> {result.title}
                </div>
              )}

              {result.advertiserType && (
                <div className="text-xs text-ink/70">
                  <span className="font-medium">Tipo:</span>{" "}
                  {result.advertiserType === "particular"
                    ? "👤 Particular"
                    : "🏢 Profesional"}
                </div>
              )}

              {result.contactName && (
                <div className="text-xs text-ink/70">
                  <span className="font-medium">Nombre:</span> {result.contactName}
                </div>
              )}

              {result.phone ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
                  <div className="flex-1 text-xs">
                    <span className="font-medium text-emerald-700">Teléfono:</span>
                    <span className="ml-1 font-mono text-emerald-900">
                      {result.phone}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyPhone(result.phone!)}
                    className="p-1 text-emerald-600 transition hover:bg-emerald-100 rounded"
                  >
                    <Copy size={12} />
                  </button>
                  {result.phoneConfidence && (
                    <span className="text-[10px] font-semibold uppercase text-emerald-700">
                      {result.phoneConfidence}
                    </span>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  ⚠️ No se encontró teléfono en este anuncio (puede estar oculto tras "Ver teléfono")
                </div>
              )}

              {result.price && (
                <div className="text-xs text-ink/70">
                  <span className="font-medium">Precio:</span> €{result.price}
                </div>
              )}

              {result.debug && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-ink/50 hover:text-ink/70">
                    Debug AJAX ({result.debug.ajax.length} endpoints)
                    {result.debug.datadomeBlocked && " — ⚠️ DataDome"}
                    {" · "}{result.debug.htmlLength.toLocaleString()} chars
                    {" · "}{result.debug.hasPhoneContainer ? "✓container" : "✗container"}
                    {" · "}{result.debug.hasTelHref ? `✓tel:(${result.debug.telHrefs.slice(0,3).join(", ")})` : "✗tel:"}
                    {" · "}{result.debug.hasAppCallback ? "✓appcb" : "✗appcb"}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {result.debug.ajax.map((entry, i) => (
                      <div key={i} className="rounded bg-ink/5 p-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "font-mono font-bold",
                            entry.status === 200 ? "text-emerald-700" : "text-red-600"
                          )}>
                            {entry.status}
                          </span>
                          <span className="truncate text-ink/60">{entry.endpoint}</span>
                        </div>
                        {entry.bodySnippet && (
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-ink/70">
                            {entry.bodySnippet}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs text-red-700">
                <p className="font-medium">Error en extracción</p>
                <p className="mt-0.5">{result.error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
