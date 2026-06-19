import "server-only";

export type CapSolverResult = {
  token: string | null;
  error?: string;
};

/**
 * Solves a DataDome slider CAPTCHA using CapSolver API.
 * Returns the cookie/token to use in subsequent requests.
 */
export async function solveDatadomeWithCapSolver(
  captchaUrl: string,
  userAgent: string,
  options?: { proxyUrl?: string; apiKey?: string },
): Promise<CapSolverResult> {
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
          captchaUrl,
          userAgent,
          proxy: options?.proxyUrl ? parseProxyUrl(options.proxyUrl) : undefined,
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error(`[capsolver] createTask HTTP ${createRes.status}: ${text.slice(0, 200)}`);
      return {
        token: null,
        error: `createTask failed: HTTP ${createRes.status}`,
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
          error: `Poll error ${pollData.errorId}`,
        };
      }

      if (pollData.status === "ready") {
        const token = pollData.solution?.token;
        if (!token) {
          console.error(`[capsolver] No token in solution: ${JSON.stringify(pollData.solution)}`);
          return {
            token: null,
            error: "No token in solution",
          };
        }

        console.log(`[capsolver] ✓ CAPTCHA solved (${i * 2}s)`);
        return { token };
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
 * Parses proxy URL (http://user:pass@host:port) into CapSolver format.
 */
function parseProxyUrl(proxyUrl: string): string {
  try {
    // CapSolver expects: http://user:pass@host:port or socks5://host:port
    return proxyUrl;
  } catch {
    return proxyUrl;
  }
}
