import { materialOf, type CatalogMaterial } from "./material";
import { toPublicItem, type InternalSnapshot } from "./to-public";

// Diagnósticos de material por vivienda (BCP-01 E2, D-QA8), con la MISMA
// instantánea interna y la misma proyección que el lector. Puro. Aparte de
// material.ts porque to-public usa node:crypto (no debe llegar al navegador).

/** Material de cada vivienda de la lista, por propertyId (emparejado por slug).
 *  Las vendidas y archivadas no las ve el cliente: no tienen diagnóstico. */
export function materialByProperty(
  snap: Pick<InternalSnapshot, "items"> | null,
  items: Array<{ propertyId: string; slug: string }>,
): Record<string, CatalogMaterial> {
  const out: Record<string, CatalogMaterial> = {};
  if (!snap) return out;
  const bySlug = new Map(items.map((it) => [it.slug, it.propertyId]));
  for (const it of snap.items ?? []) {
    if (!it || it.status === "sold" || it.status === "archived") continue;
    const id = bySlug.get(it.slug);
    if (!id) continue;
    out[id] = materialOf(toPublicItem(it));
  }
  return out;
}
