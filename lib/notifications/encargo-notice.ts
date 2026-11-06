// Avisos de encargo (type 'encargo_match') en la campanita. Puro, sin server-only:
// lo usan la ruta GET y el componente, y lo prueba
// scripts/test-notifications-bell-store.mts.

/**
 * El enlace viene de la base de datos: solo se sigue si es una ruta relativa del
 * mismo origen ("/..." y no "//host", ni esquema, ni barras invertidas ni
 * caracteres de control).
 */
export function isSafeInternalHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length === 0) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(href)) return false;
  return true;
}

export type EncargoNoticeRow = {
  id: unknown;
  title?: unknown;
  body?: unknown;
  link?: unknown;
  created_at: unknown;
};

export type EncargoBellItem = {
  id: string;
  noticeId: string;
  type: "encargo_match";
  title: string;
  subtitle: string;
  created_at: string;
  /** Vacío si el enlace guardado no es seguro: el ítem se pinta sin navegación. */
  href: string;
};

export function mapEncargoNoticeRow(row: EncargoNoticeRow): EncargoBellItem {
  const id = String(row.id);
  return {
    id: `en-${id}`,
    noticeId: id,
    type: "encargo_match",
    title: typeof row.title === "string" && row.title ? row.title : "Encargo",
    subtitle: String(row.body ?? ""),
    created_at: String(row.created_at),
    href: isSafeInternalHref(row.link) ? row.link : "",
  };
}
