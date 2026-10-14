// ============================================================================
// Estado del lector del catálogo (BCP-01 T8/T9, D12; ampliación C2, Z6). Puro:
// se prueba sin navegador en scripts/test-catalogs-public.mts.
//
// Páginas lógicas: portada · índice (con la introducción) · las partes de cada
// vivienda · cierre. Las partes dependen de la composición:
//   · «spread» (doble página, desde 900 × 620): apertura, de 0 a 3 dobles
//     páginas del recorrido («j1»…«j3», composición de journey-layout.ts) y
//     el detalle (datos completos, descripción íntegra y, si el recorrido no
//     alcanza, la historia completa) si hay algo que enseñar ahí;
//   · «single» (una página): UNA hoja continua por vivienda («open») con el
//     recorrido entero y el detalle plegable.
// Los folios y el índice cuentan estas páginas lógicas.
//
// D12 al llegar una versión nueva:
//   · la vivienda que se lee sigue → se queda en ella (aunque cambie de sitio)
//     y en la misma parte; si esa parte ya no existe, en la anterior que siga
//     existiendo;
//   · desaparece → pasa a la APERTURA de la SIGUIENTE que seguía en el orden
//     anterior y sigue existiendo, con un aviso (desde cualquier parte);
//   · no queda ninguna siguiente → vuelve al índice;
//   · no queda ninguna vivienda → índice con el estado vacío.
// La galería abierta se actualiza al momento; si su vivienda desaparece, se
// cierra y se aplica D12.
// ============================================================================

import { itemLayout } from "./journey-layout";
import type { PublicCatalog, PublicCatalogState, PublicItem } from "./public-contract";

export type ReaderLayout = "spread" | "single";
export type ItemPart = "open" | "j1" | "j2" | "j3" | "detail";

export type PageRef =
  | { kind: "cover" }
  | { kind: "index" }
  | { kind: "item"; key: string; part: ItemPart }
  | { kind: "closing" };

export interface GalleryRef {
  key: string;
  photo: number;
}

export interface ReaderState {
  catalog: PublicCatalog;
  fingerprint: string;
  expiresAt: string;
  layout: ReaderLayout;
  page: PageRef;
  gallery: GalleryRef | null;
  notice: string | null;
}

/** Duración del paso de página; con «reducir movimiento», 0. */
export const PAGE_TURN_MS = 380;

export const REMOVED_NOTICE = "La vivienda que estabas viendo ya no forma parte de la selección.";
export const REMOVED_LAST_NOTICE = "La vivienda que estabas viendo ya no forma parte de la selección. Vuelves al índice.";

const JOURNEY_PARTS: ItemPart[] = ["j1", "j2", "j3"];

/**
 * Partes de una vivienda. En doble página salen de la composición pura del
 * recorrido (journey-layout.ts, E1): apertura, de 0 a 3 dobles páginas de
 * recorrido y el detalle si hay algo que enseñar ahí. En una página, una hoja.
 */
export function itemParts(item: PublicItem, layout: ReaderLayout): ItemPart[] {
  if (layout === "single") return ["open"];
  const lay = itemLayout(item);
  const parts: ItemPart[] = ["open", ...JOURNEY_PARTS.slice(0, lay.spreads.length)];
  if (lay.detail) parts.push("detail");
  return parts;
}

export function pagesOf(catalog: PublicCatalog, layout: ReaderLayout = "single"): PageRef[] {
  return [
    { kind: "cover" },
    { kind: "index" },
    ...catalog.items.flatMap((it) => itemParts(it, layout).map((part) => ({ kind: "item" as const, key: it.key, part }))),
    { kind: "closing" },
  ];
}

export function samePage(a: PageRef, b: PageRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== "item") return true;
  return b.kind === "item" && a.key === b.key && a.part === b.part;
}

/**
 * La parte que se puede enseñar de verdad: si la pedida ya no existe (el texto
 * se acortó, se retiró o cambió la composición), la anterior que exista.
 * Una vivienda que no está se devuelve tal cual (la resuelve D12).
 */
export function clampPage(catalog: PublicCatalog, layout: ReaderLayout, page: PageRef): PageRef {
  if (page.kind !== "item") return page;
  const it = catalog.items.find((x) => x.key === page.key);
  if (!it) return page;
  const parts = itemParts(it, layout);
  if (parts.includes(page.part)) return page;
  const order: ItemPart[] = ["open", ...JOURNEY_PARTS, "detail"];
  const want = order.indexOf(page.part);
  let best: ItemPart = "open";
  for (const p of parts) if (order.indexOf(p) <= want) best = p;
  return { kind: "item", key: page.key, part: best };
}

