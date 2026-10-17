import "server-only";
import { loadLogoDataUri } from "@/lib/pdf/load-logo";
import { renderCatalogInWorker } from "@/lib/pdf/catalog/render-in-worker";
import { photoId, type PdfPhoto } from "@/lib/pdf/catalog/document";
import { toPublicCatalog, type InternalSnapshot } from "../to-public";
import type { CatalogOperation } from "../operation-price";
import { captureFixed, isUnstableRead, verifyFixed, type Captured } from "./capture";
import { pdfFileName, photosOfExport, planItemExport } from "./plan";
import { loadExportPhoto, type PhotoNeed } from "./photos";
import { createExportRunner, type RunResult, type RunnerLimits } from "./runner";
import { exportReaders, scopeKey, type ExportScope } from "./source";

// ============================================================================
// PDF del catálogo · generación en el servidor (expediente
// 2026-10-16-bcp-01-pdf). Une la captura fija (K1), las fotos por clave, el
// documento y el núcleo acotado (K2, K3). Un solo núcleo por proceso (PM2 de
// un proceso, como el resto de límites en memoria del CRM).
// Límites fijados tras medir (T10, docs/changes/2026-10-16-bcp-01-pdf/
// medicion.md): el PDF más grande (24 viviendas, ~100 fotos de 3.600 px) tarda
// ~5 s en local y su maquetación bloquea el proceso dos veces ~0,9 s; por eso
// uno a la vez. La petición espera como mucho 55 s: por debajo de los 60 s
// por defecto del proxy (nginx), para responder un 503 propio y no un 504.
// ============================================================================

export const EXPORT_LIMITS: RunnerLimits = {
  maxConcurrent: 1,
  maxQueue: 3,
  queueWaitMs: 30_000,
  requestTimeoutMs: 55_000,
  jobBudgetMs: 50_000,
};

/** Ancho de cada foto incrustada (px), según su uso. */
export const PHOTO_WIDTHS = { cover: 1400, opening: 1400, section: 1100, more: 800 } as const;
/** Descargas de fotos a la vez dentro de un trabajo. */
const PHOTO_PARALLEL = 4;

type Cap = Captured<InternalSnapshot> & { capturedAt: Date };

export interface BuiltPdf {
  pdf: Buffer;
  fileName: string;
}

/** Fotos que necesita el PDF, con su versión en S1 (`u`) y su ancho. */
export function photoNeeds(snapshot: InternalSnapshot, operation: CatalogOperation): Map<string, PhotoNeed> {
  const catalog = toPublicCatalog(snapshot, operation);
  const needs = new Map<string, PhotoNeed>();
  const internal = new Map((snapshot.items ?? []).map((it) => [String(it.key), it]));
  const needOf = (itemKey: string, photoKey: string, width: number): PhotoNeed | null => {
    const it = internal.get(itemKey);
    const ph = it?.photos.find((p) => p.f === photoKey);
    return it && ph ? { slug: it.slug, key: photoKey, u: ph.u, width } : null;
  };
  for (const item of catalog.items) {
    const x = planItemExport(item);
    const sectionSet = new Set(x.sections.map((s) => s.photo).filter((p): p is number => p !== null));
    for (const idx of photosOfExport(x)) {
      const width = idx === x.opening ? PHOTO_WIDTHS.opening : sectionSet.has(idx) ? PHOTO_WIDTHS.section : PHOTO_WIDTHS.more;
      const n = needOf(item.key, item.photos[idx].key, width);
      if (n) needs.set(photoId(item.key, idx), n);
    }
  }
  if (catalog.coverPhoto) {
    for (const item of catalog.items) {
      const idx = item.photos.findIndex((p) => p.src === catalog.coverPhoto);
      if (idx < 0) continue;
      const n = needOf(item.key, item.photos[idx].key, PHOTO_WIDTHS.cover);
      if (n) needs.set("cover", n);
      break;
    }
  }
  return needs;
}

async function loadAll(needs: Map<string, PhotoNeed>, signal: AbortSignal): Promise<Map<string, PdfPhoto> | "changed"> {
  const out = new Map<string, PdfPhoto>();
  const entries = [...needs];
  let changed = false;
  let next = 0;
  const worker = async () => {
    while (!changed && next < entries.length) {
      if (signal.aborted) throw new Error("cancelled");
      const [id, need] = entries[next++];
      const r = await loadExportPhoto(need, signal);
      if (!r.ok && r.reason === "changed") {
        changed = true;
        return;
      }
      out.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PHOTO_PARALLEL, entries.length) }, worker));
  if (signal.aborted) throw new Error("cancelled");
  return changed ? "changed" : out;
}

/** Construye el PDF de una captura. «changed» si una foto ya no es la de S1. */
export async function buildCatalogPdf(cap: Cap, signal: AbortSignal): Promise<{ pdf: Buffer; fileName: string } | { changed: true }> {
  const catalog = toPublicCatalog(cap.snapshot, cap.operation);
  const photos = await loadAll(photoNeeds(cap.snapshot, cap.operation), signal);
  if (photos === "changed") return { changed: true };
  if (signal.aborted) throw new Error("cancelled");
  const logo = await loadLogoDataUri();
  // La maquetación va en un hilo aparte (expediente 2026-10-17-bcp-01-pdf-worker):
  // la señal del trabajo lo TERMINA de verdad, y no se devuelve hasta que el
  // hilo ha salido, así que el turno (K3) sigue ocupado hasta entonces.
  const { pdf } = await renderCatalogInWorker({ catalog, capturedAt: cap.capturedAt, logo, photos }, signal);
  return { pdf, fileName: pdfFileName(catalog.title, cap.capturedAt) };
}

const KEY = "__bcpCatalogPdfRunner";
type G = typeof globalThis & { [KEY]?: ReturnType<typeof makeRunner> };

function makeRunner() {
  const files = new WeakMap<Buffer, string>();
  const runner = createExportRunner<ExportScope, Cap>(
    {
      capture: async (scope) => {
        const c = await captureFixed(exportReaders(scope));
        return c ? { ...c, capturedAt: new Date() } : null;
      },
      isUnstable: isUnstableRead,
      verify: (scope, hash) => verifyFixed(exportReaders(scope), hash),
      build: async (cap, signal) => {
        const out = await buildCatalogPdf(cap, signal);
        if ("changed" in out) return out;
        files.set(out.pdf, out.fileName);
        return { pdf: out.pdf };
      },
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    },
    EXPORT_LIMITS,
  );
  return { runner, files };
}

function instance() {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = makeRunner();
  return g[KEY]!;
}

/** Genera el PDF de un ámbito para UNA petición (con su cancelación). */
export async function exportCatalogPdf(scope: ExportScope, signal: AbortSignal): Promise<(RunResult & { ok: false }) | { ok: true; pdf: Buffer; fileName: string }> {
  const { runner, files } = instance();
  const r = await runner.run(scope, scopeKey(scope), signal);
  if (!r.ok) return r;
  return { ok: true, pdf: r.pdf, fileName: files.get(r.pdf) ?? "Catálogo.pdf" };
}

export function exportStats() {
  return instance().runner.stats();
}
