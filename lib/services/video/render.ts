import "server-only";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUPERSAMPLE, MAX_ZOOM } from "./config";
import { buildLogoOverlay, buildPhotoCanvas, canvasSize } from "./canvas";
import { runFfmpeg } from "./ffmpeg";
import type { VideoPlan } from "./plan";

// Render del vídeo con ffmpeg a partir de un VideoPlan ya cerrado.
//
// Este módulo NO decide nada: cuántas fotos entran, cuánto dura y con qué
// bitrate se codifica viene todo del plan (ver plan.ts), que es el mismo que se
// le enseñó al usuario al estimar el peso. Aquí solo se construye el grafo de
// filtros y se ejecuta.

/** Cuánto tarda el render por segundo de vídeo, para dimensionar el timeout. */
const TIMEOUT_FACTOR: Record<string, number> = { fullhd: 15, "4k": 50 };
const MIN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 3 * 60 * 60 * 1000;

/** Fundidos de la música. */
const AUDIO_FADE_IN = 1.5;
const AUDIO_FADE_OUT = 2.5;

export type RenderInput = {
  plan: VideoPlan;
  /** Fotos ya descargadas. Su número debe coincidir con `plan.usedPhotos`. */
  photos: Buffer[];
  /** Pista de música ya descargada (mp3/m4a/mp4…). */
  music?: { buffer: Buffer; fileName: string } | null;
  /** Progreso 0–100 mientras codifica. */
  onProgress?: (percent: number) => void;
};

export type RenderOutput = {
  buffer: Buffer;
  sizeBytes: number;
  durationSeconds: number;
};

/**
 * Movimiento de cámara de cada foto. Se alterna de forma determinista (por
 * índice, no al azar) para que dos renders de la misma propiedad salgan
 * idénticos y para que el vídeo no repita siempre el mismo gesto.
 */
type Motion = "zoom-in" | "zoom-out" | "pan-right" | "pan-left";

const MOTIONS: Motion[] = ["zoom-in", "pan-right", "zoom-out", "pan-left"];

/**
 * Expresiones de `zoompan` para un movimiento.
 *
 * Se interpola el número de fotogramas como literal y se usa `on` (número de
 * fotograma de salida) para que el recorrido sea LINEAL. La forma habitual
 * (`z='min(zoom+0.0015,1.15)'`) acumula sobre el fotograma anterior y produce
 * el temblor típico de los slideshows mal hechos.
 */
function zoompanExpressions(motion: Motion, frames: number) {
  // Con un solo fotograma no hay interpolación posible; evita dividir por cero.
  const last = Math.max(1, frames - 1);
  const amplitude = MAX_ZOOM - 1;

  switch (motion) {
    case "zoom-in":
      return {
        z: `1+${amplitude.toFixed(4)}*on/${last}`,
        x: "(iw-iw/zoom)/2",
        y: "(ih-ih/zoom)/2",
      };
    case "zoom-out":
      return {
        z: `${MAX_ZOOM.toFixed(4)}-${amplitude.toFixed(4)}*on/${last}`,
        x: "(iw-iw/zoom)/2",
        y: "(ih-ih/zoom)/2",
      };
    case "pan-right":
      return {
        z: `${MAX_ZOOM.toFixed(4)}`,
        x: `(iw-iw/zoom)*on/${last}`,
        y: "(ih-ih/zoom)/2",
      };
    case "pan-left":
      return {
        z: `${MAX_ZOOM.toFixed(4)}`,
        x: `(iw-iw/zoom)*(1-on/${last})`,
        y: "(ih-ih/zoom)/2",
      };
  }
}

/**
 * Transición entre la foto i e i+1. Mayoría de fundidos (lo natural en
 * inmobiliaria) con un desplazamiento suave cada tres para dar ritmo.
 * Todas existen en ffmpeg ≥ 4.3.
 */
function transitionAt(index: number): string {
  if (index % 3 !== 2) return "fade";
  return index % 6 === 2 ? "smoothleft" : "smoothright";
}

