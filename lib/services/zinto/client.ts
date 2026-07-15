import { ZintoMessage, ZintoChannelsResponse, ZintoChannel } from './types';

const ZINTO_BASE_URL = process.env.ZINTO_BASE_URL || 'https://crm.zinto.app/api/v1';

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

async function zintoFetch(endpoint: string, options: RequestInit = {}) {
  const ZINTO_API_KEY = process.env.ZINTO_API_KEY;
  if (!ZINTO_API_KEY) {
    throw new Error('ZINTO_API_KEY environment variable is not set');
  }

  const url = `${ZINTO_BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${ZINTO_API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    // Parse Zinto's documented error envelope:
    // { success: false, error: { code, message, details } }
    let code: string | undefined;
    let message = `Zinto API error (${response.status})`;
    let details: string | undefined;
    try {
      const body = await response.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message || message;
        details = body.error.details;
      }
    } catch {
      // non-JSON body; keep generic message
    }

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    throw new ZintoApiError(response.status, message, code, details, retryAfter);
  }

  return response.json();
}

export async function sendWhatsAppMessage(
  channelId: number,
  to: string,
  message: string
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

  return zintoFetch('/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      channelId,
      to: normalizedTo,
      message,
    }),
  });
}

export async function getZintoChannels(): Promise<ZintoChannelsResponse> {
  return zintoFetch('/channels', { method: 'GET' });
}

/** Return the channel if it exists AND is active, otherwise null. */
export async function getActiveChannel(channelId: number): Promise<ZintoChannel | null> {
  try {
    const response = await getZintoChannels();
    const channel = response.data.find((c) => c.id === channelId);
    if (channel && channel.status === 'active') {
      return channel;
    }
    return null;
  } catch {
    return null;
  }
}
