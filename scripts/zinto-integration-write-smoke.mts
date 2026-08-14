// Prueba de aceptación de ESCRITURA para el piloto Zinto (docs/api/
// SMARTBC-INTEGRATION-GUIDE-2026-08-13.md, sección 11, pasos 3-11).
//
//   ZINTO_API_URL=https://crm.zinto.app/_integration-api \
//   ZINTO_API_KEY=pcp_... \
//   ZINTO_WRITE_ALLOWLISTED=true \
//   npm run zinto-integration:write-smoke
//
// A diferencia de zinto-integration-smoke.mts (solo lectura), este script
// CREA datos reales en el CRM de bcousinoprop y envía un mensaje de WhatsApp.
// Por eso:
//   - Se niega a correr si ZINTO_WRITE_ALLOWLISTED !== "true" (confirmación
//     explícita de que Zinto ya activó la allowlist de escrituras). No hay
//     forma de saltarse esto con una flag: si Zinto todavía tiene
//     READ_ONLY_MODE=true, cada llamada de escritura va a devolver 403 igual;
//     esto solo evita gastar el cupo de intentos "a ciegas".
//   - Solo usa los números autorizados del piloto (España +34 606806103,
//     Chile +56 9 91653343). Nunca un número real de cliente.
//   - Usa un Idempotency-Key nuevo por operación y repite una petición al
//     final con la MISMA clave para comprobar el replay (paso 11).
//   - No inventa nombres de campo: todo el body sale de los tipos en
//     lib/services/zinto-integration/types.ts, generados desde openapi.yaml.

import { randomUUID } from "node:crypto";
import { ZintoIntegrationApiClient } from "../lib/services/zinto-integration/client.ts";
import { getZintoIntegrationConfig, isZintoWriteAllowlisted } from "../lib/services/zinto-integration/config.ts";
import { ZintoIntegrationApiError } from "../lib/services/zinto-integration/errors.ts";

const AUTHORIZED_NUMBERS = {
  es: "+34606806103",
  cl: "+56991653343",
} as const;

const PILOT_COMPANY_HINT = "bcousinoprop";

let step = 0;
function log(status: "OK" | "FAILED" | "SKIP", label: string, detail = "") {
  step++;
  const prefix = status.padEnd(6);
  console.log(`${step}. ${prefix} ${label}${detail ? `\n         ${detail}` : ""}`);
}

