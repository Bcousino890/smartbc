import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateMessageStatusFromWebhook,
  saveMessage,
  updateConversationLastMessage,
  findConversationByPhone,
  getOrCreateConversation,
  recordWebhookDelivery,
  deleteWebhookDelivery,
} from "@/lib/db/zinto";
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";
import type { ZintoV2WebhookPayload } from "@/lib/services/zinto-v2/types";

/**
 * Receptor de webhooks de la API v2 de Zinto — EN PARALELO al de v1
 * (app/api/webhooks/zinto/route.ts), que sigue siendo el que recibe tráfico
 * real. Este solo se activa cuando `enabled_v2` está en true (ver
 * lib/services/zinto-v2/config.ts); mientras tanto responde 404 para que
 * apuntar esta URL en el panel de Zinto antes de tiempo no quede como un
 * "éxito" silencioso.
 *
 * A propósito reutiliza las MISMAS tablas que v1 (`zinto_conversations` /
 * `zinto_messages`): así /admin/mensajes no necesita ningún cambio cuando
 * se corte v1 → v2, y el `external_message_id` que generamos al enviar
 * (lib/services/zinto-v2/client.ts) se guarda en la misma columna
 * `zinto_message_id` que ya usa `updateMessageStatusFromWebhook`.
 *
 * ⚠️ El OpenAPI de v2 no publica el schema del body de los webhooks (solo la
 * guía en prosa). El parser de abajo prueba varias claves plausibles
 * (`external_message_id` vs `externalMessageId`, anidado en `message` o no)
 * — hay que confirmar el formato real contra el sandbox en cuanto exista el
 * Integration ID, y ajustar `extractInbound`/`extractExternalMessageId` si
 * no calzan.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const STATUS_VALUES = ["sent", "delivered", "read", "failed"];

function hmacEquals(secret: string, input: string, signatureHex: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(input).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHex || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Bases candidatas para la firma, misma lógica de resiliencia que ya usa
 * app/api/webhooks/zinto/route.ts (v1) — "so a config change never
 * silently drops events": el 2026-09-15 confirmamos con Zinto que TODOS
 * los eventos v2 (received/sent/delivered/read por igual) llegaban con
 * firma inválida pese a que la doc dice `timestamp + "." + raw_body`, así
 * que ya no asumimos que esa única base es correcta.
 */
function candidateInputs(
  timestamp: string,
  rawBody: string,
  payload: unknown,
): Array<{ label: string; input: string }> {
  const candidates: Array<{ label: string; input: string }> = [];
  if (timestamp) candidates.push({ label: "timestamp.body", input: `${timestamp}.${rawBody}` });
  candidates.push({ label: "body", input: rawBody });
  try {
    candidates.push({ label: "JSON.stringify(payload)", input: JSON.stringify(payload) });
  } catch {
    // payload no serializable (no debería pasar, ya vino de JSON.parse)
  }
  return candidates;
}

function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  payload: unknown,
  signatureHeader: string,
): boolean {
  if (!secret) return !IS_PRODUCTION; // fail-closed en producción
  const sig = (signatureHeader || "").replace(/^sha256=/i, "").trim();
  if (!sig) return false;
  return candidateInputs(timestamp, rawBody, payload).some((c) => hmacEquals(secret, c.input, sig));
}

type ReplayResult = "ok" | "stale" | "duplicate";

/** Dedup por X-Zinto-Event-Id (v2) — misma tabla/mecanismo que v1 (X-Zinto-Delivery-Id). */
async function guardReplay(eventId: string, timestamp: string, secret: string): Promise<ReplayResult> {
  if (secret && timestamp) {
    const ts = Date.parse(timestamp);
    if (Number.isFinite(ts) && Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
      return "stale";
    }
  }
  if (eventId) {
    const isNew = await recordWebhookDelivery(eventId);
    if (!isNew) return "duplicate";
  }
  return "ok";
}

function extractExternalMessageId(payload: ZintoV2WebhookPayload): string {
  return (
    payload.external_message_id ||
    payload.externalMessageId ||
    payload.message?.external_message_id ||
    payload.message?.externalMessageId ||
    payload.message?.id ||
    ""
  );
}

function extractInbound(payload: ZintoV2WebhookPayload): { sender: string; text: string; name?: string } {
  const sender = payload.contact?.phone || payload.sender || payload.from || payload.recipient || "";
  const text = payload.text || payload.content || payload.message?.text || payload.message?.content || "";
  return { sender, text, name: payload.contact?.name };
}

