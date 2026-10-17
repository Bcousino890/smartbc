/**
 * Secreto con el que se firman los tokens HMAC de Idealista (token de la
 * extensión de Chrome y token de publicación). Módulo PURO:
 * `npm run test:cron-secret`.
 *
 * Antes: `IDEALISTA_EXT_SECRET || CRON_SECRET || "dev-secret-change-me"`. Si no
 * había ninguna variable, el secreto era un literal público del repositorio y
 * cualquiera podía FORJAR un token válido (el de la extensión da lectura de
 * todos los clientes y escritura de leads durante un año).
 *
 * Ahora no hay literal: si no hay un secreto utilizable se lanza un error y no
 * se firma ni se verifica nada. Se resuelve de forma PEREZOSA (al firmar o
 * verificar, no al importar el módulo) para no romper `next build` en entornos
 * sin variables.
 */
export const MIN_SIGNING_SECRET_LENGTH = 16;

export function getSigningSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const candidate = env.IDEALISTA_EXT_SECRET || env.CRON_SECRET;
  if (!candidate || candidate.length < MIN_SIGNING_SECRET_LENGTH) {
    throw new Error(
      "Falta IDEALISTA_EXT_SECRET (o CRON_SECRET) con al menos 16 caracteres: no se pueden firmar tokens de Idealista",
    );
  }
  return candidate;
}
