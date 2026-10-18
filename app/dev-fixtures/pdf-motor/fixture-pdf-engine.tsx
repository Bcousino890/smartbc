"use client";

import { useState } from "react";
import { imageToBlob, readPdfInBrowser } from "@/lib/imports/pdf/browser";
import { pdfAssetBase } from "@/lib/imports/pdf/ocr";
import { planPdfDrafts } from "@/lib/imports/pdf/plan";
import { pageSignals, proposeGroups } from "@/lib/imports/pdf/split";

// Lee un PDF sintético en el navegador y enseña el resultado en JSON
// (data-testid="pdf-result") para las comprobaciones de Playwright.
export function FixturePdfEngine() {
  const [out, setOut] = useState<string>("");
  const [progress, setProgress] = useState("");
  async function run(name: string) {
    setOut("");
    const t0 = performance.now();
    try {
      const blob = await (await fetch(`/dev-fixtures/pdf-fixtures/${name}`)).blob();
      const pdf = await readPdfInBrowser(Object.assign(blob, { name }), {
        assetBase: pdfAssetBase("/dev-fixtures/import-assets"),
        onProgress: (p) => setProgress(`${p.stage} ${p.done}/${p.total}`),
      });
      const plan = pdf.pages.map((p) => ({ page: p.page, text: p.text, source: p.textSource, photoIds: p.images.filter((i) => !i.fullPage).map((i) => i.id) }));
      const groups = proposeGroups(plan.map((p) => pageSignals(p.page, p.text)));
      const drafts = planPdfDrafts(plan, groups);
      const photo = pdf.pages.flatMap((p) => p.images.filter((i) => !i.fullPage))[0];
      const blobOut = photo ? await imageToBlob(photo) : null;
      setOut(
        JSON.stringify({
          ok: true,
          ms: Math.round(performance.now() - t0),
          hash: pdf.hash,
          pages: pdf.pages.map((p) => ({ page: p.page, kind: p.kind, source: p.textSource, conf: p.ocrConfidence, images: p.images.length })),
          groups,
          drafts: drafts.map((d) => ({ part: d.part, pages: d.pages, fields: d.fields, evidence: d.evidence, photos: d.photos.length, ocrPages: d.ocrPages, removed: d.removedContacts.length })),
          firstPhoto: blobOut ? { type: blobOut.type, size: blobOut.size } : null,
        }),
      );
      await pdf.doc.destroy();
    } catch (e) {
      setOut(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }));
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["digital.pdf", "escaneado.pdf", "mixto.pdf", "varias.pdf"].map((n) => (
          <button key={n} type="button" onClick={() => void run(n)} className="rounded border bg-white px-3 py-1 text-sm" data-testid={`run-${n}`}>
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs" data-testid="pdf-progress">{progress}</p>
      <pre className="whitespace-pre-wrap break-all text-xs" data-testid="pdf-result">{out}</pre>
    </div>
  );
}
