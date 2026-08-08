import "server-only";
import { spawn } from "node:child_process";
import os from "node:os";

// Envoltorio fino sobre los binarios ffmpeg/ffprobe del VPS.
//
// No usamos ninguna librería wrapper: el grafo de filtros lo construimos a mano
// (ver render.ts) y aquí solo nos hace falta lanzar el proceso de forma segura.
// Siempre con `spawn` + array de argumentos (nunca shell), así una ruta de
// fichero con espacios o caracteres raros no puede convertirse en inyección.

export const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
export const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";

/**
 * Prioridad del proceso de render. El VPS sirve además la web con PM2, así que
 * ffmpeg (que satura todos los núcleos) va con prioridad baja para no dejar la
 * web sin CPU mientras renderiza.
 */
const RENDER_NICENESS = 12;

export class FfmpegError extends Error {
  readonly code: number | null;
  /** Últimas líneas de stderr: es donde ffmpeg explica por qué falló. */
  readonly stderrTail: string;

  constructor(message: string, code: number | null, stderrTail: string) {
    super(message);
    this.name = "FfmpegError";
    this.code = code;
    this.stderrTail = stderrTail;
  }
}

export class FfmpegMissingError extends Error {
  constructor(bin: string) {
    super(
      `No se encontró "${bin}" en el servidor. Instálalo en el VPS con ` +
        `"apt install ffmpeg" (o define FFMPEG_PATH/FFPROBE_PATH si está en otra ruta).`,
    );
    this.name = "FfmpegMissingError";
  }
}

type RunOptions = {
  /** Corta el proceso si tarda más de esto. */
  timeoutMs: number;
  /** Baja la prioridad del proceso (para renders largos). */
  lowPriority?: boolean;
  /** Recibe el progreso en segundos de vídeo ya codificados. */
  onProgress?: (seconds: number) => void;
};

function tail(text: string, lines = 25): string {
  return text.split("\n").slice(-lines).join("\n").trim();
}

/** Lanza un binario y resuelve con su stdout. Rechaza con FfmpegError si falla. */
function run(bin: string, args: string[], opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });

    if (opts.lowPriority && child.pid) {
      try {
        os.setPriority(child.pid, RENDER_NICENESS);
      } catch {
        // En algunos kernels/contenedores bajar la prioridad no está permitido.
        // No es motivo para abortar el render.
      }
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      // stderr de un render largo puede ocupar megas; guardamos solo la cola,
      // que es lo único que sirve para diagnosticar.
      stderr = (stderr + text).slice(-16_000);
      if (opts.onProgress) {
        // ffmpeg escribe "time=00:01:23.45" en cada línea de progreso.
        const match = /time=(\d+):(\d{2}):(\d{2})\.(\d{2})/.exec(text);
        if (match) {
          const [, h, m, s, cs] = match;
          opts.onProgress(
            Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100,
          );
        }
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") return reject(new FfmpegMissingError(bin));
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(
          new FfmpegError(
            `El proceso superó el tiempo máximo (${Math.round(opts.timeoutMs / 1000)}s) y se canceló.`,
            code,
            tail(stderr),
          ),
        );
      }
      if (code !== 0) {
        return reject(
          new FfmpegError(`${bin} terminó con código ${code}.`, code, tail(stderr)),
        );
      }
      resolve(stdout);
    });
  });
}

export function runFfmpeg(args: string[], opts: RunOptions): Promise<string> {
  // -nostdin evita que ffmpeg se quede esperando entrada si algo va mal, y
  // -y sobrescribe el fichero de salida temporal sin preguntar.
  return run(FFMPEG_BIN, ["-hide_banner", "-nostdin", "-y", ...args], opts);
}

export function runFfprobe(args: string[], timeoutMs = 30_000): Promise<string> {
  return run(FFPROBE_BIN, ["-hide_banner", ...args], { timeoutMs });
}

/** Duración en segundos de un fichero de audio/vídeo. null si no se puede leer. */
export async function probeDuration(filePath: string): Promise<number | null> {
  try {
    const out = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = Number.parseFloat(out.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/** ¿Tiene el fichero al menos una pista de audio? */
export async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const out = await runFfprobe([
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export type FfmpegAvailability =
  | { available: true; version: string }
  | { available: false; error: string };

/**
 * Comprueba que ffmpeg está instalado y utilizable. La UI lo llama antes de
 * ofrecer el botón de generar, para que el fallo salga como un aviso claro
 * ("instala ffmpeg en el VPS") y no como un error genérico a mitad del render.
 */
export async function checkFfmpeg(): Promise<FfmpegAvailability> {
  try {
    const out = await runFfmpeg(["-version"], { timeoutMs: 10_000 });
    const version = out.split("\n")[0]?.trim() || "ffmpeg";
    return { available: true, version };
  } catch (err) {
    if (err instanceof FfmpegMissingError) {
      return { available: false, error: err.message };
    }
    return {
      available: false,
      error: err instanceof Error ? err.message : "Error desconocido al ejecutar ffmpeg",
    };
  }
}