export function pageIndex(catalog: PublicCatalog, page: PageRef, layout: ReaderLayout = "single"): number {
  const target = clampPage(catalog, layout, page);
  const i = pagesOf(catalog, layout).findIndex((p) => samePage(p, target));
  return i < 0 ? 0 : i;
}

/** Folio (1…N) de la apertura de una vivienda, para el índice. */
export function openingFolio(catalog: PublicCatalog, key: string, layout: ReaderLayout): number {
  return pageIndex(catalog, { kind: "item", key, part: "open" }, layout) + 1;
}

export function initialState(s: PublicCatalogState, start: PageRef = { kind: "cover" }, layout: ReaderLayout = "single"): ReaderState {
  const exists = start.kind !== "item" || s.catalog.items.some((it) => it.key === start.key);
  return {
    catalog: s.catalog,
    fingerprint: s.fingerprint,
    expiresAt: s.expiresAt,
    layout,
    page: exists ? clampPage(s.catalog, layout, start) : { kind: "cover" },
    gallery: null,
    notice: null,
  };
}

export function goTo(state: ReaderState, page: PageRef): ReaderState {
  return { ...state, page: clampPage(state.catalog, state.layout, page), gallery: null, notice: null };
}

/** Cambia la composición (girar la tableta, ensanchar la ventana) sin perder la vivienda. */
export function setLayout(state: ReaderState, layout: ReaderLayout): ReaderState {
  if (state.layout === layout) return state;
  return { ...state, layout, page: clampPage(state.catalog, layout, state.page) };
}

export function step(state: ReaderState, delta: 1 | -1): ReaderState {
  const pages = pagesOf(state.catalog, state.layout);
  const i = pageIndex(state.catalog, state.page, state.layout);
  const j = Math.min(pages.length - 1, Math.max(0, i + delta));
  return j === i ? state : goTo(state, pages[j]);
}

export function openGallery(state: ReaderState, key: string, photo = 0): ReaderState {
  const it = state.catalog.items.find((x) => x.key === key);
  if (!it || it.photos.length === 0) return state;
  return { ...state, gallery: { key, photo: Math.min(Math.max(0, photo), it.photos.length - 1) } };
}

export function closeGallery(state: ReaderState): ReaderState {
  return { ...state, gallery: null };
}

export function galleryStep(state: ReaderState, delta: 1 | -1): ReaderState {
  if (!state.gallery) return state;
  const it = state.catalog.items.find((x) => x.key === state.gallery!.key);
  if (!it || it.photos.length === 0) return closeGallery(state);
  const n = it.photos.length;
  return { ...state, gallery: { key: it.key, photo: (state.gallery.photo + delta + n) % n } };
}

/** Aplica una versión nueva del servidor (D12). */
export function applyUpdate(state: ReaderState, next: PublicCatalogState): ReaderState {
  if (next.fingerprint === state.fingerprint) {
    return state.expiresAt === next.expiresAt ? state : { ...state, expiresAt: next.expiresAt };
  }
  const newKeys = new Set(next.catalog.items.map((it) => it.key));
  let page = state.page;
  let notice: string | null = null;
  if (page.kind === "item" && !newKeys.has(page.key)) {
    const oldItems = state.catalog.items;
    const at = oldItems.findIndex((it) => it.key === (page as { key: string }).key);
    const following = oldItems.slice(at + 1).find((it) => newKeys.has(it.key));
    if (following) {
      page = { kind: "item", key: following.key, part: "open" };
      notice = REMOVED_NOTICE;
    } else {
      page = { kind: "index" };
      notice = REMOVED_LAST_NOTICE;
    }
  }
  let gallery = state.gallery;
  if (gallery) {
    const it = next.catalog.items.find((x) => x.key === gallery!.key);
    if (!it || it.photos.length === 0) gallery = null;
    else if (gallery.photo >= it.photos.length) gallery = { key: it.key, photo: it.photos.length - 1 };
  }
  page = clampPage(next.catalog, state.layout, page);
  return { catalog: next.catalog, fingerprint: next.fingerprint, expiresAt: next.expiresAt, layout: state.layout, page, gallery, notice };
}

/**
 * Cuánto esperar antes de aplicar una versión que llega ahora (E4). Solo se
 * espera a que termine un paso de página en curso, como mucho PAGE_TURN_MS
 * (0 con «reducir movimiento»). Con la galería abierta se aplica al momento.
 */
export function updateDelay(opts: {
  now: number;
  turnStartedAt: number | null;
  reducedMotion: boolean;
  galleryOpen: boolean;
}): number {
  if (opts.galleryOpen || opts.reducedMotion || opts.turnStartedAt === null) return 0;
  const left = opts.turnStartedAt + PAGE_TURN_MS - opts.now;
  return Math.max(0, Math.min(PAGE_TURN_MS, left));
}
