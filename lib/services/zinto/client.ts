import { ZintoMessage, ZintoChannelsResponse } from './types';

const ZINTO_BASE_URL = process.env.ZINTO_BASE_URL || 'https://crm.zinto.app/api/v1';

async function zintoFetch(endpoint: string, options: RequestInit = {}) {
  const ZINTO_API_KEY = process.env.ZINTO_API_KEY;
  if (!ZINTO_API_KEY) {
    throw new Error('ZINTO_API_KEY environment variable is not set');
  }

  const url = `${ZINTO_BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${ZINTO_API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zinto API error (${response.status}): ${error}`);
  }

  return response.json();
}

export async function sendWhatsAppMessage(
  channelId: number,
  to: string,
  message: string
): Promise<ZintoMessage> {
  return zintoFetch('/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      channelId,
      to,
      message,
    }),
  });
}

export async function getZintoChannels(): Promise<ZintoChannelsResponse> {
  return zintoFetch('/channels', {
    method: 'GET',
  });
}

export async function validateChannelExists(channelId: number): Promise<boolean> {
  try {
    const response = await getZintoChannels();
    return response.data.some((channel) => channel.id === channelId);
  } catch {
    return false;
  }
}
