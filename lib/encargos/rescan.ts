// ¿Hay que volver a mirar todo el stock tras guardar un encargo? (Decisión 3
// del diseño: cambiar los criterios de un encargo cuenta también el stock
// actual, con UN aviso agrupado.) Módulo PURO, compartido por las acciones de
// encargos y por el diálogo de siempre «Editar encargo» (saveClientPreferencesFull),
// para que los dos caminos hagan lo mismo. Solo España.

import { briefSuggestMissing, buildPreferencesPayload, type BriefInput } from "@/lib/clients/brief";

/** JSON con las claves ordenadas: dos objetos iguales dan el mismo texto aunque el orden de claves cambie. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * ¿Cambian los criterios? Se compara lo que se GUARDARÍA (`buildPreferencesPayload`,
 * ya normalizado: lo que no aplica a la operación va a NULL, listas limpias…),
 * no el objeto del formulario: abrir y guardar sin tocar nada no es un cambio.
 * Sin encargo previo (alta) siempre lo es.
 */
export function briefChanged(prev: BriefInput | null | undefined, next: BriefInput): boolean {
  if (!prev) return true;
  return canonical(buildPreferencesPayload(prev)) !== canonical(buildPreferencesPayload(next));
}

/** Solo clientes de España y solo si cambiaron los criterios: reiniciar `baseline_at` y programar el pase inicial. */
export function shouldRescan(input: {
  clientCountry: string | null | undefined;
  prev: BriefInput | null | undefined;
  next: BriefInput;
}): boolean {
  return input.clientCountry === "es" && briefChanged(input.prev, input.next);
}

/**
 * Alta de cliente con encargo («Nuevo cliente»): pase inicial solo en España y solo si el brief ya
 * tiene lo mínimo para cruzar (zona y presupuesto). El propio pase lo vuelve a comprobar.
 */
export function shouldRunInitialPassOnCreate(input: { clientCountry: string | null | undefined; brief: BriefInput }): boolean {
  return input.clientCountry === "es" && briefSuggestMissing(input.brief).length === 0;
}
