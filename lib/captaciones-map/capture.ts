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

// ─── Validación de entrada de las acciones del mapa ──────────────────────────
// Va aquí (módulo puro) y no en captacion-actions.ts porque un fichero
// "use server" solo puede exportar funciones async, y así se prueba con node.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID (mayúsculas o minúsculas) → minúsculas; cualquier otra cosa → null. */
export function normalizeUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

export type IdsCheck =
  | { ok: true; clientId: string; ids: string[] }
  | { ok: false; error: string };

/**
 * Valida cliente + anuncios antes de tocar la base: los ids de ambos son
 * uuid, y uno que no lo sea haría fallar el `.in()`/`.eq()` de Postgres con un
 * error críptico. Normaliza a minúsculas y quita repetidos (un mismo anuncio
 * en mayúsculas y minúsculas es el mismo anuncio).
 */
export function validateClientAndPinIds(
  clientId: unknown,
  pinIds: unknown,
  max: number,
): IdsCheck {
  const cid = normalizeUuid(clientId);
  if (!cid) return { ok: false, error: "Cliente no válido." };
  if (!Array.isArray(pinIds) || pinIds.length === 0) {
    return { ok: false, error: "No hay anuncios seleccionados." };
  }
  const ids: string[] = [];
  for (const raw of pinIds) {
    const id = normalizeUuid(raw);
    if (!id) return { ok: false, error: "Hay anuncios con un identificador no válido." };
    ids.push(id);
  }
  const unique = [...new Set(ids)];
  if (unique.length > max) return { ok: false, error: `Máximo ${max} anuncios por envío.` };
  return { ok: true, clientId: cid, ids: unique };
}

/**
 * ¿Hay que rechazar el guardado de zona? Si llegaron polígonos pero ninguno
 * sobrevive a la limpieza, guardar `[]` BORRARÍA la zona que el cliente ya
 * tenía: se rechaza. Una lista vacía de entrada sí es "quitar la zona".
 */
export function zoneSaveRejected(inputCount: number, cleanedCount: number): boolean {
  return inputCount > 0 && cleanedCount === 0;
}