async function main() {
  console.log("=== Zinto Integration API — prueba de aceptación de ESCRITURA (piloto) ===\n");

  const config = getZintoIntegrationConfig();
  if (!config) {
    console.error("BLOQUEADO: ZINTO_API_KEY no está configurada. No se ejecuta ninguna llamada.");
    process.exitCode = 2;
    return;
  }

  if (!isZintoWriteAllowlisted()) {
    console.error(
      "BLOQUEADO: ZINTO_WRITE_ALLOWLISTED no está en 'true'.\n" +
        "Esta prueba escribe datos reales en el CRM y solo debe correr después de que Zinto " +
        "confirme por escrito que bcousinoprop (o esta API key) está en la allowlist de " +
        "escrituras. Ver docs/AUTHENTICATION.md — 'WRITE_ENABLED_COMPANY_IDS' / " +
        "'WRITE_ENABLED_API_KEY_IDS'. No se ejecuta nada."
    );
    process.exitCode = 2;
    return;
  }

  const client = new ZintoIntegrationApiClient(config);

  // Paso 2: confirmar identidad y empresa antes de escribir nada.
  const me = await client.getMe();
  const companyName = me.data.company?.name ?? "";
  log(
    "OK",
    "GET /api/v1/me",
    `empresa=${companyName} (${me.data.company?.id}) · scopes=${(me.data.scopes ?? []).join(", ")}`
  );
  if (!companyName.toLowerCase().includes(PILOT_COMPANY_HINT) && me.data.company?.id !== "3") {
    console.error(
      `ABORTADO: la empresa devuelta ("${companyName}") no coincide con el piloto esperado. ` +
        "No se escribe nada para evitar tocar datos de otra empresa."
    );
    process.exitCode = 1;
    return;
  }

  const runTag = randomUUID().slice(0, 8);
  const testContactName = `SmartBC Piloto ${runTag}`;

  // Paso 3-4: crear contacto con idempotencia (número autorizado de España).
  const createContactKey = client.newIdempotencyKey("write-smoke-contact");
  let contactId: string;
  try {
    const created = await client.createContact(
      { name: testContactName, phone: AUTHORIZED_NUMBERS.es, tags: ["smartbc-pilot-smoke"] },
      createContactKey
    );
    contactId = created.data.id;
    log("OK", "POST /api/v1/contacts (crear)", `id=${contactId} name="${created.data.name}"`);
  } catch (err) {
    return abortOnWriteError("POST /api/v1/contacts", err);
  }

  // Paso 11: repetir la MISMA petición con la MISMA Idempotency-Key — debe
  // devolver la respuesta guardada (Idempotent-Replayed), nunca duplicar.
  try {
    const replay = await client.createContact(
      { name: testContactName, phone: AUTHORIZED_NUMBERS.es, tags: ["smartbc-pilot-smoke"] },
      createContactKey
    );
    log(
      replay.data.id === contactId ? "OK" : "FAILED",
      "Repetir POST /api/v1/contacts con la misma Idempotency-Key",
      replay.data.id === contactId
        ? "misma id devuelta, sin duplicar"
        : `id distinta (${replay.data.id}) — posible duplicado`
    );
  } catch (err) {
    log("FAILED", "Repetir POST /api/v1/contacts", err instanceof Error ? err.message : String(err));
  }

  // Paso 5: crear o localizar conversación para ese contacto.
  const channels = await client.listChannels();
  const waChannel = channels.data.find((c) => c.type.toLowerCase().includes("whatsapp")) ?? channels.data[0];
  if (!waChannel) {
    console.error("ABORTADO: no hay canales disponibles para crear la conversación.");
    process.exitCode = 1;
    return;
  }
  let conversationId: string;
  try {
    const conv = await client.createConversation(
      { contact_id: contactId, channel_id: waChannel.id },
      client.newIdempotencyKey("write-smoke-conversation")
    );
    conversationId = conv.data.id;
    log("OK", "POST /api/v1/conversations", `id=${conversationId} channel=${waChannel.name}`);
  } catch (err) {
    return abortOnWriteError("POST /api/v1/conversations", err);
  }

  // Paso 6: enviar texto por el número autorizado de España.
  try {
    const sent = await client.sendMessage(
      { channel_id: waChannel.id, to: AUTHORIZED_NUMBERS.es, message: `Prueba de aceptación SmartBC · ${runTag}` },
      client.newIdempotencyKey("write-smoke-message-es")
    );
    log("OK", "POST /api/v1/messages/send (España)", `delivery id=${sent.data.id} status=${sent.data.status}`);
  } catch (err) {
    logWriteError("POST /api/v1/messages/send (España)", err);
  }

  // Paso 8: nota, etiqueta, deal, tarea.
  try {
    const note = await client.createNote(
      contactId,
      { content: `Nota de prueba del piloto SmartBC (${runTag}).` },
      client.newIdempotencyKey("write-smoke-note")
    );
    log("OK", "POST /api/v1/contacts/{id}/notes", `id=${note.data.id}`);
  } catch (err) {
    logWriteError("POST /api/v1/contacts/{id}/notes", err);
  }

  try {
    await client.tagContact(contactId, "smartbc-pilot-smoke-tag");
    log("OK", "PUT /api/v1/contacts/{id}/tags/{tag}", "tag asociada");
  } catch (err) {
    logWriteError("PUT /api/v1/contacts/{id}/tags/{tag}", err);
  }

  let dealId: string | undefined;
  let pipelineId: string | undefined;
  let firstStageId: string | undefined;
  let secondStageId: string | undefined;
  try {
    const pipelines = await client.listPipelines({ limit: 1 });
    const pipeline = pipelines.data[0];
    if (!pipeline) {
      log("SKIP", "POST /api/v1/deals", "la empresa no tiene ningún pipeline configurado");
    } else {
      pipelineId = pipeline.id;
      const stages = await client.listPipelineStages(pipeline.id, { limit: 10 });
      const sorted = [...stages.data].sort((a, b) => a.order_num - b.order_num);
      firstStageId = sorted[0]?.id;
      secondStageId = sorted[1]?.id;
      if (!firstStageId) {
        log("SKIP", "POST /api/v1/deals", `pipeline "${pipeline.name}" no tiene etapas`);
      } else {
        const deal = await client.createDeal(
          {
            contact_id: contactId,
            pipeline_id: pipeline.id,
            stage_id: firstStageId,
            title: `Piloto SmartBC ${runTag}`,
          },
          client.newIdempotencyKey("write-smoke-deal")
        );
        dealId = deal.data.id;
        log("OK", "POST /api/v1/deals", `id=${dealId} pipeline="${pipeline.name}" stage=${firstStageId}`);
      }
    }
  } catch (err) {
    logWriteError("POST /api/v1/deals", err);
  }

  // Paso 9: mover el deal a una etapa real (nunca inventar un nombre de etapa).
  if (dealId && pipelineId && secondStageId) {
    try {
      const moved = await client.moveDeal(dealId, { pipeline_id: pipelineId, stage_id: secondStageId });
      log("OK", "POST /api/v1/deals/{id}/move", `stage_id=${moved.data.stage_id}`);
    } catch (err) {
      logWriteError("POST /api/v1/deals/{id}/move", err);
    }
  } else if (dealId) {
    log("SKIP", "POST /api/v1/deals/{id}/move", "el pipeline no tiene una segunda etapa para mover el deal");
  }

  try {
    const task = await client.createTask(
      { contact_id: contactId, title: `Seguimiento piloto SmartBC ${runTag}` },
      client.newIdempotencyKey("write-smoke-task")
    );
    log("OK", "POST /api/v1/tasks", `id=${task.data.id}`);
  } catch (err) {
    logWriteError("POST /api/v1/tasks", err);
  }

  // Paso 12: aislamiento entre empresas — pedir un id que casi seguro no existe
  // en esta empresa y confirmar 404 tenant-safe (nunca 200 con datos ajenos).
  try {
    await client.getContact("999999999");
    log("FAILED", "Aislamiento entre empresas", "un id inventado devolvió 200 — revisar manualmente");
  } catch (err) {
    if (err instanceof ZintoIntegrationApiError && err.status === 404) {
      log("OK", "Aislamiento entre empresas", `id inexistente/ajeno → 404 ${err.code}, tenant-safe`);
    } else {
      logWriteError("Aislamiento entre empresas (esperábamos 404)", err);
    }
  }

  console.log(
    "\nResumen: contacto, conversación, mensaje, nota, etiqueta, deal, tarea y repetición " +
      "idempotente probados contra datos reales de bcousinoprop, usando solo el número " +
      "autorizado de España. El número de Chile no se probó en esta corrida — repetir con " +
      "AUTHORIZED_NUMBERS.cl si hace falta cubrir el paso 6 completo de la checklist."
  );
}

function logWriteError(step: string, err: unknown) {
  if (err instanceof ZintoIntegrationApiError) {
    log(
      "FAILED",
      step,
      `${err.status} ${err.code}: ${err.message}${err.requestId ? ` (request_id=${err.requestId})` : ""}`
    );
  } else {
    log("FAILED", step, err instanceof Error ? err.message : String(err));
  }
}

function abortOnWriteError(step: string, err: unknown): void {
  logWriteError(step, err);
  console.error("\nABORTADO: sin contacto/conversación no tiene sentido seguir con el resto de la prueba.");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Error inesperado en la prueba de escritura:", err);
  process.exitCode = 1;
});
