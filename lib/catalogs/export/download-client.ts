"use client";

import { useCallback, useRef, useState } from "react";

// ============================================================================
// PDF del catálogo · descarga en el navegador (expediente 2026-10-16-bcp-01-pdf).
// La usan el gestor (dueño) y el lector (cliente): fetch → archivo guardado
// con el nombre que da el servidor, y un mensaje claro por cada respuesta.
// Una sola descarga a la vez por botón; al desmontar se cancela la petición.
// ============================================================================

export type PdfDownloadResult = { ok: true; text: string } | { ok: false; text: string };

/** Nombre del archivo desde Content-Disposition (filename* UTF-8 primero). */
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // sigue con el ASCII
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : fallback;
}

/** Mensajes de la descarga. Los del gestor son estos (español); el lector
 *  (PR4) pasa los de su diccionario en el idioma del enlace. */
export interface PdfDownloadTexts {
  changing: string;
  rateLimited: string;
  otherInProgress: string;
  failed: string;
  busy: string;
  downloaded: string;
  network: string;
}

export const PDF_DOWNLOAD_TEXTS_ES: PdfDownloadTexts = {
  changing: "El catálogo está cambiando ahora mismo; vuelve a intentarlo en unos segundos.",
  rateLimited: "Has pedido varias descargas seguidas; inténtalo de nuevo en un minuto.",
  otherInProgress: "Ahora mismo se está preparando otro PDF; inténtalo en un momento.",
  failed: "No se pudo preparar el PDF. Inténtalo de nuevo.",
  busy: "Ya se está preparando el PDF.",
  downloaded: "PDF descargado.",
  network: "No se pudo descargar el PDF: revisa la conexión e inténtalo de nuevo.",
};

/** Texto para cada respuesta (404 lo decide quien llama: dueño o cliente). */
export function pdfErrorText(status: number, notFound: string, texts: PdfDownloadTexts = PDF_DOWNLOAD_TEXTS_ES): string {
  if (status === 404) return notFound;
  if (status === 409) return texts.changing;
  if (status === 429) return texts.rateLimited;
  if (status === 503) return texts.otherInProgress;
  return texts.failed;
}

function save(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari necesita que la URL siga viva un momento tras el clic.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

export function usePdfDownload(url: string, opts: { notFound: string; fallbackName?: string; texts?: PdfDownloadTexts }) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const texts = opts.texts ?? PDF_DOWNLOAD_TEXTS_ES;
  const download = useCallback(async (): Promise<PdfDownloadResult> => {
    if (inFlight.current) return { ok: false, text: texts.busy };
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setBusy(true);
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/pdf")) {
        return { ok: false, text: pdfErrorText(res.ok ? 500 : res.status, opts.notFound, texts) };
      }
      const blob = await res.blob();
      save(blob, fileNameFromDisposition(res.headers.get("content-disposition"), opts.fallbackName ?? "Catálogo.pdf"));
      return { ok: true, text: texts.downloaded };
    } catch {
      return { ok: false, text: texts.network };
    } finally {
      inFlight.current = null;
      setBusy(false);
    }
  }, [url, opts.notFound, opts.fallbackName, texts]);
  return { busy, download };
}
