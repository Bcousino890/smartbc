import "server-only";
import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Envoltorio fino sobre los binarios ffmpeg/ffprobe del VPS.
//
// No usamos ninguna librería wrapper: el grafo de filtros lo construimos a mano
// (ver render.ts) y aquí solo nos hace falta lanzar el proceso de forma segura.
// Siempre con `spawn` + array de argumentos (nunca shell), así una ruta de
// fichero con espacios o caracteres raros no puede convertirse en inyección.

/**
 * Directorios donde buscamos los binarios ADEMÁS del PATH del proceso.
 *
 * Esto no es paranoia: el proceso lo arranca el demonio de PM2, que hereda el
 * PATH que tenía cuando se arrancó ÉL (a menudo el de un cron o un servicio de
 * systemd: solo `/usr/bin:/bin`). Un `apt install ffmpeg` deja el binario en
 * `/usr/bin`, pero un build estático, un `snap` o un `brew` lo dejan en sitios
 * que ese PATH heredado no incluye — y desde fuera parece "no está instalado"
 * aunque en la shell del admin `ffmpeg -version` responda perfectamente.
 */
const EXTRA_BIN_DIRS = [
  "/usr/bin",
  "/bin",
  "/usr/local/bin",
  "/snap/bin",
  "/usr/sbin",
  "/opt/ffmpeg/bin",
  "/opt/ffmpeg",
  "/opt/bin",
  "/home/linuxbrew/.linuxbrew/bin",
  "/opt/homebrew/bin",
];

export type BinName = "ffmpeg" | "ffprobe";

function envOverride(bin: BinName): string | null {
  const raw = bin === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  return raw && raw.trim() ? raw.trim() : null;
}

/** PATH del proceso + rutas habituales, sin duplicados y en ese orden. */
export function binSearchDirs(): string[] {
  const fromPath = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return [...new Set([...fromPath, ...EXTRA_BIN_DIRS])];
}

/** Rutas absolutas candidatas para un binario, en orden de preferencia. */
export function binCandidates(bin: BinName): string[] {
  const override = envOverride(bin);
  if (override) return [override];
  return binSearchDirs().map((dir) => path.join(dir, bin));
}

// Solo se cachea el ACIERTO: si hoy no está y mañana el admin lo instala, la
// siguiente comprobación lo encuentra sin reiniciar PM2. Cachear el fallo sería
// justo lo contrario de lo que queremos.
const resolved = new Map<BinName, string>();

/**
 * Ruta ejecutable del binario, o `null` si no aparece por ningún lado.
 * Se comprueba el bit de ejecución, no solo la existencia: un binario sin
 * permisos falla igual, pero con otro error.
 */
export async function resolveBin(bin: BinName): Promise<string | null> {
  const cached = resolved.get(bin);
  if (cached) return cached;

  for (const candidate of binCandidates(bin)) {
    try {
      await access(candidate, constants.X_OK);
      resolved.set(bin, candidate);
      return candidate;
    } catch {
      // Siguiente candidato.
    }
  }
  return null;
}

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
  /** Dónde se buscó, para que el aviso sea accionable y no un "no está". */
  readonly searched: string[];

  constructor(bin: string, searched: string[] = binSearchDirs()) {
    super(
      `No se encontró "${bin}" en el servidor (buscado en ${searched.length} ` +
        `directorios: ${searched.slice(0, 6).join(", ")}…). Instálalo en el VPS con ` +
        `"apt install ffmpeg" y reinicia PM2 con "pm2 restart smartbc-main --update-env" ` +
        `(o define FFMPEG_PATH/FFPROBE_PATH si está en otra ruta).`,
    );
    this.name = "FfmpegMissingError";
    this.searched = searched;
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

export async function runFfmpeg(args: string[], opts: RunOptions): Promise<string> {
  const bin = await resolveBin("ffmpeg");
  if (!bin) throw new FfmpegMissingError("ffmpeg");
  // -nostdin evita que ffmpeg se quede esperando entrada si algo va mal, y
  // -y sobrescribe el fichero de salida temporal sin preguntar.
  return run(bin, ["-hide_banner", "-nostdin", "-y", ...args], opts);
}

export async function runFfprobe(args: string[], timeoutMs = 30_000): Promise<string> {
  const bin = await resolveBin("ffprobe");
  if (!bin) throw new FfmpegMissingError("ffprobe");
  return run(bin, ["-hide_banner", ...args], { timeoutMs });
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
  } catch (err) {
    // Si ffprobe no está instalado no sabemos si hay audio o no — no es lo
    // mismo que "sin pista de audio". Se relanza para que el llamador (que ya
    // sabe tratar ese caso sin bloquear la subida) lo distinga de un fichero
    // realmente mudo o corrupto.
    if (err instanceof FfmpegMissingError) throw err;
    return false;
  }
}

