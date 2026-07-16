import { ZintoMessage, ZintoChannelsResponse, ZintoChannel, ZintoMessageStatus } from './types';
import { getZintoConfig } from './config';

/** Max message length per Zinto spec (MESSAGE_TOO_LONG). */
export const ZINTO_MAX_MESSAGE_LENGTH = 4096;

/**
 * Normalize a phone number to Zinto's required format: international prefix,
 * digits only — no leading "+", no spaces, no dashes or special characters.
 * Per Zinto docs: examples "1234567890", "447123456789".
 */
export function normalizePhoneNumber(raw: string): string {
  return (raw || '').replace(/[^\d]/g, '');
}

/** Basic sanity check for an international number (7–15 digits, E.164 range). */
export function isValidPhoneNumber(raw: string): boolean {
  const digits = normalizePhoneNumber(raw);
  return digits.length >= 7 && digits.length <= 15;
}

export class ZintoApiError extends Error {
  status: number;
  code?: string;
  details?: string;
  retryAfter?: number;

  constructor(status: number, message: string, code?: string, details?: string, retryAfter?: number) {
    super(message);
    this.name = 'ZintoApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

interface ZintoFetchOptions extends RequestInit {
  /** Sent as the `Idempotency-Key` header for safe retries of writes. */
  idempotencyKey?: string;
}

/**
 * Low-level Zinto API call. Adds Bearer auth, optional Idempotency-Key, and
 * parses the documented error envelope: { error: { code, message, details, request_id } }.
 */
export async function zintoFetch(endpoint: string, options: ZintoFetchOptions = {}) {
  const config = await getZintoConfig();
  if (!config?.apiKey) {
    throw new ZintoApiError(400, 'Zinto is not configured', 'NOT_CONFIGURED');
  }

  const { idempotencyKey, ...init } = options;
  const url = `${config.baseUrl}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...(init.headers as Record<string, string>),
  };

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    // Parse Zinto's documented error envelope. `details` may be a string
    // (legacy) or an array of { field, issue } objects (current spec).
    let code: string | undefined;
    let message = `Zinto API error (${response.status})`;
    let details: string | undefined;
    try {
      const body = await response.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message || message;
        details =
          typeof body.error.details === 'string'
            ? body.error.details
            : body.error.details
              ? JSON.stringify(body.error.details)
              : undefined;
      }
    } catch {
      // non-JSON body; keep generic message
    }

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    throw new ZintoApiError(response.status, message, code, details, retryAfter);
  }

  // 204 No Content etc.
  if (response.status === 204) return null;
  return response.json();
}

/** Optional context stored alongside a message so inbound replies map back. */
export interface SendMessageMetadata {
  crm_contact_id?: string;
  crm_lead_id?: string;
  source?: string;
}

/**
 * Normalize the /messages/send response. The live API may return either a
 * wrapped envelope { success, data:{ messageId, status, ... } } or a flat
 * { status:"accepted", message_id, channel_id, to, queued_at }. Callers rely
 * on the { success, data } shape.
 */
function normalizeSendResponse(raw: any, channelId: number, to: string): ZintoMessage {
  const data = raw?.data ?? raw ?? {};
  const rawStatus: string = data.status ?? raw?.status ?? 'sent';
  // "accepted"/"queued" mean the message was taken but not yet delivered.
  const status: ZintoMessageStatus =
    rawStatus === 'accepted' || rawStatus === 'queued' ? 'sent' : (rawStatus as ZintoMessageStatus);
  return {
    success: raw?.success !== false,
    data: {
      messageId: data.messageId ?? data.message_id ?? raw?.message_id ?? raw?.messageId ?? '',
      status,
      channelId: data.channelId ?? data.channel_id ?? channelId,
      to: data.to ?? to,
      sentAt: data.sentAt ?? data.queued_at ?? raw?.queued_at ?? new Date().toISOString(),
    },
  };
}

export async function sendWhatsAppMessage(
  channelId: number,
  to: string,
  message: string,
  opts?: { idempotencyKey?: string; metadata?: SendMessageMetadata }
): Promise<ZintoMessage> {
  const normalizedTo = normalizePhoneNumber(to);

  if (!isValidPhoneNumber(normalizedTo)) {
    throw new ZintoApiError(400, 'The phone number format is invalid', 'INVALID_PHONE_NUMBER');
  }

  if (!message || message.length === 0) {
    throw new ZintoApiError(400, 'Message cannot be empty', 'INVALID_REQUEST');
  }

  if (message.length > ZINTO_MAX_MESSAGE_LENGTH) {
    throw new ZintoApiError(
      400,
      `Message exceeds ${ZINTO_MAX_MESSAGE_LENGTH} characters`,
      'MESSAGE_TOO_LONG'
    );
  }

  const raw = await zintoFetch('/messages/send', {
    method: 'POST',
    idempotencyKey: opts?.idempotencyKey,
    body: JSON.stringify({
      // Documented contract; the phone number is sent WITHOUT a leading "+".
      channel_id: channelId,
      to: normalizedTo,
      message: { type: 'text', text: message },
      ...(opts?.metadata ? { metadata: opts.metadata } : {}),
    }),
  });

  return normalizeSendResponse(raw, channelId, normalizedTo);
}

export async function getZintoChannels(): Promise<ZintoChannelsResponse> {
  return zintoFetch('/channels', { method: 'GET' });
}

/** Return the channel if it exists AND is active, otherwise null. */
export async function getActiveChannel(channelId: number): Promise<ZintoChannel | null> {
  try {
    const response = await getZintoChannels();
    const channel = (response.data || []).find((c) => Number(c.id) === Number(channelId));
    // Treat missing/unknown status as active — the real API may omit it.
    if (channel && channel.status !== 'inactive') {
      return channel;
    }
    return null;
  } catch {
    return null;
  }
}
