/**
 * Conversión de pines del mapa a enlaces de portal para captar en lote.
 * Módulo PURO: sin base de datos ni Next (se prueba con node directamente).
 *
 * El tipo vive en lib/portal-links/types.ts (el módulo "use server" de
 * acciones no lo reexporta); el import es solo de tipo, así que se borra al
 * compilar y el test no arrastra dependencias de servidor.
 */
import type { PortalLinkInput } from "@/lib/portal-links/types";
import type { MapPin } from "./pins";

const MAX_NOTE = 300;

/**
 * Pines -> enlaces. Se omiten los pines sin URL (no hay nada que enlazar) y se
 * ordena por puntuación descendente para que, si el tope de 300 recorta, se
 * conserven los que mejor encajan. Sin puntuación va al final y mantiene su
 * orden (Array.prototype.sort es estable).
 */
export function toPortalLinkInputs(
  pins: MapPin[],
  scores: Map<string, number>,
): PortalLinkInput[] {
  const withUrl = pins.filter((p) => !!p.sourceUrl);
  const ordered = [...withUrl].sort((a, b) => {
    const sa = scores.get(a.id);
    const sb = scores.get(b.id);
    if (sa === undefined && sb === undefined) return 0;
    if (sa === undefined) return 1;
    if (sb === undefined) return -1;
    return sb - sa;
  });
  return ordered.map((p) => {
    const score = scores.get(p.id);
    const notes =
      score === undefined
        ? "Captado desde el mapa"
        : `Captado desde el mapa (${Math.round(score)}% de encaje)`;
    return {
      url: p.sourceUrl as string,
      title: p.title,
      price: p.price,
      operation: p.operation,
      zone: p.zone,
      bedrooms: p.bedrooms,
      // El pin del mapa no lleva baños: null = desconocido, no 0.
      bathrooms: null,
      squareMeters: p.squareMeters,
      imageUrl: p.coverUrl,
      notes: notes.slice(0, MAX_NOTE),
    };
  });
}
