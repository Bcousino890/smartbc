// SOLO PRUEBAS: doble de lib/email/send-email.ts (que usa require y AWS SES). La ruta de baja de
// alertas solo importa el módulo de rebote (lib/email/property-offer.ts); aquí nunca se envía nada.
export const encryptSecret = (s: string) => s;
export const decryptSecret = (s: string) => s;
export function createSesTransport(): never {
  throw new Error("send-email (doble de pruebas): sin transporte");
}
export async function getEmailConfig() {
  return null;
}
export async function sendEmail(): Promise<{ success: false; error: string }> {
  return { success: false, error: "send-email (doble de pruebas)" };
}
