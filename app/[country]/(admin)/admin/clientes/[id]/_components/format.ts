// ============================================================================
// Fechas y cifras del Command Center.
//
// Dos locales distintos, a propósito:
//
//  · Las FECHAS se formatean con el locale del PAÍS del cliente (`es-ES` /
//    `es-CL`). Un cliente chileno no debería ver el formato español, que es
//    justo lo que pasaba: había nueve formateadores con "es-ES" incrustado en
//    esta superficie.
//
//  · El TIEMPO RELATIVO ("hace 3 h") va en el idioma de quien MIRA el panel,
//    porque es una frase que se lee, no un dato del cliente. Se resuelve con
//    `Intl.RelativeTimeFormat`, así que no hay ni una palabra escrita a mano.
// ============================================================================

export type UiLang = "es" | "en" | "fr" | "de";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** `Intl` revienta con fechas inválidas; aquí una fecha mala es simplemente null. */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(
  iso: string | null | undefined,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
): string {
  const d = parse(iso);
  return d ? new Intl.DateTimeFormat(locale, opts).format(d) : "—";
}

export function formatDateTime(
  iso: string | null | undefined,
  locale: string,
): string {
  return formatDate(iso, locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hace 3 h" / "3 h ago" / "vor 3 Std." — sin una sola cadena escrita aquí. */
export function formatRelative(
  iso: string | null | undefined,
  lang: UiLang,
  now: Date = new Date(),
): string {
  const d = parse(iso);
  if (!d) return "—";
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });

  if (abs < MIN) return rtf.format(0, "second");
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  if (abs < 365 * DAY) return rtf.format(Math.round(diff / (30 * DAY)), "month");
  return rtf.format(Math.round(diff / (365 * DAY)), "year");
}

/** Días entre hoy y una fecha. Positivo = en el futuro. */
export function daysAway(iso: string | null | undefined, now: Date = new Date()): number | null {
  const d = parse(iso);
  if (!d) return null;
  return Math.round((d.getTime() - now.getTime()) / DAY);
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}