/** Construye el `-filter_complex` completo. */
function buildFilterGraph(
  plan: VideoPlan,
  photoCount: number,
  logo: { index: number; padding: number } | null,
  musicIndex: number | null,
): { filter: string; videoLabel: string; audioLabel: string | null } {
  const parts: string[] = [];
  const framesPerPhoto = Math.round(plan.secondsPerPhoto * plan.fps);

  // 1) Cada foto → clip animado a la resolución final.
  for (let i = 0; i < photoCount; i++) {
    const { z, x, y } = zoompanExpressions(MOTIONS[i % MOTIONS.length], framesPerPhoto);
    parts.push(
      `[${i}:v]zoompan=z='${z}':x='${x}':y='${y}':d=${framesPerPhoto}:` +
        `s=${plan.width}x${plan.height}:fps=${plan.fps},setsar=1[v${i}]`,
    );
  }

  // 2) Encadenado con transiciones.
  //
  // Cada xfade solapa `T` segundos, así que la salida acumulada tras k
  // transiciones dura k·(D−T)+D y el siguiente fundido arranca en k·(D−T).
  let current = "v0";
  if (photoCount === 1) {
    // Sin transiciones que encadenar.
  } else {
    const step = plan.secondsPerPhoto - plan.transitionSeconds;
    for (let i = 1; i < photoCount; i++) {
      const label = i === photoCount - 1 ? "chain" : `x${i}`;
      const offset = (i * step).toFixed(3);
      parts.push(
        `[${current}][v${i}]xfade=transition=${transitionAt(i - 1)}:` +
          `duration=${plan.transitionSeconds}:offset=${offset}[${label}]`,
      );
      current = label;
    }
  }

  // 3) Logo de la agencia, abajo a la derecha, durante todo el vídeo.
  //    Se descuenta el `padding` del halo para que el margen visible sea el
  //    previsto y no el del lienzo transparente que lo rodea.
  let videoLabel = current;
  if (logo) {
    const margin = Math.max(0, Math.round(plan.width * 0.035) - logo.padding);
    parts.push(
      `[${current}][${logo.index}:v]overlay=W-w-${margin}:H-h-${margin}:format=auto[outv]`,
    );
    videoLabel = "outv";
  }

  // 4) Música con fundido de entrada y salida.
  let audioLabel: string | null = null;
  if (musicIndex !== null) {
    const fadeOutStart = Math.max(0, plan.durationSeconds - AUDIO_FADE_OUT).toFixed(3);
    parts.push(
      `[${musicIndex}:a]volume=${plan.audioVolume ?? 1},` +
        `afade=t=in:st=0:d=${AUDIO_FADE_IN},` +
        `afade=t=out:st=${fadeOutStart}:d=${AUDIO_FADE_OUT},` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[outa]`,
    );
    audioLabel = "outa";
  }

  return { filter: parts.join(";"), videoLabel, audioLabel };
}

function timeoutFor(plan: VideoPlan): number {
  const factor = TIMEOUT_FACTOR[plan.resolution] ?? 20;
  const estimate = plan.durationSeconds * factor * 1000;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, estimate));
}

/**
 * Renderiza el vídeo. Todo el trabajo intermedio vive en un directorio temporal
 * que se borra siempre, también si el render falla.
 */
export async function renderPropertyVideo(input: RenderInput): Promise<RenderOutput> {
  const { plan, photos, music, onProgress } = input;

  if (photos.length === 0) {
    throw new Error("No hay fotos que renderizar.");
  }
  if (photos.length !== plan.usedPhotos) {
    throw new Error(
      `El plan esperaba ${plan.usedPhotos} fotos y se recibieron ${photos.length}.`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "propvid-"));
  try {
    const framesDir = join(dir, "frames");
    await mkdir(framesDir, { recursive: true });

    // 1) Encuadre de cada foto (sharp), en serie para no disparar la memoria
    //    con 40 lienzos de 4K a la vez.
    const target = canvasSize(plan.width, plan.height, SUPERSAMPLE);
    const framePaths: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const canvas = await buildPhotoCanvas(photos[i], target);
      const path = join(framesDir, `${String(i).padStart(4, "0")}.jpg`);
      await writeFile(path, canvas);
      framePaths.push(path);
    }

    // 2) Logo y música a disco.
    const logo = await buildLogoOverlay(plan.width, plan.logoOpacity);
    let logoPath: string | null = null;
    if (logo) {
      logoPath = join(dir, "logo.png");
      await writeFile(logoPath, logo.buffer);
    }

    let musicPath: string | null = null;
    if (music) {
      // Conservamos la extensión original: ffmpeg elige el demuxer por
      // contenido, pero una extensión coherente evita sorpresas con .mp4.
      const ext = music.fileName.match(/\.[a-z0-9]{2,4}$/i)?.[0] ?? ".mp3";
      musicPath = join(dir, `music${ext.toLowerCase()}`);
      await writeFile(musicPath, music.buffer);
    }

    // 3) Argumentos de entrada, en el mismo orden en que los indexa el grafo.
    const inputArgs: string[] = [];
    for (const path of framePaths) {
      inputArgs.push("-i", path);
    }

    let logoInput: { index: number; padding: number } | null = null;
    if (logoPath && logo) {
      logoInput = { index: framePaths.length, padding: logo.padding };
      // -loop 1: el logo es una imagen fija y tiene que verse todo el vídeo.
      inputArgs.push("-loop", "1", "-i", logoPath);
    }

    let musicIndex: number | null = null;
    if (musicPath) {
      musicIndex = framePaths.length + (logoPath ? 1 : 0);
      // -stream_loop -1: si la pista es más corta que el vídeo, se repite.
      inputArgs.push("-stream_loop", "-1", "-i", musicPath);
    }

    const { filter, videoLabel, audioLabel } = buildFilterGraph(
      plan,
      framePaths.length,
      logoInput,
      musicIndex,
    );

    const outputPath = join(dir, "out.mp4");
    const bufsize = plan.videoBitrateCapKbps * 2;

    const args = [
      ...inputArgs,
      "-filter_complex",
      filter,
      "-map",
      `[${videoLabel}]`,
      ...(audioLabel ? ["-map", `[${audioLabel}]`] : ["-an"]),
      "-c:v",
      "libx264",
      "-preset",
      plan.preset,
      "-crf",
      String(plan.crf),
      // Techo de bitrate: es el que se usó para prometer el peso máximo.
      "-maxrate",
      `${plan.videoBitrateCapKbps}k`,
      "-bufsize",
      `${bufsize}k`,
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(plan.fps),
      "-g",
      String(plan.fps * 2),
      ...(audioLabel
        ? ["-c:a", "aac", "-b:a", `${plan.audioBitrateKbps}k`, "-ar", "48000"]
        : []),
      // Duración exacta del plan: no dependemos de que las entradas infinitas
      // (logo y música en bucle) terminen por su cuenta.
      "-t",
      String(plan.durationSeconds),
      // faststart mueve el índice al principio: el vídeo empieza a reproducirse
      // sin descargarse entero (importante en la ficha pública).
      "-movflags",
      "+faststart",
      outputPath,
    ];

    await runFfmpeg(args, {
      timeoutMs: timeoutFor(plan),
      lowPriority: true,
      onProgress: onProgress
        ? (seconds) => {
            const pct = Math.min(99, (seconds / plan.durationSeconds) * 100);
            onProgress(Math.max(0, Math.round(pct)));
          }
        : undefined,
    });

    const info = await stat(outputPath);
    if (info.size === 0) {
      throw new Error("ffmpeg generó un fichero vacío.");
    }

    const buffer = await readFile(outputPath);
    onProgress?.(100);

    return {
      buffer,
      sizeBytes: info.size,
      durationSeconds: plan.durationSeconds,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      // Un temporal que no se pudo borrar no debe tumbar un render correcto.
    });
  }
}
