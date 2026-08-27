/**
 * Estimación de edad a partir de un RUT chileno.
 *
 * El RUT se asigna de forma correlativa al nacer, así que el número por sí
 * solo predice el año de nacimiento con precisión razonable. Coeficientes de
 * una regresión lineal pública (la misma que usan varias herramientas
 * chilenas de este tipo).
 *
 * Es una ESTIMACIÓN, no un dato verificado: puede fallar por varios años en
 * RUT tramitados en la adultez (migrantes, nacionalizados), y no aplica a RUT
 * de empresa — da una fecha de nacimiento en el futuro, así que se descarta.
 */

const SLOPE = 0.0000033363697569700348;
const INTERCEPT = 1932.2573852507373;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Parte numérica del RUT, sin puntos ni dígito verificador. */
function parseRutBody(rut: string): number | null {
  const cleaned = rut.replace(/[.\s]/g, "");
  const body = cleaned.includes("-") ? cleaned.split("-")[0] : cleaned.slice(0, -1);
  if (!/^\d+$/.test(body)) return null;
  const value = Number(body);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Reparte la parte decimal del año en los días reales de ese año. */
function yearDecimalToDate(yearDecimal: number): Date {
  const year = Math.floor(yearDecimal);
  const dayOfYear = Math.floor((yearDecimal - year) * (isLeapYear(year) ? 366 : 365));
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOfYear);
  return date;
}

/** Edad cumplida entre dos fechas (respeta si el cumpleaños ya pasó este año). */
function ageInYears(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayPassed) age--;
  return age;
}

/**
 * Devuelve la edad aproximada de una persona a partir de su RUT, o `null` si
 * el RUT no se puede leer o no corresponde a una persona natural (RUT de
 * empresa: da una fecha de nacimiento en el futuro).
 */
export function estimateAgeFromRut(rut: string | null | undefined, today: Date = new Date()): number | null {
  if (!rut) return null;
  const body = parseRutBody(rut.trim());
  if (body === null) return null;

  const birthDate = yearDecimalToDate(body * SLOPE + INTERCEPT);
  if (birthDate > today) return null;

  const age = ageInYears(birthDate, today);
  return age <= 110 ? age : null;
}
