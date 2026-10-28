// Pura (sin servidor): la usan las consultas y sus pruebas.

/**
 * Orden de vídeos y planos: los que tienen `position` (0232: los que refleja la
 * sincronización con Idealista) primero y en su orden; el resto detrás, tal
 * como venían. Sin `position` en ninguna fila, el orden no cambia.
 */
export function sortMediaByPosition<T extends { position?: number | null }>(rows: T[]): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const pa = a.row.position ?? null;
      const pb = b.row.position ?? null;
      if (pa !== null && pb !== null) return pa - pb || a.i - b.i;
      if (pa !== null) return -1;
      if (pb !== null) return 1;
      return a.i - b.i;
    })
    .map(({ row }) => row);
}

