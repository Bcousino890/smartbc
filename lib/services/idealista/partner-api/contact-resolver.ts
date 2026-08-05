import "server-only";
import { getIdealistaApiConfig, saveDefaultContactId } from "./config";
import { createContact } from "./contacts";

function splitPhone(raw: string): { prefix: string; number: string } {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    // +34600111222 -> prefix 34, number 600111222 (España: prefijo 2 dígitos + 9 dígitos)
    const withoutPlus = digits.slice(1);
    if (withoutPlus.length > 9) {
      return { prefix: withoutPlus.slice(0, withoutPlus.length - 9), number: withoutPlus.slice(-9) };
    }
    return { prefix: "34", number: withoutPlus };
  }
  return { prefix: "34", number: digits };
}

// Devuelve el contactId de Idealista a usar en las propiedades publicadas por
// API. Se crea una única vez (reusando el guardado en idealista_config) porque
// el Partner API asocia el anuncio a un contacto/agente ya existente en la cuenta.
export async function resolveDefaultContactId(): Promise<number> {
  const config = await getIdealistaApiConfig();
  if (!config) throw new Error("Configuración de Idealista no encontrada");
  if (config.defaultContactId) return config.defaultContactId;

  if (!config.defaultContactEmail || !config.defaultContactName || !config.defaultContactPhone) {
    throw new Error(
      "Falta el contacto por defecto. Ve a Configuración → Idealista → API y completa nombre, email y teléfono del contacto."
    );
  }

  const { prefix, number } = splitPhone(config.defaultContactPhone);
  const result = await createContact({
    name: config.defaultContactName,
    email: config.defaultContactEmail,
    primaryPhonePrefix: prefix,
    primaryPhoneNumber: number,
  });

  await saveDefaultContactId(result.contactId);
  return result.contactId;
}
