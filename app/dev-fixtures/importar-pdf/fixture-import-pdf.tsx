"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DraftReview } from "@/components/admin/imports/draft-review";
import { PdfImport } from "@/components/admin/imports/pdf-import";
import { pdfAssetBase } from "@/lib/imports/pdf/ocr";
import { FIXTURE_IMPORT_ACTIONS } from "../importar/fixture-import";

export function FixtureImportPdf() {
  const sp = useSearchParams();
  const [review, setReview] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className={review ? "hidden" : ""}>
        <PdfImport
          country="es"
          catalogId={sp.get("catalogo")}
          actions={FIXTURE_IMPORT_ACTIONS}
          assetBase={pdfAssetBase("/dev-fixtures/import-assets")}
          reviewHref={(id) => `#${id}`}
          onReview={setReview}
        />
      </div>
      {review ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setReview(null)} className="text-sm underline" data-testid="fx-back">
            ← Volver a los borradores del PDF
          </button>
          <DraftReview key={review} country="es" draftId={review} actions={FIXTURE_IMPORT_ACTIONS} />
        </div>
      ) : null}
    </div>
  );
}
