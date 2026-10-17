import type { PublicCatalog } from "@/lib/catalogs/public-contract";

// ============================================================================
// PDF del catálogo · mensajes entre el hilo principal y el hilo de maquetación
// (expediente 2026-10-17-bcp-01-pdf-worker). Puro: sin Node ni React.
//
// Al hilo solo va lo que la maquetación necesita, sin secretos: la proyección
// pública SANEADA (sin `src` de fotos, sin claves de fotos, sin `coverPhoto`;
// las fotos de cada vivienda quedan como marcadores que conservan cuántas
// hay), la fecha de la captura, el logo y los bytes de las fotos. Nunca
// tokens, ids internos, slugs, URL ni credenciales.
// ============================================================================

export const WORKER_PROTOCOL = 1;

export type WorkerPhoto =
  | { id: string; ok: true; width: number; height: number; data: ArrayBuffer }
  | { id: string; ok: false };

export interface WorkerRenderRequest {
  type: "render";
  v: typeof WORKER_PROTOCOL;
  catalog: PublicCatalog;
  capturedAt: string;
  logo: string | null;
  photos: WorkerPhoto[];
}

export interface WorkerData {
  v: typeof WORKER_PROTOCOL;
  /** Carpeta del proyecto (las fuentes están en lib/pdf/fonts). */
  root: string;
  /** SOLO PRUEBAS: fallos provocados. La app nunca los pone. */
  test?: { failStartup?: boolean; renderDelayMs?: number; throwInRender?: boolean };
}

export type WorkerMessage =
  | { type: "ready" }
  | { type: "startup-error"; code: "fonts_missing" | "startup_failed" }
  | { type: "done"; pdf: ArrayBuffer; passes: number; ms: number; heapUsedMB: number; heapTotalMB: number }
  | { type: "error"; code: "index_unstable" | "render_failed" };

/** La proyección sin nada que la maquetación no use: ni rutas ni claves de
 *  las fotos (solo cuántas hay y sus medidas), ni la foto de portada por URL
 *  (la portada llega ya leída en `photos` con el id "cover"). */
export function sanitizeCatalogForWorker(catalog: PublicCatalog): PublicCatalog {
  return {
    ...catalog,
    coverPhoto: null,
    items: catalog.items.map((it) => ({
      ...it,
      photos: it.photos.map((ph) => ({ key: "", src: "", width: ph.width, height: ph.height, orientation: ph.orientation })),
    })),
  };
}
