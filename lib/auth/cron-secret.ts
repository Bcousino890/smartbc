import { timingSafeEqual } from "node:crypto";

/**
 * Autenticación de los endpoints que llaman los crons del VPS y los scripts
 * (`Authorization: Bearer $CRON_SECRET`). Módulo PURO: `npm run test:cron-secret`.
 *
 * Por qué existe: 12 rutas de `app/api/cron/**` comparaban
 * `header !== \`Bearer ${process.env.CRON_SECRET}\``. Si la variable no está
 * definida (o está vacía), esa cadena es `"Bearer undefined"` (o `"Bearer "`):
 * cualquiera que mandase justo eso entraba. Además la comparación con `!==` no
 * es de tiempo constante.
 *
 * Reglas:
 *   - Sin secreto configurado (vacío, ausente o demasiado corto) NADIE entra.
 *   - La comparación es de tiempo constante.
 */

/** Longitud mínima del secreto: por debajo se considera mal configurado. */
export const MIN_CRON_SECRET_LENGTH = 16;

function usableSecret(secret: string | undefined | null): string | null {
  if (!secret) return null;
  return secret.length >= MIN_CRON_SECRET_LENGTH ? secret : null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * ¿El valor de la cabecera `Authorization` es `Bearer <CRON_SECRET>`?
 * `secret` se puede inyectar (pruebas); por defecto, la variable de entorno.
 */
export function cronAuthorized(
  authorizationHeader: string | null | undefined,
  secret: string | undefined | null = process.env.CRON_SECRET,
): boolean {
  const s = usableSecret(secret);
  if (!s || !authorizationHeader) return false;
  return safeEqual(authorizationHeader, `Bearer ${s}`);
}

/** ¿El valor crudo (p. ej. cabecera `x-cron-secret`) es el CRON_SECRET? */
export function cronSecretMatches(
  candidate: string | null | undefined,
  secret: string | undefined | null = process.env.CRON_SECRET,
): boolean {
  const s = usableSecret(secret);
  if (!s || !candidate) return false;
  return safeEqual(candidate, s);
}
