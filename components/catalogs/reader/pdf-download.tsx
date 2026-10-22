"use client";

import { useCallback, useMemo, useState } from "react";
import { usePdfDownload } from "@/lib/catalogs/export/download-client";
import { cn } from "@/lib/utils";
import { useReaderLang } from "./lang-context";
import type { CatalogDictionary } from "@/lib/catalogs/i18n";

// PDF del catálogo en el lector (expediente 2026-10-16-bcp-01-pdf): en el
// índice (enlace discreto) y en el cierre (acción de filete fino, como las de
// la referencia). El lector solo lo ofrece con el enlace válido y con
// conexión. El estado vive en el lector, no en la página: las páginas se
// vuelven a montar al pasar de hoja, y la descarga en curso y su mensaje no
// deben perderse por eso.

export type PdfPlace = "index" | "closing";

export interface ReaderPdf {
  busy: boolean;
  message: { place: PdfPlace; ok: boolean; text: string } | null;
  start: (place: PdfPlace) => void;
}

/** `dict`: el diccionario del idioma del enlace. Hay que pasarlo desde
 *  CatalogReader, que llama a este hook FUERA de ReaderLangProvider (el
 *  contexto ahí da el español: los avisos de la descarga salían en español en
 *  los demás idiomas; corregido en el PR5). */
export function useReaderPdf(token: string, dictOfLink?: CatalogDictionary): ReaderPdf {
  const fromContext = useReaderLang().dict;
  const dict = dictOfLink ?? fromContext;
  const texts = useMemo(
    () => ({ changing: dict.pdfChanging, rateLimited: dict.pdfRateLimited, otherInProgress: dict.pdfOtherInProgress, failed: dict.pdfFailed, busy: dict.pdfBusy, downloaded: dict.pdfDownloaded, network: dict.pdfNetwork }),
    [dict],
  );
  const { busy, download } = usePdfDownload(`/api/seleccion/${encodeURIComponent(token)}/pdf`, { notFound: dict.pdfNotFound, texts });
  const [message, setMessage] = useState<ReaderPdf["message"]>(null);
  const start = useCallback(
    (place: PdfPlace) => {
      setMessage(null);
      void download().then((r) => setMessage({ place, ok: r.ok, text: r.text }));
    },
    [download],
  );
  return { busy, message, start };
}

export function PdfDownload({ pdf, variant }: { pdf: ReaderPdf; variant: PdfPlace }) {
  const { dict } = useReaderLang();
  const message = pdf.message?.place === variant ? pdf.message : null;
  const label = pdf.busy ? dict.pdfPreparing : dict.pdfDownload;
  const note = message ? (
    <span
      className={cn("block max-w-[36ch] font-sans text-[12px] leading-relaxed", message.ok ? "text-ink/50" : "text-[#8a2b1a]")}
      role={message.ok ? "status" : "alert"}
      data-testid={`pdf-${variant}-message`}
    >
      {message.text}
    </span>
  ) : null;

  if (variant === "index") {
    return (
      <div className="mt-4 flex flex-col items-center gap-2" data-testid="pdf-index">
        <button
          type="button"
          onClick={() => pdf.start("index")}
          disabled={pdf.busy}
          aria-busy={pdf.busy}
          data-testid="pdf-index-button"
          className="vc-focus vc-underline min-h-[44px] px-2 font-display text-[10.5px] font-medium uppercase vc-tracked text-ink/60 transition-colors duration-500 hover:text-ink disabled:cursor-progress disabled:opacity-60"
        >
          {label}
        </button>
        {note}
      </div>
    );
  }

  return (
    <div className="flex basis-full flex-col items-center gap-3" data-testid="pdf-closing">
      <button
        type="button"
        onClick={() => pdf.start("closing")}
        disabled={pdf.busy}
        aria-busy={pdf.busy}
        data-testid="pdf-closing-button"
        className="vc-focus border border-ink/25 px-7 py-3.5 font-display text-[10.5px] font-medium uppercase vc-tracked text-ink transition-colors duration-500 hover:border-ink disabled:cursor-progress disabled:opacity-60"
      >
        {label}
      </button>
      {note ?? <span className="block max-w-[36ch] font-sans text-[12px] leading-relaxed text-ink/50">{dict.pdfHint}</span>}
    </div>
  );
}
