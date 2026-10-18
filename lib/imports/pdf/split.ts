// Separar un PDF en viviendas (BCP-01 P7, I-19). Puro.
//
// Propuesta: una página «abre» vivienda si trae precio y además m² o
// dormitorios. Las páginas sin esos datos (fotos, planos, portada) se pegan a
// la vivienda en curso; si la vivienda en curso aún no tiene datos (portada),
// la página con datos se le une en vez de abrir otra. La persona corrige con
// las herramientas de abajo; nada se decide sin que lo vea.

import { pageHasArea, pageHasPrice, pageHasRooms } from "./fields";

export interface PageSignals {
  page: number;
  price: boolean;
  area: boolean;
  rooms: boolean;
}

/** Grupos = lista de viviendas, cada una con sus páginas (1..n) en orden. */
export type Groups = number[][];

export function pageSignals(page: number, text: string): PageSignals {
  return { page, price: pageHasPrice(text), area: pageHasArea(text), rooms: pageHasRooms(text) };
}

const opens = (s: PageSignals) => s.price && (s.area || s.rooms);

export function proposeGroups(signals: PageSignals[]): Groups {
  const groups: Groups = [];
  let hasData = false;
  for (const s of [...signals].sort((a, b) => a.page - b.page)) {
    if (!groups.length) {
      groups.push([s.page]);
      hasData = opens(s);
      continue;
    }
    if (opens(s) && hasData) {
      groups.push([s.page]);
      continue;
    }
    groups[groups.length - 1].push(s.page);
    hasData = hasData || opens(s);
  }
  return groups;
}

const clean = (g: Groups): Groups => g.map((x) => [...x]).filter((x) => x.length > 0);

/** «Dividir aquí»: la página pasa a abrir una vivienda nueva con las que la siguen en su grupo. */
export function splitBefore(groups: Groups, page: number): Groups {
  const out: Groups = [];
  for (const g of groups) {
    const i = g.indexOf(page);
    if (i > 0) out.push(g.slice(0, i), g.slice(i));
    else out.push([...g]);
  }
  return clean(out);
}

/** «Unir con la anterior». */
export function mergeWithPrevious(groups: Groups, index: number): Groups {
  if (index <= 0 || index >= groups.length) return clean(groups);
  const out = clean(groups);
  out[index - 1] = [...out[index - 1], ...out[index]];
  out.splice(index, 1);
  return out;
}

/** «Mover página» a otra vivienda (al final, salvo posición). */
export function movePage(groups: Groups, page: number, to: number, position?: number): Groups {
  if (to < 0 || to >= groups.length) return clean(groups);
  const out = groups.map((g) => g.filter((p) => p !== page));
  const target = out[to];
  const at = position === undefined ? target.length : Math.max(0, Math.min(position, target.length));
  target.splice(at, 0, page);
  // Si la vivienda de origen se queda vacía se elimina (y los índices se desplazan).
  return clean(out);
}

/** «Quitar»: la página no pertenece a ninguna vivienda (portada, aviso legal…). */
export function removePage(groups: Groups, page: number): Groups {
  return clean(groups.map((g) => g.filter((p) => p !== page)));
}

/** Cada página como mucho una vez, dentro de 1..pageCount, sin viviendas vacías. */
export function validGroups(groups: Groups, pageCount: number): boolean {
  const seen = new Set<number>();
  for (const g of groups) {
    if (!g.length) return false;
    for (const p of g) {
      if (!Number.isInteger(p) || p < 1 || p > pageCount || seen.has(p)) return false;
      seen.add(p);
    }
  }
  return groups.length > 0;
}
