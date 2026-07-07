import { normalizePhone, isValidPhoneChile } from "@/lib/phone-utils";

export type ExtraPhone = { phone: string; has_whatsapp: boolean };

// Valida y normaliza el array extra_phones que llega del cliente.
// Devuelve { phones } listo para guardar en JSONB, o { error } si algún
// teléfono no es un número chileno válido.
export function parseExtraPhones(
  input: unknown
): { phones: ExtraPhone[]; error?: undefined } | { phones?: undefined; error: string } {
  if (input === undefined || input === null) return { phones: [] };
  if (!Array.isArray(input)) {
    return { error: "extra_phones debe ser un array" };
  }

  const phones: ExtraPhone[] = [];
  for (const item of input) {
    const raw = typeof item?.phone === "string" ? item.phone.trim() : "";
    if (!raw) continue;
    const normalized = normalizePhone(raw);
    if (!isValidPhoneChile(normalized)) {
      return { error: `Teléfono adicional inválido: ${raw}` };
    }
    // Evitar duplicados dentro del mismo contacto
    if (phones.some((p) => p.phone === normalized)) continue;
    phones.push({ phone: normalized, has_whatsapp: Boolean(item?.has_whatsapp) });
  }
  return { phones };
}
