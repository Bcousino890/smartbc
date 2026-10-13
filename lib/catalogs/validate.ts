// Validación de lo que llega a las acciones de catálogo (BCP-01). Pura: se
// prueba en scripts/test-catalogs.mts. La base de datos vuelve a comprobarlo
// (CHECK de 0192); esto es para dar un mensaje claro antes de llamar.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function normalizeTitle(v: unknown): { ok: true; value: string } | { ok: false; error: "title_invalid" } {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (s.length < 1 || s.length > 160) return { ok: false, error: "title_invalid" };
  return { ok: true, value: s };
}

export function normalizeIntro(v: unknown): { ok: true; value: string | null } | { ok: false; error: "intro_too_long" } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > 2000) return { ok: false, error: "intro_too_long" };
  return { ok: true, value: s.length ? s : null };
}

/** Lista de ids para reordenar: todos UUID y sin repetidos. */
export function isValidOrder(ids: unknown): ids is string[] {
  if (!Array.isArray(ids) || ids.length > 500) return false;
  if (!ids.every(isUuid)) return false;
  return new Set(ids.map((s) => (s as string).toLowerCase())).size === ids.length;
}
