import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// Fetch usando el binario `curl` del sistema en lugar de `fetch`/undici.
//
// Por qué: DataDome (anti-bot de Idealista) valida el TLS fingerprint (JA3)
// además del User-Agent. El UA de WhatsApp pasa SOLO si el handshake TLS
// coincide con el de un cliente "real" como curl. undici (el fetch de
// Node) tiene un JA3 distinto que DataDome rechaza aunque mandemos el UA de
// WhatsApp. curl, en cambio, pasa de forma consistente (verificado).
//
// Seguridad: usamos execFile con argumentos como array (NO shell), así la
// URL nunca se interpola en una shell y no hay riesgo de command injection.

const MAX_BUFFER = 12 * 1024 * 1024; // 12 MB — fichas Idealista pesan ~250KB

export type CurlFetchResult =
  | { ok: true; html: string }
  | { ok: false; status: number; reason: string };

export type CurlFetchOptions = {
  timeoutSec?: number;
  // Proxy residencial. Recomendado: la IP del datacenter (Hetzner) se
  // "quema" en DataDome tras varias requests; el proxy da IPs residenciales
  // rotativas que no se queman.
  proxyUrl?: string;
  // Reintentos: la primera conexión vía proxy a veces falla con error TLS
  // transitorio ("unexpected eof"). Reintentar lo resuelve.
  retries?: number;
  // Cabeceras extra ("Nombre: valor"). Necesarias para los endpoints AJAX
  // de Idealista (Referer + X-Requested-With).
  headers?: string[];
  // Los endpoints AJAX devuelven JSON corto (<200 chars); con esto no se
  // rechaza el body por "HTML vacío".
  allowSmallBody?: boolean;
};

async function curlOnce(
  url: string,
  userAgent: string,
  timeoutSec: number,
  proxyUrl?: string,
  headers?: string[],
  allowSmallBody?: boolean,
): Promise<CurlFetchResult> {
  const args = [
    "-sS",
    "-L",
    "-A",
    userAgent,
    "--max-time",
    String(timeoutSec),
    "-w",
    "\\n__HTTP_CODE__:%{http_code}",
  ];
  for (const h of headers ?? []) {
    args.push("-H", h);
  }
  if (proxyUrl) {
    // --proxytunnel fuerza CONNECT para HTTPS a través del proxy.
    args.push("--proxytunnel", "-x", proxyUrl);
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync("curl", args, {
      maxBuffer: MAX_BUFFER,
      timeout: (timeoutSec + 5) * 1000,
    });
    const marker = stdout.lastIndexOf("\n__HTTP_CODE__:");
    if (marker === -1) {
      return { ok: false, status: 0, reason: "respuesta curl sin código" };
    }
    const html = stdout.slice(0, marker);
    const code = Number.parseInt(
      stdout.slice(marker + "\n__HTTP_CODE__:".length).trim(),
      10,
    );
    if (code < 200 || code >= 300) {
      return { ok: false, status: code, reason: `HTTP ${code}` };
    }
    const minLength = allowSmallBody ? 2 : 200;
    if (!html || html.length < minLength) {
      return { ok: false, status: code, reason: "HTML vacío" };
    }
    return { ok: true, html };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error curl";
    return { ok: false, status: 0, reason };
  }
}

export async function fetchViaCurl(
  url: string,
  userAgent: string,
  options?: CurlFetchOptions,
): Promise<CurlFetchResult> {
  const timeoutSec = options?.timeoutSec ?? 20;
  const retries = options?.retries ?? (options?.proxyUrl ? 2 : 0);

  let last: CurlFetchResult = {
    ok: false,
    status: 0,
    reason: "no se ejecutó",
  };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await curlOnce(
      url,
      userAgent,
      timeoutSec,
      options?.proxyUrl,
      options?.headers,
      options?.allowSmallBody,
    );
    if (last.ok) return last;
    // Reintentar solo en errores transitorios (TLS/red), no en 403/404.
    if (last.status === 403 || last.status === 429 || last.status === 404) {
      return last;
    }
  }
  return last;
}

// ─── Fetch en dos pasos con cookie-jar (para los AJAX detrás de DataDome) ─────
// Idealista solo entrega el teléfono ("Ver teléfono") si la llamada AJAX
// lleva la cookie de DataDome emitida al cargar la ficha. Este helper:
//   1) carga la URL de la ficha guardando cookies en un jar temporal,
//   2) llama a la URL AJAX reutilizando ese jar (misma sesión/IP del proxy).
// Devuelve el cuerpo (JSON) del segundo request y su código HTTP.

export type CookieJarFetchResult = {
  ok: boolean;
  status: number;
  body: string;
  reason?: string;
};

export type MultiAjaxResult = {
  results: CookieJarFetchResult[];
  // HTML of the listing page, captured during the cookie-jar page load.
  // Callers can use this to extract DataDome auth codes without an extra fetch.
  pageHtml: string | null;
};

