/**
 * Google Calendar integration helper.
 *
 * Setup Google Calendar:
 * 1. Ve a console.cloud.google.com
 * 2. Crea proyecto "SmartBC CRM"
 * 3. Habilita "Google Calendar API"
 * 4. Ve a Credenciales → OAuth 2.0 → Crear credenciales
 * 5. Tipo: Aplicación Web
 * 6. URI de redirección: https://portal.bcousinoprop.com/api/integrations/google/callback
 * 7. Copia Client ID y Client Secret
 * 8. Agrega en .env del VPS:
 *    GOOGLE_CLIENT_ID=xxx
 *    GOOGLE_CLIENT_SECRET=xxx
 *    GOOGLE_REDIRECT_URI=https://portal.bcousinoprop.com/api/integrations/google/callback
 */

import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

export type GoogleTokens = {
  access_token: string | null | undefined;
  refresh_token: string;
  token_expiry: string | null | undefined;
  calendar_id?: string | null;
};

export type CalendarEventData = {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  location?: string;
};

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

/** Genera URL de autenticación de Google OAuth con state=userId */
export function getGoogleAuthUrl(userId: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: userId,
  });
}

/** Intercambia el código de autorización por tokens de acceso */
export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/** Refresca el access token usando el refresh token */
export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

/** Devuelve un OAuth2Client autenticado, refrescando el token si está próximo a expirar */
async function getAuthenticatedClient(tokens: GoogleTokens) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.token_expiry
      ? new Date(tokens.token_expiry).getTime()
      : undefined,
  });

  // Refresca automáticamente si expira en menos de 5 minutos
  const expiryDate = tokens.token_expiry
    ? new Date(tokens.token_expiry).getTime()
    : 0;
  const now = Date.now();
  if (!expiryDate || expiryDate - now < 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    oauth2Client.setCredentials(refreshed);
  }

  return oauth2Client;
}

/** Crea un evento en Google Calendar */
export async function createCalendarEvent(
  tokens: GoogleTokens,
  eventData: CalendarEventData,
) {
  const auth = await getAuthenticatedClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = tokens.calendar_id ?? "primary";

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: eventData.title,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.start.toISOString(),
        timeZone: "Europe/Madrid",
      },
      end: {
        dateTime: eventData.end.toISOString(),
        timeZone: "Europe/Madrid",
      },
      attendees: eventData.attendees?.map((email) => ({ email })),
    },
  });

  return event.data;
}

/** Actualiza un evento existente en Google Calendar */
export async function updateCalendarEvent(
  tokens: GoogleTokens,
  eventId: string,
  eventData: Partial<CalendarEventData>,
) {
  const auth = await getAuthenticatedClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = tokens.calendar_id ?? "primary";

  const requestBody: Record<string, unknown> = {};
  if (eventData.title !== undefined) requestBody.summary = eventData.title;
  if (eventData.description !== undefined)
    requestBody.description = eventData.description;
  if (eventData.location !== undefined)
    requestBody.location = eventData.location;
  if (eventData.start !== undefined)
    requestBody.start = {
      dateTime: eventData.start.toISOString(),
      timeZone: "Europe/Madrid",
    };
  if (eventData.end !== undefined)
    requestBody.end = {
      dateTime: eventData.end.toISOString(),
      timeZone: "Europe/Madrid",
    };
  if (eventData.attendees !== undefined)
    requestBody.attendees = eventData.attendees.map((email) => ({ email }));

  const event = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody,
  });

  return event.data;
}

/** Elimina un evento de Google Calendar */
export async function deleteCalendarEvent(
  tokens: GoogleTokens,
  eventId: string,
) {
  const auth = await getAuthenticatedClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = tokens.calendar_id ?? "primary";

  await calendar.events.delete({ calendarId, eventId });
}

/** Lista eventos del calendario en un rango de tiempo */
export async function getCalendarEvents(
  tokens: GoogleTokens,
  timeMin: Date,
  timeMax: Date,
) {
  const auth = await getAuthenticatedClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = tokens.calendar_id ?? "primary";

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return response.data.items ?? [];
}
