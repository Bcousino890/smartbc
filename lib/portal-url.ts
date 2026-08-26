/**
 * Dominio canónico para enlaces que se envían a alguien FUERA del CRM
 * (SmartLinks, colecciones privadas, shortlist del cliente).
 *
 * Deliberadamente NO se usa `window.location.origin`: un agente que entra al
 * panel por `www.bcousinoprop.com` (dominio de marketing, mismo servidor por
 * rewrite — ver middleware.ts) generaría ahí mismo el enlace que copia y le
 * manda al cliente. Import server- y client-side por igual: al llevar el
 * prefijo NEXT_PUBLIC_, Next lo incrusta en el bundle del navegador en build.
 */
export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.bcousinoprop.com";