// Like fetchAjaxWithCookieJar but loads the page only ONCE and tries all
// ajaxUrls in sequence reusing the same cookie jar. Much faster than calling
// fetchAjaxWithCookieJar separately for each endpoint (avoids N page loads).
// Also returns the page HTML so callers can inspect it (e.g. for DataDome auth).
export async function fetchMultipleAjaxWithCookieJar(
  pageUrl: string,
  ajaxUrls: string[],
  userAgent: string,
  options?: {
    proxyUrl?: string;
    ajaxHeaders?: string[];
    timeoutSec?: number;
  },
): Promise<MultiAjaxResult> {
  const timeoutSec = options?.timeoutSec ?? 20;
  const dir = await mkdtemp(join(tmpdir(), "idealista-jar-"));
  const jar = join(dir, "cookies.txt");
  const htmlFile = join(dir, "page.html");
  const proxyArgs = options?.proxyUrl
    ? ["--proxytunnel", "-x", options.proxyUrl]
    : [];

  try {
    // Load page once: save cookies AND HTML for DataDome auth extraction
    try {
      await execFileAsync(
        "curl",
        ["-sS", "-L", "-A", userAgent, "--max-time", String(timeoutSec), "-c", jar, "-o", htmlFile, ...proxyArgs, pageUrl],
        { maxBuffer: MAX_BUFFER, timeout: (timeoutSec + 5) * 1000 },
      );
    } catch (pageErr) {
      console.log(`[multi-ajax-cookie-jar] Curl page load failed: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
    }

    let pageHtml: string | null = null;
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(htmlFile, "utf8");
      if (raw && raw.length > 100) {
        pageHtml = raw;
        console.log(`[multi-ajax-cookie-jar] Page HTML captured: ${raw.length} chars`);
      } else {
        console.log(`[multi-ajax-cookie-jar] Page HTML empty or too short: ${raw?.length ?? 0} chars`);
      }
    } catch (readErr) {
      console.log(`[multi-ajax-cookie-jar] Failed to read page HTML: ${readErr instanceof Error ? readErr.message : String(readErr)}`);
      pageHtml = null;
    }

    const headerArgs: string[] = [];
    for (const h of options?.ajaxHeaders ?? []) headerArgs.push("-H", h);

    const results: CookieJarFetchResult[] = [];
    for (const ajaxUrl of ajaxUrls) {
      try {
        const { stdout } = await execFileAsync(
          "curl",
          ["-sS", "-L", "-A", userAgent, "--max-time", String(timeoutSec), "-b", jar, "-c", jar, "-w", "\\n__HTTP_CODE__:%{http_code}", ...headerArgs, ...proxyArgs, ajaxUrl],
          { maxBuffer: MAX_BUFFER, timeout: (timeoutSec + 5) * 1000 },
        );
        const marker = stdout.lastIndexOf("\n__HTTP_CODE__:");
        const body = marker === -1 ? stdout : stdout.slice(0, marker);
        const status = marker === -1 ? 0 : Number.parseInt(stdout.slice(marker + "\n__HTTP_CODE__:".length).trim(), 10);
        results.push({ ok: status >= 200 && status < 300, status, body });
      } catch (err) {
        results.push({ ok: false, status: 0, body: "", reason: err instanceof Error ? err.message : "error curl" });
      }
    }
    return { results, pageHtml };
  } catch (err) {
    return { results: ajaxUrls.map(() => ({ ok: false, status: 0, body: "", reason: err instanceof Error ? err.message : "error curl" })), pageHtml: null };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function fetchAjaxWithCookieJar(
  pageUrl: string,
  ajaxUrl: string,
  userAgent: string,
  options?: {
    proxyUrl?: string;
    ajaxHeaders?: string[];
    timeoutSec?: number;
  },
): Promise<CookieJarFetchResult> {
  const timeoutSec = options?.timeoutSec ?? 20;
  const dir = await mkdtemp(join(tmpdir(), "idealista-jar-"));
  const jar = join(dir, "cookies.txt");

  const proxyArgs = options?.proxyUrl
    ? ["--proxytunnel", "-x", options.proxyUrl]
    : [];

  try {
    // Paso 1: cargar la ficha para obtener las cookies (incl. DataDome).
    // Descartamos el cuerpo (-o /dev/null); solo nos interesa el jar.
    await execFileAsync(
      "curl",
      [
        "-sS",
        "-L",
        "-A",
        userAgent,
        "--max-time",
        String(timeoutSec),
        "-c",
        jar,
        "-o",
        "/dev/null",
        ...proxyArgs,
        pageUrl,
      ],
      { maxBuffer: MAX_BUFFER, timeout: (timeoutSec + 5) * 1000 },
    ).catch(() => null); // si falla, intentamos el AJAX igual (jar vacío)

    // Paso 2: llamar al AJAX reutilizando (y refrescando) el jar.
    const headerArgs: string[] = [];
    for (const h of options?.ajaxHeaders ?? []) headerArgs.push("-H", h);

    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "-L",
        "-A",
        userAgent,
        "--max-time",
        String(timeoutSec),
        "-b",
        jar,
        "-c",
        jar,
        "-w",
        "\\n__HTTP_CODE__:%{http_code}",
        ...headerArgs,
        ...proxyArgs,
        ajaxUrl,
      ],
      { maxBuffer: MAX_BUFFER, timeout: (timeoutSec + 5) * 1000 },
    );

    const marker = stdout.lastIndexOf("\n__HTTP_CODE__:");
    const body = marker === -1 ? stdout : stdout.slice(0, marker);
    const status =
      marker === -1
        ? 0
        : Number.parseInt(
            stdout.slice(marker + "\n__HTTP_CODE__:".length).trim(),
            10,
          );
    return { ok: status >= 200 && status < 300, status, body };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error curl";
    return { ok: false, status: 0, body: "", reason };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
