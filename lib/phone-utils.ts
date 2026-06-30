/**
 * Utilidades para normalización y validación de números telefónicos
 * Enfocadas en números chilenos
 */

export function normalizePhone(input: string): string {
  // Remover espacios, guiones, puntos, paréntesis
  let cleaned = input.replace(/[\s\-\.\(\)]/g, '');

  // Remover leading 0 o +56
  cleaned = cleaned.replace(/^0/, '').replace(/^\+?56/, '');

  // Agregar prefix +56
  return '+56' + cleaned;
}

export function isValidPhoneChile(phone: string): boolean {
  // Después de normalización, debe ser +56 seguido de 9 dígitos
  return /^\+56\d{9}$/.test(phone);
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  // Si ya está normalizado
  if (phone.startsWith('+56')) {
    return phone;
  }

  // Si no está normalizado, normalizar primero
  return normalizePhone(phone);
}

export function formatPhoneForDisplay(phone: string): string {
  // Retornar como está (normalizado)
  // Ej: +56991234567 → +56 9 9123 4567 (opcional, por ahora retornamos como está)
  return phone;
}
