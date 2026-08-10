"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clapperboard,
  Loader2,
  Music,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

// Música y ajustes de los vídeos automáticos de propiedad.
//
// Vive en la configuración de Idealista porque es desde ahí desde donde se
// gobierna la publicación en el portal, que es el destino de estos vídeos.

type Track = {
  id: string;
  name: string;
  fileName: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  active: boolean;
  isDefault: boolean;
};

type Settings = {
  enabled: boolean;
  secondsPerPhoto: number;
  transitionSeconds: number;
  maxPhotos: number;
  maxDurationSeconds: number;
  defaultFormat: "horizontal" | "vertical";
  defaultResolution: "fullhd" | "4k";
  musicVolume: number;
  logoOpacity: number;
  logoPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  regenerateOnPhotoChange: boolean;
  defaultMusicTrackId: string | null;
};

type Calibration = Partial<
  Record<"fullhd" | "4k", { measuredKbps: number; samples: number }>
>;

const inputCls =
  "w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none";
const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50";

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

export function VideoMusicSection() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [calibration, setCalibration] = useState<Calibration>({});
  const [ffmpeg, setFfmpeg] = useState<{ available: boolean; error?: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyTrack, setBusyTrack] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [musicRes, configRes] = await Promise.all([
        fetch("/api/admin/idealista/video-music"),
        fetch("/api/admin/idealista/video-config"),
      ]);
      const music = await musicRes.json();
      const config = await configRes.json();
      if (musicRes.ok) setTracks(music.tracks ?? []);
      if (configRes.ok) {
        setSettings(config.settings);
        setCalibration(config.calibration ?? {});
        setFfmpeg(config.ffmpeg);
      }
    } catch {
      setError("No se pudo cargar la configuración de vídeo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    setMessage("");

    let uploaded = 0;
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/admin/idealista/video-music", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) {
          setError(`${file.name}: ${data.error ?? "no se pudo subir"}`);
          continue;
        }
        uploaded++;
      } catch {
        setError(`${file.name}: error de red al subir.`);
      }
    }

    if (uploaded > 0) {
      setMessage(`${uploaded} pista(s) añadidas.`);
      await load();
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const patchTrack = async (id: string, patch: Record<string, unknown>) => {
    setBusyTrack(id);
    setError("");
    try {
      const res = await fetch("/api/admin/idealista/video-music", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "No se pudo actualizar la pista.");
      else await load();
    } catch {
      setError("Error de red al actualizar la pista.");
    } finally {
      setBusyTrack(null);
    }
  };

  const removeTrack = async (track: Track) => {
    if (!confirm(`¿Eliminar la pista "${track.name}"? No se puede deshacer.`)) return;
    setBusyTrack(track.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/idealista/video-music?id=${track.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "No se pudo eliminar la pista.");
      else await load();
    } catch {
      setError("Error de red al eliminar la pista.");
    } finally {
      setBusyTrack(null);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/idealista/video-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron guardar los ajustes.");
        return;
      }
      // El servidor devuelve los valores ya normalizados: si algo se salía de
      // rango, la UI debe reflejar lo que de verdad quedó guardado.
      setSettings(data.settings);
      setMessage("Ajustes de vídeo guardados.");
    } catch {
      setError("Error de red al guardar los ajustes.");
    } finally {
      setSavingSettings(false);
    }
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-2 flex items-center gap-2">
        <Clapperboard size={20} className="text-gold" />
        <h2 className="font-serif text-lg font-semibold text-ink">
          Vídeos automáticos de propiedad
        </h2>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Genera un vídeo con las fotos de la propiedad: zoom y paneo suaves,
        transiciones, el logo de la agencia y la música que subas aquí. La foto
        entra siempre entera, nunca recortada ni deformada.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </div>
      ) : (
        <div className="space-y-6">
          {ffmpeg && !ffmpeg.available && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Falta ffmpeg en el servidor</p>
                <p className="mt-1 text-amber-700/90">
                  Sin él no se puede generar ningún vídeo. Instálalo en el VPS
                  con <code className="rounded bg-amber-100 px-1">apt install ffmpeg</code>.
                </p>
                <p className="mt-1 text-[11px] text-amber-700/70">{ffmpeg.error}</p>
              </div>
            </div>
          )}

          {/* ── Música ─────────────────────────────────────────────── */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Music size={15} className="text-gold-dark" />
                Música ({tracks.length})
              </h3>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                Subir pistas
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".mp3,.m4a,.aac,.wav,.ogg,.flac,.mp4,audio/*"
                multiple
                hidden
                onChange={(e) => upload(e.target.files)}
              />
            </div>

            {tracks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink/15 p-5 text-center text-sm text-ink/45">
                Todavía no hay música. Sube tus pistas en MP3, WAV o MP4 — de
                los MP4 se extrae el audio automáticamente.
              </p>
            ) : (
              <ul className="space-y-2">
                {tracks.map((track) => (
                  <li
                    key={track.id}
                    className={`rounded-xl border p-3 transition ${
                      track.isDefault
                        ? "border-gold/45 bg-gold/5"
                        : "border-ink/10 bg-white"
                    } ${track.active ? "" : "opacity-55"}`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-[180px] flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink">{track.name}</span>
                          {track.isDefault && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-gold-dark">
                              <Star size={9} /> Por defecto
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink/45">
                          {formatSeconds(track.durationSeconds)} · {formatSize(track.sizeBytes)} ·{" "}
                          {track.fileName}
                        </p>
                      </div>

                      <audio
                        controls
                        preload="none"
                        src={`/api/admin/idealista/video-music/${track.id}/preview`}
                        className="h-8 max-w-[240px]"
                      />

                      <div className="flex items-center gap-1.5">
                        {!track.isDefault && (
                          <button
                            type="button"
                            onClick={() => patchTrack(track.id, { isDefault: true })}
                            disabled={busyTrack === track.id}
                            title="Usar por defecto"
                            className="rounded-lg border border-gold/30 p-2 text-gold-dark transition hover:bg-gold/10 disabled:opacity-40"
                          >
                            <Star size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => patchTrack(track.id, { active: !track.active })}
                          disabled={busyTrack === track.id || track.isDefault}
                          title={
                            track.isDefault
                              ? "La pista por defecto no se puede desactivar"
                              : track.active
                                ? "Desactivar"
                                : "Activar"
                          }
                          className="rounded-lg border border-ink/15 px-2.5 py-2 text-[11px] font-medium text-ink/70 transition hover:bg-ink/5 disabled:opacity-40"
                        >
                          {track.active ? "Activa" : "Inactiva"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTrack(track)}
                          disabled={busyTrack === track.id}
                          title="Eliminar"
                          className="rounded-lg border border-red-200 p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Ajustes ────────────────────────────────────────────── */}
          {settings && (
            <section className="border-t border-ink/10 pt-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Ajustes del vídeo</h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Formato por defecto</label>
                  <select
                    value={settings.defaultFormat}
                    onChange={(e) =>
                      set("defaultFormat", e.target.value as Settings["defaultFormat"])
                    }
                    className={inputCls}
                  >
                    <option value="horizontal">Horizontal 16:9 (web, portales)</option>
                    <option value="vertical">Vertical 9:16 (Reels, Stories)</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Resolución por defecto</label>
                  <select
                    value={settings.defaultResolution}
                    onChange={(e) =>
                      set("defaultResolution", e.target.value as Settings["defaultResolution"])
                    }
                    className={inputCls}
                  >
                    <option value="fullhd">Full HD 1080p</option>
                    <option value="4k">4K 2160p (mucho más lento)</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Segundos por foto</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="15"
                    value={settings.secondsPerPhoto}
                    onChange={(e) => set("secondsPerPhoto", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Duración de la transición (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="3"
                    value={settings.transitionSeconds}
                    onChange={(e) => set("transitionSeconds", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Máximo de fotos</label>
                  <input
                    type="number"
                    min="3"
                    max="100"
                    value={settings.maxPhotos}
                    onChange={(e) => set("maxPhotos", Number(e.target.value))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Duración máxima (segundos)</label>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={settings.maxDurationSeconds}
                    onChange={(e) => set("maxDurationSeconds", Number(e.target.value))}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-ink/45">
                    {formatSeconds(settings.maxDurationSeconds)} — se descartan las
                    fotos que no quepan.
                  </p>
                </div>

                <div>
                  <label className={labelCls}>
                    Volumen de la música · {Math.round(settings.musicVolume * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.musicVolume}
                    onChange={(e) => set("musicVolume", Number(e.target.value))}
                    className="w-full accent-gold-dark"
                  />
                </div>

                <div>
                  <label className={labelCls}>
                    Opacidad del logo · {Math.round(settings.logoOpacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.logoOpacity}
                    onChange={(e) => set("logoOpacity", Number(e.target.value))}
                    className="w-full accent-gold-dark"
                  />
                </div>

                <div>
                  <label className={labelCls}>Posición del logo</label>
                  <select
                    value={settings.logoPosition}
                    onChange={(e) =>
                      set("logoPosition", e.target.value as Settings["logoPosition"])
                    }
                    className={inputCls}
                  >
                    <option value="top-right">Arriba a la derecha</option>
                    <option value="top-left">Arriba a la izquierda</option>
                    <option value="bottom-right">Abajo a la derecha</option>
                    <option value="bottom-left">Abajo a la izquierda</option>
                  </select>
                  <p className="mt-1 text-[11px] text-ink/45">
                    Arriba se ve mejor: abajo suele caer el suelo o el mobiliario, y
                    los reproductores tapan esa zona con sus controles.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <label className="flex items-start gap-2.5 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => set("enabled", e.target.checked)}
                    className="mt-0.5 accent-gold-dark"
                  />
                  <span>
                    Generar vídeos automáticamente para las propiedades de Idealista
                    <span className="block text-[11px] text-ink/45">
                      Se encolan y se renderizan de uno en uno para no saturar el
                      servidor.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-sm text-ink/80">
                  <input
                    type="checkbox"
                    checked={settings.regenerateOnPhotoChange}
                    onChange={(e) => set("regenerateOnPhotoChange", e.target.checked)}
                    className="mt-0.5 accent-gold-dark"
                  />
                  <span>
                    Rehacer el vídeo cuando cambien las fotos
                    <span className="block text-[11px] text-ink/45">
                      Solo se regenera si las fotos han cambiado de verdad, no en
                      cada sincronización.
                    </span>
                  </span>
                </label>
              </div>

              {(calibration.fullhd || calibration["4k"]) && (
                <div className="mt-4 rounded-xl bg-ink/[0.03] p-3 text-[11px] text-ink/55">
                  <p className="font-semibold text-ink/70">
                    Precisión del peso estimado
                  </p>
                  <p className="mt-1">
                    El sistema mide el peso real de cada vídeo para afinar la
                    estimación que ves antes de generar.
                    {calibration.fullhd &&
                      ` Full HD: ${(calibration.fullhd.measuredKbps / 1000).toFixed(1)} Mbps sobre ${calibration.fullhd.samples} vídeo(s).`}
                    {calibration["4k"] &&
                      ` 4K: ${(calibration["4k"].measuredKbps / 1000).toFixed(1)} Mbps sobre ${calibration["4k"].samples} vídeo(s).`}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={saveSettings}
                disabled={savingSettings}
                className="mt-4 flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Guardar ajustes de vídeo
              </button>
            </section>
          )}

          {message && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check size={14} /> {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
