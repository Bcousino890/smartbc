/**
 * POST de un FormData con archivo para los formularios del panel, con los
 * fallos traducidos (mismo espíritu que request-json.ts). El servidor responde
 * `{ ok: true, … } | { ok: false, error }`; aquí se garantiza que el
 * llamador SIEMPRE recibe esa forma, nunca una excepción ni HTML.
 */
export type UploadFailure = { ok: false; error: string };

export async function postUploadForm<T extends { ok: boolean }>(
  url: string,
  formData: FormData,
  { timeoutMs = 15 * 60_000 }: { timeoutMs?: number } = {},
): Promise<T | UploadFailure> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: formData,
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        (err as { name?: string } | null)?.name === "TimeoutError"
          ? "La subida tardó demasiado. Prueba con una conexión más rápida o un archivo más pequeño."
          : "Se cortó la conexión durante la subida. Inténtalo de nuevo.",
    };
  }
  if (res.status === 413) {
    return { ok: false, error: "El servidor web rechazó el archivo por tamaño (límite de nginx en el VPS)." };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: `El servidor respondió con un error inesperado (HTTP ${res.status}).` };
  }
  return data as T | UploadFailure;
}
