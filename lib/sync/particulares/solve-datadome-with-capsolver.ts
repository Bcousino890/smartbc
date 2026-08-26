import "server-only";

export type CapSolverResult = {
  token: string | null;
  // Cookie DataDome completa a aplicar en las siguientes requests, p.ej.
  // "datadome=XXXXX". Para DatadomeSliderTask CapSolver la devuelve en
  // solution.cookie; es lo que de verdad desbloquea el endpoint.
  cookie?: string | null;
  error?: string;
};

/**
 * Solves a DataDome slider CAPTCHA using CapSolver API.
 * Returns the cookie/token to use in subsequent requests.
 */
export async function solveDatadomeWithCapSolver(
  captchaUrl: string,
  userAgent: string,
  options?: { proxyUrl?: string; apiKey?: string; websiteURL?: string },
): Promise<CapSolverResult> {
  // CapSolver rechaza UAs antiguos con ERROR_INVALID_TASK_DATA "unsupported
  // userAgent". Chrome 119-121 (2023-24) ya no están soportados. Usamos un UA
  // de Chrome reciente y estable para Windows como valor por defecto/forzado —
  // CapSolver exige que coincida con un navegador real actual. Si el UA que
  // llega ya es uno reciente (Chrome ≥124), lo respetamos; si no, lo forzamos.
  const DEFAULT_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const chromeVer = userAgent.match(/Chrome\/(\d+)/)?.[1];
  const effectiveUA =
    chromeVer && Number(chromeVer) >= 124 ? userAgent : DEFAULT_UA;
  let apiKey = options?.apiKey;
  if (!apiKey) {
    const { getCapSolverApiKey } = await import("./capsolver-config");
    apiKey = await getCapSolverApiKey();
  }

  if (!apiKey) {
    return {
      token: null,
      error: "CAPSOLVER_API_KEY not configured",
    };
  }

  try {
    console.log(`[capsolver] Creating DatadomeSliderTask for ${captchaUrl.split("/").slice(-2).join("/")}`);

    // Step 1: Create task
    const createRes = await fetch("https://api.capsolver.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: "DatadomeSliderTask",
          // websiteURL: la ficha; captchaUrl: la URL del reto DataDome
          // (geo.captcha-delivery.com/captcha/?...). CapSolver necesita ambas.
          websiteURL: options?.websiteURL ?? captchaUrl,
          captchaUrl,
          userAgent: effectiveUA,
          proxy: options?.proxyUrl ? parseProxyUrl(options.proxyUrl) : undefined,
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(`[capsolver] createTask HTTP ${createRes.status}: ${text.slice(0, 500)}`);
      console.error(`[capsolver] Request payload: ${JSON.stringify({ clientKey: apiKey?.slice(0, 20) + "...", task: { type: "DatadomeSliderTask", captchaUrl: captchaUrl.slice(0, 50) + "..." } })}`);
      return {
        token: null,
        error: `createTask failed: HTTP ${createRes.status} - ${text.slice(0, 200)}`,
      };
    }

    const createData = (await createRes.json()) as any;
    if (createData.errorId !== 0 && createData.errorId !== undefined) {
      console.error(`[capsolver] errorId: ${createData.errorId}, msg: ${createData.errorDescription}`);
      return {
        token: null,
        error: `errorId ${createData.errorId}: ${createData.errorDescription}`,
      };
    }

    const taskId = createData.taskId;
    if (!taskId) {
      console.error(`[capsolver] No taskId in response: ${JSON.stringify(createData)}`);
      return {
        token: null,
        error: "No taskId returned",
      };
    }

    console.log(`[capsolver] Task created: taskId=${taskId}, polling...`);

    // Step 2: Poll for result (max 60s, check every 2s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await fetch("https://api.capsolver.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientKey: apiKey,
          taskId,
        }),
      });

      if (!pollRes.ok) {
        console.error(`[capsolver] getTaskResult HTTP ${pollRes.status}`);
        continue;
      }

      const pollData = (await pollRes.json()) as any;

      if (pollData.errorId !== 0 && pollData.errorId !== undefined) {
        console.error(`[capsolver] Poll error ${pollData.errorId}: ${pollData.errorDescription}`);
        return {
          token: null,
          error: `Poll error ${pollData.errorId}: ${pollData.errorDescription || "unknown"}`,
        };
      }

      if (pollData.status === "ready") {
        // Para DatadomeSliderTask la solución trae `cookie` ("datadome=XXX"),
        // que es lo que hay que reenviar. Algunas variantes usan `token`.
        const cookie: string | null = pollData.solution?.cookie ?? null;
        const token: string | null =
          pollData.solution?.token ??
          (cookie ? cookie.replace(/^datadome=/, "").split(";")[0] : null);
        if (!cookie && !token) {
          console.error(`[capsolver] No cookie/token in solution: ${JSON.stringify(pollData.solution)}`);
          return {
            token: null,
            error: "No cookie/token in solution",
          };
        }

        console.log(`[capsolver] ✓ CAPTCHA solved (${i * 2}s)`);
        return { token, cookie };
      }

      if (pollData.status === "failed") {
        console.error(`[capsolver] Task failed: ${pollData.solution?.failReason}`);
        return {
          token: null,
          error: `Task failed: ${pollData.solution?.failReason}`,
        };
      }

      // status === "processing", continue polling
    }

    console.error(`[capsolver] Timeout after 60s`);
    return {
      token: null,
      error: "Timeout waiting for CAPTCHA solution",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[capsolver] Error: ${msg}`);
    return {
      token: null,
      error: msg,
    };
  }
}

/**
 * Convierte `http://usuario:password@host:puerto` al formato que documenta
 * CapSolver para DatadomeSliderTask: `host:puerto:usuario:password` (ver
 * docs.capsolver.com/en/guide/captcha/datadome/, ejemplo
 * "158.120.100.23:334:user:pass"). Antes esta función era un no-op que
 * reenviaba la URL con esquema tal cual — CapSolver no la interpreta como
 * proxy válido, así que terminaba resolviendo el slider desde una IP
 * distinta a la que recibió el reto (mismatch), dando el error real que
 * veíamos en producción: "userAgent does not match or your proxy ip has
 * been blocked".
 */
function parseProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username) return `${u.hostname}:${u.port}`;
    return `${u.hostname}:${u.port}:${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
  } catch {
    return proxyUrl;
  }
}
