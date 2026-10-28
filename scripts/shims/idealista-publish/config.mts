// SOLO PRUEBAS LOCALES. Sustituye partner-api/config.ts: configuración ficticia
// fija (sin base, sin secretos). `sandbox` lo decide globalThis.__idealista.sandbox.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
export async function getIdealistaApiConfig() {
  return {
    clientId: "test-client",
    clientSecret: "test-secret",
    feedKey: "ilc-test",
    sandbox: g.__idealista?.sandbox ?? false,
    scope: "idealista",
    country: "Spain",
    language: "es",
    sendCode: true,
    defaultContactId: 4242,
  };
}
export function isValidFeedKey() {
  return true;
}
