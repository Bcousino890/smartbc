// Prueba de conectividad real contra el contrato nuevo de Zinto
// (docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md, sección 11).
//
//   ZINTO_API_URL=https://crm.zinto.app/_integration-api \
//   ZINTO_API_KEY=pcp_... \
//   npm run zinto-integration:smoke
//
// Deliberadamente NO inventa resultados si falta la clave: reporta el paso
// como BLOQUEADO en vez de fingir un resultado, tal como pide el encargo.
// Cubre solo pasos de solo-lectura de la sección 11 (1-3); los pasos de
// escritura (4+) requieren confirmar antes la allowlist de bcousinoprop con
// Zinto y no se ejecutan aquí.

import { ZintoIntegrationApiClient } from "../lib/services/zinto-integration/client.ts";
import { getZintoIntegrationConfig } from "../lib/services/zinto-integration/config.ts";
import { ZintoIntegrationApiError } from "../lib/services/zinto-integration/errors.ts";

function blocked(step: string, reason: string) {
  console.log(`BLOCKED  ${step}\n         ${reason}`);
}

function ok(step: string, detail = "") {
  console.log(`OK       ${step}${detail ? `\n         ${detail}` : ""}`);
}

function failed(step: string, detail: string) {
  console.error(`FAILED   ${step}\n         ${detail}`);
}

async function main() {
  const config = getZintoIntegrationConfig();

  console.log("=== Zinto Integration API — smoke test de conectividad ===\n");

  if (!config) {
    blocked(
      "Toda la prueba",
      "ZINTO_API_KEY no está configurada en el entorno. No se ejecuta ninguna llamada real; " +
        "el cliente queda preparado (lib/services/zinto-integration/client.ts) para cuando " +
        "Zinto entregue una clave pcp_... exclusiva de bcousinoprop."
    );
    process.exitCode = 2;
    return;
  }

  console.log(`Base URL: ${config.apiUrl}`);
  console.log(`Feature flag ZINTO_INTEGRATION_API_ENABLED: ${config.enabled}\n`);

  const client = new ZintoIntegrationApiClient(config);

  // 1) /health y /ready no requieren auth y no están en el cliente tipado
  //    (son endpoints de sistema, no del contrato de negocio) — se golpean
  //    directo con fetch.
  try {
    const health = await fetch(`${config.apiUrl}/health`);
    if (health.ok) ok("GET /health", `status ${health.status}`);
    else failed("GET /health", `status ${health.status}`);
  } catch (err) {
    failed("GET /health", err instanceof Error ? err.message : String(err));
  }

  try {
    const ready = await fetch(`${config.apiUrl}/ready`);
    if (ready.ok) ok("GET /ready", `status ${ready.status}`);
    else failed("GET /ready", `status ${ready.status} (puede ser normal si una dependencia no está lista)`);
  } catch (err) {
    failed("GET /ready", err instanceof Error ? err.message : String(err));
  }

  // 2) /api/v1/me — confirma empresa, nombre de clave y scopes efectivos.
  try {
    const me = await client.getMe();
    ok(
      "GET /api/v1/me",
      `empresa=${me.data.company?.name ?? "?"} (${me.data.company?.id ?? "?"}) · clave=${me.data.api_key?.name ?? "?"} · scopes=${(me.data.scopes ?? []).join(", ")}`
    );

    const expectedCompanyName = "bcousinoprop";
    if (me.data.company?.id && !String(me.data.company.name ?? "").toLowerCase().includes(expectedCompanyName)) {
      console.warn(
        `  ADVERTENCIA: la empresa devuelta no parece ser "${expectedCompanyName}". Confirma que la clave es la del piloto correcto.`
      );
    }
  } catch (err) {
    if (err instanceof ZintoIntegrationApiError) {
      failed("GET /api/v1/me", `${err.status} ${err.code}: ${err.message}${err.requestId ? ` (request_id=${err.requestId})` : ""}`);
    } else {
      failed("GET /api/v1/me", err instanceof Error ? err.message : String(err));
    }
    process.exitCode = 1;
    return;
  }

  // 3) Lectura no destructiva: canales + primera página de contactos.
  try {
    const channels = await client.listChannels();
    ok("GET /api/v1/channels", `${channels.data.length} canal(es)`);
  } catch (err) {
    if (err instanceof ZintoIntegrationApiError && err.code === "insufficient_scope") {
      blocked("GET /api/v1/channels", "La clave no tiene el scope channels:read.");
    } else {
      failed("GET /api/v1/channels", err instanceof Error ? err.message : String(err));
    }
  }

  try {
    const contacts = await client.listContacts({ limit: 1 });
    ok("GET /api/v1/contacts?limit=1", `has_more=${contacts.meta.has_more} request_id=${contacts.meta.request_id}`);
  } catch (err) {
    if (err instanceof ZintoIntegrationApiError && err.code === "insufficient_scope") {
      blocked("GET /api/v1/contacts", "La clave no tiene el scope contacts:read.");
    } else {
      failed("GET /api/v1/contacts", err instanceof Error ? err.message : String(err));
    }
  }

  console.log(
    "\nPasos de escritura (crear/actualizar contacto, enviar mensaje, notas, etiquetas, deals, " +
      "tareas) NO se ejecutan en este smoke test: requieren confirmación explícita de Zinto de que " +
      "bcousinoprop está en la allowlist de escritura (docs/AUTHENTICATION.md, WRITE_ENABLED_COMPANY_IDS). " +
      "Ejecutarlos sin esa confirmación arriesga un 403 por política operativa, no por falta de scope."
  );
}

main().catch((err) => {
  console.error("Error inesperado en el smoke test:", err);
  process.exitCode = 1;
});
