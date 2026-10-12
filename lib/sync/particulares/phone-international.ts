import { normalizeSpanishPhone } from "./idealista-advertiser-detector";

/**
 * Teléfono de contacto de un anunciante, de CUALQUIER país, en formato E.164.
 *
 * `normalizeSpanishPhone` solo acepta números españoles (+34[6789]…) porque
 * nació para filtrar candidatos a teléfono dentro del HTML de Idealista, donde
 * cualquier otra cosa es ruido. Pero un anunciante de Fotocasa puede tener un
 * móvil francés, británico o italiano (muy frecuente en alquileres de
 * Salamanca/Chamberí): con esa función el número se DESCARTABA y el anuncio
 * quedaba como «solo chat». Medido el 2026-10-12 sobre 62 particulares de
 * Fotocasa: 2 (3,2 %) tenían un +33 y se perdían.
 *
 * Orden: primero las reglas españolas de siempre (mismo resultado de antes para
 * +34); si no es español, se acepta un E.164 internacional válido (`+` + 8–14
 * dígitos, sin ceros iniciales; `00CC…` se convierte en `+CC…`).
 */
export function normalizeContactPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const es = normalizeSpanishPhone(raw);
  if (es) return es;
  let c = raw.replace(/[\s\-()./·–—*]/g, "");
  if (c.startsWith("00")) c = `+${c.slice(2)}`;
  if (c.startsWith("+34")) return null; // un +34 que no pasó la regla española no es un teléfono
  return /^\+[1-9]\d{7,14}$/.test(c) ? c : null;
}