export type FfmpegAvailability =
  | { available: true; version: string }
  | { available: false; error: string };

/**
 * Comprueba que ffmpeg Y ffprobe están instalados y son utilizables. La UI lo
 * llama antes de ofrecer el botón de generar, para que el fallo salga como un
 * aviso claro y no como un error genérico a mitad del render.
 *
 * Se comprueban los dos porque van por separado más veces de lo que parece:
 * algunos builds estáticos y algunos paquetes mínimos traen `ffmpeg` pero no
 * `ffprobe`, y el render necesita los dos (ffprobe mide la música).
 */
export async function checkFfmpeg(): Promise<FfmpegAvailability> {
  try {
    const out = await runFfmpeg(["-version"], { timeoutMs: 10_000 });
    const version = out.split("\n")[0]?.trim() || "ffmpeg";

    const probe = await resolveBin("ffprobe");
    if (!probe) {
      return {
        available: false,
        error:
          `ffmpeg está instalado (${version}) pero falta "ffprobe", que también ` +
          `hace falta para renderizar. El paquete "ffmpeg" de apt trae los dos; ` +
          `si usas un build estático, copia también el binario ffprobe.`,
      };
    }

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

export type FfmpegBinDiagnosis = {
  bin: BinName;
  /** Ruta que se usaría, o null si no aparece por ningún lado. */
  resolved: string | null;
  /** Fijado por FFMPEG_PATH / FFPROBE_PATH (entonces no se busca en el PATH). */
  fromEnv: string | null;
  /** Rutas que existen en disco, con su estado de permisos. */
  found: { path: string; executable: boolean }[];
  /** Primera línea de `-version`, o el error exacto al ejecutarlo. */
  version: string | null;
  execError: string | null;
};

export type FfmpegDiagnosis = {
  ok: boolean;
  /** El PATH que ve el proceso de Node, que NO es el de la shell del admin. */
  path: string;
  searchedDirs: string[];
  /** Si esto es true, un `apt install` en el host no afecta a este proceso. */
  insideContainer: boolean;
  process: {
    platform: string;
    node: string;
    uid: number | null;
    user: string | null;
    cwd: string;
    /** Segundos que lleva vivo: si es alto, arrancó antes de instalar nada. */
    uptimeSeconds: number;
  };
  binaries: FfmpegBinDiagnosis[];
  /** Qué hacer, en cristiano, según lo que se ha encontrado. */
  verdict: string;
};

async function diagnoseBin(bin: BinName): Promise<FfmpegBinDiagnosis> {
  const fromEnv = envOverride(bin);
  const found: { path: string; executable: boolean }[] = [];

  for (const candidate of binCandidates(bin)) {
    try {
      await access(candidate, constants.F_OK);
    } catch {
      continue;
    }
    let executable = true;
    try {
      await access(candidate, constants.X_OK);
    } catch {
      executable = false;
    }
    found.push({ path: candidate, executable });
  }

  const resolvedPath = found.find((f) => f.executable)?.path ?? null;
  let version: string | null = null;
  let execError: string | null = null;

  if (resolvedPath) {
    try {
      const out = await run(resolvedPath, ["-hide_banner", "-version"], {
        timeoutMs: 10_000,
      });
      version = out.split("\n")[0]?.trim() ?? null;
    } catch (err) {
      // Aquí caen los casos que "existe pero no funciona": librería compartida
      // que falta, binario para otra arquitectura, cgroup sin memoria, etc.
      execError =
        err instanceof FfmpegError
          ? `${err.message} ${err.stderrTail}`.trim()
          : err instanceof Error
            ? `${(err as NodeJS.ErrnoException).code ?? ""} ${err.message}`.trim()
            : "Error desconocido";
    }
  }

  return { bin, resolved: resolvedPath, fromEnv, found, version, execError };
}

async function isInsideContainer(): Promise<boolean> {
  try {
    await access("/.dockerenv", constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnóstico completo: no se limita a decir "no está", enseña DÓNDE se ha
 * buscado, con qué PATH y con qué usuario. Es lo único que distingue los tres
 * fallos que se ven igual desde el panel: no instalado, instalado pero fuera
 * del PATH que heredó PM2, e instalado pero no ejecutable por este usuario.
 */
export async function diagnoseFfmpeg(): Promise<FfmpegDiagnosis> {
  // Sin caché a propósito: este endpoint se llama justo después de instalar.
  resolved.clear();

  const [ffmpeg, ffprobe, insideContainer] = await Promise.all([
    diagnoseBin("ffmpeg"),
    diagnoseBin("ffprobe"),
    isInsideContainer(),
  ]);

  const binaries = [ffmpeg, ffprobe];
  const ok = binaries.every((b) => b.version !== null);

  let verdict: string;
  if (ok) {
    verdict = `Todo correcto: ${ffmpeg.resolved} y ${ffprobe.resolved} responden.`;
  } else {
    const missing = binaries.filter((b) => b.found.length === 0).map((b) => b.bin);
    const notExecutable = binaries.filter(
      (b) => b.found.length > 0 && !b.resolved,
    );
    const broken = binaries.filter((b) => b.resolved && b.execError);

    if (broken.length > 0) {
      verdict =
        `El binario existe (${broken[0].resolved}) pero falla al ejecutarse: ` +
        `${broken[0].execError}. Suele ser un build estático incompatible o una ` +
        `librería del sistema que falta; reinstala con "apt install --reinstall ffmpeg".`;
    } else if (notExecutable.length > 0) {
      verdict =
        `${notExecutable[0].found[0].path} existe pero el usuario del proceso ` +
        `(${os.userInfo().username}) no puede ejecutarlo. Arréglalo con ` +
        `"chmod +x ${notExecutable[0].found[0].path}".`;
    } else if (insideContainer) {
      verdict =
        `No se encontró ${missing.join(" ni ")} y este proceso corre DENTRO de un ` +
        `contenedor: instalarlo en el host no sirve, hay que instalarlo en la ` +
        `imagen del contenedor (o montar el binario dentro).`;
    } else {
      verdict =
        `No se encontró ${missing.join(" ni ")} en ninguno de los ${binSearchDirs().length} ` +
        `directorios buscados. Si en la shell del VPS "which ffmpeg" SÍ responde, ` +
        `el binario está en un directorio que este proceso no ve: reinicia PM2 con ` +
        `"pm2 restart smartbc-main --update-env" (el demonio de PM2 conserva el PATH ` +
        `con el que arrancó) o define FFMPEG_PATH y FFPROBE_PATH con la ruta absoluta. ` +
        `Si no responde, instálalo: "sudo apt update && sudo apt install -y ffmpeg".`;
    }
  }

  return {
    ok,
    path: process.env.PATH ?? "",
    searchedDirs: binSearchDirs(),
    insideContainer,
    process: {
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      uid: typeof process.getuid === "function" ? process.getuid() : null,
      user: (() => {
        try {
          return os.userInfo().username;
        } catch {
          return null;
        }
      })(),
      cwd: process.cwd(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    binaries,
    verdict,
  };
}
