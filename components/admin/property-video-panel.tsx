"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Clapperboard,
  Download,
  Info,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";

// Panel de generación del vídeo automático en la ficha de la propiedad.
//
// El orden importa: PRIMERO se enseña la estimación (fotos que entran,
// duración y sobre todo cuánto va a pesar) y solo después aparece el botón de
// generar. Es un requisito explícito: nada se renderiza sin saber antes lo que
// va a ocupar.

type Plan = {
  format: "horizontal" | "vertical";
  resolution: "fullhd" | "4k";
  resolutionLabel: string;
  width: number;
  height: number;
  availablePhotos: number;
  usedPhotos: number;
  droppedPhotos: number;
  durationLabel: string;
  estimatedLabel: string;
  rangeLabel: string;
  maxLabel: string;
  calibrated: boolean;
  renderLabel: string;
  warnings: string[];
};

type EstimateResponse = {
  ok: boolean;
  error?: string;
  ffmpegAvailable: boolean;
  ffmpegError?: string | null;
  music: { id: string; name: string } | null;
  plan?: Plan;
};

type Generated = {
  url: string;
  sizeLabel: string;
  estimatedLabel: string;
  sizeDeviationPercent: number;
  durationLabel: string;
  warnings: string[];
};

const boxCls =
  "rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none";

export function PropertyVideoPanel({
  slug,
  photoCount,
  hasExistingVideo,
}: {
  slug: string;
  photoCount: number;
  hasExistingVideo: boolean;
}) {
  const [format, setFormat] = useState<"horizontal" | "vertical">("horizontal");
  const [resolution, setResolution] = useState<"fullhd" | "4k">("fullhd");

  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [error, setError] = useState("");

  const loadEstimate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/properties/${slug}/video?format=${format}&resolution=${resolution}`,
      );
      const data = (await res.json()) as EstimateResponse;
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "No se pudo calcular la estimación.");
        setEstimate(null);
        return;
      }
      setEstimate(data);
    } catch {
      setError("Error de red al calcular la estimación.");
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  }, [slug, format, resolution]);

  useEffect(() => {
    loadEstimate();
  }, [loadEstimate]);

  const generate = async () => {
    const plan = estimate?.plan;
    if (!plan) return;

    const confirmed = confirm(
      `Se va a generar un vídeo ${plan.format} en ${plan.resolutionLabel}.\n\n` +
        `· ${plan.usedPhotos} fotos · ${plan.durationLabel} de duración\n` +
        `· Peso estimado: ${plan.estimatedLabel} (${plan.rangeLabel})\n` +
        `· Nunca superará ${plan.maxLabel}\n` +
        `· Tardará unos ${plan.renderLabel} minutos:segundos\n\n` +
        `¿Continuar?`,
    );
    if (!confirmed) return;

    setGenerating(true);
    setError("");
    setGenerated(null);
    try {
      const res = await fetch(`/api/admin/properties/${slug}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, resolution }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar el vídeo.");
        return;
      }
      setGenerated({
        url: data.url,
        sizeLabel: data.sizeLabel,
        estimatedLabel: data.estimatedLabel,
        sizeDeviationPercent: data.sizeDeviationPercent,
        durationLabel: data.durationLabel,
        warnings: data.warnings ?? [],
      });
    } catch {
      setError(
        "Se perdió la conexión durante el render. El vídeo puede haberse " +
          "generado igualmente: recarga la ficha para comprobarlo.",
      );
    } finally {
      setGenerating(false);
    }
  };

  if (photoCount < 3) return null;

  const plan = estimate?.plan;
  const ffmpegMissing = estimate && !estimate.ffmpegAvailable;

  return (
    <div className="mt-4 rounded-xl border border-gold/20 bg-cream-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clapperboard size={16} className="text-gold-dark" />
        <h3 className="text-sm font-semibold text-ink">Vídeo automático</h3>
      </div>

      {ffmpegMissing && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>
            Falta <strong>ffmpeg</strong> en el servidor: instálalo en el VPS con{" "}
            <code className="rounded bg-amber-100 px-1">apt install ffmpeg</code>.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
          disabled={generating}
          className={boxCls}
        >
          <option value="horizontal">Horizontal 16:9</option>
          <option value="vertical">Vertical 9:16</option>
        </select>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as typeof resolution)}
          disabled={generating}
          className={boxCls}
        >
          <option value="fullhd">Full HD</option>
          <option value="4k">4K</option>
        </select>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-[12px] text-ink/50">
          <Loader2 size={13} className="animate-spin" /> Calculando…
        </p>
      ) : estimate && !estimate.ok ? (
        <p className="text-[12px] text-ink/60">{estimate.error}</p>
      ) : plan ? (
        <>
          {/* La estimación de peso, que es lo que hay que ver ANTES de generar. */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="text-ink/45">Fotos</dt>
              <dd className="font-medium text-ink">
                {plan.usedPhotos}
                {plan.droppedPhotos > 0 && (
                  <span className="text-ink/40"> de {plan.availablePhotos}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink/45">Duración</dt>
              <dd className="font-medium text-ink">{plan.durationLabel}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Va a pesar</dt>
              <dd className="font-semibold text-gold-dark">{plan.estimatedLabel}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Tardará</dt>
              <dd className="font-medium text-ink">≈ {plan.renderLabel}</dd>
            </div>
          </dl>

          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-ink/45">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Entre {plan.rangeLabel} según el detalle de las fotos; nunca más de{" "}
              {plan.maxLabel}. {plan.width}×{plan.height}.
              {plan.calibrated
                ? " Estimación ajustada con los vídeos ya generados."
                : " La estimación se afinará según se generen vídeos."}
              {estimate?.music ? ` Música: ${estimate.music.name}.` : " Sin música configurada."}
            </span>
          </p>

          {plan.warnings.map((warning) => (
            <p key={warning} className="mt-1.5 text-[11px] text-amber-700">
              ⚠ {warning}
            </p>
          ))}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={generating || !estimate?.ffmpegAvailable}
              className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
            >
              {generating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : hasExistingVideo || generated ? (
                <RefreshCw size={13} />
              ) : (
                <Play size={13} />
              )}
              {generating
                ? "Generando…"
                : hasExistingVideo || generated
                  ? "Regenerar vídeo"
                  : "Generar vídeo"}
            </button>

            {(hasExistingVideo || generated) && (
              <a
                href={`/api/admin/properties/${slug}/download-video?format=${format}`}
                className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
              >
                <Download size={13} className="text-gold-dark" />
                Descargar vídeo
              </a>
            )}
          </div>

          {generating && (
            <p className="mt-2 text-[11px] text-ink/45">
              El render ocupa la CPU del servidor unos {plan.renderLabel}. Puedes
              dejar esta pestaña abierta.
            </p>
          )}
        </>
      ) : null}

      {generated && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800">
          <p className="font-semibold">
            Vídeo generado · {generated.sizeLabel} · {generated.durationLabel}
          </p>
          <p className="mt-0.5 text-emerald-700/80">
            Estimado {generated.estimatedLabel} ({generated.sizeDeviationPercent > 0 ? "+" : ""}
            {generated.sizeDeviationPercent}% de desvío). Recarga la ficha para verlo
            en la lista de vídeos.
          </p>
          {generated.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-emerald-700/70">
              · {warning}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}
    </div>
  );
}
