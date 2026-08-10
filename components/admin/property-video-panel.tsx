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

type Job = {
  id: string;
  status: "pending" | "processing" | "done" | "error" | "cancelled";
  error: string | null;
  url: string | null;
  queuePosition: number | null;
  sizeLabel: string | null;
  estimatedLabel: string | null;
  durationLabel: string | null;
};

/** Cada cuánto se pregunta por el estado mientras el vídeo se genera. */
const POLL_MS = 4000;

const boxCls =
  "rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none";

export type VideoSubjectRef =
  | { type: "property"; slug: string }
  | { type: "listing"; id: string };

function apiBase(subject: VideoSubjectRef): string {
  return subject.type === "property"
    ? `/api/admin/properties/${subject.slug}`
    : `/api/admin/idealista/listings/${subject.id}`;
}

export function PropertyVideoPanel({
  subject,
  photoCount,
  hasExistingVideo = false,
}: {
  subject: VideoSubjectRef;
  /** Si no se pasa, no se aplica el filtro de "mínimo 3 fotos": lo decide el servidor. */
  photoCount?: number;
  hasExistingVideo?: boolean;
}) {
  const [format, setFormat] = useState<"horizontal" | "vertical">("horizontal");
  const [resolution, setResolution] = useState<"fullhd" | "4k">("fullhd");
  const base = apiBase(subject);

  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  // El render no ocurre dentro de la petición que lo pide (tardaría minutos y
  // moriría en el timeout del proxy): se encola y aquí se consulta su estado.
  const running = job?.status === "pending" || job?.status === "processing";

  const loadEstimate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${base}/video?format=${format}&resolution=${resolution}`,
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
  }, [base, format, resolution]);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`${base}/video/job`);
      if (!res.ok) return;
      const data = await res.json();
      setJob(data.job ?? null);
    } catch {
      // Un sondeo fallido no es motivo de alarma: se reintenta al siguiente.
    }
  }, [base]);

  useEffect(() => {
    loadEstimate();
    loadJob();
  }, [loadEstimate, loadJob]);

  // Mientras haya un render en cola o en marcha se pregunta cada pocos
  // segundos; al terminar, el intervalo se detiene solo.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(loadJob, POLL_MS);
    return () => clearInterval(timer);
  }, [running, loadJob]);

  const generate = async () => {
    const plan = estimate?.plan;
    if (!plan) return;

    const confirmed = confirm(
      `Se va a generar un vídeo ${plan.format} en ${plan.resolutionLabel}.\n\n` +
        `· ${plan.usedPhotos} fotos · ${plan.durationLabel} de duración\n` +
        `· Peso estimado: ${plan.estimatedLabel} (entre ${plan.rangeLabel})\n` +
        `· Nunca superará ${plan.maxLabel}\n` +
        `· Tardará alrededor de ${plan.renderLabel} (min:seg)\n\n` +
        `¿Continuar?`,
    );
    if (!confirmed) return;

    setError("");
    // Estado optimista para que el panel entre en modo "en curso" de
    // inmediato, sin esperar al primer sondeo.
    setJob({
      id: "pending",
      status: "pending",
      error: null,
      url: null,
      queuePosition: null,
      sizeLabel: null,
      estimatedLabel: null,
      durationLabel: null,
    });

    try {
      const res = await fetch(`${base}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, resolution }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo encolar el vídeo.");
        setJob(null);
        return;
      }
      await loadJob();
    } catch {
      setError("Error de red al encolar el vídeo.");
      setJob(null);
    }
  };

  if (photoCount !== undefined && photoCount < 3) return null;

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
          disabled={running}
          className={boxCls}
        >
          <option value="horizontal">Horizontal 16:9</option>
          <option value="vertical">Vertical 9:16</option>
        </select>
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value as typeof resolution)}
          disabled={running}
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
              disabled={running || !estimate?.ffmpegAvailable}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-cream-50 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {running ? (
                <Loader2 size={13} className="animate-spin" />
              ) : hasExistingVideo || job?.status === "done" ? (
                <RefreshCw size={13} />
              ) : (
                <Play size={13} />
              )}
              {running
                ? job?.status === "processing"
                  ? "Generando…"
                  : "En cola…"
                : hasExistingVideo || job?.status === "done"
                  ? "Regenerar vídeo"
                  : "Generar vídeo"}
            </button>

            {(hasExistingVideo || job?.status === "done") && (
              <a
                href={`${base}/download-video?format=${format}`}
                className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-cream-50 px-4 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
              >
                <Download size={13} className="text-gold-dark" />
                Descargar vídeo
              </a>
            )}
          </div>

          {running && (
            <p className="mt-2 text-[11px] text-ink/50">
              {job?.status === "processing"
                ? `Renderizando en el servidor, tarda alrededor de ${plan.renderLabel}. `
                : job?.queuePosition
                  ? `En cola, con ${job.queuePosition} vídeo(s) por delante. `
                  : "En cola. "}
              Puedes cerrar esta página: el render sigue en el servidor y el vídeo
              aparecerá en la ficha al terminar.
            </p>
          )}
        </>
      ) : null}

      {job?.status === "done" && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800">
          <p className="font-semibold">
            Vídeo generado
            {job.sizeLabel ? ` · ${job.sizeLabel}` : ""}
            {job.durationLabel ? ` · ${job.durationLabel}` : ""}
          </p>
          <p className="mt-0.5 text-emerald-700/80">
            {job.estimatedLabel && `Se había estimado ${job.estimatedLabel}. `}
            Recarga la ficha para verlo en la lista de vídeos.
          </p>
        </div>
      )}

      {job?.status === "error" && job.error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          <p className="font-semibold">No se pudo generar el vídeo</p>
          <p className="mt-0.5">{job.error}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
      )}
    </div>
  );
}
