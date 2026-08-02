import "server-only";

/**
 * Marca de cambio hecho por una PERSONA en el panel.
 *
 * Existe para que una integración externa pueda sondear qué ha cambiado en
 * SmartBC sin recibir el eco de sus propios envíos. `updated_at` no sirve: lo
 * escriben por igual las rutas del panel y las de /api/v1, así que sondearlo
 * devolvería también lo que acaba de empujar el propio integrador y crearía un
 * ping-pong (él escribe → lo ve como cambio nuestro → lo refleja → lo reenvía).
 *
 * Regla, y es la única que importa:
 *
 *   ✔ La estampan las rutas de app/api/admin/** y las acciones del panel.
 *   ✘ NO la estampan las rutas de app/api/v1/** ni lib/captaciones/write/**.
 *   ✘ Tampoco el reparto automático: lo dispara la creación por API, así que
 *     contarlo como "cambio del equipo" reintroduciría el eco por otra vía.
 *
 * Se usa mezclándola en el objeto de UPDATE que ya construye cada ruta, para no
 * añadir una escritura extra:
 *
 *   await db.from("captaciones")
 *     .update({ ...updates, ...panelChange() })
 *     .eq("id", id);
 */
export function panelChange(at: Date = new Date()): {
  updated_at: string;
  updated_by_user_at: string;
} {
  const iso = at.toISOString();
  return { updated_at: iso, updated_by_user_at: iso };
}

/**
 * Sella la marca en una captación cuando el cambio no ocurrió sobre su propia
 * fila, sino sobre un satélite (un contacto, un intento). Best-effort: que falle
 * el sello nunca debe tumbar la operación real.
 */
export async function stampPanelChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string
): Promise<void> {
  try {
    await db.from("captaciones").update(panelChange()).eq("id", captacionId);
  } catch (err) {
    console.error("[stampPanelChange]", err);
  }
}
