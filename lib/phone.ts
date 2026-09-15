/**
 * Generic phone helpers used across the WhatsApp/CRM actions. Not tied to any
 * Zinto API generation — v2 has its own E.164-with-"+" normalizer for the
 * actual send call (`normalizeRecipientV2` in lib/services/zinto-v2/client.ts).
 */

/** Strip a phone number down to digits only (no "+", spaces, dashes). */
export function normalizePhoneNumber(raw: string): string {
  return (raw || '').replace(/[^\d]/g, '');
}

/** Basic sanity check for an international number (7–15 digits, E.164 range). */
export function isValidPhoneNumber(raw: string): boolean {
  const digits = normalizePhoneNumber(raw);
  return digits.length >= 7 && digits.length <= 15;
}