export async function POST(req: NextRequest) {
  let eventId = "";
  try {
    const config = await getZintoV2Config();
    if (!config?.enabled) {
      console.log("[zinto-v2-webhook] rechazado: enabled_v2=false");
      return NextResponse.json({ error: "Zinto v2 no está habilitado" }, { status: 404 });
    }

    const rawBody = await req.text();
    let payload: ZintoV2WebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.log(`[zinto-v2-webhook] JSON inválido (${rawBody.length} bytes)`);
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const webhookSecret = config.webhookSecret || "";
    const eventName = (req.headers.get("x-zinto-event") || payload.event || "").toLowerCase();
    const timestamp = req.headers.get("x-zinto-timestamp") || "";
    eventId = req.headers.get("x-zinto-event-id") || "";
    const signature = req.headers.get("x-zinto-signature") || "";
    // Nunca se loggea el secreto ni la firma en sí — solo si los headers
    // que la firma necesita llegaron siquiera. Es la única forma de saber,
    // sin acceso a Zinto, si "no llega nada" es en realidad "llega pero con
    // otra forma de cabeceras" (p.ej. sin X-Zinto-Timestamp).
    console.log(
      `[zinto-v2-webhook] intento: event=${eventName || "(vacío)"} tieneTimestamp=${!!timestamp} tieneEventId=${!!eventId} tieneFirma=${!!signature}`,
    );

    if (!verifySignature(webhookSecret, timestamp, rawBody, payload, signature)) {
      // Diagnóstico seguro: la firma recibida y lo que NOSOTROS calculamos
      // para cada base candidata son salidas de un hash, no el secreto en
      // sí (que nunca se loggea) — compararlas a mano es la única forma de
      // saber, sin acceso al panel de Zinto, si el problema es la base que
      // se firma, el secreto guardado, o el formato de la cabecera.
      const sig = (signature || "").replace(/^sha256=/i, "").trim();
      const attempts = webhookSecret
        ? candidateInputs(timestamp, rawBody, payload).map((c) => ({
            base: c.label,
            computed: crypto.createHmac("sha256", webhookSecret).update(c.input).digest("hex"),
          }))
        : "(sin webhookSecret configurado)";
      console.log(
        `[zinto-v2-webhook] ✗ firma inválida (event=${eventName || "(vacío)"}). recibida=${sig || "(vacía)"} intentos=${JSON.stringify(attempts)}`,
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const replay = await guardReplay(eventId, timestamp, webhookSecret);
    if (replay === "stale") return NextResponse.json({ error: "Stale event" }, { status: 401 });
    if (replay === "duplicate") return NextResponse.json({ status: "duplicate_ignored" }, { status: 200 });

    // ---- Mensaje entrante (cliente → CRM) ----
    if (eventName === "message.received") {
      const inbound = extractInbound(payload);
      if (!inbound.sender || !inbound.text) {
        // El OpenAPI de v2 nunca publicó el schema real de este body (ver
        // comentario de cabecera) — sin esto, un cambio de forma en el
        // payload real de Zinto queda invisible: pasa la firma, entra
        // aquí, y desaparece sin dejar rastro salvo este log. Truncado por
        // las dudas (tamaño de log), no por privacidad — ya vive igual en
        // zinto_messages en cuanto se guarda bien.
        console.log(
          `[zinto-v2-webhook] ✗ message.received sin sender/text extraíble. Claves del payload: ${Object.keys(payload).join(", ")}. Body: ${rawBody.slice(0, 500)}`,
        );
        return NextResponse.json({ error: "Missing sender or text" }, { status: 400 });
      }
      const fromPhone = inbound.sender.replace(/[^\d]/g, "");
      const incomingChannelId =
        payload.channel?.id != null ? Number(payload.channel.id) : (payload.channelId ?? payload.channel_id ?? 4);
      const channelId = Number.isFinite(Number(incomingChannelId)) ? Number(incomingChannelId) : 4;
      // Mismo split ES/#4 vs CL/#50 que v1 (app/api/webhooks/zinto/route.ts).
      const country: "es" | "cl" = channelId === 50 ? "cl" : "es";

      let conversation = await findConversationByPhone(fromPhone, country);
      if (!conversation) {
        conversation = await getOrCreateConversation(
          fromPhone,
          fromPhone,
          channelId,
          { contactName: inbound.name || null },
          country,
        );
      }

      await saveMessage(conversation.id, fromPhone, conversation.phone_number, inbound.text, "received", "delivered", conversation.channel_id);
      await updateConversationLastMessage(conversation.id, inbound.text, true);

      console.log(`[zinto-v2-webhook] ✓ message.received guardado (conversación ${conversation.id})`);
      return NextResponse.json({ status: "received" }, { status: 200 });
    }

    // ---- Estado de entrega (mensaje saliente) ----
    if (eventName.startsWith("message.")) {
      const externalMessageId = extractExternalMessageId(payload);
      const status = payload.message?.status || payload.status || "";
      if (externalMessageId && STATUS_VALUES.includes(status)) {
        await updateMessageStatusFromWebhook(externalMessageId, status as "sent" | "delivered" | "read" | "failed");
        console.log(`[zinto-v2-webhook] ✓ ${eventName} → ${status} (${externalMessageId})`);
      } else {
        console.log(
          `[zinto-v2-webhook] ✗ ${eventName} sin externalMessageId/status reconocible. Claves del payload: ${Object.keys(payload).join(", ")}`,
        );
      }
      return NextResponse.json({ status: "received" }, { status: 200 });
    }

    console.log(`[zinto-v2-webhook] evento ignorado (fuera de alcance): ${eventName || "(vacío)"}`);

    // Evento reconocido por el contrato pero fuera del alcance de esta
    // integración (contacts.*, deals.*, etc. — ver docs/ZINTO_SETUP.md).
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  } catch (error) {
    console.error("Zinto v2 webhook processing error:", error);
    await deleteWebhookDelivery(eventId);
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}
