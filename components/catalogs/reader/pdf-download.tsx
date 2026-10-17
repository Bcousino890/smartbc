"use client";

import { useCallback, useState } from "react";
import { usePdfDownload } from "@/lib/catalogs/export/download-client";
import styles from "./reader.module.css";

// PDF del catálogo en el lector (expediente 2026-10-16-bcp-01-pdf): en el
// índice (enlace discreto) y en el cierre (botón). El lector solo lo ofrece
// con el enlace válido y con conexión. El estado vive en el lector, no en la
// página: las dobles páginas se vuelven a montar al animar, y la descarga en
// curso y su mensaje no deben perderse por eso.

export type PdfPlace = "index" | "closing";

export interface ReaderPdf {
  busy: boolean;
  message: { place: PdfPlace; ok: boolean; text: string } | null;
  start: (place: PdfPlace) => void;
}

export function useReaderPdf(token: string): ReaderPdf {
  const { busy, download } = usePdfDownload(`/api/seleccion/${encodeURIComponent(token)}/pdf`, {
    notFound: "Este enlace ya no está disponible.",
  });
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
  const message = pdf.message?.place === variant ? pdf.message : null;
  return (
    <div className={variant === "index" ? styles.pdfIndex : styles.pdfClosing} data-testid={`pdf-${variant}`}>
      <button
        type="button"
        className={variant === "index" ? styles.pdfLink : styles.pdfButton}
        onClick={() => pdf.start(variant)}
        disabled={pdf.busy}
        aria-busy={pdf.busy}
        data-testid={`pdf-${variant}-button`}
      >
        {pdf.busy ? "Preparando el PDF…" : "Descargar en PDF"}
      </button>
      {variant === "closing" && !message ? <span className={styles.pdfHint}>Una copia de esta selección tal como está hoy, para guardarla o imprimirla.</span> : null}
      {message ? (
        <span className={message.ok ? styles.pdfHint : styles.pdfError} role={message.ok ? "status" : "alert"} data-testid={`pdf-${variant}-message`}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
