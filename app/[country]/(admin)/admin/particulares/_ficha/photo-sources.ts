import type { AgencyWebSource, LinkedAd } from "@/lib/particulares/links-types";
import { portalName } from "./format";

/** Una fuente (anuncio enlazado del mismo inmueble) con fotos propias. */
export type PhotoSource = {
  id: string;
  portal: string;
  /** «Fotocasa : Anuncio Particular» */
  label: string;
  /** Nombre corto de la fuente para «Fuente: …». */
  portalLabel: string;
  sourceUrl: string;
  photos: Array<{ url: string }>;
};

/**
 * Fuentes con fotos del mismo inmueble, la de la ficha abierta primero. Si dos
 * anuncios comparten portal y anunciante (venta + alquiler) se distinguen por la operación.
 */
export function buildPhotoSources(members: LinkedAd[] | null, currentId: string, webs: AgencyWebSource[] = []): PhotoSource[] {
  if (!members) return [];
  const withPhotos = members.filter((m) => m.photos.length > 0);
  const base = withPhotos.map((m) => ({
    m,
    label: `${portalName(m.portal)}: ${m.owner_name?.trim() || "Anuncio Particular"}`,
  }));
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
  const out = base.map(({ m, label }) => ({
    id: m.id,
    portal: m.portal,
    label: (counts.get(label) ?? 0) > 1 ? `${label} (${m.operation === "rent" ? "alquiler" : "venta"})` : label,
    portalLabel: portalName(m.portal),
    sourceUrl: m.source_url,
    photos: m.photos,
  }));
  // Web propia de la agencia: fotos ORIGINALES sin marca de agua (solo las de una ficha verificada).
  for (const w of webs) {
    if (w.photos.length === 0 || w.verdict.state === "no_coincide") continue;
    const who = w.agency_name?.trim() || w.domain;
    out.push({
      id: `web:${w.key}`,
      portal: "web",
      label: `Web de ${who}: fotos sin marca de agua`,
      portalLabel: `Web de ${who}`,
      sourceUrl: w.canonical_url ?? w.url,
      photos: w.photos,
    });
  }
  return out.sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
}

/** Otra fuente con claramente más fotos que la mostrada (+3 y +15 %). */
export function richerSource(sources: PhotoSource[], activeId: string): PhotoSource | null {
  const active = sources.find((s) => s.id === activeId);
  if (!active) return null;
  const n = active.photos.length;
  const best = sources.filter((s) => s.id !== activeId).sort((a, b) => b.photos.length - a.photos.length)[0];
  return best && best.photos.length >= n + 3 && best.photos.length >= n * 1.15 ? best : null;
}
