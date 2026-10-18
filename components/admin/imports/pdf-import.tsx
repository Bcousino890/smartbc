"use client";

import { ArrowRight, Crop, FileText, Loader2, Scissors, Trash2, Undo2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cropToBlob, errorDetail, imageToBlob, type LoadedPdf, PdfReadError, readPdfInBrowser, renderPageCanvas } from "@/lib/imports/pdf/browser";
import { pdfAssetBase } from "@/lib/imports/pdf/ocr";
import { planPdfDrafts, type PlanPage } from "@/lib/imports/pdf/plan";
import { type Groups, mergeWithPrevious, movePage, pageSignals, proposeGroups, removePage, splitBefore } from "@/lib/imports/pdf/split";
import type { Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { REAL_IMPORT_ACTIONS, type ImportDraftActions } from "./import-actions";

// Importar desde PDF (BCP-01 P8, I-17 a I-19). El PDF se lee EN EL NAVEGADOR
// (pdf.js + OCR en las páginas escaneadas) y no se sube: al servidor solo van
// los campos propuestos y las fotos elegidas, como un borrador privado por
// vivienda. La persona corrige la separación y las fotos aquí, y revisa cada
// borrador (campos «Falta»/«Dudoso» con su página) antes de confirmar.

type Photo = {
  key: string;
  page: number;
  source: "pdf" | "recorte";
  blob: Blob | null;
  url: string | null;
  /** Vivienda elegida a mano: la de la página que la abre (sobrevive a dividir/unir). */
  toAnchor: number | null;
  removed: boolean;
};

type Created = { part: number; pages: number[]; draftId: string | null; title: string; photosOk: number; photosFailed: Photo[]; error: string | null };

const READ_ERRORS: Record<PdfReadError["code"], string> = {
  too_large: "El PDF pesa demasiado (máximo 80 MB).",
  too_many_pages: "El PDF tiene demasiadas páginas (máximo 200).",
  not_a_pdf: "Eso no parece un PDF, o está dañado.",
  encrypted: "El PDF está protegido con contraseña. Quítasela y vuelve a probar.",
  reader_unavailable: "No se pudo cargar el lector de PDF en el navegador. Recarga la página y vuelve a probar.",
  no_pages: "No se pudo leer ninguna página del PDF.",
};

/** Clave estable por documento, vivienda y páginas: reintentar o hacer doble clic da el MISMO borrador. */
function requestKeyFor(hash: string, part: number, pages: number[]): string {
  let h = 0;
  for (const c of pages.join(",")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `pdf-${hash.slice(0, 32)}-${part}-${h.toString(36)}`;
}

/** «2.400», «1.250.000» (toLocaleString("es-ES") no agrupa las de cuatro cifras). */
const euros = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const groupOf = (groups: Groups, page: number) => groups.findIndex((g) => g.includes(page));

export function PdfImport({
  country,
  catalogId,
  actions = REAL_IMPORT_ACTIONS,
  assetBase = pdfAssetBase(),
  reviewHref,
  onReview,
}: {
  country: Country;
  catalogId: string | null;
  actions?: ImportDraftActions;
  assetBase?: string;
  reviewHref: (draftId: string) => string;
  onReview?: (draftId: string) => void;
}) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTech, setErrorTech] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [groups, setGroups] = useState<Groups>([]);
  const [removedPages, setRemovedPages] = useState<number[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cropPage, setCropPage] = useState<number | null>(null);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Las URL de las fotos se liberan al salir de la página (no en cada cambio: siguen en uso).
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  async function onFile(file: File) {
    setError(null);
    setErrorTech(null);
    setCreated(null);
    setPdf(null);
    setProgress("Leyendo el PDF…");
    try {
      const loaded = await readPdfInBrowser(file, {
        assetBase,
        onProgress: (p) => setProgress(p.stage === "leer" ? `Leyendo página ${p.done} de ${p.total}…` : `Reconociendo texto (OCR) ${p.done} de ${p.total}…`),
      });
      const signals = loaded.pages.map((p) => pageSignals(p.page, p.text));
      setGroups(proposeGroups(signals));
      setRemovedPages([]);
      const ph: Photo[] = [];
      for (const p of loaded.pages)
        for (const img of p.images.filter((i) => !i.fullPage)) {
          try {
            const blob = await imageToBlob(img);
            ph.push({ key: `${p.page}-${img.id}`, page: p.page, source: "pdf", blob, url: URL.createObjectURL(blob), toAnchor: null, removed: false });
          } catch {
            /* imagen ilegible: se omite */
          }
        }
      setPhotos(ph);
      setPdf(loaded);
    } catch (e) {
      // El detalle técnico se enseña siempre: sin él no hay forma de saber qué falló.
      console.error("[importar PDF]", e);
      setError(e instanceof PdfReadError ? READ_ERRORS[e.code] : "No se pudo leer el PDF.");
      setErrorTech(errorDetail(e));
    } finally {
      setProgress(null);
    }
  }

  // Miniaturas de página, una a una (no bloquea la interfaz).
  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    (async () => {
      for (const p of pdf.pages) {
        if (!alive) return;
        const c = await renderPageCanvas(pdf.doc, p.page, 220);
        if (!alive) return;
        const url = c.toDataURL("image/jpeg", 0.7);
        setThumbs((t) => ({ ...t, [p.page]: url }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [pdf]);

  const planPages: PlanPage[] = useMemo(
    () => (pdf ? pdf.pages.map((p) => ({ page: p.page, text: p.text, source: p.textSource === "ocr" ? "ocr" : p.textSource === "text" ? "text" : "none", photoIds: [] })) : []),
    [pdf],
  );
  const plans = useMemo(() => planPdfDrafts(planPages, groups), [planPages, groups]);
  const photosOfGroup = useCallback(
    (gi: number) =>
      photos.filter((ph) => {
        const target = ph.toAnchor !== null && groupOf(groups, ph.toAnchor) >= 0 ? groupOf(groups, ph.toAnchor) : groupOf(groups, ph.page);
        return target === gi;
      }),
    [photos, groups],
  );

  const removePageAt = (page: number) => {
    setGroups((g) => removePage(g, page));
    setRemovedPages((r) => [...r, page].sort((a, b) => a - b));
  };
  const restorePage = (page: number) => {
    setRemovedPages((r) => r.filter((x) => x !== page));
    setGroups((g) => {
      if (!g.length) return [[page]];
      const prev = [...g.flat()].filter((x) => x < page).sort((a, b) => b - a)[0];
      const gi = prev !== undefined ? groupOf(g, prev) : 0;
      const pos = prev !== undefined ? g[gi].indexOf(prev) + 1 : 0;
      return g.map((x, i) => (i === gi ? [...x.slice(0, pos), page, ...x.slice(pos)] : x));
    });
  };
  const setPhoto = (key: string, patch: Partial<Photo>) => setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  async function createDrafts() {
    if (!pdf || creatingRef.current) return;
    creatingRef.current = true;
    setError(null);
    const out: Created[] = [];
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const plan = plans[gi];
        setCreating(`Creando el borrador ${gi + 1} de ${groups.length}…`);
        const r = await actions.createPdf({
          country,
          requestKey: requestKeyFor(pdf.hash, plan.part, plan.pages),
          sourceName: pdf.name,
          sourceHash: pdf.hash,
          part: plan.part,
          fields: plan.fields,
          evidence: plan.evidence,
          catalogId,
        });
        if (!r.ok) {
          out.push({ part: plan.part, pages: plan.pages, draftId: null, title: plan.fields.title, photosOk: 0, photosFailed: [], error: r.error });
          continue;
        }
        const mine = photosOfGroup(gi).filter((p) => !p.removed && p.blob);
        const failed: Photo[] = [];
        let okCount = 0;
        for (const [i, ph] of mine.entries()) {
          setCreating(`Borrador ${gi + 1}: subiendo foto ${i + 1} de ${mine.length}…`);
          const up = await actions.uploadPhoto(country, r.draft.id, ph.blob!, ph.page);
          if (up.ok) okCount++;
          else failed.push(ph);
        }
        out.push({ part: plan.part, pages: plan.pages, draftId: r.draft.id, title: plan.fields.title, photosOk: okCount, photosFailed: failed, error: null });
      }
      setCreated(out);
    } finally {
      setCreating(null);
      creatingRef.current = false;
    }
  }

  async function retryPhotos(c: Created) {
    if (!c.draftId) return;
    setCreating("Reintentando las fotos…");
    const failed: Photo[] = [];
    let ok = c.photosOk;
    for (const ph of c.photosFailed) {
      const up = await actions.uploadPhoto(country, c.draftId, ph.blob!, ph.page);
      if (up.ok) ok++;
      else failed.push(ph);
    }
    setCreated((cs) => cs?.map((x) => (x.part === c.part ? { ...x, photosOk: ok, photosFailed: failed } : x)) ?? null);
    setCreating(null);
  }

  // ── Pantallas ─────────────────────────────────────────────────────────────

  if (created) {
    return (
      <div className="space-y-4" data-testid="pdf-created">
        <p className="text-sm text-ink/75">
          Se han creado <strong>{created.filter((c) => c.draftId).length}</strong> borradores privados, uno por vivienda. Ninguno es todavía una ficha: revisa cada uno (los datos marcados «Falta» o «Dudoso» llevan la página donde salen) y confírmalo.
        </p>
        <ul className="divide-y divide-gold/10 rounded-xl border border-gold/15 bg-white/70">
          {created.map((c) => (
            <li key={c.part} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid="pdf-created-row">
              <span className="w-24 text-ink/55">Vivienda {c.part}</span>
              <span className="min-w-0 flex-1 truncate">{c.title || "Sin título"}</span>
              <span className="text-xs text-ink/55">
                págs. {c.pages.join(", ")} · {c.photosOk} foto(s)
              </span>
              {c.error ? <span className="text-xs text-red-700">{c.error}</span> : null}
              {c.photosFailed.length ? (
                <button type="button" onClick={() => void retryPhotos(c)} disabled={!!creating} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800" data-testid="pdf-retry-photos">
                  {c.photosFailed.length} foto(s) sin subir · Reintentar
                </button>
              ) : null}
              {c.draftId ? (
                onReview ? (
                  <button type="button" onClick={() => onReview(c.draftId!)} className="rounded-md bg-ink px-3 py-1 text-xs text-cream-50" data-testid="pdf-review">
                    Revisar
                  </button>
                ) : (
                  <a href={reviewHref(c.draftId)} className="rounded-md bg-ink px-3 py-1 text-xs text-cream-50" data-testid="pdf-review">
                    Revisar
                  </a>
                )
              ) : null}
            </li>
          ))}
        </ul>
        {creating ? <p className="text-xs text-ink/55">{creating}</p> : null}
        <button type="button" onClick={() => (setCreated(null), setPdf(null))} className="text-sm text-ink/60 underline">
          Importar otro PDF
        </button>
      </div>
    );
  }

  if (!pdf) {
    return (
      <div className="space-y-4">
        {catalogId ? <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink/70">Al confirmar cada vivienda podrás añadirla a tu catálogo (si es tuyo y es una selección fija).</p> : null}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gold/30 bg-white/60 px-6 py-10 text-center text-sm text-ink/70 hover:border-gold/60" data-testid="pdf-drop">
          <Upload size={22} className="text-gold-dark" />
          <span className="font-medium text-ink">Elige el PDF del colaborador</span>
          <span className="text-xs text-ink/50">Se lee en tu navegador: el PDF no se sube. Digitales, escaneados o con varias viviendas.</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={!!progress}
            data-testid="pdf-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
        </label>
        {progress ? (
          <p className="flex items-center gap-2 text-sm text-ink/70" data-testid="pdf-progress">
            <Loader2 size={15} className="animate-spin" /> {progress}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="pdf-error">
            <p>{error}</p>
            {errorTech ? (
              <p className="mt-1 break-all font-mono text-xs text-red-800/80" data-testid="pdf-error-detail">
                Detalle técnico: {errorTech}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const pageInfo = new Map(pdf.pages.map((p) => [p.page, p]));
  return (
    <div className="space-y-4" data-testid="pdf-split">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink/75">
        <FileText size={16} className="text-gold-dark" />
        <strong className="min-w-0 truncate">{pdf.name}</strong>
        <span className="text-xs text-ink/50">
          {pdf.pages.length} página(s) · {groups.length} vivienda(s) propuestas
        </span>
        <button type="button" onClick={() => setPdf(null)} className="ml-auto text-xs text-ink/55 underline">
          Elegir otro PDF
        </button>
      </div>
      {pdf.ocrError ? (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="pdf-ocr-error">
          No se pudo leer el texto de las páginas escaneadas (OCR). Puedes seguir: recorta sus fotos y escribe los datos en la revisión. Detalle técnico: {pdf.ocrError}
        </p>
      ) : null}
      {pdf.pages.some((p) => p.error) ? (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="pdf-page-errors">
          Algunas páginas no se pudieron leer del todo:{" "}
          {pdf.pages
            .filter((p) => p.error)
            .map((p) => `pág. ${p.page} (${p.error})`)
            .join(" · ")}
        </p>
      ) : null}
      <p className="text-xs text-ink/60">
        Revisa la separación: cada bloque será un borrador. «Dividir aquí» empieza una vivienda nueva en esa página; las fotos siguen a su página salvo que las muevas. Las páginas escaneadas se han leído con OCR: revisa sus números.
      </p>

      {groups.map((g, gi) => {
        const plan = plans[gi];
        const f = plan.fields;
        const mine = photosOfGroup(gi);
        return (
          <section key={`${gi}-${g.join(",")}`} className="space-y-3 rounded-xl border border-gold/20 bg-white/70 p-3" data-testid="pdf-group">
            <header className="flex flex-wrap items-center gap-2 text-sm">
              <strong>Vivienda {gi + 1}</strong>
              <span className="text-xs text-ink/55" data-testid="pdf-group-summary">
                {[f.title, f.price ? `${euros(f.price)} €${f.operation === "rent" ? "/mes" : ""}` : "sin precio", f.squareMeters ? `${f.squareMeters} m²` : null, f.zone || null].filter(Boolean).join(" · ")}
              </span>
              {gi > 0 ? (
                <button type="button" onClick={() => setGroups((x) => mergeWithPrevious(x, gi))} className="ml-auto rounded-md border border-ink/15 bg-white px-2 py-0.5 text-xs" data-testid="pdf-merge">
                  Unir con la anterior
                </button>
              ) : null}
            </header>
            <ul className="flex flex-wrap gap-2">
              {g.map((page, pi) => {
                const info = pageInfo.get(page)!;
                return (
                  <li key={page} className="w-[132px] space-y-1 rounded-lg border border-ink/10 bg-white p-1.5 text-xs" data-testid="pdf-page" data-page={page}>
                    {thumbs[page] ? <img src={thumbs[page]} alt={`Página ${page}`} className="h-[170px] w-full object-contain" /> : <div className="h-[170px] animate-pulse bg-cream-100" />}
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Pág. {page}</span>
                      <span className={cn("rounded px-1", info.textSource === "ocr" ? "bg-amber-100 text-amber-900" : info.textSource === "text" ? "bg-emerald-50 text-emerald-800" : "bg-ink/5 text-ink/55")}>
                        {info.textSource === "ocr" ? "OCR" : info.textSource === "text" ? "Texto" : "Sin texto"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pi > 0 ? (
                        <button type="button" onClick={() => setGroups((x) => splitBefore(x, page))} className="inline-flex items-center gap-0.5 rounded border border-ink/15 px-1" title="Empieza aquí una vivienda nueva" data-testid="pdf-split-here">
                          <Scissors size={11} /> Dividir
                        </button>
                      ) : null}
                      {info.kind === "scan" ? (
                        <button type="button" onClick={() => setCropPage(page)} className="inline-flex items-center gap-0.5 rounded border border-ink/15 px-1" data-testid="pdf-crop-open">
                          <Crop size={11} /> Recortar
                        </button>
                      ) : null}
                      <button type="button" onClick={() => removePageAt(page)} className="inline-flex items-center gap-0.5 rounded border border-ink/15 px-1" title="Quitar la página (portada, aviso legal…)" data-testid="pdf-remove-page">
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {groups.length > 1 ? (
                      <select
                        value={gi}
                        onChange={(e) => setGroups((x) => movePage(x, page, Number(e.target.value)))}
                        className="w-full rounded border border-ink/15 bg-white px-1 py-0.5"
                        aria-label={`Mover la página ${page} a otra vivienda`}
                        data-testid="pdf-move-page"
                      >
                        {groups.map((_, i) => (
                          <option key={i} value={i}>
                            {i === gi ? `Vivienda ${i + 1} (aquí)` : `Mover a vivienda ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1">
              <p className="text-xs text-ink/60">
                Fotos ({mine.filter((p) => !p.removed).length}){mine.length === 0 ? " · si la vivienda viene escaneada, recorta las fotos de su página" : ""}
              </p>
              <ul className="flex flex-wrap gap-2" data-testid="pdf-photos">
                {mine.map((ph) => (
                  <li key={ph.key} className={cn("w-[120px] space-y-1 rounded border p-1 text-xs", ph.removed ? "border-ink/10 opacity-50" : "border-gold/40")} data-testid="pdf-photo" data-removed={ph.removed ? "1" : "0"}>
                    {ph.url ? <img src={ph.url} alt="" className="h-[80px] w-full object-cover" /> : null}
                    <div className="flex items-center justify-between">
                      <span>
                        pág. {ph.page}
                        {ph.source === "recorte" ? " · recorte" : ""}
                      </span>
                      <button type="button" onClick={() => setPhoto(ph.key, { removed: !ph.removed })} className="underline" data-testid="pdf-photo-toggle">
                        {ph.removed ? "Volver" : "Quitar"}
                      </button>
                    </div>
                    {groups.length > 1 ? (
                      <select
                        value={gi}
                        onChange={(e) => setPhoto(ph.key, { toAnchor: groups[Number(e.target.value)][0] })}
                        className="w-full rounded border border-ink/15 bg-white px-1"
                        aria-label="Asignar la foto a otra vivienda"
                        data-testid="pdf-photo-move"
                      >
                        {groups.map((_, i) => (
                          <option key={i} value={i}>
                            Vivienda {i + 1}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      {removedPages.length ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink/60" data-testid="pdf-removed-pages">
          Páginas quitadas:
          {removedPages.map((p) => (
            <button key={p} type="button" onClick={() => restorePage(p)} className="inline-flex items-center gap-1 rounded border border-ink/15 bg-white px-1.5">
              <Undo2 size={11} /> pág. {p}
            </button>
          ))}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-gold/15 pt-3">
        <button
          type="button"
          onClick={() => void createDrafts()}
          disabled={!!creating || !groups.length}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 disabled:opacity-50"
          data-testid="pdf-create"
        >
          {creating ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Crear {groups.length} borrador{groups.length === 1 ? "" : "es"} privado{groups.length === 1 ? "" : "s"}
        </button>
        {creating ? <span className="text-xs text-ink/55">{creating}</span> : <span className="text-xs text-ink/50">Nada se publica ni se avisa a nadie: después revisas cada uno.</span>}
      </div>

      {cropPage !== null ? (
        <CropDialog
          pdf={pdf}
          page={cropPage}
          onClose={() => setCropPage(null)}
          onCrop={(blob) => {
            setPhotos((ps) => [...ps, { key: `crop-${cropPage}-${Date.now()}`, page: cropPage, source: "recorte", blob, url: URL.createObjectURL(blob), toAnchor: null, removed: false }]);
            setCropPage(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Recorte rectangular de una página escaneada (arrastrar sobre la página). */
function CropDialog({ pdf, page, onClose, onCrop }: { pdf: LoadedPdf; page: number; onClose: () => void; onCrop: (b: Blob) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void renderPageCanvas(pdf.doc, page, 1600).then((c) => {
      if (!alive) return;
      c.style.width = "100%";
      c.style.height = "auto";
      c.style.display = "block";
      holder.current?.replaceChildren(c);
      setCanvas(c);
    });
    return () => {
      alive = false;
    };
  }, [pdf, page]);

  const rel = (e: React.PointerEvent) => {
    const r = holder.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-label={`Recortar una foto de la página ${page}`} data-testid="pdf-crop">
      <div className="max-h-full w-full max-w-3xl space-y-2 overflow-auto rounded-xl bg-cream-50 p-4">
        <p className="text-sm text-ink/80">Arrastra sobre la página para marcar la foto (pág. {page}).</p>
        <div
          className="relative cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            start.current = rel(e);
            setRect(null);
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const p = rel(e);
            const s = start.current;
            setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
          }}
          onPointerUp={() => {
            start.current = null;
          }}
          data-testid="pdf-crop-area"
        >
          {/* El canvas lo coloca el efecto: este div no tiene hijos de React. */}
          <div ref={holder} />
          {canvas ? null : <div className="h-[60vh] animate-pulse bg-cream-100" />}
          {rect ? (
            <div
              className="pointer-events-none absolute border-2 border-gold bg-gold/15"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            />
          ) : null}
        </div>
        {err ? <p className="text-xs text-red-700">{err}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canvas || !rect}
            onClick={async () => {
              try {
                onCrop(await cropToBlob(canvas!, rect!));
              } catch {
                setErr("El recorte es demasiado pequeño.");
              }
            }}
            className="rounded-lg bg-ink px-3 py-2 text-sm text-cream-50 disabled:opacity-50"
            data-testid="pdf-crop-add"
          >
            Añadir la foto recortada
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-ink/60">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
